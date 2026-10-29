import {
  useEffect,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
  useRef,
  useState,
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
import {
  CellEditor,
  type CellEditorProps,
  type CellEditorRenderer,
  type EditorOption,
  type EditorType,
} from "./editors.js";
export * from "./editors.js";
export * from "./charts.js";

export interface EditorConfig {
  type?: EditorType;
  options?: readonly EditorOption[];
  asyncOptions?: (signal?: AbortSignal) => Promise<readonly EditorOption[]>;
}
import { getColumnWindow } from "./column-window.js";
import type { ColumnWindowEntry } from "./column-window.js";
export { getColumnWindow } from "./column-window.js";
export type {
  WindowColumn,
  ColumnWindowEntry,
  ColumnWindowOptions,
} from "./column-window.js";

export interface CellContext<T> {
  value: unknown;
  row: T;
  column: Column<T>;
}
export interface DataGridProps<T> {
  model: GridModel<T>;
  height?: number;
  rowHeight?: number;
  overscan?: number;
  columnOverscan?: number;
  virtualizeColumns?: boolean;
  selectionMode?: "single" | "multiple" | "none";
  cellSelection?: boolean;
  onCellRangeChange?: (range: CellRange | null) => void;
  editorOptions?: Record<string, EditorConfig>;
  renderEditor?: CellEditorRenderer<T>;
  ariaLabel?: string;
  toolbar?: boolean;
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

/** A fixed-row-height grid. The supplied model owns data and persisted state. */
export function DataGrid<T>({
  model,
  height = 480,
  rowHeight = 38,
  overscan = 6,
  columnOverscan = 200,
  virtualizeColumns = true,
  selectionMode = "multiple",
  cellSelection = true,
  onCellRangeChange,
  editorOptions = {},
  renderEditor,
  ariaLabel = "Data grid",
  toolbar = true,
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
  const ordered = [...allColumns]
    .sort((a, b) => {
      const ai = state.columnOrder.indexOf(a.id);
      const bi = state.columnOrder.indexOf(b.id);
      return (
        (ai < 0 ? allColumns.indexOf(a) : ai) -
        (bi < 0 ? allColumns.indexOf(b) : bi)
      );
    })
    .filter((c) => state.columnVisibility[c.id] ?? !c.hidden);
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
  const hierarchical = rowModel.some(
    (node) =>
      node.kind === "group" || node.depth > 0 || Boolean(node.children?.length),
  );
  const rows = pagination ? model.getPageRows() : rowModel;
  const selectionWidth = selectionMode === "none" ? 0 : 44;
  const widthOf = (column: Column<T>) =>
    state.columnWidths[column.id] ?? column.width ?? 160;
  const totalWidth = columns.reduce(
    (width, column) => width + widthOf(column),
    selectionWidth,
  );
  const headerHeight = 76;
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
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const helpId = useId();
  const errorId = useId();
  const safeHeight = Number.isFinite(height) ? Math.max(140, height) : 480;
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
  const first = Math.min(
    Math.max(0, rows.length - 1),
    Math.max(
      0,
      Math.floor(Math.max(0, scrollTop - headerHeight) / safeRowHeight) -
        safeOverscan,
    ),
  );
  const last = Math.min(
    rows.length,
    first + Math.ceil(safeHeight / safeRowHeight) + safeOverscan * 2 + 2,
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
    rowIds: rows.filter((node) => node.kind === "row").map((node) => node.id),
    enabled: cellSelection,
    viewport,
    getFocusedCell: () =>
      rows[focus.row]?.kind === "row"
        ? { rowId: rows[focus.row].id, columnId: focus.columnId }
        : undefined,
    onMessage: (message, failed) => {
      setError(failed ? message : "");
      setAnnouncement(message);
    },
  });
  useEffect(() => {
    onCellRangeChange?.(ranges.range);
  }, [onCellRangeChange, ranges.range]);

  useEffect(() => () => dragCleanup.current?.(), []);
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
      rows.length * safeRowHeight +
        headerHeight -
        (container.clientHeight || safeHeight),
    );
    if (container.scrollTop > maximum) {
      container.scrollTop = maximum;
      setScrollTop(maximum);
    }
  }, [
    rows.length,
    safeRowHeight,
    safeHeight,
    state.page,
    state.groupBy.join("\u0000"),
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
      const top = row * safeRowHeight;
      const visibleHeight = Math.max(
        safeRowHeight,
        container.clientHeight - headerHeight,
      );
      if (top < container.scrollTop) container.scrollTop = top;
      else if (top + safeRowHeight > container.scrollTop + visibleHeight)
        container.scrollTop = top + safeRowHeight - visibleHeight;
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
    pendingFocus.current = true;
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

  function startEdit(node: RowNode<T>, column: Column<T>, initial?: string) {
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
        targetRow += Math.max(
          1,
          Math.floor((safeHeight - headerHeight) / safeRowHeight),
        );
        break;
      case "PageUp":
        targetRow -= Math.max(
          1,
          Math.floor((safeHeight - headerHeight) / safeRowHeight),
        );
        break;
      case "Enter":
      case "F2":
        event.preventDefault();
        if (
          node.children?.length &&
          (node.kind === "group" || !column.editable)
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
        to edit, Escape to cancel, Space to select a row. Shift click headers
        for multiple sort columns. Shift and arrow keys extend a cell range.
        Control or Command A selects visible data cells; C copies and V pastes.
        Control or Command D fills down, R fills right. Drag the range corner to
        fill, or Alt-drag to extend a numeric series.
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
                        checked={
                          state.columnVisibility[column.id] ?? !column.hidden
                        }
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
      <div
        className="og-viewport"
        ref={viewport}
        style={{ height: safeHeight }}
        role={hierarchical ? "treegrid" : "grid"}
        aria-label={ariaLabel}
        aria-describedby={helpId}
        aria-rowcount={rows.length + 2}
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
          role="rowgroup"
          style={{ width: Math.max(totalWidth, 1), minWidth: "100%" }}
        >
          <div role="row" aria-rowindex={1} className="og-header-row">
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
          <div role="row" aria-rowindex={2} className="og-filter-row">
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
        <div
          role="rowgroup"
          className="og-body"
          style={{
            height: rows.length * safeRowHeight,
            width: Math.max(totalWidth, 1),
            minWidth: "100%",
          }}
        >
          {renderedRowIndices.map((row) => {
            const node = rows[row];
            const isSelected = selected.has(node.id);
            return (
              <div
                role="row"
                key={node.id}
                aria-rowindex={row + 3}
                aria-selected={
                  selectionMode === "none" ? undefined : isSelected
                }
                aria-level={hierarchical ? node.depth + 1 : undefined}
                aria-expanded={
                  node.children?.length
                    ? state.expanded.includes(node.id)
                    : undefined
                }
                className={`og-row ${row % 2 ? "og-row-alt" : ""} ${isSelected ? "og-row-selected" : ""} ${node.kind === "group" ? "og-group-row" : ""}`}
                style={{
                  top: row * safeRowHeight,
                  height: safeRowHeight,
                  width: "100%",
                }}
              >
                {selectionWidth > 0 && (
                  <div
                    role="gridcell"
                    aria-colindex={1}
                    className="og-selection og-cell"
                    style={{ width: selectionWidth, minWidth: selectionWidth }}
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
                    : node.aggregates?.[column.id];
                  const isEditing =
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
                      className={`og-cell ${isEditing ? "og-editing" : ""} ${pinOf(column) ? "og-pinned" : ""} ${ranges.contains(node.id, column.id) ? "og-range-selected" : ""} ${column.type === "number" || column.type === "bigint" ? "og-numeric" : ""}`}
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
                      onDoubleClick={() => startEdit(node, column)}
                      onKeyDown={(event) => onCellKey(event, node, column, row)}
                    >
                      {isEditing ? (
                        renderEditorControl(node, column, row, index)
                      ) : (
                        <>
                          {index === 0 && (
                            <span
                              className="og-tree-prefix"
                              style={{ paddingInlineStart: node.depth * 16 }}
                            >
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
