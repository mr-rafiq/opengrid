import { createAg31ViewServices } from "./ag31-view-services.js";
import { createAg31RowReveal } from "./ag31-row-reveal.js";
import { createAg31CellFocus } from "./ag31-cell-focus.js";
import { createAg31CellValueServices } from "./ag31-cell-values.js";
import { createAg31EditingServices } from "./ag31-editing.js";
import type { DataGridViewController } from "./grid-view.js";
import { createAg31SizingServices } from "./ag31-sizing-services.js";
import {
  createAg31Overlays,
  assertAg31LocaleText,
  type Ag31LocaleText,
} from "./ag31-overlays.js";
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
  createAg31CustomFilters,
  isAg31CustomFilter,
} from "./ag31-custom-filters.js";
import { normalizeAg31CustomFilterModel } from "./ag31-custom-filter-model.js";
import {
  partitionAg31FilterModel,
  type Ag31SourceFilterModel,
  type Ag31SourceFilterValue,
} from "./ag31-source-filter-models.js";
import {
  compileAg31ColumnFilter,
  canonicalizeAg31SetFilter,
  normalizeAg31ColumnFilterModel,
  normalizeAg31ProvidedFilterModel,
  type Ag31ColumnFilterModel,
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
export interface Ag31ColumnFilterInstance<T> {
  getModel(): Ag31SourceFilterValue | null;
  setModel(model: unknown): Promise<void>;
  isFilterActive(): boolean;
  doesFilterPass(params: { node: Ag31RowNode<T>; data?: T }): boolean;
}
export const AG31_EVENT_OPTIONS = [
  ["onGridReady", "gridReady"],
  ["onSortChanged", "sortChanged"],
  ["onFilterChanged", "filterChanged"],
  ["onSelectionChanged", "selectionChanged"],
  ["onModelUpdated", "modelUpdated"],
  ["onRowDataUpdated", "rowDataUpdated"],
  ["onColumnRowGroupChanged", "columnRowGroupChanged"],
  ["onCellValueChanged", "cellValueChanged"],
  ["onCellEditRequest", "cellEditRequest"],
  ["onCellEditingStarted", "cellEditingStarted"],
  ["onCellEditingStopped", "cellEditingStopped"],
  ["onCellKeyDown", "cellKeyDown"],
  ["onCellFocused", "cellFocused"],
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
  initialOverlayLoading?: boolean;
  suppressLoadingOverlay?: boolean | null;
  suppressNoRowsOverlay?: boolean | null;
  localeText?: Ag31LocaleText | null;
  headerHeight?: number | null;
  groupHeaderHeight?: number | null;
  floatingFiltersHeight?: number | null;
  initialState?: Partial<GridState>;
  readOnly?: boolean;
  editing?: { readOnlyEdit?: boolean; enableGroupEdit?: boolean };
  groupSelectsFiltered?: boolean;
  callbacks?: Partial<Record<Ag31EventOptionName, unknown>>;
  isExternalFilterPresent?: (() => boolean) | null;
  doesExternalFilterPass?: ((node: Ag31RowNode<T>) => boolean) | null;
  getRowStyle?: unknown;
  writeCell?(
    node: Ag31RowNode<T>,
    column: unknown,
    value: unknown,
    source: string | undefined,
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
  let appliedSourceFilters: Ag31FilterModel = sourceFilters;
  const filterInstances = new Map<string, Ag31ColumnFilterInstance<T>>();
  let compiledFilters: { id: string; passes(node: Ag31RowNode<T>): boolean }[] =
    [];
  let appliedCompiledFilters = compiledFilters;
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
  for (const key of ["readOnlyEdit", "enableGroupEdit"] as const) {
    const value = options.editing?.[key];
    if (value != null && typeof value !== "boolean")
      throw new TypeError(`Source ${key} must be boolean`);
    settings.set(key, value);
  }
  if (options.editing && options.writeCell)
    throw new TypeError(
      "Source compiled editing and a custom write owner cannot overlap",
    );
  let cellValues: ReturnType<typeof createAg31CellValueServices<T>> | undefined;
  if (options.getRowStyle != null && typeof options.getRowStyle !== "function")
    throw new TypeError(
      "Source getRowStyle must be a function, null or undefined",
    );
  settings.set("getRowStyle", options.getRowStyle);
  for (const key of [
    "suppressLoadingOverlay",
    "suppressNoRowsOverlay",
  ] as const) {
    if (options[key] != null && typeof options[key] !== "boolean")
      throw new TypeError("Source overlay suppression must be boolean");
    settings.set(key, options[key]);
  }
  assertAg31LocaleText(options.localeText);
  settings.set("localeText", options.localeText);

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
  const viewServices = createAg31ViewServices();
  const rowReveal: ReturnType<typeof createAg31RowReveal<T>> =
    createAg31RowReveal<T>({
      count: () => model.getRowModel().length,
      row: (index) => {
        const row = model.getRowModel()[index];
        return row ? nodes.getRowNodeByNativeId(row.id) : undefined;
      },
    });
  const sizingServices = createAg31SizingServices(
    (key) => columns.getColumn(key),
    () => columns.getAllDisplayedColumns(),
    () =>
      columns
        .getAllDisplayedColumns()
        .filter((column) => {
          const value = column.getColDef().suppressSizeToFit;
          if (value != null && typeof value !== "boolean")
            throw new TypeError("Source suppressSizeToFit must be boolean");
          return value === true;
        })
        .map((column) => column.getColId()),
  );
  const overlays = createAg31Overlays({
    rowCount: options.rows.length,
    initiallyLoading:
      options.initialOverlayLoading ??
      (Object.hasOwn(options, "rowData") && options.rowData == null),
    flags: () => ({
      suppressLoadingOverlay: settings.get("suppressLoadingOverlay") === true,
      suppressNoRowsOverlay: settings.get("suppressNoRowsOverlay") === true,
    }),
  });
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
    readOnly: options.readOnly ?? !(options.writeCell || options.editing),
    initialState: {
      pageSize: HIERARCHY_SELECTION_LIMITS.maxNodes,
      ...declaredQuery,
      ...options.initialState,
    },
  });
  const nodes = createAg31RowNodes({
    writeAllowed: () => !!options.editing && !destroyed,
    model,
    getRowId: options.getRowId,
    rowHeight: options.rowHeight ?? 42,
    context: () => settings.get("context"),
    groupSelectsFiltered: options.groupSelectsFiltered,
    setSelection,
    groupIdentity: schema.groupIdentity,
    writeCell: (node, column, value, source) => {
      if (destroyed) return false;
      if (cellValues) return cellValues.write(node, column, value, source);
      if (!options.writeCell)
        throw new Error(
          "Source business writes require a compiled write handler",
        );
      return options.writeCell(node, column, value, source);
    },
  });
  const columns: ReturnType<typeof createAg31LeafColumns<T>> =
    createAg31LeafColumns({
      editingAllowed: () => !!options.editing && !destroyed,
      model,
      definitions: schema.leafDefinitions,
      defaultColDef: options.defaultColDef,
      commonParams,
      ownsNode: (node) => nodes.getRowNode(node.id) === node,
      sourceFilterActive: (id) =>
        Object.hasOwn(sourceFilters, id) ||
        (customFilters.get(id)?.filter.isFilterActive() ?? false),
      sourceColumnDisplayed: groups.isColumnDisplayed,
      sourceSortIndexes: true,
      renderedWidth: (id) => {
        const widths = model.getState().columnWidths;
        return Object.hasOwn(widths, id)
          ? widths[id]
          : sizingServices.getRenderedWidth(id);
      },
    });
  let filterRequest = 0;
  const customFilterInstances = new WeakMap<
    object,
    Ag31ColumnFilterInstance<T>
  >();
  const customFilters: ReturnType<typeof createAg31CustomFilters<T>> =
    createAg31CustomFilters<T>({
      getColumn: columns.getColumn,
      onModelChange: () => onFilterChanged(),
    });
  schema.bind({ model, nodes, columns });
  if (options.editing)
    cellValues = createAg31CellValueServices({
      alive: () => !destroyed,
      owns: (node) => nodes.getRowNode(node.id) === node,
      column: (key) => columns.getColumn(key),
      read: (node, column) => schema.read(node, column),
      common: commonParams,
      readOnlyEdit: () => settings.get("readOnlyEdit") === true,
      prepareWrite: (node) => nodes.prepareWriteData(node),
      request: (event) => events.dispatchEvent(event),
      changed: (event, params) =>
        events.dispatchEventWithPrelude(event, () => {
          const callback = event.column.getColDef().onCellValueChanged;
          if (typeof callback === "function") callback(params);
        }),
      rowChanged: (event) =>
        nodes.dispatchCellChanged(
          event.node,
          event.column,
          event.oldValue,
          event.newValue,
        ),
      refresh: refreshCells,
    });
  const editing = createAg31EditingServices<T>({
    alive: () => !destroyed && !!cellValues,
    resolve: (position) => {
      const native = model
        .getRowModel()
        .find((row) => row.id === position.rowId);
      const node = native && nodes.getRowNodeByNativeId(native.id);
      const column = columns
        .getAllDisplayedColumns()
        .find((column) => column.colId === position.columnId);
      return node && column ? { node, column } : undefined;
    },
    read: (node, column) => schema.read(node, column),
    write: (node, column, value) =>
      cellValues?.write(node, column, value, "edit") ?? false,
    enableGroupEdit: () => settings.get("enableGroupEdit") === true,
    emit: (event) => events.dispatchEvent(event),
  });
  let editingAttachment: { read(): DataGridViewController | null } | null =
    null;
  const cellFocus = createAg31CellFocus<T>({
    column: columns.getColumn,
    position(index, column) {
      const row = model.getRowModel()[index];
      return row && columns.getAllDisplayedColumns().includes(column)
        ? { rowId: row.id, columnId: column.colId }
        : null;
    },
    locate(position) {
      const index = model
        .getRowModel()
        .findIndex((row) => row.id === position.rowId);
      const column = columns.getColumn(position.columnId);
      return index >= 0 && column ? { index, column } : null;
    },
    subscribe: model.subscribe,
    emit: (event) => events.dispatchEvent(event),
  });
  function mountedEditingView() {
    if (destroyed) return null;
    const view = editingAttachment?.read();
    return view?.isActive() ? view : null;
  }
  const emit = (event: Ag31Event) => {
    if (event.type === "rowDataUpdated")
      overlays.dataUpdated(model.getRows().length);
    events.dispatchEvent(event);
  };
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
        if (Object.hasOwn(appliedSourceFilters, id)) {
          const remaining = { ...appliedSourceFilters };
          delete remaining[id];
          appliedSourceFilters = remaining;
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
    if (key === "suppressLoadingOverlay" || key === "suppressNoRowsOverlay") {
      if (value != null && typeof value !== "boolean")
        throw new TypeError("Source overlay suppression must be boolean");
      settings.set(key, value);
      return;
    }
    if (key === "localeText") {
      assertAg31LocaleText(value);
      settings.set(key, value);
      overlays.invalidate();
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
    if (key === "readOnlyEdit" || key === "enableGroupEdit") {
      if (!options.editing)
        throw new TypeError("This source owner has no editing contract");
      if (value != null && typeof value !== "boolean")
        throw new TypeError(`Source ${key} must be boolean`);
      settings.set(key, value);
      refreshCells();
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
      if (value != null && !Array.isArray(value))
        throw new TypeError("rowData must be an array, null or undefined");
      if (value == null) {
        settings.set(key, value);
        return;
      }
      const nextRows = value as T[];
      const previousRows = settings.get(key);
      settings.set(key, value);
      try {
        model.setRows(nextRows);
        if (
          !equal(sourceFilters, appliedSourceFilters) ||
          Object.values({ ...sourceFilters, ...appliedSourceFilters }).some(
            (filter) => filter.filterType === "set",
          )
        )
          changeFilterModel(sourceFilters, true);
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
    const filters = appliedCompiledFilters;
    const custom = customFilters
      .getSnapshot()
      .entries.filter((entry) => entry.filter.isFilterActive());
    if (
      !isPresent &&
      !Object.keys(appliedSourceFilters).length &&
      !custom.length
    )
      return undefined;
    return (row: T) => {
      const node = nodes.getRowNode(options.getRowId(row))!;
      if (isPresent && !(predicate?.(node) ?? false)) return false;
      return (
        custom.every(
          (entry) =>
            customFilters.get(entry.column) !== entry ||
            entry.filter.doesFilterPass({ node, data: node.data }),
        ) &&
        filters.every(
          ({ id, passes }) =>
            !Object.hasOwn(appliedSourceFilters, id) ||
            Object.hasOwn(model.getState().filters, id) ||
            passes(node),
        )
      );
    };
  }
  function getProvidedFilterModel() {
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
  function getFilterModel(): Ag31SourceFilterModel | undefined {
    return active(() => {
      const result: Ag31SourceFilterModel = { ...getProvidedFilterModel() };
      for (const entry of customFilters.getSnapshot().entries) {
        const value = entry.filter.getModel();
        if (value !== null)
          Object.defineProperty(result, entry.column.colId, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
      return result;
    });
  }
  function getAdvancedFilterModel(): null | undefined {
    return active(() => {
      if (model.getState().advancedFilter != null)
        throw new TypeError(
          "Native advanced filter serialization requires the source expression adapter",
        );
      return null;
    });
  }
  function setAdvancedFilterModel(input: unknown) {
    if (destroyed) return;
    if (input != null)
      throw new TypeError(
        "Non-null source advanced filters require the source expression adapter",
      );
    if (model.getState().advancedFilter != null) model.setAdvancedFilter(null);
  }
  function setFilterModel(input: unknown) {
    if (destroyed) return;
    const partition = partitionAg31FilterModel(input, columns.getColumn);
    const prepared = prepareFilterModel(partition.provided);
    const request = ++filterRequest;
    for (const key of partition.custom.keys()) customFilters.validate(key);
    for (const key of partition.custom.keys()) customFilters.ensure(key);
    const entries = customFilters.getSnapshot().entries;
    if (!entries.length) return changePreparedFilterModel(prepared, true);
    changePreparedFilterModel(prepared, false);
    return Promise.all(
      entries.map(async (entry) => {
        if (!(await entry.filter.whenReady()) || request !== filterRequest)
          return false;
        return entry.filter.stage(
          partition.custom.get(entry.column.colId) ?? null,
        );
      }),
    ).then((committed) => {
      if (!destroyed && request === filterRequest && committed.every(Boolean))
        applySourceFilterQuery(true);
    });
  }
  function prepareFilterModel(input: unknown) {
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
    return { next, compiled };
  }
  function changeFilterModel(input: unknown, apply: boolean) {
    if (destroyed) return;
    changePreparedFilterModel(prepareFilterModel(input), apply);
  }
  function changePreparedFilterModel(
    { next, compiled }: ReturnType<typeof prepareFilterModel>,
    apply: boolean,
  ) {
    if (
      equal(sourceFilters, next) &&
      !Object.keys(model.getState().filters).length &&
      (!apply || equal(appliedSourceFilters, next))
    )
      return;
    const before = sourceFilters,
      beforeCompiled = compiledFilters,
      beforeApplied = appliedSourceFilters,
      beforeAppliedCompiled = appliedCompiledFilters;
    const changed = columns
      .getColumns()
      .filter(
        (column) =>
          !equal(before[column.colId], next[column.colId]) ||
          Object.hasOwn(model.getState().filters, column.colId),
      );
    sourceFilters = next;
    compiledFilters = compiled;
    if (!apply) return;
    appliedSourceFilters = next;
    appliedCompiledFilters = compiled;
    filtersApplying = true;
    try {
      model.setExternalFilter(queryPredicate(), { columnFilters: {} });
    } catch (error) {
      sourceFilters = before;
      compiledFilters = beforeCompiled;
      appliedSourceFilters = beforeApplied;
      appliedCompiledFilters = beforeAppliedCompiled;
      throw error;
    } finally {
      filtersApplying = false;
    }
    emit({ type: "filterChanged", source: "api", columns: changed });
    modelUpdated();
  }
  function onFilterChanged() {
    applySourceFilterQuery(false);
  }
  function applySourceFilterQuery(clearNative: boolean) {
    if (destroyed) return;
    const previousApplied = appliedSourceFilters;
    const previousCompiled = appliedCompiledFilters;
    appliedSourceFilters = sourceFilters;
    appliedCompiledFilters = compiledFilters;
    filtersApplying = true;
    try {
      model.setExternalFilter(
        queryPredicate(),
        clearNative ? { columnFilters: {} } : undefined,
      );
    } catch (error) {
      appliedSourceFilters = previousApplied;
      appliedCompiledFilters = previousCompiled;
      throw error;
    } finally {
      filtersApplying = false;
    }
    emit({ type: "filterChanged", source: "api", columns: [] });
    modelUpdated();
  }
  async function setColumnFilterModel(
    key: unknown,
    input: unknown,
  ): Promise<void> {
    if (destroyed) return;
    const column = columns.getColumn(key),
      definition = column?.getColDef();
    if (!column || !definition?.filter) return;
    if (isAg31CustomFilter(definition.filter)) {
      const value = normalizeAg31CustomFilterModel(input);
      const entry = customFilters.ensure(column);
      if (entry && (await entry.filter.whenReady()))
        await entry.filter.stage(value);
      return;
    }
    const kind =
      definition.filter === "agSetColumnFilter" || definition.filter === true
        ? "set"
        : definition.filter === "agTextColumnFilter"
          ? "text"
          : definition.filter === "agNumberColumnFilter"
            ? "number"
            : null;
    if (!kind)
      throw new TypeError(
        "This column requires its registered source filter component adapter",
      );
    const value = normalizeAg31ProvidedFilterModel(kind, input);
    const next = { ...getProvidedFilterModel() };
    if (value == null) delete next[column.colId];
    else
      Object.defineProperty(next, column.colId, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    changeFilterModel(next, false);
  }
  async function getColumnFilterInstance(
    key: unknown,
  ): Promise<Ag31ColumnFilterInstance<T> | undefined> {
    if (destroyed) return;
    const column = columns.getColumn(key),
      definition = column?.getColDef();
    if (!column || !definition?.filter) return;
    if (isAg31CustomFilter(definition.filter)) {
      const entry = customFilters.ensure(column);
      if (!entry) return;
      await entry.filter.whenReady();
      if (destroyed || customFilters.get(column) !== entry) return;
      let instance = customFilterInstances.get(entry);
      if (!instance) {
        const current = () => !destroyed && customFilters.get(column) === entry;
        instance = Object.freeze({
          getModel: () => (current() ? entry.filter.getModel() : null),
          setModel: async (input: unknown) => {
            if (current()) await setColumnFilterModel(column, input);
          },
          isFilterActive: () => current() && entry.filter.isFilterActive(),
          doesFilterPass: ({ node }: { node: Ag31RowNode<T>; data?: T }) =>
            current() &&
            nodes.getRowNode(node.id) === node &&
            entry.filter.doesFilterPass({ node, data: node.data }),
        });
        customFilterInstances.set(entry, instance);
      }
      return instance;
    }
    if (
      ![
        true,
        "agSetColumnFilter",
        "agTextColumnFilter",
        "agNumberColumnFilter",
      ].includes(definition.filter as any)
    )
      throw new TypeError(
        "This column requires its registered source filter component adapter",
      );
    let instance = filterInstances.get(column.colId);
    if (!instance) {
      instance = Object.freeze({
        getModel: () =>
          destroyed ? null : (getProvidedFilterModel()?.[column.colId] ?? null),
        setModel: (input: unknown) => setColumnFilterModel(column, input),
        isFilterActive: () =>
          !destroyed && Object.hasOwn(sourceFilters, column.colId),
        doesFilterPass: ({ node }: { node: Ag31RowNode<T>; data?: T }) =>
          !destroyed &&
          nodes.getRowNode(node.id) === node &&
          (compiledFilters
            .find((filter) => filter.id === column.colId)
            ?.passes(node) ??
            true),
      });
      filterInstances.set(column.colId, instance);
    }
    return instance;
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
      !equal(sourceFilters, appliedSourceFilters) ||
      Object.values({ ...sourceFilters, ...appliedSourceFilters }).some(
        (filter) => filter.filterType === "set",
      )
    )
      changeFilterModel(sourceFilters, true);
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
          flex: Object.hasOwn(state.columnWidths, definition.id)
            ? null
            : (definition.flex ?? null),
        };
      });
    });
  }
  function refreshClientSideRowModel(
    stage: "everything" | "group" | "aggregate" = "everything",
  ) {
    if (destroyed) return;
    if (stage === "aggregate") {
      if (!model.refreshAggregates)
        throw new Error("Resident aggregate refresh is unavailable");
      model.refreshAggregates();
      modelUpdated();
      return;
    }
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
    filterRequest++;
    editing.destroy();
    editingAttachment = null;
    viewServices.destroy();
    rowReveal.destroy();
    cellFocus.destroy();
    sizingServices.destroy();
    overlays.destroy();
    unsubscribe();
    events.destroy();
    nodes.destroy();
    columns.destroy();
    schema.destroy();
    settings.clear();
    filterInstances.clear();
    let teardownError: unknown;
    try {
      customFilters.destroy();
    } catch (error) {
      teardownError = error;
    }
    for (const listener of [...lifecycle])
      try {
        listener();
      } catch (error) {
        teardownError ??= error;
      }
    lifecycle.clear();
    viewListeners.clear();
    if (teardownError) throw teardownError;
  }
  const methods = {
    startEditingCell(params: {
      rowIndex: number;
      colKey: unknown;
      key?: string;
      rowPinned?: null;
    }) {
      if (destroyed || !cellValues) return;
      if (
        !params ||
        !Number.isSafeInteger(params.rowIndex) ||
        params.rowIndex < 0 ||
        (params.key !== undefined && typeof params.key !== "string") ||
        params.rowPinned != null
      )
        throw new TypeError(
          "Source editing requires a displayed body row and a live column",
        );
      const row = model.getRowModel()[params.rowIndex],
        column = columns.getColumn(params.colKey);
      if (row && column)
        mountedEditingView()?.startEditingCell(
          { rowId: row.id, columnId: column.colId },
          { initialText: params.key },
        );
    },
    stopEditing(cancel = false) {
      if (typeof cancel !== "boolean")
        throw new TypeError("Source editing cancellation must be boolean");
      if (!destroyed) {
        const view = mountedEditingView();
        if (view) view.stopEditing({ cancel });
        else editing.stop(cancel);
      }
    },
    getEditingCells() {
      if (destroyed) return [];
      editing.reconcile();
      const current = editing.getSnapshot();
      return current
        ? [
            {
              rowIndex: current.node.rowIndex,
              rowPinned: null,
              column: current.column,
            },
          ]
        : [];
    },
    sizeColumnsToFit: sizingServices.sizeColumnsToFit,
    autoSizeColumns: sizingServices.autoSizeColumns,
    autoSizeAllColumns: sizingServices.autoSizeAllColumns,
    ctrlsService: viewServices.ctrlsService,
    ensureIndexVisible: rowReveal.ensureIndexVisible,
    ensureNodeVisible: rowReveal.ensureNodeVisible,
    getFocusedCell: cellFocus.getFocusedCell,
    setFocusedCell: cellFocus.setFocusedCell,
    clearFocusedCell: cellFocus.clearFocusedCell,
    overlayService: overlays.service,
    showLoadingOverlay() {
      if (!destroyed) overlays.showLoading();
    },
    showNoRowsOverlay() {
      if (!destroyed) overlays.showNoRows();
    },
    hideOverlay() {
      if (!destroyed) overlays.hide();
    },

    getGridOption,
    setGridOption,
    onFilterChanged,
    getFilterModel,
    setFilterModel,
    getColumnFilterInstance,
    setColumnFilterModel,
    showColumnFilter: (key: unknown) => {
      if (destroyed) return;
      const column = columns.getColumn(key);
      if (!column?.getColDef().filter) return;
      if (!isAg31CustomFilter(column.getColDef().filter))
        throw new TypeError(
          "Provided source filter popups require their separate UI adapter",
        );
      customFilters.show(column);
    },
    hidePopupMenu: () => customFilters.hide(),
    getAdvancedFilterModel,
    setAdvancedFilterModel,
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
    dispatchEvent: emit,
  };
  Object.assign(api, methods);
  const columnMethods = {
    autoSizeColumns: methods.autoSizeColumns,
    autoSizeAllColumns: methods.autoSizeAllColumns,
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
    overlays,
    viewServices,
    rowReveal,
    cellFocus,
    sizingServices,
    cellValues,
    editing,
    customFilters,
    attachEditingView(read: () => DataGridViewController | null) {
      const attachment = { read };
      editingAttachment = attachment;
      return () => {
        if (editingAttachment === attachment) {
          editingAttachment = null;
          editing.stop(true);
        }
      };
    },
    subscribeViewRefresh(listener: () => void) {
      viewListeners.add(listener);
      return () => {
        viewListeners.delete(listener);
      };
    },
    getViewSnapshot: () => viewRevision,
  });
}
