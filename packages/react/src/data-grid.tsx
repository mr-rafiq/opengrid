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
import { useCellRanges } from "./use-cell-ranges.js";
import { useFind } from "./use-find.js";
import { CellNotesStore } from "@opengrid/core";
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

export interface CellContext<T> {
  value: unknown;
  row: T;
  column: Column<T>;
}
export interface DataGridProps<T> {
  model: GridModel<T>;
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
  ariaLabel = "Data grid",
  toolbar = true,
  advancedFiltering = true,
  filterComponents,
  notes,
  pagination = true,
  className = "",
  renderCell,
  onCellEdit,
}: DataGridProps<T>) {
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const allColumns = model.getColumns();
  const hasColumnSpans = allColumns.some(
    (column) => column.colSpan !== undefined,
  );
  const effectiveCellSelection = cellSelection && !hasColumnSpans;
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
  const columns = [
    ...ordered.filter((c) => pinOf(c) === "left"),
    ...ordered.filter((c) => !pinOf(c)),
    ...ordered.filter((c) => pinOf(c) === "right"),
  ];
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
  const widthOf = (column: Column<T>) =>
    Object.hasOwn(state.columnWidths, column.id)
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
    const ordinary = createColumnSpanPlan(spanColumns, { kind: "group" });
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
        plan = createColumnSpanPlan(spanColumns, {
          kind: "row",
          row: node.data,
        });
      cache.set(row, plan);
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
      return plan;
    };
  }, [model, state, projection, hasColumnSpans]);
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
  const groupDepth = computeHeaderGroups(groupedColumns).length;
  const headerRows = groupDepth + 2;
  const headerHeight = headerRows * 38;
  const viewport = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const cells = useRef(new Map<string, HTMLDivElement>());
  const fullWidthCells = useRef(new Map<string, HTMLDivElement>());
  const ownsCellFocus = useRef(false);
  const dragCleanup = useRef<(() => void) | undefined>(undefined);
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
  const [viewportWidth, setViewportWidth] = useState(1024);
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
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<string[][]>([]);
  const groupVisibility = useRef(new Map<string, Record<string, boolean>>());
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const findInput = useRef<HTMLInputElement>(null);
  const [noteEditing, setNoteEditing] = useState<CellPosition | null>(null);
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
          message: "This data source does not support managed row moves",
        };
  const rowMoveReason = !rowDragging
    ? "Row moving is not enabled"
    : !coreReorder.allowed
      ? coreReorder.message
      : !columns.length
        ? "Show a data column before moving rows"
        : editing || rowEditing || noteEditing
          ? "Finish or cancel editing before moving rows"
          : projection.top.length || projection.bottom.length
            ? "Remove pinned rows from this view before moving rows"
            : projection.rows.some((entry) => entry.fullWidth)
              ? "Turn off full-width rows in this view before moving rows"
              : rowGeometry.detailCount
                ? "Close detail panels before moving rows"
                : rows.some(
                      (node) =>
                        node.kind !== "row" ||
                        node.data === undefined ||
                        node.depth !== 0 ||
                        node.children?.length,
                    )
                  ? "Managed row moves require ordinary flat rows"
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
  const finder = useFind(model, dataRowIds, (position) => {
    const row = projection.indexOf(position.rowId);
    return (
      row >= 0 && ownerColumnId(row, position.columnId) === position.columnId
    );
  });
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

  useEffect(() => () => dragCleanup.current?.(), []);
  useEffect(() => () => stopManagedDrag(), [model, rowDragging]);
  useEffect(() => {
    if (
      managedDrag.current &&
      (managedDrag.current.signature !== rowViewSignature || rowMoveReason)
    )
      stopManagedDrag("The row view changed. Start the move again.");
  }, [rowViewSignature, rowMoveReason]);
  useEffect(() => {
    const cancel = () => stopManagedDrag();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && managedDrag.current) {
        event.preventDefault();
        stopManagedDrag("Row move cancelled");
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
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    window.addEventListener("dragover", track, true);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("dragover", track, true);
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
    const maximum = Math.max(0, totalWidth - viewportWidth);
    if (container.scrollLeft > maximum) {
      container.scrollLeft = maximum;
      setScrollLeft(maximum);
    }
  }, [totalWidth, viewportWidth]);
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
    setFocus((current) => ({
      rowId: rows.some((node) => node.id === current.rowId)
        ? current.rowId
        : (rows[0]?.id ?? ""),
      columnId: ownerColumnId(
        Math.max(0, projection.indexOf(current.rowId)),
        current.columnId,
      ),
    }));
  }, [projection, spanPlanFor]);
  useLayoutEffect(() => {
    const current = editingRef.current;
    if (!current) return;
    const row = projection.indexOf(current.rowId);
    if (
      row < 0 ||
      !columns.some((column) => column.id === current.columnId) ||
      ownerColumnId(row, current.columnId) !== current.columnId
    ) {
      cancelEdit();
      setAnnouncement(
        "Editing cancelled because the cell is no longer visible",
      );
    }
  }, [spanPlanFor, projection]);
  useLayoutEffect(() => {
    if (!ownsCellFocus.current || editing || rowEditing || noteEditing) return;
    const row = projection.indexOf(focus.rowId);
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
  }, [projection, spanPlanFor, editing, rowEditing, noteEditing, focus]);
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      const cell = projection.rows[focusRow]?.fullWidth
        ? fullWidthCells.current.get(rows[focusRow].id)
        : cells.current.get(
            keyOf(focusRow, ownerColumnId(focusRow, focus.columnId)),
          );
      if (cell) {
        cell.focus({ preventScroll: true });
        pendingFocus.current = false;
      }
    }
  });
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
        const left = (span?.offset ?? 0) + selectionWidth;
        const targetWidth = span?.width ?? widthOf(target);
        const leftPinned = columns
          .filter((c) => pinOf(c) === "left")
          .reduce((x, c) => x + widthOf(c), selectionWidth);
        const rightPinned = columns
          .filter((c) => pinOf(c) === "right")
          .reduce((x, c) => x + widthOf(c), 0);
        if (left < container.scrollLeft + leftPinned)
          container.scrollLeft = Math.max(0, left - leftPinned);
        else if (
          left + targetWidth >
          container.scrollLeft + viewportWidth - rightPinned
        )
          container.scrollLeft =
            left + targetWidth - viewportWidth + rightPinned;
      }
      setScrollLeft(container.scrollLeft);
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
          ? (span.leftOffset ?? 0) + selectionWidth
          : columns
              .slice(0, columns.indexOf(column))
              .filter((c) => pinOf(c) === "left")
              .reduce((x, c) => x + widthOf(c), selectionWidth),
        zIndex: 2,
      });
    if (pin === "right")
      Object.assign(style, {
        position: "sticky",
        right: span
          ? (span.rightOffset ?? 0)
          : columns
              .slice(columns.indexOf(column) + 1)
              .filter((c) => pinOf(c) === "right")
              .reduce((x, c) => x + widthOf(c), 0),
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
    const label = `Filter ${column.header ?? column.id}`;
    return (
      <FilterOwner>
        {Component ? (
          <Component
            column={column}
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
                ? "= value"
                : "Filter..."
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
          ...target,
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
    setAnnouncement("Cell updated");
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
      label: `Edit ${column.header ?? column.id} row ${node.id}`,
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
          if (commitEdit()) focusAt(Math.min(rows.length - 1, row + 1), index);
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
            ? "Change redone"
            : "Change undone"
          : "No edits to restore",
      );
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        targetRow++;
        break;
      case "ArrowUp":
        targetRow--;
        break;
      case "ArrowLeft":
        if (node.children?.length && state.expanded.includes(node.id)) {
          model.toggleExpanded(node.id);
          event.preventDefault();
          return;
        }
        targetCol--;
        break;
      case "ArrowRight":
        if (node.children?.length && !state.expanded.includes(node.id)) {
          model.toggleExpanded(node.id);
          event.preventDefault();
          return;
        }
        targetCol = ownerAt(row, col)?.end ?? col + 1;
        break;
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
  function stopManagedDrag(message?: string) {
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
      (!status.allowed ? status.message : undefined) ??
      (signature !== expectedSignature
        ? "The row view changed. Start the move again."
        : !actualRows.some((node) => node.id === rowId) ||
            !actualRows.some((node) => node.id === targetRowId)
          ? "Moves must stay within the current page"
          : undefined);
    if (message) {
      setError(message);
      setAnnouncement(message);
      return false;
    }
    const before = model.getState();
    let failure: string | undefined;
    try {
      failure = model.moveRows([rowId], targetRowId, position);
    } catch (reason) {
      failure =
        reason instanceof Error ? reason.message : "Unable to move this row";
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
      `Row ${rowId} moved to position ${updatedPage.findIndex((node) => node.id === rowId) + 1} on this page`,
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
        direction < 0
          ? "Row is already first on this page"
          : "Row is already last on this page",
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
      stopManagedDrag("The row view changed. Start the move again.");
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
    setAnnouncement(
      `Moving row ${rowId}. Drop before or after another row on this page.`,
    );
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
      setAnnouncement("Only a row dragged from this grid can be moved here");
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
                  left: 0,
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
                {selectionWidth > 0 && (
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
                        disabled={Boolean(rowMoveReason)}
                        aria-label={`Drag row ${node.id}`}
                        aria-describedby={rowMoveHelpId}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        title={
                          rowMoveReason ??
                          "Drag to move; Alt+Up or Alt+Down moves one row"
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
                        aria-label={`Select row ${node.id}`}
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
                      className={`og-cell ${isEditing ? "og-editing" : ""} ${pinOf(column) ? "og-pinned" : ""} ${findMatches.has(JSON.stringify([node.id, column.id])) ? "og-find-match" : ""} ${activeFind?.rowId === node.id && activeFind.columnId === column.id ? "og-find-active" : ""} ${ranges.contains(node.id, column.id) ? "og-range-selected" : ""} ${column.type === "number" || column.type === "bigint" ? "og-numeric" : ""}`}
                      style={cellStyle(column, span)}
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
                        setFocus({ rowId: node.id, columnId: column.id });
                        if (event.detail === 0)
                          ranges.select(
                            { rowId: node.id, columnId: column.id },
                            event.shiftKey,
                          );
                      }}
                      onDoubleClick={(event) => {
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
                        renderEditorControl(node, column, row, index)
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
                                aria-label={`Edit note for ${column.header ?? column.id} row ${node.id}`}
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
                                  aria-label={`${rowGeometry.detailHeights[row] ? "Collapse" : "Expand"} details row ${node.id}`}
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
                                  aria-label={`${state.expanded.includes(node.id) ? "Collapse" : "Expand"} ${node.label ?? node.id}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    model.toggleExpanded(node.id);
                                  }}
                                >
                                  {state.expanded.includes(node.id)
                                    ? "\u25be"
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
                                  {node.leafCount}
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
                                aria-label="Drag to fill cells; Alt-drag extends a numeric series"
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
          {rowGeometry.detailHeights[row] > 0 && node.data && (
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
                  left: 0,
                  width: viewportWidth,
                  height: "100%",
                  overflow: "auto",
                  padding: 12,
                }}
              >
                <div role="region" aria-label={`Details for row ${node.id}`}>
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
    <section className={`og-root ${className}`}>
      {hasColumnSpans && (
        <p className="og-span-help" role="status">
          Column spanning is configured. Cell ranges, grid clipboard and fill
          are unavailable; row selection and cell editing remain available.
        </p>
      )}
      <p id={helpId} className="og-sr-only">
        Use arrow keys to navigate cells, Home and End to move across a row,
        Control Home and End to reach the first or last cell. Press Enter or F2
        to edit{" "}
        {editMode === "row" ? "the current row in a dialog" : "editable cells"},
        Escape to cancel, Space to select a row. Shift click headers for
        multiple sort columns.
        {effectiveCellSelection && (
          <>
            {" "}
            Shift and arrow keys extend a cell range. Control or Command A
            selects visible data cells; C copies and V pastes. Control or
            Command D fills down, R fills right. Drag the range corner to fill,
            or Alt-drag to extend a numeric series.
          </>
        )}
        {toolbar && <> Control or Command F opens Find in the current view.</>}
        {notes !== false && <> Alt N opens the current cell note.</>}
        {renderDetail && (
          <> Alt Enter expands or collapses the current row detail.</>
        )}
        {rowDragging && (
          <>
            {" "}
            Alt+Up and Alt+Down move an eligible row within the current page.
          </>
        )}
      </p>
      {toolbar && (
        <div
          className="og-toolbar"
          role="toolbar"
          aria-label="Grid tools"
          style={{ zIndex: 7 }}
        >
          <label className="og-search">
            <span aria-hidden="true">{"\u2315"}</span>
            <input
              aria-label="Search all rows"
              placeholder="Search all rows..."
              value={state.quickFilter}
              onChange={(event) => {
                model.setQuickFilter(event.target.value);
                if (viewport.current) viewport.current.scrollTop = 0;
                setScrollTop(0);
              }}
            />
          </label>
          <div className="og-toolbar-actions">
            {rowDragging && (
              <>
                <button
                  type="button"
                  aria-label="Move focused row up"
                  aria-describedby={rowMoveHelpId}
                  disabled={Boolean(rowMoveReason) || focusRow <= 0}
                  onClick={() => moveAdjacentRow(focus.rowId, -1, "cell")}
                >
                  Move focused row up
                </button>
                <button
                  type="button"
                  aria-label="Move focused row down"
                  aria-describedby={rowMoveHelpId}
                  disabled={
                    Boolean(rowMoveReason) || focusRow >= rows.length - 1
                  }
                  onClick={() => moveAdjacentRow(focus.rowId, 1, "cell")}
                >
                  Move focused row down
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
                Edit row
              </button>
            )}
            <button
              type="button"
              onClick={() => setFindOpen(!findOpen)}
              aria-expanded={findOpen}
            >
              Find
            </button>
            {notes !== false && (
              <button type="button" onClick={() => openNote()}>
                Note
              </button>
            )}
            {advancedFiltering && (
              <button
                type="button"
                aria-pressed={Boolean(state.advancedFilter)}
                aria-expanded={filterBuilderOpen}
                onClick={() => setFilterBuilderOpen(!filterBuilderOpen)}
              >
                Advanced filter
              </button>
            )}
            {effectiveCellSelection && (
              <>
                <button
                  type="button"
                  onClick={ranges.copyToClipboard}
                  aria-label="Copy selected cells"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={ranges.pasteFromClipboard}
                  aria-label="Paste cells"
                >
                  Paste
                </button>
                <button
                  type="button"
                  onClick={() => ranges.fill("down")}
                  aria-label="Fill down selected cells"
                >
                  Fill down
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                model.undo();
                setAnnouncement("Undo requested");
              }}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => {
                model.redo();
                setAnnouncement("Redo requested");
              }}
            >
              Redo
            </button>
            <button type="button" onClick={downloadCsv}>
              Export CSV
            </button>
            <details className="og-chooser">
              <summary>Columns</summary>
              <div className="og-chooser-panel">
                <strong>Arrange your view</strong>
                {allColumns.map((column, index) => (
                  <div className="og-column-option" key={column.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Show ${column.header ?? column.id}`}
                        checked={visibleOf(column)}
                        onChange={(event) =>
                          model.hideColumn(column.id, !event.target.checked)
                        }
                      />
                      {column.header ?? column.id}
                    </label>
                    <select
                      aria-label={`Pin ${column.header ?? column.id}`}
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
                      <option value="">Unpinned</option>
                      <option value="left">Pin left</option>
                      <option value="right">Pin right</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Move ${column.header ?? column.id} left`}
                      onClick={() =>
                        model.moveColumn(
                          column.id,
                          Math.max(0, state.columnOrder.indexOf(column.id) - 1),
                        )
                      }
                    >
                      {"\u2190"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${column.header ?? column.id} right`}
                      onClick={() =>
                        model.moveColumn(
                          column.id,
                          Math.min(
                            allColumns.length - 1,
                            (state.columnOrder.indexOf(column.id) < 0
                              ? index
                              : state.columnOrder.indexOf(column.id)) + 1,
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
      {rowDragging && (
        <p className="og-row-move-help" id={rowMoveHelpId} role="status">
          {rowMoveReason ??
            "Drag a row handle or press Alt+Up or Alt+Down on a cell. Moves stay within this page."}
        </p>
      )}
      {findOpen && (
        <div
          className="og-findbar"
          role="search"
          aria-label="Find in current view"
        >
          <input
            ref={findInput}
            aria-label="Find in current view"
            placeholder="Find without filtering rows"
            value={finder.snapshot.query}
            onChange={(event) => {
              try {
                finder.controller?.setQuery(event.target.value);
                focusMatch(finder.controller?.getSnapshot().matches[0], false);
                setError("");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "Find failed",
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
              ? `${finder.snapshot.activeIndex + 1} of ${finder.snapshot.matches.length}`
              : "No matches"}
          </span>
          <button
            type="button"
            aria-label="Previous find match"
            onClick={() => focusMatch(finder.controller?.previous())}
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next find match"
            onClick={() => focusMatch(finder.controller?.next())}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => {
              setFindOpen(false);
              finder.controller?.setQuery("");
            }}
          >
            Close find
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
        ref={viewport}
        style={{ height: safeHeight }}
        role={hierarchical ? "treegrid" : "grid"}
        tabIndex={-1}
        aria-label={ariaLabel}
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
          const left = Math.min(
            Math.max(0, totalWidth - viewportWidth),
            event.currentTarget.scrollLeft,
          );
          if (event.currentTarget.scrollLeft !== left)
            event.currentTarget.scrollLeft = left;
          setScrollLeft(left);
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
                  aria-label="Row controls"
                  className="og-selection og-header-cell"
                  style={{ width: selectionWidth, minWidth: selectionWidth }}
                >
                  {selectionMode === "multiple" && (
                    <input
                      type="checkbox"
                      aria-label="Select all rows on page"
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
                      aria-label={`Sort ${column.header ?? column.id}`}
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
                          ? state.sorting.indexOf(sort) + 1
                          : ""}
                      </span>
                    </button>
                    <div
                      role="separator"
                      tabIndex={0}
                      aria-orientation="vertical"
                      aria-label={`Resize ${column.header ?? column.id}`}
                      aria-valuenow={widthOf(column)}
                      aria-valuemin={column.minWidth ?? 60}
                      aria-valuemax={column.maxWidth ?? 1000}
                      className="og-resizer"
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight"
                        ) {
                          event.preventDefault();
                          model.resizeColumn(
                            column.id,
                            widthOf(column) +
                              (event.key === "ArrowRight" ? 10 : -10),
                          );
                        }
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        dragCleanup.current?.();
                        const startX = event.clientX;
                        const width = widthOf(column);
                        const move = (pointer: PointerEvent) =>
                          model.resizeColumn(
                            column.id,
                            width + pointer.clientX - startX,
                          );
                        const stop = () => {
                          window.removeEventListener("pointermove", move);
                          window.removeEventListener("pointerup", stop);
                          dragCleanup.current = undefined;
                        };
                        dragCleanup.current = stop;
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", stop, {
                          once: true,
                        });
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
            aria-label="Pinned top rows"
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
            aria-label="Pinned bottom rows"
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
            No matching rows
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
            setAnnouncement("Row updated");
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
        <span>
          {model.getFilteredRows().length.toLocaleString()} rows
          {ranges.selectedCellCount > 0 && (
            <>
              {" "}
              {"\u00b7"} {ranges.selectedCellCount.toLocaleString()} cells
              selected
            </>
          )}
          {state.selected.length > 0 && (
            <>
              {" "}
              {"\u00b7"} {state.selected.length.toLocaleString()} selected
            </>
          )}
        </span>
        {pagination && (
          <div className="og-pagination">
            <label>
              Rows per page{" "}
              <select
                aria-label="Rows per page"
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
                      {size}
                    </option>
                  ))}
              </select>
            </label>
            <span aria-live="polite">
              Page {pageCount ? state.page + 1 : 0} of {pageCount}
            </span>
            <button
              type="button"
              aria-label="Previous page"
              disabled={state.page <= 0}
              onClick={() => {
                model.setState({ page: state.page - 1 });
                if (viewport.current) viewport.current.scrollTop = 0;
                setScrollTop(0);
              }}
            >
              {"\u2190"}
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={state.page >= pageCount - 1}
              onClick={() => {
                model.setState({ page: state.page + 1 });
                if (viewport.current) viewport.current.scrollTop = 0;
                setScrollTop(0);
              }}
            >
              {"\u2192"}
            </button>
          </div>
        )}
      </div>
      <span className="og-sr-only" role="status" aria-live="polite">
        {announcement}
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
  label = "Trend",
  color = "currentColor",
}: SparklineProps) {
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
      aria-label={label}
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
