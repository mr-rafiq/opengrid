import type { PivotResult } from "./analytics.js";

export type AnalyticNumber = number | bigint;
export interface ValueRatio {
  readonly kind: "ratio";
  readonly numerator: bigint;
  readonly denominator: bigint;
}
export type TransformedValue = AnalyticNumber | ValueRatio | null;
export type ValueTransform =
  | {
      type:
        | "percentOfRowTotal"
        | "percentOfColumnTotal"
        | "percentOfGrandTotal"
        | "percentOfParentRowTotal"
        | "percentOfParentColumnTotal";
    }
  | {
      type:
        | "runningTotal"
        | "differenceFromPrevious"
        | "percentDifferenceFromPrevious";
      axis: "rows" | "columns";
    };
export interface ValueTransformTotals {
  rows?: readonly (AnalyticNumber | null)[];
  columns?: Readonly<Record<string, AnalyticNumber | null>>;
  grand?: AnalyticNumber | null;
  parentRows?: readonly (Readonly<
    Record<string, AnalyticNumber | null>
  > | null)[];
  parentColumns?: readonly (Readonly<
    Record<string, AnalyticNumber | null>
  > | null)[];
}
export interface ValueTransformLimits {
  maxCells?: number;
  maxIntegerBits?: number;
}
export interface ValueTransformOptions {
  columns: readonly string[];
  transform: ValueTransform;
  totals?: ValueTransformTotals;
  limits?: ValueTransformLimits;
}
export type ValueTransformDiagnosticCode =
  | "INVALID_VALUE"
  | "MISSING_TOTAL"
  | "INVALID_TOTAL"
  | "ZERO_DENOMINATOR"
  | "NO_PREVIOUS"
  | "NO_PREVIOUS_VALUE"
  | "INVALID_PREVIOUS"
  | "OVERFLOW"
  | "LIMIT";
export interface ValueTransformDiagnostic {
  readonly rowIndex: number;
  readonly columnId: string;
  readonly code: ValueTransformDiagnosticCode;
  readonly message: string;
}
export interface TransformedMatrix {
  readonly columns: readonly string[];
  readonly rows: readonly {
    readonly keys: readonly unknown[];
    readonly cells: Readonly<Record<string, TransformedValue>>;
  }[];
  readonly diagnostics: readonly ValueTransformDiagnostic[];
}
type Issue = { code: ValueTransformDiagnosticCode; message: string };
const invalid = Symbol("invalid analytic value");
type Input = AnalyticNumber | null | typeof invalid;
type Calculation = AnalyticNumber | Issue | null;
const isIssue = (value: Calculation): value is Issue =>
  typeof value === "object" && value !== null;
const issue = (code: ValueTransformDiagnosticCode, message: string): Issue => ({
  code,
  message,
});
const modes = new Set([
  "percentOfRowTotal",
  "percentOfColumnTotal",
  "percentOfGrandTotal",
  "percentOfParentRowTotal",
  "percentOfParentColumnTotal",
  "runningTotal",
  "differenceFromPrevious",
  "percentDifferenceFromPrevious",
]);
const orderedModes = new Set([
  "runningTotal",
  "differenceFromPrevious",
  "percentDifferenceFromPrevious",
]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError(`${path} must be a plain record`);
  return value as Record<string, unknown>;
}
function read(
  record: Record<string, unknown>,
  key: string,
  path: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor))
    throw new TypeError(`${path} cannot be an accessor`);
  return descriptor.value;
}
function array(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  if (value.length > maximum)
    throw new RangeError(`${path} exceeds the resource budget`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(`${path} cannot contain holes or accessors`);
    result.push(descriptor.value);
  }
  return result;
}
function limit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum)
    throw new RangeError(
      `${name} must be a positive integer no greater than ${maximum}`,
    );
  return result;
}
function ratio(numerator: bigint, denominator: bigint): ValueRatio {
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  let a = numerator < 0n ? -numerator : numerator,
    b = denominator;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  const divisor = a === 0n ? 1n : a;
  return Object.freeze({
    kind: "ratio",
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

/** Display-only transform over one explicitly selected measure. Source values remain untouched. */
export function transformValues(
  matrix: PivotResult,
  options: ValueTransformOptions,
): TransformedMatrix {
  const maxCells = limit(options.limits?.maxCells, 100000, 1000000, "maxCells");
  const maxBits = limit(
    options.limits?.maxIntegerBits,
    4096,
    16384,
    "maxIntegerBits",
  );
  const boundary = 1n << BigInt(maxBits);
  const bounded = (value: bigint) => value > -boundary && value < boundary;
  const selected = array(options.columns, "columns", maxCells);
  if (
    selected.some((id) => typeof id !== "string" || !id) ||
    new Set(selected).size !== selected.length
  )
    throw new TypeError("Selected column IDs must be unique nonempty strings");
  const selectedColumns = selected as string[];
  const selectedIds = new Set(selectedColumns);
  const source = object(matrix, "matrix");
  const sourceColumns = array(
    read(source, "columns", "matrix.columns"),
    "matrix.columns",
    maxCells,
  );
  if (
    sourceColumns.some((id) => typeof id !== "string" || !id) ||
    new Set(sourceColumns).size !== sourceColumns.length
  )
    throw new TypeError("Matrix column IDs must be unique nonempty strings");
  const sourceIds = new Set(sourceColumns);
  if (selectedColumns.some((id) => !sourceIds.has(id)))
    throw new TypeError("Selected column is not present in the matrix");
  const transform = object(options.transform, "transform"),
    type = read(transform, "type", "transform.type");
  if (typeof type !== "string" || !modes.has(type))
    throw new TypeError("Unknown value transform mode");
  const axis = read(transform, "axis", "transform.axis");
  if (orderedModes.has(type) && axis !== "rows" && axis !== "columns")
    throw new TypeError("Ordered transforms require axis rows or columns");
  const sourceRows = array(
    read(source, "rows", "matrix.rows"),
    "matrix.rows",
    maxCells,
  );
  if (sourceRows.length * selectedColumns.length > maxCells)
    throw new RangeError("Selected matrix exceeds the cell budget");
  let keyCount = 0,
    hasBigInt = false,
    hasNonzeroNumber = false;
  function input(value: unknown, path: string): Input {
    if (value == null) return null;
    if (typeof value === "bigint") {
      if (!bounded(value))
        throw new RangeError(`${path} exceeds the BigInt bit budget`);
      hasBigInt = true;
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value !== 0) hasNonzeroNumber = true;
      return value;
    }
    return invalid;
  }
  const keys: unknown[][] = [],
    values: Input[][] = sourceRows.map((row, rowIndex) => {
      const record = object(row, `rows[${rowIndex}]`),
        rowKeys = array(
          read(record, "keys", "row.keys"),
          `rows[${rowIndex}].keys`,
          maxCells,
        );
      keyCount += rowKeys.length;
      if (keyCount > maxCells)
        throw new RangeError("Matrix row keys exceed the resource budget");
      keys.push(rowKeys);
      const cells = object(
        read(record, "cells", "row.cells"),
        `rows[${rowIndex}].cells`,
      );
      return selectedColumns.map((id) =>
        input(
          read(cells, id, `rows[${rowIndex}].cells[${id}]`),
          `rows[${rowIndex}].cells[${id}]`,
        ),
      );
    });
  const totals =
    options.totals === undefined ? {} : object(options.totals, "totals");
  if (
    Object.keys(totals).some(
      (key) =>
        !["rows", "columns", "grand", "parentRows", "parentColumns"].includes(
          key,
        ),
    )
  )
    throw new TypeError("Unknown totals property");
  function totalRows(name: "rows"): Input[] | undefined {
    if (!Object.hasOwn(totals, name)) return;
    const rows = array(
      read(totals, name, `totals.${name}`),
      `totals.${name}`,
      maxCells,
    );
    if (rows.length !== sourceRows.length)
      throw new TypeError(`totals.${name} must match the matrix row count`);
    return rows.map((value, index) => input(value, `totals.${name}[${index}]`));
  }
  function totalRecord(value: unknown, path: string): Map<string, Input> {
    const record = object(value, path),
      result = new Map<string, Input>();
    if (Object.keys(record).some((id) => !selectedIds.has(id)))
      throw new TypeError(`${path} contains an unselected column`);
    for (const id of selectedColumns)
      if (Object.hasOwn(record, id))
        result.set(
          id,
          input(read(record, id, `${path}[${id}]`), `${path}[${id}]`),
        );
    return result;
  }
  function parentTable(
    name: "parentRows" | "parentColumns",
  ): (Map<string, Input> | null)[] | undefined {
    if (!Object.hasOwn(totals, name)) return;
    const rows = array(
      read(totals, name, `totals.${name}`),
      `totals.${name}`,
      maxCells,
    );
    if (rows.length !== sourceRows.length)
      throw new TypeError(`totals.${name} must match the matrix row count`);
    return rows.map((record, index) =>
      record === null ? null : totalRecord(record, `totals.${name}[${index}]`),
    );
  }
  const explicitRows = totalRows("rows");
  const explicitColumns = Object.hasOwn(totals, "columns")
    ? totalRecord(read(totals, "columns", "totals.columns"), "totals.columns")
    : undefined;
  const hasGrand = Object.hasOwn(totals, "grand");
  const explicitGrand = hasGrand
    ? input(read(totals, "grand", "totals.grand"), "totals.grand")
    : undefined;
  const parentRows = parentTable("parentRows"),
    parentColumns = parentTable("parentColumns");
  if (type === "percentOfParentRowTotal" && !parentRows)
    throw new TypeError("Parent-row percentages require totals.parentRows");
  if (type === "percentOfParentColumnTotal" && !parentColumns)
    throw new TypeError(
      "Parent-column percentages require totals.parentColumns",
    );
  if (hasBigInt && hasNonzeroNumber)
    throw new TypeError(
      "A selected measure cannot mix nonzero Number and BigInt values",
    );
  const normalize = (value: Input): Input =>
    hasBigInt && value === 0 ? 0n : value;
  for (const row of values)
    for (let index = 0; index < row.length; index++)
      row[index] = normalize(row[index]);
  if (explicitRows)
    for (let index = 0; index < explicitRows.length; index++)
      explicitRows[index] = normalize(explicitRows[index]);
  for (const map of [
    explicitColumns,
    ...(parentRows ?? []),
    ...(parentColumns ?? []),
  ])
    if (map) for (const [key, value] of map) map.set(key, normalize(value));
  const grand =
    explicitGrand === undefined ? undefined : normalize(explicitGrand);
  function finite(value: AnalyticNumber): Calculation {
    if (typeof value === "bigint")
      return bounded(value)
        ? value
        : issue("LIMIT", "Derived integer exceeds the BigInt bit budget");
    return Number.isFinite(value)
      ? value
      : issue("OVERFLOW", "Derived value is not finite");
  }
  function add(a: AnalyticNumber, b: AnalyticNumber): Calculation {
    return finite(
      typeof a === "bigint" ? a + (b as bigint) : a + (b as number),
    );
  }
  function sum(items: Input[]): Calculation {
    let result: Calculation = null;
    for (const value of items) {
      if (value === null || value === invalid) continue;
      result = result === null ? value : add(result as AnalyticNumber, value);
      if (isIssue(result)) return result;
    }
    return result;
  }
  const rowTotals = values.map(sum),
    columnTotals = selectedColumns.map((_, index) =>
      sum(values.map((row) => row[index])),
    ),
    grandTotal = sum(values.flat());
  function denominator(value: Input | Calculation | undefined): Calculation {
    if (value === invalid)
      return issue("INVALID_TOTAL", "The supplied denominator is not numeric");
    if (value === null || value === undefined)
      return issue("MISSING_TOTAL", "No denominator is available");
    return value;
  }
  function divide(
    numerator: AnalyticNumber,
    value: Input | Calculation | undefined,
  ): TransformedValue | Issue {
    const total = denominator(value);
    if (isIssue(total)) return total;
    if (total === null)
      return issue("MISSING_TOTAL", "No denominator is available");
    if (total === 0 || total === 0n)
      return issue("ZERO_DENOMINATOR", "The denominator is zero");
    if (typeof numerator === "bigint") return ratio(numerator, total as bigint);
    const result = numerator / (total as number);
    return Number.isFinite(result)
      ? result
      : issue("OVERFLOW", "The ratio is not finite");
  }
  const diagnostics: ValueTransformDiagnostic[] = [],
    runningColumns: Calculation[] = selectedColumns.map(() => null);
  const output = values.map((row, rowIndex) => {
    let runningRow: Calculation = null;
    const cells: [string, TransformedValue][] = selectedColumns.map(
      (columnId, columnIndex) => {
        const current = row[columnIndex];
        let result: TransformedValue | Issue;
        if (current === null) return [columnId, null];
        if (current === invalid)
          result = issue(
            "INVALID_VALUE",
            "The source cell is not a finite number or BigInt",
          );
        else if (type === "percentOfRowTotal")
          result = divide(
            current,
            explicitRows ? explicitRows[rowIndex] : rowTotals[rowIndex],
          );
        else if (type === "percentOfColumnTotal")
          result = divide(
            current,
            explicitColumns?.has(columnId)
              ? explicitColumns.get(columnId)
              : columnTotals[columnIndex],
          );
        else if (type === "percentOfGrandTotal")
          result = divide(current, hasGrand ? grand : grandTotal);
        else if (type === "percentOfParentRowTotal")
          result = divide(current, parentRows![rowIndex]?.get(columnId));
        else if (type === "percentOfParentColumnTotal")
          result = divide(current, parentColumns![rowIndex]?.get(columnId));
        else if (type === "runningTotal") {
          const previous =
            axis === "rows" ? runningColumns[columnIndex] : runningRow;
          result = isIssue(previous)
            ? previous
            : previous === null
              ? current
              : add(previous, current);
          if (axis === "rows")
            runningColumns[columnIndex] = result as Calculation;
          else runningRow = result as Calculation;
        } else {
          const previous =
            axis === "rows"
              ? values[rowIndex - 1]?.[columnIndex]
              : row[columnIndex - 1];
          if (previous === undefined)
            result = issue(
              "NO_PREVIOUS",
              "The first position has no previous value",
            );
          else if (previous === null)
            result = issue(
              "NO_PREVIOUS_VALUE",
              "The adjacent previous position is blank",
            );
          else if (previous === invalid)
            result = issue(
              "INVALID_PREVIOUS",
              "The adjacent previous position is not numeric",
            );
          else {
            const difference = finite(
              typeof current === "bigint"
                ? current - (previous as bigint)
                : current - (previous as number),
            );
            result = isIssue(difference)
              ? difference
              : type === "differenceFromPrevious"
                ? difference
                : divide(difference as AnalyticNumber, previous);
          }
        }
        if (
          result !== null &&
          typeof result === "object" &&
          !("kind" in result)
        ) {
          diagnostics.push(
            Object.freeze({
              rowIndex,
              columnId,
              code: result.code,
              message: result.message,
            }),
          );
          return [columnId, null];
        }
        return [columnId, result as TransformedValue];
      },
    );
    return Object.freeze({
      keys: Object.freeze([...keys[rowIndex]]),
      cells: Object.freeze(Object.fromEntries(cells)),
    });
  });
  return Object.freeze({
    columns: Object.freeze([...selectedColumns]),
    rows: Object.freeze(output),
    diagnostics: Object.freeze(diagnostics),
  });
}

export interface ValueRatioFormatOptions {
  style?: "decimal" | "percent";
  fractionDigits?: number;
  maxIntegerBits?: number;
}
/** Exact bounded decimal formatting. Rounds halfway away from zero without Number coercion. */
export function formatValueRatio(
  value: ValueRatio,
  options: ValueRatioFormatOptions = {},
): string {
  if (
    value === null ||
    typeof value !== "object" ||
    value.kind !== "ratio" ||
    typeof value.numerator !== "bigint" ||
    typeof value.denominator !== "bigint"
  )
    throw new TypeError("Expected an exact ValueRatio");
  if (value.denominator === 0n)
    throw new RangeError("Ratio denominator cannot be zero");
  const maxBits = limit(options.maxIntegerBits, 4096, 16384, "maxIntegerBits"),
    boundary = 1n << BigInt(maxBits);
  if (
    value.numerator <= -boundary ||
    value.numerator >= boundary ||
    value.denominator <= -boundary ||
    value.denominator >= boundary
  )
    throw new RangeError("Ratio exceeds the BigInt bit budget");
  const digits =
      options.fractionDigits === undefined ? 2 : options.fractionDigits,
    style = options.style === undefined ? "percent" : options.style;
  if (!Number.isSafeInteger(digits) || digits < 0 || digits > 12)
    throw new RangeError("fractionDigits must be an integer from 0 to 12");
  if (style !== "decimal" && style !== "percent")
    throw new TypeError("Unknown ratio format style");
  const negative = value.numerator < 0n !== value.denominator < 0n,
    numerator = value.numerator < 0n ? -value.numerator : value.numerator,
    denominator =
      value.denominator < 0n ? -value.denominator : value.denominator;
  const scaled =
    numerator * 10n ** BigInt(digits) * (style === "percent" ? 100n : 1n);
  let rounded = scaled / denominator;
  if ((scaled % denominator) * 2n >= denominator) rounded++;
  const raw = rounded.toString().padStart(digits + 1, "0"),
    decimal = digits ? `${raw.slice(0, -digits)}.${raw.slice(-digits)}` : raw;
  return `${negative && rounded !== 0n ? "-" : ""}${decimal}${style === "percent" ? "%" : ""}`;
}
