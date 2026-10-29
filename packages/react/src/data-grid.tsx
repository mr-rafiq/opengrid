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
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import type {
  Column,
  GridModel,
  RowNode,
  CellPosition,
  CellRange,
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
  ariaLabel?: string;
  toolbar?: boolean;
  advancedFiltering?: boolean;
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
  row: number;
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
  ariaLabel = "Data grid",
  toolbar = true,
  advancedFiltering = true,
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
  const rows = pagination ? model.getPageRows() : rowModel;
  const dataRowIds = useMemo(
    () => rows.filter((node) => node.kind === "row").map((node) => node.id),
    [model, state, pagination],
  );
  const selectionWidth = selectionMode === "none" ? 0 : 44;
  const widthOf = (column: Column<T>) =>
    Object.hasOwn(state.columnWidths, column.id)
      ? state.columnWidths[column.id]
      : (column.width ?? 160);
  const totalWidth = columns.reduce(
    (width, column) => width + widthOf(column),
    selectionWidth,
  );
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
  const dragCleanup = useRef<(() => void) | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1024);
  const [focus, setFocus] = useState<FocusCell>({
    row: 0,
    columnId: columns[0]?.id ?? "",
  });
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
  const safeHeight = Number.isFinite(height)
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
    return {
      layout: createRowLayout(
        baseHeights.map((height, index) => height + detailHeights[index]),
      ),
      baseHeights,
      detailHeights,
      before,
      detailCount: detailsBefore,
    };
  }, [
    model,
    state,
    pagination,
    safeRowHeight,
    getRowHeight,
    renderDetail,
    detailHeight,
    JSON.stringify(detailIds),
  ]);
  const { start: first, end: last } = rowGeometry.layout.window(
    scrollTop,
    Math.max(0, safeHeight - headerHeight),
    safeOverscan,
  );
  const renderedRowIndices = Array.from(
    { length: Math.max(0, last - first) },
    (_, index) => first + index,
  );
  for (const retained of [
    focus.row,
    editing ? rows.findIndex((node) => node.id === editing.rowId) : -1,
  ]) {
    if (
      retained >= 0 &&
      retained < rows.length &&
      !renderedRowIndices.includes(retained)
    )
      renderedRowIndices.push(retained);
  }
  renderedRowIndices.sort((a, b) => a - b);
  const selected = new Set(state.selected);
  const keyOf = (row: number, id: string) => JSON.stringify([row, id]);
  const pageCount = model.getPageCount();
  const ranges = useCellRanges({
    model,
    rowIds: dataRowIds,
    enabled: cellSelection,
    viewport,
    headerHeight,
    getFocusedCell: () =>
      rows[focus.row]?.kind === "row"
        ? { rowId: rows[focus.row].id, columnId: focus.columnId }
        : undefined,
    onMessage: (message, failed) => {
      setError(failed ? message : "");
      setAnnouncement(message);
    },
  });
  const finder = useFind(model, dataRowIds);
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
        headerHeight -
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
  ]);
  useEffect(() => {
    setFocus((current) => ({
      row: clamp(current.row, 0, Math.max(0, rows.length - 1)),
      columnId: columns.some((c) => c.id === current.columnId)
        ? current.columnId
        : (columns[0]?.id ?? ""),
    }));
  }, [rows.length, columns.map((c) => c.id).join("\u0000")]);
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      const cell = cells.current.get(keyOf(focus.row, focus.columnId));
      if (cell) {
        cell.focus({ preventScroll: true });
        pendingFocus.current = false;
      }
    }
  });

  function focusAt(
    row: number,
    column: number,
    extend = false,
    anchor?: CellPosition,
    takeFocus = true,
  ) {
    if (!rows.length || !columns.length) return;
    row = clamp(row, 0, rows.length - 1);
    column = clamp(column, 0, columns.length - 1);
    if (extend && !ranges.controller?.getSnapshot().range) {
      if (anchor) ranges.select(anchor);
      else if (rows[focus.row]?.kind === "row")
        ranges.select({ rowId: rows[focus.row].id, columnId: focus.columnId });
    }
    if (rows[row].kind === "row")
      ranges.select(
        { rowId: rows[row].id, columnId: columns[column].id },
        extend,
      );
    const container = viewport.current;
    if (container) {
      const top = rowGeometry.layout.offset(row);
      const visibleHeight = Math.max(
        safeRowHeight,
        container.clientHeight - headerHeight,
      );
      if (top < container.scrollTop) container.scrollTop = top;
      else if (
        top + rowGeometry.baseHeights[row] >
        container.scrollTop + visibleHeight
      )
        container.scrollTop =
          top + rowGeometry.baseHeights[row] - visibleHeight;
      setScrollTop(container.scrollTop);
      // Scroll unpinned columns into view without disturbing pinned columns.
      const target = columns[column];
      if (!pinOf(target)) {
        const left = columns
          .slice(0, column)
          .reduce((x, c) => x + widthOf(c), selectionWidth);
        const leftPinned = columns
          .filter((c) => pinOf(c) === "left")
          .reduce((x, c) => x + widthOf(c), selectionWidth);
        const rightPinned = columns
          .filter((c) => pinOf(c) === "right")
          .reduce((x, c) => x + widthOf(c), 0);
        if (left < container.scrollLeft + leftPinned)
          container.scrollLeft = Math.max(0, left - leftPinned);
        else if (
          left + widthOf(target) >
          container.scrollLeft + viewportWidth - rightPinned
        )
          container.scrollLeft =
            left + widthOf(target) - viewportWidth + rightPinned;
      }
      setScrollLeft(container.scrollLeft);
    }
    pendingFocus.current = takeFocus;
    setFocus({ row, columnId: columns[column].id });
  }

  function cellStyle(column: Column<T>): CSSProperties {
    const width = widthOf(column);
    const pin = pinOf(column);
    const style: CSSProperties = { width, minWidth: width, maxWidth: width };
    if (pin === "left")
      Object.assign(style, {
        position: "sticky",
        left: columns
          .slice(0, columns.indexOf(column))
          .filter((c) => pinOf(c) === "left")
          .reduce((x, c) => x + widthOf(c), selectionWidth),
        zIndex: 2,
      });
    if (pin === "right")
      Object.assign(style, {
        position: "sticky",
        right: columns
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
      (rows[focus.row]?.kind === "row"
        ? { rowId: rows[focus.row].id, columnId: focus.columnId }
        : undefined);
    if (target && notes !== false) setNoteEditing(target);
  }
  function startEdit(node: RowNode<T>, column: Column<T>, initial?: string) {
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
            const next = index + (event.shiftKey ? -1 : 1);
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
    if (cellSelection && (event.ctrlKey || event.metaKey)) {
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
    if (cellSelection && event.key === "Escape") {
      event.preventDefault();
      ranges.clear();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      const changed = event.shiftKey ? model.redo() : model.undo();
      setAnnouncement(
        changed
          ? event.shiftKey
            ? "Edit redone"
            : "Edit undone"
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
        targetCol++;
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
        targetRow = Math.max(
          row + 1,
          rowGeometry.layout.indexAt(
            rowGeometry.layout.offset(row) + safeHeight - headerHeight,
          ),
        );
        break;
      case "PageUp":
        targetRow = Math.min(
          row - 1,
          rowGeometry.layout.indexAt(
            rowGeometry.layout.offset(row) - safeHeight + headerHeight,
          ),
        );
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

  return (
    <section className={`og-root ${className}`}>
      <p id={helpId} className="og-sr-only">
        Use arrow keys to navigate cells, Home and End to move across a row,
        Control Home and End to reach the first or last cell. Press Enter or F2
        to edit{" "}
        {editMode === "row" ? "the current row in a dialog" : "editable cells"},
        Escape to cancel, Space to select a row. Shift click headers for
        multiple sort columns.
        {cellSelection && (
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
      </p>
      {toolbar && (
        <div className="og-toolbar" role="toolbar" aria-label="Grid tools">
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
            {editMode === "row" && (
              <button
                type="button"
                aria-haspopup="dialog"
                disabled={
                  rows[focus.row]?.kind !== "row" ||
                  !columns.some(
                    (column) =>
                      column.editable && column.field && !column.valueGetter,
                  )
                }
                onClick={() => {
                  const node = rows[focus.row];
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
            {cellSelection && (
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
                  focus.row,
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
        aria-colcount={columns.length + (selectionWidth ? 1 : 0)}
        aria-multiselectable={
          selectionMode === "multiple" || cellSelection || undefined
        }
        onCopy={ranges.onCopy}
        onPaste={ranges.onPaste}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
          setScrollLeft(event.currentTarget.scrollLeft);
        }}
      >
        <div
          className="og-header"
          style={{ width: Math.max(totalWidth, 1), minWidth: "100%" }}
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
                  >
                    {column.filterable !== false && (
                      <input
                        aria-label={`Filter ${column.header ?? column.id}`}
                        placeholder={
                          column.type === "number" || column.type === "bigint"
                            ? "= value"
                            : "Filter..."
                        }
                        value={text(state.filters[column.id]?.value)}
                        onChange={(event) => {
                          model.setFilter(
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
                          );
                          if (viewport.current) viewport.current.scrollTop = 0;
                          setScrollTop(0);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div
          role="rowgroup"
          className="og-body"
          style={{
            height: rowGeometry.layout.totalHeight,
            width: Math.max(totalWidth, 1),
            minWidth: "100%",
          }}
        >
          {renderedRowIndices.map((row) => {
            const node = rows[row];
            const isSelected = selected.has(node.id);
            return (
              <Fragment key={node.id}>
                <div
                  role="row"
                  key={node.id}
                  aria-rowindex={row + rowGeometry.before[row] + headerRows + 1}
                  aria-selected={
                    selectionMode === "none" ? undefined : isSelected
                  }
                  aria-level={hierarchical ? node.depth + 1 : undefined}
                  aria-expanded={
                    node.children?.length
                      ? state.expanded.includes(node.id)
                      : renderDetail && node.kind === "row"
                        ? Boolean(rowGeometry.detailHeights[row])
                        : undefined
                  }
                  className={`og-row ${row % 2 ? "og-row-alt" : ""} ${isSelected ? "og-row-selected" : ""} ${node.kind === "group" ? "og-group-row" : ""}`}
                  style={{
                    top: rowGeometry.layout.offset(row),
                    height: rowGeometry.baseHeights[row],
                    width: "100%",
                  }}
                >
                  {selectionWidth > 0 && (
                    <div
                      role="gridcell"
                      aria-colindex={1}
                      className="og-selection og-cell"
                      style={{
                        width: selectionWidth,
                        minWidth: selectionWidth,
                      }}
                    >
                      {node.kind === "row" && (
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
                  {columnEntries.map((entry) => {
                    if (entry.kind === "spacer") return columnGap(entry);
                    const index = entry.index,
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
                        aria-readonly={!column.editable || node.kind !== "row"}
                        aria-selected={
                          cellSelection
                            ? ranges.contains(node.id, column.id)
                            : undefined
                        }
                        tabIndex={
                          focus.row === row && focus.columnId === column.id
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
                        style={cellStyle(column)}
                        title={display}
                        onFocus={(event) => {
                          if (event.target === event.currentTarget)
                            setFocus({ row, columnId: column.id });
                        }}
                        onPointerDown={(event) =>
                          ranges.begin(event, {
                            rowId: node.id,
                            columnId: column.id,
                          })
                        }
                        onClick={(event) => {
                          setFocus({ row, columnId: column.id });
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
                        onKeyDown={(event) =>
                          onCellKey(event, node, column, row)
                        }
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
                                style={{ paddingInlineStart: node.depth * 16 }}
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
                            {cellSelection &&
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
                </div>
                {rowGeometry.detailHeights[row] > 0 && node.data && (
                  <div
                    id={`${helpId}-detail-${encodeURIComponent(node.id)}`}
                    role="row"
                    aria-rowindex={
                      row + rowGeometry.before[row] + headerRows + 2
                    }
                    aria-level={hierarchical ? node.depth + 2 : undefined}
                    className="og-detail-row"
                    style={{
                      position: "absolute",
                      top:
                        rowGeometry.layout.offset(row) +
                        rowGeometry.baseHeights[row],
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
                      <div
                        role="region"
                        aria-label={`Details for row ${node.id}`}
                      >
                        {renderDetail?.({ row: node.data, rowId: node.id })}
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
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
