import { ag31DeclaredQuery } from "./ag31-column-defaults.js";
import {
  createAg31ColumnGroups,
  type Ag31ColumnGroupState,
} from "./ag31-column-groups.js";
import {
  createGrid,
  HIERARCHY_SELECTION_LIMITS,
  type GridState,
} from "@opengrid/core";
import {
  createAg31ValueColumns,
  type Ag31GetCellValueParams,
} from "./ag31-value-columns.js";
import {
  createAg31LeafColumns,
  type Ag31ColumnDefinition,
} from "./ag31-leaf-columns.js";
import { createAg31RowNodes, type Ag31RowNode } from "./ag31-row-nodes.js";
import { createAg31EventHub, type Ag31Event } from "./ag31-events.js";
import {
  compileAg31ColumnFilter,
  canonicalizeAg31SetFilter,
  normalizeAg31ColumnFilterModel,
  type Ag31FilterModel,
} from "./ag31-filter-models.js";
import {
  planAg31ColumnState,
  type Ag31ColumnStateParams,
} from "./ag31-column-state.js";

export interface Ag31RowTransaction<T> {
  add?: T[];
  update?: T[];
  remove?: T[];
}
export const AG31_EVENT_OPTIONS = [
  ["onGridReady", "gridReady"],
  ["onSortChanged", "sortChanged"],
  ["onFilterChanged", "filterChanged"],
  ["onSelectionChanged", "selectionChanged"],
  ["onModelUpdated", "modelUpdated"],
  ["onRowDataUpdated", "rowDataUpdated"],
  ["onColumnRowGroupChanged", "columnRowGroupChanged"],
] as const;
export type Ag31EventOptionName = (typeof AG31_EVENT_OPTIONS)[number][0];
export const AG31_HEADER_METRICS = [
  "headerHeight",
  "groupHeaderHeight",
  "floatingFiltersHeight",
] as const;
export type Ag31HeaderMetricName = (typeof AG31_HEADER_METRICS)[number];
export function assertAg31HeaderMetric(
  value: unknown,
  name: string,
): asserts value is number | null | undefined {
  if (
    value != null &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 1_000_000)
  )
    throw new RangeError(`Source ${name} must be positive and bounded`);
}
export interface Ag31ClientControllerOptions<T> {
  rows: T[];
  /** Original nullable component option; rows remains the resident projection. */
  rowData?: T[] | null;
  definitions: readonly Ag31ColumnDefinition<T>[];
  defaultColDef?: Ag31ColumnDefinition<T>;
  getRowId(row: T): string;
  context?: unknown;
  rowHeight?: number;
  headerHeight?: number | null;
  groupHeaderHeight?: number | null;
  floatingFiltersHeight?: number | null;
  initialState?: Partial<GridState>;
  readOnly?: boolean;
  groupSelectsFiltered?: boolean;
  callbacks?: Partial<Record<Ag31EventOptionName, unknown>>;
  isExternalFilterPresent?: (() => boolean) | null;
  doesExternalFilterPass?: ((node: Ag31RowNode<T>) => boolean) | null;
  getRowStyle?: unknown;
  writeCell?(
    node: Ag31RowNode<T>,
    column: unknown,
    value: unknown,
    source: string,
  ): boolean;
}
function equal(
  a: unknown,
  b: unknown,
  budget = { left: 50000 },
  depth = 0,
): boolean {
  if (Object.is(a, b)) return true;
  if (
    --budget.left < 0 ||
    depth > 64 ||
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => equal(value, b[i], budget, depth + 1))
    );
  const left = Object.keys(a),
    right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equal(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          budget,
          depth + 1,
        ),
    )
  );
}
/** Internal resident data/API owner. React components, AG filter/state translation and business setters are separate contracts. */
export function createAg31ClientController<T>(
  options: Ag31ClientControllerOptions<T>,
) {
  let destroyed = false;
  let selectionSource = "api";
  let sourceFilters: Ag31FilterModel = {};
  let compiledFilters: { id: string; passes(node: Ag31RowNode<T>): boolean }[] =
    [];
  let filtersApplying = false;
  const api = {} as Record<string, unknown>;
  const columnApi = {} as Record<string, unknown>;
  const settings = new Map<string, unknown>([
    ["context", options.context],
    [
      "rowData",
      Object.hasOwn(options, "rowData") ? options.rowData : options.rows,
    ],
  ]);
  const commonParams = () => ({
    api,
    columnApi,
    context: getGridOption("context"),
  });
  if (options.getRowStyle != null && typeof options.getRowStyle !== "function")
    throw new TypeError(
      "Source getRowStyle must be a function, null or undefined",
    );
  settings.set("getRowStyle", options.getRowStyle);
  for (const name of AG31_HEADER_METRICS) {
    assertAg31HeaderMetric(options[name], name);
    settings.set(name, options[name]);
  }
  for (const name of [
    "isExternalFilterPresent",
    "doesExternalFilterPass",
  ] as const) {
    const callback = options[name];
    if (callback != null && typeof callback !== "function")
      throw new TypeError("External filter callbacks must be functions");
    settings.set(name, callback);
  }
  const optionForEvent = new Map<string, Ag31EventOptionName>();
  const callbackNames = new Set<string>();
  for (const [name, type] of AG31_EVENT_OPTIONS) {
    const callback = options.callbacks?.[name];
    if (callback != null && typeof callback !== "function")
      throw new TypeError(
        `Source ${name} must be a function, null or undefined`,
      );
    settings.set(name, callback);
    optionForEvent.set(type, name);
    callbackNames.add(name);
  }
  const events = createAg31EventHub(commonParams, (event) => {
    const name = optionForEvent.get(event.type),
      callback = name ? settings.get(name) : undefined;
    if (typeof callback === "function") callback(event);
  });
  const lifecycle = new Set<() => void>();
  const viewListeners = new Set<() => void>();
  let viewRevision = 0;
  function refreshCells(_params?: unknown) {
    if (destroyed) return;
    if (viewRevision === Number.MAX_SAFE_INTEGER)
      throw new RangeError("View refresh revision limit reached");
    viewRevision++;
    for (const listener of [...viewListeners]) listener();
  }
  const groups = createAg31ColumnGroups(
    options.definitions,
    () => refreshCells(),
    {
      snapshot: () => model.getState(),
      isVisible: (id) => {
        const visibility = model.getState().columnVisibility;
        return Object.hasOwn(visibility, id)
          ? visibility[id]
          : baseVisibility.get(id) !== false;
      },
    },
  );
  const schema = createAg31ValueColumns({
    definitions: options.definitions,
    defaultColDef: options.defaultColDef,
    getRowId: options.getRowId,
    commonParams,
  });
  const declaredQuery = ag31DeclaredQuery(
    schema.columns,
    schema.leafDefinitions,
    options.defaultColDef,
  );
  const baseVisibility = new Map(
    schema.columns.map((column) => [column.id, !column.hidden]),
  );
  const model = createGrid({
    rows: options.rows,
    columns: schema.columns,
    getRowId: options.getRowId,
    readOnly: options.readOnly ?? !options.writeCell,
    initialState: {
      pageSize: HIERARCHY_SELECTION_LIMITS.maxNodes,
      ...declaredQuery,
      ...options.initialState,
    },
  });
  const nodes = createAg31RowNodes({
    model,
    getRowId: options.getRowId,
    rowHeight: options.rowHeight ?? 42,
    context: () => settings.get("context"),
    groupSelectsFiltered: options.groupSelectsFiltered,
    setSelection,
    groupIdentity: schema.groupIdentity,
    writeCell: (node, column, value, source) => {
      if (destroyed) return false;
      if (!options.writeCell)
        throw new Error(
          "Source business writes require a compiled write handler",
        );
      return options.writeCell(node, column, value, source);
    },
  });
  const columns = createAg31LeafColumns({
    model,
    definitions: schema.leafDefinitions,
    defaultColDef: options.defaultColDef,
    commonParams,
    ownsNode: (node) => nodes.getRowNode(node.id) === node,
    sourceFilterActive: (id) => Object.hasOwn(sourceFilters, id),
    sourceColumnDisplayed: groups.isColumnDisplayed,
    sourceSortIndexes: true,
  });
  schema.bind({ model, nodes, columns });
  const emit = (event: Ag31Event) => events.dispatchEvent(event);
  const modelUpdated = () =>
    emit({
      type: "modelUpdated",
      animate: true,
      keepRenderedRows: true,
      keepUndoRedoStack: undefined,
      newData: undefined,
      newPage: false,
    });
  let previous = model.getState();
  const unsubscribe = model.subscribe(() => {
    if (destroyed) return;
    const next = model.getState(),
      before = previous;
    previous = next;
    if (!filtersApplying) {
      for (const id of Object.keys(next.filters)) {
        if (Object.hasOwn(sourceFilters, id)) {
          const remaining = { ...sourceFilters };
          delete remaining[id];
          sourceFilters = remaining;
        }
      }
    }
    const sorting = !equal(before.sorting, next.sorting),
      grouping = !equal(before.groupBy, next.groupBy),
      filtering =
        !equal(before.filters, next.filters) ||
        !equal(before.advancedFilter, next.advancedFilter) ||
        before.quickFilter !== next.quickFilter;
    if (sorting)
      emit({
        type: "sortChanged",
        source: "api",
        columns: columns.getColumns().filter(
          (c) =>
            !equal(
              before.sorting.find((s) => s.columnId === c.colId),
              next.sorting.find((s) => s.columnId === c.colId),
            ),
        ),
      });
    if (grouping)
      emit({
        type: "columnRowGroupChanged",
        source: "api",
        columns: columns
          .getColumns()
          .filter(
            (c) =>
              before.groupBy.includes(c.colId) !==
              next.groupBy.includes(c.colId),
          ),
      });
    if (filtering && !filtersApplying)
      emit({
        type: "filterChanged",
        source: "api",
        columns: columns
          .getColumns()
          .filter(
            (c) => !equal(before.filters[c.colId], next.filters[c.colId]),
          ),
      });
    if (!equal(before.selected, next.selected))
      emit({ type: "selectionChanged", source: selectionSource });
    if (
      sorting ||
      grouping ||
      filtering ||
      !equal(before.expanded, next.expanded) ||
      before.page !== next.page ||
      before.pageSize !== next.pageSize
    ) {
      if (!filtersApplying) modelUpdated();
    }
  });
  function active<R>(read: () => R): R | undefined {
    return destroyed ? undefined : read();
  }
  function getGridOption(key: string) {
    return active(() => settings.get(key) ?? undefined);
  }
  function setGridOption(key: string, value: unknown) {
    if (destroyed) return;
    if ((AG31_HEADER_METRICS as readonly string[]).includes(key)) {
      assertAg31HeaderMetric(value, key);
      if (Object.is(settings.get(key), value)) return;
      settings.set(key, value);
      refreshCells();
      return;
    }
    if (callbackNames.has(key)) {
      if (value != null && typeof value !== "function")
        throw new TypeError(
          `Source ${key} must be a function, null or undefined`,
        );
      settings.set(key, value);
      return;
    }
    if (key === "context") {
      settings.set(key, value);
      return;
    }
    if (key === "getRowStyle") {
      if (value != null && typeof value !== "function")
        throw new TypeError(
          "Source getRowStyle must be a function, null or undefined",
        );
      if (settings.get(key) === value) return;
      settings.set(key, value);
      refreshCells();
      return;
    }
    if (key === "rowData") {
      if (value !== null && !Array.isArray(value))
        throw new TypeError("rowData must be an array or null");
      const nextRows = (value ?? []) as T[];
      const previousRows = settings.get(key);
      settings.set(key, value);
      try {
        model.setRows(nextRows);
        if (
          Object.values(sourceFilters).some(
            (filter) => filter.filterType === "set",
          )
        )
          setFilterModel(sourceFilters);
      } catch (error) {
        const resident = model.getRows();
        if (
          resident.length !== nextRows.length ||
          resident.some((row, index) => row !== nextRows[index])
        )
          settings.set(key, previousRows);
        throw error;
      }
      emit({ type: "rowDataUpdated" });
      modelUpdated();
      return;
    }
    if (key === "isExternalFilterPresent" || key === "doesExternalFilterPass") {
      if (value != null && typeof value !== "function")
        throw new TypeError("External filter callbacks must be functions");
      if (settings.get(key) === value) return;
      settings.set(key, value);
      onFilterChanged();
      return;
    }
    throw new TypeError(
      `Grid option ${key} requires an implemented compatibility contract`,
    );
  }
  function queryPredicate() {
    const present = settings.get("isExternalFilterPresent") as
      (() => boolean) | undefined;
    const predicate = settings.get("doesExternalFilterPass") as
      ((node: Ag31RowNode<T>) => boolean) | undefined;
    const isPresent = present?.() === true;
    const filters = compiledFilters;
    if (!isPresent && !Object.keys(sourceFilters).length) return undefined;
    return (row: T) => {
      const node = nodes.getRowNode(options.getRowId(row))!;
      if (isPresent && !(predicate?.(node) ?? false)) return false;
      return filters.every(
        ({ id, passes }) =>
          !Object.hasOwn(sourceFilters, id) ||
          Object.hasOwn(model.getState().filters, id) ||
          passes(node),
      );
    };
  }
  function getFilterModel() {
    return active(() => {
      if (Object.keys(model.getState().filters).length)
        throw new TypeError(
          "Native condition serialization requires the source filter UI adapter",
        );
      return Object.fromEntries(
        Object.entries(sourceFilters).map(([id, filter]) => [
          id,
          normalizeAg31ColumnFilterModel(filter),
        ]),
      );
    });
  }
  function setFilterModel(input: unknown) {
    if (destroyed) return;
    const next: Ag31FilterModel = {};
    const compiled: { id: string; passes(node: Ag31RowNode<T>): boolean }[] =
      [];
    let sourceLeaves: Ag31RowNode<T>[] | undefined;
    if (input != null) {
      if (
        typeof input !== "object" ||
        Array.isArray(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
        Reflect.ownKeys(input).length > 1000
      )
        throw new TypeError(
          "Source filter models require a bounded plain column record",
        );
      let keys = 0;
      for (const id of Reflect.ownKeys(input)) {
        if (typeof id !== "string" || !id || id.length > 4096)
          throw new TypeError("Source filter column IDs must be bounded text");
        const descriptor = Object.getOwnPropertyDescriptor(input, id)!;
        if (!("value" in descriptor))
          throw new TypeError("Source filter model accessors are unsupported");
        const column = columns.getColumn(id),
          definition = column?.getColDef();
        if (
          !column ||
          definition?.filter == null ||
          definition.filter === false ||
          descriptor.value == null
        )
          continue;
        if (typeof definition.filter === "function")
          throw new TypeError(
            "Custom source filter components require their registered hook adapter",
          );
        let filter = normalizeAg31ColumnFilterModel(descriptor.value);
        if (filter.filterType === "set") keys += filter.values.length;
        if (keys > 50000)
          throw new RangeError("Source filter key budget exceeded");
        if ("conditions" in filter && filter.conditions.length !== 2)
          throw new TypeError(
            "Source combined models currently require the measured two-condition contract",
          );
        const params = definition.filterParams;
        if (
          params != null &&
          (typeof params !== "object" || Array.isArray(params))
        )
          throw new TypeError(
            "Dynamic source filter parameters require a separate adapter",
          );
        const sourceColumn = {
          read: (node: Ag31RowNode<T>) => schema.readFilter(node, column),
          key: (value: unknown, node: Ag31RowNode<T>) =>
            schema.filterKey(node, column, value),
          params: (params ?? {}) as Readonly<Record<string, unknown>>,
        };
        if (filter.filterType === "set") {
          if (!sourceLeaves) {
            sourceLeaves = [];
            nodes.forEachLeafNode((node) => sourceLeaves!.push(node));
          }
          const canonical = canonicalizeAg31SetFilter(
            filter,
            sourceColumn,
            sourceLeaves,
          );
          if (!canonical) continue;
          filter = canonical;
        }
        Object.defineProperty(next, id, {
          value: filter,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        compiled.push({
          id,
          passes: compileAg31ColumnFilter(filter, sourceColumn),
        });
      }
    }
    if (
      equal(sourceFilters, next) &&
      !Object.keys(model.getState().filters).length
    )
      return;
    const before = sourceFilters,
      beforeCompiled = compiledFilters;
    const changed = columns
      .getColumns()
      .filter(
        (column) =>
          !equal(before[column.colId], next[column.colId]) ||
          Object.hasOwn(model.getState().filters, column.colId),
      );
    sourceFilters = next;
    compiledFilters = compiled;
    filtersApplying = true;
    try {
      model.setExternalFilter(queryPredicate(), { columnFilters: {} });
    } catch (error) {
      sourceFilters = before;
      compiledFilters = beforeCompiled;
      throw error;
    } finally {
      filtersApplying = false;
    }
    emit({ type: "filterChanged", source: "api", columns: changed });
    modelUpdated();
  }
  function onFilterChanged() {
    if (destroyed) return;
    model.setExternalFilter(queryPredicate());
    emit({ type: "filterChanged", source: "api", columns: [] });
    modelUpdated();
  }
  function applyTransaction(transaction: Ag31RowTransaction<T>) {
    if (destroyed) return;
    const lists = [
      transaction.add ?? [],
      transaction.update ?? [],
      transaction.remove ?? [],
    ];
    if (
      Object.keys(transaction).some(
        (key) => !["add", "update", "remove"].includes(key),
      ) ||
      lists.some((list) => !Array.isArray(list))
    )
      throw new TypeError(
        "Only add/update/remove row arrays are compiled for transactions",
      );
    const targets = new Set<string>();
    for (const list of lists)
      for (const row of list) {
        const id = options.getRowId(row);
        if (targets.has(id))
          throw new TypeError(
            "Overlapping transaction IDs require a separate compatibility contract",
          );
        targets.add(id);
      }
    const remove = (transaction.remove ?? [])
      .map((row) => nodes.getRowNode(options.getRowId(row)))
      .filter((node): node is Ag31RowNode<T> => !!node && !node.group);
    const update = (transaction.update ?? []).filter(
      (row) => !!model.getRow(options.getRowId(row)),
    );
    const add = transaction.add ?? [];
    model.applyTransaction({
      remove: remove.map((node) => node.id),
      update,
      add,
    });
    if (
      Object.values(sourceFilters).some((filter) => filter.filterType === "set")
    )
      setFilterModel(sourceFilters);
    emit({ type: "rowDataUpdated" });
    modelUpdated();
    return {
      remove,
      update: update.map((row) => nodes.getRowNode(options.getRowId(row))!),
      add: add.map((row) => nodes.getRowNode(options.getRowId(row))!),
    };
  }
  function setRowNodeExpanded(
    node: Ag31RowNode<T>,
    expanded: boolean,
    expandParents = false,
  ) {
    if (destroyed) return;
    if (nodes.getRowNode(node.id) !== node)
      throw new TypeError("An owned source node is required");
    if (expandParents) {
      const ancestors: Ag31RowNode<T>[] = [];
      let parent = node.parent;
      while (parent && parent.level >= 0) {
        ancestors.unshift(parent);
        parent = parent.parent;
      }
      for (const ancestor of ancestors) ancestor.setExpanded(true);
    }
    node.setExpanded(expanded);
  }
  function applyColumnState(params: Ag31ColumnStateParams) {
    if (destroyed) return;
    const plan = planAg31ColumnState(model, params, columns.getSortIndexes()),
      before = model.getColumnDefinitions();
    if (
      plan.definitions.some(
        (c, i) =>
          c.flex !== before[i].flex || c.aggregate !== before[i].aggregate,
      )
    )
      throw new TypeError(
        "Flex/aggregate changes require a matching column registry contract",
      );
    const patch: Partial<GridState> = { ...plan.layout };
    const requested = [
      ...(params.state ?? []),
      ...(params.defaultState ? [params.defaultState] : []),
    ];
    const has = (keys: string[]) =>
      requested.some((record) =>
        keys.some(
          (key) =>
            Object.getOwnPropertyDescriptor(record, key)?.value !== undefined,
        ),
      );
    if (
      !has(["sort", "sortIndex"]) ||
      equal(model.getState().sorting, plan.layout.sorting)
    )
      delete patch.sorting;
    if (
      !has(["rowGroup", "rowGroupIndex"]) ||
      equal(model.getState().groupBy, plan.layout.groupBy)
    )
      delete patch.groupBy;
    columns.withSortIndexes(params, () => model.setState(patch));
    return plan.unknownColumnIds.length === 0;
  }
  function resetColumnState() {
    if (destroyed) return;
    applyColumnState({
      applyOrder: true,
      state: schema.columns.map((column) => {
        const definition = columns.getColumn(column.id)!.getColDef();
        const regular = (name: string) =>
          definition[name] ??
          definition["initial" + name[0].toUpperCase() + name.slice(1)] ??
          null;
        return {
          colId: column.id,
          width: regular("width"),
          hide: regular("hide"),
          pinned: (() => {
            const pin = regular("pinned");
            return pin === true
              ? "left"
              : pin === "left" || pin === "right"
                ? pin
                : null;
          })(),
          sort: regular("sort"),
          sortIndex: regular("sortIndex"),
          rowGroup: regular("rowGroup"),
          rowGroupIndex: regular("rowGroupIndex"),
        };
      }) as Ag31ColumnStateParams["state"],
    });
  }
  function getColumnState() {
    return active(() => {
      const state = model.getState();
      const definitions = new Map(
        model.getColumns().map((column) => [column.id, column]),
      );
      return state.columnOrder.map((id) => {
        const definition = definitions.get(id)!;
        const column = columns.getColumn(definition.id)!;
        if (column.getAggFunc() != null)
          throw new TypeError(
            "Aggregate snapshots require an implemented aggregation registry contract",
          );
        return {
          colId: column.colId,
          width: column.getActualWidth(),
          hide: !column.isVisible(),
          pinned: column.getPinned(),
          sort: column.getSort() ?? null,
          sortIndex: column.getSortIndex() ?? null,
          aggFunc: null,
          rowGroup: column.isRowGroupActive(),
          rowGroupIndex: state.groupBy.includes(column.colId)
            ? state.groupBy.indexOf(column.colId)
            : null,
          pivot: false,
          pivotIndex: null,
          flex: definition.flex ?? null,
        };
      });
    });
  }
  function refreshClientSideRowModel(
    stage: "everything" | "group" = "everything",
  ) {
    if (destroyed) return;
    if (stage !== "everything" && stage !== "group")
      throw new TypeError(
        "Partial source processing stages require their own staged query contract",
      );
    model.expireValueCache();
    modelUpdated();
  }
  function setSelection(ids: string[], source: string) {
    const previousSource = selectionSource;
    selectionSource = source;
    try {
      model.setState({ selected: ids });
    } finally {
      selectionSource = previousSource;
    }
  }
  function selectAll(source = "apiSelectAll") {
    if (destroyed) return;
    const ids = new Set(model.getState().selected);
    nodes.forEachNode((node) => {
      if (!node.group) ids.add(node.id);
    });
    setSelection([...ids], source);
  }
  function deselectAll(source = "apiSelectAll") {
    if (destroyed) return;
    setSelection([], source);
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    unsubscribe();
    events.destroy();
    nodes.destroy();
    columns.destroy();
    schema.destroy();
    settings.clear();
    for (const listener of [...lifecycle]) listener();
    lifecycle.clear();
    viewListeners.clear();
  }
  const methods = {
    getGridOption,
    setGridOption,
    onFilterChanged,
    getFilterModel,
    setFilterModel,
    applyTransaction,
    setRowNodeExpanded,
    applyColumnState,
    getColumnState,
    resetColumnState,
    selectAll,
    deselectAll,
    destroy,
    isDestroyed: () => destroyed,
    getColumn: (key: unknown) => active(() => columns.getColumn(key)),
    getColumns: () => active(() => columns.getColumns()),
    getAllDisplayedColumns: () =>
      active(() => columns.getAllDisplayedColumns()),
    getRowGroupColumns: () =>
      active(() =>
        model.getState().groupBy.map((id) => columns.getColumn(id)!),
      ),
    getRowNode: (id: string) => active(() => nodes.getRowNode(id)),
    forEachNode: (callback: (node: Ag31RowNode<T>, index: number) => void) =>
      active(() => nodes.forEachNode(callback)),
    forEachLeafNode: (
      callback: (node: Ag31RowNode<T>, index: number) => void,
    ) => active(() => nodes.forEachLeafNode(callback)),
    forEachNodeAfterFilter: (
      callback: (node: Ag31RowNode<T>, index: number) => void,
    ) => active(() => nodes.forEachNodeAfterFilter(callback)),
    forEachNodeAfterFilterAndSort: (
      callback: (node: Ag31RowNode<T>, index: number) => void,
    ) => active(() => nodes.forEachNodeAfterFilterAndSort(callback)),
    getSelectedNodes: () =>
      active(() =>
        model
          .getState()
          .selected.map((id) => nodes.getRowNode(id))
          .filter((node): node is Ag31RowNode<T> => !!node),
      ),
    getSelectedRows: () =>
      active(() =>
        model
          .getState()
          .selected.map((id) => model.getRow(id))
          .filter((row): row is T => row !== undefined),
      ),
    getDisplayedRowCount: () => active(() => model.getRowModel().length),
    getDisplayedRowAtIndex: (index: number) =>
      active(() => {
        const row =
          Number.isSafeInteger(index) && index >= 0
            ? model.getRowModel()[index]
            : undefined;
        return row ? nodes.getRowNodeByNativeId(row.id) : undefined;
      }),
    getValue: (key: unknown, node: Ag31RowNode<T>) =>
      active(() => (columns.getColumn(key) ? schema.read(node, key) : null)),
    getCellValue: (params: Ag31GetCellValueParams<T>) =>
      active(() => schema.getCellValue(params)),
    refreshCells,
    refreshClientSideRowModel,
    getColumnGroupState: () => active(() => groups.getColumnGroupState()),
    setColumnGroupState: (state: readonly Ag31ColumnGroupState[]) => {
      if (!destroyed) groups.setColumnGroupState(state);
    },
    resetColumnGroupState: () => {
      if (!destroyed) groups.resetColumnGroupState();
    },
    setColumnGroupOpened: (id: string, open: boolean) => {
      if (!destroyed) groups.setColumnGroupOpened(id, open);
    },
    addEventListener: events.addEventListener,
    removeEventListener: events.removeEventListener,
    dispatchEvent: events.dispatchEvent,
  };
  Object.assign(api, methods);
  const columnMethods = {
    getColumn: methods.getColumn,
    getColumns: methods.getColumns,
    getAllDisplayedColumns: methods.getAllDisplayedColumns,
    getRowGroupColumns: methods.getRowGroupColumns,
    applyColumnState: methods.applyColumnState,
    getColumnState: methods.getColumnState,
    resetColumnState: methods.resetColumnState,
    getColumnGroupState: methods.getColumnGroupState,
    setColumnGroupState: methods.setColumnGroupState,
    resetColumnGroupState: methods.resetColumnGroupState,
    setColumnGroupOpened: methods.setColumnGroupOpened,
  };
  Object.assign(columnApi, columnMethods);
  if (
    settings.get("isExternalFilterPresent") != null ||
    settings.get("doesExternalFilterPass") != null
  )
    onFilterChanged();
  return Object.freeze({
    api: api as typeof methods,
    columnApi: columnApi as typeof columnMethods,
    model,
    nodes,
    columns,
    schema,
    groups,
    subscribeLifecycle(listener: () => void) {
      lifecycle.add(listener);
      return () => {
        lifecycle.delete(listener);
      };
    },
    getLifecycleSnapshot: () => destroyed,
    subscribeViewRefresh(listener: () => void) {
      viewListeners.add(listener);
      return () => {
        viewListeners.delete(listener);
      };
    },
    getViewSnapshot: () => viewRevision,
  });
}
