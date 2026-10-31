# Row grouping and totals

OpenGrid has an optional resident row-group panel and filtered client aggregation. This is an original implementation guided by public [group-panel](https://www.ag-grid.com/react-data-grid/grouping-group-panel/), [total-row](https://www.ag-grid.com/react-data-grid/aggregation-total-rows/) and [group-sorting](https://www.ag-grid.com/react-data-grid/grouping-sorting/) behavior. It is not an AG Grid API compatibility layer.

```tsx
const model = createGrid({
  rows,
  columns: [
    { id: "team", field: "team", header: "Team" },
    {
      id: "amount",
      field: "amount",
      type: "number",
      aggregate: "sum",
      groupable: false,
    },
  ],
  getRowId: (row) => row.id,
  initialState: {
    groupBy: ["team"],
    groupTotalRow: "bottom",
    grandTotalRow: "top",
  },
});
<DataGrid model={model} rowGroupPanel="always" />;
```

## Panel and input

`rowGroupPanel` defaults to `false`; use `"always"` or `"whenGrouped"`. `RowGroupPanel` is also exported as a standalone component using the same model. Drag a leaf header into the panel, reorder chips, or use the native column selector/Add button and earlier/later/remove controls. These equivalent controls support keyboard and touch without drag gestures. A drag belongs to its model; a header from another grid cannot alter this panel. Group changes preserve column visibility, clear expansion and reset the page. Chip sorting cycles ascending, descending and cleared, with Shift retaining other sort keys.

`Column.groupable` defaults to true. Setting it false excludes a column from grouping controls and sanitized group state. Runtime definition replacement removes ineligible/removed grouping IDs. Header drag remains a native desktop workflow; touch dragging itself is not implemented.

## Sorting and totals

At each grouping level, sorting by that level's key compares the original typed values; sorting an aggregate column compares its filtered group aggregate. Custom column comparators and multi-sort apply. Blank values stay last in both directions. Ties retain source insertion order. Sorting unrelated leaf columns sorts leaves without reordering groups; clearing sorts restores source structural order. Tree-data ordering remains its separate path-based contract.

`GridState.groupTotalRow` and `grandTotalRow` accept `false`, `"top"` or `"bottom"`. Omitted values disable totals. Subtotals appear inside expanded client row groups, before or after their descendants. Collapsing a group removes its subtotal from the projection. Grand totals include all filtered source rows, including collapsed and off-page rows. Averages are calculated from source values rather than averaging child averages. Existing aggregate/BigInt numeric rules apply. Edits, history and filtering invalidate totals.

A total is a `RowNode` with `kind: "total"`, `total: "group" | "grand"` and aggregate values. Subtotals carry `parentId`; synthetic IDs avoid source-ID collisions. Totals cannot be edited, selected, pinned as source rows, or included in cell ranges; they remain keyboard navigable. The first visible column displays the total label and retains its aggregate if it has one. Labels and panel controls use the shared English/Spanish locale catalog. Data-row value formatters require a source record, so aggregate cells currently display plain text; dedicated aggregate formatting remains open. Print scopes `view`/`page` include projected totals; ordinary CSV/XLSX/PDF source exports do not add aggregate rows automatically.

## Explicit limits

Totals participate in existing flattened-row pagination, so a group and its subtotal can be on different pages. Sticky/pinned grand totals, selective callback placement, automatic blanking of group-header aggregates, integrated aggregate-function authoring, tree-data subtotals and server-calculated total-row responses remain open. The group header continues to display aggregates even when a subtotal is shown. The panel does not automatically hide grouped columns or implement the reference application's visibility lifecycle.

The playground's **Grouping lab** demonstrates drag/native controls, multi-level grouping, totals, filtering and aggregate sorting. The broader grouping family remains Partial while the remaining hierarchy/remote contracts are completed.

## Simultaneous remote branches

```tsx
const server = new ServerSideRowModel(source, {
  blockSize: 100,
  maxBlocks: 16,
  query: {
    rowGroupColumns: ["team"],
    valueColumns: [{ columnId: "amount", aggregate: "sum" }],
  },
});
<ServerTreeDataGrid model={server} columns={columns} />;
```

`ServerTreeDataGrid` complements the existing breadcrumb `ServerDataGrid`: it opens multiple branches together and keeps independent explicit **Load more in this branch** controls. Nested routes use server-owned keys; row IDs are qualified with their route, so an ID reused by different branches cannot alias another cell. Provider order, filtering and aggregates remain authoritative. Header sorting/filtering updates the provider query and resets expansion; `ServerSideSnapshot.queryRevision` advances even for a same-query reset, fencing prior request/view ownership. Collapsing a parent closes its descendants, while sibling branches remain open. RTL and ordinary grid arrow/Enter expansion work with the existing grid navigation.

Visible addresses are reserved with `ServerSideRowModel.setActiveBlocks(owner, addresses)`, and `releaseActiveBlocks(owner)` releases a consumer. Reservations across consumers cannot exceed `maxBlocks`; over-capacity expansion is rejected atomically and asks the user to collapse a branch. The cache never grows beyond its configured size. Unreserved incoming blocks can be evicted immediately if all slots are reserved; callers needing persistent cache residency must reserve their addresses. The existing breadcrumb binding also reserves its current address and releases it on unmount. Explicit refresh/purge and query changes still invalidate data as requested. Collapsing does not abort shared provider work; existing concurrency, pending limits and stale fences remain responsible for it.

A failed branch renders its own Retry control while successful siblings and retained cached data remain visible. Retry invokes a real refresh of that address. Unmount releases reservations; the shared model/provider lifecycle stays application-owned. `projectServerTree` is an exported framework-neutral bounded projection helper with node/loading/error/more/empty entries and the addresses needed by the current view.

This view is read-only: remote selection, notes, editing/writes, range/fill, automatic pivot schema, merged layouts and server-generated subtotal/grand-total responses remain open. Pagination is explicit per branch rather than automatic infinite subtree scrolling. Blocks are limited to 10,000 rows, expansion to 32 levels, projection to 128 blocks and 100,000 entries; configured cache capacity is usually the lower limit. Group keys must be unique within a route, including across blocks. Child counts describe immediate route children, not total descendant leaves. These bounds and automated Chromium evidence are not a throughput or physical-device certification.

The **Server grouping lab** demonstrates two expanded teams, route paging, retained-cache failure/retry, provider sorting/filtering and RTL.
