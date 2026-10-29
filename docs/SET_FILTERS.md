# Resident set-list filters

`SetListFilter` adds a staged, searchable checkbox panel to a resident client column. It uses the existing `in` predicate and composes with other column filters, quick search, advanced expressions and external predicates. It is original OpenGrid code; the public [set-filter overview](https://www.ag-grid.com/react-data-grid/filter-set/) and [data-update behavior](https://www.ag-grid.com/react-data-grid/filter-set-data-updates/) are feature references, not an API compatibility promise.

```tsx
import { createGrid } from "@opengrid/core";
import { DataGrid, SetListFilter } from "@opengrid/react";

const model = createGrid({
  rows: [
    { id: "a", department: "Office" },
    { id: "b", department: "Field" },
  ],
  columns: [{ id: "department", field: "department", header: "Department" }],
  getRowId: (row) => row.id,
});
const filters = { department: SetListFilter };

<DataGrid model={model} filterComponents={filters} />;
```

Use a stable registry/component identity. The grid supplies its source `model` through the optional `ColumnFilterProps.model` field; existing custom components remain compatible. A standalone panel needs the model, column, controlled `filter`, accessible `label` and bound callbacks. Without a model it shows an error rather than inventing choices.

## Drafts, search and updates

The column filter button opens a labelled native modal dialog, with a stable grid-root host when mounted in DataGrid, outside movable headers and the grid row tree. Its visible text matches its accessible column label; a Values tooltip describes the panel. Search narrows the choice list without changing the applied filter. Select matching values affects **all search matches across pages**. The list mounts 50 choices per page by default; a `pageSize` override is clamped to 10–200. Next/Previous controls bound the DOM without a custom listbox keyboard model. Choices are native labelled checkboxes. Escape and Cancel discard the draft and restore the launcher focus.

Only Apply calls the filter callback. An explicit empty selection emits `{ op: "in", value: [] }` and matches no rows. Clear stages an unrestricted draft; Apply then removes the column predicate. Selecting every checkbox explicitly still creates a fixed membership list, so later new values remain unselected. An unrestricted draft includes new values automatically.

The value index covers **all resident source rows**, including rows excluded by other filters or pagination. Choice counts describe that source, not current cross-filter availability. While the panel is open, model notifications rebuild the bounded index, including edits, undo, transactions, replacement and explicit value-cache expiry. Surviving explicit draft selections remain selected, newly introduced values stay unchecked, and removed keys produce a notice. Updating the index does not silently rewrite a committed filter. As with existing OpenGrid predicates, editing immediately recomputes filtered rows; this is not AG Grid's optional Excel-style deferred edit filtering.

External filter changes are compared by canonical membership, ignoring operand order, duplicate operands and cosmetic state clones. A clean draft follows a changed filter. A changed external filter conflicts with a dirty draft: Apply stays disabled until Reload or Cancel. Reload deliberately adopts the current committed filter. Other operators remain applied and show an unsupported-model message; Clear followed by Apply can explicitly remove them. Callback errors retain the draft and show an alert. DataGrid also supplies a fresh getFilter read so a lagging controlled mirror cannot hide an external change. An unchanged source accepts a mirror catching up; read errors retain the draft and block publication until recovery. Standalone controls without getFilter keep their controlled-filter semantics, with model supplying resident choices. Native dialogs set their own language for nested locale providers.

## Identity and formatting

Display labels do not define membership. The index preserves the core's existing comparison rules: case-folded text, exact BigInt values, finite typed numbers, date timestamps, boolean normalization and distinct positive/negative zero. Date operands are returned as immutable ISO strings rather than exposing mutable Date objects. First-seen source order and first representative formatting are retained. Colliding display labels include a canonical value/type hint; the demo's two large integer budgets intentionally share one formatter label.

Raw `null`, `undefined` and empty strings share a blank key. Invalid values in typed number/BigInt/date columns also compare as null in the existing core, so they appear in **Blank or invalid**, with an invalid-value count. Selecting this bucket includes both cases; it is not a raw-blank-only operator. Arrays and complex objects are unsupported, and Date objects require a date column.

## Framework-neutral value index

```ts
import { createSetFilterIndex } from "@opengrid/core";

const index = createSetFilterIndex(model, "department");
const entry = index.entries[0]; // frozen key, value, label, count, blank, invalidCount
const key = index.keyOf("OFFICE");
model.setFilter("department", { op: "in", value: [...index.values([key])] });
```

`keyOf` also normalizes absent operands; `values(keys)` rejects unknown keys and returns frozen canonical primitives, deduplicated in request order. The immutable index has `columnId` and `rowCount`. It installs no subscriptions or global caches: rebuild it after source/getter changes. Values are read through `model.getValue`, so cached getters retain the model's explicit expiry contract. A source change during index construction is rejected.

The normal in-memory `getState`/`setState` contract retains these operands. Plain JSON is not a universal serializer for BigInt, negative zero, NaN or Infinity; use an application-owned typed format when persisting them. Unified versioned state migration remains a separate gap.

Default hard bounds are 100,000 resident rows, 10,000 distinct values, 4,096 characters per value and label, and 2,000,000 aggregate stored key/value/label characters. `SetFilterLimits` can lower these bounds. Invalid limits, unsupported values, invalid formatter results, stale construction and exceeded budgets throw `SetFilterIndexError`; the panel displays the error and disables Apply without truncating or replacing the last filter. The `code` is one of `COLUMN`, `LIMIT`, `UNSUPPORTED`, `FORMAT`, `KEY` or `STALE`. English core diagnostic text is not a complete structured-localization contract.

## Example and limits

Open **Set-filter lab** in the [interactive demo](https://mr-rafiq.github.io/opengrid/demo/). Its 240 rows demonstrate 120 paged tags, case-folded categories, exact BigInt label collisions, blank/invalid date comparison, native keyboard/touch controls, Spanish UI and RTL layout. Queue source update or Queue filter conflict before opening Category to observe an incoming update while a modal draft is active. Timers are one-shot and cancelled on unmount/reset.

This is a bounded resident scalar set list. Tree lists, array-valued cells, custom complex-value key creators, remote/asynchronous distinct-value loading, filtering available choices by other columns, Excel modes and complete column/context menus remain open. Use [independent named filters](MULTI_FILTERS.md) for bounded staged child composition. Automated Chromium and component checks do not certify physical devices or manual screen-reader behavior. See the [gap inventory](GAP_INVENTORY.md) and [executed verification](VERIFICATION.md).
