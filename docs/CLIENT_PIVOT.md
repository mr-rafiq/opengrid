# Client pivot tables

Created by Mohamed Rafiq. OpenGrid's client pivot matrix is an original, bounded implementation with its own API. Try **Pivot table** in the [participant showcase](https://mr-rafiq.github.io/opengrid/showcase/) after this source release is deployed. Packages are available from source/local tarballs; this does not announce an npm release.

## React composition

```tsx
import { useState } from "react";
import type { GridModel, PivotConfiguration } from "@opengrid/core";
import { DataGrid, PivotPanel, useClientPivot } from "@opengrid/react";

function SalesPivot<T>({ source }: { source: GridModel<T> }) {
  const [configuration, setConfiguration] = useState<PivotConfiguration>({
    rows: ["country"],
    columns: ["product"],
    values: [{ columnId: "revenue", aggregate: "sum" }],
    rowTotals: true,
    grandTotal: true,
  });
  const pivot = useClientPivot(source, configuration);
  return (
    <>
      <PivotPanel
        model={source}
        configuration={configuration}
        onConfigurationChange={setConfiguration}
      />
      {pivot.error && <p role="alert">{pivot.error.message}</p>}
      {pivot.status === "empty" && <p>Add a field to Values.</p>}
      {pivot.status === "ready" && pivot.model && (
        <DataGrid
          model={pivot.model}
          pinnedBottomRowIds={pivot.pinnedBottomRowIds}
          height={480}
          toolbar={false}
          pagination={false}
          notes={false}
          selectionMode="none"
        />
      )}
    </>
  );
}
```

`source` is the caller-owned `GridModel<T>`; field names are **column IDs**. Host the panel beside the matrix on desktop, or in an accessible modal drawer on mobile. The showcase supplies a native drawer with Escape, focus return, contained scrolling and touch alternatives. The generic panel does not create a drawer itself.

`useClientPivot(source, configuration, { enabled?, limits?, labels? })` returns `status` (`disabled`, `empty`, `ready`, `error`), `model`, `report`, `error` and `pinnedBottomRowIds`. A disabled hook skips report construction. Error/disabled views return no model; errors clear the previous output rows. Render the model only for a ready report. The report/model include one grand-total row when configured; pass its IDs to `DataGrid` to pin it once. Result columns are read-only, ungroupable and unfilterable. Columns start unpinned so narrow screens can scroll complete values into view; applications/users may pin them explicitly. A grid with all visible columns unfilterable omits its otherwise empty filter band.

The output model retains stable-ID column widths, order, pinning and sorting on source refresh. Source rows, definitions, filters, edits, selection and undo history stay caller-owned. Returning to Records in the showcase retains its mounted source grid. Source filters apply **before** aggregation; output sorting orders result rows. Pivot configuration is controlled React state, separate from `GridState`; persist it explicitly if wanted. Creating a new source model creates a new output model.

## Field controls and totals

Rows and Columns each support up to eight distinct dimensions; Values supports up to sixteen distinct source column IDs. A field moves between Rows and Columns. A Values field may also be a dimension (for example, country/count). Define source aliases with distinct IDs to show several operations over one field. Panel numeric choices are sum, average, minimum, maximum and count; text/boolean/date fields offer count. Numeric aggregates use finite numbers or BigInts and ignore other source values, matching the core aggregation contract. Count includes every source record.

The panel supports native source-owned dragging from Available fields, zone drop, chip reorder, native select/Add, move earlier/later and remove. Foreign-model drags are ignored. Its immediate changes build and validate the proposed matrix before calling `onConfigurationChange`; a failure displays an alert and preserves the applied configuration. A later source schema/data change may invalidate a previously valid configuration; the hook then hides stale output and returns its error. Clear fields produces an explicit empty Values state. `rowTotals` and `grandTotal` default to true.

All totals recompute from original filtered records. Averages use the eligible numeric source values, rather than averaging displayed group averages. Count includes all source entries, matching the core aggregate contract. Empty sum/count is zero; empty min/max/avg is blank. Source `aggregateFormatter(value, context)` formats each measure and receives the selected operation plus immutable row-free group/total metadata; the source-row `valueFormatter` never receives a synthetic pivot row. Dimension formatters receive real source records. Raw numbers/BigInts remain numeric for sorting; BigInt average follows core integer-division semantics. Mixed BigInt/number aggregates, non-finite overflow and unsupported dimensions produce explicit errors.

## Pure report and CSV

```ts
import { buildClientPivotReport, exportClientPivotCsv } from "@opengrid/core";

const report = buildClientPivotReport(source, configuration, {
  limits: { maxColumns: 128, maxCells: 100000 },
});
const csv = exportClientPivotCsv(report);
```

Reports contain frozen configuration, column metadata, result rows, optional `grandTotal` and `sourceRowCount`. Cells hold detached raw aggregate values; `display` holds formatted snapshots. Column IDs are opaque stable strings, independent of display labels. Category identities distinguish null, undefined, strings, numbers, signed zero, booleans, BigInts and valid Dates (detached ISO values). Objects, symbols and invalid Dates are rejected. Duplicate formatted labels get stable ordinal suffixes; a category named Total does not merge with the totals header. Identifiers are safe for prototype-like strings and delimiters.

CSV includes full grouped header paths, configured row totals and the grand total. It uses the shared CSV quoting and spreadsheet formula-neutralization policy. It is a genuine CSV export, without an XLSX/PDF pivot export claim. No Values means an empty report, not invented totals.

## Bounds and remaining work

Default limits: **100,000 filtered source rows, 10,000 result rows, 256 result columns and 200,000 result cells**. Limits are checked as buckets grow; a rejected result is not a truncated report. Optional limits can tighten these and have hard ceilings of 1,000,000/100,000/2,048/2,000,000 respectively. Larger source limits can consume substantial time/memory because this synchronous implementation runs in the calling thread. The showcase does not override defaults or claim a benchmark.

This milestone renders a **flat matrix with multiple row-dimension columns**, grouped result column headers, sortable numeric values and pinned grand totals. Hierarchical pivot row expansion, intermediate pivot subtotals, server-backed pivot schema changes, custom aggregation functions, post-aggregate filtering, chart cross-filtering, derived result editing and automatic state persistence are not supplied. Client pivoting remains **Partial** in the parity ledger. The older `pivot()` analytics utility remains available separately.

Use `labels` for report labels/operation names and `panelLabels` for control text; column headers and source formatting remain caller-owned. Theme tokens, Minimal/Material presets, keyboard focus and reduced-motion behavior are shared with the grid. Browser tests cover pointer dragging, keyboard/native and emulated touch controls; no physical-device or screen-reader verification is claimed.
