import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  Column,
  Filter,
  ServerSideRowModel,
  ServerSideSnapshot,
} from "@opengrid/core";
import {
  DEFAULT_SIDE_PANEL_LABELS,
  type GridSidePanelLabels,
} from "./side-panel.js";
import {
  COLUMN_DRAG_OWNER,
  columnDragOwner,
  RowGroupPanel,
  withColumnDragOwner,
  type RowGroupPanelModel,
} from "./group-panel.js";
import { GridIcon } from "./icons.js";
import { ColumnConditionFilter } from "./column-condition-filter.js";

export interface ServerSidePanelProps<T> {
  model: ServerSideRowModel<T>;
  /** Application-owned field definitions. Visibility updates never replace provider records. */
  columns: readonly Column<T>[];
  onColumnsChange: (columns: Column<T>[]) => void;
  className?: string;
  labels?: Partial<GridSidePanelLabels> & {
    providerHint?: string;
    unknownGroups?: string;
  };
}
const operations = ["sum", "avg", "min", "max", "count"] as const;

/** Real provider query controls. No resident proxy rows or provider-wide value-choice claim. */
export function ServerSidePanel<T>({
  model,
  columns,
  onColumnsChange,
  className = "",
  labels,
}: ServerSidePanelProps<T>) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const query = useMemo(() => model.getQuery(), [model, snapshot]);
  const text = {
    ...DEFAULT_SIDE_PANEL_LABELS,
    providerHint: "Grouping, values and conditions run in the data provider.",
    unknownGroups: "Some grouped fields are outside this column list.",
    ...labels,
  };
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [notice, setNotice] = useState("");
  const groupModel = useMemo<RowGroupPanelModel<T>>(() => {
    let previous: ServerSideSnapshot<T> | undefined;
    let state: ReturnType<RowGroupPanelModel<T>["getState"]>;
    const adapter: RowGroupPanelModel<T> = {
      subscribe: model.subscribe,
      getColumns: () => [...columns],
      getState: () => {
        const current = model.getSnapshot();
        if (current !== previous) {
          const currentQuery = model.getQuery();
          state = Object.freeze({
            groupBy: Object.freeze(currentQuery.rowGroupColumns),
            sorting: Object.freeze(currentQuery.sorting),
          });
          previous = current;
        }
        return state!;
      },
      setState: (patch) => {
        model.setQuery({
          ...(patch.groupBy === undefined
            ? {}
            : { rowGroupColumns: patch.groupBy }),
          ...(patch.sorting === undefined ? {} : { sorting: patch.sorting }),
        });
      },
      setSort: (columnId, direction, multi = false) => {
        model.setQuery({
          sorting: [
            ...(multi
              ? model
                  .getQuery()
                  .sorting.filter((item) => item.columnId !== columnId)
              : []),
            ...(direction ? [{ columnId, direction }] : []),
          ],
        });
      },
    };
    return withColumnDragOwner(adapter, model);
  }, [model, columns]);
  const matches = columns.filter((column) =>
    [...(column.groupPath ?? []), column.header ?? column.id]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const groups = new Map<string, Column<T>[]>();
  for (const column of matches) {
    const group = column.groupPath?.join(" / ") ?? text.columns;
    groups.set(group, [...(groups.get(group) ?? []), column]);
  }
  const visible = (column: Column<T>) => !column.hidden;
  function change(action: () => void) {
    try {
      action();
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not update server view",
      );
    }
  }
  function visibility(ids: readonly string[], show: boolean) {
    const selected = new Set(ids);
    change(() =>
      onColumnsChange(
        columns.map((column) =>
          selected.has(column.id) ? { ...column, hidden: !show } : column,
        ),
      ),
    );
  }
  function aggregate(columnId: string, operation: string) {
    if (
      operation !== "" &&
      !operations.includes(operation as (typeof operations)[number])
    )
      return;
    change(() =>
      model.setQuery({
        valueColumns: [
          ...model
            .getQuery()
            .valueColumns.filter((value) => value.columnId !== columnId),
          ...(operation ? [{ columnId, aggregate: operation }] : []),
        ],
      }),
    );
  }
  function filter(columnId: string, next?: Filter) {
    // Let the staged dialog retain a retryable draft when the provider rejects publication.
    const filters = model.getQuery().filters;
    if (next)
      Object.defineProperty(filters, columnId, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    else delete filters[columnId];
    model.setQuery({ filters });
    setNotice("");
  }

  const owner = columnDragOwner(model);
  return (
    <section
      className={`og-side-panel og-server-side-panel ${className}`}
      aria-label={`Server ${text.columns} / ${text.filters}`}
    >
      <div
        className="og-side-tabs"
        role="tablist"
        aria-label={`Server ${text.columns} / ${text.filters}`}
        aria-orientation="vertical"
      >
        {[text.columns, text.filters].map((label, index) => (
          <button
            key={index}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={tab === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={tab === index ? 0 : -1}
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              let next: number | undefined;
              if (event.key === "ArrowDown" || event.key === "ArrowUp")
                next = 1 - index;
              if (event.key === "Home") next = 0;
              if (event.key === "End") next = 1;
              if (next !== undefined) {
                event.preventDefault();
                setTab(next);
                tabs.current[next]?.focus();
              }
            }}
          >
            <GridIcon name={index === 0 ? "columns" : "filter"} size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div
        hidden
        id={`${id}-panel-${1 - tab}`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${1 - tab}`}
      />
      <div
        className="og-side-body"
        role="tabpanel"
        id={`${id}-panel-${tab}`}
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
      >
        <div className="og-side-heading">
          <GridIcon name={tab === 0 ? "columns" : "filter"} size={16} />
          <strong>{tab === 0 ? text.columns : text.filters}</strong>
        </div>
        <p className="og-server-side-hint">{text.providerHint}</p>
        {notice && (
          <p className="og-error" role="alert">
            {notice}
          </p>
        )}
        <label className="og-side-search">
          <GridIcon name="search" size={16} />
          <input
            type="search"
            aria-label={text.search}
            placeholder={text.search}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCollapsed(new Set());
            }}
          />
        </label>
        {!matches.length && <p className="og-side-empty">{text.noColumns}</p>}
        {tab === 0 ? (
          <>
            <div className="og-side-tree">
              {[...groups].map(([group, items], index) => (
                <div className="og-side-category" key={group}>
                  <div className="og-side-category-heading">
                    <button
                      type="button"
                      aria-label={(collapsed.has(group)
                        ? text.expandGroup
                        : text.collapseGroup
                      ).replace("{group}", group)}
                      aria-expanded={!collapsed.has(group)}
                      aria-controls={`${id}-category-${index}`}
                      onClick={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(group)) next.delete(group);
                          else next.add(group);
                          return next;
                        })
                      }
                    >
                      <GridIcon
                        name={
                          collapsed.has(group) ? "chevronRight" : "chevronDown"
                        }
                        size={15}
                      />
                    </button>
                    <label className="og-side-group-check">
                      <input
                        type="checkbox"
                        aria-label={`${text.columns}: ${group}`}
                        checked={items.every(visible)}
                        ref={(node) => {
                          if (node)
                            node.indeterminate =
                              items.some(visible) && !items.every(visible);
                        }}
                        onChange={(event) =>
                          visibility(
                            items.map((column) => column.id),
                            event.target.checked,
                          )
                        }
                      />
                      {group}
                    </label>
                  </div>
                  <div
                    id={`${id}-category-${index}`}
                    hidden={collapsed.has(group)}
                  >
                    {items.map((column) => (
                      <div className="og-side-column-row" key={column.id}>
                        {column.groupable !== false ? (
                          <button
                            type="button"
                            className="og-side-column-drag"
                            data-group-drag-column={column.id}
                            draggable
                            aria-label={text.groupColumn.replace(
                              "{column}",
                              column.header ?? column.id,
                            )}
                            aria-pressed={query.rowGroupColumns.includes(
                              column.id,
                            )}
                            title={text.dragHint}
                            onDragStart={(event) => {
                              event.stopPropagation();
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "text/opengrid-column",
                                column.id,
                              );
                              event.dataTransfer.setData(
                                COLUMN_DRAG_OWNER,
                                owner,
                              );
                            }}
                            onClick={() =>
                              change(() =>
                                model.setQuery({
                                  rowGroupColumns:
                                    query.rowGroupColumns.includes(column.id)
                                      ? query.rowGroupColumns.filter(
                                          (key) => key !== column.id,
                                        )
                                      : [...query.rowGroupColumns, column.id],
                                }),
                              )
                            }
                          >
                            <GridIcon name="grip" size={16} />
                          </button>
                        ) : (
                          <span
                            className="og-side-drag-spacer"
                            aria-hidden="true"
                          />
                        )}
                        <label className="og-side-column">
                          <input
                            type="checkbox"
                            checked={visible(column)}
                            onChange={(event) =>
                              visibility([column.id], event.target.checked)
                            }
                          />
                          {column.header ?? column.id}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {query.rowGroupColumns.some(
              (key) => !columns.some((column) => column.id === key),
            ) && <p className="og-side-empty">{text.unknownGroups}</p>}
            <RowGroupPanel
              key={owner}
              model={groupModel}
              ariaLabel={`Server ${text.rowGroups}`}
            />
            <section className="og-side-values" aria-label={text.values}>
              <h2>{text.values}</h2>
              {columns
                .filter(
                  (column) =>
                    column.type === "number" ||
                    column.type === "bigint" ||
                    query.valueColumns.some(
                      (value) => value.columnId === column.id,
                    ),
                )
                .map((column) => {
                  const current =
                    query.valueColumns.find(
                      (value) => value.columnId === column.id,
                    )?.aggregate ?? "";
                  const numeric =
                    column.type === "number" || column.type === "bigint";
                  const choices = numeric ? operations : (["count"] as const);
                  return (
                    <label key={column.id}>
                      <span>{column.header ?? column.id}</span>
                      <select
                        aria-label={`${text.values}: ${column.header ?? column.id}`}
                        value={current}
                        onChange={(event) =>
                          aggregate(column.id, event.target.value)
                        }
                      >
                        <option value="">{text.noAggregate}</option>
                        {choices.map((operation) => (
                          <option key={operation} value={operation}>
                            {operation}
                          </option>
                        ))}
                        {current &&
                          !choices.some(
                            (operation) => operation === current,
                          ) && (
                            <option value={current}>
                              {text.customAggregate}: {current}
                            </option>
                          )}
                      </select>
                    </label>
                  );
                })}
              {!columns.some(
                (column) =>
                  column.type === "number" ||
                  column.type === "bigint" ||
                  query.valueColumns.some(
                    (value) => value.columnId === column.id,
                  ),
              ) && <p>{text.noValues}</p>}
            </section>
          </>
        ) : (
          <div className="og-side-filters">
            {matches
              .filter((column) => column.filterable !== false)
              .map((column) => (
                <div
                  key={`${owner}:${column.id}`}
                  data-filter-active={Object.hasOwn(query.filters, column.id)}
                >
                  <span>{column.header ?? column.id}</span>
                  <ColumnConditionFilter
                    column={column}
                    trigger={<GridIcon name="filter" size={16} />}
                    label={`${text.filters}: ${column.header ?? column.id}`}
                    filter={
                      Object.hasOwn(query.filters, column.id)
                        ? query.filters[column.id]
                        : undefined
                    }
                    getFilter={() => {
                      const filters = model.getQuery().filters;
                      return Object.hasOwn(filters, column.id)
                        ? filters[column.id]
                        : undefined;
                    }}
                    onFilterChange={(next) => filter(column.id, next)}
                    onClear={() => filter(column.id)}
                  />
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
