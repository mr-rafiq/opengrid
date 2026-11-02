import { useId, useRef, useState, useSyncExternalStore } from "react";
import type { Aggregate, Column, GridModel } from "@opengrid/core";
import { GridIcon } from "./icons.js";
import {
  RowGroupPanel,
  COLUMN_DRAG_OWNER,
  columnDragOwner,
} from "./group-panel.js";
import { ColumnConditionFilter } from "./column-condition-filter.js";

export interface GridSidePanelLabels {
  columns: string;
  filters: string;
  search: string;
  values: string;
  rowGroups: string;
  noColumns: string;
  noValues: string;
  noAggregate: string;
  customAggregate: string;
  groupColumn: string;
  dragHint: string;
  collapseGroup: string;
  expandGroup: string;
}
const defaults: GridSidePanelLabels = {
  columns: "Columns",
  filters: "Filters",
  search: "Search columns",
  values: "Values",
  rowGroups: "Row groups",
  noColumns: "No matching columns",
  noValues: "Numeric columns can be aggregated here.",
  noAggregate: "None",
  customAggregate: "Custom",
  groupColumn: "Group by {column}",
  dragHint: "Drag into Row groups, or activate to toggle grouping.",
  collapseGroup: "Collapse {group} columns",
  expandGroup: "Expand {group} columns",
};
export interface GridSidePanelProps<T> {
  model: GridModel<T>;
  className?: string;
  /** Translate these labels and use GridLocaleProvider for the embedded group/filter controls. */
  labels?: Partial<GridSidePanelLabels>;
}
const aggregates: readonly Exclude<Aggregate, Function>[] = [
  "sum",
  "avg",
  "min",
  "max",
  "count",
];

/** Model-bound columns, filters, row groups and aggregation. Host in a modal drawer on small screens. */
export function GridSidePanel<T>({
  model,
  className = "",
  labels,
}: GridSidePanelProps<T>) {
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const text = { ...defaults, ...labels };
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const columns = model.getColumns();
  const visible = (column: Column<T>) => !column.hidden;
  const matches = columns.filter((column) =>
    [...(column.groupPath ?? []), column.header ?? column.id]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  // Group labels are Map keys, including __proto__, and never used as object properties.
  const groups = new Map<string, Column<T>[]>();
  for (const column of matches) {
    const group = column.groupPath?.join(" / ") ?? text.columns;
    groups.set(group, [...(groups.get(group) ?? []), column]);
  }
  function aggregate(columnId: string, value: string) {
    if (
      value !== "" &&
      !aggregates.includes(value as (typeof aggregates)[number])
    )
      return;
    model.setColumns(
      model
        .getColumnDefinitions()
        .map((column) =>
          column.id === columnId
            ? { ...column, aggregate: value ? (value as Aggregate) : undefined }
            : column,
        ),
    );
  }
  return (
    <section
      className={`og-side-panel ${className}`}
      aria-label={`${text.columns} / ${text.filters}`}
    >
      <div
        className="og-side-tabs"
        role="tablist"
        aria-label={`${text.columns} / ${text.filters}`}
        aria-orientation="vertical"
      >
        {[text.columns, text.filters].map((label, index) => (
          <button
            key={index}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
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
        id={`${id}-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
      >
        <div className="og-side-heading">
          <GridIcon name={tab === 0 ? "columns" : "filter"} size={16} />
          <strong>{tab === 0 ? text.columns : text.filters}</strong>
        </div>
        <label className="og-side-search">
          <GridIcon name="search" size={16} />
          <input
            type="search"
            aria-label={text.search}
            placeholder={text.search}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCollapsed(new Set());
            }}
          />
        </label>
        {matches.length === 0 && (
          <p className="og-side-empty">{text.noColumns}</p>
        )}
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
                        onChange={(event) => {
                          model.setState({
                            columnVisibility: {
                              ...state.columnVisibility,
                              ...Object.fromEntries(
                                items.map((column) => [
                                  column.id,
                                  event.target.checked,
                                ]),
                              ),
                            },
                          });
                        }}
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
                            aria-pressed={state.groupBy.includes(column.id)}
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
                                columnDragOwner(model),
                              );
                              event.dataTransfer.setData(
                                "text/plain",
                                column.header ?? column.id,
                              );
                            }}
                            onClick={() =>
                              model.setState({
                                groupBy: state.groupBy.includes(column.id)
                                  ? state.groupBy.filter(
                                      (key) => key !== column.id,
                                    )
                                  : [...state.groupBy, column.id],
                                expanded: [],
                                page: 0,
                              })
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
                        <label key={column.id} className="og-side-column">
                          <input
                            type="checkbox"
                            checked={visible(column)}
                            onChange={(event) =>
                              model.hideColumn(column.id, !event.target.checked)
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
            <RowGroupPanel
              model={model}
              ariaLabel={`${text.columns}: ${text.rowGroups}`}
            />
            <section className="og-side-values" aria-label={text.values}>
              <h2>{text.values}</h2>
              {columns
                .filter(
                  (column) =>
                    column.type === "number" ||
                    column.type === "bigint" ||
                    column.aggregate !== undefined,
                )
                .map((column) => (
                  <label key={column.id}>
                    <span>{column.header ?? column.id}</span>
                    <select
                      aria-label={`${text.values}: ${column.header ?? column.id}`}
                      value={
                        typeof column.aggregate === "function"
                          ? "custom"
                          : (column.aggregate ?? "")
                      }
                      onChange={(event) =>
                        aggregate(column.id, event.target.value)
                      }
                    >
                      <option value="">{text.noAggregate}</option>
                      {aggregates.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                      {typeof column.aggregate === "function" && (
                        <option value="custom">{text.customAggregate}</option>
                      )}
                    </select>
                  </label>
                ))}
              {!columns.some(
                (column) =>
                  column.type === "number" ||
                  column.type === "bigint" ||
                  column.aggregate !== undefined,
              ) && <p>{text.noValues}</p>}
            </section>
          </>
        ) : (
          <div className="og-side-filters">
            {matches
              .filter((column) => column.filterable !== false)
              .map((column) => (
                <div key={column.id}>
                  <span>{column.header ?? column.id}</span>
                  <ColumnConditionFilter
                    model={model}
                    column={column}
                    trigger={<GridIcon name="filter" size={16} />}
                    label={`${text.filters}: ${column.header ?? column.id}`}
                    filter={
                      Object.hasOwn(state.filters, column.id)
                        ? state.filters[column.id]
                        : undefined
                    }
                    getFilter={() =>
                      Object.hasOwn(model.getState().filters, column.id)
                        ? model.getState().filters[column.id]
                        : undefined
                    }
                    onFilterChange={(filter) =>
                      model.setFilter(column.id, filter)
                    }
                    onClear={() => model.setFilter(column.id)}
                  />
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
