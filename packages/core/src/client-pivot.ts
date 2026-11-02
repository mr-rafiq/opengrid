import type { Column, GridModel, RowNode } from "./types.js";
import { aggregateValues } from "./analytics.js";
import { formatAggregateValue } from "./aggregate-formatting.js";
import { csvCell } from "./index.js";

export type PivotAggregation = "sum" | "avg" | "min" | "max" | "count";
export interface PivotValue {
  readonly columnId: string;
  readonly aggregate: PivotAggregation;
}
export interface PivotConfiguration {
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  readonly values: readonly PivotValue[];
  readonly rowTotals?: boolean;
  readonly grandTotal?: boolean;
}
export interface PivotLimits {
  maxSourceRows: number;
  maxRows: number;
  maxColumns: number;
  maxCells: number;
}
export const CLIENT_PIVOT_LIMITS: Readonly<PivotLimits> = Object.freeze({
  maxSourceRows: 100000,
  maxRows: 10000,
  maxColumns: 256,
  maxCells: 200000,
});
const hardLimits: PivotLimits = {
  maxSourceRows: 1000000,
  maxRows: 100000,
  maxColumns: 2048,
  maxCells: 2000000,
};
export type PivotErrorCode =
  | "configuration"
  | "sourceLimit"
  | "rowLimit"
  | "columnLimit"
  | "cellLimit"
  | "dimension"
  | "aggregation"
  | "formatting";
export class ClientPivotError extends Error {
  constructor(
    readonly code: PivotErrorCode,
    message: string,
    readonly columnId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ClientPivotError";
  }
}
export interface PivotReportLabels {
  blank: string;
  summary: string;
  grandTotal: string;
  rowTotal: string;
  sum: string;
  avg: string;
  min: string;
  max: string;
  count: string;
}
const defaultLabels: Readonly<PivotReportLabels> = Object.freeze({
  blank: "(blank)",
  summary: "All records",
  grandTotal: "Grand total",
  rowTotal: "Total",
  sum: "Sum",
  avg: "Average",
  min: "Minimum",
  max: "Maximum",
  count: "Count",
});
export interface ClientPivotOptions {
  limits?: Partial<PivotLimits>;
  labels?: Partial<PivotReportLabels>;
}
export interface PivotDimension {
  /** Typed identity is independent of the display label. Dates are detached ISO strings. */
  readonly key: string;
  readonly value: string | number | bigint | boolean | null | undefined;
  readonly label: string;
}
export interface PivotReportColumn {
  readonly id: string;
  readonly kind: "dimension" | "value" | "rowTotal" | "summary";
  readonly header: string;
  readonly groupPath: readonly string[];
  readonly sourceColumnId?: string;
  readonly dimensionIndex?: number;
  readonly aggregate?: PivotAggregation;
  readonly pivotKeys?: readonly PivotDimension[];
  readonly type?: Column<unknown>["type"];
}
export interface PivotReportRow {
  readonly id: string;
  readonly keys: readonly PivotDimension[];
  readonly cells: Readonly<Record<string, unknown>>;
  readonly display: Readonly<Record<string, string>>;
  readonly sourceRowCount: number;
  readonly grand: boolean;
}
export interface ClientPivotReport {
  readonly configuration: PivotConfiguration;
  readonly columns: readonly PivotReportColumn[];
  readonly rows: readonly PivotReportRow[];
  readonly grandTotal?: PivotReportRow;
  readonly sourceRowCount: number;
  readonly emptyReason?: "noValues";
}
const operations: readonly PivotAggregation[] = [
  "sum",
  "avg",
  "min",
  "max",
  "count",
];
const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value));
const tuple = (keys: readonly PivotDimension[]) =>
  JSON.stringify(keys.map((key) => key.key));
const own = (value: object, key: string) => Object.hasOwn(value, key);

export function normalizePivotConfiguration(
  configuration: PivotConfiguration,
  available: readonly { id: string }[],
): PivotConfiguration {
  if (!configuration || typeof configuration !== "object")
    throw new ClientPivotError(
      "configuration",
      "Pivot configuration is required",
    );
  const ids = new Set(available.map((column) => column.id));
  function fields(input: readonly string[], role: string): readonly string[] {
    if (
      !Array.isArray(input) ||
      input.length > 8 ||
      Array.from(input).some((id) => typeof id !== "string" || !ids.has(id)) ||
      new Set(input).size !== input.length
    )
      throw new ClientPivotError(
        "configuration",
        `Pivot ${role} must contain up to eight distinct existing column IDs`,
      );
    return Object.freeze([...input]);
  }
  const rows = fields(configuration.rows, "rows"),
    columns = fields(configuration.columns, "columns");
  if (
    !Array.isArray(configuration.values) ||
    configuration.values.length > 16 ||
    new Set(configuration.values.map((value) => value?.columnId)).size !==
      configuration.values.length
  )
    throw new ClientPivotError(
      "configuration",
      "Pivot values must contain up to sixteen distinct source columns",
    );
  const values = Array.from(configuration.values).map((value) => {
    if (
      !value ||
      !ids.has(value.columnId) ||
      !operations.includes(value.aggregate)
    )
      throw new ClientPivotError(
        "configuration",
        "Each pivot value requires an existing column and a built-in aggregation",
      );
    return Object.freeze({
      columnId: value.columnId,
      aggregate: value.aggregate,
    });
  });
  for (const field of ["rowTotals", "grandTotal"] as const)
    if (
      configuration[field] !== undefined &&
      typeof configuration[field] !== "boolean"
    )
      throw new ClientPivotError(
        "configuration",
        `Pivot ${field} must be a boolean`,
      );
  return Object.freeze({
    rows,
    columns,
    values: Object.freeze(values),
    rowTotals: configuration.rowTotals ?? true,
    grandTotal: configuration.grandTotal ?? true,
  });
}

function dimension<T>(
  value: unknown,
  column: Column<T>,
  row: T,
  labels: PivotReportLabels,
): PivotDimension {
  let tag: string, normalized: PivotDimension["value"];
  if (value === null) {
    tag = "null";
    normalized = null;
  } else if (value === undefined) {
    tag = "undefined";
    normalized = undefined;
  } else if (value instanceof Date) {
    const time = Date.prototype.getTime.call(value);
    if (!Number.isFinite(time))
      throw new ClientPivotError(
        "dimension",
        `Invalid pivot date in ${column.id}`,
        column.id,
      );
    tag = "date";
    normalized = new Date(time).toISOString();
  } else if (["string", "number", "bigint", "boolean"].includes(typeof value)) {
    tag = typeof value;
    normalized = value as PivotDimension["value"];
  } else
    throw new ClientPivotError(
      "dimension",
      `Pivot dimension ${column.id} must contain scalar values or valid dates`,
      column.id,
    );
  const identity =
    tag === "number" && Object.is(value, -0)
      ? "-0"
      : normalized == null
        ? ""
        : String(normalized);
  if (identity.length > 2048)
    throw new ClientPivotError(
      "dimension",
      `Pivot key in ${column.id} exceeds 2,048 characters`,
      column.id,
    );
  let label: string;
  try {
    label =
      value == null
        ? labels.blank
        : column.valueFormatter
          ? column.valueFormatter(value, row)
          : String(normalized);
  } catch (cause) {
    throw new ClientPivotError(
      "formatting",
      `Could not format pivot dimension ${column.id}`,
      column.id,
      { cause },
    );
  }
  if (typeof label !== "string" || label.length > 4096)
    throw new ClientPivotError(
      "formatting",
      `Pivot dimension ${column.id} requires a display string of at most 4,096 characters`,
      column.id,
    );
  return Object.freeze({
    key: JSON.stringify([tag, identity]),
    value: normalized,
    label,
  });
}

/** Keep distinct typed categories distinguishable even when application formatters produce equal labels. */
function labelPaths(
  paths: readonly (readonly PivotDimension[])[],
): Map<string, readonly string[]> {
  const families = new Map<string, Map<string, Set<string>>>();
  for (const path of paths)
    path.forEach((key, depth) => {
      const parent = tuple(path.slice(0, depth));
      let names = families.get(parent);
      if (!names) families.set(parent, (names = new Map()));
      let identities = names.get(key.label);
      if (!identities) names.set(key.label, (identities = new Set()));
      identities.add(key.key);
    });
  const resolved = new Map<string, Map<string, string>>();
  for (const [parent, names] of families) {
    const used = new Set(names.keys());
    const labels = new Map<string, string>();
    for (const [label, identities] of [...names].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (identities.size === 1) labels.set([...identities][0], label);
      else {
        let ordinal = 1;
        for (const identity of [...identities].sort()) {
          let candidate: string;
          do {
            candidate = `${label} (${ordinal++})`;
          } while (used.has(candidate));
          used.add(candidate);
          labels.set(identity, candidate);
        }
      }
    }
    resolved.set(parent, labels);
  }
  return new Map(
    paths.map((path) => [
      tuple(path),
      Object.freeze(
        path.map((key, depth) =>
          resolved.get(tuple(path.slice(0, depth)))!.get(key.key)!,
        ),
      ),
    ]),
  );
}

interface Bucket {
  keys: readonly PivotDimension[];
  count: number;
  cells: Map<string, unknown[][]>;
  totals: unknown[][];
}
interface ColumnBucket {
  keys: readonly PivotDimension[];
  count: number;
  totals: unknown[][];
}

/** A bounded, detached client matrix. Totals aggregate original filtered source records, including averages. */
export function buildClientPivotReport<T>(
  model: GridModel<T>,
  requested: PivotConfiguration,
  options: ClientPivotOptions = {},
): ClientPivotReport {
  const definitions = model.getColumnDefinitions(),
    byId = new Map(definitions.map((column) => [column.id, column]));
  const configuration = normalizePivotConfiguration(requested, definitions);
  const limits = { ...CLIENT_PIVOT_LIMITS, ...options.limits };
  for (const key of Object.keys(CLIENT_PIVOT_LIMITS) as (keyof PivotLimits)[])
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] < 1 ||
      limits[key] > hardLimits[key]
    )
      throw new ClientPivotError("configuration", `Invalid pivot limit ${key}`);
  const labels = { ...defaultLabels, ...options.labels };
  for (const value of Object.values(labels))
    if (typeof value !== "string" || !value || value.length > 256)
      throw new ClientPivotError(
        "configuration",
        "Pivot labels require nonempty strings of at most 256 characters",
      );
  const source = model.getFilteredRows();
  if (source.length > limits.maxSourceRows)
    throw new ClientPivotError(
      "sourceLimit",
      `Pivot input has ${source.length} rows; the limit is ${limits.maxSourceRows}. Filter the source or raise the explicit limit.`,
    );
  const dimensionColumns: PivotReportColumn[] = configuration.rows.length
    ? configuration.rows.map((id, index) =>
        Object.freeze({
          id: `pivot:dimension:${encode(id)}`,
          kind: "dimension" as const,
          sourceColumnId: id,
          dimensionIndex: index,
          header: byId.get(id)!.header ?? id,
          groupPath: Object.freeze([]),
          type: byId.get(id)!.type,
        }),
      )
    : [
        Object.freeze({
          id: "pivot:summary",
          kind: "summary",
          header: "Summary",
          groupPath: Object.freeze([]),
          type: "text",
        }),
      ];
  if (dimensionColumns.length > limits.maxColumns)
    throw new ClientPivotError(
      "columnLimit",
      `Pivot dimensions exceed ${limits.maxColumns} columns`,
    );
  if (!configuration.values.length)
    return Object.freeze({
      configuration,
      columns: Object.freeze(dimensionColumns),
      rows: Object.freeze([]),
      sourceRowCount: source.length,
      emptyReason: "noValues",
    });
  const measureColumns = configuration.values.map((value) => ({
    ...byId.get(value.columnId)!,
    aggregate: value.aggregate,
  }));
  const vectors = () => configuration.values.map(() => [] as unknown[]);
  const buckets = new Map<string, Bucket>(),
    pivotBuckets = new Map<string, ColumnBucket>();
  const grand = { count: 0, totals: vectors() };
  const totals = configuration.columns.length > 0 && configuration.rowTotals;
  const hasGrand = configuration.rows.length > 0 && configuration.grandTotal;
  const checkSize = () => {
    const columns =
      dimensionColumns.length +
      (pivotBuckets.size + (totals ? 1 : 0)) * configuration.values.length;
    if (buckets.size > limits.maxRows)
      throw new ClientPivotError(
        "rowLimit",
        `Pivot result exceeds ${limits.maxRows} rows. Remove row fields or filter the source.`,
      );
    if (columns > limits.maxColumns)
      throw new ClientPivotError(
        "columnLimit",
        `Pivot result exceeds ${limits.maxColumns} columns. Remove column fields or filter the source.`,
      );
    if ((buckets.size + (hasGrand ? 1 : 0)) * columns > limits.maxCells)
      throw new ClientPivotError(
        "cellLimit",
        `Pivot result exceeds ${limits.maxCells} cells. Reduce fields or filter the source.`,
      );
  };
  if (!configuration.columns.length)
    pivotBuckets.set("[]", {
      keys: Object.freeze([]),
      count: 0,
      totals: vectors(),
    });
  if (!configuration.rows.length)
    buckets.set("[]", {
      keys: Object.freeze([]),
      count: 0,
      cells: new Map(),
      totals: vectors(),
    });
  checkSize();
  for (const row of source) {
    const cache = new Map<string, unknown>();
    const read = (id: string) => {
      if (!cache.has(id)) cache.set(id, model.getValue(row, id));
      return cache.get(id);
    };
    const rowKeys = configuration.rows.map((id) =>
      dimension(read(id), byId.get(id)!, row, labels),
    );
    const pivotKeys = configuration.columns.map((id) =>
      dimension(read(id), byId.get(id)!, row, labels),
    );
    const rowKey = tuple(rowKeys),
      pivotKey = tuple(pivotKeys);
    let bucket = buckets.get(rowKey);
    if (!bucket)
      buckets.set(
        rowKey,
        (bucket = {
          keys: Object.freeze(rowKeys),
          count: 0,
          cells: new Map(),
          totals: vectors(),
        }),
      );
    let column = pivotBuckets.get(pivotKey);
    if (!column)
      pivotBuckets.set(
        pivotKey,
        (column = {
          keys: Object.freeze(pivotKeys),
          count: 0,
          totals: vectors(),
        }),
      );
    checkSize();
    let cells = bucket.cells.get(pivotKey);
    if (!cells) bucket.cells.set(pivotKey, (cells = vectors()));
    configuration.values.forEach((value, index) => {
      const raw = read(value.columnId);
      cells![index].push(raw);
      bucket!.totals[index].push(raw);
      column!.totals[index].push(raw);
      grand.totals[index].push(raw);
    });
    bucket.count++;
    column.count++;
    grand.count++;
  }
  const rowLabels = labelPaths(
    [...buckets.values()].map((bucket) => bucket.keys),
  );
  const pivotLabels = labelPaths(
    [...pivotBuckets.values()].map((bucket) => bucket.keys),
  );
  const columnList: PivotReportColumn[] = [...dimensionColumns];
  const metadata = new Map<string, { valueIndex: number; pivotKey?: string }>();
  const addMeasure = (valueIndex: number, keys?: readonly PivotDimension[]) => {
    const value = configuration.values[valueIndex],
      definition = byId.get(value.columnId)!;
    const id = `pivot:value:${encode([configuration.columns, keys?.map((key) => key.key) ?? null, value.columnId])}`;
    const column: PivotReportColumn = Object.freeze({
      id,
      kind: keys ? "value" : "rowTotal",
      sourceColumnId: value.columnId,
      aggregate: value.aggregate,
      header: `${labels[value.aggregate]} ${definition.header ?? definition.id}`,
      groupPath: keys
        ? pivotLabels.get(tuple(keys))!
        : Object.freeze([totalLabel]),
      ...(keys ? { pivotKeys: keys } : {}),
      type:
        value.aggregate === "count"
          ? "number"
          : definition.type === "bigint"
            ? "bigint"
            : "number",
    });
    columnList.push(column);
    metadata.set(id, {
      valueIndex,
      ...(keys ? { pivotKey: tuple(keys) } : {}),
    });
  };
  let totalLabel = labels.rowTotal;
  const firstLabels = new Set([...pivotLabels.values()].map((path) => path[0]));
  for (let suffix = 2; firstLabels.has(totalLabel); suffix++)
    totalLabel = `${labels.rowTotal} (${suffix})`;
  for (const column of pivotBuckets.values())
    configuration.values.forEach((_value, index) =>
      addMeasure(index, column.keys),
    );
  if (totals)
    configuration.values.forEach((_value, index) => addMeasure(index));
  const makeRow = (bucket: Bucket | undefined): PivotReportRow => {
    const isGrand = bucket === undefined,
      keys = bucket?.keys ?? Object.freeze([]);
    const id = isGrand
      ? "pivot:grand-total"
      : `pivot:row:${encode([configuration.rows, keys.map((key) => key.key)])}`;
    const cells: Record<string, unknown> = Object.create(null),
      display: Record<string, string> = Object.create(null);
    const node: RowNode<T> = {
      id,
      kind: isGrand ? "total" : "group",
      ...(isGrand
        ? { total: "grand" as const }
        : {
            label: keys.length
              ? rowLabels.get(tuple(keys))!.join(" / ")
              : labels.summary,
          }),
      depth: 0,
      leafCount: bucket?.count ?? grand.count,
    };
    for (const column of columnList) {
      if (column.kind === "dimension" || column.kind === "summary") {
        const index = column.dimensionIndex ?? 0;
        cells[column.id] = keys[index]?.value;
        display[column.id] = isGrand
          ? index === 0
            ? labels.grandTotal
            : ""
          : column.kind === "summary"
            ? labels.summary
            : rowLabels.get(tuple(keys))![index];
        continue;
      }
      const { valueIndex, pivotKey } = metadata.get(column.id)!;
      const values = isGrand
        ? pivotKey === undefined
          ? grand.totals[valueIndex]
          : pivotBuckets.get(pivotKey)!.totals[valueIndex]
        : pivotKey === undefined
          ? bucket!.totals[valueIndex]
          : (bucket!.cells.get(pivotKey)?.[valueIndex] ?? []);
      let value: unknown;
      try {
        value = aggregateValues(
          values,
          configuration.values[valueIndex].aggregate,
        );
      } catch (cause) {
        throw new ClientPivotError(
          "aggregation",
          `Could not aggregate pivot value ${column.sourceColumnId}; numeric and BigInt values cannot be mixed`,
          column.sourceColumnId,
          { cause },
        );
      }
      if (typeof value === "number" && !Number.isFinite(value))
        throw new ClientPivotError(
          "aggregation",
          `Pivot aggregation overflow in ${column.sourceColumnId}`,
          column.sourceColumnId,
        );
      cells[column.id] = value;
      try {
        display[column.id] = formatAggregateValue(
          measureColumns[valueIndex],
          value,
          node,
        );
      } catch (cause) {
        throw new ClientPivotError(
          "formatting",
          `Could not format pivot aggregate ${column.sourceColumnId}`,
          column.sourceColumnId,
          { cause },
        );
      }
    }
    return Object.freeze({
      id,
      keys,
      cells: Object.freeze(cells),
      display: Object.freeze(display),
      sourceRowCount: bucket?.count ?? grand.count,
      grand: isGrand,
    });
  };
  return Object.freeze({
    configuration,
    columns: Object.freeze(columnList),
    rows: Object.freeze([...buckets.values()].map(makeRow)),
    ...(hasGrand ? { grandTotal: makeRow(undefined) } : {}),
    sourceRowCount: source.length,
  });
}

/** Formatted, formula-neutralised CSV includes the configured row totals and grand-total row. */
export function exportClientPivotCsv(report: ClientPivotReport): string {
  const rows = [
    ...report.rows,
    ...(report.grandTotal ? [report.grandTotal] : []),
  ];
  return [
    report.columns
      .map((column) =>
        csvCell([...column.groupPath, column.header].join(" / ")),
      )
      .join(","),
    ...rows.map((row) =>
      report.columns
        .map((column) =>
          csvCell(own(row.display, column.id) ? row.display[column.id] : ""),
        )
        .join(","),
    ),
  ].join("\r\n");
}
