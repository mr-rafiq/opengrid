# Column spans

Client `DataGrid` renders row-dependent column spans through `Column.colSpan`, with owner-only cells, keyboard navigation, editable owners, Find and horizontal virtualization. [Row spanning](ROW_SPANS.md) is supported separately; active row and column spans cannot be combined in one grid. Server and viewport adapters do not implement this presentation contract; the server facade explicitly removes span metadata.

Model metadata is `Column.colSpan?: number | ((row: T) => number)`. Numeric spans are positive safe integers validated at model creation. The callback must be pure, returns a positive safe integer and runs only for uncovered owners of ordinary data rows. It receives the original row without freezing/mutating it. Covered callbacks, hidden column callbacks and synthetic group-row callbacks never run. Malformed callback results (including zero, negative, fractional, nonfinite and nonnumeric results) become one without coercion; thrown application callback failures propagate unchanged. A later call can recover; this helper retains no failed/cached state.

## Foundation API

```ts
const plan = createColumnSpanPlan(
  displayedColumns.map((c) => ({
    id: c.id,
    width: widthOf(c),
    pinned: pinOf(c),
    colSpan: c.colSpan,
  })),
  node.kind === "row" ? { kind: "row", row: node.data } : { kind: "group" },
);
const owner = getColumnSpanOwner(plan, logicalLeafIndex);
const entries = getColumnSpanWindow(plan, {
  scrollLeft,
  viewportWidth,
  leadingWidth: rowControlsWidth,
  overscan: columnOverscan,
  retainIndices: [focusedLeafIndex, editingLeafIndex],
});
```

Supply the current rendered leaf order: left-pinned, unpinned, right-pinned. Hidden columns are omitted before counting spans; original source indices remain available. The helper rejects interleaved pin regions. Column reordering, hiding, group-header collapse, pinning and resizing require a fresh plan. Spans cannot cross pin boundaries and are clipped to the remaining visible leaves in their region, including requests as large as `Number.MAX_SAFE_INTEGER`. Group rows always have span one; full-width rows bypass this planner entirely. Pinned ordinary rows can use the same planner.

Each `ColumnSpanCell` includes `start`/`end` visible leaf positions, `span`, `columnId`, `sourceIndex`, merged `width`, logical `offset`, normalized `pinned`, and sticky `leftOffset` or `rightOffset`. Left offsets exclude leading row controls; the renderer must add their width. Right offsets include only pinned leaves strictly after the complete span, not after its anchor. Every leaf maps through `ownerIndices` into exactly one cell. `getColumnSpanOwner` returns `undefined` for invalid/out-of-range indices.

Windowing operates on merged cells. If an anchor starts before the visible leaf window but its tail intersects, the whole owner remains mounted with its original logical width; viewport/pinned layers clip it naturally. Culled spans become full-width presentation-only spacers. `retainIndices` uses visible LEAF indices and keeps their owner once. Returned windows/cells/arrays are frozen; borrowed input columns/rows remain caller-owned. Widths use finite native Number pixel geometry without integer rounding; total width must remain within the safe numeric range.

Work and temporary geometry are O(c) for c supplied columns, independent of the requested span magnitude. Default input budget is 10,000 columns, configurable from 1 through a hard cap of 100,000; hidden columns count toward the budget. Callback invocations are at most the visible owner count. Retained leaf inputs have a 100,000-entry bound. React should build plans only for mounted rows and navigation targets, with a per-render cache; there is no reason to materialize spans for the full resident row dataset.

## React interaction

The grid renders owner cells only, with summed min/max/width and complete-span sticky offsets. Merged owners expose `aria-colspan`; logical `aria-colindex` and grid `aria-colcount` retain the underlying leaf positions, and covered leaf DOM is omitted. Headers and filters remain separate ordinary logical columns. Custom renderers, formatters, notes and cell editors belong to the owner column; covered values remain unchanged in the data model.

Right moves to the owner's exclusive end; Left resolves the previous leaf's owner. Up/Down/PageUp/PageDown resolve the target row's owner covering the same logical column. Home/End resolve the first/last owner. Ordinary Tab preserves the existing roving-grid exit behavior; editor Tab/Shift-Tab moves to adjacent owners. Focus scrolls a span wider than the viewport toward its leading edge. External data/layout changes remap covered focus to its new owner and cancel a draft whose field becomes covered or hidden before restoring focus.

Rectangular range selection, grid clipboard and fill are disabled whenever span definitions are present, including hidden definitions and constant one spans. A visible status explains this policy even with `toolbar={false}`. Ordinary row selection, owner editing and native text clipboard inside an editor remain available. The separate full-row edit form continues to edit all visible fields, including fields covered in the grid. Find skips covered cells before reading their values through the optional pure `FindOptions.isCellSearchable(position)` predicate. Model filtering/sorting and CSV/XLSX/PDF continue using the underlying logical fields; exports do not merge cells.

## Verification and remaining limits

Planner tests cover conditional spans, covered callback suppression, pin clipping/right offsets, fractional widths, hidden/reordered leaves, group-row bypass, frozen outputs, malformed results/errors, linear resource bounds and windows with offscreen origins. Component tests cover owner-only ARIA, resize/hide transitions, keyboard/editor/focus remapping, notes/Find, disabled bulk operations, pinned/full-width rows and lazy planning with 10,000 resident rows. A per-model-state LRU retains at most 256 row plans; mounted rows and navigation/search targets are calculated on demand. The ordinary no-span plan is shared. Refer to the [verification record](VERIFICATION.md) for executed complete-suite and browser results.

Combined row/column spans, auto-height merging, merged export formats and remote span layout remain unsupported. No manual screen-reader, touch-device or cross-browser conformance claim is made. Span callbacks must be pure; a changed external closure needs a model refresh to rebuild geometry. The current cache can recompute evicted rows rather than retaining the complete dataset.

Public specifications: [AG Grid 36.2 column spanning](https://www.ag-grid.com/react-data-grid/column-spanning/) describes per-row column spans, resizing and pin-region boundaries; [row spanning](https://www.ag-grid.com/react-data-grid/row-spanning/) describes merging adjacent equal-value rows and custom predicates. These APIs and planner implementation are original OpenGrid code; this slice does not implement vertical row runs, auto-height row merging or merged export formats.
