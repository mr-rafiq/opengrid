import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  createGrid,
  type Column,
  type Filter,
  type GridModel,
  type GridState,
  type LiveViewportRowModel,
  type RowNode,
  type ServerNode,
  type ServerSideRowModel,
} from "@opengrid/core";
import { DataGrid, type CellContext } from "./data-grid.js";
import { getColumnWindow, type ColumnWindowEntry } from "./column-window.js";

const stringValue = (value: unknown) => (value == null ? "" : String(value));
const queryIdentity = (value: unknown) =>
  JSON.stringify(value, (_, item: unknown) =>
    typeof item === "bigint" ? { $bigint: String(item) } : item,
  );
const sameRoute = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, index) => key === b[index]);
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export interface ServerDataGridProps<T> {
  model: ServerSideRowModel<T>;
  columns: Column<T>[];
  height?: number;
  ariaLabel?: string;
  className?: string;
  renderCell?: (context: CellContext<T>) => ReactNode;
}
interface ServerRecord<T> {
  node: ServerNode<T>;
}

/** Read-only provider-authoritative block view with route drilldown, not an expanded mixed-route tree. */
export function ServerDataGrid<T>({
  model,
  columns,
  height = 400,
  ariaLabel = "Server data grid",
  className = "",
  renderCell,
}: ServerDataGridProps<T>) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const query = useMemo(() => model.getQuery(), [model, snapshot]);
  const queryKey = queryIdentity(query);
  const [route, setRoute] = useState<string[]>([]);
  const routeKey = JSON.stringify(route);
  const [page, setPage] = useState({ queryKey, routeKey, index: 0 });
  const index =
    page.queryKey === queryKey && page.routeKey === routeKey ? page.index : 0;
  const [requestError, setRequestError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState(0);
  const attempted = useRef<string | null>(null);
  const block = snapshot.blocks.find(
    (item) => item.blockIndex === index && sameRoute(item.groupKeys, route),
  );
  const response = block?.response;
  const remoteError = snapshot.errors.find(
    (item) => item.blockIndex === index && sameRoute(item.groupKeys, route),
  );
  const loading = snapshot.loading.some(
    (item) => item.blockIndex === index && sameRoute(item.groupKeys, route),
  );
  const rowCount = response?.rowCount;
  const pageCount =
    rowCount === undefined
      ? null
      : Math.max(1, Math.ceil(rowCount / model.blockSize));
  const originalColumns = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  const local = useMemo(
    () =>
      createGrid<ServerRecord<T>>({
        rows: [],
        getRowId: (record) => record.node.id,
        columns: columns.map((column) => ({
          ...column,
          field: undefined,
          editable: false,
          valueGetter: (record) => {
            if (record.node.kind === "group")
              return record.node.aggregates &&
                Object.hasOwn(record.node.aggregates, column.id)
                ? record.node.aggregates[column.id]
                : undefined;
            return column.valueGetter
              ? column.valueGetter(record.node.data)
              : column.field
                ? record.node.data[column.field]
                : (record.node.data as Record<string, unknown>)[column.id];
          },
          valueFormatter: (value, record) =>
            record.node.kind === "row" && column.valueFormatter
              ? column.valueFormatter(value, record.node.data)
              : stringValue(value),
          valueParser: undefined,
          validate: undefined,
        })),
      }),
    [model, columns],
  );
  const viewState = useSyncExternalStore(
    local.subscribe,
    local.getState,
    local.getState,
  );
  const setIndex = (next: number) =>
    setPage({ queryKey, routeKey, index: Math.max(0, next) });

  useEffect(() => {
    const attemptKey = JSON.stringify([
      routeKey,
      index,
      queryKey,
      retryRequest,
    ]);
    if (
      response ||
      loading ||
      (remoteError && attempted.current === attemptKey)
    )
      return;
    attempted.current = attemptKey;
    let active = true;
    setRequestError(null);
    model.loadBlock(route, index).catch((error) => {
      if (
        active &&
        !(error instanceof DOMException && error.name === "AbortError")
      )
        setRequestError(errorText(error));
    });
    return () => {
      active = false;
    };
  }, [model, routeKey, index, queryKey, retryRequest, snapshot]);
  useEffect(() => {
    if (pageCount !== null && index >= pageCount) setIndex(pageCount - 1);
  }, [pageCount, index, queryKey, routeKey]);
  useLayoutEffect(() => {
    local.setRows(response?.nodes.map((node) => ({ node })) ?? []);
  }, [local, response]);
  useLayoutEffect(() => {
    local.setState({
      sorting: query.sorting,
      filters: query.filters,
      quickFilter: "",
    });
  }, [local, queryKey]);
  useLayoutEffect(() => {
    // IDs are unique within a server route, so another route must not inherit selection.
    local.selectRows([]);
  }, [local, routeKey, index, queryKey]);

  const facade = useMemo<GridModel<ServerRecord<T>>>(() => {
    const nodes = (): RowNode<ServerRecord<T>>[] =>
      local
        .getRows()
        .map((data) => ({ id: data.node.id, kind: "row", data, depth: 0 }));
    const updateQuery = (patch: Partial<GridState>) => {
      if (patch.sorting !== undefined || patch.filters !== undefined)
        model.setQuery({
          ...(patch.sorting === undefined ? {} : { sorting: patch.sorting }),
          ...(patch.filters === undefined ? {} : { filters: patch.filters }),
        });
      local.setState(patch);
    };
    return {
      ...local,
      // Never call the client model's sorted/filtered derived rows: provider order is authoritative.
      getFilteredRows: local.getRows,
      getRowModel: nodes,
      getPageRows: nodes,
      getPageCount: () => 1,
      setState: updateQuery,
      setSort(columnId, direction, multi = false) {
        const current = model.getQuery().sorting;
        updateQuery({
          sorting: [
            ...(multi
              ? current.filter((sort) => sort.columnId !== columnId)
              : []),
            ...(direction ? [{ columnId, direction }] : []),
          ],
        });
      },
      setFilter(columnId, filter?: Filter) {
        const filters = model.getQuery().filters;
        if (filter) filters[columnId] = filter;
        else delete filters[columnId];
        updateQuery({ filters });
      },
      setQuickFilter() {
        throw new Error(
          "Global quick search is not part of the server provider contract; use column filters",
        );
      },
      editCell: () =>
        "Server data is read only; persist edits through your provider",
      batchEdit: () =>
        "Server data is read only; persist edits through your provider",
      getRowReorderStatus: () =>
        Object.freeze({
          allowed: false,
          reason: "read-only",
          message:
            "Server row order is provider-authoritative; managed reordering is unavailable",
        }),
      moveRows: () =>
        "Server row order is provider-authoritative; managed reordering is unavailable",
      undo: () => false,
      redo: () => false,
      applyTransaction() {
        throw new Error(
          "Use the server model's explicit loaded-node transaction API",
        );
      },
    };
  }, [local, model]);

  function retry() {
    setRequestError(null);
    setRetryRequest((current) => current + 1);
  }
  function visit(keys: string[]) {
    setRoute(keys);
    setRequestError(null);
  }
  const firstVisible = local.getColumns().find((column) => !column.hidden)?.id;
  const failure = remoteError?.message ?? requestError;
  return (
    <section
      className={`og-root og-remote-server ${className}`}
      aria-label={`${ariaLabel} controls`}
    >
      <div className="og-toolbar" style={{ flexWrap: "wrap" }}>
        <nav
          aria-label={`${ariaLabel} group path`}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            height: "auto",
            minHeight: 0,
            border: 0,
          }}
        >
          <button
            type="button"
            onClick={() => visit([])}
            disabled={!route.length}
          >
            All groups
          </button>
          {route.map((key, part) => (
            <button
              type="button"
              key={JSON.stringify(route.slice(0, part + 1))}
              aria-current={part === route.length - 1 ? "location" : undefined}
              onClick={() => visit(route.slice(0, part + 1))}
            >
              {key || "(blank)"}
            </button>
          ))}
        </nav>
        <details className="og-chooser">
          <summary>Server columns</summary>
          <div className="og-chooser-panel">
            {local.getColumns().map((column) => (
              <div className="og-column-option" key={column.id}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Show server ${column.header ?? column.id}`}
                    checked={!column.hidden}
                    onChange={(event) =>
                      local.hideColumn(column.id, !event.target.checked)
                    }
                  />
                  {column.header ?? column.id}
                </label>
                <select
                  aria-label={`Pin server ${column.header ?? column.id}`}
                  value={column.pinned ?? ""}
                  onChange={(event) =>
                    local.pinColumn(
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
              </div>
            ))}
          </div>
        </details>
      </div>
      <div
        role="status"
        aria-live="polite"
        style={{ padding: "8px 16px", fontSize: 12 }}
      >
        {loading || (!response && !failure) ? "Loading server rows... " : ""}
        {rowCount === undefined
          ? "Route count pending"
          : `${rowCount.toLocaleString()} rows at this route`}
        {response?.pivotColumns?.length
          ? `; ${response.pivotColumns.length} server pivot result columns available`
          : ""}
      </div>
      {failure && (
        <div role="alert" className="og-error">
          {failure}{" "}
          <button type="button" onClick={retry}>
            Retry server rows
          </button>
        </div>
      )}
      <DataGrid
        model={facade}
        height={height}
        ariaLabel={ariaLabel}
        toolbar={false}
        pagination={false}
        cellSelection={false}
        renderCell={({ value, row, column }) => {
          const node = row.node;
          if (node.kind === "group")
            return column.id === firstVisible ? (
              <button
                type="button"
                aria-label={`Open group ${node.label ?? node.key}`}
                onClick={() => visit([...route, node.key])}
              >
                {node.label ?? node.key}
                {node.childCount === undefined ? "" : ` (${node.childCount})`}
              </button>
            ) : (
              stringValue(value)
            );
          const original = originalColumns.get(column.id)!;
          return renderCell
            ? renderCell({
                value,
                row: node.data,
                column: {
                  ...original,
                  width: column.width,
                  pinned: column.pinned,
                },
              })
            : original.valueFormatter
              ? original.valueFormatter(value, node.data)
              : stringValue(value);
        }}
      />
      <div className="og-statusbar">
        <span>{viewState.selected.length} selected on this loaded page</span>
        <div className="og-pagination">
          <button
            type="button"
            aria-label="Previous server page"
            disabled={index === 0 || loading}
            onClick={() => setIndex(index - 1)}
          >
            Previous
          </button>
          <span>
            Server page {index + 1} of {pageCount ?? "..."}
          </span>
          <button
            type="button"
            aria-label="Next server page"
            disabled={pageCount === null || index >= pageCount - 1 || loading}
            onClick={() => setIndex(index + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

export interface LiveViewportDataGridProps<T> {
  model: LiveViewportRowModel<T>;
  columns: Column<T>[];
  height?: number;
  rowHeight?: number;
  overscan?: number;
  ariaLabel?: string;
  className?: string;
  renderCell?: (context: CellContext<T>) => ReactNode;
}
const MAX_SCROLL_HEIGHT = 8_000_000;

/** Sparse, read-only live grid. Large logical heights are mapped to a bounded browser scroll space. */
export function LiveViewportDataGrid<T>({
  model,
  columns: definitions,
  height = 400,
  rowHeight = 36,
  overscan = 4,
  ariaLabel = "Live viewport data grid",
  className = "",
  renderCell,
}: LiveViewportDataGridProps<T>) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const safeHeight = Number.isFinite(height) ? Math.max(120, height) : 400;
  const safeRowHeight = Number.isFinite(rowHeight)
    ? Math.max(24, rowHeight)
    : 36;
  const safeOverscan = Number.isFinite(overscan)
    ? Math.max(0, Math.min(100, Math.floor(overscan)))
    : 4;
  const columns = [
    ...definitions.filter(
      (column) => !column.hidden && column.pinned === "left",
    ),
    ...definitions.filter((column) => !column.hidden && !column.pinned),
    ...definitions.filter(
      (column) => !column.hidden && column.pinned === "right",
    ),
  ];
  const widthOf = (column: Column<T>) =>
    Number.isFinite(column.width) ? Math.max(40, column.width!) : 160;
  const totalWidth = columns.reduce((sum, column) => sum + widthOf(column), 0);
  const viewport = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef(false);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewportWidth, setViewportWidth] = useState(800);
  const [viewError, setViewError] = useState<string | null>(null);
  const [focus, setFocus] = useState({
    index: 0,
    columnId: columns[0]?.id ?? "",
  });
  const count =
    snapshot.rowCount ??
    Math.max(
      snapshot.viewport.endRow,
      Math.ceil((safeHeight - 38) / safeRowHeight) + safeOverscan,
    );
  const bodyVisibleHeight = safeHeight - 38;
  const logicalHeight = count * safeRowHeight;
  const physicalHeight = Math.min(MAX_SCROLL_HEIGHT, logicalHeight);
  const logicalMaximum = Math.max(0, logicalHeight - bodyVisibleHeight);
  const physicalMaximum = Math.max(0, physicalHeight - bodyVisibleHeight);
  const scale = physicalMaximum ? logicalMaximum / physicalMaximum : 1;
  const physicalTop = Math.min(scroll.top, physicalMaximum);
  const logicalTop = Math.min(logicalMaximum, physicalTop * scale);
  const first = Math.max(
    0,
    Math.floor(logicalTop / safeRowHeight) - safeOverscan,
  );
  const end = Math.min(
    count,
    Math.ceil((logicalTop + bodyVisibleHeight) / safeRowHeight) + safeOverscan,
  );
  const rowMap = new Map(snapshot.rows.map((row) => [row.index, row]));
  const entries = getColumnWindow(
    columns.map((column) => ({
      width: widthOf(column),
      pinned: column.pinned,
    })),
    {
      scrollLeft: scroll.left,
      viewportWidth,
      retainIndices: [
        columns.findIndex((column) => column.id === focus.columnId),
      ],
    },
  );
  const cellKey = (index: number, columnId: string) =>
    JSON.stringify([index, columnId]);

  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const update = () => setViewportWidth(container.clientWidth || 800);
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    try {
      // A positive desired window keeps an empty provider's count stream alive.
      model.setViewport(first, snapshot.rowCount === 0 ? 1 : end);
      setViewError(null);
    } catch (error) {
      setViewError(errorText(error));
    }
  }, [model, first, end, snapshot.rowCount === 0]);
  useLayoutEffect(() => {
    const container = viewport.current;
    if (container && container.scrollTop > physicalMaximum) {
      container.scrollTop = physicalMaximum;
      setScroll((current) => ({ ...current, top: physicalMaximum }));
    }
    setFocus((current) => {
      const index = Math.min(current.index, Math.max(0, count - 1)),
        columnId = columns.some((column) => column.id === current.columnId)
          ? current.columnId
          : (columns[0]?.id ?? "");
      return index === current.index && columnId === current.columnId
        ? current
        : { index, columnId };
    });
  }, [
    count,
    physicalMaximum,
    columns.map((column) => column.id).join("\u0000"),
  ]);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const cell = cells.current.get(cellKey(focus.index, focus.columnId));
    if (cell) {
      cell.focus({ preventScroll: true });
      pendingFocus.current = false;
    }
  });

  function styleFor(column: Column<T>, columnIndex: number): CSSProperties {
    const width = widthOf(column),
      style: CSSProperties = { width, minWidth: width, maxWidth: width };
    if (column.pinned === "left")
      Object.assign(style, {
        position: "sticky",
        left: columns
          .slice(0, columnIndex)
          .filter((item) => item.pinned === "left")
          .reduce((sum, item) => sum + widthOf(item), 0),
        zIndex: 2,
      });
    if (column.pinned === "right")
      Object.assign(style, {
        position: "sticky",
        right: columns
          .slice(columnIndex + 1)
          .filter((item) => item.pinned === "right")
          .reduce((sum, item) => sum + widthOf(item), 0),
        zIndex: 2,
      });
    return style;
  }
  function gap(entry: Extract<ColumnWindowEntry, { kind: "spacer" }>) {
    return (
      <div
        key={entry.key}
        role="presentation"
        aria-hidden="true"
        style={{ width: entry.width, minWidth: entry.width, flexShrink: 0 }}
      />
    );
  }
  function focusAt(index: number, columnIndex: number) {
    if (!count || !columns.length) return;
    index = Math.max(0, Math.min(count - 1, index));
    columnIndex = Math.max(0, Math.min(columns.length - 1, columnIndex));
    const container = viewport.current;
    if (container) {
      const top = index * safeRowHeight;
      let nextLogical = logicalTop;
      if (top < logicalTop) nextLogical = top;
      else if (top + safeRowHeight > logicalTop + bodyVisibleHeight)
        nextLogical = top + safeRowHeight - bodyVisibleHeight;
      container.scrollTop = Math.min(
        physicalMaximum,
        Math.max(0, nextLogical / scale),
      );
      const target = columns[columnIndex];
      if (!target.pinned) {
        const left = columns
          .slice(0, columnIndex)
          .reduce((sum, column) => sum + widthOf(column), 0);
        const pinnedLeft = columns
          .filter((column) => column.pinned === "left")
          .reduce((sum, column) => sum + widthOf(column), 0);
        const pinnedRight = columns
          .filter((column) => column.pinned === "right")
          .reduce((sum, column) => sum + widthOf(column), 0);
        const width = container.clientWidth || viewportWidth;
        if (left < container.scrollLeft + pinnedLeft)
          container.scrollLeft = Math.max(0, left - pinnedLeft);
        else if (
          left + widthOf(target) >
          container.scrollLeft + width - pinnedRight
        )
          container.scrollLeft = left + widthOf(target) - width + pinnedRight;
      }
      setScroll({ top: container.scrollTop, left: container.scrollLeft });
    }
    pendingFocus.current = true;
    setFocus({ index, columnId: columns[columnIndex].id });
  }
  function onKey(
    event: KeyboardEvent<HTMLDivElement>,
    index: number,
    columnIndex: number,
  ) {
    if (event.target !== event.currentTarget) return;
    let next = index,
      column = columnIndex;
    switch (event.key) {
      case "ArrowDown":
        next++;
        break;
      case "ArrowUp":
        next--;
        break;
      case "ArrowRight":
        column++;
        break;
      case "ArrowLeft":
        column--;
        break;
      case "Home":
        column = 0;
        if (event.ctrlKey || event.metaKey) next = 0;
        break;
      case "End":
        column = columns.length - 1;
        if (event.ctrlKey || event.metaKey) next = count - 1;
        break;
      case "PageDown":
        next += Math.max(1, Math.floor(bodyVisibleHeight / safeRowHeight));
        break;
      case "PageUp":
        next -= Math.max(1, Math.floor(bodyVisibleHeight / safeRowHeight));
        break;
      default:
        return;
    }
    event.preventDefault();
    focusAt(next, column);
  }
  return (
    <section className={`og-root og-live-viewport ${className}`}>
      <div className="og-statusbar">
        <span role="status" aria-live="polite">
          {snapshot.rowCount === null
            ? "Remote row count pending"
            : `${snapshot.rowCount.toLocaleString()} live rows`}
          {snapshot.loading ? " - loading window" : ""}
        </span>
        <span>Read-only live provider</span>
      </div>
      {(snapshot.error || viewError) && (
        <div role="alert" className="og-error">
          {snapshot.error || viewError}{" "}
          <button
            type="button"
            onClick={() => {
              try {
                model.retry();
                setViewError(null);
              } catch (error) {
                setViewError(errorText(error));
              }
            }}
          >
            Retry live rows
          </button>
        </div>
      )}
      <div
        ref={viewport}
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={snapshot.rowCount === null ? -1 : count + 1}
        aria-colcount={columns.length}
        aria-readonly="true"
        className="og-viewport"
        style={{ height: safeHeight }}
        onScroll={(event) =>
          setScroll({
            top: event.currentTarget.scrollTop,
            left: event.currentTarget.scrollLeft,
          })
        }
      >
        <div
          role="rowgroup"
          className="og-header"
          style={{ width: Math.max(1, totalWidth), minWidth: "100%" }}
        >
          <div role="row" aria-rowindex={1} className="og-header-row">
            {entries.map((entry) =>
              entry.kind === "spacer" ? (
                gap(entry)
              ) : (
                <div
                  role="columnheader"
                  aria-colindex={entry.index + 1}
                  key={columns[entry.index].id}
                  className={`og-header-cell ${columns[entry.index].pinned ? "og-pinned" : ""}`}
                  style={{
                    ...styleFor(columns[entry.index], entry.index),
                    padding: "0 12px",
                  }}
                >
                  {columns[entry.index].header ?? columns[entry.index].id}
                </div>
              ),
            )}
          </div>
        </div>
        <div
          role="rowgroup"
          className="og-body"
          style={{
            height: physicalHeight,
            width: Math.max(1, totalWidth),
            minWidth: "100%",
          }}
        >
          {Array.from(
            { length: Math.max(0, end - first) },
            (_, offset) => first + offset,
          ).map((index) => {
            const row = rowMap.get(index);
            return (
              <div
                key={index}
                role="row"
                aria-rowindex={index + 2}
                aria-busy={!row || undefined}
                className={`og-row ${index % 2 ? "og-row-alt" : ""}`}
                style={{
                  top: physicalTop + index * safeRowHeight - logicalTop,
                  height: safeRowHeight,
                  width: "100%",
                }}
              >
                {entries.map((entry) => {
                  if (entry.kind === "spacer") return gap(entry);
                  const column = columns[entry.index];
                  const value = row
                    ? column.valueGetter
                      ? column.valueGetter(row.data)
                      : column.field
                        ? row.data[column.field]
                        : (row.data as Record<string, unknown>)[column.id]
                    : undefined;
                  const display = row
                    ? column.valueFormatter
                      ? column.valueFormatter(value, row.data)
                      : stringValue(value)
                    : entry.index === 0
                      ? "Loading..."
                      : "";
                  return (
                    <div
                      key={column.id}
                      role="gridcell"
                      aria-colindex={entry.index + 1}
                      aria-readonly="true"
                      data-viewport-row={index}
                      data-column-id={column.id}
                      className={`og-cell ${column.pinned ? "og-pinned" : ""}`}
                      style={styleFor(column, entry.index)}
                      tabIndex={
                        focus.index === index && focus.columnId === column.id
                          ? 0
                          : -1
                      }
                      ref={(element) => {
                        const key = cellKey(index, column.id);
                        if (element) cells.current.set(key, element);
                        else cells.current.delete(key);
                      }}
                      onFocus={(event) => {
                        if (event.target === event.currentTarget)
                          setFocus({ index, columnId: column.id });
                      }}
                      onClick={() => focusAt(index, entry.index)}
                      onKeyDown={(event) => onKey(event, index, entry.index)}
                    >
                      <span className="og-cell-content">
                        {row && renderCell
                          ? renderCell({ value, row: row.data, column })
                          : display}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {snapshot.rowCount === 0 && (
          <div role="status" className="og-empty">
            No live rows
          </div>
        )}
      </div>
    </section>
  );
}
