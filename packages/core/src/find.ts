import type { GridModel } from "./types.js";
import type { CellPosition } from "./ranges.js";

export interface FindOptions {
  getRowIds?: () => string[];
  /** Ordered visible view subset; overrides includeHidden when supplied. */
  getColumnIds?: () => readonly string[];
  includeHidden?: boolean;
  caseSensitive?: boolean;
  /** Skip covered/presentation-only cells before evaluating their value getters. */
  isCellSearchable?: (position: CellPosition) => boolean;
}
export interface FindSnapshot {
  readonly query: string;
  readonly matches: readonly CellPosition[];
  readonly activeIndex: number;
}
export interface FindModel {
  getSnapshot(): FindSnapshot;
  subscribe(listener: () => void): () => void;
  setQuery(query: string): void;
  next(): CellPosition | undefined;
  previous(): CellPosition | undefined;
  select(index: number): CellPosition | undefined;
  refresh(): void;
  dispose(): void;
}

function freezeSnapshot(
  query: string,
  matches: readonly CellPosition[],
  activeIndex: number,
): FindSnapshot {
  return Object.freeze({
    query,
    matches: Object.isFrozen(matches)
      ? matches
      : Object.freeze(matches.map((match) => Object.freeze({ ...match }))),
    activeIndex,
  });
}
const cellKey = (cell: CellPosition) =>
  JSON.stringify([cell.rowId, cell.columnId]);

/** Literal, formatted-value Find. It changes the active match, never grid filtering or row data. */
export function createFindModel<T>(
  grid: GridModel<T>,
  options: FindOptions = {},
): FindModel {
  if (
    options.getColumnIds !== undefined &&
    typeof options.getColumnIds !== "function"
  )
    throw new TypeError("Find getColumnIds must be a function");
  if (
    options.isCellSearchable !== undefined &&
    typeof options.isCellSearchable !== "function"
  )
    throw new TypeError("Find isCellSearchable must be a function");
  function viewColumns() {
    const available = grid.getColumns();
    if (!options.getColumnIds)
      return available.filter(
        (column) => options.includeHidden || !column.hidden,
      );
    const supplied = options.getColumnIds();
    if (!Array.isArray(supplied))
      throw new TypeError("Find getColumnIds must return an array");
    const visible = available.filter((column) => !column.hidden);
    const byId = new Map(visible.map((column) => [column.id, column]));
    if (
      supplied.length > visible.length ||
      new Set(supplied).size !== supplied.length ||
      supplied.some((id) => typeof id !== "string" || !byId.has(id))
    )
      throw new Error(
        "Find view column IDs must be unique, existing and visible",
      );
    return supplied.map((id) => byId.get(id)!);
  }
  if (options.getColumnIds) viewColumns();
  let snapshot = freezeSnapshot("", [], -1),
    observedState = grid.getState(),
    disposed = false;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  function publish(
    query: string,
    matches: readonly CellPosition[],
    activeIndex: number,
  ) {
    if (
      snapshot.query === query &&
      snapshot.activeIndex === activeIndex &&
      snapshot.matches.length === matches.length &&
      snapshot.matches.every(
        (match, index) => cellKey(match) === cellKey(matches[index]),
      )
    )
      return;
    snapshot = freezeSnapshot(query, matches, activeIndex);
    for (const listener of [...listeners]) listener();
  }
  function compute(query: string, resetActive = false) {
    if (disposed) return;
    const nextState = grid.getState();
    const columns = viewColumns();
    if (!query) {
      observedState = nextState;
      publish("", [], -1);
      return;
    }
    const allNodes = grid
      .getRowModel()
      .filter((node) => node.kind === "row" && node.data !== undefined);
    const data = new Map(allNodes.map((node) => [node.id, node.data!]));
    const ids = [
      ...new Set(
        options.getRowIds
          ? options.getRowIds()
          : allNodes.map((node) => node.id),
      ),
    ].filter((id) => data.has(id));
    const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
    const matches: CellPosition[] = [];
    for (const rowId of ids)
      for (const column of columns) {
        const position = { rowId, columnId: column.id };
        if (
          options.isCellSearchable &&
          !options.isCellSearchable(Object.freeze(position))
        )
          continue;
        const row = data.get(rowId)!;
        const value = grid.getValue(row, column.id);
        const formatted = column.valueFormatter
          ? column.valueFormatter(value, row)
          : value == null
            ? ""
            : String(value);
        const haystack = options.caseSensitive
          ? String(formatted)
          : String(formatted).toLocaleLowerCase();
        if (haystack.includes(needle)) matches.push(position);
      }
    const active = resetActive
      ? undefined
      : snapshot.matches[snapshot.activeIndex];
    const retained = active
      ? matches.findIndex((match) => cellKey(match) === cellKey(active))
      : -1;
    observedState = nextState;
    publish(query, matches, matches.length ? Math.max(0, retained) : -1);
  }
  function refresh() {
    compute(snapshot.query);
  }
  function ensureFresh() {
    if (observedState !== grid.getState()) refresh();
  }
  function select(index: number) {
    ensureFresh();
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= snapshot.matches.length
    )
      throw new RangeError("Find match index is out of bounds");
    publish(snapshot.query, snapshot.matches, index);
    return snapshot.matches[index];
  }
  return {
    getSnapshot() {
      ensureFresh();
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      if (!unsubscribe) unsubscribe = grid.subscribe(refresh);
      ensureFresh();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribe?.();
          unsubscribe = undefined;
        }
      };
    },
    setQuery(query) {
      if (typeof query !== "string")
        throw new TypeError("Find query must be a string");
      if (query.length > 10000)
        throw new RangeError("Find query exceeds 10,000 characters");
      if (disposed) return;
      compute(query, query !== snapshot.query);
    },
    next() {
      ensureFresh();
      return snapshot.matches.length
        ? select((snapshot.activeIndex + 1) % snapshot.matches.length)
        : undefined;
    },
    previous() {
      ensureFresh();
      return snapshot.matches.length
        ? select(
            (snapshot.activeIndex - 1 + snapshot.matches.length) %
              snapshot.matches.length,
          )
        : undefined;
    },
    select,
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      listeners.clear();
    },
  };
}
