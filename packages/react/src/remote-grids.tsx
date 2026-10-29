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
import { useGridLocale } from "./locale.js";
import {
  normalizeScrollLeft,
  denormalizeScrollLeft,
  assertGridDirection,
  createDirectionLayout,
  type GridDirection,
} from "./direction.js";

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
  direction?: GridDirection;
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
  direction = "ltr",
  ariaLabel: requestedAriaLabel,
  className = "",
  renderCell,
}: ServerDataGridProps<T>) {
  assertGridDirection(direction);
  const { t, locale: language, number } = useGridLocale();
  const ariaLabel = requestedAriaLabel ?? t("remote.serverLabel");
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
          // Span geometry currently belongs to the client DataGrid contract.
          colSpan: undefined,
          spanRows: undefined,
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
  const viewColumns = local.getColumns().filter((column) => !column.hidden);
  const firstVisible = (
    direction === "rtl"
      ? [
          ...viewColumns.filter((column) => column.pinned === "right"),
          ...viewColumns.filter((column) => !column.pinned),
          ...viewColumns.filter((column) => column.pinned === "left"),
        ]
      : viewColumns
  )[0]?.id;
  const failure = remoteError?.message ?? requestError;
  return (
    <section
      className={`og-root og-remote-server ${className}`}
      dir={direction}
      lang={language}
      aria-label={t("remote.controls", { label: ariaLabel })}
    >
      <div className="og-toolbar" style={{ flexWrap: "wrap" }}>
        <nav
          aria-label={t("remote.path", { label: ariaLabel })}
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
            {t("remote.allGroups")}
          </button>
          {route.map((key, part) => (
            <button
              type="button"
              key={JSON.stringify(route.slice(0, part + 1))}
              aria-current={part === route.length - 1 ? "location" : undefined}
              onClick={() => visit(route.slice(0, part + 1))}
            >
              {key || t("remote.blankGroup")}
            </button>
          ))}
        </nav>
        <details className="og-chooser">
          <summary>{t("remote.columns")}</summary>
          <div className="og-chooser-panel">
            {local.getColumns().map((column) => (
              <div className="og-column-option" key={column.id}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={t("remote.showColumn", {
                      column: column.header ?? column.id,
                    })}
                    checked={!column.hidden}
                    onChange={(event) =>
                      local.hideColumn(column.id, !event.target.checked)
                    }
                  />
                  {column.header ?? column.id}
                </label>
                <select
                  aria-label={t("remote.pinColumn", {
                    column: column.header ?? column.id,
                  })}
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
                  <option value="">{t("grid.unpinned")}</option>
                  <option value="left">{t("grid.pinLeft")}</option>
                  <option value="right">{t("grid.pinRight")}</option>
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
        {loading || (!response && !failure) ? t("remote.loading") : ""}
        {rowCount === undefined
          ? t("remote.routePending")
          : t("remote.routeCount", { count: rowCount })}
        {response?.pivotColumns?.length
          ? t("remote.pivotCount", { count: response.pivotColumns.length })
          : ""}
      </div>
      {failure && (
        <div role="alert" className="og-error">
          {failure}{" "}
          <button type="button" onClick={retry}>
            {t("remote.retryServer")}
          </button>
        </div>
      )}
      <DataGrid
        direction={direction}
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
                aria-label={t("remote.openGroup", {
                  group: node.label ?? node.key,
                })}
                onClick={() => visit([...route, node.key])}
              >
                {node.label ?? node.key}
                {node.childCount === undefined
                  ? ""
                  : ` (${number(node.childCount)})`}
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
        <span>
          {t("remote.selected", { count: viewState.selected.length })}
        </span>
        <div className="og-pagination">
          <button
            type="button"
            aria-label={t("remote.previousPage")}
            disabled={index === 0 || loading}
            onClick={() => setIndex(index - 1)}
          >
            {t("common.previous")}
          </button>
          <span>
            {t("remote.serverPage", {
              page: index + 1,
              pages: pageCount === null ? "..." : number(pageCount),
            })}
          </span>
          <button
            type="button"
            aria-label={t("remote.nextPage")}
            disabled={pageCount === null || index >= pageCount - 1 || loading}
            onClick={() => setIndex(index + 1)}
          >
            {t("common.next")}
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
  direction?: GridDirection;
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
  direction = "ltr",
  ariaLabel: requestedAriaLabel,
  className = "",
  renderCell,
}: LiveViewportDataGridProps<T>) {
  assertGridDirection(direction);
  const { t, locale: language } = useGridLocale();
  const ariaLabel = requestedAriaLabel ?? t("remote.liveLabel");
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
  const pinStart = direction === "rtl" ? "right" : "left",
    pinEnd = direction === "rtl" ? "left" : "right";
  const columns = [
    ...definitions.filter(
      (column) => !column.hidden && column.pinned === pinStart,
    ),
    ...definitions.filter((column) => !column.hidden && !column.pinned),
    ...definitions.filter(
      (column) => !column.hidden && column.pinned === pinEnd,
    ),
  ];
  const widthOf = (column: Column<T>) =>
    Number.isFinite(column.width) ? Math.max(40, column.width!) : 160;
  const totalWidth = columns.reduce((sum, column) => sum + widthOf(column), 0);
  const viewport = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef(false);
  const ownsCellFocus = useRef(false);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewportWidth, setViewportWidth] = useState(800);
  const previousDirection = useRef(direction);
  function scrollMaximum(container: HTMLElement) {
    const width = container.clientWidth || viewportWidth;
    return Math.max(
      0,
      (container.scrollWidth || Math.max(width, totalWidth)) - width,
    );
  }
  function readInlineScroll(container: HTMLElement) {
    return normalizeScrollLeft(
      container.scrollLeft,
      scrollMaximum(container),
      direction,
    );
  }
  function writeInlineScroll(container: HTMLElement, inline: number) {
    container.scrollLeft = denormalizeScrollLeft(
      inline,
      scrollMaximum(container),
      direction,
    );
    return readInlineScroll(container);
  }
  function revealColumn(
    container: HTMLElement,
    columnIndex: number,
    inline: number,
  ) {
    const target = columns[columnIndex];
    if (!target || target.pinned) return inline;
    return createDirectionLayout({
      direction,
      viewportWidth: container.clientWidth || viewportWidth,
      contentWidth: totalWidth,
      scrollOffset: inline,
      leftPinnedWidth: columns
        .filter((column) => column.pinned === "left")
        .reduce((sum, column) => sum + widthOf(column), 0),
      rightPinnedWidth: columns
        .filter((column) => column.pinned === "right")
        .reduce((sum, column) => sum + widthOf(column), 0),
    }).scrollToReveal(
      columns
        .slice(0, columnIndex)
        .reduce((sum, column) => sum + widthOf(column), 0),
      widthOf(target),
    );
  }
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
      direction,
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
  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const flipped = previousDirection.current !== direction;
    previousDirection.current = direction;
    if (
      flipped &&
      ownsCellFocus.current &&
      (document.activeElement === document.body ||
        container.contains(document.activeElement))
    )
      pendingFocus.current = true;
    let inline = Math.min(scrollMaximum(container), Math.max(0, scroll.left));
    if (flipped)
      inline = revealColumn(
        container,
        columns.findIndex((column) => column.id === focus.columnId),
        inline,
      );
    inline = writeInlineScroll(container, inline);
    if (inline !== scroll.left)
      setScroll((current) => ({ ...current, left: inline }));
  }, [direction, totalWidth, viewportWidth]);
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
        left: (direction === "rtl"
          ? columns.slice(columnIndex + 1)
          : columns.slice(0, columnIndex)
        )
          .filter((item) => item.pinned === "left")
          .reduce((sum, item) => sum + widthOf(item), 0),
        zIndex: 2,
      });
    if (column.pinned === "right")
      Object.assign(style, {
        position: "sticky",
        right: (direction === "rtl"
          ? columns.slice(0, columnIndex)
          : columns.slice(columnIndex + 1)
        )
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
      const inline = writeInlineScroll(
        container,
        revealColumn(container, columnIndex, readInlineScroll(container)),
      );
      setScroll({
        top: container.scrollTop,
        left: inline,
      });
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
        column += direction === "rtl" ? -1 : 1;
        break;
      case "ArrowLeft":
        column += direction === "rtl" ? 1 : -1;
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
    <section
      className={`og-root og-live-viewport ${className}`}
      dir={direction}
      data-direction={direction}
      lang={language}
    >
      <div className="og-statusbar">
        <span role="status" aria-live="polite">
          {snapshot.rowCount === null
            ? t("remote.countPending")
            : t("remote.liveCount", { count: snapshot.rowCount })}
          {snapshot.loading ? t("remote.loadingWindow") : ""}
        </span>
        <span>{t("remote.readOnly")}</span>
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
            {t("remote.retryLive")}
          </button>
        </div>
      )}
      <div
        ref={viewport}
        role="grid"
        dir={direction}
        aria-label={ariaLabel}
        aria-rowcount={snapshot.rowCount === null ? -1 : count + 1}
        aria-colcount={columns.length}
        aria-readonly="true"
        className="og-viewport"
        onBlurCapture={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            ownsCellFocus.current = false;
        }}
        style={{ height: safeHeight }}
        onScroll={(event) =>
          setScroll({
            top: event.currentTarget.scrollTop,
            left: readInlineScroll(event.currentTarget),
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
                      ? t("remote.livePlaceholder")
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
                        ownsCellFocus.current =
                          event.target === event.currentTarget;
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
            {t("remote.emptyLive")}
          </div>
        )}
      </div>
    </section>
  );
}
