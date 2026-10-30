# Runtime column definitions

`createGrid` supports atomic replacement through `model.setColumns(nextDefinitions)`. Use stable, explicit IDs for columns that should retain view state. OpenGrid implements this contract with original code; the comparison reference is [AG Grid 36.2 updating definitions](https://www.ag-grid.com/react-data-grid/column-updating-definitions/), not API compatibility.

```tsx
const model = createGrid({
  rows: [{ id: "one", actual: 12, forecast: 18 }],
  getRowId: (row) => row.id,
  columns: [{ id: "amount", field: "actual", type: "number", editable: true }],
});
model.resizeColumn("amount", 240);
model.setColumns([
  {
    id: "amount",
    field: "forecast",
    header: "Forecast",
    type: "number",
    editable: true,
  },
  {
    id: "difference",
    valueGetter: (row) => row.forecast - row.actual,
    type: "number",
  },
]);
// amount still has its 240px override; future edits target forecast.
// Keep this model in useMemo/useState and pass it to <DataGrid model={model} />.
```

## State and ownership

Replacement validates the complete owned definitions and prospective state before installing them. IDs must be unique, nonempty strings; width/flex/span/cache/group-path checks are shared with construction. Configured widths and group paths are copied, and the internal definitions and default-width snapshot are frozen. Functions remain application-owned pure callbacks; this does not clone their external state.

Surviving IDs retain their manual order, width, visibility, physical pinning, sort/filter and grouping state where enabled. Width overrides clamp to the new minimum/maximum. Removed IDs lose those layout/query entries, so removing and later reintroducing an ID starts from its new definition defaults. New IDs append in declaration order after surviving manual order. Existing overrides take precedence over new definition defaults; use the ordinary layout setters/reset controller to change those overrides intentionally. This is one explicit-ID matching policy, without AG Grid field/object identity matching or initial/stateful attribute modes.

Data objects, selected resident row IDs, external filter and data undo/redo history remain. Pagination returns to page zero. The whole advanced-filter expression must still validate against the new schema; an incompatible referenced column/type rejects the replacement. Clear or replace that expression explicitly first. OpenGrid does not silently prune part of an AND/OR/NOT expression and change its meaning.

Accepted replacement increments `getColumnRevision()` once, expires cached getters and derived row/filter/group results, and publishes a fresh state snapshot. Ordinary sorting/layout/selection updates do not increment that revision. Invalid definitions leave the old revision, snapshot, caches and subscribers untouched. A reentrant model mutation during caller-definition preparation is preserved and rejects the outer replacement. Subscriber failures occur after publication and are not a distributed rollback guarantee.

## Mounted React behavior

The existing `DataGrid` stays mounted. Headers, grouped paths, render/format/parser/validator metadata and current columns use the new definitions. Row-span plans and automatic content-height estimates invalidate even if the IDs and row objects are identical. Find and range view subsets use authoritative current IDs while the React render catches up to a model notification.

Every accepted definition replacement cancels cell and full-row drafts, note dialogs, rectangular ranges and owned stale menus. Staged column-filter components remount; delayed owned filter/clipboard callbacks cannot apply through a changed definition revision. Invalid replacement does not cancel a valid draft. Source row selection and intentional outside focus remain. A cell editor blur that committed _before_ the application called `setColumns` is already a data edit; replacement does not undo it. Focus/keyboard traversal use the surviving current view, rather than writing an old draft into a newly mapped field.

A standalone `createRowEditSession` rejects commits and draft changes after a definition revision, including `conflictPolicy: "overwrite"`. Start a new session to use the new schema. Core range controllers clear their selection on a new revision even when the same IDs remain.

An empty definition list is supported. Where row-selection/drag controls remain, those real controls are the view. Without controls, the viewport contains one accessible “No visible columns” header and no data cells; resident source records remain and return when definitions are restored. That placeholder is not a data row or exported value. The English/Spanish catalog contains 472 typed keys.

## Other controllers and boundaries

`createAlignedColumns` captures a fixed shared schema and common constraints. A participating genuine grid revision detaches that link before stale propagation; recreate the link after all desired schema changes. Structural custom models without `getColumnRevision` retain the existing fixed-schema contract. This does not automatically align new columns or migrate an existing link.

Formula-grid and calculated-grid factories own compiled fixed schemas. Their models explicitly reject `setColumns`; recreate the factory and deliberately migrate formulas/data/layout until structural dependency rewriting is implemented. This prevents a same-ID field replacement from silently invalidating compiled references. This API does not add remote provider/result-column migration, pivot result-column authoring, definition diffs/column lifecycle events, field-based ID inference, automatic type inference or framework adapters.

The demo's **Runtime column definitions lab** replaces a field in one mounted model, adds/removes a column, keeps pinned/resized state, rebuilds same-ID spans, rejects malformed widths, switches Spanish/RTL and restores an empty view. Core, component and Chromium tests exercise actual data/edit/history/layout behavior; see [verification](VERIFICATION.md) for executed results.
