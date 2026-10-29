import type { Aggregate, Column } from "./types.js";

/** Count includes all records. BigInt averages use integer division; mixed numeric types reject. */
export function aggregateValues(
  values: unknown[],
  operation: Aggregate = "sum",
): unknown {
  if (typeof operation === "function") return operation(values);
  if (operation === "count") return values.length;
  const valid = values.filter(
    (value): value is number | bigint =>
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "bigint",
  );
  if (!valid.length) return operation === "sum" ? 0 : null;
  if (valid.every((value) => typeof value === "bigint")) {
    const numbers = valid as bigint[];
    if (operation === "min") return numbers.reduce((a, b) => (a < b ? a : b));
    if (operation === "max") return numbers.reduce((a, b) => (a > b ? a : b));
    const total = numbers.reduce((a, b) => a + b, 0n);
    return operation === "avg" ? total / BigInt(numbers.length) : total;
  }
  if (valid.some((value) => typeof value === "bigint"))
    throw new TypeError("Cannot aggregate mixed number and bigint values");
  const numbers = valid as number[];
  if (operation === "min") return numbers.reduce((a, b) => Math.min(a, b));
  if (operation === "max") return numbers.reduce((a, b) => Math.max(a, b));
  const total = numbers.reduce((a, b) => a + b, 0);
  return operation === "avg" ? total / numbers.length : total;
}
export const aggregate = aggregateValues;

export interface PivotOptions<T> {
  rows: T[];
  rowKeys: (keyof T & string)[];
  pivotKey: keyof T & string;
  values: { field: keyof T & string; aggregate: Aggregate }[];
}
export interface PivotResult {
  columns: string[];
  rows: { keys: unknown[]; cells: Record<string, unknown> }[];
}
/** Typed JSON tuples prevent collisions between numeric/string and delimiter-containing keys. */
export function pivot<T>({
  rows,
  rowKeys,
  pivotKey,
  values,
}: PivotOptions<T>): PivotResult {
  const buckets = new Map<
    string,
    { keys: unknown[]; cells: Map<string, unknown[]> }
  >();
  const columns = new Set<string>();
  for (const row of rows) {
    const keys = rowKeys.map((key) => row[key]);
    const id = JSON.stringify(keys);
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { keys, cells: new Map() };
      buckets.set(id, bucket);
    }
    for (const value of values) {
      const cell = JSON.stringify([row[pivotKey], value.field]);
      columns.add(cell);
      const items = bucket.cells.get(cell) ?? [];
      items.push(row[value.field]);
      bucket.cells.set(cell, items);
    }
  }
  return {
    columns: [...columns],
    rows: [...buckets.values()].map((bucket) => ({
      keys: bucket.keys,
      cells: Object.fromEntries(
        [...columns].map((key) => {
          const field = JSON.parse(key)[1];
          const operation = values.find(
            (value) => value.field === field,
          )!.aggregate;
          return [key, aggregate(bucket.cells.get(key) ?? [], operation)];
        }),
      ),
    })),
  };
}

export function getVirtualWindow(
  count: number,
  scrollTop: number,
  height: number,
  rowHeight: number,
  overscan = 6,
) {
  if (
    !Number.isFinite(rowHeight) ||
    rowHeight <= 0 ||
    !Number.isFinite(height) ||
    height < 0 ||
    !Number.isInteger(count) ||
    count < 0 ||
    !Number.isFinite(scrollTop) ||
    !Number.isInteger(overscan) ||
    overscan < 0
  )
    throw new RangeError("Invalid virtual window dimensions");
  const start = Math.max(
    0,
    Math.min(count, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan),
  );
  const end = Math.min(
    count,
    Math.ceil((Math.max(0, scrollTop) + height) / rowHeight) + overscan,
  );
  return {
    start,
    end: Math.max(start, end),
    offset: start * rowHeight,
    totalHeight: count * rowHeight,
  };
}

export function findCells<T>(
  rows: T[],
  columns: Column<T>[],
  query: string,
): { rowIndex: number; columnId: string }[] {
  if (!query) return [];
  const needle = query.toLocaleLowerCase();
  const matches: { rowIndex: number; columnId: string }[] = [];
  rows.forEach((row, rowIndex) =>
    columns
      .filter((c) => !c.hidden)
      .forEach((column) => {
        const value = column.valueGetter
          ? column.valueGetter(row)
          : column.field
            ? row[column.field]
            : undefined;
        const text = column.valueFormatter
          ? column.valueFormatter(value, row)
          : String(value ?? "");
        if (text.toLocaleLowerCase().includes(needle))
          matches.push({ rowIndex, columnId: column.id });
      }),
  );
  return matches;
}
