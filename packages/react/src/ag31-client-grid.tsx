import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type Ref,
} from "react";
import { DataGrid, type GridHeaderControlsContext } from "./data-grid.js";
import {
  createAg31ClientController,
  AG31_EVENT_OPTIONS,
  type Ag31EventOptionName,
} from "./ag31-client-controller.js";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
import type { DataGridViewController } from "./grid-view.js";
import type { GridState } from "@opengrid/core";
import { planAg31PinPressure } from "./ag31-pin-pressure.js";
import {
  createAg31Presentation,
  type Ag31RowStyleCallback,
} from "./ag31-presentation.js";

type Owner<T> = ReturnType<typeof createAg31ClientController<T>>;
export interface Ag31ClientGridHandle<T> {
  api: Owner<T>["api"];
  columnApi: Owner<T>["columnApi"];
}
export interface Ag31ClientGridEvent<T> extends Ag31ClientGridHandle<T> {
  type: string;
  context: unknown;
  [key: string]: unknown;
}
export interface Ag31ClientGridConfig<T> {
  rowData: T[] | null;
  columnDefs: readonly Ag31ColumnDefinition<T>[];
  defaultColDef?: Ag31ColumnDefinition<T>;
  getRowId(params: { data: T }): string;
  context?: unknown;
  components?: Readonly<Record<string, ComponentType<any>>>;
  initialModelState?: Partial<GridState>;
  height?: number;
  rowHeight?: number;
  className?: string;
  ariaLabel?: string;
  /** A complete tree renderer includes its own indentation/disclosure controls. */
  completeTreeRenderer?: boolean;
  rowSelection?: "multiple";
  groupSelectsChildren?: boolean;
  groupSelectsFiltered?: boolean;
  suppressRowClickSelection?: boolean;
  groupDisplayType?: "custom";
  groupAllowUnbalanced?: false;
  groupMaintainOrder?: false;
  showOpenedGroup?: false;
  reactiveCustomComponents?: true;
  rowGroupPanelShow?: "always" | "onlyWhenGrouping" | "never";
  isExternalFilterPresent?: (() => boolean) | null;
  doesExternalFilterPass?: ((node: Ag31RowNode<T>) => boolean) | null;
  getRowStyle?: Ag31RowStyleCallback<T> | null;
  onGridReady?(
    event: Ag31ClientGridHandle<T> & { context: unknown; type: "gridReady" },
  ): void;
  onSortChanged?(event: Ag31ClientGridEvent<T>): void;
  onFilterChanged?(event: Ag31ClientGridEvent<T>): void;
  onSelectionChanged?(event: Ag31ClientGridEvent<T>): void;
  onModelUpdated?(event: Ag31ClientGridEvent<T>): void;
  onRowDataUpdated?(event: Ag31ClientGridEvent<T>): void;
  onColumnRowGroupChanged?(event: Ag31ClientGridEvent<T>): void;
}

export interface Ag31ClientGridProps<T> extends Partial<
  Ag31ClientGridConfig<T>
> {
  gridOptions?: Partial<Ag31ClientGridConfig<T>>;
}
const configKeys = new Set([
  "rowData",
  "columnDefs",
  "defaultColDef",
  "getRowId",
  "context",
  "components",
  "initialModelState",
  "height",
  "rowHeight",
  "className",
  "ariaLabel",
  "completeTreeRenderer",
  "rowSelection",
  "groupSelectsChildren",
  "groupSelectsFiltered",
  "suppressRowClickSelection",
  "onGridReady",
  "groupDisplayType",
  "groupAllowUnbalanced",
  "groupMaintainOrder",
  "showOpenedGroup",
  "reactiveCustomComponents",
  "rowGroupPanelShow",
  "isExternalFilterPresent",
  "doesExternalFilterPass",
  "getRowStyle",
  ...AG31_EVENT_OPTIONS.map(([name]) => name),
]);
const emptyDefinitions: readonly never[] = Object.freeze([]);
const optionCallbacks = <T,>(
  config: Ag31ClientGridConfig<T>,
): Partial<Record<Ag31EventOptionName, unknown>> =>
  Object.fromEntries(AG31_EVENT_OPTIONS.map(([name]) => [name, config[name]]));
/** Shallow source option precedence: defined component props win; undefined preserves the option. */
export function resolveAg31ClientGridConfig<T>(
  props: Ag31ClientGridProps<T>,
): Ag31ClientGridConfig<T> {
  const result: Record<string, unknown> = {};
  for (const [source, input] of [
    ["gridOptions", props.gridOptions],
    ["props", props],
  ] as const) {
    if (input == null) continue;
    if (typeof input !== "object")
      throw new TypeError(`${source} must be an options record`);
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(input),
    )) {
      if (source === "props" && (key === "gridOptions" || key === "ref"))
        continue;
      if (!descriptor.enumerable) continue;
      if (!configKeys.has(key) || !("value" in descriptor))
        throw new TypeError(`Unsupported source ${source} option: ${key}`);
      if (descriptor.value !== undefined) result[key] = descriptor.value;
    }
  }
  if (result.rowData === undefined) result.rowData = null;
  if (result.columnDefs === undefined) result.columnDefs = emptyDefinitions;
  if (
    (result.rowData !== null && !Array.isArray(result.rowData)) ||
    !Array.isArray(result.columnDefs)
  )
    throw new TypeError("Source rows and columns require arrays");
  if (typeof result.getRowId !== "function")
    throw new TypeError("This resident source bridge requires getRowId");
  if (result.rowSelection !== undefined && result.rowSelection !== "multiple")
    throw new TypeError(
      "This source bridge currently supports multiple row selection only",
    );
  for (const key of [
    "groupAllowUnbalanced",
    "groupMaintainOrder",
    "showOpenedGroup",
  ])
    if (result[key] !== undefined && result[key] !== false)
      throw new TypeError(
        `Source ${key} currently requires the measured false policy`,
      );
  if (
    result.groupDisplayType !== undefined &&
    result.groupDisplayType !== "custom"
  )
    throw new TypeError(
      "This source bridge requires custom group display columns",
    );
  if (
    result.reactiveCustomComponents !== undefined &&
    result.reactiveCustomComponents !== true
  )
    throw new TypeError(
      "This source bridge requires reactive custom components",
    );
  if (
    result.rowGroupPanelShow !== undefined &&
    !["always", "onlyWhenGrouping", "never"].includes(
      result.rowGroupPanelShow as string,
    )
  )
    throw new TypeError("Unsupported source row group panel policy");
  return result as unknown as Ag31ClientGridConfig<T>;
}

function component<T>(
  value: unknown,
  registry: Ag31ClientGridConfig<T>["components"],
) {
  if (value == null) return undefined;
  const resolved = typeof value === "string" ? registry?.[value] : value;
  if (
    typeof resolved !== "function" &&
    (typeof resolved !== "object" || !resolved || !("$$typeof" in resolved))
  )
    throw new TypeError(
      "A source component must be a React component or a registered component name",
    );
  return resolved as ComponentType<any>;
}

function SourceHeader<T>({
  owner,
  control,
  registry,
}: {
  owner: Owner<T>;
  control: GridHeaderControlsContext<T>;
  registry: Ag31ClientGridConfig<T>["components"];
}) {
  const column = owner.columns.getColumn(control.column.id)!;
  const definition = column.getColDef();
  const Source = component(definition.headerComponent, registry)!;
  const Header = useMemo(() => memo(Source), [Source]);
  // The unchanged source header subscribes in an effect keyed by its props.
  // Keep action proxies/params stable across model renders, but read current ports.
  const current = useRef(control);
  current.current = control;
  const context = owner.api.getGridOption("context");
  const params = useMemo(
    () => ({
      api: owner.api,
      columnApi: owner.columnApi,
      context,
      column,
      colDef: definition,
      displayName: control.column.header ?? column.colId,
      enableSorting: control.column.sortable !== false,
      enableMenu: true,
      progressSort: (multi = false) => current.current.progressSort(multi),
      showColumnMenu: (anchor?: HTMLElement) =>
        current.current.showColumnMenu(anchor),
      ...((definition.headerComponentParams as object) ?? {}),
    }),
    [owner, column, definition, context, control.column.header],
  );
  return (
    <span data-og-source-component style={{ display: "contents" }}>
      <Header {...params} />
    </span>
  );
}

function ResidentView<T>({
  owner,
  props,
  gridRef,
}: {
  owner: Owner<T>;
  props: Ag31ClientGridConfig<T>;
  gridRef: Ref<Ag31ClientGridHandle<T>>;
}) {
  const destroyed = useSyncExternalStore(
    owner.subscribeLifecycle,
    owner.getLifecycleSnapshot,
    owner.getLifecycleSnapshot,
  );
  useSyncExternalStore(
    owner.subscribeViewRefresh,
    owner.getViewSnapshot,
    owner.getViewSnapshot,
  );
  const view = useRef<DataGridViewController>(null);
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const presentation = useMemo(() => createAg31Presentation(owner), [owner]);
  useImperativeHandle(
    gridRef,
    () => ({ api: owner.api, columnApi: owner.columnApi }),
    [owner],
  );
  useLayoutEffect(() => {
    if (destroyed) return;
    const host = container.current;
    const reconcile = () => {
      if (owner.api.isDestroyed()) return;
      const viewport = host?.querySelector<HTMLElement>(".og-viewport");
      if (!viewport || !view.current?.isActive()) return;
      const release = planAg31PinPressure(
        owner.columns.getAllDisplayedColumns().map((column) => ({
          colId: column.colId,
          pinned: column.getPinned(),
          width: column.getActualWidth(),
        })),
        viewport.clientWidth,
      );
      if (!release.length) return;
      const pins = { ...owner.model.getState().columnPinning };
      for (const id of release) {
        if (
          owner.model.getColumnDefinitions().find((column) => column.id === id)
            ?.lockPinned
        )
          throw new TypeError(
            "Source automatic unpinning cannot override native pin locks",
          );
        pins[id] = null;
      }
      owner.model.setState({ columnPinning: pins });
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(reconcile);
    if (host) observer?.observe(host);
    const unsubscribe = owner.model.subscribe(reconcile);
    const unsubscribeView = owner.subscribeViewRefresh(reconcile);
    reconcile();
    return () => {
      observer?.disconnect();
      unsubscribe();
      unsubscribeView();
    };
  }, [owner, destroyed]);
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    function notify() {
      if (destroyed || ready.current || owner.api.isDestroyed()) return;
      if (!view.current?.isActive()) {
        retry = setTimeout(notify, 16);
        return;
      }
      ready.current = true;
      owner.api.dispatchEvent({ type: "gridReady" });
    }
    notify();
    return () => {
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [owner, destroyed]);
  function cell(node: Ag31RowNode<T>, id: string) {
    const column = owner.columns.getColumn(id)!;
    const colDef = column.getColDef();
    const Renderer = component(colDef.cellRenderer, props.components);
    const value = owner.schema.read(node, column);
    if (!Renderer) return owner.schema.format(node, column);
    const params = {
      api: owner.api,
      columnApi: owner.columnApi,
      context: owner.api.getGridOption("context"),
      column,
      colDef,
      node,
      data: node.data,
      value,
      valueFormatted: owner.schema.getValueFormatted(node, column),
      getValue: () => owner.schema.read(node, column),
    };
    const extra =
      typeof colDef.cellRendererParams === "function"
        ? colDef.cellRendererParams(params)
        : colDef.cellRendererParams;
    return (
      <span data-og-source-component style={{ display: "contents" }}>
        <Renderer {...params} {...(extra as object)} />
      </span>
    );
  }
  const checkboxColumns = owner.columns
    .getColumns()
    .filter((column) => column.getColDef().checkboxSelection === true);
  if (props.rowSelection && checkboxColumns.length !== 1)
    throw new TypeError(
      "Source checkbox selection requires exactly one static checkbox column",
    );
  if (
    props.rowSelection &&
    owner.model.getState().groupBy.length &&
    !props.groupSelectsChildren
  )
    throw new TypeError("Source group selection requires descendant selection");
  if (props.rowSelection && props.suppressRowClickSelection === false)
    throw new TypeError(
      "Source row-click selection requires a separate interaction contract",
    );
  const checkboxColumn = checkboxColumns[0];
  const rowNode = (node: { id: string }) =>
    owner.nodes.getRowNodeByNativeId(node.id)!;
  if (destroyed) return null;
  return (
    <div ref={container} style={{ minWidth: 0 }}>
      <DataGrid
        model={owner.model}
        headerGroupController={{
          getPath: (column) => owner.groups.getPath(column.id),
          isColumnDisplayed: (column) =>
            owner.groups.isColumnDisplayed(column.id),
          canToggle: owner.groups.canToggle,
          isExpanded: owner.groups.isExpanded,
          toggle: owner.groups.toggle,
        }}
        viewRef={view}
        toolbar={false}
        pagination={false}
        rowGroupPanel={
          props.rowGroupPanelShow === "always"
            ? "always"
            : props.rowGroupPanelShow === "onlyWhenGrouping"
              ? "whenGrouped"
              : false
        }
        floatingFilters={(column) =>
          owner.columns.getColumn(column.id)!.getColDef().floatingFilter ===
          true
        }
        height={props.height}
        rowHeight={props.rowHeight ?? 42}
        className={props.className}
        ariaLabel={props.ariaLabel ?? "Source client grid"}
        getRowStyle={(node) => presentation.rowStyle(rowNode(node))}
        getCellStyle={({ node, column }) =>
          presentation.cellStyle(rowNode(node), column.id)
        }
        getCellClassName={({ node, column }) =>
          presentation.cellClass(rowNode(node), column.id)
        }
        getCellTooltip={({ node, column }) =>
          presentation.tooltip(rowNode(node), column.id)
        }
        selectionMode={props.rowSelection ? "multiple" : "none"}
        selectionCheckboxColumn={
          props.rowSelection ? checkboxColumn?.colId : undefined
        }
        selectionControls={
          props.rowSelection
            ? {
                getRowState: (node) => {
                  const source = rowNode(node),
                    selected = source.isSelected();
                  return {
                    checked: selected === true,
                    mixed: selected === undefined,
                    label: `Select ${source.id}`,
                  };
                },
                toggleRow: (node) => {
                  const source = rowNode(node);
                  source.setSelected(
                    source.isSelected() !== true,
                    false,
                    "checkboxSelected",
                  );
                },
                getHeaderState: () => {
                  if (
                    checkboxColumn?.getColDef().headerCheckboxSelection !== true
                  )
                    return null;
                  const selected = owner.api.getSelectedNodes()!.length;
                  const total = owner.model.getRows().length;
                  return {
                    checked: total > 0 && selected === total,
                    mixed: selected > 0 && selected < total,
                    disabled: total === 0,
                    label: "Select all rows",
                  };
                },
                toggleHeader: () => {
                  const all =
                    owner.model.getRows().length > 0 &&
                    owner.api.getSelectedNodes()!.length ===
                      owner.model.getRows().length;
                  if (all) owner.api.deselectAll("uiSelectAll");
                  else owner.api.selectAll("uiSelectAll");
                },
              }
            : undefined
        }
        renderTreePrefix={props.completeTreeRenderer ? () => null : undefined}
        renderCell={({ row, column }) =>
          cell(
            owner.nodes.getRowNode(props.getRowId({ data: row }))!,
            column.id,
          )
        }
        renderGroupCell={({ node, column }) =>
          cell(owner.nodes.getRowNodeByNativeId(node.id)!, column.id)
        }
        renderHeaderControls={(control) =>
          owner.columns.getColumn(control.column.id)!.getColDef()
            .headerComponent ? (
            <SourceHeader
              owner={owner}
              control={control}
              registry={props.components}
            />
          ) : undefined
        }
      />
    </div>
  );
}

/** Experimental read-only resident React bridge; not a complete AgGridReact replacement. */
function ClientGrid<T>(
  input: Ag31ClientGridProps<T>,
  ref: Ref<Ag31ClientGridHandle<T>>,
) {
  const props = resolveAg31ClientGridConfig(input);
  const [owner, setOwner] = useState<Owner<T> | null>(null);
  const initial = useRef(props);
  const forwarded = useRef<{
    owner: Owner<T> | null;
    context: unknown;
    rowData: T[] | null;
    callbacks: Partial<Record<Ag31EventOptionName, unknown>>;
    isExternalFilterPresent: Ag31ClientGridConfig<T>["isExternalFilterPresent"];
    doesExternalFilterPass: Ag31ClientGridConfig<T>["doesExternalFilterPass"];
    getRowStyle: Ag31ClientGridConfig<T>["getRowStyle"];
  }>({
    owner: null,
    context: props.context,
    rowData: props.rowData,
    callbacks: optionCallbacks(props),
    isExternalFilterPresent: props.isExternalFilterPresent,
    doesExternalFilterPass: props.doesExternalFilterPass,
    getRowStyle: props.getRowStyle,
  });
  useLayoutEffect(() => {
    const options = initial.current;
    const next = createAg31ClientController({
      rows: options.rowData ?? [],
      rowData: options.rowData,
      definitions: options.columnDefs,
      defaultColDef: options.defaultColDef,
      getRowId: (row) => options.getRowId({ data: row }),
      context: options.context,
      initialState: options.initialModelState,
      rowHeight: options.rowHeight,
      readOnly: true,
      groupSelectsFiltered: options.groupSelectsFiltered,
      callbacks: optionCallbacks(options),
      isExternalFilterPresent: options.isExternalFilterPresent,
      doesExternalFilterPass: options.doesExternalFilterPass,
      getRowStyle: options.getRowStyle,
    });
    setOwner(next);
    return () => next.api.destroy();
  }, []);
  useLayoutEffect(() => {
    if (!owner || owner.api.isDestroyed()) return;
    if (
      props.columnDefs !== initial.current.columnDefs ||
      props.defaultColDef !== initial.current.defaultColDef ||
      props.groupSelectsFiltered !== initial.current.groupSelectsFiltered
    )
      throw new Error(
        "Structural source column replacement requires remounting this resident bridge",
      );
    if (forwarded.current.owner !== owner)
      forwarded.current = {
        owner,
        context: initial.current.context,
        rowData: initial.current.rowData,
        callbacks: optionCallbacks(initial.current),
        isExternalFilterPresent: initial.current.isExternalFilterPresent,
        doesExternalFilterPass: initial.current.doesExternalFilterPass,
        getRowStyle: initial.current.getRowStyle,
      };
    for (const [name] of AG31_EVENT_OPTIONS) {
      if (forwarded.current.callbacks[name] !== props[name]) {
        owner.api.setGridOption(name, props[name]);
        forwarded.current.callbacks[name] = props[name];
      }
    }
    if (forwarded.current.context !== props.context) {
      owner.api.setGridOption("context", props.context);
      forwarded.current.context = props.context;
      owner.api.refreshCells();
    }
    if (forwarded.current.getRowStyle !== props.getRowStyle) {
      owner.api.setGridOption("getRowStyle", props.getRowStyle);
      forwarded.current.getRowStyle = props.getRowStyle;
    }
    for (const name of [
      "isExternalFilterPresent",
      "doesExternalFilterPass",
    ] as const) {
      if (forwarded.current[name] !== props[name]) {
        owner.api.setGridOption(name, props[name]);
        forwarded.current = { ...forwarded.current, [name]: props[name] };
      }
    }
    if (forwarded.current.rowData !== props.rowData) {
      owner.api.setGridOption("rowData", props.rowData);
      forwarded.current.rowData = props.rowData;
    }
  }, [
    owner,
    props.rowData,
    props.context,
    props.columnDefs,
    props.defaultColDef,
    props.onGridReady,
    props.onSortChanged,
    props.onFilterChanged,
    props.onSelectionChanged,
    props.onModelUpdated,
    props.onRowDataUpdated,
    props.onColumnRowGroupChanged,
    props.isExternalFilterPresent,
    props.doesExternalFilterPass,
    props.getRowStyle,
  ]);
  return owner && !owner.api.isDestroyed() ? (
    <ResidentView owner={owner} props={props} gridRef={ref} />
  ) : null;
}
export const Ag31ClientGrid = forwardRef(ClientGrid) as <T>(
  props: Ag31ClientGridProps<T> & { ref?: Ref<Ag31ClientGridHandle<T>> },
) => ReactElement | null;
