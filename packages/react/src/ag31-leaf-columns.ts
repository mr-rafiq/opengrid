import type { Column, GridModel, Pin } from "@opengrid/core";
import type { Ag31RowNode } from "./ag31-row-nodes.js";

export interface Ag31ColumnDefinition<T> {
  colId?: string;
  field?: string;
  headerName?: string;
  children?: readonly Ag31ColumnDefinition<T>[];
  editable?: boolean | ((params: Ag31ColumnCellParams<T>) => unknown);
  aggFunc?: unknown;
  [key: string]: unknown;
}
export interface Ag31ColumnCellParams<T> {
  api: object;
  columnApi?: object;
  context?: unknown;
  column: Ag31LeafColumn<T>;
  colDef: Ag31ColumnDefinition<T>;
  data: T | undefined;
  node: Ag31RowNode<T>;
}
export interface Ag31ColumnEvent<T> {
  type: string;
  column: Ag31LeafColumn<T>;
  columns: Ag31LeafColumn<T>[];
  source: string;
  api: object;
  columnApi?: object;
  context?: unknown;
}
export type Ag31ColumnListener<T> = (event: Ag31ColumnEvent<T>) => void;
export interface Ag31LeafColumn<T> {
  readonly colId: string;
  readonly actualWidth: number;
  getColId(): string;
  getId(): string;
  getColDef(): Ag31ColumnDefinition<T>;
  getUserProvidedColDef(): Ag31ColumnDefinition<T>;
  getActualWidth(): number;
  isVisible(): boolean;
  isPinned(): boolean;
  getPinned(): Pin;
  isRowGroupActive(): boolean;
  isValueActive(): boolean;
  getAggFunc(): unknown;
  isFilterActive(): boolean;
  getSort(): "asc" | "desc" | undefined;
  getSortIndex(): number | undefined;
  isSortAscending(): boolean;
  isSortDescending(): boolean;
  isPrimary(): boolean;
  isCellEditable(node: Ag31RowNode<T>): boolean;
  addEventListener(type: string, listener: Ag31ColumnListener<T>): void;
  removeEventListener(type: string, listener: Ag31ColumnListener<T>): void;
}
export interface Ag31LeafColumnsOptions<T> {
  model: GridModel<T>;
  definitions: readonly Ag31ColumnDefinition<T>[];
  defaultColDef?: Ag31ColumnDefinition<T>;
  commonParams(): { api: object; columnApi?: object; context?: unknown };
  ownsNode(node: Ag31RowNode<T>): boolean;
  renderedWidth?(columnId: string): number | undefined;
  eventSource?(): string;
  sourceFilterActive?(columnId: string): boolean;
  sourceColumnDisplayed?(columnId: string): boolean;
}
type Entry<T> = {
  id: string;
  provided: Ag31ColumnDefinition<T>;
  definition: Ag31ColumnDefinition<T>;
  column: Ag31LeafColumn<T>;
  width: number;
  listeners: Map<string, Set<Ag31ColumnListener<T>>>;
  localSortIndex?: { value: number | undefined };
};
/** Original leaf-column objects. Structural schema compilation is a separate boundary. */
export function createAg31LeafColumns<T>(options: Ag31LeafColumnsOptions<T>) {
  const { model } = options;
  const revision = model.getColumnRevision();
  let active = true;
  const byId = new Map<string, Entry<T>>(),
    byObject = new WeakMap<object, Entry<T>>();
  function assertSchema() {
    if (active && model.getColumnRevision() !== revision)
      throw new Error(
        "Column definitions changed; compile and bind a matching column registry",
      );
  }
  function native(id: string): Column<T> | undefined {
    if (!active) return;
    assertSchema();
    return model.getColumns().find((column) => column.id === id);
  }
  function merge(provided: Ag31ColumnDefinition<T>): Ag31ColumnDefinition<T> {
    const result: Ag31ColumnDefinition<T> = {};
    for (const source of [options.defaultColDef ?? {}, provided])
      for (const [key, value] of Object.entries(source))
        if (value !== undefined)
          Object.defineProperty(result, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
    if (
      result.cellDataType === "boolean" &&
      result.valueFormatter === undefined
    )
      result.valueFormatter = (
        params: Ag31ColumnCellParams<T> & { value?: unknown },
      ) =>
        params.node.group
          ? undefined
          : params.value == null
            ? ""
            : String(params.value);
    return result;
  }
  const initial = model.getColumns();
  for (const provided of options.definitions) {
    if (provided.children !== undefined)
      throw new TypeError("The leaf registry requires flattened definitions");
    const definition = merge(provided),
      id = definition.colId ?? definition.field;
    if (typeof id !== "string" || !id || byId.has(id))
      throw new TypeError(
        "Explicit unique leaf column IDs or fields are required",
      );
    const source = initial.find((column) => column.id === id);
    if (!source)
      throw new TypeError("A column definition has no native model column");
    let entry: Entry<T>;
    function width() {
      const source = native(id!);
      if (!source) return entry.width;
      const rendered = options.renderedWidth?.(id!);
      entry.width =
        typeof rendered === "number" &&
        Number.isFinite(rendered) &&
        rendered > 0
          ? rendered
          : source.width!;
      return entry.width;
    }
    function sort() {
      return active
        ? (assertSchema(),
          model.getState().sorting.find((item) => item.columnId === id)
            ?.direction ?? undefined)
        : undefined;
    }
    const column: Ag31LeafColumn<T> = {
      colId: id,
      get actualWidth() {
        return width();
      },
      getColId: () => id,
      getId: () => id,
      getColDef: () => entry.definition,
      getUserProvidedColDef: () => entry.provided,
      getActualWidth: width,
      isVisible: () => {
        const source = native(id!);
        return !!source && !source.hidden;
      },
      getPinned: () => native(id!)?.pinned ?? null,
      isPinned: () => !!native(id!)?.pinned,
      isRowGroupActive: () =>
        active
          ? (assertSchema(), model.getState().groupBy.includes(id!))
          : false,
      isValueActive: () => active && entry.definition.aggFunc != null,
      getAggFunc: () => entry.definition.aggFunc ?? null,
      isFilterActive: () =>
        active
          ? (assertSchema(),
            options.sourceFilterActive?.(id!) === true ||
              Object.hasOwn(model.getState().filters, id!))
          : false,
      getSort: sort,
      getSortIndex: () => {
        if (!active) return undefined;
        if (entry.localSortIndex) return entry.localSortIndex.value;
        assertSchema();
        const index = model
          .getState()
          .sorting.findIndex((item) => item.columnId === id);
        return index < 0 ? undefined : index;
      },
      isSortAscending: () => sort() === "asc",
      isSortDescending: () => sort() === "desc",
      isPrimary: () => true,
      addEventListener(type, listener) {
        if (typeof type !== "string" || !type || typeof listener !== "function")
          throw new TypeError("A column event type and listener are required");
        if (!active) return;
        let listeners = entry.listeners.get(type);
        if (!listeners) entry.listeners.set(type, (listeners = new Set()));
        listeners.add(listener);
      },
      removeEventListener(type, listener) {
        const listeners = entry.listeners.get(type);
        listeners?.delete(listener);
        if (!listeners?.size) entry.listeners.delete(type);
      },
      isCellEditable(node) {
        if (
          !active ||
          !native(id!) ||
          model.isReadOnly() ||
          !options.ownsNode(node)
        )
          return false;
        const policy = entry.definition.editable;
        if (typeof policy !== "function") return policy === true;
        try {
          return (
            policy({
              ...options.commonParams(),
              column,
              colDef: entry.definition,
              data: node.data,
              node,
            }) === true
          );
        } catch {
          return false;
        }
      },
    };
    entry = {
      id,
      provided,
      definition,
      column,
      width: source.width!,
      listeners: new Map(),
    };
    byId.set(id, entry);
    byObject.set(column, entry);
    byObject.set(definition, entry);
  }
  if (byId.size !== initial.length)
    throw new TypeError("Every native model column needs an owned definition");
  let previousSorting = model.getState().sorting;
  const unsubscribe = model.subscribe(() => {
    const next = model.getState().sorting,
      before = previousSorting;
    previousSorting = next;
    if (!active || model.getColumnRevision() !== revision) return;
    for (const entry of byId.values()) {
      const oldIndex = before.findIndex((sort) => sort.columnId === entry.id),
        index = next.findIndex((sort) => sort.columnId === entry.id);
      if (before[oldIndex]?.direction === next[index]?.direction) continue;
      const listeners = [...(entry.listeners.get("sortChanged") ?? [])];
      if (!listeners.length) continue;
      const previousOverride = entry.localSortIndex;
      entry.localSortIndex = { value: oldIndex < 0 ? undefined : oldIndex };
      const event = {
        ...options.commonParams(),
        type: "sortChanged",
        column: entry.column,
        columns: [entry.column],
        source: options.eventSource?.() ?? "api",
      };
      try {
        for (const listener of listeners) listener(event);
      } finally {
        entry.localSortIndex = previousOverride;
      }
    }
  });
  function getColumn(key: unknown): Ag31LeafColumn<T> | null {
    if (!active) return null;
    assertSchema();
    const entry =
      typeof key === "string"
        ? byId.get(key)
        : key && typeof key === "object"
          ? byObject.get(key)
          : undefined;
    return entry?.column ?? null;
  }
  function columns() {
    if (!active) return [];
    assertSchema();
    return Array.from(byId.values(), (entry) => entry.column);
  }
  return Object.freeze({
    getColumn,
    getColumns: columns,
    getAllDisplayedColumns() {
      if (!active) return [];
      assertSchema();
      const visible = model
        .getColumns()
        .filter(
          (column) =>
            !column.hidden &&
            (options.sourceColumnDisplayed?.(column.id) ?? true),
        );
      return ["left", null, "right"].flatMap((pin) =>
        visible
          .filter((column) => (column.pinned ?? null) === pin)
          .map((column) => byId.get(column.id)!.column),
      );
    },
    destroy() {
      if (!active) return;
      active = false;
      unsubscribe();
      for (const entry of byId.values()) entry.listeners.clear();
    },
    isDestroyed: () => !active,
  });
}
