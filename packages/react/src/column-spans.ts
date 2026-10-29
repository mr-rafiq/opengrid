import { getColumnWindow } from "./column-window.js";
import type { ColumnWindowOptions } from "./column-window.js";
import { assertGridDirection } from "./direction.js";
import type { GridDirection } from "./direction.js";

/** Presentation metadata, independent of the source row/value model. */
export interface SpanColumn<T> {
  readonly id: string;
  readonly width: number;
  readonly pinned?: "left" | "right" | null;
  readonly hidden?: boolean;
  readonly colSpan?: number | ((row: T) => number);
}
export type SpanRowContext<T> =
  { readonly kind: "row"; readonly row: T } | { readonly kind: "group" };
export interface ColumnSpanOptions {
  /** Direction selects the required supplied inline pin order; source indices are never reordered here. */
  readonly direction?: GridDirection;
  /** Counts all supplied columns, including hidden columns. Default 10,000; hard cap 100,000. */
  readonly maxColumns?: number;
  /** False produces ordinary single-column cells without invoking callbacks. */
  readonly enabled?: boolean;
}
export interface ColumnSpanCell {
  /** Inclusive/exclusive positions in the visible, rendered leaf-column order. */
  readonly start: number;
  readonly end: number;
  readonly span: number;
  /** The owner's original index in the supplied array, before hidden columns were removed. */
  readonly sourceIndex: number;
  readonly columnId: string;
  readonly width: number;
  /** Logical pixel position, excluding any leading row controls. */
  readonly offset: number;
  readonly pinned: "left" | "right" | null;
  /** Physical left offset excludes inline-start row controls. In RTL sum left-pinned widths after the whole span. */
  readonly leftOffset?: number;
  /** Physical right offset excludes row controls: widths after the span in LTR, before it in RTL. */
  readonly rightOffset?: number;
}
export interface ColumnSpanPlan {
  readonly columnIds: readonly string[];
  readonly sourceIndices: readonly number[];
  /** Maps each visible leaf index to its owning index in cells. */
  readonly ownerIndices: readonly number[];
  readonly cells: readonly ColumnSpanCell[];
  readonly totalWidth: number;
}
export type ColumnSpanWindowEntry =
  | {
      readonly kind: "cell";
      readonly cellIndex: number;
      readonly cell: ColumnSpanCell;
    }
  | { readonly kind: "spacer"; readonly key: string; readonly width: number };

const DEFAULT_MAX_COLUMNS = 10_000;
const HARD_MAX_COLUMNS = 100_000;
const pinRank = (pin: "left" | "right" | null, direction: GridDirection) =>
  pin === (direction === "rtl" ? "right" : "left") ? 0 : pin === null ? 1 : 2;

function validSpan(value: unknown, columnId: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new RangeError(
      `Column span for ${columnId} must be a positive safe integer`,
    );
  return value;
}

function callbackSpan(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : 1;
}

/**
 * Build one row's immutable cell geometry in O(column count) time and space.
 * Supply inline order: left/center/right in LTR, right/center/left in RTL.
 * Hidden columns are omitted before spans are counted. No borrowed object is frozen.
 * Callbacks run only for uncovered owners of data rows and never for group rows.
 */
export function createColumnSpanPlan<T>(
  columns: readonly SpanColumn<T>[],
  context: SpanRowContext<T>,
  options: ColumnSpanOptions = {},
): ColumnSpanPlan {
  const direction = options.direction ?? "ltr";
  assertGridDirection(direction);
  const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;
  if (
    !Number.isSafeInteger(maxColumns) ||
    maxColumns < 1 ||
    maxColumns > HARD_MAX_COLUMNS
  )
    throw new RangeError("maxColumns must be an integer from 1 to 100000");
  if (!Array.isArray(columns) || columns.length > maxColumns)
    throw new RangeError(
      `Column span input exceeds the ${maxColumns} column limit`,
    );
  if (!context || (context.kind !== "row" && context.kind !== "group"))
    throw new TypeError("Column span context must be a row or group");
  if (options.enabled !== undefined && typeof options.enabled !== "boolean")
    throw new TypeError("Column spanning enabled must be a boolean");
  const ids = new Set<string>();
  const visible: {
    column: SpanColumn<T>;
    sourceIndex: number;
    pin: "left" | "right" | null;
  }[] = [];
  let previousRank = 0;
  for (let sourceIndex = 0; sourceIndex < columns.length; sourceIndex++) {
    const descriptor = Object.getOwnPropertyDescriptor(
      columns,
      String(sourceIndex),
    );
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Column arrays cannot contain holes or accessors");
    const column: SpanColumn<T> = descriptor.value;
    if (
      !column ||
      typeof column !== "object" ||
      typeof column.id !== "string" ||
      !column.id ||
      ids.has(column.id)
    )
      throw new TypeError("Span columns require unique nonempty string IDs");
    ids.add(column.id);
    if (!Number.isFinite(column.width) || column.width < 0)
      throw new RangeError(
        `Column width for ${column.id} must be finite and nonnegative`,
      );
    if (column.hidden !== undefined && typeof column.hidden !== "boolean")
      throw new TypeError("Column hidden must be a boolean");
    if (
      column.pinned !== undefined &&
      column.pinned !== null &&
      column.pinned !== "left" &&
      column.pinned !== "right"
    )
      throw new TypeError("Column pinned must be left, right or null");
    if (column.colSpan !== undefined && typeof column.colSpan !== "function")
      validSpan(column.colSpan, column.id);
    if (column.hidden) continue;
    const pin = column.pinned ?? null;
    const rank = pinRank(pin, direction);
    if (rank < previousRank)
      throw new TypeError(
        direction === "rtl"
          ? "Span columns must be in rendered right, center, left pin order"
          : "Span columns must be in rendered left, center, right pin order",
      );
    previousRank = rank;
    visible.push({ column, sourceIndex, pin });
  }
  const count = visible.length;
  const offsets = [0],
    rightStarts = [0];
  for (const item of visible) {
    const total = offsets[offsets.length - 1] + item.column.width;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER)
      throw new RangeError(
        "Total column span width exceeds safe numeric geometry",
      );
    offsets.push(total);
    rightStarts.push(
      rightStarts.at(-1)! + (item.pin === "right" ? item.column.width : 0),
    );
  }
  const rightOffsets: number[] = new Array(count + 1).fill(0);
  const leftOffsets: number[] = new Array(count + 1).fill(0);
  const regionEnds: number[] = new Array(count);
  for (let index = count - 1; index >= 0; index--) {
    rightOffsets[index] =
      rightOffsets[index + 1] +
      (visible[index].pin === "right" ? visible[index].column.width : 0);
    leftOffsets[index] =
      leftOffsets[index + 1] +
      (visible[index].pin === "left" ? visible[index].column.width : 0);
    regionEnds[index] =
      index + 1 < count && visible[index].pin === visible[index + 1].pin
        ? regionEnds[index + 1]
        : index + 1;
  }
  const cells: ColumnSpanCell[] = [],
    ownerIndices: number[] = new Array(count);
  for (let start = 0; start < count;) {
    const { column, sourceIndex, pin } = visible[start];
    const requested =
      options.enabled === false || context.kind === "group"
        ? 1
        : typeof column.colSpan === "function"
          ? callbackSpan(column.colSpan(context.row))
          : (column.colSpan ?? 1);
    const end = start + Math.min(requested, regionEnds[start] - start);
    let width = 0;
    const cellIndex = cells.length;
    for (let index = start; index < end; index++) {
      width += visible[index].column.width;
      ownerIndices[index] = cellIndex;
    }
    cells.push(
      Object.freeze({
        start,
        end,
        span: end - start,
        sourceIndex,
        columnId: column.id,
        width,
        offset: offsets[start],
        pinned: pin,
        ...(pin === "left"
          ? {
              leftOffset:
                direction === "rtl" ? leftOffsets[end] : offsets[start],
            }
          : {}),
        ...(pin === "right"
          ? {
              rightOffset:
                direction === "rtl" ? rightStarts[start] : rightOffsets[end],
            }
          : {}),
      }),
    );
    start = end;
  }
  return Object.freeze({
    columnIds: Object.freeze(visible.map((item) => item.column.id)),
    sourceIndices: Object.freeze(visible.map((item) => item.sourceIndex)),
    ownerIndices: Object.freeze(ownerIndices),
    cells: Object.freeze(cells),
    totalWidth: offsets[count],
  });
}

/** Invalid/out-of-range leaf positions have no owner. Covered leaves resolve to their anchor. */
export function getColumnSpanOwner(
  plan: ColumnSpanPlan,
  leafIndex: number,
): ColumnSpanCell | undefined {
  if (
    !Number.isInteger(leafIndex) ||
    leafIndex < 0 ||
    leafIndex >= plan.ownerIndices.length
  )
    return;
  return plan.cells[plan.ownerIndices[leafIndex]];
}

/**
 * Window whole cells using their merged widths, so a clipped anchor remains mounted
 * while any part of its span intersects the viewport. retainIndices are LEAF indices.
 * Spacer widths and cell widths sum to the original row width without double counting.
 */
export function getColumnSpanWindow(
  plan: ColumnSpanPlan,
  options: ColumnWindowOptions,
): readonly ColumnSpanWindowEntry[] {
  if (
    options.retainIndices !== undefined &&
    (!Array.isArray(options.retainIndices) ||
      options.retainIndices.length > HARD_MAX_COLUMNS)
  )
    throw new RangeError("Retained span leaves exceed the 100000 entry limit");
  const retained = new Set<number>();
  for (const leafIndex of options.retainIndices ?? []) {
    if (getColumnSpanOwner(plan, leafIndex))
      retained.add(plan.ownerIndices[leafIndex]);
  }
  const entries = getColumnWindow(plan.cells, {
    ...options,
    retainIndices: [...retained],
  });
  return Object.freeze(
    entries.map((entry) =>
      Object.freeze(
        entry.kind === "spacer"
          ? entry
          : {
              kind: "cell" as const,
              cellIndex: entry.index,
              cell: plan.cells[entry.index],
            },
      ),
    ),
  );
}
