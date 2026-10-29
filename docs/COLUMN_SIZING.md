# Column sizing

OpenGrid supports fixed widths, continuous container-based flex allocation, manual resize, explicit proportional size-to-fit, and an explicit rendered-text autosizing command. These APIs are original and are not a drop-in AG Grid API.

```tsx
import { useRef } from "react";
import { createGrid } from "@opengrid/core";
import { DataGrid, type DataGridSizingController } from "@opengrid/react";

const model = createGrid({
  rows: [{ id: "one", name: "Ada", notes: "First record" }],
  getRowId: (row) => row.id,
  columns: [
    { id: "name", field: "name", width: 140, pinned: "left" },
    { id: "notes", field: "notes", flex: 2, minWidth: 80, maxWidth: 700 },
  ],
});

export function Example() {
  const sizing = useRef<DataGridSizingController>(null);
  return (
    <>
      <button
        onClick={async () => {
          const report = await sizing.current?.autoSizeColumns(["notes"]);
          console.log(report);
        }}
      >
        Fit rendered notes
      </button>
      <button onClick={() => sizing.current?.resetWidths()}>
        Reset widths
      </button>
      <button
        onClick={() =>
          sizing.current?.sizeColumnsToFit({ excludeColumnIds: ["name"] })
        }
      >
        Fit grid, keep name width
      </button>
      <DataGrid model={model} sizingRef={sizing} />
    </>
  );
}
```

Try the **Column sizing lab** in the [interactive demo](https://mr-rafiq.github.io/opengrid/demo/).

## Flex and manual ownership

`Column.flex` is a finite positive relative weight. Visible flex columns share usable client width after fixed/manual columns and leading selection/drag controls. All physical pin regions participate in the same allocation. Minima and maxima constrain allocation; insufficient space produces horizontal overflow, while exhausted maxima leave unused space. Hidden columns do not consume width. The solver preserves canonical model order for fractional residuals in both directions.

Width defaults to 160 and minimum to 40; an explicit zero minimum is supported. `width` may accompany `flex`: it is the fallback before a positive viewport measurement and after a hidden container loses its measurement. A real positive container measurement, rather than the virtualization estimate, enables flex. Width updates from container measurement do not write model state or create history.

An own entry in `GridState.columnWidths` takes manual ownership and disables that column's flex. Dragging, keyboard resize, `model.resizeColumn`, state restoration and autosizing all use this rule. `sizing.current.resetWidths(ids?)` removes specified overrides in one model update; omit IDs to remove all overrides. Resetting restores flex or the configured fallback width. `getWidths()` returns a detached frozen visible-width map; React must have committed the latest model/layout change first.

The pure core `resolveColumnWidths(columns, { availableWidth?, leadingWidth?, columnWidths?, preview? })` provides the same allocation outside React. It returns frozen widths, IDs, flex IDs, total width, overflow and unused width. `getColumnWidthConstraints` and `clampColumnWidth` share model constraints. Allocation rejects invalid metadata and unsafe totals, with hard ceilings of 10,000 columns and one million solver visits; callers may lower work limits.

## Explicit proportional size-to-fit

`sizeColumnsToFit({ availableWidth?, excludeColumnIds? })` synchronously fits all visible columns, including physically pinned columns and columns outside the mounted horizontal window. Omit `availableWidth` to use the connected viewport's usable `clientWidth`; leading selection/drag controls are deducted once. A supplied width can deliberately differ from the container width. This is an explicit layout command; use flex for continuous container responsiveness.

Ratios come from each column's clamped configured width, defaulting to 160, independent of flex weights or manual/restored overrides. `model.getColumnWidthDefaults()` returns that frozen null-prototype record, including hidden columns. `getColumns()` continues to expose current layout widths. The pure `fitColumnWidths(columns, { availableWidth, leadingWidth?, columnWidths?, excludeColumnIds?, maxColumns?, maxWork? })` uses the supplied columns' configured widths; pass current widths separately only for excluded columns. The controller obtains original defaults from its model, so fitting is deterministic after manual edits or repeated commands.

Excluded visible columns keep their current committed widths. Hidden columns consume no space and retain their existing overrides. Exclusions must be unique known IDs; hidden known IDs are accepted but absent from the allocation. Positive configured widths scale proportionally within min/max bounds. A configured zero width with a zero minimum keeps its zero ratio. Insufficient space preserves minima and reports overflow; exhausted maxima or all-zero/all-excluded allocations report unused space. Fractional pixels are preserved, with canonical input order assigning floating-point residuals independently of RTL.

The frozen report contains `cancelled`, optional `cancelReason`, optional `allocation`, and `changedColumnIds`. Allocation includes frozen `widths`, visible `columnIds`, `fittedColumnIds`, `excludedColumnIds`, `totalWidth` including controls, `availableWidth`, `overflow` and `unusedWidth`. Every visible width becomes a persistent manual override, including excluded flex columns; freezing them prevents a later flex pass from changing the explicit allocation. Equal pixels can therefore add ownership. Hidden overrides remain intact. Changes publish together in one model update and preserve data undo/redo history. Repeated identical calls produce no update. Reset removes ownership and restores normal flex/default behavior.

The controller returns cancellation reasons `busy`, `disposed`, `unavailable` or `stale` without publishing. Editing, range/fill/resize gestures and managed row dragging are busy. A detached, hidden or zero-client-width viewport is unavailable even when a target width is supplied. A model, view, leading-control or container change during planning cancels stale output. Successful planning supersedes pending text measurement; invalid arguments throw without cancelling a valid pending text command. Callers must let React commit before reading `getWidths()` after a synchronous layout command.

The pure solver reuses the same 10,000-column ceiling and bounded weighted allocation as flex. Lowerable `maxWork` is checked independently in the validation and allocation phases. This does not measure cell contents, resize groups together, add per-call bound overrides or install an automatic initial-fit strategy. Remote wrappers still do not expose the imperative sizing ref.

## Explicit rendered-text measurement

`autoSizeColumns(ids?, { includeHeader?: boolean })` returns a Promise of a frozen report. Headers are included by default. Omitted IDs target rendered leaf columns, including pins; explicit IDs may also report hidden, unknown or unrendered columns. It measures default formatted text in currently mounted ordinary cells and leaf header labels, reserving padding, borders, gaps and sibling controls. Text probes copy bounded typography and language, contain plain text, and never clone interactive DOM or execute cell content.

The report distinguishes `measured`, `unchanged`, `skipped`, and `cancelled`. Each measurement includes `columnId`, new and previous widths, cell/header sample counts and whether manual ownership was added. An equal pixel width still adds an override if needed to disable flex. Already-owned equal widths produce no update.

Commands accept at most 64 targets, 2,000 total cell/header samples and one million text characters. The complete budget is checked before costly layout measurement or any width publication. All successful width changes publish together in one state update, outside data undo history. Each grid has a bounded 512-entry/256-KiB-character metric cache, invalidated by font loading events. A command during font loading returns `cancelReason: "fonts"`; retry after fonts settle.

Editing, active range/fill/resize gestures and managed row dragging make the grid busy. A new command supersedes its predecessor. Model updates, view/DOM/scroll/container changes, font events and unmount cancel stale work before writes. Commands read the last committed model/view snapshot while concurrent replacement renders are suspended. Cancellation reasons are `superseded`, `model`, `view`, `fonts`, `disposed`, `busy` and `limits`. Skips are `unknown`, `hidden`, `custom-renderer`, `unrendered`, `not-measurable` and `unavailable`. Invalid argument shapes throw. Treat a cancelled report as a request to retry deliberately after the relevant activity settles.

## Limits and remaining work

This is one explicit rendered-text sample, not an all-resident-data scan. Virtualized offscreen rows/columns and unloaded remote rows are not measured. Scroll them into view and request again to include their values. Custom `renderCell` grids are skipped, including their headers. Synthetic groups, full-width/detail rows and multicolumn span owners are excluded; a leaf header can still determine that column's width. Group headers do not determine child widths. Samples with transformed, perspective, scaled or zoomed ancestors are skipped as not-measurable, rather than mixing CSS and viewport pixel units. This conservative rule also skips pure translation transforms. Multiline/auto-height fitting, arbitrary renderer measurement and exact glyph shaping outside copied typography are not certified.

Continuous content-triggered autosizing, automatic initial-fit strategies, per-command bound overrides, shift/group resize distribution and runtime column-definition replacement remain open. Remote React wrappers do not yet expose this imperative sizing ref. Sizing is client React geometry, not a server-wide layout calculation. Physical pin semantics remain left/right in RTL. Automated Chromium and jsdom coverage does not imply manual screen-reader or physical-device verification.

The current reference comparison is [AG Grid column sizing](https://www.ag-grid.com/react-data-grid/column-sizing/), including its distinct flex, content autosizing and size-to-fit behaviors. The [parity ledger](FEATURE_PARITY.md) keeps this family Partial.
