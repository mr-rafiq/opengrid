import {
  useEffect,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
  useRef,
  useState,
  useMemo,
  Fragment,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  ComponentType,
  DragEvent,
} from "react";
import type {
  Column,
  GridModel,
  RowNode,
  CellPosition,
  CellRange,
  Filter,
} from "@opengrid/core";
import { useGridLocale, gridMessage } from "./locale.js";
import type { GridMessage } from "./locale.js";
import { useCellRanges } from "./use-cell-ranges.js";
import { useFind } from "./use-find.js";
import { useColumnResize } from "./use-column-resize.js";
import { useTouchTaps } from "./use-touch-taps.js";
import { CellNotesStore, getBuiltinRowReorderReason } from "@opengrid/core";
import {
  getInlineColumnOrder,
  normalizeScrollLeft,
  denormalizeScrollLeft,
  createDirectionLayout,
  getInlineArrowDelta,
  physicalToInlineDelta,
} from "./direction.js";
import type { GridDirection } from "./direction.js";
import { AdvancedFilterBuilder } from "./advanced-filter-builder.js";
import { CellNoteDialog } from "./cell-note-dialog.js";
import { RowEditDialog } from "./row-edit-dialog.js";
import {
  CellEditor,
  type CellEditorProps,
  type CellEditorRenderer,
  type EditorOption,
  type EditorType,
} from "./editors.js";
import { createRowLayout } from "./row-layout.js";
import { HeaderGroupRows, computeHeaderGroups } from "./group-headers.js";

export interface EditorConfig {
  type?: EditorType;
  options?: readonly EditorOption[];
  asyncOptions?: (signal?: AbortSignal) => Promise<readonly EditorOption[]>;
}
import { getColumnWindow } from "./column-window.js";
import type { ColumnWindowEntry } from "./column-window.js";
import { createRowProjection } from "./row-projection.js";
import type { FullWidthRowContext, RowRegion } from "./row-projection.js";
import type { ColumnFilterProps } from "./filter-components.js";
import {
  createColumnSpanPlan,
  getColumnSpanOwner,
  getColumnSpanWindow,
} from "./column-spans.js";
import type { ColumnSpanCell } from "./column-spans.js";
import { createRowSpanPlan } from "./row-spans.js";
import type { RowSpanPlan, RowSpanRow } from "./row-spans.js";

export interface CellContext<T> {
  value: unknown;
  row: T;
  column: Column<T>;
}
export interface DataGridProps<T> {
  model: GridModel<T>;
  direction?: GridDirection;
  height?: number;
  rowHeight?: number;
  getRowHeight?: (node: RowNode<T>) => number;
  pinnedTopRowIds?: readonly string[];
  pinnedBottomRowIds?: readonly string[];
  isFullWidthRow?: (node: RowNode<T>) => boolean;
  renderFullWidthRow?: (context: FullWidthRowContext<T>) => ReactNode;
  renderDetail?: (context: { row: T; rowId: string }) => ReactNode;
  detailHeight?: number | ((row: T) => number);
  defaultExpandedDetailRows?: string[];
  expandedDetailRows?: string[];
  onExpandedDetailRowsChange?: (rowIds: string[]) => void;
  overscan?: number;
  columnOverscan?: number;
  virtualizeColumns?: boolean;
  columnGroups?: boolean;
  selectionMode?: "single" | "multiple" | "none";
  cellSelection?: boolean;
  onCellRangeChange?: (range: CellRange | null) => void;
  editorOptions?: Record<string, EditorConfig>;
  renderEditor?: CellEditorRenderer<T>;
  editMode?: "cell" | "row";
  rowConflictPolicy?: "reject" | "overwrite";
  onRowEdit?: (context: { rowId: string }) => void;
  rowDragging?: boolean;
  onRowMove?: (context: {
    rowIds: readonly string[];
    targetRowId: string;
    position: "before" | "after";
  }) => void;
  ariaLabel?: string;
  toolbar?: boolean;
  advancedFiltering?: boolean;
  filterComponents?: Record<
    string,
    ComponentType<ColumnFilterProps<NoInfer<T>>>
  >;
  notes?: CellNotesStore | false;
  pagination?: boolean;
  className?: string;
  renderCell?: (context: CellContext<T>) => ReactNode;
  onCellEdit?: (context: {
    rowId: string;
    columnId: string;
    value: unknown;
    error?: string;
  }) => void;
}

interface FocusCell {
  rowId: string;
  columnId: string;
}
interface Editing {
  rowId: string;
  columnId: string;
  draft: string;
}
const text = (value: unknown) => (value == null ? "" : String(value));
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));
/** Bounded sanitized-state comparison; uncertain inputs force run-cache expiry. */
function sameSpanStateValue(
  left: unknown,
  right: unknown,
  budget = { remaining: 50000 },
  depth = 0,
): boolean {
  if (Object.is(left, right)) return true;
  if (--budget.remaining < 0 || depth > 32) return false;
  if (left instanceof Date || right instanceof Date)
    return (
      left instanceof Date &&
      right instanceof Date &&
      Object.is(
        Date.prototype.getTime.call(left),
        Date.prototype.getTime.call(right),
      )
    );
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  const array = Array.isArray(left);
  if (array !== Array.isArray(right)) return false;
  if (
    array &&
    ((left as unknown[]).length !== (right as unknown[]).length ||
      (left as unknown[]).length > budget.remaining)
  )
    return false;
  if (!array) {
    const a = Object.getPrototypeOf(left),
      b = Object.getPrototypeOf(right);
    if (a !== b || (a !== null && a !== Object.prototype)) return false;
  }
  const leftKeys = Reflect.ownKeys(left),
    rightKeys = Reflect.ownKeys(right);
  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.length > budget.remaining
  )
    return false;
  const rightKeySet = new Set(rightKeys);
  for (const key of leftKeys) {
    if (--budget.remaining < 0 || !rightKeySet.has(key)) return false;
    const a = Object.getOwnPropertyDescriptor(left, key),
      b = Object.getOwnPropertyDescriptor(right, key);
    if (
      !a ||
      !b ||
      !("value" in a) ||
      !("value" in b) ||
      !sameSpanStateValue(a.value, b.value, budget, depth + 1)
    )
      return false;
  }
  return true;
}
const EMPTY_ROW_IDS: readonly string[] = Object.freeze([]);
const ROW_DRAG_MIME = "application/x-opengrid-managed-row";
const columnGap = (entry: Extract<ColumnWindowEntry, { kind: "spacer" }>) => (
  <div
    key={entry.key}
    role="presentation"
    aria-hidden="true"
    className="og-column-spacer"
    style={{ width: entry.width, minWidth: entry.width, flexShrink: 0 }}
  />
);

/** A row- and column-virtualized grid with optional variable row heights and detail rows. The supplied model owns data and persisted state. */
export function DataGrid<T>({
  model,
  direction = "ltr",
  height = 480,
  rowHeight = 38,
  getRowHeight,
  pinnedTopRowIds = EMPTY_ROW_IDS,
  pinnedBottomRowIds = EMPTY_ROW_IDS,
  isFullWidthRow,
  renderFullWidthRow,
  renderDetail,
  detailHeight = 180,
  defaultExpandedDetailRows = [],
  expandedDetailRows,
  onExpandedDetailRowsChange,
  overscan = 6,
  columnOverscan = 200,
  virtualizeColumns = true,
  columnGroups = true,
  selectionMode = "multiple",
  cellSelection = true,
  onCellRangeChange,
  editorOptions = {},
  renderEditor,
  editMode = "cell",
  rowConflictPolicy = "reject",
  onRowEdit,
  rowDragging = false,
  onRowMove,
  ariaLabel,
  toolbar = true,
  advancedFiltering = true,
  filterComponents,
  notes,
  pagination = true,
  className = "",
  renderCell,
  onCellEdit,
}: DataGridProps<T>) {
  const { t, locale, resolveMessage, number } = useGridLocale();
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const allColumns = model.getColumns();
  const hasColumnSpans = allColumns.some(
    (column) => column.colSpan !== undefined,
  );
  const hasRowSpans = allColumns.some(
    (column) =>
      column.spanRows === true || typeof column.spanRows === "function",
  );
  if (hasColumnSpans && hasRowSpans)
    throw new TypeError(
      "Combined row and column spanning is not supported in one grid",
    );
  const effectiveCellSelection =
    cellSelection && !hasColumnSpans && !hasRowSpans;
  const visibleOf = (column: Column<T>) =>
    Object.hasOwn(state.columnVisibility, column.id)
      ? state.columnVisibility[column.id]
      : !column.hidden;
  const ordered = [...allColumns]
    .sort((a, b) => {
      const ai = state.columnOrder.indexOf(a.id);
      const bi = state.columnOrder.indexOf(b.id);
      return (
        (ai < 0 ? allColumns.indexOf(a) : ai) -
        (bi < 0 ? allColumns.indexOf(b) : bi)
      );
    })
    .filter(visibleOf);
  const pinOf = (column: Column<T>) =>
    Object.prototype.hasOwnProperty.call(state.columnPinning, column.id)
      ? state.columnPinning[column.id]
      : column.pinned;
  const columns = getInlineColumnOrder(
    ordered.map((column) => ({
      ...column,
      hidden: false,
      pinned: pinOf(column),
    })),
    direction,
  ).map((index) => ordered[index]);
  const columnIds = columns.map((column) => column.id);
  const rowModel = model.getRowModel();
  const hierarchical =
    Boolean(renderDetail) ||
    rowModel.some(
      (node) =>
        node.kind === "group" ||
        node.depth > 0 ||
        Boolean(node.children?.length),
    );
  if (isFullWidthRow && !renderFullWidthRow)
    throw new TypeError("Full-width rows require renderFullWidthRow");
  const projection = useMemo(
    () =>
      createRowProjection(pagination ? model.getPageRows() : rowModel, {
        pinnedTopRowIds,
        pinnedBottomRowIds,
        isFullWidthRow,
      }),
    [
      model,
      state,
      pagination,
      pinnedTopRowIds,
      pinnedBottomRowIds,
      isFullWidthRow,
    ],
  );
  const rows = useMemo(
    () => projection.rows.map((entry) => entry.node),
    [projection],
  );
  const dataRowIds = useMemo(() => [...projection.rangeRowIds], [projection]);
  const selectionWidth =
    (selectionMode === "none" ? 0 : 44) + (rowDragging ? 32 : 0);
  const resizeAllowed = useRef(true);
  const columnResize = useColumnResize({
    model,
    direction,
    viewKey: JSON.stringify([
      pagination,
      columnGroups,
      pinnedTopRowIds,
      pinnedBottomRowIds,
      height,
      rowHeight,
      !!isFullWidthRow,
      !!renderDetail,
    ]),
    canResize: () => resizeAllowed.current,
    onCommitError: (error) =>
      setError(error instanceof Error ? error.message : String(error)),
  });
  const widthOf = (column: Column<T>) =>
    columnResize.preview?.columnId === column.id
      ? columnResize.preview.width
      : Object.hasOwn(state.columnWidths, column.id)
        ? state.columnWidths[column.id]
        : (column.width ?? 160);
  const totalWidth = columns.reduce(
    (width, column) => width + widthOf(column),
    selectionWidth,
  );
  const spanColumns = columns.map((column) => ({
    ...column,
    hidden: false,
    width: widthOf(column),
    pinned: pinOf(column),
  }));
  const spanPlanFor = useMemo(() => {
    const ordinary = createColumnSpanPlan(
      spanColumns,
      { kind: "group" },
      { direction },
    );
    const cache = new Map<number, ReturnType<typeof createColumnSpanPlan<T>>>();
    // Find can visit the entire resident view. Retain only a bounded recent window,
    // and build plans lazily for rendered rows or explicit navigation/search targets.
    return (row: number) => {
      const node = rows[row];
      if (
        !hasColumnSpans ||
        !node ||
        node.kind !== "row" ||
        node.data === undefined ||
        projection.rows[row].fullWidth
      )
        return ordinary;
      let plan = cache.get(row);
      if (plan) cache.delete(row);
      else
        plan = createColumnSpanPlan(
          spanColumns,
          {
            kind: "row",
            row: node.data,
          },
          { direction },
        );
      cache.set(row, plan);
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
      return plan;
    };
  }, [
    model,
    state,
    projection,
    hasColumnSpans,
    direction,
    columnResize.preview?.columnId,
    columnResize.preview?.width,
  ]);
  function ownerAt(row: number, leaf: number) {
    return getColumnSpanOwner(spanPlanFor(row), leaf);
  }
  function ownerColumnId(row: number, columnId: string) {
    return (
      ownerAt(
        row,
        columns.findIndex((column) => column.id === columnId),
      )?.columnId ??
      columns[0]?.id ??
      ""
    );
  }
  const groupedColumns = columns.map((column) => ({
    id: column.id,
    header: column.header,
    groupPath: columnGroups ? column.groupPath : undefined,
    width: widthOf(column),
    pinned: pinOf(column),
  }));
  const groupDepth = computeHeaderGroups(groupedColumns, { direction }).length;
  const headerRows = groupDepth + 2;
  const headerHeight = headerRows * 38;
  const viewport = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const pendingRowSpanEditMove = useRef<CellPosition | null>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  const fullWidthCells = useRef(new Map<string, HTMLDivElement>());
  const ownsCellFocus = useRef(false);
  const rowGripTouch = useRef(false);
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const rowHandles = useRef(new Map<string, HTMLButtonElement>());
  const managedDrag = useRef<{
    model: GridModel<T>;
    rowId: string;
    signature: string;
    payload: string;
    columnId: string;
    x: number;
    y: number;
    owned: boolean;
  } | null>(null);
  const rowDragFrame = useRef(0);
  const rowDragSequence = useRef(0);
  const rowDragOwner = useId();
  const rowMoveHelpId = useId();
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<{
    rowId: string;
    position: "before" | "after";
  } | null>(null);
  const movedFocus = useRef<{
    rowId: string;
    columnId: string;
    origin: "cell" | "handle" | "none";
  } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const previousDirection = useRef(direction);
  const [viewportWidth, setViewportWidth] = useState(1024);
  function scrollMaximum(container: HTMLElement) {
    return Math.max(
      0,
      (container.scrollWidth || totalWidth) -
        (container.clientWidth || viewportWidth),
    );
  }
  function readInlineScroll(container: HTMLElement) {
    return normalizeScrollLeft(
      container.scrollLeft,
      scrollMaximum(container),
      direction,
    );
  }
  function writeInlineScroll(container: HTMLElement, value: number) {
    const maximum = scrollMaximum(container);
    const offset = Math.max(0, Math.min(maximum, value));
    container.scrollLeft = denormalizeScrollLeft(offset, maximum, direction);
    return offset;
  }
  const [focusedFilterColumnId, setFocusedFilterColumnId] = useState<
    string | null
  >(null);
  const FilterOwner = useMemo(
    () =>
      function FilterOwner({ children }: { children: ReactNode }) {
        return <>{children}</>;
      },
    [model],
  );
  const [focus, setFocus] = useState<FocusCell>({
    rowId: rows[0]?.id ?? "",
    columnId: columns[0]?.id ?? "",
  });
  const focusRow = Math.max(
    0,
    rows.findIndex((node) => node.id === focus.rowId),
  );
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const [rowEditing, setRowEditing] = useState<{
    model: GridModel<T>;
    position: CellPosition;
  } | null>(null);
  const [restoreRowFocus, setRestoreRowFocus] = useState<CellPosition | null>(
    null,
  );
  const [errorMessage, setError] = useState<GridMessage | string>("");
  const error = resolveMessage(errorMessage);
  const [announcement, setAnnouncement] = useState<GridMessage | string>("");
  const [collapsedGroups, setCollapsedGroups] = useState<string[][]>([]);
  const groupVisibility = useRef(new Map<string, Record<string, boolean>>());
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const findInput = useRef<HTMLInputElement>(null);
  const [noteEditing, setNoteEditing] = useState<CellPosition | null>(null);
  resizeAllowed.current =
    !editing && !rowEditing && !noteEditing && !managedDrag.current;
  const defaultNotes = useMemo(() => new CellNotesStore(), []);
  const notesStore = notes === false ? defaultNotes : (notes ?? defaultNotes);
  useSyncExternalStore(
    notesStore.subscribe,
    notesStore.getSnapshot,
    notesStore.getSnapshot,
  );
  const [localDetails, setLocalDetails] = useState<string[]>(() => [
    ...defaultExpandedDetailRows,
  ]);
  const detailIds = expandedDetailRows ?? localDetails;
  const helpId = useId();
  const errorId = useId();
  const requestedHeight = Number.isFinite(height)
    ? Math.max(140, headerHeight + 64, height)
    : Math.max(480, headerHeight + 64);
  const safeRowHeight = Number.isFinite(rowHeight)
    ? Math.max(24, rowHeight)
    : 38;
  const safeOverscan = Number.isFinite(overscan)
    ? Math.max(0, Math.floor(overscan))
    : 6;
  const columnEntries = getColumnWindow(
    columns.map((column) => ({
      width: widthOf(column),
      pinned: pinOf(column),
    })),
    {
      direction,
      scrollLeft,
      viewportWidth,
      leadingWidth: selectionWidth,
      overscan: Number.isFinite(columnOverscan)
        ? Math.max(0, columnOverscan)
        : 200,
      enabled: virtualizeColumns,
      retainIndices: [
        columns.findIndex((column) => column.id === focus.columnId),
        columns.findIndex((column) => column.id === editing?.columnId),
        columns.findIndex((column) => column.id === focusedFilterColumnId),
      ],
    },
  );
  const rowGeometry = useMemo(() => {
    const expanded = new Set(detailIds);
    let detailsBefore = 0;
    const baseHeights: number[] = [],
      detailHeights: number[] = [],
      before: number[] = [];
    for (const node of rows) {
      const requested = getRowHeight?.(node) ?? safeRowHeight;
      baseHeights.push(
        Number.isFinite(requested) && requested >= 24
          ? requested
          : safeRowHeight,
      );
      let detail = 0;
      if (
        renderDetail &&
        node.kind === "row" &&
        node.data &&
        expanded.has(node.id)
      ) {
        const requestedDetail =
          typeof detailHeight === "function"
            ? detailHeight(node.data)
            : detailHeight;
        detail = Number.isFinite(requestedDetail)
          ? Math.max(40, Math.min(2000, requestedDetail))
          : 180;
      }
      detailHeights.push(detail);
      before.push(detailsBefore);
      if (detail) detailsBefore++;
    }
    const makeLayout = (region: RowRegion) =>
      createRowLayout(
        projection[region].map(
          (entry) =>
            baseHeights[entry.visualIndex] + detailHeights[entry.visualIndex],
        ),
      );
    const layouts = {
      top: makeLayout("top"),
      body: makeLayout("body"),
      bottom: makeLayout("bottom"),
    };
    return {
      layout: layouts.body,
      layouts,
      offset: (row: number) => {
        const entry = projection.rows[row];
        return layouts[entry.region].offset(entry.regionIndex);
      },
      baseHeights,
      detailHeights,
      before,
      detailCount: detailsBefore,
    };
  }, [
    model,
    state,
    pagination,
    projection,
    safeRowHeight,
    getRowHeight,
    renderDetail,
    detailHeight,
    JSON.stringify(detailIds),
  ]);
  const pinnedTopHeight = rowGeometry.layouts.top.totalHeight;
  const rowSpanCache = useRef<{
    model: GridModel<T>;
    state: ReturnType<GridModel<T>["getState"]>;
    columns: { id: string; spanRows: Column<T>["spanRows"] }[];
    rows: RowSpanRow<T>[];
    plan: RowSpanPlan;
  } | null>(null);
  const rowSpanColumns = columns.filter(
    (column) =>
      column.spanRows === true || typeof column.spanRows === "function",
  );
  let rowSpanPlan: RowSpanPlan | undefined;
  if (hasRowSpans) {
    if (rows.length > 100000 || rowSpanColumns.length > 8)
      throw new RangeError(
        "Row spanning supports at most 100000 visible rows and 8 active columns",
      );
    const cached = rowSpanCache.current;
    // Reuse only unchanged snapshots or recognized cosmetic updates. Any other
    // notification (including an identical-field expiry or setRows refresh) may
    // refresh external inputs used by a pure getter or adjacent-row predicate.
    const changedFields =
      cached && cached.state !== state
        ? (Object.keys(state) as (keyof typeof state)[]).filter(
            (key) => !sameSpanStateValue(cached.state[key], state[key]),
          )
        : [];
    const cosmeticState =
      cached &&
      (cached.state === state ||
        (Object.keys(cached.state).length === Object.keys(state).length &&
          changedFields.length > 0 &&
          changedFields.every(
            (key) => key === "selected" || key === "columnWidths",
          )));
    const reusable =
      cached?.model === model &&
      cosmeticState &&
      cached.columns.length === rowSpanColumns.length &&
      cached.columns.every(
        (column, index) =>
          column.id === rowSpanColumns[index].id &&
          column.spanRows === rowSpanColumns[index].spanRows,
      ) &&
      cached.rows.length === rows.length &&
      cached.rows.every((old, index) => {
        const node = rows[index],
          entry = projection.rows[index];
        return (
          old.id === node.id &&
          old.data === node.data &&
          old.kind === node.kind &&
          old.leaf === !node.children?.length &&
          old.depth === node.depth &&
          old.fullWidth === entry.fullWidth &&
          old.region === entry.region &&
          old.top === rowGeometry.offset(index) &&
          old.height === rowGeometry.baseHeights[index] &&
          old.detailHeight === rowGeometry.detailHeights[index]
        );
      });
    if (reusable) {
      rowSpanPlan = cached.plan;
      cached.state = state;
    } else {
      const spanRows: RowSpanRow<T>[] = rows.map((node, index) => ({
        id: node.id,
        kind: node.kind,
        data: node.data,
        leaf: !node.children?.length,
        depth: node.depth,
        fullWidth: projection.rows[index].fullWidth,
        region: projection.rows[index].region,
        top: rowGeometry.offset(index),
        height: rowGeometry.baseHeights[index],
        detailHeight: rowGeometry.detailHeights[index],
      }));
      rowSpanPlan = createRowSpanPlan(spanRows, rowSpanColumns, {
        getValue: (row, columnId) => model.getValue(row, columnId),
      });
      rowSpanCache.current = {
        model,
        state,
        columns: rowSpanColumns.map((column) => ({
          id: column.id,
          spanRows: column.spanRows,
        })),
        rows: spanRows,
        plan: rowSpanPlan,
      };
    }
  } else rowSpanCache.current = null;
  function ownerRowAt(row: number, columnId: string) {
    return rowSpanPlan?.ownerAt(row, columnId)?.ownerIndex ?? row;
  }
  const pinnedBottomHeight = rowGeometry.layouts.bottom.totalHeight;
  const safeHeight = Math.max(
    requestedHeight,
    headerHeight + pinnedTopHeight + pinnedBottomHeight + 64,
  );
  const bodyViewportHeight =
    safeHeight - headerHeight - pinnedTopHeight - pinnedBottomHeight;
  const { start: first, end: last } = rowGeometry.layout.window(
    scrollTop,
    bodyViewportHeight,
    safeOverscan,
  );
  const renderedRowIndices = projection.body
    .slice(first, last)
    .map((entry) => entry.visualIndex);
  const rowSpanAnchorCells = new Map<number, Set<string>>();
  if (rowSpanPlan && last > first) {
    const firstRow = projection.body[first].visualIndex;
    const lastRow = projection.body[last - 1].visualIndex + 1;
    const renderedColumns = columnEntries.flatMap((entry) =>
      entry.kind === "column" ? [columns[entry.index].id] : [],
    );
    for (const run of rowSpanPlan.intersecting(
      firstRow,
      lastRow,
      renderedColumns,
    )) {
      if (run.ownerIndex >= firstRow) continue;
      const retained =
        rowSpanAnchorCells.get(run.ownerIndex) ?? new Set<string>();
      retained.add(run.columnId);
      rowSpanAnchorCells.set(run.ownerIndex, retained);
      if (!renderedRowIndices.includes(run.ownerIndex))
        renderedRowIndices.push(run.ownerIndex);
    }
  }
  for (const retained of [
    focusRow,
    editing ? rows.findIndex((node) => node.id === editing.rowId) : -1,
  ]) {
    if (
      retained >= 0 &&
      retained < rows.length &&
      projection.rows[retained].region === "body" &&
      !renderedRowIndices.includes(retained)
    )
      renderedRowIndices.push(retained);
  }
  renderedRowIndices.sort((a, b) => a - b);
  const selected = new Set(state.selected);
  const keyOf = (row: number, id: string) =>
    JSON.stringify([rows[row]?.id ?? "", id]);
  const pageCount = model.getPageCount();
  const coreReorder =
    typeof model.getRowReorderStatus === "function"
      ? model.getRowReorderStatus()
      : {
          allowed: false as const,
          message: gridMessage("move.unsupported"),
        };
  function reorderReason(
    status: ReturnType<GridModel<T>["getRowReorderStatus"]>,
  ): GridMessage | string | undefined {
    if (status.allowed) return;
    switch (getBuiltinRowReorderReason(status)) {
      case "sorting":
        return gridMessage("move.sorting");
      case "filtering":
        return gridMessage("move.filtering");
      case "grouping":
        return gridMessage("move.grouping");
      case "tree-data":
        return gridMessage("move.tree");
      case "external-filter":
        return gridMessage("move.externalFilter");
      default:
        return status.message;
    }
  }
  const rowMoveReason = !rowDragging
    ? gridMessage("move.disabled")
    : hasRowSpans
      ? gridMessage("move.rowSpans")
      : !coreReorder.allowed
        ? "reason" in coreReorder
          ? reorderReason(coreReorder)
          : coreReorder.message
        : !columns.length
          ? gridMessage("move.noColumns")
          : editing || rowEditing || noteEditing
            ? gridMessage("move.editing")
            : projection.top.length || projection.bottom.length
              ? gridMessage("move.pins")
              : projection.rows.some((entry) => entry.fullWidth)
                ? gridMessage("move.fullWidth")
                : rowGeometry.detailCount
                  ? gridMessage("move.details")
                  : rows.some(
                        (node) =>
                          node.kind !== "row" ||
                          node.data === undefined ||
                          node.depth !== 0 ||
                          node.children?.length,
                      )
                    ? gridMessage("move.flat")
                    : undefined;
  const rowViewSignature = JSON.stringify([
    state.page,
    rows.map((node) => node.id),
  ]);
  const liveRowMove = useRef({
    model,
    reason: rowMoveReason,
    signature: rowViewSignature,
    topInset: headerHeight + pinnedTopHeight,
    bottomInset: pinnedBottomHeight,
  });
  liveRowMove.current = {
    model,
    reason: rowMoveReason,
    signature: rowViewSignature,
    topInset: headerHeight + pinnedTopHeight,
    bottomInset: pinnedBottomHeight,
  };
  const ranges = useCellRanges({
    model,
    rowIds: dataRowIds,
    columnIds,
    enabled: effectiveCellSelection,
    viewport,
    headerHeight,
    pinnedTopHeight,
    pinnedBottomHeight,
    getFocusedCell: () =>
      rows[focusRow]?.kind === "row" && !projection.rows[focusRow]?.fullWidth
        ? { rowId: rows[focusRow].id, columnId: focus.columnId }
        : undefined,
    onMessage: (message, failed) => {
      setError(failed ? message : "");
      setAnnouncement(message);
    },
  });
  const touchTaps = useTouchTaps({
    viewport,
    model,
    viewKey: state,
    direction,
    onTap: (position) => {
      if (rowEditing || noteEditing) return;
      const row = projection.indexOf(position.rowId);
      if (row < 0) return;
      const columnId = ownerColumnId(row, position.columnId),
        owner = ownerRowAt(row, columnId);
      ownsCellFocus.current = true;
      setFocus({ rowId: rows[owner].id, columnId });
      cells.current.get(keyOf(owner, columnId))?.focus({ preventScroll: true });
      if (rows[owner].kind === "row")
        ranges.select({ rowId: rows[owner].id, columnId });
    },
    onDoubleTap: (position) => {
      if (ranges.extendOnTap || rowEditing || noteEditing) return;
      const row = projection.indexOf(position.rowId),
        column = columns.findIndex((column) => column.id === position.columnId);
      if (
        row < 0 ||
        column < 0 ||
        !columns[column].editable ||
        rows[row].kind !== "row"
      )
        return;
      focusAt(row, column, false, undefined, false);
      startEdit(rows[row], columns[column]);
    },
  });
  useLayoutEffect(() => {
    touchTaps.cancel();
    if (editing || rowEditing || noteEditing) ranges.cancelGesture();
  }, [ranges.extendOnTap, editing, rowEditing, noteEditing]);
  const finder = useFind(
    model,
    dataRowIds,
    (position) => {
      const row = projection.indexOf(position.rowId);
      return (
        row >= 0 &&
        ownerColumnId(row, position.columnId) === position.columnId &&
        ownerRowAt(row, position.columnId) === row
      );
    },
    columnIds,
  );
  const findMatches = useMemo(
    () =>
      new Set(
        finder.snapshot.matches.map((position) =>
          JSON.stringify([position.rowId, position.columnId]),
        ),
      ),
    [finder.snapshot.matches],
  );
  const activeFind = finder.snapshot.matches[finder.snapshot.activeIndex];
  useLayoutEffect(() => {
    if (findOpen) findInput.current?.focus();
  }, [findOpen]);
  useEffect(() => {
    onCellRangeChange?.(ranges.range);
  }, [onCellRangeChange, ranges.range]);

  useEffect(() => () => stopManagedDrag(), [model, rowDragging]);
  useEffect(() => {
    if (
      managedDrag.current &&
      (managedDrag.current.signature !== rowViewSignature || rowMoveReason)
    )
      stopManagedDrag(gridMessage("move.changed"));
  }, [
    rowViewSignature,
    typeof rowMoveReason === "string" ? rowMoveReason : rowMoveReason?.key,
  ]);
  useEffect(() => {
    const cancel = () => stopManagedDrag();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && managedDrag.current) {
        event.preventDefault();
        stopManagedDrag(gridMessage("move.cancelled"));
      }
    };
    const track = (event: globalThis.DragEvent) => {
      const source = managedDrag.current;
      if (!source) return;
      source.x = event.clientX;
      source.y = event.clientY;
      source.owned = ownedDragTarget(event.target);
      if (!source.owned && rowDragFrame.current) {
        window.cancelAnimationFrame(rowDragFrame.current);
        rowDragFrame.current = 0;
      }
      const candidate =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".og-row[data-row-key]")
          : null;
      if (
        !source.owned ||
        !candidate ||
        rowElements.current.get(candidate.dataset.rowKey!) !== candidate
      )
        setRowDropTarget(null);
    };
    // An outside entry may arrive before the next dragover. Stop using the
    // previous in-grid point without cancelling the drag, so re-entry can resume.
    const enter = (event: globalThis.DragEvent) => {
      if (managedDrag.current && !ownedDragTarget(event.target)) track(event);
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    window.addEventListener("dragover", track, true);
    window.addEventListener("dragenter", enter, true);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("dragover", track, true);
      window.removeEventListener("dragenter", enter, true);
    };
  }, []);
  useEffect(() => {
    if (
      focusedFilterColumnId &&
      !columns.some((column) => column.id === focusedFilterColumnId)
    )
      setFocusedFilterColumnId(null);
  }, [
    model,
    focusedFilterColumnId,
    columns.map((column) => column.id).join("\u0000"),
  ]);
  useLayoutEffect(() => {
    if (rowEditing) setRestoreRowFocus(rowEditing.position);
    setRowEditing(null);
    editingRef.current = null;
    setEditing(null);
    setError("");
  }, [model, editMode]);
  useEffect(() => {
    if (rowEditing || !restoreRowFocus) return;
    setRestoreRowFocus(null);
    if (!focusMatch(restoreRowFocus)) {
      if (rows.length && columns.length) focusAt(0, 0);
      else viewport.current?.focus({ preventScroll: true });
    }
  }, [rowEditing, restoreRowFocus, model]);
  useLayoutEffect(() => {
    editingRef.current = null;
    setEditing(null);
    setError("");
    groupVisibility.current.clear();
    setCollapsedGroups((current) => (current.length ? [] : current));
  }, [model]);
  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const measure = () => {
      if (container.clientWidth > 0) setViewportWidth(container.clientWidth);
    };
    measure();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : undefined;
    observer?.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const flipped = previousDirection.current !== direction;
    previousDirection.current = direction;
    let offset = flipped ? scrollLeft : readInlineScroll(container);
    if (flipped) {
      const index = columns.findIndex((column) => column.id === focus.columnId);
      const span = ownerAt(focusRow, index);
      if (span && !span.pinned) {
        offset = createDirectionLayout({
          direction,
          viewportWidth: container.clientWidth || viewportWidth,
          contentWidth: totalWidth,
          scrollOffset: offset,
          leadingWidth: selectionWidth,
          leftPinnedWidth: columns
            .filter((column) => pinOf(column) === "left")
            .reduce((sum, column) => sum + widthOf(column), 0),
          rightPinnedWidth: columns
            .filter((column) => pinOf(column) === "right")
            .reduce((sum, column) => sum + widthOf(column), 0),
        }).scrollToReveal(span.offset + selectionWidth, span.width);
      }
    }
    const clamped = writeInlineScroll(container, offset);
    if (clamped !== scrollLeft) setScrollLeft(clamped);
  }, [totalWidth, viewportWidth, direction]);
  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const maximum = Math.max(
      0,
      rowGeometry.layout.totalHeight +
        headerHeight +
        pinnedTopHeight +
        pinnedBottomHeight -
        (container.clientHeight || safeHeight),
    );
    if (container.scrollTop > maximum) {
      container.scrollTop = maximum;
      setScrollTop(maximum);
    }
  }, [
    rows.length,
    rowGeometry,
    safeRowHeight,
    safeHeight,
    state.page,
    state.groupBy.join("\u0000"),
    headerHeight,
    pinnedTopHeight,
    pinnedBottomHeight,
  ]);
  useEffect(() => {
    setFocus((current) => {
      const row = Math.max(0, projection.indexOf(current.rowId));
      const columnId = ownerColumnId(row, current.columnId);
      const owner = ownerRowAt(row, columnId);
      const rowId = rows[owner]?.id ?? "";
      return current.rowId === rowId && current.columnId === columnId
        ? current
        : { rowId, columnId };
    });
  }, [projection, spanPlanFor, rowSpanPlan]);
  useLayoutEffect(() => {
    const current = editingRef.current;
    if (!current) return;
    const row = projection.indexOf(current.rowId);
    if (
      row < 0 ||
      !columns.some((column) => column.id === current.columnId) ||
      ownerColumnId(row, current.columnId) !== current.columnId ||
      ownerRowAt(row, current.columnId) !== row
    ) {
      cancelEdit();
      setAnnouncement(gridMessage("grid.hiddenEditCancelled"));
    }
  }, [spanPlanFor, projection, rowSpanPlan]);
  useLayoutEffect(() => {
    if (!ownsCellFocus.current || editing || rowEditing || noteEditing) return;
    const row = ownerRowAt(projection.indexOf(focus.rowId), focus.columnId);
    if (row < 0) return;
    const element = projection.rows[row].fullWidth
      ? fullWidthCells.current.get(focus.rowId)
      : cells.current.get(keyOf(row, ownerColumnId(row, focus.columnId)));
    if (
      element &&
      document.activeElement !== element &&
      (!document.activeElement ||
        document.activeElement === document.body ||
        !document.activeElement.isConnected)
    )
      element.focus({ preventScroll: true });
  }, [
    projection,
    spanPlanFor,
    rowSpanPlan,
    editing,
    rowEditing,
    noteEditing,
    focus,
  ]);
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      const cell = projection.rows[focusRow]?.fullWidth
        ? fullWidthCells.current.get(rows[focusRow].id)
        : cells.current.get(
            keyOf(
              ownerRowAt(focusRow, focus.columnId),
              ownerColumnId(focusRow, focus.columnId),
            ),
          );
      if (cell) {
        cell.focus({ preventScroll: true });
        pendingFocus.current = false;
      }
    }
  });
  useLayoutEffect(() => {
    const pending = pendingRowSpanEditMove.current;
    if (!pending || editing) return;
    pendingRowSpanEditMove.current = null;
    const row = projection.indexOf(pending.rowId);
    const column = columns.findIndex(
      (column) => column.id === pending.columnId,
    );
    if (row >= 0 && column >= 0)
      focusAt(
        rowSpanPlan?.ownerAt(row, pending.columnId)?.end ?? row + 1,
        column,
      );
  }, [editing, rowSpanPlan, projection]);
  useLayoutEffect(() => {
    const requested = movedFocus.current;
    if (!requested) return;
    const index = projection.indexOf(requested.rowId),
      container = viewport.current;
    if (index < 0 || !container) {
      movedFocus.current = null;
      return;
    }
    const top = rowGeometry.offset(index),
      visible = Math.max(
        safeRowHeight,
        (container.clientHeight || safeHeight) -
          headerHeight -
          pinnedTopHeight -
          pinnedBottomHeight,
      );
    if (top < container.scrollTop) container.scrollTop = top;
    else if (
      top + rowGeometry.baseHeights[index] >
      container.scrollTop + visible
    )
      container.scrollTop = top + rowGeometry.baseHeights[index] - visible;
    setScrollTop(container.scrollTop);
    const element =
      requested.origin === "handle"
        ? rowHandles.current.get(requested.rowId)
        : requested.origin === "cell"
          ? cells.current.get(
              keyOf(index, ownerColumnId(index, requested.columnId)),
            )
          : undefined;
    movedFocus.current = null;
    element?.focus({ preventScroll: true });
  }, [projection, focus]);

  function focusAt(
    row: number,
    column: number,
    extend = false,
    anchor?: CellPosition,
    takeFocus = true,
  ) {
    if (!rows.length) return;
    extend = extend && effectiveCellSelection;
    row = clamp(row, 0, rows.length - 1);
    if (extend && projection.rows[row].fullWidth) {
      const step = row >= focusRow ? 1 : -1;
      while (row >= 0 && row < rows.length && projection.rows[row].fullWidth)
        row += step;
      if (row < 0 || row >= rows.length) return;
    }
    if (!columns.length && !projection.rows[row].fullWidth) return;
    column = clamp(column, 0, columns.length - 1);
    column = ownerAt(row, column)?.start ?? column;
    row = ownerRowAt(row, columns[column]?.id ?? "");
    if (extend && !ranges.controller?.getSnapshot().range) {
      if (anchor) ranges.select(anchor);
      else if (rows[focusRow]?.kind === "row")
        ranges.select({ rowId: rows[focusRow].id, columnId: focus.columnId });
    }
    if (
      rows[row].kind === "row" &&
      !projection.rows[row].fullWidth &&
      columns[column]
    )
      ranges.select(
        { rowId: rows[row].id, columnId: columns[column].id },
        extend,
      );
    if (projection.rows[row].fullWidth && !extend) ranges.clear();
    const container = viewport.current;
    if (container) {
      const top = rowGeometry.offset(row);
      const visibleHeight = Math.max(
        safeRowHeight,
        (container.clientHeight || safeHeight) -
          headerHeight -
          pinnedTopHeight -
          pinnedBottomHeight,
      );
      if (projection.rows[row].region === "body" && top < container.scrollTop)
        container.scrollTop = top;
      else if (
        projection.rows[row].region === "body" &&
        top + rowGeometry.baseHeights[row] > container.scrollTop + visibleHeight
      )
        container.scrollTop =
          top + rowGeometry.baseHeights[row] - visibleHeight;
      setScrollTop(container.scrollTop);
      // Scroll unpinned columns into view without disturbing pinned columns.
      const target = columns[column];
      if (target && !projection.rows[row].fullWidth && !pinOf(target)) {
        const span = ownerAt(row, column);
        const layout = createDirectionLayout({
          direction,
          viewportWidth: container.clientWidth || viewportWidth,
          contentWidth: totalWidth,
          scrollOffset: readInlineScroll(container),
          leadingWidth: selectionWidth,
          leftPinnedWidth: columns
            .filter((c) => pinOf(c) === "left")
            .reduce((sum, c) => sum + widthOf(c), 0),
          rightPinnedWidth: columns
            .filter((c) => pinOf(c) === "right")
            .reduce((sum, c) => sum + widthOf(c), 0),
        });
        writeInlineScroll(
          container,
          layout.scrollToReveal(
            (span?.offset ?? 0) + selectionWidth,
            span?.width ?? widthOf(target),
          ),
        );
      }
      setScrollLeft(readInlineScroll(container));
    }
    pendingFocus.current = takeFocus;
    setFocus({ rowId: rows[row].id, columnId: columns[column]?.id ?? "" });
  }

  function cellStyle(column: Column<T>, span?: ColumnSpanCell): CSSProperties {
    const width = span?.width ?? widthOf(column);
    const pin = pinOf(column);
    const style: CSSProperties = { width, minWidth: width, maxWidth: width };
    if (pin === "left")
      Object.assign(style, {
        position: "sticky",
        left: span
          ? (span.leftOffset ?? 0) + (direction === "ltr" ? selectionWidth : 0)
          : columns
              .slice(
                direction === "ltr" ? 0 : columns.indexOf(column) + 1,
                direction === "ltr" ? columns.indexOf(column) : undefined,
              )
              .filter((c) => pinOf(c) === "left")
              .reduce(
                (x, c) => x + widthOf(c),
                direction === "ltr" ? selectionWidth : 0,
              ),
        zIndex: 2,
      });
    if (pin === "right")
      Object.assign(style, {
        position: "sticky",
        right: span
          ? (span.rightOffset ?? 0) + (direction === "rtl" ? selectionWidth : 0)
          : columns
              .slice(
                direction === "rtl" ? 0 : columns.indexOf(column) + 1,
                direction === "rtl" ? columns.indexOf(column) : undefined,
              )
              .filter((c) => pinOf(c) === "right")
              .reduce(
                (x, c) => x + widthOf(c),
                direction === "rtl" ? selectionWidth : 0,
              ),
        zIndex: 2,
      });
    return style;
  }

  function toggleDetails(rowId: string) {
    const next = detailIds.includes(rowId)
      ? detailIds.filter((id) => id !== rowId)
      : [...detailIds, rowId];
    if (expandedDetailRows === undefined) setLocalDetails(next);
    onExpandedDetailRowsChange?.(next);
  }
  function applyColumnFilter(columnId: string, filter?: Filter) {
    model.setFilter(columnId, filter);
    if (viewport.current) viewport.current.scrollTop = 0;
    setScrollTop(0);
  }
  function renderColumnFilter(column: Column<T>) {
    const filter = Object.hasOwn(state.filters, column.id)
      ? state.filters[column.id]
      : undefined;
    const Component =
      filterComponents && Object.hasOwn(filterComponents, column.id)
        ? filterComponents[column.id]
        : undefined;
    const label = t("grid.filterColumn", {
      column: column.header ?? column.id,
    });
    return (
      <FilterOwner>
        {Component ? (
          <Component
            column={column}
            model={model}
            filter={filter}
            label={label}
            onFilterChange={(filter) => applyColumnFilter(column.id, filter)}
            onClear={() => applyColumnFilter(column.id)}
          />
        ) : (
          <input
            aria-label={label}
            placeholder={
              column.type === "number" || column.type === "bigint"
                ? t("grid.numberFilterPlaceholder")
                : t("grid.filterPlaceholder")
            }
            value={text(filter?.value)}
            onChange={(event) =>
              applyColumnFilter(
                column.id,
                event.target.value
                  ? {
                      op:
                        column.type === "number" ||
                        column.type === "bigint" ||
                        column.type === "boolean" ||
                        column.type === "date"
                          ? "equals"
                          : "contains",
                      value: event.target.value,
                    }
                  : undefined,
              )
            }
          />
        )}
      </FilterOwner>
    );
  }
  function toggleColumnGroup(path: string[]) {
    const same = (left: readonly string[], right: readonly string[]) =>
      JSON.stringify(left) === JSON.stringify(right);
    const prefix = (left: readonly string[], right: readonly string[]) =>
      left.length < right.length &&
      left.every((part, index) => part === right[index]);
    const nextVisibility = { ...state.columnVisibility };
    const restoreVisibility = (saved: Record<string, boolean>) => {
      for (const [id, visible] of Object.entries(saved))
        Object.defineProperty(nextVisibility, id, {
          value: visible,
          enumerable: true,
          configurable: true,
          writable: true,
        });
    };
    let nextCollapsed = [...collapsedGroups];
    for (const ancestor of collapsedGroups
      .filter((item) => prefix(item, path))
      .sort((a, b) => a.length - b.length)) {
      restoreVisibility(
        groupVisibility.current.get(JSON.stringify(ancestor)) ?? {},
      );
      groupVisibility.current.delete(JSON.stringify(ancestor));
      nextCollapsed = nextCollapsed.filter((item) => !same(item, ancestor));
    }
    const key = JSON.stringify(path),
      members = allColumns.filter((column) =>
        path.every((part, index) => column.groupPath?.[index] === part),
      );
    if (!members.length) return;
    if (nextCollapsed.some((item) => same(item, path))) {
      restoreVisibility(
        groupVisibility.current.get(key) ??
          Object.fromEntries(members.map((column) => [column.id, true])),
      );
      groupVisibility.current.delete(key);
      nextCollapsed = nextCollapsed.filter((item) => !same(item, path));
    } else {
      groupVisibility.current.set(
        key,
        Object.fromEntries(
          members.map((column) => [
            column.id,
            Object.hasOwn(nextVisibility, column.id)
              ? nextVisibility[column.id]
              : visibleOf(column),
          ]),
        ),
      );
      const keep =
        members.find((column) =>
          Object.hasOwn(nextVisibility, column.id)
            ? nextVisibility[column.id]
            : visibleOf(column),
        ) ?? members[0];
      for (const column of members)
        Object.defineProperty(nextVisibility, column.id, {
          value: column.id === keep.id,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      nextCollapsed.push([...path]);
    }
    model.setState({ columnVisibility: nextVisibility });
    setCollapsedGroups(nextCollapsed);
  }
  function focusMatch(position: CellPosition | undefined, takeFocus = true) {
    if (!position) return false;
    const row = rows.findIndex((node) => node.id === position.rowId),
      column = columns.findIndex((item) => item.id === position.columnId);
    if (row >= 0 && column >= 0) {
      focusAt(row, column, false, undefined, takeFocus);
      return true;
    }
    return false;
  }
  function openNote(position?: CellPosition) {
    const target =
      position ??
      (rows[focusRow]?.kind === "row"
        ? { rowId: rows[focusRow].id, columnId: focus.columnId }
        : undefined);
    if (target && notes !== false) {
      const row = projection.indexOf(target.rowId);
      if (row >= 0)
        setNoteEditing({
          rowId: rows[ownerRowAt(row, target.columnId)].id,
          columnId: ownerColumnId(row, target.columnId),
        });
    }
  }
  function startEdit(node: RowNode<T>, column: Column<T>, initial?: string) {
    const owner = ownerAt(projection.indexOf(node.id), columns.indexOf(column));
    if (!owner) return;
    column = columns[owner.start];
    if (editMode === "row") {
      if (node.kind !== "row" || !node.data || initial !== undefined) return;
      editingRef.current = null;
      setEditing(null);
      setError("");
      setRowEditing({
        model,
        position: { rowId: node.id, columnId: column.id },
      });
      return;
    }
    node = rows[ownerRowAt(projection.indexOf(node.id), column.id)];
    if (!column.editable || !node.data || node.kind !== "row") return;
    const next = {
      rowId: node.id,
      columnId: column.id,
      draft: initial ?? text(model.getValue(node.data, column.id)),
    };
    editingRef.current = next;
    setEditing(next);
    setError("");
  }
  function commitEdit() {
    const current = editingRef.current;
    if (!current) return true;
    const message = model.editCell(
      current.rowId,
      current.columnId,
      current.draft,
    );
    onCellEdit?.({
      rowId: current.rowId,
      columnId: current.columnId,
      value: current.draft,
      error: message,
    });
    if (message) {
      setError(message);
      return false;
    }
    editingRef.current = null;
    setEditing(null);
    setError("");
    setAnnouncement(gridMessage("grid.cellUpdated"));
    return true;
  }
  function cancelEdit() {
    editingRef.current = null;
    setEditing(null);
    setError("");
  }
  function renderEditorControl(
    node: RowNode<T>,
    column: Column<T>,
    row: number,
    index: number,
  ) {
    if (!editing || !node.data) return null;
    const config = editorOptions[column.id] ?? {};
    const props: CellEditorProps<T> = {
      row: node.data,
      column,
      value: editing.draft,
      label: t("grid.editCell", {
        column: column.header ?? column.id,
        rowId: node.id,
      }),
      editorType: config.type,
      options: config.options,
      asyncOptions: config.asyncOptions,
      error: error || undefined,
      errorId,
      inlineValidation: false,
      onChange: (value) => {
        const next = { ...editing, draft: value };
        editingRef.current = next;
        setEditing(next);
        setError("");
      },
      onCommit: () => {
        const accepted = commitEdit();
        if (accepted) focusAt(row, index);
        return accepted;
      },
      onCancel: () => {
        cancelEdit();
        focusAt(row, index);
      },
      onBlur: commitEdit,
      onKeyDown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelEdit();
          focusAt(row, index);
        }
        if (
          event.key === "Enter" &&
          (config.type !== "largeText" || event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (commitEdit()) {
            if (hasRowSpans) {
              pendingRowSpanEditMove.current = {
                rowId: node.id,
                columnId: column.id,
              };
              setFocus((current) => ({ ...current }));
            } else focusAt(Math.min(rows.length - 1, row + 1), index);
          }
        }
        if (event.key === "Tab") {
          if (commitEdit()) {
            event.preventDefault();
            const next = event.shiftKey
              ? index - 1
              : (ownerAt(row, index)?.end ?? index + 1);
            focusAt(
              row + (next < 0 ? -1 : next >= columns.length ? 1 : 0),
              (next + columns.length) % columns.length,
            );
          } else event.preventDefault();
        }
      },
    };
    const content = renderEditor ? (
      renderEditor(props)
    ) : (
      <CellEditor {...props} />
    );
    if (config.type !== "largeText") return content;
    const rect = cells.current
      .get(keyOf(row, column.id))
      ?.getBoundingClientRect();
    const width = Math.max(260, rect?.width ?? 260),
      screenWidth = typeof window === "undefined" ? 1200 : window.innerWidth,
      screenHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    return (
      <div
        className="og-editor-popup"
        style={{
          position: "fixed",
          width,
          height: 120,
          left: Math.max(0, Math.min(rect?.left ?? 0, screenWidth - width - 8)),
          top: Math.max(0, Math.min(rect?.top ?? 0, screenHeight - 130)),
        }}
      >
        {content}
      </div>
    );
  }

  function onCellKey(
    event: KeyboardEvent<HTMLDivElement>,
    node: RowNode<T>,
    column: Column<T>,
    row: number,
  ) {
    if (event.target !== event.currentTarget) return;
    if (
      rowDragging &&
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      event.stopPropagation();
      moveAdjacentRow(node.id, event.key === "ArrowUp" ? -1 : 1, "cell");
      return;
    }
    const col = columns.indexOf(column);
    let targetRow = row;
    let targetCol = col;
    if (
      toolbar &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      setFindOpen(true);
      findInput.current?.focus();
      return;
    }
    if (
      event.altKey &&
      event.key.toLowerCase() === "n" &&
      node.kind === "row"
    ) {
      event.preventDefault();
      openNote({ rowId: node.id, columnId: column.id });
      return;
    }
    if (
      event.altKey &&
      event.key === "Enter" &&
      renderDetail &&
      node.kind === "row"
    ) {
      event.preventDefault();
      toggleDetails(node.id);
      return;
    }
    if (effectiveCellSelection && (event.ctrlKey || event.metaKey)) {
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        ranges.selectAll();
        return;
      }
      if (key === "d" || key === "r") {
        event.preventDefault();
        ranges.fill(key === "d" ? "down" : "right");
        return;
      }
    }
    if (effectiveCellSelection && event.key === "Escape") {
      event.preventDefault();
      ranges.clear();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      ["z", "y"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      const redo = event.key.toLowerCase() === "y" || event.shiftKey;
      const changed = redo ? model.redo() : model.undo();
      setAnnouncement(
        changed
          ? redo
            ? gridMessage("grid.changeRedone")
            : gridMessage("grid.changeUndone")
          : gridMessage("grid.noHistory"),
      );
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        targetRow = rowSpanPlan?.ownerAt(row, column.id)?.end ?? row + 1;
        break;
      case "ArrowUp":
        targetRow--;
        break;
      case "ArrowLeft":
      case "ArrowRight": {
        const delta = getInlineArrowDelta(event.key, direction);
        if (
          node.children?.length &&
          ((delta < 0 && state.expanded.includes(node.id)) ||
            (delta > 0 && !state.expanded.includes(node.id)))
        ) {
          model.toggleExpanded(node.id);
          event.preventDefault();
          return;
        }
        targetCol = delta > 0 ? (ownerAt(row, col)?.end ?? col + 1) : col - 1;
        break;
      }
      case "Home":
        targetCol = 0;
        if (event.ctrlKey || event.metaKey) targetRow = 0;
        break;
      case "End":
        targetCol = columns.length - 1;
        if (event.ctrlKey || event.metaKey) targetRow = rows.length - 1;
        break;
      case "PageDown":
        targetRow = pageTarget(row, 1);
        break;
      case "PageUp":
        targetRow = pageTarget(row, -1);
        break;
      case "Enter":
      case "F2":
        event.preventDefault();
        if (
          node.children?.length &&
          (node.kind === "group" || (editMode === "cell" && !column.editable))
        )
          model.toggleExpanded(node.id);
        else startEdit(node, column);
        return;
      case " ":
        if (selectionMode !== "none" && node.kind === "row") {
          event.preventDefault();
          model.toggleSelection(node.id, selectionMode === "multiple");
        }
        return;
      default:
        if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          editMode === "cell" &&
          column.editable
        ) {
          event.preventDefault();
          startEdit(node, column, event.key);
        }
        return;
    }
    event.preventDefault();
    focusAt(targetRow, targetCol, event.shiftKey, {
      rowId: node.id,
      columnId: column.id,
    });
  }

  function ownedDragTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest('[role="grid"],[role="treegrid"]') === viewport.current
    );
  }
  function stopManagedDrag(message?: GridMessage | string) {
    const active = managedDrag.current !== null;
    managedDrag.current = null;
    if (rowDragFrame.current) {
      window.cancelAnimationFrame(rowDragFrame.current);
      rowDragFrame.current = 0;
    }
    setDraggingRowId(null);
    setRowDropTarget(null);
    if (active && message) setAnnouncement(message);
  }
  function performRowMove(
    rowId: string,
    targetRowId: string,
    position: "before" | "after",
    origin: "cell" | "handle" | "none",
    expectedSignature = rowViewSignature,
  ) {
    const status = model.getRowReorderStatus();
    const actualRows = pagination ? model.getPageRows() : model.getRowModel();
    const signature = JSON.stringify([
      model.getState().page,
      actualRows.map((node) => node.id),
    ]);
    const message =
      rowMoveReason ??
      reorderReason(status) ??
      (signature !== expectedSignature
        ? gridMessage("move.changed")
        : !actualRows.some((node) => node.id === rowId) ||
            !actualRows.some((node) => node.id === targetRowId)
          ? gridMessage("move.pageOnly")
          : undefined);
    if (message) {
      setError(message);
      setAnnouncement(message);
      return false;
    }
    const before = model.getState();
    let failure: GridMessage | string | undefined;
    try {
      failure = model.moveRows([rowId], targetRowId, position);
    } catch (reason) {
      failure =
        reason instanceof Error ? reason.message : gridMessage("move.failed");
    }
    if (failure) {
      setError(failure);
      setAnnouncement(failure);
      return false;
    }
    if (model.getState() === before) return false;
    movedFocus.current = {
      rowId,
      columnId: focus.columnId || columns[0]?.id || "",
      origin,
    };
    setFocus((current) => ({ ...current, rowId }));
    setError("");
    const updatedPage = pagination ? model.getPageRows() : model.getRowModel();
    setAnnouncement(
      gridMessage("move.moved", {
        rowId,
        position: updatedPage.findIndex((node) => node.id === rowId) + 1,
      }),
    );
    onRowMove?.({ rowIds: Object.freeze([rowId]), targetRowId, position });
    return true;
  }
  function moveAdjacentRow(
    rowId: string,
    direction: -1 | 1,
    origin: "cell" | "handle" | "none",
  ) {
    if (rowMoveReason) {
      setAnnouncement(rowMoveReason);
      return;
    }
    const index = rows.findIndex((node) => node.id === rowId),
      target = rows[index + direction];
    if (!target) {
      setAnnouncement(
        direction < 0 ? gridMessage("move.first") : gridMessage("move.last"),
      );
      return;
    }
    performRowMove(
      rowId,
      target.id,
      direction < 0 ? "before" : "after",
      origin,
    );
  }
  function setManagedDrop(rowId: string, clientY: number) {
    const row = rowElements.current.get(rowId),
      source = managedDrag.current;
    if (!row || !source) return;
    if (source.rowId === rowId) {
      setRowDropTarget(null);
      return;
    }
    const bounds = row.getBoundingClientRect();
    const position =
      clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setRowDropTarget((current) =>
      current?.rowId === rowId && current.position === position
        ? current
        : { rowId, position },
    );
  }
  function managedAutoScroll() {
    rowDragFrame.current = 0;
    const source = managedDrag.current,
      container = viewport.current;
    if (!source || !container) return;
    const context = liveRowMove.current;
    if (
      context.model !== source.model ||
      context.signature !== source.signature ||
      context.reason
    ) {
      stopManagedDrag(gridMessage("move.changed"));
      return;
    }
    if (!source.owned) return;
    const bounds = container.getBoundingClientRect();
    const top = bounds.top + context.topInset,
      bottom = bounds.top + container.clientHeight - context.bottomInset;
    if (
      source.owned &&
      source.x >= bounds.left &&
      source.x <= bounds.right &&
      source.y >= top &&
      source.y <= bottom
    ) {
      const delta = source.y < top + 25 ? -16 : source.y > bottom - 25 ? 16 : 0;
      if (delta) container.scrollTop += delta;
      const element = document.elementFromPoint?.(source.x, source.y);
      const candidate = element?.closest<HTMLElement>(".og-row[data-row-key]");
      if (
        candidate &&
        ownedDragTarget(element) &&
        rowElements.current.get(candidate.dataset.rowKey!) === candidate
      )
        setManagedDrop(candidate.dataset.rowKey!, source.y);
    }
    rowDragFrame.current = window.requestAnimationFrame(managedAutoScroll);
  }
  function beginManagedDrag(
    event: DragEvent<HTMLButtonElement>,
    rowId: string,
  ) {
    if (rowGripTouch.current) {
      event.preventDefault();
      return;
    }
    if (rowMoveReason || !ownedDragTarget(event.target)) {
      event.preventDefault();
      if (rowMoveReason) setAnnouncement(rowMoveReason);
      return;
    }
    stopManagedDrag();
    const payload = JSON.stringify({
      owner: rowDragOwner,
      nonce: ++rowDragSequence.current,
      rowId,
    });
    managedDrag.current = {
      model,
      rowId,
      signature: rowViewSignature,
      payload,
      columnId: focus.columnId || columns[0]?.id || "",
      x: event.clientX,
      y: event.clientY,
      owned: true,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(ROW_DRAG_MIME, payload);
    setDraggingRowId(rowId);
    setFocus((current) => ({ ...current, rowId }));
    setAnnouncement(gridMessage("move.moving", { rowId }));
  }
  function overManagedRow(event: DragEvent<HTMLDivElement>, rowId: string) {
    const source = managedDrag.current;
    if (!source || !ownedDragTarget(event.target) || rowMoveReason) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    source.x = event.clientX;
    source.y = event.clientY;
    source.owned = true;
    setManagedDrop(rowId, event.clientY);
    if (!rowDragFrame.current)
      rowDragFrame.current = window.requestAnimationFrame(managedAutoScroll);
  }
  function dropManagedRow(
    event: DragEvent<HTMLDivElement>,
    targetRowId: string,
  ) {
    const source = managedDrag.current;
    if (!source || !ownedDragTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const matches =
      event.dataTransfer.getData(ROW_DRAG_MIME) === source.payload;
    const bounds = event.currentTarget.getBoundingClientRect(),
      position =
        event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    stopManagedDrag();
    if (!matches || source.model !== model) {
      setAnnouncement(gridMessage("move.foreign"));
      return;
    }
    performRowMove(
      source.rowId,
      targetRowId,
      position,
      "cell",
      source.signature,
    );
  }

  function pageTarget(row: number, direction: 1 | -1) {
    const entry = projection.rows[row];
    if (!projection.body.length)
      return clamp(row + direction, 0, rows.length - 1);
    if (entry.region !== "body")
      return direction > 0
        ? projection.body[0].visualIndex
        : projection.body.at(-1)!.visualIndex;
    const index = rowGeometry.layout.indexAt(
      rowGeometry.offset(row) + direction * bodyViewportHeight,
    );
    return projection.body[index]?.visualIndex ?? row;
  }

  function onFullWidthKey(event: KeyboardEvent<HTMLDivElement>, row: number) {
    if (event.target !== event.currentTarget) return;
    const node = rows[row];
    const column = Math.max(
      0,
      columns.findIndex((item) => item.id === focus.columnId),
    );
    if (
      event.altKey &&
      event.key === "Enter" &&
      renderDetail &&
      node.kind === "row"
    ) {
      event.preventDefault();
      toggleDetails(node.id);
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(row + 1, column, event.shiftKey);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(row - 1, column, event.shiftKey);
        return;
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        return;
      case "Home":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          focusAt(0, 0);
        }
        return;
      case "End":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          focusAt(rows.length - 1, columns.length - 1);
        }
        return;
      case "PageDown":
        event.preventDefault();
        focusAt(pageTarget(row, 1), column, event.shiftKey);
        return;
      case "PageUp":
        event.preventDefault();
        focusAt(pageTarget(row, -1), column, event.shiftKey);
        return;
      case " ":
        if (selectionMode !== "none" && node.kind === "row") {
          event.preventDefault();
          model.toggleSelection(node.id, selectionMode === "multiple");
        }
        return;
      case "F2":
        if (editMode === "row" && columns[column]) {
          event.preventDefault();
          startEdit(node, columns[column]);
        }
        return;
      case "Enter":
        event.preventDefault();
        if (node.kind === "group" && node.children?.length)
          model.toggleExpanded(node.id);
        else
          event.currentTarget
            .querySelector<HTMLElement>(
              'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
            )
            ?.focus();
        return;
      default:
        return;
    }
  }

  const visibleLeafIds = rows
    .filter((row) => row.kind === "row")
    .map((row) => row.id);
  const allSelected =
    visibleLeafIds.length > 0 && visibleLeafIds.every((id) => selected.has(id));
  function selectPage() {
    const next = new Set(state.selected);
    visibleLeafIds.forEach((id) =>
      allSelected ? next.delete(id) : next.add(id),
    );
    model.selectRows([...next]);
  }
  function downloadCsv() {
    const url = URL.createObjectURL(
      new Blob([model.exportCsv({ allRows: true })], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "opengrid.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderRows(indices: readonly number[]) {
    return indices.map((row) => {
      const node = rows[row];
      const entry = projection.rows[row];
      const anchorOnly = rowSpanAnchorCells.get(row);
      const presentationDepth = entry.region === "body" ? node.depth : 0;
      const isSelected = selected.has(node.id);
      return (
        <Fragment key={node.id}>
          <div
            role="row"
            key={node.id}
            ref={(element) => {
              if (element) rowElements.current.set(node.id, element);
              else rowElements.current.delete(node.id);
            }}
            data-row-region={entry.region}
            data-row-key={node.id}
            data-row-span-anchor-only={anchorOnly ? "true" : undefined}
            data-row-dragging={draggingRowId === node.id || undefined}
            data-row-drop-position={
              rowDropTarget?.rowId === node.id
                ? rowDropTarget.position
                : undefined
            }
            onDragOver={
              rowDragging
                ? (event) => overManagedRow(event, node.id)
                : undefined
            }
            onDrop={
              rowDragging
                ? (event) => dropManagedRow(event, node.id)
                : undefined
            }
            data-full-width={entry.fullWidth || undefined}
            aria-rowindex={row + rowGeometry.before[row] + headerRows + 1}
            aria-selected={selectionMode === "none" ? undefined : isSelected}
            aria-level={hierarchical ? presentationDepth + 1 : undefined}
            aria-expanded={
              node.children?.length
                ? state.expanded.includes(node.id)
                : renderDetail && node.kind === "row"
                  ? Boolean(rowGeometry.detailHeights[row])
                  : undefined
            }
            className={`og-row ${entry.region !== "body" ? "og-pinned-row" : ""} ${row % 2 ? "og-row-alt" : ""} ${isSelected ? "og-row-selected" : ""} ${node.kind === "group" ? "og-group-row" : ""}`}
            style={{
              top: rowGeometry.offset(row),
              height: rowGeometry.baseHeights[row],
              width: "100%",
            }}
          >
            {rowDropTarget?.rowId === node.id && (
              <div
                aria-hidden="true"
                className={`og-row-drop-indicator og-row-drop-${rowDropTarget.position}`}
              />
            )}
            {entry.fullWidth ? (
              <div
                role="gridcell"
                aria-colindex={1}
                aria-colspan={Math.max(
                  1,
                  columns.length + (selectionWidth ? 1 : 0),
                )}
                aria-readonly="true"
                className="og-cell og-full-width-cell"
                data-full-width-row-id={node.id}
                data-row-region={entry.region}
                tabIndex={focusRow === row ? 0 : -1}
                ref={(element) => {
                  if (element) fullWidthCells.current.set(node.id, element);
                  else fullWidthCells.current.delete(node.id);
                }}
                style={{
                  position: "sticky",
                  insetInlineStart: 0,
                  width: viewportWidth,
                  minWidth: viewportWidth,
                  height: "100%",
                  overflow: "auto",
                  padding: 12,
                }}
                onFocus={(event) => {
                  if (event.target === event.currentTarget) {
                    ownsCellFocus.current = true;
                    setFocus({
                      rowId: node.id,
                      columnId: focus.columnId || columns[0]?.id || "",
                    });
                    ranges.clear();
                  }
                }}
                onBlur={(event) => {
                  if (
                    event.relatedTarget instanceof Element &&
                    event.relatedTarget.closest(
                      '[role="grid"],[role="treegrid"]',
                    ) !== viewport.current
                  )
                    ownsCellFocus.current = false;
                }}
                onKeyDown={(event) => onFullWidthKey(event, row)}
              >
                {renderFullWidthRow?.({
                  node,
                  rowId: node.id,
                  rowPinned: entry.region === "body" ? null : entry.region,
                  viewportWidth,
                })}
              </div>
            ) : (
              <>
                {anchorOnly &&
                  selectionWidth > 0 &&
                  columnGap({
                    kind: "spacer",
                    key: "row-controls-gap",
                    width: selectionWidth,
                  })}
                {!anchorOnly && selectionWidth > 0 && (
                  <div
                    role="gridcell"
                    aria-colindex={1}
                    className={`og-selection og-cell ${rowDragging ? "og-row-controls-cell" : ""}`}
                    style={{
                      width: selectionWidth,
                      minWidth: selectionWidth,
                    }}
                  >
                    {rowDragging && node.kind === "row" && (
                      <button
                        ref={(element) => {
                          if (element) rowHandles.current.set(node.id, element);
                          else rowHandles.current.delete(node.id);
                        }}
                        type="button"
                        className="og-row-drag-handle"
                        tabIndex={-1}
                        draggable={!rowMoveReason}
                        onPointerDown={(event) => {
                          rowGripTouch.current = event.pointerType === "touch";
                          event.currentTarget.draggable =
                            !rowGripTouch.current && !rowMoveReason;
                        }}
                        disabled={Boolean(rowMoveReason)}
                        aria-label={t("grid.dragRow", { rowId: node.id })}
                        aria-describedby={rowMoveHelpId}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        title={
                          rowMoveReason
                            ? resolveMessage(rowMoveReason)
                            : t("grid.dragHelp")
                        }
                        onFocus={() => {
                          ownsCellFocus.current = false;
                          setFocus((current) => ({
                            ...current,
                            rowId: node.id,
                          }));
                        }}
                        onDragStart={(event) =>
                          beginManagedDrag(event, node.id)
                        }
                        onDragEnd={() => stopManagedDrag()}
                        onKeyDown={(event) => {
                          if (
                            event.altKey &&
                            (event.key === "ArrowUp" ||
                              event.key === "ArrowDown")
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            moveAdjacentRow(
                              node.id,
                              event.key === "ArrowUp" ? -1 : 1,
                              "handle",
                            );
                          }
                        }}
                      >
                        {"\u2195"}
                      </button>
                    )}
                    {node.kind === "row" && selectionMode !== "none" && (
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        aria-label={t("grid.selectRow", { rowId: node.id })}
                        checked={isSelected}
                        onChange={() =>
                          model.toggleSelection(
                            node.id,
                            selectionMode === "multiple",
                          )
                        }
                      />
                    )}
                  </div>
                )}
                {getColumnSpanWindow(spanPlanFor(row), {
                  direction,
                  scrollLeft,
                  viewportWidth,
                  leadingWidth: selectionWidth,
                  overscan: Number.isFinite(columnOverscan)
                    ? Math.max(0, columnOverscan)
                    : 200,
                  enabled: virtualizeColumns,
                  retainIndices: [
                    ...(focus.rowId === node.id
                      ? [
                          columns.findIndex(
                            (column) => column.id === focus.columnId,
                          ),
                        ]
                      : []),
                    ...(editing?.rowId === node.id
                      ? [
                          columns.findIndex(
                            (column) => column.id === editing.columnId,
                          ),
                        ]
                      : []),
                  ],
                }).map((entry) => {
                  if (entry.kind === "spacer") return columnGap(entry);
                  const span = entry.cell,
                    index = span.start,
                    column = columns[index];
                  const rowSpan = rowSpanPlan?.ownerAt(row, column.id);
                  if (
                    (rowSpan && rowSpan.ownerIndex !== row) ||
                    (anchorOnly && !anchorOnly.has(column.id))
                  )
                    return columnGap({
                      kind: "spacer",
                      key: `row-span-gap-${column.id}`,
                      width: span.width,
                    });
                  const value = node.data
                    ? model.getValue(node.data, column.id)
                    : node.aggregates &&
                        Object.hasOwn(node.aggregates, column.id)
                      ? node.aggregates[column.id]
                      : undefined;
                  const isEditing =
                    editMode === "cell" &&
                    editing?.rowId === node.id &&
                    editing.columnId === column.id;
                  const display =
                    node.data && column.valueFormatter
                      ? column.valueFormatter(value, node.data)
                      : text(value);
                  return (
                    <div
                      key={column.id}
                      role="gridcell"
                      aria-colindex={index + 1 + (selectionWidth ? 1 : 0)}
                      aria-colspan={span.span > 1 ? span.span : undefined}
                      aria-rowspan={rowSpan?.span}
                      aria-readonly={!column.editable || node.kind !== "row"}
                      aria-keyshortcuts={
                        rowDragging ? "Alt+ArrowUp Alt+ArrowDown" : undefined
                      }
                      aria-selected={
                        effectiveCellSelection
                          ? ranges.contains(node.id, column.id)
                          : undefined
                      }
                      tabIndex={
                        focusRow === row &&
                        ownerColumnId(row, focus.columnId) === column.id
                          ? 0
                          : -1
                      }
                      ref={(element) => {
                        const key = keyOf(row, column.id);
                        if (element) cells.current.set(key, element);
                        else cells.current.delete(key);
                      }}
                      data-row-id={node.id}
                      data-column-id={column.id}
                      className={`og-cell ${rowSpan ? "og-row-spanning" : ""} ${isEditing ? "og-editing" : ""} ${pinOf(column) ? "og-pinned" : ""} ${findMatches.has(JSON.stringify([node.id, column.id])) ? "og-find-match" : ""} ${activeFind?.rowId === node.id && activeFind.columnId === column.id ? "og-find-active" : ""} ${ranges.contains(node.id, column.id) ? "og-range-selected" : ""} ${column.type === "number" || column.type === "bigint" ? "og-numeric" : ""}`}
                      style={{
                        ...cellStyle(column, span),
                        ...(rowSpan
                          ? {
                              height: rowSpan.height,
                              zIndex: pinOf(column) ? 2 : 1,
                              alignItems: "flex-start",
                              paddingTop: isEditing
                                ? 4
                                : Math.max(
                                    0,
                                    (rowGeometry.baseHeights[row] - 20) / 2,
                                  ),
                            }
                          : {}),
                      }}
                      title={display}
                      onFocus={(event) => {
                        if (event.target === event.currentTarget) {
                          ownsCellFocus.current = true;
                          setFocus({ rowId: node.id, columnId: column.id });
                        }
                      }}
                      onBlur={(event) => {
                        if (
                          event.relatedTarget instanceof Element &&
                          event.relatedTarget.closest(
                            '[role="grid"],[role="treegrid"]',
                          ) !== viewport.current
                        )
                          ownsCellFocus.current = false;
                      }}
                      onPointerDown={(event) =>
                        ranges.begin(event, {
                          rowId: node.id,
                          columnId: column.id,
                        })
                      }
                      onClick={(event) => {
                        if (
                          event.target instanceof Element &&
                          (event.target.closest(
                            '[role="grid"],[role="treegrid"]',
                          ) !== viewport.current ||
                            event.target.closest(
                              'button,input,select,textarea,a,summary,[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="combobox"],[role="switch"],[data-og-no-edit]',
                            ))
                        )
                          return;
                        if (
                          touchTaps.consumeClick(event, {
                            rowId: node.id,
                            columnId: column.id,
                          })
                        )
                          return;
                        setFocus({ rowId: node.id, columnId: column.id });
                        if (event.detail === 0)
                          ranges.select(
                            { rowId: node.id, columnId: column.id },
                            event.shiftKey,
                          );
                      }}
                      onDoubleClick={(event) => {
                        if (touchTaps.suppressDoubleClick(event)) return;
                        if (
                          event.target instanceof Element &&
                          event.target.closest(
                            'button,input,select,textarea,a,summary,[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="combobox"],[role="switch"],[data-og-no-edit]',
                          )
                        )
                          return;
                        startEdit(node, column);
                      }}
                      onKeyDown={(event) => onCellKey(event, node, column, row)}
                    >
                      {isEditing ? (
                        rowSpan ? (
                          <div
                            style={{
                              height: Math.max(
                                20,
                                rowGeometry.baseHeights[row] - 8,
                              ),
                              width: "100%",
                            }}
                          >
                            {renderEditorControl(node, column, row, index)}
                          </div>
                        ) : (
                          renderEditorControl(node, column, row, index)
                        )
                      ) : (
                        <>
                          {notes !== false &&
                            node.kind === "row" &&
                            notesStore.get({
                              rowId: node.id,
                              columnId: column.id,
                            }) !== undefined && (
                              <button
                                type="button"
                                tabIndex={-1}
                                className="og-note-indicator"
                                aria-label={t("note.editLabel", {
                                  column: column.header ?? column.id,
                                  rowId: node.id,
                                })}
                                title={notesStore.get({
                                  rowId: node.id,
                                  columnId: column.id,
                                })}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openNote({
                                    rowId: node.id,
                                    columnId: column.id,
                                  });
                                }}
                              >
                                {"\u270e"}
                              </button>
                            )}
                          {index === 0 && (
                            <span
                              className="og-tree-prefix"
                              style={{
                                paddingInlineStart: presentationDepth * 16,
                              }}
                            >
                              {renderDetail && node.kind === "row" && (
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className="og-expand"
                                  aria-label={t(
                                    rowGeometry.detailHeights[row]
                                      ? "grid.collapseDetails"
                                      : "grid.expandDetails",
                                    { rowId: node.id },
                                  )}
                                  aria-expanded={Boolean(
                                    rowGeometry.detailHeights[row],
                                  )}
                                  aria-controls={`${helpId}-detail-${encodeURIComponent(node.id)}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleDetails(node.id);
                                  }}
                                >
                                  {rowGeometry.detailHeights[row]
                                    ? "\u229f"
                                    : "\u229e"}
                                </button>
                              )}
                              {node.children?.length ? (
                                <button
                                  type="button"
                                  className="og-expand"
                                  tabIndex={-1}
                                  aria-label={t(
                                    state.expanded.includes(node.id)
                                      ? "grid.collapseGroup"
                                      : "grid.expandGroup",
                                    { group: node.label ?? node.id },
                                  )}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    model.toggleExpanded(node.id);
                                  }}
                                >
                                  {state.expanded.includes(node.id)
                                    ? "\u25be"
                                    : direction === "rtl"
                                      ? "\u25c2"
                                      : "\u25b8"}
                                </button>
                              ) : null}
                            </span>
                          )}
                          <span className="og-cell-content">
                            {node.kind === "group" && index === 0 ? (
                              <>
                                {node.label}{" "}
                                <span className="og-group-count">
                                  {node.leafCount === undefined
                                    ? ""
                                    : number(node.leafCount)}
                                </span>
                              </>
                            ) : node.data && renderCell ? (
                              renderCell({ value, row: node.data, column })
                            ) : (
                              display
                            )}
                          </span>
                          {effectiveCellSelection &&
                            ranges.isEnd({
                              rowId: node.id,
                              columnId: column.id,
                            }) && (
                              <button
                                type="button"
                                className="og-fill-handle"
                                tabIndex={-1}
                                aria-label={t("grid.fillHandle")}
                                onPointerDown={ranges.fillHandle}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (event.detail === 0) ranges.fill("down");
                                }}
                              />
                            )}
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
          {!anchorOnly && rowGeometry.detailHeights[row] > 0 && node.data && (
            <div
              id={`${helpId}-detail-${encodeURIComponent(node.id)}`}
              role="row"
              aria-rowindex={row + rowGeometry.before[row] + headerRows + 2}
              aria-level={hierarchical ? presentationDepth + 2 : undefined}
              className="og-detail-row"
              style={{
                position: "absolute",
                top: rowGeometry.offset(row) + rowGeometry.baseHeights[row],
                height: rowGeometry.detailHeights[row],
                width: "100%",
              }}
            >
              <div
                role="gridcell"
                aria-colindex={1}
                aria-colspan={Math.max(
                  1,
                  columns.length + (selectionWidth ? 1 : 0),
                )}
                style={{
                  position: "sticky",
                  insetInlineStart: 0,
                  width: viewportWidth,
                  height: "100%",
                  overflow: "auto",
                  padding: 12,
                }}
              >
                <div
                  role="region"
                  aria-label={t("grid.details", { rowId: node.id })}
                >
                  {renderDetail?.({ row: node.data, rowId: node.id })}
                </div>
              </div>
            </div>
          )}
        </Fragment>
      );
    });
  }

  return (
    <section
      className={`og-root ${className}`}
      lang={locale}
      dir={direction}
      data-direction={direction}
    >
      {(hasColumnSpans || hasRowSpans) && (
        <p className="og-span-help" role="status" dir="auto">
          {t(hasRowSpans ? "grid.rowSpanHelp" : "grid.columnSpanHelp")}
        </p>
      )}
      <p id={helpId} className="og-sr-only">
        {t("grid.help", {
          target: t(
            editMode === "row" ? "grid.helpEditRow" : "grid.helpEditCells",
          ),
        })}
        {effectiveCellSelection && <> {t("grid.rangeHelp")}</>}
        {toolbar && <> {t("grid.findHelp")}</>}
        {notes !== false && <> {t("grid.noteHelp")}</>}
        {renderDetail && <> {t("grid.detailHelp")}</>}
        {rowDragging && <> {t("grid.moveHelp")}</>}
        <> {t("grid.touchHelp")}</>
      </p>
      {toolbar && (
        <div
          className="og-toolbar"
          role="toolbar"
          aria-label={t("grid.tools")}
          style={{ zIndex: 7 }}
        >
          <label className="og-search">
            <span aria-hidden="true">{"\u2315"}</span>
            <input
              aria-label={t("grid.searchLabel")}
              placeholder={t("grid.searchPlaceholder")}
              value={state.quickFilter}
              onChange={(event) => {
                model.setQuickFilter(event.target.value);
                if (viewport.current) viewport.current.scrollTop = 0;
                setScrollTop(0);
              }}
            />
          </label>
          <div className="og-toolbar-actions">
            {editMode === "cell" && (
              <button
                type="button"
                disabled={
                  !!editing ||
                  !!rowEditing ||
                  !!noteEditing ||
                  rows[focusRow]?.kind !== "row" ||
                  !columns.find((column) => column.id === focus.columnId)
                    ?.editable
                }
                onClick={() => {
                  const column = columns.find(
                      (column) => column.id === focus.columnId,
                    ),
                    node = rows[focusRow];
                  if (column && node) {
                    focusAt(
                      focusRow,
                      columns.indexOf(column),
                      false,
                      undefined,
                      false,
                    );
                    startEdit(node, column);
                  }
                }}
              >
                {t("grid.editFocusedCell")}
              </button>
            )}
            {rowDragging && (
              <>
                <button
                  type="button"
                  aria-label={t("grid.moveUp")}
                  aria-describedby={rowMoveHelpId}
                  disabled={Boolean(rowMoveReason) || focusRow <= 0}
                  onClick={() => moveAdjacentRow(focus.rowId, -1, "cell")}
                >
                  {t("grid.moveUp")}
                </button>
                <button
                  type="button"
                  aria-label={t("grid.moveDown")}
                  aria-describedby={rowMoveHelpId}
                  disabled={
                    Boolean(rowMoveReason) || focusRow >= rows.length - 1
                  }
                  onClick={() => moveAdjacentRow(focus.rowId, 1, "cell")}
                >
                  {t("grid.moveDown")}
                </button>
              </>
            )}
            {editMode === "row" && (
              <button
                type="button"
                aria-haspopup="dialog"
                disabled={
                  rows[focusRow]?.kind !== "row" ||
                  !columns.some(
                    (column) =>
                      column.editable && column.field && !column.valueGetter,
                  )
                }
                onClick={() => {
                  const node = rows[focusRow];
                  const column =
                    columns.find((column) => column.id === focus.columnId) ??
                    columns[0];
                  if (node && column) startEdit(node, column);
                }}
              >
                {t("grid.editRow")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setFindOpen(!findOpen)}
              aria-expanded={findOpen}
            >
              {t("grid.find")}
            </button>
            {notes !== false && (
              <button type="button" onClick={() => openNote()}>
                {t("grid.note")}
              </button>
            )}
            {advancedFiltering && (
              <button
                type="button"
                aria-pressed={Boolean(state.advancedFilter)}
                aria-expanded={filterBuilderOpen}
                onClick={() => setFilterBuilderOpen(!filterBuilderOpen)}
              >
                {t("grid.advancedFilter")}
              </button>
            )}
            {effectiveCellSelection && (
              <>
                <button
                  type="button"
                  aria-pressed={ranges.extendOnTap}
                  aria-describedby={
                    ranges.extendOnTap ? `${helpId}-extend-range` : undefined
                  }
                  onClick={() => {
                    ranges.cancelGesture();
                    ranges.setExtendOnTap((value) => !value);
                  }}
                >
                  {t("grid.extendRange")}
                </button>
                <label className="og-fill-mode">
                  {t("grid.fillMode")}{" "}
                  <select
                    aria-label={t("grid.fillMode")}
                    value={ranges.fillMode}
                    onChange={(event) =>
                      ranges.setFillMode(
                        event.target.value === "series" ? "series" : "copy",
                      )
                    }
                  >
                    <option value="copy">{t("grid.fillCopy")}</option>
                    <option value="series">{t("grid.fillSeries")}</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={ranges.copyToClipboard}
                  aria-label={t("grid.copyLabel")}
                >
                  {t("grid.copy")}
                </button>
                <button
                  type="button"
                  onClick={ranges.pasteFromClipboard}
                  aria-label={t("grid.pasteLabel")}
                >
                  {t("grid.paste")}
                </button>
                <button
                  type="button"
                  onClick={() => ranges.fill("down")}
                  aria-label={t("grid.fillDownLabel")}
                >
                  {t("grid.fillDown")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                model.undo();
                setAnnouncement(gridMessage("grid.undoRequested"));
              }}
            >
              {t("grid.undo")}
            </button>
            <button
              type="button"
              onClick={() => {
                model.redo();
                setAnnouncement(gridMessage("grid.redoRequested"));
              }}
            >
              {t("grid.redo")}
            </button>
            <button type="button" onClick={downloadCsv}>
              {t("grid.exportCsv")}
            </button>
            <details className="og-chooser">
              <summary>{t("grid.columns")}</summary>
              <div className="og-chooser-panel">
                <strong>{t("grid.arrangeView")}</strong>
                {allColumns.map((column, index) => (
                  <div className="og-column-option" key={column.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={t("grid.showColumn", {
                          column: column.header ?? column.id,
                        })}
                        checked={visibleOf(column)}
                        onChange={(event) =>
                          model.hideColumn(column.id, !event.target.checked)
                        }
                      />
                      {column.header ?? column.id}
                    </label>
                    <select
                      aria-label={t("grid.pinColumn", {
                        column: column.header ?? column.id,
                      })}
                      value={pinOf(column) ?? ""}
                      onChange={(event) =>
                        model.pinColumn(
                          column.id,
                          event.target.value === ""
                            ? null
                            : (event.target.value as "left" | "right"),
                        )
                      }
                    >
                      <option value="">{t("grid.unpinned")}</option>
                      <option value="left">{t("grid.pinLeft")}</option>
                      <option value="right">{t("grid.pinRight")}</option>
                    </select>
                    <button
                      type="button"
                      aria-label={t("grid.moveColumnLeft", {
                        column: column.header ?? column.id,
                      })}
                      onClick={() =>
                        model.moveColumn(
                          column.id,
                          clamp(
                            (state.columnOrder.indexOf(column.id) < 0
                              ? index
                              : state.columnOrder.indexOf(column.id)) +
                              (direction === "rtl" ? 1 : -1),
                            0,
                            allColumns.length - 1,
                          ),
                        )
                      }
                    >
                      {"\u2190"}
                    </button>
                    <button
                      type="button"
                      aria-label={t("grid.moveColumnRight", {
                        column: column.header ?? column.id,
                      })}
                      onClick={() =>
                        model.moveColumn(
                          column.id,
                          clamp(
                            (state.columnOrder.indexOf(column.id) < 0
                              ? index
                              : state.columnOrder.indexOf(column.id)) +
                              (direction === "rtl" ? -1 : 1),
                            0,
                            allColumns.length - 1,
                          ),
                        )
                      }
                    >
                      {"\u2192"}
                    </button>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}
      {effectiveCellSelection && ranges.extendOnTap && (
        <p
          id={`${helpId}-extend-range`}
          className="og-touch-help"
          role="status"
          dir="auto"
        >
          {t("grid.extendRangeHelp")}
        </p>
      )}
      {toolbar && (
        <p className="og-touch-help">
          {t("grid.touchHelp")}
          {rowDragging && <> {t("grid.touchMoveHelp")}</>}
        </p>
      )}
      {rowDragging && (
        <p className="og-row-move-help" id={rowMoveHelpId} role="status">
          {rowMoveReason
            ? resolveMessage(rowMoveReason)
            : t("grid.rowMoveHelp")}
        </p>
      )}
      {findOpen && (
        <div className="og-findbar" role="search" aria-label={t("find.label")}>
          <input
            ref={findInput}
            aria-label={t("find.label")}
            placeholder={t("find.placeholder")}
            value={finder.snapshot.query}
            onChange={(event) => {
              try {
                finder.controller?.setQuery(event.target.value);
                focusMatch(finder.controller?.getSnapshot().matches[0], false);
                setError("");
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : gridMessage("grid.findFailed"),
                );
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                focusMatch(
                  event.shiftKey
                    ? finder.controller?.previous()
                    : finder.controller?.next(),
                );
              }
              if (event.key === "Escape") {
                setFindOpen(false);
                focusAt(
                  focusRow,
                  columns.findIndex((column) => column.id === focus.columnId),
                );
              }
            }}
          />
          <span role="status">
            {finder.snapshot.matches.length
              ? t("find.position", {
                  position: finder.snapshot.activeIndex + 1,
                  count: finder.snapshot.matches.length,
                })
              : t("find.none")}
          </span>
          <button
            type="button"
            aria-label={t("find.previous")}
            onClick={() => focusMatch(finder.controller?.previous())}
          >
            {t("common.previous")}
          </button>
          <button
            type="button"
            aria-label={t("find.next")}
            onClick={() => focusMatch(finder.controller?.next())}
          >
            {t("common.next")}
          </button>
          <button
            type="button"
            onClick={() => {
              setFindOpen(false);
              finder.controller?.setQuery("");
            }}
          >
            {t("find.close")}
          </button>
        </div>
      )}
      {filterBuilderOpen && advancedFiltering && (
        <AdvancedFilterBuilder
          columns={allColumns}
          value={state.advancedFilter ?? null}
          onApply={(expression) => model.setAdvancedFilter(expression)}
          onClose={() => setFilterBuilderOpen(false)}
        />
      )}
      <div
        className="og-viewport"
        onPointerDownCapture={touchTaps.onPointerDown}
        onPointerMoveCapture={touchTaps.onPointerMove}
        onPointerUpCapture={touchTaps.onPointerUp}
        onPointerCancelCapture={touchTaps.onPointerCancel}
        onLostPointerCapture={touchTaps.onLostPointerCapture}
        onContextMenu={touchTaps.onContextMenu}
        dir={direction}
        ref={viewport}
        style={{ height: safeHeight }}
        role={hierarchical ? "treegrid" : "grid"}
        tabIndex={-1}
        aria-label={ariaLabel ?? t("grid.ariaLabel")}
        aria-describedby={helpId}
        aria-rowcount={rows.length + rowGeometry.detailCount + headerRows}
        aria-colcount={Math.max(1, columns.length + (selectionWidth ? 1 : 0))}
        aria-multiselectable={
          selectionMode === "multiple" || effectiveCellSelection || undefined
        }
        onCopy={effectiveCellSelection ? ranges.onCopy : undefined}
        onPaste={effectiveCellSelection ? ranges.onPaste : undefined}
        onScroll={(event) => {
          if (event.target !== event.currentTarget) return;
          setScrollTop(event.currentTarget.scrollTop);
          const offset = readInlineScroll(event.currentTarget);
          writeInlineScroll(event.currentTarget, offset);
          setScrollLeft(offset);
        }}
      >
        <div
          className="og-header"
          style={{
            width: Math.max(totalWidth, 1),
            minWidth: "100%",
            borderBottom: 0,
            boxShadow: "inset 0 -1px 0 var(--og-border)",
            zIndex: 6,
          }}
        >
          {groupDepth > 0 && (
            <HeaderGroupRows
              direction={direction}
              scrollLeft={scrollLeft}
              columns={groupedColumns}
              entries={columnEntries}
              leadingWidth={selectionWidth}
              onToggle={toggleColumnGroup}
              collapsedPaths={collapsedGroups}
            />
          )}
          <div role="rowgroup">
            <div
              role="row"
              aria-rowindex={groupDepth + 1}
              className="og-header-row"
            >
              {selectionWidth > 0 && (
                <div
                  role="columnheader"
                  aria-colindex={1}
                  aria-label={t("grid.rowControls")}
                  className="og-selection og-header-cell"
                  style={{ width: selectionWidth, minWidth: selectionWidth }}
                >
                  {selectionMode === "multiple" && (
                    <input
                      type="checkbox"
                      aria-label={t("grid.selectPage")}
                      checked={allSelected}
                      onChange={selectPage}
                    />
                  )}
                </div>
              )}
              {columnEntries.map((entry) => {
                if (entry.kind === "spacer") return columnGap(entry);
                const index = entry.index,
                  column = columns[index];
                const sort = state.sorting.find(
                  (sort) => sort.columnId === column.id,
                );
                return (
                  <div
                    key={column.id}
                    role="columnheader"
                    aria-colindex={index + 1 + (selectionWidth ? 1 : 0)}
                    aria-sort={
                      sort
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={`og-header-cell ${pinOf(column) ? "og-pinned" : ""}`}
                    style={cellStyle(column)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const id = event.dataTransfer.getData(
                        "text/opengrid-column",
                      );
                      if (allColumns.some((c) => c.id === id))
                        model.moveColumn(
                          id,
                          state.columnOrder.indexOf(column.id),
                        );
                    }}
                  >
                    <button
                      type="button"
                      className="og-sort"
                      disabled={column.sortable === false}
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData(
                          "text/opengrid-column",
                          column.id,
                        )
                      }
                      aria-label={t("grid.sortColumn", {
                        column: column.header ?? column.id,
                      })}
                      onClick={(event) => {
                        model.setSort(
                          column.id,
                          !sort
                            ? "asc"
                            : sort.direction === "asc"
                              ? "desc"
                              : null,
                          event.shiftKey,
                        );
                      }}
                    >
                      <span>{column.header ?? column.id}</span>
                      <span className="og-sort-indicator" aria-hidden="true">
                        {sort?.direction === "asc"
                          ? "\u2191"
                          : sort?.direction === "desc"
                            ? "\u2193"
                            : "\u2195"}
                        {sort && state.sorting.length > 1
                          ? number(state.sorting.indexOf(sort) + 1)
                          : ""}
                      </span>
                    </button>
                    <div
                      role="separator"
                      tabIndex={0}
                      aria-orientation="vertical"
                      aria-label={t("grid.resizeColumn", {
                        column: column.header ?? column.id,
                      })}
                      aria-valuenow={widthOf(column)}
                      aria-valuemin={column.minWidth ?? 40}
                      aria-valuemax={
                        Number.isFinite(column.maxWidth)
                          ? column.maxWidth
                          : undefined
                      }
                      className="og-resizer"
                      aria-disabled={!resizeAllowed.current}
                      style={{
                        touchAction: resizeAllowed.current
                          ? "none"
                          : "manipulation",
                      }}
                      onKeyDown={(event) => {
                        if (!resizeAllowed.current) return;
                        if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight"
                        ) {
                          event.preventDefault();
                          model.resizeColumn(
                            column.id,
                            widthOf(column) +
                              physicalToInlineDelta(
                                event.key === "ArrowRight" ? 10 : -10,
                                direction,
                              ),
                          );
                        }
                      }}
                      onPointerDown={(event) => {
                        if (!resizeAllowed.current) return;
                        ranges.cancelGesture();
                        columnResize.begin(event, column, widthOf(column));
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div
              role="row"
              aria-rowindex={groupDepth + 2}
              className="og-filter-row"
            >
              {selectionWidth > 0 && (
                <div
                  role="gridcell"
                  aria-colindex={1}
                  className="og-selection og-filter-cell"
                  style={{ width: selectionWidth, minWidth: selectionWidth }}
                />
              )}
              {columnEntries.map((entry) => {
                if (entry.kind === "spacer") return columnGap(entry);
                const index = entry.index,
                  column = columns[index];
                return (
                  <div
                    role="gridcell"
                    key={column.id}
                    aria-colindex={index + 1 + (selectionWidth ? 1 : 0)}
                    className={`og-filter-cell ${pinOf(column) ? "og-pinned" : ""}`}
                    style={cellStyle(column)}
                    onFocusCapture={(event) => {
                      if (
                        event.target instanceof Element &&
                        event.target.closest(
                          '[role="grid"],[role="treegrid"]',
                        ) === viewport.current
                      )
                        setFocusedFilterColumnId(column.id);
                    }}
                    onBlurCapture={(event) => {
                      if (
                        event.relatedTarget instanceof Node &&
                        !event.currentTarget.contains(event.relatedTarget)
                      )
                        setFocusedFilterColumnId((current) =>
                          current === column.id ? null : current,
                        );
                    }}
                  >
                    {column.filterable !== false && renderColumnFilter(column)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {projection.top.length > 0 && (
          <div
            role="rowgroup"
            aria-label={t("grid.pinnedTop")}
            data-row-region="top"
            className="og-pinned-row-band"
            style={{
              position: "sticky",
              top: headerHeight,
              zIndex: 5,
              height: pinnedTopHeight,
              width: Math.max(totalWidth, 1),
              minWidth: "100%",
            }}
          >
            {renderRows(projection.top.map((entry) => entry.visualIndex))}
          </div>
        )}
        <div
          role="rowgroup"
          className="og-body"
          data-row-region="body"
          style={{
            height: rowGeometry.layout.totalHeight,
            width: Math.max(totalWidth, 1),
            minWidth: "100%",
          }}
        >
          {renderRows(renderedRowIndices)}
        </div>
        {projection.bottom.length > 0 && (
          <div
            role="rowgroup"
            aria-label={t("grid.pinnedBottom")}
            data-row-region="bottom"
            className="og-pinned-row-band"
            style={{
              position: "sticky",
              bottom: 0,
              zIndex: 5,
              height: pinnedBottomHeight,
              width: Math.max(totalWidth, 1),
              minWidth: "100%",
            }}
          >
            {renderRows(projection.bottom.map((entry) => entry.visualIndex))}
          </div>
        )}
        {rows.length === 0 && (
          <div className="og-empty" role="status">
            {t("grid.empty")}
          </div>
        )}
      </div>
      {error && (
        <div id={errorId} className="og-error" role="alert">
          {error}
        </div>
      )}
      {rowEditing && rowEditing.model === model && editMode === "row" && (
        <RowEditDialog
          model={model}
          rowId={rowEditing.position.rowId}
          initialColumnId={rowEditing.position.columnId}
          editorOptions={editorOptions}
          renderEditor={renderEditor}
          conflictPolicy={rowConflictPolicy}
          onCommit={(rowId) => {
            setAnnouncement(gridMessage("grid.rowUpdated"));
            onRowEdit?.({ rowId });
          }}
          onClose={() => {
            setRestoreRowFocus(rowEditing.position);
            setRowEditing(null);
          }}
        />
      )}
      {noteEditing && notes !== false && (
        <CellNoteDialog
          store={notesStore}
          position={noteEditing}
          columnLabel={
            allColumns.find((column) => column.id === noteEditing.columnId)
              ?.header ?? noteEditing.columnId
          }
          onClose={() => {
            const position = noteEditing;
            setNoteEditing(null);
            if (!focusMatch(position)) focusAt(0, 0);
          }}
        />
      )}
      <div className="og-statusbar">
        <span dir="auto">
          {t("grid.rowCount", { count: model.getFilteredRows().length })}
          {ranges.selectedCellCount > 0 && (
            <>
              {" "}
              {"\u00b7"}{" "}
              {t("grid.cellCount", { count: ranges.selectedCellCount })}
            </>
          )}
          {state.selected.length > 0 && (
            <>
              {" "}
              {"\u00b7"}{" "}
              {t("grid.selectedCount", { count: state.selected.length })}
            </>
          )}
        </span>
        {pagination && (
          <div className="og-pagination">
            <label>
              {t("grid.rowsPerPage")}
              <select
                aria-label={t("grid.rowsPerPage")}
                value={state.pageSize}
                onChange={(event) => {
                  model.setState({
                    pageSize: Number(event.target.value),
                    page: 0,
                  });
                  if (viewport.current) viewport.current.scrollTop = 0;
                  setScrollTop(0);
                }}
              >
                {[...new Set([10, 25, 50, 100, state.pageSize])]
                  .sort((a, b) => a - b)
                  .map((size) => (
                    <option value={size} key={size}>
                      {number(size)}
                    </option>
                  ))}
              </select>
            </label>
            <span aria-live="polite">
              {t("grid.pageCount", {
                page: pageCount ? state.page + 1 : 0,
                pages: pageCount,
              })}
            </span>
            <button
              type="button"
              aria-label={t("grid.previousPage")}
              disabled={state.page <= 0}
              onClick={() => {
                model.setState({ page: state.page - 1 });
                if (viewport.current) viewport.current.scrollTop = 0;
                setScrollTop(0);
              }}
            >
              {direction === "rtl" ? "\u2192" : "\u2190"}
            </button>
            <button
              type="button"
              aria-label={t("grid.nextPage")}
              disabled={state.page >= pageCount - 1}
              onClick={() => {
                model.setState({ page: state.page + 1 });
                if (viewport.current) viewport.current.scrollTop = 0;
                setScrollTop(0);
              }}
            >
              {direction === "rtl" ? "\u2190" : "\u2192"}
            </button>
          </div>
        )}
      </div>
      <span className="og-sr-only" role="status" aria-live="polite">
        {resolveMessage(announcement)}
      </span>
    </section>
  );
}

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
  color?: string;
}
/** Small SVG line chart; does not depend on a charting runtime. */
export function Sparkline({
  values,
  width = 100,
  height = 28,
  label,
  color = "currentColor",
}: SparklineProps) {
  const { t, locale } = useGridLocale();
  const finite = values
    .map((value, index) => ({ value, index }))
    .filter((point) => Number.isFinite(point.value));
  const min = Math.min(...finite.map((point) => point.value));
  const max = Math.max(...finite.map((point) => point.value));
  const points = finite
    .map(
      (point) =>
        `${2 + (point.index / Math.max(1, values.length - 1)) * (width - 4)},${height - 2 - ((point.value - min) / (max - min || 1)) * (height - 4)}`,
    )
    .join(" ");
  return (
    <svg
      role="img"
      lang={locale}
      aria-label={label ?? t("grid.sparkline")}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="og-sparkline"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
