import { withColumnDragOwner } from "./group-panel.js";
import { formatServerAggregate } from "./server-aggregate-formatting.js";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  createGrid,
  projectServerTree,
  serverRouteKey,
  SERVER_TREE_LIMITS,
  type Column,
  type Filter,
  type GridModel,
  type GridState,
  type RowNode,
  type ServerSideRowModel,
  type ServerTreeEntry,
} from "@opengrid/core";
import { DataGrid, type CellContext } from "./data-grid.js";
import { useGridLocale } from "./locale.js";
import type { GridDirection } from "./direction.js";
type RecordEntry<T> = { id: string; entry: ServerTreeEntry<T> };
function serverTreeRowHeight<T>(node: RowNode<RecordEntry<T>>): number {
  return node.data?.entry.kind === "node" ? 38 : 68;
}
interface ExpansionState<T> {
  model: ServerSideRowModel<T>;
  revision: number;
  expanded: Set<string>;
  pages: Map<string, number>;
}
export interface ServerTreeDataGridProps<T> {
  model: ServerSideRowModel<T>;
  columns: Column<T>[];
  height?: number;
  direction?: GridDirection;
  ariaLabel?: string;
  className?: string;
  renderCell?: (context: CellContext<T>) => ReactNode;
}
/** Bounded, read-only simultaneous branch view. The provider owns all sorting/filtering/aggregation. */
export function ServerTreeDataGrid<T>({
  model,
  columns,
  height = 400,
  direction = "ltr",
  ariaLabel,
  className = "",
  renderCell,
}: ServerTreeDataGridProps<T>) {
  const { t, locale: language } = useGridLocale();
  if (model.blockSize > 10000)
    throw new RangeError("Server tree blocks are limited to 10000 rows");
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const owner = useMemo(() => ({}), [model]);
  const [stored, setStored] = useState<ExpansionState<T>>(() => ({
    model,
    revision: snapshot.queryRevision,
    expanded: new Set(),
    pages: new Map(),
  }));
  const current =
    stored.model === model && stored.revision === snapshot.queryRevision
      ? stored
      : {
          model,
          revision: snapshot.queryRevision,
          expanded: new Set<string>(),
          pages: new Map<string, number>(),
        };
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setNotice(null), [model, snapshot.queryRevision]);
  const [failures, setFailures] = useState<{
    model: ServerSideRowModel<T>;
    revision: number;
    values: Map<string, string>;
  }>(() => ({ model, revision: snapshot.queryRevision, values: new Map() }));
  const currentFailures =
    failures.model === model && failures.revision === snapshot.queryRevision
      ? failures.values
      : new Map<string, string>();
  const plan = projectServerTree(
    snapshot,
    model.blockSize,
    current.expanded,
    current.pages,
    currentFailures,
  );
  const addressKey = JSON.stringify(plan.addresses);
  const attempted = useRef(
    new Map<string, { model: ServerSideRowModel<T>; revision: number }>(),
  );
  const [retryRevision, setRetryRevision] = useState(0);
  const desired = useRef({
    model,
    revision: snapshot.queryRevision,
    keys: new Set(
      plan.addresses.map((address) =>
        JSON.stringify([address.groupKeys, address.blockIndex]),
      ),
    ),
  });
  desired.current = {
    model,
    revision: snapshot.queryRevision,
    keys: new Set(
      plan.addresses.map((address) =>
        JSON.stringify([address.groupKeys, address.blockIndex]),
      ),
    ),
  };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useLayoutEffect(() => () => model.releaseActiveBlocks(owner), [model, owner]);
  useEffect(() => {
    try {
      model.setActiveBlocks(owner, plan.addresses);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      return;
    }
    for (const address of plan.addresses) {
      const key = JSON.stringify([address.groupKeys, address.blockIndex]);
      const block = snapshot.blocks.some(
        (item) => JSON.stringify([item.groupKeys, item.blockIndex]) === key,
      );
      const error =
        snapshot.errors.some(
          (item) => JSON.stringify([item.groupKeys, item.blockIndex]) === key,
        ) || currentFailures.has(key);
      const loading = snapshot.loading.some(
        (item) => JSON.stringify([item.groupKeys, item.blockIndex]) === key,
      );
      const previous = attempted.current.get(key);
      if (
        block ||
        error ||
        loading ||
        (previous?.model === model &&
          previous.revision === snapshot.queryRevision)
      )
        continue;
      const token = { model, revision: snapshot.queryRevision };
      attempted.current.set(key, token);
      void model
        .loadBlock(address.groupKeys, address.blockIndex)
        .catch((error) => {
          if (
            !mounted.current ||
            desired.current.model !== model ||
            desired.current.revision !== token.revision ||
            !desired.current.keys.has(key) ||
            (error instanceof DOMException && error.name === "AbortError")
          )
            return;
          setFailures((previous) => ({
            model,
            revision: token.revision,
            values: new Map(
              previous.model === model && previous.revision === token.revision
                ? previous.values
                : [],
            ).set(key, error instanceof Error ? error.message : String(error)),
          }));
        })
        .finally(() => {
          if (attempted.current.get(key) === token)
            attempted.current.delete(key);
        });
    }
  }, [model, owner, snapshot, addressKey, retryRevision, currentFailures]);
  function update(expanded: Set<string>, pages: Map<string, number>) {
    try {
      const candidate = projectServerTree(
        model.getSnapshot(),
        model.blockSize,
        expanded,
        pages,
      );
      if (
        candidate.addresses.length * model.blockSize >
        SERVER_TREE_LIMITS.maxRows - 256
      )
        throw new RangeError("Expanded server tree row capacity is full");
      model.setActiveBlocks(owner, candidate.addresses);
      const keys = new Set(
        candidate.addresses.map((address) =>
          JSON.stringify([address.groupKeys, address.blockIndex]),
        ),
      );
      setFailures((previous) => ({
        model,
        revision: snapshot.queryRevision,
        values: new Map(
          [
            ...(previous.model === model &&
            previous.revision === snapshot.queryRevision
              ? previous.values
              : []),
          ].filter(([key]) => keys.has(key)),
        ),
      }));
      setNotice(null);
      setStored({ model, revision: snapshot.queryRevision, expanded, pages });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  function toggle(id: string) {
    const entry = plan.entries.find((item) => item.id === id);
    if (
      entry?.kind !== "node" ||
      entry.node.kind !== "group" ||
      entry.node.childCount === 0
    )
      return;
    if (entry.depth >= SERVER_TREE_LIMITS.maxDepth) {
      setNotice(t("grouping.remoteDepth"));
      return;
    }
    const route = [...entry.groupKeys, entry.node.key],
      key = serverRouteKey(route);
    const expanded = new Set(
      [...current.expanded].filter((item) => plan.routes.includes(item)),
    );
    const pages = new Map(
      [...current.pages].filter(([item]) => plan.routes.includes(item)),
    );
    if (expanded.has(key)) {
      for (const item of expanded) {
        const candidate = JSON.parse(item) as string[];
        if (route.every((value, index) => candidate[index] === value))
          expanded.delete(item);
      }
      for (const item of pages.keys()) {
        const candidate = JSON.parse(item) as string[];
        if (route.every((value, index) => candidate[index] === value))
          pages.delete(item);
      }
    } else expanded.add(key);
    update(expanded, pages);
  }
  function more(entry: ServerTreeEntry<T>) {
    const pages = new Map(current.pages);
    pages.set(serverRouteKey(entry.groupKeys), entry.blockIndex + 1);
    update(new Set(current.expanded), pages);
  }
  function retry(entry: ServerTreeEntry<T>) {
    const key = JSON.stringify([entry.groupKeys, entry.blockIndex]);
    attempted.current.delete(key);
    setFailures((previous) => {
      const values = new Map(
        previous.model === model && previous.revision === snapshot.queryRevision
          ? previous.values
          : [],
      );
      values.delete(key);
      return { model, revision: snapshot.queryRevision, values };
    });
    setNotice(null);
    const revision = snapshot.queryRevision;
    void model
      .refreshBlock(entry.groupKeys, entry.blockIndex)
      .catch((error) => {
        if (
          !mounted.current ||
          desired.current.model !== model ||
          desired.current.revision !== revision ||
          !desired.current.keys.has(key) ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          return;
        setFailures((previous) => ({
          model,
          revision,
          values: new Map(
            previous.model === model && previous.revision === revision
              ? previous.values
              : [],
          ).set(key, error instanceof Error ? error.message : String(error)),
        }));
      });
    setRetryRevision((value) => value + 1);
  }
  const originals = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  const mappedColumns = useMemo(
    () =>
      columns.map<Column<RecordEntry<T>>>((column) => ({
        ...column,
        field: undefined,
        editable: false,
        valueSetter: undefined,
        filterValueGetter: undefined,
        filterValueFormatter: undefined,
        compare: column.compare
          ? (a, b) => column.compare!(a, b, {})
          : undefined,
        groupable: false,
        colSpan: undefined,
        spanRows: undefined,
        autoHeight: undefined,
        valueGetter: (record) => {
          const entry = record.entry;
          if (entry.kind !== "node") return undefined;
          const node = entry.node;
          if (node.kind === "group")
            return node.aggregates && Object.hasOwn(node.aggregates, column.id)
              ? node.aggregates[column.id]
              : undefined;
          return column.valueGetter
            ? column.valueGetter(node.data)
            : column.field
              ? node.data[column.field]
              : (node.data as Record<string, unknown>)[column.id];
        },
        valueFormatter: (value, record) =>
          record.entry.kind === "node" &&
          record.entry.node.kind === "row" &&
          column.valueFormatter
            ? column.valueFormatter(value, record.entry.node.data)
            : value == null
              ? ""
              : String(value),
        valueParser: undefined,
        validate: undefined,
      })),
    [columns],
  );
  const local = useMemo(
    () =>
      createGrid<RecordEntry<T>>({
        rows: [],
        getRowId: (record) => record.id,
        columns: mappedColumns,
      }),
    [model],
  );
  const columnSource = useRef<{
    local: GridModel<RecordEntry<T>>;
    columns: Column<T>[];
  } | null>(null);
  useLayoutEffect(() => {
    const previous = columnSource.current;
    const visibility = { ...local.getState().columnVisibility };
    const old = new Map(
      previous?.local === local
        ? previous.columns.map((column) => [column.id, column])
        : [],
    );
    let changed = false;
    for (const column of columns) {
      if (
        old.has(column.id) &&
        !!old.get(column.id)!.hidden !== !!column.hidden
      ) {
        delete visibility[column.id];
        changed = true;
      }
    }
    local.setColumns(mappedColumns);
    if (changed) local.setState({ columnVisibility: visibility });
    columnSource.current = { local, columns };
  }, [local, columns, mappedColumns]);

  useLayoutEffect(() => {
    local.setRows(plan.entries.map((entry) => ({ id: entry.id, entry })));
    local.setState({
      expanded: plan.entries
        .filter((entry) => entry.kind === "node" && entry.expanded)
        .map((entry) => entry.id),
      sorting: model.getQuery().sorting,
      filters: model.getQuery().filters,
      quickFilter: "",
    });
  }, [local, snapshot, current.expanded, current.pages, failures]);
  const actions = useRef({ toggle });
  actions.current = { toggle };
  const facade = useMemo<GridModel<RecordEntry<T>>>(() => {
    const nodes = (): RowNode<RecordEntry<T>>[] =>
      local.getRows().map((data) => {
        const entry = data.entry;
        const node = entry.kind === "node" ? entry.node : undefined;
        return {
          id: entry.id,
          kind: node?.kind === "group" ? "group" : "row",
          data,
          depth: entry.depth,
          label: node?.kind === "group" ? (node.label ?? node.key) : undefined,
          leafCount: node?.kind === "group" ? node.childCount : undefined,
          children:
            node?.kind === "group" && node.childCount !== 0
              ? [
                  {
                    id: entry.id + ":children",
                    kind: "group",
                    depth: entry.depth + 1,
                  },
                ]
              : undefined,
        };
      });
    const query = (patch: Partial<GridState>) => {
      model.setQuery({
        ...(patch.sorting === undefined ? {} : { sorting: patch.sorting }),
        ...(patch.filters === undefined ? {} : { filters: patch.filters }),
      });
    };
    return withColumnDragOwner<GridModel<RecordEntry<T>>>(
      {
        ...local,
        getFilteredRows: local.getRows,
        getRowModel: nodes,
        getPageRows: nodes,
        getPageCount: () => 1,
        toggleExpanded: (id) => actions.current.toggle(id),
        setState: query,
        setSort: (columnId, direction, multi = false) =>
          query({
            sorting: [
              ...(multi
                ? model
                    .getQuery()
                    .sorting.filter((sort) => sort.columnId !== columnId)
                : []),
              ...(direction ? [{ columnId, direction }] : []),
            ],
          }),
        setFilter: (columnId, filter?: Filter) => {
          const filters = model.getQuery().filters;
          if (filter)
            Object.defineProperty(filters, columnId, {
              value: filter,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          else delete filters[columnId];
          query({ filters });
        },
        editCell: () => "Server data is read only",
        batchEdit: () => "Server data is read only",
        undo: () => false,
        redo: () => false,
        moveRows: () => "Server order is provider-authoritative",
        getRowReorderStatus: () =>
          Object.freeze({
            allowed: false,
            reason: "read-only",
            message: "Server order is provider-authoritative",
          }),
        applyTransaction: () => {
          throw new Error("Use loaded-node provider transactions");
        },
      },
      model,
    );
  }, [local, model]);
  return (
    <section
      className={`og-root og-server-tree ${className}`}
      dir={direction}
      lang={language}
      aria-label={t("grouping.remoteControls")}
    >
      <div className="og-toolbar">
        <span>{t("grouping.remoteHint")}</span>
        <button type="button" onClick={() => update(new Set(), new Map())}>
          {t("grouping.collapseAll")}
        </button>
      </div>
      {notice && (
        <div role="alert" className="og-error">
          {notice}
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setRetryRevision((value) => value + 1);
            }}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      <DataGrid
        model={facade}
        height={height}
        getRowHeight={serverTreeRowHeight}
        direction={direction}
        ariaLabel={ariaLabel ?? t("grouping.remoteLabel")}
        toolbar={false}
        pagination={false}
        selectionMode="none"
        cellSelection={false}
        notes={false}
        contextMenu={false}
        columnMenu={false}
        getColumnFilter={(id) => {
          const filters = model.getQuery().filters;
          return Object.hasOwn(filters, id) ? filters[id] : undefined;
        }}
        isFullWidthRow={(node) => node.data?.entry.kind !== "node"}
        renderFullWidthRow={({ node }) => {
          const entry = node.data!.entry;
          return (
            <div
              className="og-server-tree-status"
              style={{ paddingInlineStart: 12 + entry.depth * 16 }}
            >
              {entry.kind === "more" ? (
                <button onClick={() => more(entry)}>
                  {t("grouping.loadMore")}
                </button>
              ) : entry.kind === "error" ? (
                <>
                  <span role="alert" title={entry.message}>
                    {entry.message}
                  </span>
                  <button onClick={() => retry(entry)}>
                    {t("common.retry")}
                  </button>
                </>
              ) : (
                <span role="status">
                  {t(
                    entry.kind === "empty"
                      ? "grouping.emptyBranch"
                      : "remote.loading",
                  )}
                </span>
              )}
            </div>
          );
        }}
        renderCell={({ value, row, column }) => {
          const entry = row.entry;
          if (entry.kind !== "node") return value == null ? "" : String(value);
          const original = originals.get(column.id);
          if (!original) return value == null ? "" : String(value);
          if (entry.node.kind === "group")
            return formatServerAggregate(
              original,
              value,
              entry.node,
              model.getQuery(),
              entry.id,
              entry.depth,
            );
          return renderCell
            ? renderCell({
                value,
                row: entry.node.data,
                column: {
                  ...original,
                  width: column.width,
                  pinned: column.pinned,
                },
              })
            : original.valueFormatter
              ? original.valueFormatter(value, entry.node.data)
              : value == null
                ? ""
                : String(value);
        }}
      />
    </section>
  );
}
