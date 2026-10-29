# Integrated grid charts

`GridChart` is an original React/SVG chart panel that reads live values from an OpenGrid model. It provides bar, line and scatter views; configuration controls; a legend; a table of the displayed values; and an SVG download. It has no charting runtime dependency.

```tsx
import { GridChart } from "@opengrid/react";

<GridChart
  model={model}
  range={selectedRange}
  xColumnId="sector"
  yColumnIds={["revenue", "profit"]}
  type="bar"
  aggregation="sum"
  maxPoints={500}
  ariaLabel="Revenue and profit by sector"
/>;
```

The optional `range` uses the core `CellRange` shape, `{anchor:{rowId,columnId}, focus:{rowId,columnId}}`. Endpoints are stable row/column IDs, and reversed endpoints are supported. A range restricts both rows and eligible columns using the currently visible, flattened leaf-row model and visible column order. Collapsed/filtered/deleted row endpoints and hidden/deleted column endpoints invalidate the range and produce an empty chart. They never silently broaden it to all data. Pagination does not restrict a supplied range; the caller should supply the range selection model's actual page-bound endpoints when appropriate.

With no range, the chart reads **all filtered rows**, including descendants hidden by collapsed groups. Group/aggregate rows are not plotted as source data. Model edits, undo/redo, transactions, filtering, sorting, pinning and column visibility changes trigger recomputation through React's external-store subscription. The parent must pass a new range prop when its range selection changes; `GridChart` does not create a range selector itself.

## Configuration

| Prop          | Default and behavior                                         |
| ------------- | ------------------------------------------------------------ |
| `model`       | Required `GridModel<T>`                                      |
| `range`       | Optional `CellRange` or `null`                               |
| `xColumnId`   | First eligible visible column                                |
| `yColumnIds`  | First eligible column declared `type: "number"`, excluding X |
| `type`        | `"bar"`; also `"line"` and `"scatter"`                       |
| `aggregation` | `"sum"`; also `"avg"`; ignored by scatter                    |
| `height`      | 320 viewBox units; finite values clamped to 180–1200         |
| `maxPoints`   | 500; finite values clamped to 1–5000                         |
| `ariaLabel`   | `"Grid chart"`                                               |

Configuration props seed controls and update them when changed externally. Users can change chart type, X, up to eight Y series, and the aggregation through labelled controls. Explicit Y columns and user selections may use computed getters regardless of the declared column type, but only raw finite JavaScript `number` values are plotted. Numeric strings, BigInts, nulls, NaN and infinities are not coerced. This prevents hidden loss of BigInt precision.

Bar charts and lines aggregate repeated X values by sum/average. Categorical order follows first appearance in the sorted/filtered data; numeric lines sort X ascending. Scatter plots each source row separately and requires finite numeric X. Line paths break at missing numeric values. Zero/negative/constant domains are supported; scaling normalizes before subtraction to avoid overflow from opposite-sign extremes. An aggregate whose sum overflows JavaScript's finite number range is omitted rather than plotted as infinity.

## Sampling, access and export

Aggregation is calculated before point limiting. When there are more points than `maxPoints`, deterministic uniform index sampling keeps the first/last points when the limit is at least two. This **does not preserve intermediate extrema** and is not a statistical/financial fidelity guarantee. The panel reports the displayed and original point counts and warns when sampling is active. The table contains exactly the displayed values, not the entire unsampled dataset.

SVG uses a responsive `width="100%"` viewBox. The image has a title and description; data and series names also appear in the table and legend. Colors distinguish series visually but are not the only way to identify them. Automated component and browser checks are separate from manual screen-reader verification, which has not been performed.

The export button serializes the actual SVG into an `image/svg+xml` Blob and downloads `opengrid-chart.svg`. This is real SVG image export, not an XLSX/PDF export or a server request. Text is rendered with React and XMLSerializer escaping. Browser download failures produce a status message.

## Current limits

This is a tested integrated-chart slice, not AG Charts/AG Grid chart parity. There are no axes configuration panels, chart persistence schema, cross-filtering, zoom/pan, pivot chart configuration, regression/statistical series, annotations, tooltips beyond SVG titles, PNG/JPEG export, or dedicated date/time axis. Data labels are truncated visually at 15 characters; the table retains full labels. At most eight series are displayed. Objects/arrays and BigInts are unsupported X categories; dates are ISO category labels. The renderer is LTR and light-themed, with local panel styles independent of the grid's theme variables.

The pure `computeGridChartData(model, options)` export supplies the same bounded projection for application-specific rendering. It returns points, series labels, source/point counts, sampling status, numeric-X status and range invalidation status.
