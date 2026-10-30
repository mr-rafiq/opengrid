# Rectangular merged cells

Client DataGrid can combine `Column.colSpan` and `Column.spanRows`. The original owner is the only rendered cell for the rectangle, with both logical ARIA spans. Its width sums the covered visible columns; its height sums the eligible adjacent rows. This is an original bounded OpenGrid contract. Content-driven height, merged clipboard/export formats and remote merged layouts remain open.

```tsx
import { createGrid } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

const model = createGrid({
  rows: [
    { id: "a", region: "North", team: "One", amount: 10 },
    { id: "b", region: "North", team: "Two", amount: 20 },
    { id: "c", region: "South", team: "Three", amount: 30 },
  ],
  getRowId: (row) => row.id,
  columns: [
    {
      id: "region",
      field: "region",
      colSpan: 2,
      spanRows: true,
      editable: true,
    },
    { id: "team", field: "team" },
    { id: "amount", field: "amount", type: "number" },
  ],
});

export function Example() {
  return <DataGrid model={model} />;
}
```

North is one two-column, two-row owner. Its covered team fields and the second region field remain unchanged in source data. Try the **Combined spans lab** in the [interactive demo](https://mr-rafiq.github.io/opengrid/demo/) for editing, changing footprints, pinning, RTL, Find and scrolling through a tall rectangle.

## Ownership and boundaries

Horizontal planning runs first for each needed row. A vertical run can extend only when the same owner column covers exactly the same visible leaf interval in the same pin region on the adjacent row. A changed footprint ends the old rectangle before a new owner begins. A row on which the field is horizontally covered cannot contribute a vertical run for that field. Covered column-span callbacks and covered vertical predicates/value reads are suppressed.

`spanRows: true` retains raw `Object.is` comparison. Custom adjacent-row predicates retain strict-true semantics and bypass the value getter. The [row-span](ROW_SPANS.md) and [column-span](COLUMN_SPANS.md) guides describe those independent contracts. Vertical joins still stop at synthetic groups, nonleaf/full-width/detail rows, depth changes, geometry gaps, pinned-row bands, pages and forced run limits. Horizontal spans still clip at physical column pin boundaries. Hidden columns do not count in footprints; headers and filters remain separate logical columns.

Sorting, filtering, reordering, visibility, pinning and source edits can change footprints. The grid rebuilds topology for those changes. Pixel-width and selection-only updates preserve unchanged vertical topology; horizontal pixel geometry is recalculated separately. Direction changes rebuild combined topology. Callbacks must be pure and stable for their declared data dependencies. Use a model refresh such as `expireValueCache()` when external callback closure inputs change.

## Rendering and interaction

An owner keeps its original row/column indices and exposes `aria-rowspan` and `aria-colspan`. Covered cells disappear from the accessibility tree and tab order. A rectangle touching both virtual windows retains its original owner even when that anchor is above the row window and before the horizontal window. The skeletal anchor row contains only the retained merged cells, without unrelated row controls, fields or detail content. Physical pin layers, header occlusion and row-band clipping remain in effect.

Navigation normalizes horizontal coverage before vertical ownership. Left/right skip a complete horizontal span; up/down skip or resolve vertical owners. Home/End, Find, editor movement and focus restoration use the same owners. Find omits both kinds of covered fields. Editing changes only the actual owner source row; it can split a rectangle. Undo restores source values and therefore the previous geometry. If incoming data covers an active draft, that draft cancels and focus returns to the new rectangle owner.

Row selection stays independent per source row. The full-row form can still edit visible fields that are covered in the grid. Grid rectangular selection, grid clipboard/fill and managed row moving remain disabled while span metadata is configured; a visible status explains the range restriction. Native text clipboard within an editor remains available. CSV/XLSX/PDF and ordinary print capture retain their documented logical-field output; they do not export these visual rectangles as merged cells.

## Planner and limits

`createCombinedRowSpanPlan(rows, columns, options)` returns the existing frozen `RowSpanPlan`: compact vertical runs, `ownerAt`, and `intersecting`. `CombinedSpanColumn` contains `id`, `colSpan`, `spanRows`, `pinned` and `hidden`. Columns use the same supplied inline pin order as the horizontal planner. `CombinedSpanOptions` adds `direction` and lowerable `maxCells` to the existing row-span options. Pair the result with `createColumnSpanPlan` for pixel geometry; the combined planner itself uses width-free topology.

`COMBINED_SPAN_LIMITS` exposes **100,000 projected row-column cells** and **10,000 input columns**. The cell budget counts every supplied row and column, including hidden columns. Existing limits remain **100,000 rows**, **eight active vertical-span columns**, **one million vertical work units** and **1,000 rows per run**; options can tighten them. Combined mode is deliberately stricter than independent spans, including when configured horizontal spans happen to return one. Exceeding a cap throws before application span callbacks rather than silently truncating layout.

DataGrid supplies its current visible leaf columns. A standalone caller retaining hidden columns in the planner input still pays their input-cell budget.

Column and row geometry/budget checks complete before application callbacks. Needed horizontal plans and raw default-comparison values are cached only during construction; each needed row/column value is read at most once in that construction. Rendering reads displayed values separately. The returned run index does not install a persistent value or application-callback cache. Borrowed row data and columns are not frozen or mutated. Application callback failures propagate unchanged and a fresh construction can recover.

## Remaining scope

Bounded client [automatic content height](AUTO_ROW_HEIGHT.md) is supported. Merged range/clipboard/fill semantics, merged import/export, arbitrary overlapping shapes and remote span layout remain unsupported. These fixed bounds are not a latency/memory certification. Automated Chromium, jsdom and axe checks do not establish manual screen-reader or physical-device conformance. The merged-layout family remains Partial in the [parity ledger](FEATURE_PARITY.md).

The public comparison sources are [AG Grid row spanning](https://www.ag-grid.com/react-data-grid/row-spanning/) and [column spanning](https://www.ag-grid.com/react-data-grid/column-spanning/). OpenGrid defines its own combined-footprint rule; the reference links do not establish equivalent APIs or behavior for every interaction.
