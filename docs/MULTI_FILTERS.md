# Independent column filters

`MultiFilter` combines independent named child controls in one staged column filter. Every active child must match; a child may itself contain a scalar condition or a flat AND/OR condition group. This is a bounded OpenGrid API, not reference API compatibility or complete multi-filter parity.

## Configure once

```tsx
import {
  ColumnConditionFilter,
  SetListFilter,
  createMultiFilter,
  DataGrid,
} from "@opengrid/react";

type Product = { id: string; region: string };
const RegionFilter = createMultiFilter<Product>([
  { id: "conditions", label: "Conditions", component: ColumnConditionFilter },
  { id: "values", label: "Values", component: SetListFilter },
]);

// Supply a GridModel<Product> as model.
<DataGrid model={model} filterComponents={{ region: RegionFilter }} />;
```

Create the configured component outside render, or memoize it with stable definitions. `MultiFilter` also accepts `definitions` directly alongside `ColumnFilterProps<T>`. Labels belong to the application and may be translated independently.

The parent opens a native modal. Each child manages its own controls and may open a nested modal. A child's Apply stages its model locally; only **Apply combined filter** changes the grid. Parent Cancel/Escape discards all staged changes. **Clear staged filters** resets the draft without immediately changing the query. Applying an entirely inactive draft removes the column filter. Filter changes do not create data-edit undo entries.

## Updates and conflicts

Source data updates refresh resident child controls without closing the parent. An external root-filter change preserves the staged children and locks parent Apply. **Reload applied filter** discards the draft and adopts the current source. **Keep staged filters** explicitly acknowledges the latest source while preserving the staged models. Apply checks the source again immediately before committing.

An already-open child can finish its local staging while the parent has a conflict. If its launcher became disabled, closing the child restores focus to an enabled parent action. Connected intentional focus is preserved. Changing language or direction retains the active controls and input focus.

A scalar, malformed or unknown-slot source is preserved until the user explicitly starts a new named draft and applies it. Source-read failures preserve both applied state and the draft; recover the getter before reloading or keeping. A callback failure leaves the modal open. Application callbacks remain responsible for their own side effects.

Without a registered multi-filter component, the default condition control preserves the unsupported named query rather than silently replacing it. Register the configured component to edit its children.

## Headless query model

```ts
import { prepareMultiFilter, type MultiColumnFilter } from "@opengrid/core";

const filter: MultiColumnFilter = {
  op: "multi",
  filters: [
    {
      id: "conditions",
      filter: {
        op: "or",
        conditions: [
          { op: "contains", value: "North" },
          { op: "contains", value: "South" },
        ],
      },
    },
    { id: "values", filter: { op: "in", value: ["South"] } },
    { id: "optional" },
  ],
};
const owned = prepareMultiFilter(filter);
model.setFilter("region", owned);
```

`ColumnFilterSlot` has a stable `id` and optional scalar/compound `filter`. Inactive slots impose no condition. An installed model with all inactive slots matches every row; `in: []` matches none. Remove a root with `model.setFilter(columnId, undefined)`.

Preparation owns and freezes the complete model. Live and compiled predicates use the same intersection semantics, including exact BigInt values. Infinite, server-side and viewport query snapshots own the transmitted child models; invalid input is rejected before cache invalidation. Providers must implement the transmitted semantics themselves. This does not add a remote distinct-value service.

Children accept primitive operands, including ISO date strings. Nested multi-filters, arbitrary objects, functions, symbols, accessors and sparse arrays are rejected. Blank operators need no operand. Legacy scalar Date/mutable-value behavior outside a multi-filter is unchanged. Validation errors use `ColumnFilterValidationError` with a code and path.

## Child component contract

Definitions require one to four ordinary dense records, unique nonempty IDs of at most 128 code units, nonblank labels of at most 256 code units and React component types. Definition metadata is copied and frozen; borrowed components are neither invoked during preparation nor frozen.

Each child receives only its slot through `filter`, `getFilter`, `onFilterChange` and `onClear`. The supplied model provides resident data reads. Custom controls own their private invalid drafts; the parent can commit only successfully staged models. Invalid emitted models retain the last good draft and block parent Apply until corrected or cleared.

`getFilter` is the authoritative synchronous source when supplied. The parent fences stale source snapshots, reentrant root callbacks and same-event invalid emissions. Closed/SSR controls do not read the source or render child components. Changing model, column ID/type/field, child IDs/order or component types closes old work. Label-only changes retain the session. Built-in messages participate in the 440-key English/Spanish locale schema and inherit layout direction.

## Bounds and remaining gaps

The limits are four children, 16 conditions per grouped child, 64 conditions in total, 10,000 membership values and 256,000 operand text code units, including BigInt digits. These resource ceilings are not performance certification.

Reference accordion/submenu/floating-filter display modes, cross-child faceted availability, nested multi-filters, tree/remote value lists and complete custom reference lifecycles remain open. No manual screen-reader or physical-device verification is claimed. The broad family remains **Partial** in the [feature ledger](FEATURE_PARITY.md).

Try **Independent multi-filter lab** in the demo for text/list intersections, precise BigInt filtering, external updates, read failures and Spanish/RTL transitions. See [verification](VERIFICATION.md) for executed checks.

The public [AG Grid multi-filter guide](https://www.ag-grid.com/react-data-grid/filter-multi/) supplies feature requirements for the v36.2.0 target. OpenGrid's schema, staging, ownership and conflict rules are independently designed.
