# Row spans

Client DataGrid merges adjacent eligible leaf cells vertically, with compact run geometry and owner-aware virtualization, editing, navigation and Find. Vertical spans and column spans use separate geometry; combining active row spans with any column-span definitions throws an explicit adapter error. This is a bounded original OpenGrid contract, not full reference API parity.

`Column.spanRows?: boolean | ((previous: T, next: T) => boolean)` selects adjacent current-view leaf rows. `true` compares raw `model.getValue` results using `Object.is`: no formatting, string/number coercion or deep equality. BigInt stays exact; NaN equals NaN; positive/negative zero differ; different Date or object instances differ. Supply a pure adjacent-row predicate for custom equality. A custom predicate bypasses the value getter and joins only when its result is strictly `true`; false, nonboolean and missing results split. Application getter/predicate errors propagate unchanged, without a partial published plan or failed-result cache.

## Planner API

```ts
const plan = createRowSpanPlan(rows, columns, {
  getValue: model.getValue,
});
const run = plan.ownerAt(visualRowIndex, columnId);
const visibleRuns = plan.intersecting(
  firstVisualRow,
  lastVisualRowExclusive,
  renderedColumnIds,
);
```

Each input `RowSpanRow<T>` contains `id`, `kind`, optional `data`, `region` (`top`, `body`, `bottom`), region-relative `top`, and base `height`. Optional metadata is `leaf` (default true), `depth` (default zero), `fullWidth` (default false), and `detailHeight` (default zero). Supply current visible, sorted, filtered, expanded, paginated and pinned projection order. Regions must occur in top/body/bottom order; their coordinates restart independently. Geometry cannot overlap and must remain finite, positive and within safe Number dimensions. A gap is a hard run boundary.

Synthetic groups, nonleaf rows, full-width rows, rows without data and rows with an open detail panel are isolated on both edges. Depth changes and pinned-region changes also split runs. Closed detail rows are ordinary eligible leaves. Parent/group boundaries must remain represented by their synthetic or nonleaf row, even if the application supplies a custom projection. Row spans never bridge pages or merge data outside the supplied view.

The returned frozen `RowSpanPlan` exposes `rowCount`, active `columnIds`, `mergedRunCount`, `ownerAt`, and `intersecting`. Only merged runs exist in the plan: singleton cells return `undefined`. A frozen on-demand `RowSpanRun` contains `columnId`, `ownerIndex`, exclusive `end`, `span`, stable `ownerId`, `region`, `top` and summed base `height`. Covered row positions resolve to the original owner. `intersecting` returns every merged run touching the half-open row interval, including owners before its start; optional column IDs restrict lookup to horizontally rendered fields. Unknown/ordinary field IDs are ignored. Empty windows return an empty frozen array. Returned records are value snapshots; their object identity is not stable across lookups.

All input/boundary/geometry checks finish before calling application getters/predicates. The plan copies run metadata and never freezes or mutates borrowed rows, row data or columns. It retains private typed arrays of merged run starts/ends/positions/heights and owner IDs. It does not retain an object per cell or materialize singleton runs. Construction is O(rows × active span columns); owner/window lookup uses binary search per requested active column plus returned runs.

Fixed maximums are 100,000 input rows, eight active span columns, one million row-column work units, 1000 rows per run and 100,000 supplied/requested column IDs. `maxRows`, `maxColumns`, `maxWork` and `maxRunRows` can tighten these caps. Work is charged before callbacks, including excluded rows. Longer equal runs split deterministically at the run cap; no predicate is called across that forced boundary. A request exceeding a resource cap throws rather than silently truncating. No runtime callback, geometry or plan cache outlives the caller's ownership; rebuild when data, view, layout or pure callback dependencies change.

## React behavior

One `aria-rowspan` owner retains its original logical `aria-rowindex`, stable row/column identity and summed height. Covered cells disappear from the accessibility tree and tab order; width-only presentation spacers preserve flex column positions. A run intersecting the vertical viewport keeps its original owner mounted in a skeletal ARIA row containing only retained merged cells, without unrelated row controls, values or detail content. The cell renders once. Its opaque owner-row background and layer cover later row backgrounds while preserving pinned-column and header occlusion. Pinned top/body/bottom bands clip independently. Merged text aligns at the owner's first row rather than the middle of a very tall run.

Focus, keyboard movement, Find, editor movement and restoration share owner lookup. Down skips to the run's exclusive end; Up resolves the row before its owner. Horizontal movement follows the anchor row in this initial slice. Page/Home/End navigation resolves owners rather than focusing absent covered cells. If a data/layout change covers an active editor's field, the draft cancels and focus returns to the new owner. Owner editing changes that actual row through the ordinary core API; it does not rewrite all covered rows. Enter resolves the next logical row against the newly committed run plan: splitting a run can reveal a new owner on the next row, while an unchanged run is skipped. Find searches displayed owners only, not hidden covered values.

Row selection remains independent per source row; the separate full-row edit form can edit all visible fields, including covered ones. Rectangular ranges, grid clipboard and fill are disabled as with column spans, with a visible status even when the toolbar is hidden. Native text clipboard inside editors remains available. Managed row moving is also disabled with a visible reason while row-span metadata is configured.

Run geometry reuses its index for unchanged snapshots and selection/column-width-only changes. Other model notifications rebuild it, including `expireValueCache()` and `setRows()` with the same resident row references. Use explicit refresh when pure getter/predicate closure dependencies change. State comparison is bounded and handles Date/BigInt operands without JSON serialization; unsupported or excessive state shapes conservatively rebuild rather than risking stale runs.

Automatic content-driven row height, row/column span combinations, merged CSV/XLSX/PDF output, remote server/viewport row-span binding and multi-row edits are outside this slice. A future two-dimensional planner would need to validate nonoverlapping rectangular footprints across both axes and preserve them through both virtual windows; independently composing the current planners can produce conflicting ownership and is not supported.

The public [AG Grid 36.2 row-spanning specification](https://www.ag-grid.com/react-data-grid/row-spanning/) describes adjacent equal-value rows, custom adjacent predicates and automatic-height integration. OpenGrid's bounded planner and API are original code, and automatic-height integration remains a documented gap.
