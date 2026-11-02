import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from "react";
import {
  buildClientPivotReport,
  type ClientPivotOptions,
  type GridModel,
  type PivotAggregation,
  type PivotConfiguration,
} from "@opengrid/core";
import { COLUMN_DRAG_OWNER, columnDragOwner } from "./group-panel.js";
import { GridIcon } from "./icons.js";

export interface PivotPanelLabels {
  title: string;
  rows: string;
  columns: string;
  values: string;
  available: string;
  search: string;
  hint: string;
  drop: string;
  add: string;
  remove: string;
  earlier: string;
  later: string;
  aggregation: string;
  rowTotals: string;
  grandTotal: string;
  clear: string;
  noFields: string;
}
const defaults: PivotPanelLabels = {
  title: "Pivot fields",
  rows: "Rows",
  columns: "Columns",
  values: "Values",
  available: "Available fields",
  search: "Search fields",
  hint: "Drag a field into a zone, or choose a field and Add.",
  drop: "Drop fields here",
  add: "Add",
  remove: "Remove",
  earlier: "Move earlier",
  later: "Move later",
  aggregation: "Aggregation",
  rowTotals: "Row totals",
  grandTotal: "Grand total",
  clear: "Clear fields",
  noFields: "No matching fields",
};
const operations: readonly PivotAggregation[] = [
  "sum",
  "avg",
  "min",
  "max",
  "count",
];
const operationNames = {
  sum: "Sum",
  avg: "Average",
  min: "Minimum",
  max: "Maximum",
  count: "Count",
};
type Role = "rows" | "columns" | "values";
export interface PivotPanelProps<T> extends ClientPivotOptions {
  model: GridModel<T>;
  configuration: PivotConfiguration;
  onConfigurationChange: (configuration: PivotConfiguration) => void;
  className?: string;
  panelLabels?: Partial<PivotPanelLabels>;
}
/** Controlled client-side pivot configuration. Failed edits leave the applied matrix intact. */
export function PivotPanel<T>({
  model,
  configuration,
  onConfigurationChange,
  className = "",
  panelLabels,
  limits,
  labels,
}: PivotPanelProps<T>) {
  useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const text = { ...defaults, ...panelLabels };
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Partial<Record<Role, string>>>({});
  const [over, setOver] = useState<Role | null>(null);
  const columns = model.getColumns();
  const name = (key: string) =>
    columns.find((column) => column.id === key)?.header ?? key;
  const numeric = (key: string) =>
    ["number", "bigint"].includes(
      columns.find((column) => column.id === key)?.type ?? "",
    );
  const keys = (role: Role): readonly string[] =>
    role === "values"
      ? configuration.values.map((value) => value.columnId)
      : configuration[role];
  const allowed = (role: Role, key: string) =>
    columns.some(
      (column) =>
        column.id === key && (role !== "rows" || column.groupable !== false),
    );
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const target = [
      ...(root.current?.querySelectorAll<HTMLElement>("[data-pivot-focus]") ??
        []),
    ].find(
      (node) =>
        node.dataset.pivotFocus === pendingFocus.current &&
        !(node as HTMLButtonElement).disabled,
    );
    target?.focus();
    pendingFocus.current = null;
  }, [configuration, error]);
  function apply(next: PivotConfiguration, focus: string) {
    try {
      // Validate data types and result limits before changing the caller's applied configuration.
      const report = buildClientPivotReport(model, next, { limits, labels });
      setError("");
      pendingFocus.current = focus;
      onConfigurationChange(report.configuration);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not configure pivot",
      );
    }
  }
  function move(role: Role, key: string, index: number) {
    if (!allowed(role, key)) return;
    const next = { ...configuration };
    if (role === "values") {
      const value = configuration.values.find(
        (value) => value.columnId === key,
      ) ?? {
        columnId: key,
        aggregate: numeric(key) ? ("sum" as const) : ("count" as const),
      };
      const values = configuration.values.filter(
        (value) => value.columnId !== key,
      );
      values.splice(Math.max(0, Math.min(values.length, index)), 0, value);
      next.values = values;
    } else {
      next.rows = configuration.rows.filter((value) => value !== key);
      next.columns = configuration.columns.filter((value) => value !== key);
      const fields = [...next[role]];
      fields.splice(Math.max(0, Math.min(fields.length, index)), 0, key);
      next[role] = fields;
    }
    apply(next, `${role}:add`);
  }
  function start(event: DragEvent, key: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(COLUMN_DRAG_OWNER, columnDragOwner(model));
    event.dataTransfer.setData("text/opengrid-column", key);
  }
  function drop(event: DragEvent, role: Role, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setOver(null);
    if (
      event.dataTransfer.getData(COLUMN_DRAG_OWNER) !== columnDragOwner(model)
    )
      return;
    move(role, event.dataTransfer.getData("text/opengrid-column"), index);
  }
  return (
    <section
      ref={root}
      className={`og-pivot-panel ${className}`}
      aria-label={text.title}
    >
      <div className="og-pivot-heading">
        <h2>{text.title}</h2>
        <button
          type="button"
          onClick={() =>
            apply(
              {
                rows: [],
                columns: [],
                values: [],
                rowTotals: configuration.rowTotals,
                grandTotal: configuration.grandTotal,
              },
              "rows:add",
            )
          }
        >
          {text.clear}
        </button>
      </div>
      <div className="og-pivot-body">
        <p className="og-pivot-hint">{text.hint}</p>
        {error && (
          <p className="og-pivot-error" role="alert">
            {error}
          </p>
        )}
        <details className="og-pivot-available">
          <summary>{text.available}</summary>
          <label>
            <span className="og-visually-hidden">{text.search}</span>
            <input
              type="search"
              placeholder={text.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ul>
            {columns
              .filter((column) =>
                (column.header ?? column.id)
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map((column) => (
                <li
                  key={column.id}
                  draggable
                  onDragStart={(event) => start(event, column.id)}
                  data-pivot-source={column.id}
                >
                  <GridIcon name="grip" size={14} />
                  {column.header ?? column.id}
                </li>
              ))}
          </ul>
          {!columns.some((column) =>
            (column.header ?? column.id)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
          ) && <p>{text.noFields}</p>}
        </details>
        {(["rows", "columns", "values"] as const).map((role) => {
          const fields = keys(role);
          const available = columns.filter(
            (column) => allowed(role, column.id) && !fields.includes(column.id),
          );
          const selected = available.some(
            (column) => column.id === choices[role],
          )
            ? choices[role]!
            : (available[0]?.id ?? "");
          return (
            <section
              key={role}
              className={`og-pivot-zone ${over === role ? "og-pivot-zone-over" : ""}`}
              aria-labelledby={`${id}-${role}`}
              data-pivot-zone={role}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(COLUMN_DRAG_OWNER)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(role);
                }
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                )
                  setOver(null);
              }}
              onDrop={(event) => drop(event, role, fields.length)}
            >
              <h3 id={`${id}-${role}`}>{text[role]}</h3>
              <ol className="og-pivot-fields">
                {fields.map((key, index) => (
                  <li
                    key={key}
                    draggable
                    onDragStart={(event) => start(event, key)}
                    onDrop={(event) => drop(event, role, index)}
                  >
                    <div className="og-pivot-field-line">
                      <GridIcon name="grip" size={14} />
                      <span className="og-pivot-field-name">{name(key)}</span>
                      <div className="og-pivot-actions">
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={`${text.earlier}: ${name(key)} (${text[role]})`}
                          onClick={() => move(role, key, index - 1)}
                        >
                          <GridIcon name="arrowUp" size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={index === fields.length - 1}
                          aria-label={`${text.later}: ${name(key)} (${text[role]})`}
                          onClick={() => move(role, key, index + 1)}
                        >
                          <GridIcon name="arrowDown" size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`${text.remove}: ${name(key)} (${text[role]})`}
                          onClick={() =>
                            apply(
                              role === "values"
                                ? {
                                    ...configuration,
                                    values: configuration.values.filter(
                                      (value) => value.columnId !== key,
                                    ),
                                  }
                                : {
                                    ...configuration,
                                    [role]: fields.filter(
                                      (value) => value !== key,
                                    ),
                                  },
                              `${role}:add`,
                            )
                          }
                        >
                          <GridIcon name="close" size={14} />
                        </button>
                      </div>
                    </div>
                    {role === "values" && (
                      <label className="og-pivot-operation">
                        <span>{text.aggregation}</span>
                        <select
                          aria-label={`${text.aggregation}: ${name(key)}`}
                          value={
                            configuration.values.find(
                              (value) => value.columnId === key,
                            )!.aggregate
                          }
                          onChange={(event) =>
                            apply(
                              {
                                ...configuration,
                                values: configuration.values.map((value) =>
                                  value.columnId === key
                                    ? {
                                        ...value,
                                        aggregate: event.target
                                          .value as PivotAggregation,
                                      }
                                    : value,
                                ),
                              },
                              `${role}:aggregate:${key}`,
                            )
                          }
                          data-pivot-focus={`${role}:aggregate:${key}`}
                        >
                          {(numeric(key)
                            ? operations
                            : (["count"] as const)
                          ).map((operation) => (
                            <option key={operation} value={operation}>
                              {labels?.[operation] ?? operationNames[operation]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
              </ol>
              {fields.length === 0 && (
                <p className="og-pivot-empty">{text.drop}</p>
              )}
              <div className="og-pivot-add">
                <select
                  aria-label={`${text[role]} field`}
                  value={selected}
                  disabled={!available.length}
                  onChange={(event) =>
                    setChoices((current) => ({
                      ...current,
                      [role]: event.target.value,
                    }))
                  }
                >
                  {available.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.header ?? column.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`${text.add} ${text[role].toLocaleLowerCase()} field`}
                  data-pivot-focus={`${role}:add`}
                  disabled={!selected}
                  onClick={() => move(role, selected, fields.length)}
                >
                  {text.add}
                </button>
              </div>
            </section>
          );
        })}
        <div className="og-pivot-totals">
          {(["rowTotals", "grandTotal"] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={configuration[key] !== false}
                onChange={(event) =>
                  apply({ ...configuration, [key]: event.target.checked }, key)
                }
                data-pivot-focus={key}
              />
              {text[key]}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
