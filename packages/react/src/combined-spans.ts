import {
  createColumnSpanPlan,
  getColumnSpanOwner,
  type ColumnSpanPlan,
  type SpanColumn,
} from "./column-spans.js";
import {
  createRowSpanPlan,
  type RowSpanColumn,
  type RowSpanOptions,
  type RowSpanPlan,
  type RowSpanRow,
} from "./row-spans.js";
import type { GridDirection } from "./direction.js";

export interface CombinedSpanColumn<T> extends RowSpanColumn<T> {
  readonly colSpan?: SpanColumn<T>["colSpan"];
  readonly pinned?: SpanColumn<T>["pinned"];
  readonly hidden?: boolean;
}
export interface CombinedSpanOptions<T> extends RowSpanOptions<T> {
  readonly direction?: GridDirection;
  /** Includes hidden input columns and all projected rows. Can only lower 100,000. */
  readonly maxCells?: number;
}
export const COMBINED_SPAN_LIMITS = Object.freeze({
  maxCells: 100_000,
  maxInputColumns: 10_000,
});

interface IndexedRow<T> {
  readonly index: number;
  readonly source: T;
}

/**
 * Vertical runs may join only identical horizontal owner footprints. Width-free
 * topology keeps runs reusable through manual/flex pixel changes. All borrowed
 * metadata is copied; private horizontal/value caches expire after construction.
 */
export function createCombinedRowSpanPlan<T>(
  rows: readonly RowSpanRow<T>[],
  columns: readonly CombinedSpanColumn<T>[],
  options: CombinedSpanOptions<T>,
): RowSpanPlan {
  const maxCells = options.maxCells ?? COMBINED_SPAN_LIMITS.maxCells;
  if (
    !Number.isSafeInteger(maxCells) ||
    maxCells < 1 ||
    maxCells > COMBINED_SPAN_LIMITS.maxCells
  )
    throw new RangeError(
      "Combined span maxCells must be from 1 through 100000",
    );
  if (
    !Array.isArray(rows) ||
    !Array.isArray(columns) ||
    columns.length > COMBINED_SPAN_LIMITS.maxInputColumns ||
    rows.length * columns.length > maxCells
  )
    throw new RangeError(
      "Combined spans exceed the projected row-column budget",
    );
  const captured: CombinedSpanColumn<T>[] = [];
  for (let index = 0; index < columns.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(columns, String(index));
    if (
      !descriptor ||
      !("value" in descriptor) ||
      !descriptor.value ||
      typeof descriptor.value !== "object"
    )
      throw new TypeError(
        "Combined span columns must be dense records without accessor entries",
      );
    const column = descriptor.value as CombinedSpanColumn<T>;
    if (
      column.spanRows !== undefined &&
      typeof column.spanRows !== "boolean" &&
      typeof column.spanRows !== "function"
    )
      throw new TypeError("Column spanRows must be a boolean or function");
    captured.push({
      id: column.id,
      colSpan: column.colSpan,
      spanRows: column.spanRows,
      hidden: column.hidden,
      pinned: column.pinned,
    });
  }
  const horizontalColumns = captured.map((column) => ({ ...column, width: 1 }));
  const ordinary = createColumnSpanPlan(
    horizontalColumns,
    { kind: "group" },
    { direction: options.direction },
  );
  const visible = new Set(ordinary.columnIds);
  const activeColumns = captured.filter((column) => visible.has(column.id));
  // Complete row/geometry/active-column validation before any application callback.
  createRowSpanPlan(
    rows,
    activeColumns.map((column) => ({
      id: column.id,
      spanRows:
        column.spanRows === true || typeof column.spanRows === "function"
          ? () => false
          : column.spanRows,
    })),
    options,
  );
  const indexedRows: RowSpanRow<IndexedRow<T>>[] = rows.map((row, index) => ({
    ...row,
    data: row.data === undefined ? undefined : { index, source: row.data },
  }));
  const horizontal = new Map<number, ColumnSpanPlan>();
  const positions = new Map(ordinary.columnIds.map((id, index) => [id, index]));
  const values = new Map<string, Map<number, unknown>>();
  function planAt(index: number): ColumnSpanPlan {
    let plan = horizontal.get(index);
    if (!plan) {
      const row = indexedRows[index];
      plan = createColumnSpanPlan(
        horizontalColumns,
        row.kind === "row" && row.data !== undefined
          ? { kind: "row", row: row.data.source }
          : { kind: "group" },
        { direction: options.direction },
      );
      horizontal.set(index, plan);
    }
    return plan;
  }
  function matchesFootprint(
    previous: number,
    next: number,
    columnId: string,
  ): boolean {
    const position = positions.get(columnId)!;
    const left = getColumnSpanOwner(planAt(previous), position);
    if (left?.columnId !== columnId) return false;
    const right = getColumnSpanOwner(planAt(next), position);
    return (
      right?.columnId === columnId &&
      left.start === right.start &&
      left.end === right.end &&
      left.pinned === right.pinned
    );
  }
  function valueAt(row: IndexedRow<T>, columnId: string): unknown {
    let cache = values.get(columnId);
    if (!cache) {
      cache = new Map();
      values.set(columnId, cache);
    }
    if (!cache.has(row.index))
      cache.set(row.index, options.getValue(row.source, columnId));
    return cache.get(row.index);
  }
  const verticalColumns: RowSpanColumn<IndexedRow<T>>[] = activeColumns.map(
    (column) => ({
      id: column.id,
      spanRows:
        column.spanRows === true || typeof column.spanRows === "function"
          ? (previous, next) => {
              if (!matchesFootprint(previous.index, next.index, column.id))
                return false;
              return typeof column.spanRows === "function"
                ? column.spanRows(previous.source, next.source) === true
                : Object.is(
                    valueAt(previous, column.id),
                    valueAt(next, column.id),
                  );
            }
          : column.spanRows,
    }),
  );
  return createRowSpanPlan(indexedRows, verticalColumns, {
    getValue: () => undefined,
    maxRows: options.maxRows,
    maxColumns: options.maxColumns,
    maxWork: options.maxWork,
    maxRunRows: options.maxRunRows,
  });
}
