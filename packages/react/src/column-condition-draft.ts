import {
  prepareColumnFilter,
  prepareCompoundFilter,
  type Column,
  type Filter,
  type ScalarFilter,
} from "@opengrid/core";
import { parseBound, RangeFilterMessageError } from "./filter-value-parsing.js";
import { gridMessage, type GridMessage } from "./locale.js";

export type ConditionColumnType = Column<unknown>["type"];
export type ConditionLogic = "and" | "or";
export interface ColumnConditionDraft {
  op: ScalarFilter["op"];
  value: string;
  upper: string;
}
export interface ColumnConditionDraftSource {
  logic: ConditionLogic;
  conditions: ColumnConditionDraft[];
  sourceFingerprint: string;
}
export class ConditionFilterDraftError extends Error {
  constructor(readonly notice: GridMessage) {
    super();
  }
}
const fail = (
  key: "unsupported" | "invalid" | "limit" | "membership" | "required",
): never => {
  throw new ConditionFilterDraftError(gridMessage(`conditionFilter.${key}`));
};
export const CONDITION_FILTER_LIMITS = Object.freeze({
  maxConditions: 16,
  maxMembershipValues: 10000,
  maxTextLength: 256000,
});
const textOps = Object.freeze<ScalarFilter["op"][]>([
  "contains",
  "notContains",
  "equals",
  "notEqual",
  "startsWith",
  "endsWith",
  "in",
  "blank",
  "notBlank",
]);
const orderedOps = Object.freeze<ScalarFilter["op"][]>([
  "equals",
  "notEqual",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "in",
  "blank",
  "notBlank",
]);
const booleanOps = Object.freeze<ScalarFilter["op"][]>([
  "equals",
  "notEqual",
  "in",
  "blank",
  "notBlank",
]);
export function getConditionOperators(
  type: ConditionColumnType,
): readonly ScalarFilter["op"][] {
  return type === "boolean"
    ? booleanOps
    : type === "number" || type === "bigint" || type === "date"
      ? orderedOps
      : textOps;
}
export function normalizeConditionLimit(limit = 4): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16)
    return fail("limit");
  return limit;
}
export function createConditionDraft(
  type: ConditionColumnType,
): ColumnConditionDraft {
  return {
    op: getConditionOperators(type)[0],
    value: type === "boolean" ? "true" : "",
    upper: "",
  };
}

/** Bounded, descriptor-only structural identity. No accessors/toJSON/valueOf are evaluated. */
export function columnFilterFingerprint(source: unknown): string {
  const active = new WeakSet<object>();
  // Operand conversion has the exact 256k cap. Fingerprints also include structural
  // keys/array indices, so reserve bounded overhead without shrinking that allowance.
  const budget = {
    nodes: 40064,
    text: CONDITION_FILTER_LIMITS.maxTextLength * 2,
  };
  function visit(value: unknown, depth: number): string {
    if (--budget.nodes < 0 || depth > 8) return fail("limit");
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") {
      budget.text -= value.length;
      if (budget.text < 0) return fail("limit");
      return `s${JSON.stringify(value)}`;
    }
    if (typeof value === "number")
      return `n${Object.is(value, -0) ? "-0" : String(value)}`;
    if (typeof value === "bigint") {
      const result = value.toString();
      budget.text -= result.length;
      if (budget.text < 0) return fail("limit");
      return `i${result}`;
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value !== "object") return fail("unsupported");
    if (active.has(value)) return fail("unsupported");
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Date.prototype)
      return `date:${Date.prototype.getTime.call(value)}`;
    const array = Array.isArray(value);
    if (!array && prototype !== null && prototype !== Object.prototype)
      return fail("unsupported");
    const keys = Reflect.ownKeys(value);
    if (
      keys.length > budget.nodes ||
      keys.some((key) => typeof key !== "string")
    )
      return fail("limit");
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, "length");
      if (!length || !("value" in length) || length.value > 10000)
        return fail("limit");
    }
    active.add(value);
    const output = (keys as string[])
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) return fail("unsupported");
        return `${visit(key, depth + 1)}:${visit(descriptor.value, depth + 1)}`;
      })
      .join(",");
    active.delete(value);
    return `${array ? "array" : "record"}{${output}}`;
  }
  try {
    return visit(source, 0);
  } catch (error) {
    if (error instanceof ConditionFilterDraftError) throw error;
    return fail("unsupported");
  }
}
function record(
  source: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!source || typeof source !== "object" || Array.isArray(source))
    return fail("unsupported");
  const proto = Object.getPrototypeOf(source);
  if (proto !== null && proto !== Object.prototype) return fail("unsupported");
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== "string" || !allowed.includes(key))
      return fail("unsupported");
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || !("value" in descriptor)) return fail("unsupported");
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
    });
  }
  return result;
}
function denseArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return fail("membership");
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length || !("value" in length) || length.value > 10000)
    return fail("limit");
  const output: unknown[] = [];
  if (Reflect.ownKeys(value).length !== length.value + 1)
    return fail("unsupported");
  for (let index = 0; index < length.value; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return fail("unsupported");
    output.push(descriptor.value);
  }
  return output;
}
const scalarText = (value: unknown): string => {
  if (
    typeof value === "string" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  )
    return String(value);
  if (typeof value === "number" && Number.isFinite(value))
    return Object.is(value, -0) ? "-0" : String(value);
  return fail("unsupported");
};
function sourceText(value: unknown, type: ConditionColumnType): string {
  if (
    type === "date" &&
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Date.prototype
  ) {
    if (!Number.isFinite(Date.prototype.getTime.call(value)))
      return fail("unsupported");
    return Date.prototype.toISOString.call(value);
  }
  return scalarText(value);
}
function membershipText(value: unknown, type: ConditionColumnType): string {
  return `[${denseArray(value)
    .map((item) => {
      if (item === null) return "null";
      if (typeof item === "bigint" || typeof item === "string")
        return JSON.stringify(String(item));
      if (type === "date" && item !== null && typeof item === "object")
        return JSON.stringify(sourceText(item, type));
      if (typeof item === "boolean") return String(item);
      if (typeof item === "number" && Number.isFinite(item))
        return Object.is(item, -0) ? "-0" : String(item);
      return fail("unsupported");
    })
    .join(",")}]`;
}

/** Reads only representable source filters. Unsupported sources must be explicitly replaced. */
export function readColumnConditionDraft(
  source: unknown,
  type: ConditionColumnType,
  maxConditions = 4,
): ColumnConditionDraftSource {
  const limit = normalizeConditionLimit(maxConditions);
  const sourceFingerprint = columnFilterFingerprint(source);
  if (source === undefined)
    return {
      logic: "and",
      conditions: [createConditionDraft(type)],
      sourceFingerprint,
    };
  const outer = record(source, ["op", "value", "to", "conditions"]);
  let logic: ConditionLogic = "and",
    scalars: unknown[] = [source],
    compound = false;
  if (outer.op === "and" || outer.op === "or") {
    if (Object.hasOwn(outer, "value") || Object.hasOwn(outer, "to"))
      return fail("unsupported");
    logic = outer.op;
    compound = true;
    // Unlike legacy scalars, new compound children have a strict primitive-only shape.
    scalars = denseArray(prepareCompoundFilter(source).conditions);
  }
  if (scalars.length < 1 || scalars.length > limit) return fail("limit");
  const conditions = scalars.map((value) => {
    const item = record(value, ["op", "value", "to"]);
    const op = item.op as ScalarFilter["op"];
    if (!getConditionOperators(type).includes(op)) return fail("unsupported");
    if (op === "blank" || op === "notBlank") {
      if (
        (Object.hasOwn(item, "value") &&
          (compound || item.value !== undefined)) ||
        (Object.hasOwn(item, "to") && (compound || item.to !== undefined))
      )
        return fail("unsupported");
      return { op, value: "", upper: "" };
    }
    if (op !== "between" && Object.hasOwn(item, "to"))
      return fail("unsupported");
    return {
      op,
      value:
        op === "in"
          ? membershipText(item.value, type)
          : sourceText(item.value, type),
      upper: op === "between" ? sourceText(item.to, type) : "",
    };
  });
  // A legacy operand the typed editor cannot round-trip remains unchanged until Replace/Clear.
  buildColumnConditionFilter(logic, conditions, type);
  return { logic, conditions, sourceFingerprint };
}
function dateOperand(input: string): string {
  const text = input.trim();
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/i.test(
      text,
    )
  )
    return fail("invalid");
  parseBound(text, "date");
  return text;
}
function operand(
  value: unknown,
  type: ConditionColumnType,
  membership: boolean,
): string | number | bigint | boolean | null {
  if (membership && value === null) return null;
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint" &&
    typeof value !== "boolean"
  )
    return fail("invalid");
  if (typeof value === "number" && !Number.isFinite(value))
    return fail("invalid");
  const input = scalarText(value);
  if (type === "number" || type === "bigint") {
    if (
      type === "bigint" &&
      typeof value === "number" &&
      !Number.isSafeInteger(value)
    )
      return fail("membership");
    return parseBound(input, type);
  }
  if (type === "date")
    return typeof value === "string" ? dateOperand(value) : fail("invalid");
  if (type === "boolean") {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return fail("invalid");
  }
  if (typeof value === "bigint") return input;
  return value;
}
export function parseConditionMembership(
  raw: string,
  type: ConditionColumnType,
): readonly (string | number | bigint | boolean | null)[] {
  if (raw.length > CONDITION_FILTER_LIMITS.maxTextLength) return fail("limit");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail("membership");
  }
  return denseArray(value).map((item) => operand(item, type, true));
}
export function convertConditionDraft(
  draft: ColumnConditionDraft,
  type: ConditionColumnType,
): ScalarFilter {
  if (!getConditionOperators(type).includes(draft.op)) return fail("invalid");
  if (draft.op === "blank" || draft.op === "notBlank") return { op: draft.op };
  if (
    draft.value.length + draft.upper.length >
    CONDITION_FILTER_LIMITS.maxTextLength
  )
    return fail("limit");
  if (draft.op === "in")
    return { op: "in", value: parseConditionMembership(draft.value, type) };
  if (
    (type === "number" || type === "bigint" || type === "date") &&
    !draft.value.trim()
  )
    return fail("required");
  const value = operand(draft.value, type, false);
  if (draft.op !== "between") return { op: draft.op, value };
  if (!draft.upper.trim()) return fail("required");
  const to = operand(draft.upper, type, false);
  const lower =
    type === "date"
      ? Date.parse(value as string)
      : typeof value === "number" || typeof value === "bigint"
        ? value
        : fail("invalid");
  const upper =
    type === "date"
      ? Date.parse(to as string)
      : typeof to === "number" || typeof to === "bigint"
        ? to
        : fail("invalid");
  if (lower > upper)
    throw new RangeFilterMessageError(gridMessage("rangeFilter.order"));
  return { op: "between", value, to };
}
export function buildColumnConditionFilter(
  logic: ConditionLogic,
  drafts: readonly ColumnConditionDraft[],
  type: ConditionColumnType,
): Filter {
  if (
    (logic !== "and" && logic !== "or") ||
    drafts.length < 1 ||
    drafts.length > 16
  )
    return fail("limit");
  let members = 0,
    text = 0;
  const conditions = drafts.map((draft) => {
    text += draft.value.length + draft.upper.length;
    if (text > CONDITION_FILTER_LIMITS.maxTextLength) return fail("limit");
    const result = convertConditionDraft(draft, type);
    if (result.op === "in")
      members += (result.value as readonly unknown[]).length;
    if (members > CONDITION_FILTER_LIMITS.maxMembershipValues)
      return fail("limit");
    return result;
  });
  return prepareColumnFilter(
    conditions.length === 1 ? conditions[0] : { op: logic, conditions },
  );
}
