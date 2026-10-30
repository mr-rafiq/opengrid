import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CellRange, Column, GridModel } from "@opengrid/core";
import { gridMessage, useGridLocale } from "./locale.js";
import type { GridMessage } from "./locale.js";

export type GridChartType = "bar" | "line" | "scatter";
export type GridChartAggregation = "sum" | "avg";
export interface GridChartProps<T> {
  model: GridModel<T>;
  range?: CellRange | null;
  xColumnId?: string;
  yColumnIds?: string[];
  type?: GridChartType;
  aggregation?: GridChartAggregation;
  height?: number;
  ariaLabel?: string;
  maxPoints?: number;
}
export interface GridChartPoint {
  key: string;
  label: string;
  x: number | null;
  values: Record<string, number | null>;
}
export interface GridChartData {
  points: GridChartPoint[];
  series: { id: string; label: string }[];
  xLabel: string;
  numericX: boolean;
  sourceRowCount: number;
  totalPoints: number;
  sampled: boolean;
  invalidRange: boolean;
}
export interface GridChartDataOptions {
  range?: CellRange | null;
  xColumnId?: string;
  yColumnIds?: string[];
  type?: GridChartType;
  aggregation?: GridChartAggregation;
  maxPoints?: number;
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const pointLimit = (value = 500) =>
  Number.isFinite(value) ? Math.max(1, Math.min(5000, Math.floor(value))) : 500;
const colorPalette = Array.from(
  { length: 8 },
  (_, index) => `var(--og-chart-${index + 1})`,
);

function eligibleColumns<T>(
  model: GridModel<T>,
  range?: CellRange | null,
): Column<T>[] {
  const columns = model.getColumns().filter((column) => !column.hidden);
  if (!range) return columns;
  const a = columns.findIndex((column) => column.id === range.anchor.columnId);
  const b = columns.findIndex((column) => column.id === range.focus.columnId);
  return a < 0 || b < 0
    ? []
    : columns.slice(Math.min(a, b), Math.max(a, b) + 1);
}
function category(
  value: unknown,
): { key: string; label: string; x: number | null } | null {
  if (value == null || value === "")
    return { key: "blank", label: "(blank)", x: null };
  if (typeof value === "number")
    return Number.isFinite(value)
      ? { key: `number:${value}`, label: String(value), x: value }
      : null;
  if (typeof value === "string" || typeof value === "boolean")
    return { key: `${typeof value}:${value}`, label: String(value), x: null };
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return {
      key: `date:${value.toISOString()}`,
      label: value.toISOString(),
      x: null,
    };
  return null;
}

/** Builds a bounded chart projection from live model values. No strings or BigInts are coerced to numeric series. */
export function computeGridChartData<T>(
  model: GridModel<T>,
  options: GridChartDataOptions = {},
): GridChartData {
  const type = options.type ?? "bar",
    aggregation = options.aggregation ?? "sum";
  const columns = eligibleColumns(model, options.range);
  const xColumn =
    columns.find((column) => column.id === options.xColumnId) ??
    (!options.xColumnId ? columns[0] : undefined);
  const requested =
    options.yColumnIds ??
    columns
      .filter((column) => column.type === "number" && column.id !== xColumn?.id)
      .slice(0, 1)
      .map((column) => column.id);
  const yColumns = [...new Set(requested)]
    .map((id) => columns.find((column) => column.id === id))
    .filter(
      (column): column is Column<T> =>
        Boolean(column) && column!.id !== xColumn?.id,
    )
    .slice(0, 8);
  let rows = model.getFilteredRows(),
    invalidRange = false;
  if (options.range) {
    const nodes = model
      .getRowModel()
      .filter((node) => node.kind === "row" && node.data !== undefined);
    const a = nodes.findIndex(
        (node) => node.id === options.range!.anchor.rowId,
      ),
      b = nodes.findIndex((node) => node.id === options.range!.focus.rowId);
    invalidRange = a < 0 || b < 0 || !columns.length;
    rows = invalidRange
      ? []
      : nodes
          .slice(Math.min(a, b), Math.max(a, b) + 1)
          .map((node) => node.data!);
  }
  const result: GridChartData = {
    points: [],
    series: yColumns.map((column) => ({
      id: column.id,
      label: column.header ?? column.id,
    })),
    xLabel: xColumn?.header ?? xColumn?.id ?? "Category",
    numericX: false,
    sourceRowCount: rows.length,
    totalPoints: 0,
    sampled: false,
    invalidRange,
  };
  if (!xColumn || !yColumns.length) return result;
  const points: GridChartPoint[] = [];
  const groups = new Map<
    string,
    {
      point: GridChartPoint;
      sums: Record<string, number>;
      counts: Record<string, number>;
    }
  >();
  rows.forEach((row, index) => {
    const x = category(model.getValue(row, xColumn.id));
    if (!x || (type === "scatter" && x.x === null)) return;
    if (type === "scatter") {
      const values = Object.fromEntries(
        yColumns.map((column) => {
          const value = model.getValue(row, column.id);
          return [column.id, finiteNumber(value) ? value : null];
        }),
      );
      points.push({ key: `row-${index}`, label: x.label, x: x.x, values });
      return;
    }
    let group = groups.get(x.key);
    if (!group) {
      group = {
        point: {
          ...x,
          values: Object.create(null) as Record<string, number | null>,
        },
        sums: Object.create(null) as Record<string, number>,
        counts: Object.create(null) as Record<string, number>,
      };
      groups.set(x.key, group);
    }
    for (const column of yColumns) {
      const value = model.getValue(row, column.id);
      if (!finiteNumber(value)) continue;
      group.sums[column.id] = (group.sums[column.id] ?? 0) + value;
      group.counts[column.id] = (group.counts[column.id] ?? 0) + 1;
    }
  });
  if (type !== "scatter")
    for (const { point, sums, counts } of groups.values()) {
      for (const column of yColumns) {
        const count = counts[column.id] ?? 0;
        const value =
          aggregation === "avg" ? sums[column.id] / count : sums[column.id];
        point.values[column.id] =
          count && Number.isFinite(value) ? value : null;
      }
      points.push(point);
    }
  result.numericX =
    type === "scatter" ||
    (type === "line" &&
      points.length > 0 &&
      points.every((point) => point.x !== null));
  if (type === "line" && result.numericX) points.sort((a, b) => a.x! - b.x!);
  result.totalPoints = points.length;
  const limit = pointLimit(options.maxPoints);
  result.sampled = points.length > limit;
  result.points = result.sampled
    ? Array.from(
        { length: limit },
        (_, index) =>
          points[
            limit === 1
              ? 0
              : Math.floor((index * (points.length - 1)) / (limit - 1))
          ],
      )
    : points;
  return result;
}

export function GridChart<T>({
  model,
  range,
  xColumnId,
  yColumnIds,
  type = "bar",
  aggregation = "sum",
  height = 320,
  ariaLabel,
  maxPoints = 500,
}: GridChartProps<T>) {
  const locale = useGridLocale();
  const chartLabel = ariaLabel ?? locale.t("chart.label");
  const exactNumber = useMemo(
    () =>
      new Intl.NumberFormat(locale.locale, {
        useGrouping: false,
        maximumSignificantDigits: 21,
      }),
    [locale.locale],
  );
  const displayNumber = (value: number) =>
    locale.number(
      value,
      Math.abs(value) >= 1e9 || (value !== 0 && Math.abs(value) < 0.001)
        ? {
            notation: "scientific",
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          }
        : { maximumFractionDigits: 4 },
    );
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [chartType, setChartType] = useState(type),
    [xId, setXId] = useState(xColumnId ?? ""),
    [yIds, setYIds] = useState<string[] | undefined>(yColumnIds),
    [operation, setOperation] = useState(aggregation);
  const [message, setMessage] = useState<GridMessage | undefined>();
  const svg = useRef<SVGSVGElement>(null),
    titleId = useId(),
    descriptionId = useId();
  useEffect(() => setChartType(type), [type]);
  useEffect(() => setXId(xColumnId ?? ""), [xColumnId]);
  useEffect(() => setYIds(yColumnIds), [yColumnIds?.join("\u0000")]);
  useEffect(() => setOperation(aggregation), [aggregation]);
  const columns = eligibleColumns(model, range);
  const resolvedX = columns.some((column) => column.id === xId)
    ? xId
    : (columns[0]?.id ?? "");
  const numericColumns = columns.filter(
    (column) => column.type === "number" && column.id !== resolvedX,
  );
  const resolvedYs = (
    yIds ?? numericColumns.slice(0, 1).map((column) => column.id)
  )
    .filter(
      (id) => columns.some((column) => column.id === id) && id !== resolvedX,
    )
    .slice(0, 8);
  const data = useMemo(
    () =>
      computeGridChartData(model, {
        range,
        xColumnId: resolvedX,
        yColumnIds: resolvedYs,
        type: chartType,
        aggregation: operation,
        maxPoints,
      }),
    [
      model,
      snapshot,
      range?.anchor.rowId,
      range?.anchor.columnId,
      range?.focus.rowId,
      range?.focus.columnId,
      resolvedX,
      resolvedYs.join("\u0000"),
      chartType,
      operation,
      maxPoints,
    ],
  );
  const safeHeight = Number.isFinite(height)
    ? Math.max(180, Math.min(1200, height))
    : 320;
  const xLabel = resolvedX ? data.xLabel : locale.t("chart.category");
  const pointLabel = (point: GridChartPoint) =>
    point.key === "blank"
      ? locale.t("chart.blank")
      : (data.numericX || point.key.startsWith("number:")) && point.x !== null
        ? exactNumber.format(point.x)
        : point.label;
  const width = 800,
    left = 68,
    right = 22,
    top = 22,
    bottom = 56,
    plotWidth = width - left - right,
    plotHeight = safeHeight - top - bottom;
  let minimum = Infinity,
    maximum = -Infinity,
    xMin = Infinity,
    xMax = -Infinity,
    finiteValues = 0;
  for (const point of data.points) {
    if (point.x !== null) {
      xMin = Math.min(xMin, point.x);
      xMax = Math.max(xMax, point.x);
    }
    for (const series of data.series) {
      const value = point.values[series.id];
      if (value !== null && Number.isFinite(value)) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        finiteValues++;
      }
    }
  }
  if (!finiteValues) {
    minimum = 0;
    maximum = 1;
  }
  if (chartType === "bar") {
    minimum = Math.min(0, minimum);
    maximum = Math.max(0, maximum);
  }
  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.1 || 1;
    minimum = Math.max(-Number.MAX_VALUE, minimum - padding);
    maximum = Math.min(Number.MAX_VALUE, maximum + padding);
  }
  // Normalize before subtraction so opposite-sign finite extremes cannot overflow the domain.
  const yScale = Math.max(
    Math.abs(minimum),
    Math.abs(maximum),
    Number.MIN_VALUE,
  );
  const yLow = minimum / yScale,
    yHigh = maximum / yScale;
  const scaledY = (value: number) =>
    top + (1 - (value / yScale - yLow) / (yHigh - yLow)) * plotHeight;
  const xScale = Math.max(Math.abs(xMin), Math.abs(xMax), Number.MIN_VALUE);
  const scaledX = (point: GridChartPoint, index: number) =>
    left +
    (data.numericX
      ? xMax === xMin
        ? 0.5
        : (point.x! / xScale - xMin / xScale) / (xMax / xScale - xMin / xScale)
      : (index + 0.5) / Math.max(1, data.points.length)) *
      plotWidth;
  const zero = scaledY(0),
    barGroup = plotWidth / Math.max(1, data.points.length),
    barWidth = (barGroup * 0.75) / Math.max(1, data.series.length);
  function exportSvg() {
    try {
      if (!svg.current) return;
      const clone = svg.current.cloneNode(true) as SVGSVGElement;
      clone.style.backgroundColor = getComputedStyle(
        svg.current.closest(".og-chart") ?? svg.current,
      ).backgroundColor;
      const originals = [svg.current, ...svg.current.querySelectorAll("*")];
      const copies = [clone, ...clone.querySelectorAll("*")];
      originals.forEach((node, index) => {
        const style = getComputedStyle(node);
        for (const attribute of ["fill", "stroke", "color"] as const) {
          const value = style[attribute];
          if (value && !value.includes("var("))
            copies[index].setAttribute(attribute, value);
        }
      });
      const document = new XMLSerializer().serializeToString(clone);
      const url = URL.createObjectURL(
        new Blob([document], { type: "image/svg+xml;charset=utf-8" }),
      );
      const link = window.document.createElement("a");
      link.href = url;
      link.download = "opengrid-chart.svg";
      link.click();
      URL.revokeObjectURL(url);
      setMessage(gridMessage("chart.exported"));
    } catch {
      setMessage(gridMessage("chart.unavailable"));
    }
  }
  const styles = {
    control: {
      font: "inherit",
      padding: "5px 8px",
      border: "1px solid var(--og-control-border)",
      borderRadius: 4,
      background: "var(--og-bg)",
      color: "var(--og-text)",
    },
    label: { display: "inline-flex", alignItems: "center", gap: 6 },
  };
  return (
    <section
      className="og-chart"
      aria-label={chartLabel}
      lang={locale.locale}
      style={{
        border: "1px solid var(--og-border)",
        borderRadius: 8,
        padding: 16,
        background: "var(--og-bg)",
        color: "var(--og-text)",
        font: "13px/1.45 system-ui,sans-serif",
      }}
    >
      <div
        role="group"
        aria-label={locale.t("chart.config")}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label style={styles.label}>
          {locale.t("chart.type")}{" "}
          <select
            aria-label={locale.t("chart.type")}
            style={styles.control}
            value={chartType}
            onChange={(event) =>
              setChartType(event.target.value as GridChartType)
            }
          >
            <option value="bar">{locale.t("chart.bar")}</option>
            <option value="line">{locale.t("chart.line")}</option>
            <option value="scatter">{locale.t("chart.scatter")}</option>
          </select>
        </label>
        <label style={styles.label}>
          {locale.t("chart.xColumnLabel")}{" "}
          <select
            aria-label={locale.t("chart.xColumn")}
            style={styles.control}
            value={resolvedX}
            onChange={(event) => setXId(event.target.value)}
          >
            {!columns.length && (
              <option value="">{locale.t("chart.noColumns")}</option>
            )}
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.header ?? column.id}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.label}>
          {locale.t("chart.aggregateLabel")}{" "}
          <select
            aria-label={locale.t("chart.aggregation")}
            style={styles.control}
            value={operation}
            onChange={(event) =>
              setOperation(event.target.value as GridChartAggregation)
            }
            disabled={chartType === "scatter"}
          >
            <option value="sum">{locale.t("chart.sum")}</option>
            <option value="avg">{locale.t("chart.average")}</option>
          </select>
        </label>
        <details>
          <summary>
            {locale.t("chart.ySeries", { count: data.series.length, limit: 8 })}
          </summary>
          <fieldset
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              border: "1px solid var(--og-border)",
              padding: 10,
            }}
          >
            <legend>{locale.t("chart.series")}</legend>
            {columns
              .filter((column) => column.id !== resolvedX)
              .map((column) => (
                <label key={column.id} style={styles.label}>
                  <input
                    type="checkbox"
                    aria-label={locale.t("chart.seriesLabel", {
                      column: column.header ?? column.id,
                    })}
                    checked={resolvedYs.includes(column.id)}
                    disabled={
                      !resolvedYs.includes(column.id) && resolvedYs.length >= 8
                    }
                    onChange={(event) =>
                      setYIds(
                        event.target.checked
                          ? [...resolvedYs, column.id]
                          : resolvedYs.filter((id) => id !== column.id),
                      )
                    }
                  />
                  {column.header ?? column.id}
                </label>
              ))}
          </fieldset>
        </details>
        <button
          type="button"
          style={{ ...styles.control, cursor: "pointer" }}
          onClick={exportSvg}
        >
          {locale.t("chart.export")}
        </button>
      </div>
      <p style={{ margin: "0 0 8px", color: "var(--og-muted)" }}>
        {data.invalidRange
          ? locale.t("chart.rangeGone")
          : locale.t("chart.sourceSummary", {
              count: data.sourceRowCount,
              shown: data.points.length,
              total: data.totalPoints,
              kind:
                chartType === "scatter"
                  ? locale.t("chart.rowPoints", { count: data.totalPoints })
                  : locale.t("chart.categories", { count: data.totalPoints }),
            })}
        {data.sampled && ` ${locale.t("chart.sampling")}`}{" "}
        {chartType === "scatter"
          ? locale.t("chart.scatterHelp")
          : locale.t("chart.repeatHelp", {
              operation: locale
                .t(operation === "avg" ? "chart.average" : "chart.sum")
                .toLocaleLowerCase(locale.locale),
            })}
      </p>
      <svg
        ref={svg}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        viewBox={`0 0 ${width} ${safeHeight}`}
        style={{ display: "block", maxHeight: safeHeight }}
      >
        <title id={titleId}>{chartLabel}</title>
        <desc id={descriptionId}>
          {locale.t("chart.description", {
            type: locale.t(
              chartType === "bar"
                ? "chart.typeBar"
                : chartType === "line"
                  ? "chart.typeLine"
                  : "chart.typeScatter",
            ),
            series:
              data.series.map((series) => series.label).join(", ") ||
              locale.t("chart.noSeries"),
            x: xLabel,
            count: data.points.length,
          })}
        </desc>
        {Array.from({ length: 5 }, (_, index) => {
          const fraction = index / 4,
            value = minimum * (1 - fraction) + maximum * fraction,
            y = scaledY(value);
          return (
            <g key={index}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="var(--og-border)"
              />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--og-muted)"
              >
                {displayNumber(value)}
              </text>
            </g>
          );
        })}
        <line
          x1={left}
          x2={width - right}
          y1={top + plotHeight}
          y2={top + plotHeight}
          stroke="var(--og-control-border)"
        />
        {data.series.map((series, seriesIndex) => {
          const color = colorPalette[seriesIndex];
          if (chartType === "line") {
            let active = false;
            const path = data.points
              .map((point, index) => {
                const value = point.values[series.id];
                if (value === null || !Number.isFinite(value)) {
                  active = false;
                  return "";
                }
                const command = active ? "L" : "M";
                active = true;
                return `${command}${scaledX(point, index).toFixed(3)},${scaledY(value).toFixed(3)}`;
              })
              .join(" ");
            return (
              <path
                key={series.id}
                data-series={series.id}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
              >
                <title>{series.label}</title>
              </path>
            );
          }
          return (
            <g key={series.id} data-series={series.id}>
              {data.points.map((point, index) => {
                const value = point.values[series.id];
                if (value === null || !Number.isFinite(value)) return null;
                const y = scaledY(value),
                  title = `${pointLabel(point)}; ${series.label}: ${exactNumber.format(value)}`;
                return chartType === "scatter" ? (
                  <circle
                    key={point.key}
                    cx={scaledX(point, index)}
                    cy={y}
                    r="3"
                    fill={color}
                  >
                    <title>{title}</title>
                  </circle>
                ) : (
                  <rect
                    key={point.key}
                    x={
                      left +
                      index * barGroup +
                      barGroup * 0.125 +
                      seriesIndex * barWidth
                    }
                    y={Math.min(y, zero)}
                    width={Math.max(0, barWidth)}
                    height={Math.abs(zero - y)}
                    fill={color}
                  >
                    <title>{title}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {data.points
          .filter(
            (_, index) =>
              index === 0 ||
              index === data.points.length - 1 ||
              index % Math.max(1, Math.ceil(data.points.length / 6)) === 0,
          )
          .map((point) => {
            const index = data.points.indexOf(point);
            return (
              <text
                key={point.key}
                x={scaledX(point, index)}
                y={top + plotHeight + 18}
                textAnchor="middle"
                fontSize="10"
                fill="var(--og-muted)"
              >
                {pointLabel(point).length > 15
                  ? pointLabel(point).slice(0, 14) + "…"
                  : pointLabel(point)}
              </text>
            );
          })}
        <text
          x={left + plotWidth / 2}
          y={safeHeight - 6}
          textAnchor="middle"
          fontSize="11"
          fill="var(--og-text)"
        >
          {xLabel}
        </text>
        {!finiteValues && (
          <text
            x={left + plotWidth / 2}
            y={top + plotHeight / 2}
            textAnchor="middle"
            fontSize="14"
            fill="var(--og-muted)"
          >
            {locale.t("chart.empty")}
          </text>
        )}
      </svg>
      <ul
        aria-label={locale.t("chart.legend")}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          listStyle: "none",
          padding: 0,
          margin: "8px 0",
        }}
      >
        {data.series.map((series, index) => (
          <li key={series.id}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                marginRight: 5,
                background: colorPalette[index],
              }}
            />
            {series.label}
          </li>
        ))}
      </ul>
      <details>
        <summary>
          {locale.t("chart.dataTable", { count: data.points.length })}
        </summary>
        <div style={{ maxHeight: 280, overflow: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "right",
            }}
          >
            <caption>
              {locale.t(
                data.sampled ? "chart.captionSampled" : "chart.caption",
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left" }}>
                  {xLabel}
                </th>
                {data.series.map((series) => (
                  <th key={series.id} scope="col">
                    {series.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.points.map((point) => (
                <tr key={point.key}>
                  <th scope="row" style={{ textAlign: "left" }}>
                    {pointLabel(point)}
                  </th>
                  {data.series.map((series) => (
                    <td key={series.id}>
                      {point.values[series.id] === null
                        ? "—"
                        : exactNumber.format(point.values[series.id]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <span role="status" aria-live="polite">
        {message === undefined ? "" : locale.resolveMessage(message)}
      </span>
    </section>
  );
}
