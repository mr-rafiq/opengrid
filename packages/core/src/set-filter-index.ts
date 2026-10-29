import type { Column, GridModel } from "./types.js";
import { comparableFilterValue, isFilterBlank } from "./filter-predicates.js";

export type SetFilterScalar = string | number | boolean | bigint | null;
export interface SetFilterEntry {
  readonly key: string;
  readonly value: SetFilterScalar;
  readonly label: string;
  readonly count: number;
  /** Includes values that core typed comparison normalizes to null, not just raw blanks. */
  readonly blank: boolean;
  readonly invalidCount: number;
}
export interface SetFilterLimits {
  readonly maxRows?: number;
  readonly maxValues?: number;
  readonly maxValueLength?: number;
  readonly maxLabelLength?: number;
  readonly maxTextLength?: number;
}
export type SetFilterIndexErrorCode =
  "COLUMN" | "LIMIT" | "UNSUPPORTED" | "FORMAT" | "KEY" | "STALE";
export class SetFilterIndexError extends Error {
  constructor(
    readonly code: SetFilterIndexErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SetFilterIndexError";
  }
}
export interface SetFilterIndex {
  readonly entries: readonly SetFilterEntry[];
  readonly rowCount: number;
  readonly columnId: string;
  /** Normalize even an absent operand; membership in entries is deliberately not required. */
  keyOf(operand: unknown): string;
  /** Validate all keys, deduplicate in request order, and return frozen canonical primitives. */
  values(keys: readonly string[]): readonly SetFilterScalar[];
}
const CAPS = {
  maxRows: 100_000,
  maxValues: 10_000,
  maxValueLength: 4096,
  maxLabelLength: 4096,
  maxTextLength: 2_000_000,
} as const;
type Budgets = { -readonly [K in keyof typeof CAPS]: number };
function budgets(input: SetFilterLimits): Budgets {
  const result = {} as Budgets;
  for (const name of Object.keys(CAPS) as (keyof typeof CAPS)[]) {
    const value = input[name] ?? CAPS[name];
    if (!Number.isSafeInteger(value) || value < 1 || value > CAPS[name])
      throw new SetFilterIndexError(
        "LIMIT",
        name + " must be an integer from 1 through " + CAPS[name],
      );
    result[name] = value;
  }
  return result;
}
function rawSupported(
  value: unknown,
  type: Column<unknown>["type"],
  limit: number,
): void {
  if (value instanceof Date && type === "date") return;
  if (value === null || value === undefined) return;
  if (!["string", "number", "boolean", "bigint"].includes(typeof value))
    throw new SetFilterIndexError(
      "UNSUPPORTED",
      "Set list values must be scalar; Dates require a date column",
    );
  if (typeof value === "string" && value.length > limit)
    throw new SetFilterIndexError("LIMIT", "Set value exceeds the text limit");
}
function identity(
  raw: unknown,
  type: Column<unknown>["type"],
  limit: number,
): { key: string; value: SetFilterScalar; invalid: boolean } {
  rawSupported(raw, type, limit);
  const normalized = comparableFilterValue(raw, type);
  let key: string, value: SetFilterScalar;
  if (normalized === null) {
    key = "null";
    value = null;
  } else if (typeof normalized === "number") {
    key = "n:" + (Object.is(normalized, -0) ? "-0" : String(normalized));
    value = type === "date" ? new Date(normalized).toISOString() : normalized;
  } else if (typeof normalized === "bigint") {
    key = "i:" + normalized.toString();
    value = normalized;
  } else if (typeof normalized === "boolean") {
    key = normalized ? "b:1" : "b:0";
    value = normalized;
  } else if (typeof normalized === "string") {
    key = "s:" + normalized;
    value = normalized;
  } else
    throw new SetFilterIndexError(
      "UNSUPPORTED",
      "Set comparison did not produce a scalar value",
    );
  if (
    (normalized !== null && key.length > limit + 2) ||
    (typeof value === "string" && value.length > limit)
  )
    throw new SetFilterIndexError(
      "LIMIT",
      "Canonical set value exceeds the text limit",
    );
  return { key, value, invalid: normalized === null && !isFilterBlank(raw) };
}
function ownArrayValue<T>(
  items: readonly T[],
  index: number,
  code: SetFilterIndexErrorCode,
): T {
  const descriptor = Object.getOwnPropertyDescriptor(items, String(index));
  if (!descriptor || !("value" in descriptor))
    throw new SetFilterIndexError(
      code,
      "Set lists cannot contain holes or accessor entries",
    );
  return descriptor.value as T;
}

/**
 * Entire resident source data, not derived/filter/page/group rows. No subscriptions or
 * global caches are installed. Rebuild after source changes or explicit getter expiry.
 */
export function createSetFilterIndex<T>(
  model: GridModel<T>,
  columnId: string,
  limits: SetFilterLimits = {},
): SetFilterIndex {
  const caps = budgets(limits),
    before = model.getState();
  if (typeof columnId !== "string" || !columnId)
    throw new SetFilterIndexError("COLUMN", "Set filter requires a column ID");
  const column = model.getColumns().find((item) => item.id === columnId);
  if (!column || column.filterable === false)
    throw new SetFilterIndexError(
      "COLUMN",
      "Set filter column is missing or disabled",
    );
  const type = column.type,
    rows = model.getRows();
  if (!Array.isArray(rows) || rows.length > caps.maxRows)
    throw new SetFilterIndexError(
      "LIMIT",
      "Resident row count exceeds the set index limit",
    );
  const byKey = new Map<
    string,
    {
      key: string;
      value: SetFilterScalar;
      label: string;
      count: number;
      blank: boolean;
      invalidCount: number;
    }
  >();
  let textLength = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = ownArrayValue(rows, index, "UNSUPPORTED"),
      raw = model.getValue(row, columnId),
      canonical = identity(raw, type, caps.maxValueLength);
    const existing = byKey.get(canonical.key);
    if (existing) {
      existing.count++;
      existing.invalidCount += Number(canonical.invalid);
      continue;
    }
    if (byKey.size >= caps.maxValues)
      throw new SetFilterIndexError(
        "LIMIT",
        "Distinct value count exceeds the set index limit",
      );
    const label = column.valueFormatter
      ? column.valueFormatter(raw, row)
      : raw === null || raw === undefined
        ? ""
        : raw instanceof Date
          ? Number.isFinite(raw.getTime())
            ? raw.toISOString()
            : "Invalid Date"
          : String(raw);
    if (typeof label !== "string")
      throw new SetFilterIndexError(
        "FORMAT",
        "Set value formatter must return text",
      );
    if (label.length > caps.maxLabelLength)
      throw new SetFilterIndexError(
        "LIMIT",
        "Set label exceeds the text limit",
      );
    textLength +=
      canonical.key.length +
      label.length +
      (typeof canonical.value === "string" ? canonical.value.length : 0);
    if (textLength > caps.maxTextLength)
      throw new SetFilterIndexError(
        "LIMIT",
        "Set index exceeds its aggregate text budget",
      );
    byKey.set(canonical.key, {
      key: canonical.key,
      value: canonical.value,
      label,
      count: 1,
      blank: canonical.value === null,
      invalidCount: Number(canonical.invalid),
    });
  }
  if (before !== model.getState())
    throw new SetFilterIndexError(
      "STALE",
      "Grid state changed while building the set value index",
    );
  const entries = Object.freeze(
    [...byKey.values()].map((entry) => Object.freeze(entry)),
  );
  const valuesByKey = new Map(entries.map((entry) => [entry.key, entry.value]));
  return Object.freeze({
    entries,
    rowCount: rows.length,
    columnId,
    keyOf(operand: unknown) {
      return identity(operand, type, caps.maxValueLength).key;
    },
    values(keys: readonly string[]) {
      if (!Array.isArray(keys) || keys.length > caps.maxValues)
        throw new SetFilterIndexError(
          "KEY",
          "Selected set keys exceed the value limit",
        );
      const selected = new Set<string>();
      for (let index = 0; index < keys.length; index++) {
        const key = ownArrayValue(keys, index, "KEY");
        if (typeof key !== "string" || !valuesByKey.has(key))
          throw new SetFilterIndexError("KEY", "Unknown set value key");
        selected.add(key);
      }
      return Object.freeze([...selected].map((key) => valuesByKey.get(key)!));
    },
  });
}
