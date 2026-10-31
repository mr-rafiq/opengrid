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

A total is a `RowNode` with `kind: "total"`, `total: "group" | "grand"` and aggregate values. Subtotals carry `parentId`; synthetic IDs avoid source-ID collisions. Totals cannot be edited, selected, pinned as source rows, or included in cell ranges; they remain keyboard navigable. The first visible column displays the total label and retains its aggregate if it has one. Labels and panel controls use the shared English/Spanish locale catalog. Print scopes `view`/`page` include projected totals; ordinary CSV/XLSX/PDF source exports do not add aggregate rows automatically.

## Explicit limits

Totals participate in existing flattened-row pagination, so a group and its subtotal can be on different pages. Sticky/pinned grand totals, selective callback placement, automatic blanking of group-header aggregates, integrated aggregate-function authoring, tree-data subtotals and server-calculated total-row responses remain open. The group header continues to display aggregates even when a subtotal is shown. The panel does not automatically hide grouped columns or implement the reference application's visibility lifecycle.

The playground's **Grouping lab** demonstrates drag/native controls, multi-level grouping, totals, filtering and aggregate sorting. The broader grouping family remains Partial while the remaining hierarchy/remote contracts are completed.
