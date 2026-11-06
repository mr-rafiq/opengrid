import {
  Ag31SourceOverlay,
  type Ag31OverlayComponentOptions,
} from "./ag31-source-overlay.js";
import { assertAg31LocaleText, type Ag31LocaleText } from "./ag31-overlays.js";
import {
  forwardRef,
  memo,
  useCallback,
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
import {
  DataGrid,
  type GridHeaderControlsContext,
  type CellContext,
  type GridNodeCellContext,
} from "./data-grid.js";
import {
  createAg31ClientController,
  AG31_EVENT_OPTIONS,
  AG31_HEADER_METRICS,
  assertAg31HeaderMetric,
  type Ag31HeaderMetricName,
  type Ag31EventOptionName,
} from "./ag31-client-controller.js";
import type {
  Ag31ColumnDefinition,
  Ag31LeafColumn,
} from "./ag31-leaf-columns.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
import type { DataGridViewController } from "./grid-view.js";
import type { DataGridSizingController } from "./column-sizing.js";
import type { GridState } from "@opengrid/core";
import { Ag31SourceEditor, sourceEditorKey } from "./ag31-source-editor.js";
import { Ag31CustomFilterHost } from "./ag31-custom-filter-host.js";
import { isAg31CustomFilter } from "./ag31-custom-filters.js";
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
export interface Ag31ClientGridCellEvent<T> extends Ag31ClientGridEvent<T> {
  node: Ag31RowNode<T>;
  data: T | undefined;
  column: Ag31LeafColumn<T>;
  colDef: Ag31ColumnDefinition<T>;
  rowIndex: number | null;
  rowPinned: null;
  value?: unknown;
  oldValue?: unknown;
  newValue?: unknown;
  valueChanged?: boolean;
}
export interface Ag31ClientGridConfig<T> extends Ag31OverlayComponentOptions {
  rowData: T[] | null;
  columnDefs: readonly Ag31ColumnDefinition<T>[];
  defaultColDef?: Ag31ColumnDefinition<T>;
  getRowId(params: { data: T }): string;
  context?: unknown;
  components?: Readonly<Record<string, ComponentType<any>>>;
  initialModelState?: Partial<GridState>;
  height?: number;
  headerHeight?: number | null;
  groupHeaderHeight?: number | null;
  floatingFiltersHeight?: number | null;
  rowHeight?: number;
  suppressLoadingOverlay?: boolean | null;
  suppressNoRowsOverlay?: boolean | null;
  localeText?: Ag31LocaleText | null;

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
  readOnlyEdit?: boolean;
  enableGroupEdit?: boolean;
  suppressClickEdit?: boolean;
  enableCellEditingOnBackspace?: boolean;
  onCellValueChanged?(event: Ag31ClientGridCellEvent<T>): void;
  onCellEditRequest?(event: Ag31ClientGridCellEvent<T>): void;
  onCellEditingStarted?(event: Ag31ClientGridCellEvent<T>): void;
  onCellEditingStopped?(event: Ag31ClientGridCellEvent<T>): void;
  onCellKeyDown?(event: Ag31ClientGridCellEvent<T>): void;
  onCellFocused?(
    event: Ag31ClientGridEvent<T> & {
      rowIndex: number;
      rowPinned: null;
      column: Ag31LeafColumn<T>;
    },
  ): void;
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
  "suppressLoadingOverlay",
  "suppressNoRowsOverlay",
  "localeText",
  "loadingOverlayComponent",
  "loadingOverlayComponentParams",
  "noRowsOverlayComponent",
  "noRowsOverlayComponentParams",
  "columnDefs",
  "defaultColDef",
  "getRowId",
  "context",
  "components",
  "initialModelState",
  "height",
  "headerHeight",
  "groupHeaderHeight",
  "floatingFiltersHeight",
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
  "readOnlyEdit",
  "enableGroupEdit",
  "suppressClickEdit",
  "enableCellEditingOnBackspace",
  "rowGroupPanelShow",
  "isExternalFilterPresent",
  "doesExternalFilterPass",
  "getRowStyle",
  ...AG31_EVENT_OPTIONS.map(([name]) => name),
]);
const emptyDefinitions: readonly never[] = Object.freeze([]);
const headerMetricValues = <T,>(config: Ag31ClientGridConfig<T>) =>
  Object.fromEntries(
    AG31_HEADER_METRICS.map((name) => [name, config[name]]),
  ) as Record<Ag31HeaderMetricName, number | null | undefined>;
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
  for (const name of [
    "suppressLoadingOverlay",
    "suppressNoRowsOverlay",
    "readOnlyEdit",
    "enableGroupEdit",
    "suppressClickEdit",
    "enableCellEditingOnBackspace",
  ]) {
    if (result[name] != null && typeof result[name] !== "boolean")
      throw new TypeError("Source overlay suppression must be boolean");
  }
  assertAg31LocaleText(result.localeText);
  for (const name of AG31_HEADER_METRICS)
    assertAg31HeaderMetric(result[name], name);
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
  const editing = useSyncExternalStore(
    owner.editing.subscribe,
    owner.editing.getSnapshot,
    owner.editing.getSnapshot,
  );
  const view = useRef<DataGridViewController>(null);
  const sizing = useRef<DataGridSizingController>(null);
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const [automaticHeight, setAutomaticHeight] = useState(480);
  const [hostHeaderHeight, setHostHeaderHeight] = useState(38);
  useLayoutEffect(() => owner.viewServices.attach(() => view.current), [owner]);
  useLayoutEffect(
    () =>
      owner.rowReveal.attach(() => {
        const mounted = view.current,
          viewport =
            container.current?.querySelector<HTMLElement>(".og-viewport"),
          header = container.current?.querySelector<HTMLElement>(".og-header");
        return mounted && viewport && header
          ? {
              view: mounted,
              bodyHeight: viewport.clientHeight - header.offsetHeight,
            }
          : null;
      }),
    [owner],
  );
  useLayoutEffect(() => owner.attachEditingView(() => view.current), [owner]);
  useLayoutEffect(
    () =>
      owner.cellFocus.attach(() => {
        const host = container.current;
        const viewport = host?.querySelector<HTMLElement>(".og-viewport");
        if (!host || !viewport || !view.current?.isActive()) return null;
        return {
          focus(position, preventScroll) {
            const cell = [
              ...viewport.querySelectorAll<HTMLElement>(
                ".og-cell[data-row-id][data-column-id]",
              ),
            ].find(
              (element) =>
                element.dataset.rowId === position.rowId &&
                element.dataset.columnId === position.columnId &&
                element.closest(".og-viewport") === viewport,
            );
            if (!cell) return false;
            const editing = owner.editing.controller.getEditingCell();
            if (
              editing?.rowId === position.rowId &&
              editing.columnId === position.columnId &&
              cell.contains(cell.ownerDocument.activeElement)
            )
              return true;
            cell.focus({ preventScroll });
            return cell.ownerDocument.activeElement === cell;
          },
          ownsBrowserFocus() {
            const active = host.ownerDocument.activeElement;
            return (
              active instanceof HTMLElement &&
              active.matches(".og-cell") &&
              active.closest(".og-viewport") === viewport
            );
          },
          canRestoreBrowserFocus() {
            const active = host.ownerDocument.activeElement;
            return (
              active === host.ownerDocument.body ||
              (active instanceof HTMLElement &&
                active.matches(".og-cell") &&
                active.closest(".og-viewport") === viewport)
            );
          },
        };
      }),
    [owner],
  );
  useLayoutEffect(() => {
    owner.editing.reconcile();
  });
  useLayoutEffect(
    () => owner.sizingServices.attach(() => sizing.current),
    [owner],
  );
  useLayoutEffect(() => {
    if (destroyed || props.height !== undefined) return;
    const host = container.current;
    const reconcile = () => {
      if (!host || owner.api.isDestroyed()) return;
      const root = host.querySelector<HTMLElement>(".og-root");
      const viewport = host.querySelector<HTMLElement>(".og-viewport");
      if (!root || !viewport || host.clientHeight <= 0) return;
      const viewportHeight = viewport.getBoundingClientRect().height;
      const chrome = Math.max(
        0,
        root.getBoundingClientRect().height - viewportHeight,
      );
      const style = getComputedStyle(host);
      const padding =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0);
      const available = Math.max(1, host.clientHeight - padding - chrome);
      // Intrinsic hosts and fractional CSS pixels must not shrink on every observer pass.
      if (Math.abs(viewportHeight - available) < 1.5) return;
      setAutomaticHeight((previous) =>
        Math.abs(previous - available) >= 1 ? available : previous,
      );
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(reconcile);
    if (host) {
      observer?.observe(host);
      const root = host.querySelector<HTMLElement>(".og-root");
      if (root) observer?.observe(root);
    }
    reconcile();
    return () => observer?.disconnect();
  }, [owner, destroyed, props.height]);
  useLayoutEffect(() => {
    if (destroyed) return;
    const host = container.current;
    if (!host) return;
    const reconcile = () => {
      const style = getComputedStyle(host);
      const adopted = Boolean(
        style.getPropertyValue("--ag-background-color").trim() &&
        style.getPropertyValue("--ag-foreground-color").trim(),
      );
      host.toggleAttribute("data-og-host-theme", adopted);
      if (!adopted) {
        setHostHeaderHeight(38);
        return;
      }
      const probe = document.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      Object.assign(probe.style, {
        position: "absolute",
        visibility: "hidden",
        pointerEvents: "none",
        width: "0px",
        padding: "0px",
        border: "0px",
        height: "var(--ag-header-height, calc(var(--ag-grid-size, 6px) * 8))",
      });
      host.append(probe);
      const measured = probe.getBoundingClientRect().height;
      probe.remove();
      if (Number.isFinite(measured) && measured > 0 && measured <= 1_000_000)
        setHostHeaderHeight(measured);
    };
    let frame: number | undefined;
    const schedule = () => {
      if (frame !== undefined) return;
      if (typeof requestAnimationFrame !== "function") return reconcile();
      frame = requestAnimationFrame(() => {
        frame = undefined;
        reconcile();
      });
    };
    const observer =
      typeof MutationObserver === "undefined"
        ? undefined
        : new MutationObserver(schedule);
    for (let node: HTMLElement | null = host; node; node = node.parentElement)
      observer?.observe(node, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-og-theme"],
      });
    if (document.head)
      observer?.observe(document.head, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    document.addEventListener("load", schedule, true);
    reconcile();
    return () => {
      observer?.disconnect();
      document.removeEventListener("load", schedule, true);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [owner, destroyed]);
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
  const cell = useCallback(
    (node: Ag31RowNode<T>, id: string) => {
      const column = owner.columns.getColumn(id)!;
      const colDef = column.getColDef();
      if (editing?.node === node && editing.column === column)
        return (
          <Ag31SourceEditor
            key={id}
            owner={owner}
            cell={editing}
            components={props.components}
          />
        );
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
    },
    [owner, props.components, editing],
  );
  const renderSourceCell = useCallback(
    ({ row, column }: CellContext<T>) =>
      cell(owner.nodes.getRowNode(props.getRowId({ data: row }))!, column.id),
    [owner, props.getRowId, cell],
  );
  const renderSourceGroup = useCallback(
    ({ node, column }: GridNodeCellContext<T>) =>
      cell(owner.nodes.getRowNodeByNativeId(node.id)!, column.id),
    [owner, cell],
  );
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
  const headerMetric = (name: Ag31HeaderMetricName, fallback: number) => {
    const value = owner.api.getGridOption(name);
    return typeof value === "number" ? value : fallback;
  };
  const headerHeight = headerMetric("headerHeight", hostHeaderHeight);
  if (destroyed) return null;
  return (
    <div
      ref={container}
      className={`og-source-client ${props.className ?? ""}`}
      onFocusCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        const cell = event.target.closest<HTMLElement>(
          ".og-cell[data-row-id][data-column-id]",
        );
        if (
          !cell ||
          cell.closest(".og-viewport") !==
            container.current?.querySelector(".og-viewport")
        )
          return;
        owner.cellFocus.controller.setFocusedCell({
          rowId: cell.dataset.rowId!,
          columnId: cell.dataset.columnId!,
        });
      }}
      data-og-fluid-height={props.height === undefined ? "true" : undefined}
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        overflow: props.height === undefined ? "auto" : undefined,
      }}
    >
      <DataGrid
        model={owner.model}
        cellEditingController={owner.editing.controller}
        cellFocusController={owner.cellFocus.controller}
        doubleClickEditing={!props.suppressClickEdit}
        cellKeyboardHandler={(event, position) =>
          sourceEditorKey(
            owner,
            event,
            position,
            props.enableCellEditingOnBackspace === true,
          )
        }
        headerGroupController={{
          getPath: (column) => owner.groups.getPath(column.id),
          isColumnDisplayed: (column) =>
            owner.groups.isColumnDisplayed(column.id),
          canToggle: owner.groups.canToggle,
          isExpanded: owner.groups.isExpanded,
          toggle: owner.groups.toggle,
        }}
        viewRef={view}
        onViewCommit={() => {
          owner.rowReveal.flush();
          owner.rowRendering.flush();
          owner.flushEditing();
          owner.cellFocus.flush();
        }}
        sizingRef={sizing}
        toolbar={false}
        onColumnFilterRequest={({ column, anchor }) => {
          const source = owner.columns.getColumn(column.id);
          if (!source || !isAg31CustomFilter(source.getColDef().filter))
            return false;
          owner.customFilters.show(source, anchor);
          return true;
        }}
        pagination={false}
        statusBar={false}
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
        height={props.height ?? automaticHeight}
        minimumBodyHeight={props.height === undefined ? 0 : 64}
        minimumViewportHeight={props.height === undefined ? 0 : 140}
        headerRowHeight={headerHeight}
        groupHeaderRowHeight={headerMetric("groupHeaderHeight", headerHeight)}
        floatingFilterRowHeight={headerMetric(
          "floatingFiltersHeight",
          headerHeight,
        )}
        rowHeight={props.rowHeight ?? 42}
        ariaLabel={props.ariaLabel ?? "Source client grid"}
        getRowStyle={(node) => presentation.rowStyle(rowNode(node))}
        getRowRenderKey={(node) => owner.rowRendering.key(node.id)}
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
        renderCell={renderSourceCell}
        renderGroupCell={renderSourceGroup}
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
      <Ag31SourceOverlay owner={owner} host={container} config={props} />
      <Ag31CustomFilterHost
        filters={owner.customFilters}
        host={container}
        resolveComponent={(column) =>
          component(column.getColDef().filter, props.components)
        }
        getParams={(column) => {
          const colDef = column.getColDef(),
            params = {
              api: owner.api,
              columnApi: owner.columnApi,
              context: owner.api.getGridOption("context"),
              column,
              colDef,
              getValue: (node: Ag31RowNode<T>) =>
                owner.schema.readFilter(node, column),
            };
          const extra =
            typeof colDef.filterParams === "function"
              ? colDef.filterParams(params)
              : colDef.filterParams;
          if (
            extra != null &&
            (typeof extra !== "object" || Array.isArray(extra))
          )
            throw new TypeError(
              "Source filter parameters must resolve to a parameter record",
            );
          return { ...params, ...((extra as object) ?? {}) };
        }}
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
    headerMetrics: Record<Ag31HeaderMetricName, number | null | undefined>;
    editingOptions: Pick<
      Ag31ClientGridConfig<T>,
      "readOnlyEdit" | "enableGroupEdit"
    >;
    overlayOptions: Pick<
      Ag31ClientGridConfig<T>,
      "suppressLoadingOverlay" | "suppressNoRowsOverlay" | "localeText"
    >;
  }>({
    owner: null,
    context: props.context,
    rowData: props.rowData,
    callbacks: optionCallbacks(props),
    isExternalFilterPresent: props.isExternalFilterPresent,
    doesExternalFilterPass: props.doesExternalFilterPass,
    getRowStyle: props.getRowStyle,
    headerMetrics: headerMetricValues(props),
    editingOptions: {
      readOnlyEdit: props.readOnlyEdit,
      enableGroupEdit: props.enableGroupEdit,
    },
    overlayOptions: {
      suppressLoadingOverlay: props.suppressLoadingOverlay,
      suppressNoRowsOverlay: props.suppressNoRowsOverlay,
      localeText: props.localeText,
    },
  });
  useLayoutEffect(() => {
    const options = initial.current;
    const next = createAg31ClientController({
      rows: options.rowData ?? [],
      rowData: options.rowData,
      initialOverlayLoading:
        options.rowData === null || options.columnDefs === emptyDefinitions,
      suppressLoadingOverlay: options.suppressLoadingOverlay,
      suppressNoRowsOverlay: options.suppressNoRowsOverlay,
      localeText: options.localeText,
      definitions: options.columnDefs,
      defaultColDef: options.defaultColDef,
      getRowId: (row) => options.getRowId({ data: row }),
      context: options.context,
      initialState: options.initialModelState,
      rowHeight: options.rowHeight,
      readOnly: true,
      editing: {
        readOnlyEdit: options.readOnlyEdit,
        enableGroupEdit: options.enableGroupEdit,
      },
      groupSelectsFiltered: options.groupSelectsFiltered,
      callbacks: optionCallbacks(options),
      isExternalFilterPresent: options.isExternalFilterPresent,
      doesExternalFilterPass: options.doesExternalFilterPass,
      getRowStyle: options.getRowStyle,
      ...headerMetricValues(options),
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
        headerMetrics: headerMetricValues(initial.current),
        editingOptions: {
          readOnlyEdit: initial.current.readOnlyEdit,
          enableGroupEdit: initial.current.enableGroupEdit,
        },
        overlayOptions: {
          suppressLoadingOverlay: initial.current.suppressLoadingOverlay,
          suppressNoRowsOverlay: initial.current.suppressNoRowsOverlay,
          localeText: initial.current.localeText,
        },
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
    for (const name of ["readOnlyEdit", "enableGroupEdit"] as const)
      if (forwarded.current.editingOptions[name] !== props[name]) {
        owner.api.setGridOption(name, props[name] === true);
        forwarded.current.editingOptions[name] = props[name];
      }
    if (forwarded.current.getRowStyle !== props.getRowStyle) {
      owner.api.setGridOption("getRowStyle", props.getRowStyle);
      forwarded.current.getRowStyle = props.getRowStyle;
    }
    for (const name of AG31_HEADER_METRICS) {
      if (!Object.is(forwarded.current.headerMetrics[name], props[name])) {
        owner.api.setGridOption(name, props[name]);
        forwarded.current.headerMetrics[name] = props[name];
      }
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
    for (const name of [
      "suppressLoadingOverlay",
      "suppressNoRowsOverlay",
      "localeText",
    ] as const) {
      if (!Object.is(forwarded.current.overlayOptions[name], props[name])) {
        owner.api.setGridOption(name, props[name]);
        forwarded.current.overlayOptions = {
          ...forwarded.current.overlayOptions,
          [name]: props[name],
        };
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
    props.headerHeight,
    props.groupHeaderHeight,
    props.floatingFiltersHeight,
    props.suppressLoadingOverlay,
    props.suppressNoRowsOverlay,
    props.localeText,
    props.readOnlyEdit,
    props.enableGroupEdit,
    props.onCellValueChanged,
    props.onCellEditRequest,
    props.onCellEditingStarted,
    props.onCellEditingStopped,
    props.onCellKeyDown,
    props.onCellFocused,
  ]);
  return owner && !owner.api.isDestroyed() ? (
    <ResidentView owner={owner} props={props} gridRef={ref} />
  ) : null;
}
export const Ag31ClientGrid = forwardRef(ClientGrid) as <T>(
  props: Ag31ClientGridProps<T> & { ref?: Ref<Ag31ClientGridHandle<T>> },
) => ReactElement | null;
