# Custom column filters

`DataGrid` accepts `filterComponents`, a registry keyed by column ID. Entries are
React component types, not renderer callbacks that are called as ordinary
functions. Registry and persisted filter lookups use own properties, including
for IDs such as `__proto__` and `constructor`. Nonfilterable columns do not mount
a filter control. Columns without an own registry entry retain the native input.

Each component receives `ColumnFilterProps<T>`:

```ts
interface ColumnFilterProps<T> {
  column: Column<T>;
  filter?: Filter;
  label: string;
  onFilterChange: (filter?: Filter) => void;
  onClear: () => void;
}
```

The grid binds the callbacks to that component's column and current model.
Updates use `model.setFilter`, which resets pagination, and reset the vertical
scroll position. Keep the component type stable between renders. Components
mount and update through React and may use hooks with normal cleanup; changing
the model remounts the filter owner. Hidden or unmounted controls read their
persisted model filter again on return. The grid retains the focused filter's
column during horizontal virtualization, for both native and custom controls.
Moving focus away releases that retention. Local invalid drafts need not survive
hiding, model replacement or unmounting; successfully applied model filters do.

Custom components own their validation and their accessible control labels.
Treat `filter` as controlled state and call `onFilterChange(undefined)` or
`onClear()` to remove it. Do not mutate the filter object or use component-local
state as an alternative source of truth for applied filtering.

## Inclusive range control

`NumberRangeFilter` implements this contract for number, BigInt and date columns.
Set `column.type` explicitly so the model and control use the same comparison
rules; untyped, text and boolean columns are not accepted by this control.
It provides labelled minimum and maximum inputs and a Clear button. Two bounds
emit `between`, a minimum alone emits `gte`, a maximum alone emits `lte`, and no
bounds removes the filter. Bounds are inclusive and are stored as raw strings
so large integers do not pass through JavaScript `Number`.

Finite decimal numbers, including complete exponent notation, are accepted.
BigInt bounds require complete integer strings. Date bounds use ISO calendar
dates or ISO timestamps and reject nonexistent calendar dates. Each bound is
limited to 256 characters; oversized or incomplete drafts stay visible instead
of being truncated. Reversed ranges, invalid operands and callback errors keep
the last successfully applied model filter and display an associated alert.
Unrelated model updates do not erase an invalid draft. External filter changes
resynchronize the controls, and Clear uses the bound grid callback.

The control can represent `between`, `gte`, `lte` and `equals` state. Other
external operators remain applied but show a message asking the user to edit a
bound or clear the filter before replacing it. Text and boolean columns are not
supported by this numeric/date range control; use another custom component.

This is one filter instance per column. Independent multi-filter instances,
their combined AND/OR editor, and AG Grid's multi-filter lifecycle/API are not
implemented by this registry. Use the separate advanced filter builder when a
compound expression across columns is needed.
