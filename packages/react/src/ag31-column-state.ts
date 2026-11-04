import type {
  Aggregate,
  Column,
  GridModel,
  GridState,
  Pin,
} from "@opengrid/core";

/** Serialized column layout used by the AG 31 consumer boundary. Callback aggregations need a separate adapter. */
export interface Ag31ColumnState {
  colId: string;
  hide?: boolean | null;
  width?: number | null;
  flex?: number | null;
  pinned?: Pin | boolean;
  sort?: "asc" | "desc" | null;
  sortIndex?: number | null;
  rowGroup?: boolean | null;
  rowGroupIndex?: number | null;
  pivot?: boolean | null;
  pivotIndex?: number | null;
  aggFunc?: Exclude<Aggregate, Function> | null;
}
export interface Ag31ColumnStateParams {
  state?: readonly Ag31ColumnState[];
  defaultState?: Omit<Ag31ColumnState, "colId">;
  applyOrder?: boolean;
}
type Layout = Pick<
  GridState,
  | "columnOrder"
  | "columnWidths"
  | "columnVisibility"
  | "columnPinning"
  | "sorting"
  | "groupBy"
>;
export interface Ag31ColumnStatePlan<T> {
  readonly definitions: readonly Column<T>[];
  readonly layout: Layout;
  readonly unknownColumnIds: readonly string[];
}
const operations = new Set(["sum", "avg", "min", "max", "count"]);
const permitted = new Set([
  "colId",
  "hide",
  "width",
  "flex",
  "pinned",
  "sort",
  "sortIndex",
  "rowGroup",
  "rowGroupIndex",
  "pivot",
  "pivotIndex",
  "aggFunc",
]);
const own = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
function inspect(
  input: unknown,
  defaults = false,
): asserts input is Ag31ColumnState {
  if (
    !input ||
    typeof input !== "object" ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  )
    throw new TypeError("Column state must contain plain records");
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (
      typeof key !== "string" ||
      !permitted.has(key) ||
      !("value" in descriptor)
    )
      throw new TypeError("Unsupported or accessor column-state property");
  }
  const state = input as Ag31ColumnState;
  if (
    !defaults &&
    (typeof state.colId !== "string" ||
      !state.colId ||
      state.colId.length > 4096)
  )
    throw new TypeError("Column state requires a bounded colId");
  if (defaults && own(state, "colId"))
    throw new TypeError("Default column state cannot specify colId");
  if (state.hide != null && typeof state.hide !== "boolean")
    throw new TypeError("hide must be boolean or null");
  if (state.rowGroup != null && typeof state.rowGroup !== "boolean")
    throw new TypeError("rowGroup must be boolean or null");
  for (const key of ["width", "flex", "sortIndex", "rowGroupIndex"] as const) {
    const value = state[key];
    if (value == null) continue;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      (key.endsWith("Index") && !Number.isSafeInteger(value))
    )
      throw new TypeError(`Invalid column-state ${key}`);
  }
  if (state.sort != null && state.sort !== "asc" && state.sort !== "desc")
    throw new TypeError("Unsupported sort direction");
  if (
    state.pinned != null &&
    !["left", "right", true, false].includes(state.pinned)
  )
    throw new TypeError("Unsupported pin position");
  if (state.aggFunc != null && !operations.has(state.aggFunc))
    throw new TypeError(
      "Callback or named aggregation requires an aggregation adapter",
    );
  if (state.pivot != null && typeof state.pivot !== "boolean")
    throw new TypeError("pivot must be boolean or null");
  if (state.pivot === true || state.pivotIndex != null)
    throw new TypeError("Active pivot state requires the pivot adapter");
}

/** Prepare without changing rows, definitions, layout, selection or data history. */
export function planAg31ColumnState<T>(
  model: GridModel<T>,
  input: Ag31ColumnStateParams,
): Ag31ColumnStatePlan<T> {
  if (
    !input ||
    typeof input !== "object" ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  )
    throw new TypeError("Expected plain column-state options");
  for (const key of Reflect.ownKeys(input))
    if (
      typeof key !== "string" ||
      !["state", "defaultState", "applyOrder"].includes(key) ||
      !("value" in Object.getOwnPropertyDescriptor(input, key)!)
    )
      throw new TypeError("Unsupported or accessor column-state option");
  const entries = input.state ?? [];
  if (
    !Array.isArray(entries) ||
    Object.getPrototypeOf(entries) !== Array.prototype ||
    entries.length > 10000 ||
    Reflect.ownKeys(entries).length !== entries.length + 1
  )
    throw new TypeError("Column state requires a bounded dense ordinary array");
  if (input.applyOrder !== undefined && typeof input.applyOrder !== "boolean")
    throw new TypeError("applyOrder must be boolean");
  if (input.defaultState !== undefined) inspect(input.defaultState, true);
  const explicit = new Map<string, Ag31ColumnState>();
  for (let index = 0; index < entries.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(entries, String(index));
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Column state cannot contain holes or accessors");
    const entry: unknown = descriptor.value;
    inspect(entry);
    if (explicit.has(entry.colId))
      throw new TypeError("Duplicate column-state ID");
    explicit.set(entry.colId, entry);
  }
  const previous = model.getState(),
    definitions = model.getColumnDefinitions();
  const existing = new Set(definitions.map((column) => column.id));
  const unknownColumnIds = [...explicit.keys()].filter(
    (id) => !existing.has(id),
  );
  const widths = { ...previous.columnWidths },
    visibility = { ...previous.columnVisibility },
    pins = { ...previous.columnPinning };
  const oldSort = new Map(
    previous.sorting.map((sort, index) => [
      sort.columnId,
      { direction: sort.direction, index },
    ]),
  );
  const oldGroups = new Map(previous.groupBy.map((id, index) => [id, index]));
  const entryOrder = new Map(
    [...explicit.keys()].map((id, index) => [id, index]),
  );
  const sorts: {
    id: string;
    direction: "asc" | "desc";
    index: number | null;
    order: number;
  }[] = [];
  const groups: { id: string; index: number | null; order: number }[] = [];
  const order = input.applyOrder
      ? [...explicit.keys()].filter((id) => existing.has(id))
      : [],
    ordered = new Set(order);
  for (const id of previous.columnOrder)
    if (!ordered.has(id)) {
      order.push(id);
      ordered.add(id);
    }
  for (const column of definitions)
    if (!ordered.has(column.id)) {
      order.push(column.id);
      ordered.add(column.id);
    }
  const nextDefinitions = definitions.map((column, declaration) => {
    const next = { ...column },
      item = explicit.get(column.id) ?? input.defaultState;
    if (item?.hide !== undefined)
      Object.defineProperty(visibility, column.id, {
        value: item.hide !== true,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    if (item?.pinned !== undefined)
      Object.defineProperty(pins, column.id, {
        value:
          item.pinned === true
            ? "left"
            : item.pinned === false
              ? null
              : item.pinned,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    // Null width is intentionally not a reset command: AG widths are mandatory.
    if (item?.width != null)
      Object.defineProperty(widths, column.id, {
        value: item.width,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    if (item?.flex !== undefined) {
      if (item.flex === null || item.flex === 0) delete next.flex;
      else next.flex = item.flex;
    }
    if (item?.aggFunc !== undefined) {
      if (item.aggFunc === null) delete next.aggregate;
      else next.aggregate = item.aggFunc;
    }
    const old = oldSort.get(column.id),
      direction = item?.sort === undefined ? old?.direction : item.sort;
    if (direction)
      sorts.push({
        id: column.id,
        direction,
        index:
          item?.sortIndex === undefined ? (old?.index ?? null) : item.sortIndex,
        order: declaration,
      });
    let grouped = oldGroups.has(column.id),
      index: number | null = oldGroups.get(column.id) ?? null;
    if (item?.rowGroup !== undefined) grouped = item.rowGroup === true;
    if (item?.rowGroupIndex !== undefined) {
      index = item.rowGroupIndex;
      grouped = index !== null || item.rowGroup === true;
    }
    if (grouped)
      groups.push({
        id: column.id,
        index,
        order:
          entryOrder.get(column.id) ?? explicit.size + order.indexOf(column.id),
      });
    return next;
  });
  const ranked = <V extends { index: number | null; order: number }>(
    values: V[],
  ) =>
    values.sort((a, b) =>
      a.index === null
        ? b.index === null
          ? a.order - b.order
          : 1
        : b.index === null
          ? -1
          : a.index - b.index || a.order - b.order,
    );
  return {
    definitions: nextDefinitions,
    layout: {
      columnOrder: order,
      columnWidths: widths,
      columnVisibility: visibility,
      columnPinning: pins,
      sorting: ranked(sorts).map((item) => ({
        columnId: item.id,
        direction: item.direction,
      })),
      groupBy: ranked(groups).map((item) => item.id),
    },
    unknownColumnIds,
  };
}

/** Apply known columns even if stale persisted IDs are absent, returning false for that condition. */
export function applyAg31ColumnState<T>(
  model: GridModel<T>,
  input: Ag31ColumnStateParams,
): boolean {
  const plan = planAg31ColumnState(model, input);
  const before = model.getColumnDefinitions();
  if (
    plan.definitions.some(
      (column, index) =>
        column.flex !== before[index].flex ||
        column.aggregate !== before[index].aggregate,
    )
  )
    model.setColumns(plan.definitions);
  model.setState(plan.layout);
  return plan.unknownColumnIds.length === 0;
}
