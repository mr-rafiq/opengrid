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
import { createAg31ClientController } from "./ag31-client-controller.js";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
import type { DataGridViewController } from "./grid-view.js";
import type { GridState } from "@opengrid/core";

type Owner<T> = ReturnType<typeof createAg31ClientController<T>>;
export interface Ag31ClientGridHandle<T> {
  api: Owner<T>["api"];
  columnApi: Owner<T>["columnApi"];
}
export interface Ag31ClientGridProps<T> {
  rowData: T[];
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
  onGridReady?(
    event: Ag31ClientGridHandle<T> & { context: unknown; type: "gridReady" },
  ): void;
}

function component<T>(
  value: unknown,
  registry: Ag31ClientGridProps<T>["components"],
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
  registry: Ag31ClientGridProps<T>["components"];
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
  return <Header {...params} />;
}

function ResidentView<T>({
  owner,
  props,
  gridRef,
}: {
  owner: Owner<T>;
  props: Ag31ClientGridProps<T>;
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
  const ready = useRef(false);
  useImperativeHandle(
    gridRef,
    () => ({ api: owner.api, columnApi: owner.columnApi }),
    [owner],
  );
  useEffect(() => {
    if (!destroyed && !ready.current && view.current?.isActive()) {
      ready.current = true;
      props.onGridReady?.({
        type: "gridReady",
        api: owner.api,
        columnApi: owner.columnApi,
        context: owner.api.getGridOption("context"),
      });
    }
  }, [owner, destroyed, props.onGridReady]);
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
    return <Renderer {...params} {...(extra as object)} />;
  }
  if (destroyed) return null;
  return (
    <DataGrid
      model={owner.model}
      viewRef={view}
      toolbar={false}
      pagination={false}
      height={props.height}
      rowHeight={props.rowHeight ?? 42}
      className={props.className}
      ariaLabel={props.ariaLabel ?? "Source client grid"}
      renderTreePrefix={props.completeTreeRenderer ? () => null : undefined}
      renderCell={({ row, column }) =>
        cell(owner.nodes.getRowNode(props.getRowId({ data: row }))!, column.id)
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
  );
}

/** Internal, read-only resident React bridge. It deliberately does not advertise complete AgGridReact compatibility. */
function ClientGrid<T>(
  props: Ag31ClientGridProps<T>,
  ref: Ref<Ag31ClientGridHandle<T>>,
) {
  const [owner, setOwner] = useState<Owner<T> | null>(null);
  const initial = useRef(props);
  useLayoutEffect(() => {
    const options = initial.current;
    const next = createAg31ClientController({
      rows: options.rowData,
      definitions: options.columnDefs,
      defaultColDef: options.defaultColDef,
      getRowId: (row) => options.getRowId({ data: row }),
      context: options.context,
      initialState: options.initialModelState,
      rowHeight: options.rowHeight,
      readOnly: true,
    });
    setOwner(next);
    return () => next.api.destroy();
  }, []);
  useLayoutEffect(() => {
    if (!owner || owner.api.isDestroyed()) return;
    if (
      props.columnDefs !== initial.current.columnDefs ||
      props.defaultColDef !== initial.current.defaultColDef
    )
      throw new Error(
        "Structural source column replacement requires remounting this internal bridge",
      );
    if (owner.api.getGridOption("context") !== props.context) {
      owner.api.setGridOption("context", props.context);
      owner.api.refreshCells();
    }
    if (owner.api.getGridOption("rowData") !== props.rowData)
      owner.api.setGridOption("rowData", props.rowData);
  }, [
    owner,
    props.rowData,
    props.context,
    props.columnDefs,
    props.defaultColDef,
  ]);
  return owner && !owner.api.isDestroyed() ? (
    <ResidentView owner={owner} props={props} gridRef={ref} />
  ) : null;
}
export const Ag31ClientGrid = forwardRef(ClientGrid) as <T>(
  props: Ag31ClientGridProps<T> & { ref?: Ref<Ag31ClientGridHandle<T>> },
) => ReactElement | null;
