# Searchable choice editors

`editorOptions[columnId].type = "richSelect"` opens an original staged,
virtualized single-choice dialog. Unlike a native select, it searches named
choices and keeps at most 13 option elements mounted for 10,000 choices. Values
are exact strings, including identifiers larger than JavaScript's safe integer
range. This is a bounded React workflow; the editing family remains Partial in
the [feature ledger](FEATURE_PARITY.md).

```tsx
const markets = [
  { value: "9007199254740993", label: "São Paulo", name: "BR-SP" },
  { value: "9007199254740994", label: "Málaga", name: "ES-MA" },
  { value: "closed", label: "Unavailable market", disabled: true },
];

<DataGrid
  model={model}
  editorOptions={{
    market: { type: "richSelect", options: markets, searchMode: "contains" },
  }}
/>;
```

The column must be editable. Its parser and validator still own the model value;
use a string field/parser to retain exact identifiers. A column formatter supplies
the closed launcher label. Typing in the search box never changes the cell. Apply
choice commits through the ordinary validation/history pipeline; Enter also
advances to the next row using the grid's editing policy. A rejected value keeps
the picker open with its choice, query and validation message. Escape or Cancel
discards the staged choice. Opening, searching and arriving provider results do
not create edits or history entries.

With `editMode="row"`, each rich field initially has a closed launcher. Apply
choice stages and validates that field in the row session. Save row commits all
staged fields as one undo entry. Escape inside the nested choice dialog closes
only that dialog and returns focus to its launcher. It does not cancel the row
form. See [row editing](ROW_EDITOR_UI.md).

## Search and keyboard behavior

`searchMode` accepts `contains` (default), `prefix`, or `fuzzy`. Fuzzy matching is
an ordered Unicode-code-point subsequence, not scored typo correction. Matching
uses the provider locale, locale-specific lowercasing and accent folding on the
choice `label` and optional `name` alias. It never coerces or searches opaque
value IDs implicitly. Source order is preserved and duplicate labels are valid.

The focused search input is a combobox controlling a virtualized listbox.
Up/Down, Page Up/Down and Home/End move the active choice, skipping disabled
choices. Control/Cmd+Home/End retain native input caret behavior. The active
option remains mounted with logical `aria-posinset`/`aria-setsize`; manual list
scrolling does not silently replace it. Click/tap stages an available option;
Apply or Enter accepts it. Tab uses the native modal focus loop. Composition
Enter does not submit. Disabled or absent current values are preserved, but
Apply requires an enabled choice present in the current result list.

Each option is 36 CSS pixels high; the list shows up to eight rows with two-row
overscan on each side and one retained active option. Labels remain single-line
plain text with a title for overflow. Native list touch panning is retained.
English/Spanish UI, HTML language and inherited LTR/RTL direction can change
without replacing the open modal, search DOM, draft or focus. Choice labels and
application validation messages remain application text.

## Asynchronous loading

```tsx
const loadMarkets = useCallback(async (signal?: AbortSignal) => {
  const response = await fetch("/api/markets", { signal });
  if (!response.ok) throw new Error("Markets are unavailable");
  return response.json(); // Validate your API schema as well.
}, []);

<DataGrid
  model={model}
  editorOptions={{ market: { type: "richSelect", asyncOptions: loadMarkets } }}
/>;
```

The provider is called only while its picker is open. Keep its reference stable.
When both inputs are supplied, `asyncOptions` takes precedence. A failed or
malformed result displays a Retry choices action; retry starts a fresh request.
No selection is committed automatically. Accepted responses become owned,
immutable option records. Closing, replacing the owner/provider, retrying or
unmounting aborts the prior request and fences late results, including providers
that ignore the signal. Language-only changes rebuild the local search index
without requesting the provider again. This API loads a bounded complete list;
it does not send search text, implement server paging or cache across openings.

## Public primitives and custom hosts

`RichSelectEditor` exposes the picker without a grid. Required props are string
`value`, `label` and `onApply(value, { signal, reason })`. Optional props include
`options`, `asyncOptions`, `searchMode`, `displayValue`, `description`, `error`,
`disabled`, `autoOpen`, `contextKey`, `onCancel` and `onOpenChange`. `reason` is
`"apply"` or `"enter"`. Return false to retain invalid work; a promise is allowed.
There is one pending application at a time. Cancel, owner/source replacement and
unmount abort its signal and ignore a late result. A callback must honor the
signal for its own external side effects; the component cannot roll those back.

Changing `contextKey` closes old work. Re-enabling or restoring that owner does
not reopen it automatically; use the launcher or mount a new editor. `autoOpen`
runs once after client mount; server rendering never opens a modal or inspects
closed options. `displayValue` formats the launcher, not the selected ID.

`CellEditor` also accepts `editorType="richSelect"`, `searchMode`,
`editingContext="cell" | "row"`, a stable `contextKey` and
`onApplyValue(value, context)`. The built-in grid and row form supply this direct
callback. A custom controlled cell host without it must synchronously mirror
`onChange` into the editor's `value`; commit waits for that rendered value and
rejects work if ownership changes. Supply a stable context key when replacing
immutable row objects. Rich pickers use explicit acceptance rather than the
native editor's blur-to-commit behavior or custom `onKeyDown` policy.

`prepareRichSelectOptions(options, locale?)` returns an immutable index with
`options`, `locale`, `indexOf(value)` and `search(query, mode?)`. Search returns
frozen source indices. `RichSelectOptionsError` reports `code` (`SHAPE`,
`DUPLICATE`, `LIMIT`) and `path`. Inputs must be dense ordinary arrays of plain
records containing only own data fields `value`, `label`, optional `name` and
`disabled`. Accessors, unknown fields, subclasses, holes and coercion are
rejected. Values are unique strings; empty and special object-key strings work.
Do not mutate borrowed option arrays; replace their reference to update them.

`RICH_SELECT_LIMITS` currently permits 10,000 choices, 4,096 code units per ID,
16,384 per label/alias, 1,000,000 total original text units, 2,000,000 normalized
search units and 256 query units. Limits are resource bounds, not performance
certification. Invalid locale tags and unsupported search modes fail explicitly.

## Remaining scope and evidence

There is no multi-select, complex-object value mapping, custom option renderer,
remote query protocol, variable option height, highlighted match markup or
reference API compatibility. The native modal deliberately uses explicit
Apply/Cancel; it is not a reference popup lifecycle implementation. Manual
assistive-technology and physical-device verification remain open.

The demo's **Rich choice editor lab** exercises exact IDs, all search modes,
validation, disabled choices, provider failure/retry, language/direction changes
and atomic row forms. Unit/integration tests cover ownership, cancellation,
resource limits and controlled-host commits. Real Chromium covers native modal
focus, virtualized keyboard navigation and undo; executed results belong in the
[verification record](VERIFICATION.md). The public AG Grid
[rich select documentation](https://www.ag-grid.com/react-data-grid/provided-cell-editors-rich-select/)
and [customisation overview](https://www.ag-grid.com/react-data-grid/provided-cell-editors-rich-select-customisation/)
informed the feature inventory; this implementation and API are original.
