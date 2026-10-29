import type { RowRegion } from "./row-projection.js";

export interface RowSpanRow<T> {
  readonly id: string;
  readonly kind: "row" | "group";
  readonly data?: T;
  readonly leaf?: boolean;
  readonly depth?: number;
  readonly fullWidth?: boolean;
  readonly detailHeight?: number;
  readonly region: RowRegion;
  readonly top: number;
  readonly height: number;
}
export interface RowSpanColumn<T> {
  readonly id: string;
  readonly spanRows?: boolean | ((previous: T, next: T) => boolean);
}
export interface RowSpanOptions<T> {
  readonly getValue: (row: T, columnId: string) => unknown;
  /** Resource options can tighten, but cannot exceed, the fixed implementation limits. */
  readonly maxRows?: number;
  readonly maxColumns?: number;
  readonly maxWork?: number;
  readonly maxRunRows?: number;
}
export interface RowSpanRun {
  readonly columnId: string;
  readonly ownerIndex: number;
  readonly end: number;
  readonly span: number;
  readonly ownerId: string;
  readonly region: RowRegion;
  readonly top: number;
  readonly height: number;
}
export interface RowSpanPlan {
  readonly rowCount: number;
  readonly columnIds: readonly string[];
  readonly mergedRunCount: number;
  /** Returns a merged owner, including for a covered row. Ordinary cells have no run. */
  ownerAt(rowIndex: number, columnId: string): RowSpanRun | undefined;
  /** Binary-search merged runs touching the half-open visual row interval. */
  intersecting(
    start: number,
    end: number,
    columnIds?: readonly string[],
  ): readonly RowSpanRun[];
}

const MAX_ROWS = 100_000;
const MAX_SPAN_COLUMNS = 8;
const MAX_WORK = 1_000_000;
const MAX_RUN_ROWS = 1000;
const MAX_INPUT_COLUMNS = 100_000;
const regions: readonly RowRegion[] = ["top", "body", "bottom"];
const emptyRuns: readonly RowSpanRun[] = Object.freeze([]);
const dimension = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;

function limit(
  value: number | undefined,
  maximum: number,
  name: string,
): number {
  const selected = value ?? maximum;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum)
    throw new RangeError(
      `${name} must be an integer from 1 through ${maximum}`,
    );
  return selected;
}
function arrayValue<T>(items: readonly T[], index: number, name: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(items, String(index));
  if (!descriptor || !("value" in descriptor))
    throw new TypeError(`${name} cannot contain holes or accessors`);
  return descriptor.value as T;
}
interface RunStore {
  readonly count: number;
  ownerAt(row: number): RowSpanRun | undefined;
  appendIntersecting(start: number, end: number, result: RowSpanRun[]): void;
}

/** Capture only compact merged runs; builders and borrowed row data are not retained. */
function makeRunStore(
  columnId: string,
  starts: number[],
  ends: number[],
  tops: number[],
  heights: number[],
  ownerIds: string[],
  regionIds: number[],
): RunStore {
  const startValues = Uint32Array.from(starts),
    endValues = Uint32Array.from(ends),
    topValues = Float64Array.from(tops),
    heightValues = Float64Array.from(heights),
    scopeValues = Uint8Array.from(regionIds),
    ids = [...ownerIds];
  const count = startValues.length;
  function record(index: number): RowSpanRun {
    return Object.freeze({
      columnId,
      ownerIndex: startValues[index],
      end: endValues[index],
      span: endValues[index] - startValues[index],
      ownerId: ids[index],
      region: regions[scopeValues[index]],
      top: topValues[index],
      height: heightValues[index],
    });
  }
  return {
    count,
    ownerAt(row) {
      let low = 0,
        high = count;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (startValues[middle] <= row) low = middle + 1;
        else high = middle;
      }
      const index = low - 1;
      return index >= 0 && row < endValues[index] ? record(index) : undefined;
    },
    appendIntersecting(start, end, result) {
      let low = 0,
        high = count;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (endValues[middle] <= start) low = middle + 1;
        else high = middle;
      }
      for (let index = low; index < count && startValues[index] < end; index++)
        result.push(record(index));
    },
  };
}

/**
 * Build runs in current visible/page order. All structure, geometry and resource checks
 * happen before application getters/predicates. Only adjacent eligible leaf rows join.
 * Default equality is raw Object.is; custom predicates join only on strict true.
 */
export function createRowSpanPlan<T>(
  rows: readonly RowSpanRow<T>[],
  columns: readonly RowSpanColumn<T>[],
  options: RowSpanOptions<T>,
): RowSpanPlan {
  const maxRows = limit(options.maxRows, MAX_ROWS, "maxRows"),
    maxColumns = limit(options.maxColumns, MAX_SPAN_COLUMNS, "maxColumns"),
    maxWork = limit(options.maxWork, MAX_WORK, "maxWork"),
    maxRunRows = limit(options.maxRunRows, MAX_RUN_ROWS, "maxRunRows");
  if (!Array.isArray(rows) || rows.length > maxRows)
    throw new RangeError(`Row span input exceeds the ${maxRows} row limit`);
  if (!Array.isArray(columns) || columns.length > MAX_INPUT_COLUMNS)
    throw new RangeError(
      `Row span column input exceeds the ${MAX_INPUT_COLUMNS} column limit`,
    );
  if (typeof options.getValue !== "function")
    throw new TypeError("Row spans require a getValue function");
  const active: RowSpanColumn<T>[] = [],
    seenColumns = new Set<string>();
  for (let index = 0; index < columns.length; index++) {
    const column = arrayValue(columns, index, "Row span columns");
    if (
      !column ||
      typeof column !== "object" ||
      typeof column.id !== "string" ||
      !column.id ||
      seenColumns.has(column.id)
    )
      throw new TypeError("Row span columns require unique nonempty IDs");
    seenColumns.add(column.id);
    if (
      column.spanRows !== undefined &&
      typeof column.spanRows !== "boolean" &&
      typeof column.spanRows !== "function"
    )
      throw new TypeError("Column spanRows must be a boolean or function");
    if (column.spanRows === true || typeof column.spanRows === "function")
      active.push(column);
  }
  if (active.length > maxColumns)
    throw new RangeError(
      `Row spans support at most ${maxColumns} active columns`,
    );
  if (rows.length * active.length > maxWork)
    throw new RangeError(
      `Row span work exceeds the ${maxWork} row-column limit`,
    );

  const count = rows.length,
    ids: string[] = [],
    data: (T | undefined)[] = [],
    tops = new Float64Array(count),
    heights = new Float64Array(count),
    depths = new Float64Array(count),
    scopes = new Uint8Array(count),
    eligible = new Uint8Array(count),
    contiguous = new Uint8Array(count),
    seenRows = new Set<string>();
  let previousScope = 0,
    previousBottom = 0;
  for (let index = 0; index < count; index++) {
    const row = arrayValue(rows, index, "Row span rows");
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      !row.id ||
      seenRows.has(row.id)
    )
      throw new TypeError("Row spans require unique nonempty row IDs");
    seenRows.add(row.id);
    if (row.kind !== "row" && row.kind !== "group")
      throw new TypeError("Row span kind must be row or group");
    const scope = regions.indexOf(row.region);
    if (scope < 0 || scope < previousScope)
      throw new TypeError(
        "Row span regions must follow top, body, bottom order",
      );
    const depth = row.depth ?? 0,
      detail = row.detailHeight ?? 0;
    if (!Number.isSafeInteger(depth) || depth < 0)
      throw new RangeError("Row span depth must be a nonnegative safe integer");
    if (
      !dimension(row.top) ||
      !dimension(row.height) ||
      row.height <= 0 ||
      !dimension(detail)
    )
      throw new RangeError(
        "Row span geometry must use finite safe positive heights and nonnegative offsets/details",
      );
    const bottom = row.top + row.height + detail;
    if (
      !dimension(bottom) ||
      bottom <= row.top ||
      row.top + row.height <= row.top
    )
      throw new RangeError(
        "Row span geometry produces an unsafe or collapsed interval",
      );
    if (index > 0 && scope === previousScope && row.top < previousBottom)
      throw new RangeError("Row span geometry cannot overlap within a region");
    for (const flag of [row.leaf, row.fullWidth])
      if (flag !== undefined && typeof flag !== "boolean")
        throw new TypeError("Row span leaf/fullWidth flags must be boolean");
    ids.push(row.id);
    data.push(row.data);
    tops[index] = row.top;
    heights[index] = row.height;
    depths[index] = depth;
    scopes[index] = scope;
    eligible[index] = Number(
      row.kind === "row" &&
        row.data !== undefined &&
        row.leaf !== false &&
        !row.fullWidth &&
        detail === 0,
    );
    contiguous[index] = Number(
      index > 0 &&
        scope === previousScope &&
        row.top === previousBottom &&
        depth === depths[index - 1],
    );
    previousScope = scope;
    previousBottom = bottom;
  }

  const stores = new Map<string, RunStore>();
  let mergedRunCount = 0;
  for (const column of active) {
    const starts: number[] = [],
      ends: number[] = [],
      runTops: number[] = [],
      runHeights: number[] = [],
      ownerIds: string[] = [],
      runScopes: number[] = [];
    const custom =
      typeof column.spanRows === "function" ? column.spanRows : undefined;
    let start = -1,
      height = 0,
      previousValue: unknown;
    function flush(end: number) {
      if (start >= 0 && end - start > 1) {
        starts.push(start);
        ends.push(end);
        runTops.push(tops[start]);
        runHeights.push(height);
        ownerIds.push(ids[start]);
        runScopes.push(scopes[start]);
      }
      start = -1;
      height = 0;
    }
    for (let index = 0; index < count; index++) {
      if (!eligible[index]) {
        flush(index);
        previousValue = undefined;
        continue;
      }
      const value = custom
        ? undefined
        : options.getValue(data[index]!, column.id);
      const join =
        start >= 0 &&
        contiguous[index] &&
        eligible[index - 1] &&
        index - start < maxRunRows &&
        (custom
          ? custom(data[index - 1]!, data[index]!) === true
          : Object.is(previousValue, value));
      if (!join) {
        flush(index);
        start = index;
      }
      height += heights[index];
      previousValue = value;
    }
    flush(count);
    const store = makeRunStore(
      column.id,
      starts,
      ends,
      runTops,
      runHeights,
      ownerIds,
      runScopes,
    );
    stores.set(column.id, store);
    mergedRunCount += store.count;
  }

  return Object.freeze({
    rowCount: count,
    columnIds: Object.freeze([...stores.keys()]),
    mergedRunCount,
    ownerAt(rowIndex: number, columnId: string) {
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= count)
        return;
      return stores.get(columnId)?.ownerAt(rowIndex);
    },
    intersecting(start: number, end: number, columnIds?: readonly string[]) {
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        end > count
      )
        throw new RangeError(
          "Row span window must be a valid half-open row interval",
        );
      if (
        columnIds !== undefined &&
        (!Array.isArray(columnIds) || columnIds.length > MAX_INPUT_COLUMNS)
      )
        throw new RangeError(
          "Row span window column request exceeds its limit",
        );
      if (start === end) return emptyRuns;
      const selected = columnIds === undefined ? undefined : new Set(columnIds),
        result: RowSpanRun[] = [];
      for (const [columnId, store] of stores)
        if (!selected || selected.has(columnId))
          store.appendIntersecting(start, end, result);
      return Object.freeze(result);
    },
  });
}
