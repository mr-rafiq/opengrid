# Typed column conditions

`ColumnConditionFilter` supplies a staged, native modal editor for one column's scalar conditions. It supports typed operators and flat AND/OR groups. Changes publish together on Apply; Cancel and Escape discard the draft. This is an original API, separate from independently configured MultiFilter panels and the nested advanced-filter builder.

```tsx
import { createGrid } from "@opengrid/core";
import { ColumnConditionFilter, DataGrid } from "@opengrid/react";

const model = createGrid({
  rows: [
    { id: "a", amount: 20 },
    { id: "b", amount: 40 },
  ],
  getRowId: (row) => row.id,
  columns: [{ id: "amount", field: "amount", type: "number" }],
});

model.setFilter("amount", {
  op: "and",
  conditions: [
    { op: "gte", value: 20 },
    { op: "lt", value: 40 },
  ],
});

export function Example() {
  return (
    <DataGrid
      model={model}
      filterComponents={{ amount: ColumnConditionFilter }}
    />
  );
}
```

Try the **Column conditions lab** in the [interactive demo](https://mr-rafiq.github.io/opengrid/demo/). The example includes keyboard commands to simulate incoming row/filter changes while a native modal is open.

## Scalar and compound models

`ScalarFilter` preserves the existing scalar model. `CompoundFilter` has `op: "and" | "or"` and `conditions: readonly ScalarFilter[]`. `Filter` is their union. Flat groups accept **1–16 conditions**; they do not nest. Use the advanced `FilterExpression` AST for nested AND/OR/NOT logic. Its condition leaves remain scalar, so composition has one unambiguous owner.

New compound groups validate, detach and freeze their records, conditions and membership arrays before client state publication. They accept primitive operands; pass ISO strings for dates. Date objects, arbitrary object-identity values, accessors, cycles, sparse/custom arrays, unexpected fields and nested groups are rejected. Limits are **10,000 aggregate IN operands** and **256,000 aggregate operand-text characters**, including BigInt decimal text. A rejected group leaves filters, selection, pages, history and notifications unchanged.

The core exports `prepareColumnFilter`, `prepareColumnFilters`, `prepareCompoundFilter`, `COLUMN_FILTER_LIMITS` and `ColumnFilterValidationError` with `code` and `path`. Legacy standalone scalar operands retain their established comparison/ownership behavior. Operator accessors are rejected without invocation. Prefer replacing filter models rather than mutating legacy operands.

`notContains` is the negation of the existing case-folded `contains`. A nonempty needle therefore matches blank text; an empty needle matches nothing. Combine it with `notBlank` to exclude blanks. This documents OpenGrid's choice rather than promising identical reference blank handling. Exact BigInt and signed-zero membership retain the existing comparison semantics.

Client calculations compile each group's child predicates once per calculation, including membership indexes. The public `matchesFilter` remains a live check; compiled predicates own a detached calculation snapshot. There is no global result cache.

## Editing and conflict handling

Register the component through `filterComponents`. Its optional `maxConditions` defaults to four and accepts 1–16. Keep a configured wrapper component's identity stable across renders. DataGrid also supplies this editor for externally installed compounds; once a column uses it, the launcher remains after Clear for that model. Switching the model resets this inferred UI ownership. Existing scalar default inputs retain their normal behavior.

Text columns offer contains/not-contains, equality, prefix/suffix, membership and blank operators. Number, BigInt and date columns offer comparisons, inclusive ranges, membership and blanks. Boolean columns use native True/False selection or membership/blank operators. Numeric input must be complete and finite; BigInt input must be a complete integer. Reversed bounds and invalid values retain the draft and applied filter.

IN operands use a bounded JSON array editor. Quote integers beyond JavaScript's safe integer range on BigInt columns, for example `["9007199254740993"]`; an unsafe JSON number is rejected. `[-0]` preserves negative zero. `null` selects the comparator's blank value. JSON objects and nested arrays are unsupported. The panel also caps raw draft text at 256,000 characters; a source that cannot be represented within its typed/raw-text limits remains intact until explicit replacement.

Calendar choices set a **midnight UTC instant**. The accompanying ISO text field preserves a supplied timestamp and offset. Comparisons use JavaScript millisecond timestamps; choosing a date does not truncate all row values to calendar days. Date-only ISO strings compare at midnight UTC. A typed legacy Date/Date-array source can seed a precise draft; unchanged Apply preserves its original representation, while edits emit ISO operands. Untyped object identity is not silently rewritten.

Row-only updates preserve a dirty draft. A different externally applied filter blocks Apply and retains the staged operands. Reload discards the draft and reads the current filter; Replace explicitly accepts the current source as a new baseline while retaining a supported draft, or starts a new condition for an unsupported source. Clear explicitly clears the current column filter. An unchanged Apply closes without publishing a rewritten model. Callback failures keep the dialog open. Model, column, type and configured-limit changes end the old editing context.

The shared locale provider translates controls and stored notices. Native dialog focus and drafts survive language/direction changes. Built-in condition and set-list dialogs use a stable host within the grid root, outside movable/virtual header nodes and the grid row tree. Their own language attributes support nested locale providers. Popup clipboard/pointer interactions do not activate parent grids, including grids nested in detail rows. Application headers and legacy callback messages remain application-owned. The existing range control preserves compounds with disabled bounds until explicit Clear. Set-list dialogs retain their unsupported-source guard rather than silently erase grouped conditions.

`ColumnFilterProps.getFilter?: () => Filter | undefined` supplies an authoritative current read when a controlled mirror can lag. DataGrid passes a fresh model read; its optional `getColumnFilter(columnId)` overrides this for an adapter. ServerDataGrid reads the provider query directly. Source changes block stale writes, getter failures retain the draft without calling setters, and a controlled mirror catching up to an unchanged source does not create a conflict. These reads guard popup operations and do not replace rendered model state.

Standalone set-list filters without a getter retain their existing controlled-filter semantics: their optional resident model supplies choices. A standalone condition filter uses its model's column filter when a model is supplied, otherwise the controlled prop; an explicit getter takes precedence. Closed condition dialogs avoid source getter/fingerprint work. Typed invalid data can compare as null under existing comparator rules, while blank/notBlank examine raw blankness; membership with null and the blank operator need not select the same invalid values.

## Remote query ownership

Infinite, server-side and live-viewport stores prepare compound queries before transport cloning, query replacement, cache invalidation or abort. Rejected input preserves pending requests, loaded data, callbacks and snapshots. Provider requests and public query copies remain detached from private state. The infinite store also clones both sorting and filter input before invalidation, so a clone failure cannot destroy a working query.

Providers must evaluate these models themselves; the stores do not implement a backend query language. BigInt serialization across an actual network is the application's responsibility. These guarantees do not add editable remote rows, server-wide selection or mixed-route expansion.

## Remaining scope

Independent MultiFilter panels, complete column/context menus, arbitrary custom operators, configurable blank policies, locale-aware numeric parsing, relative/named date ranges, date-day comparators and custom calendar components remain open. The JSON membership editor is distinct from the resident set-list checkbox workflow. Nested per-column groups are intentionally outside this flat model; use the advanced AST. Automated browser checks do not establish manual screen-reader or physical-device coverage.

The feature specification comes from the public [filter conditions](https://www.ag-grid.com/react-data-grid/filter-conditions/), [text filter](https://www.ag-grid.com/react-data-grid/filter-text/), [number filter](https://www.ag-grid.com/react-data-grid/filter-number/) and [date filter](https://www.ag-grid.com/react-data-grid/filter-date/) documentation. The [parity ledger](FEATURE_PARITY.md) keeps these families Partial.
