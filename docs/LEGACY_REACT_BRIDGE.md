# Experimental legacy React bridge

`Ag31ClientGrid` is a public resident-client bridge for selected measured AG Grid 31 contracts, including an explicit inline source-editing adapter. It is not an alias for `AgGridReact`, a complete compatibility layer, or certification that an existing application can replace its grid unchanged. Unsupported grid options fail explicitly.

[Open the working bridge lab](https://mr-rafiq.github.io/opengrid/demo/#legacy-react-bridge). This source release is available from the repository and its package tarballs; no npm publication is implied.

```tsx
import { useRef } from "react";
import { Ag31ClientGrid, type Ag31ClientGridHandle } from "@opengrid/react";
import "@opengrid/react/styles.css";

type Line = { id: string; phase: string; amount: number };
const columns = [
  { field: "phase", filter: "agSetColumnFilter" },
  { field: "amount", cellDataType: "number", filter: "agNumberColumnFilter" },
];
const getRowId = ({ data }: { data: Line }) => data.id;

export function Estimate({ rows }: { rows: Line[] | null }) {
  const grid = useRef<Ag31ClientGridHandle<Line>>(null);
  return (
    <Ag31ClientGrid
      ref={grid}
      gridOptions={{ getRowId }}
      columnDefs={columns}
      rowData={rows}
      height={300}
      onGridReady={({ api }) => console.log(api.getDisplayedRowCount())}
    />
  );
}
```

## Ownership and option updates

The ref exposes one owned `api` and `columnApi` graph. Row nodes retain original record and class identities, group ancestry, filtered/sorted children and selection state. Unmount destroys that owner and cancels queued events. React StrictMode creates a fresh owner after cleanup. Keep column definitions and default definitions stable; structural replacement and `groupSelectsFiltered` changes currently require remounting.

`gridOptions` supplies the same supported configuration as direct props. Defined props take precedence; an undefined prop preserves its option. Initially omitted rows and `rowData={null}` provide an empty resident projection and automatic loading, and read as undefined through `getGridOption`. Later null/undefined row options retain the existing resident rows and do not emit `rowDataUpdated`. Pass an actual empty array to clear records. Omitted definitions use a stable immutable empty schema, so the component can commit its ref and ready lifecycle without a false structural replacement. Changed rows are forwarded individually; unrelated renders do not overwrite an imperative context or callback change.

Supported configuration includes `getRowId`, `rowData`, `columnDefs`, `defaultColDef`, `context`, React `components`, native `initialModelState`, height/rowHeight, className/ariaLabel, multiple row selection, custom group display, filtered group selection, complete tree rendering and the native row-group panel. Measured false-only grouping policies and reactive-component mode are validated rather than silently approximated.

## Events and external filtering

The supported event options are `onGridReady`, `onSortChanged`, `onFilterChanged`, `onSelectionChanged`, `onModelUpdated`, `onRowDataUpdated` and `onColumnRowGroupChanged`. API listeners run before the corresponding option callback. The option is resolved when the queued event is delivered, so replacement or clearing before delivery takes effect. Event records carry the owned API, column API and context. This does not establish complete payload parity for every AG Grid event.

`isExternalFilterPresent` and `doesExternalFilterPass` work in initial options, direct props and `api.setGridOption`. A changed callback immediately refreshes the resident filtered projection. Returning true from the presence callback with no predicate excludes all leaves. Clearing the presence callback disables the external filter. If a stable callback closes over changed external state, call `api.onFilterChanged()` explicitly. Callback identity is retained by `getGridOption`; setting the same callback again does not reapply it.

## Available API surface

The typed ref exposes resident row/node traversal and selection, value and formatted-value reads, row transactions, column lookup/state, sorting/grouping state, refresh, supported option getters/setters, event listeners and destruction. Methods operate on this component's owned model. Transactions are local; they do not save backend changes. `refreshCells` refreshes the view without explicitly rerunning sort/filter stages.

Pinned columns release under viewport pressure with a 50px center reservation, alternating right/left candidates in current order, and do not automatically repin when the viewport grows. Native explicit pin locks remain enforced. Short schemas keep the inline-end pin band at the viewport edge in LTR and RTL without adding data/ARIA columns. Custom source components are isolated from native button/input styling; they remain responsible for their own accessible controls and styling.

## Resident source filter models

The typed ref exposes `api.getFilterModel()` and `api.setFilterModel(modelOrNull)` for enabled resident text, number and set filters. Operands are owned JSON snapshots, not native OpenGrid `Filter` records. Combined text/number conditions preserve the measured two-condition `condition1`/`condition2` fields alongside `conditions`. Unsupported date/multi/custom-component contracts fail explicitly. Unknown column IDs are ignored; null clears the source model. A source column must have filtering enabled in its definition or defaults.

```tsx
grid.current?.api.setFilterModel({
  amount: { filterType: "number", type: "greaterThanOrEqual", filter: 100 },
  phase: { filterType: "set", values: ["Planning"] },
});
const savedFilters = grid.current?.api.getFilterModel();
```

Source filter getters and set key creators receive original owned records/columns and current context. Set models use canonical resident keys, discard absent keys, preserve requested key order and clear when every available key is selected. Row replacement/transactions reconcile existing selections; keys removed from an active model do not return merely because the data later reappears. An empty-data set request clears. Set processing is bounded to 100,000 source rows, 500,000 key evaluations and four million key-text characters per column; keys are at most 4,096 characters, and requests total at most 50,000 selected keys. Supplied/remote/tree value services and their refresh variants are separate unfinished contracts.

Models intersect with the external Smart Search predicate. Whole-model application atomically replaces native column conditions and the combined external predicate; failed preparation retains the prior query/model. Direct native condition dialogs are not the source filter UI: `getFilterModel` explicitly rejects their unsupported serialization. Applying a native condition supersedes an existing source filter for the same column. Custom `useGridFilter` components, matching source popup/sidebar UI and complete saved-state translation remain open. The original collapsed demo example exercises only the documented ref APIs.

`api.setAdvancedFilterModel(null | undefined)` clears an existing native advanced expression while preserving column models and selection. An already-clear call does not refresh the model. `getAdvancedFilterModel()` returns null when clear and rejects serialization of an active native expression. Non-null source advanced expressions require a separate translator and fail explicitly; this is the clearing path used by saved-view helpers, not advanced-filter model parity.

## Loading and empty overlays

Initial nullable rows show loading; an explicit empty array shows the empty state, and loaded rows hide it. `api.showLoadingOverlay()`, `showNoRowsOverlay()` and `hideOverlay()` control the same owned state. `suppressLoadingOverlay` and `suppressNoRowsOverlay` apply to automatic and manual operations. `api.overlayService.isAlive()` reflects this owner's lifetime so deferred helpers can avoid destroyed overlays. It is a narrow lifetime contract, not access to AG Grid's internal services.

`loadingOverlayComponent`, `noRowsOverlayComponent` and their `...Params` accept React components or names in `components`. Parameter records/functions receive owned API, column API and context; configured parameters follow them. Components unmount on hide or destruction and remain responsible for their own styling and accessible content. Imperative replacement of overlay component registrations is not supported. `localeText.loadingOoo` and `localeText.noRowsToShow` localize the built-in messages; other source interface strings require their respective adapters.

Loading covers the grid viewport, including headers and pinned cells, blocks pointer input and sets `aria-busy` without taking keyboard focus. Empty overlays do not block grid pointer input. The source bridge suppresses the native empty-message fallback, so manual hide and suppression leave a blank grid instead of a second message. These operations subscribe independently of resident cells: showing/hiding/loading-label changes do not refresh mutated record values. Deferred application work still needs an explicit loading call; assigning null does not automatically restart loading after data has arrived. HTML template overlays and row fade animations are separate contracts. Open the collapsed loading example in the public bridge lab for manual loading, localization, custom content, nullable options and host resizing.

## Mounted scroll restoration

The measured legacy scroll helper path now delegates to the real mounted `DataGridViewController`:

```tsx
grid.current?.api.ctrlsService.params?.gridBodyCtrl.bodyScrollFeature.setScrollPosition(
  800,
  140,
);
```

`params` is available only while this owner's actual view is active. It is undefined before attachment and after detach/destruction. A previously captured service cannot scroll a retired owner. This is a narrow compatibility path for the measured helper, not a general registry of AG Grid internals.

Both offsets must be finite nonnegative pixel values. Fractions are preserved until the browser applies its own pixel rounding; browser geometry clamps values beyond the available scroll range. Commands do not rerun the source query, change selection or move keyboard focus. The original collapsed scroll lab uses 500 synthetic records, both axes, fractional offsets, host resizing and a deferred loading/restore/hide example. The final logical header's resize handle stays inside its content edge, including under virtualization, so its hit area does not add phantom scroll width.

This does not implement source `getState` / `initialState`, source logical-focus APIs or every viewport service method. Native row-ID focus/reveal semantics are different from the measured source numeric focus contract; do not substitute one for the other. Complete saved-view compatibility remains unfinished.

## Explicit viewport fit

`api.sizeColumnsToFit(width?)` fits displayed columns using declared width ratios and the mounted viewport's usable width. A numeric argument supplies an explicit nonnegative width. `suppressSizeToFit: true` preserves a column's current width and existing flex ownership. If all displayed widths already fill the viewport, fitting is a no-op and retains flex. Otherwise fitted columns take manual width ownership; `getColumnState()` reports their resolved width and null flex. Hidden columns are excluded. The source bridge uses integer CSS pixel allocation, respecting minimum/maximum bounds; fractional constraints can retain fractional widths. Minimum-width overflow remains intentionally scrollable.

This command returns OpenGrid's fit-report promise as an extension; legacy callers can ignore it. A fit issued immediately after autosizing waits for that owned measurement and uses its new manual widths, preserving the measured consumer command sequence. A later sizing command, view replacement or destruction revokes stale queued fitting. Zero width or an unattached/destroyed grid returns cancellation without a width publication. Invalid arguments throw before cancelling an existing sizing request. Per-command limit objects, deferred retries and automatic initial fit remain unsupported. The native API retains fractional allocation by default. The public sizing lab demonstrates explicit fit with an excluded Amount column.

## Mounted renderer sizing

`api.autoSizeColumns(keys, skipHeader?)` and `api.autoSizeAllColumns(skipHeader?)`, also available through `columnApi`, measure currently mounted leaf headers and ordinary/group cells. Keys resolve through the owned source column registry: IDs, source column objects and original definition identities are accepted; duplicates collapse and unknown keys are ignored. The all-columns command targets displayed columns. `skipHeader: true` omits leaf headers.

```tsx
const report = await grid.current?.api.autoSizeAllColumns(true);
if (report?.cancelled) {
  // Retry deliberately after the reported model/view/font activity settles.
}
```

The commands return OpenGrid's sizing-report promise as an extension to the measured legacy call shape; AG Grid 31 declares these calls as returning void. Existing callers can ignore the result, while OpenGrid callers can inspect cancellation and skipped columns. Sizing uses passive owned DOM plans, preserves flex/grid flow, adds the measured 20px source padding, applies column constraints and publishes widths atomically. It does not invoke application renderers, clone event handlers or instantiate custom elements for measurement. Normal React updates still occur when widths change; renderer state remains mounted. Each source request has an owned abort signal revoked immediately on destruction, detach, replacement or supersession; invalid commands do not cancel valid pending work.

Only mounted content participates. Unrendered/hidden columns, full-width/detail rows and multicolumn span owners do not supply samples. Media, SVG, inputs and custom elements contribute their existing rendered box, rather than a new intrinsic-resource measurement. The bounded controller can cancel for stale model/view/DOM, gestures, fonts or limits; it does not silently scan all resident rows or retry another viewport. Source `autoSizePadding` and initial sizing strategies are not exposed by this bridge yet. See [column sizing](COLUMN_SIZING.md) for budgets and report details.

Adopted hosts use their horizontal-padding/widget/icon tokens. Alpine hosts also retain the measured one-pixel body-font adjustment; ordinary source group rows use normal weight unless explicitly styled. Host header checkboxes retain their inset and original checked/mixed drawing; native input semantics, focus and coarse-pointer targets remain intact. This is scoped geometry adoption, not complete source-theme DOM compatibility. A private read-only React 18.3.1 fixture asserts equal widths for six mounted columns against installed AG Grid 31.3.4 using unchanged calculation renderers. That profile does not establish all-column, all-theme or full-application sizing parity. A separate autosize-then-fit profile preserves measured exclusions and remaining-space allocation in both engines, but its Order header measures 100px here versus 91px in the installed reference. Header/control geometry therefore remains a known sizing gap. The collapsed public sizing lab uses original local records, a stateful renderer, heading inclusion and a deferred reset example.

## Declared query and column reset

Resident `sort` / `initialSort`, sort indices and `rowGroup` / `initialRowGroup` defaults initialize the source query. Native `initialModelState` can explicitly override these native query fields; it is distinct from AG Grid `initialState`.

`api.resetColumnState()` and `columnApi.resetColumnState()` restore declaration order, visibility, pins, sort and grouping using measured regular/initial attribute precedence. A declared reset width is restored; an unspecified width retains its current size. Null regular reset values can fall back to initial values. Raw source sort indices, including signed safe integers and indices on unsorted columns, remain separate from the native normalized sort order. A direct native sort replaces its active indices with native order.

Filters, row selection and provided-header group state remain independent. Candidate groups are staged while query callbacks run and become committed owned nodes only after successful model preparation; a rejected grouping retains the prior graph and emits no group-change notification. The collapsed original demo changes a local layout and resets it through the public ref.

This is a static resident column-state contract. Full saved state, automatic sizing strategies and complete viewport/focus services remain separate unfinished requirements. It does not establish complete saved-view compatibility.

## Provided header groups

`api.getColumnGroupState()`, `setColumnGroupState([{ groupId, open }])`, `resetColumnGroupState()` and `setColumnGroupOpened(groupId, open)` control resident provided header groups. The same methods are available through `columnApi`. Explicit IDs remain stable; generated and padding IDs follow the measured construction order, and snapshots include nested groups in postorder. Reset restores `openByDefault`, while unknown IDs are ignored.

`columnGroupShow: "open" | "closed"` affects display without changing a leaf's own `isVisible()` or column-state `hide` flag. Therefore `getAllDisplayedColumns()` can exclude a column that is still visible in saved column state. Expansion availability follows currently visible children; nonexpandable groups show surviving columns and have no misleading toggle. Nested conditions compose, and identical captions retain distinct group identities.

The source group methods update the actual header/cell view without rerunning row queries. Keyboard toggle focus survives expansion, and pin pressure is reconciled for newly displayed columns. The original bridge example reveals an optional raw-value column and resets the group independently of leaf visibility.

This is bounded to static resident definitions, at most eight header levels, 1,000 source leaves and 9,000 header-tree nodes. Full source group objects/events, group drag/resize constraints, dynamic definition migration and complete saved-state restoration remain unfinished. Source host CSS/theme translation is separate.

## Host layout and theme

The consumer `className` now belongs to the actual outer source component. Omitted `height` follows a constrained flex host; explicit viewport heights retain their existing meaning. Host token adoption, live header metrics, accessible padding-header spans and exact limitations are documented in [resident host layout](HOST_LAYOUT.md). The source view omits native count/pager chrome; complete source custom status panels remain unfinished.

## Source decorations

`getRowStyle` receives the owned source node, original data, row index, API/column API and current context. It works in initial options, direct props and `api.setGridOption`; clearing it removes previous inline styles. An imperative callback change survives unrelated prop updates. `api.refreshCells()` reevaluates view decorations without explicitly rerunning sort/filter stages.

Column `cellStyle` records or callbacks, `cellClass` strings/arrays/callbacks and function-valued `cellClassRules` use owned column/value parameters. False rules disappear on refresh; source records and definitions are not rewritten. String rule expressions are rejected because an expression engine is a separate contract. Native row and column geometry takes precedence over corresponding style values.

`tooltipValueGetter` takes precedence over a dotted `tooltipField`. Nullish callback results clear the ordinary browser title rather than falling back to a stale value. This is plain-text browser-tooltip support, not the reference custom-tooltip component/lifecycle. Existing source CSS classes are preserved, but AG Grid DOM/theme selectors are not translated automatically.

## Inline source editing

The source bridge supports reactive inline `cellEditor` components and `cellEditorSelector`, registered component names, parameter records/callbacks and provided text/number editors. Editors receive owned API/column/node objects, the original data and typed value, `initialValue`, `eventKey`, `onValueChange`, `parseValue` and `stopEditing`. A custom editor's staged value is passed directly to its setter; the grid does not automatically apply `valueParser` to custom-editor values. Provided text/number editors parse once when committing. Column `suppressKeyboardEvent` runs before default keyboard behavior; an editor can stage a typed payload in its own Enter handler before closing.

`api.startEditingCell({ rowIndex, colKey, key? })` uses a displayed body row and the mounted viewport. `api.getEditingCells()` returns the current owned column and row index. `api.stopEditing(true)` cancels; an editor's `props.stopEditing(true)` commits while suppressing navigation. F2/Enter, printable keys and optional `enableCellEditingOnBackspace` enter editable cells. `suppressClickEdit` disables double-click/tap entry while retaining keyboard/API entry. Group editors require `enableGroupEdit` and the column's editable policy. Full-row, grid-managed popup editors, complete navigation policies, legacy imperative editors and hook-based editor lifecycle methods remain unfinished. Components that manage their own portals can call the same guarded reactive callbacks; this does not establish every external popup/focus contract.

Source `node.setDataValue` borrows the original data and never creates a native owned-row undo entry. Dotted fields retain nested object identity. A function `valueSetter` receives the typed payload; `undefined` and truthy return values count as success, including promises. A promise is **not** an acknowledgement: application persistence, errors, rollback and undo remain application responsibilities. Copy a submitted payload before an asynchronous boundary if needed: the measured reference replaces retained setter `params.newValue` with the canonical current cell value after a successful write. API writes skip `valueParser`.

A generated group has no original application record. Its first non-read-only write creates a separate plain data object before the setter reads its old value. This object survives retained-group presentation updates and does not replace or mutate a leaf record. Read-only requests do not allocate it. Applications must explicitly choose their group fan-out targets.

Row `cellChanged` notifications are synchronous and carry the submitted value, including no-op/false writes. Successful column callbacks and grid `cellValueChanged` notifications are queued in that order and carry the canonical current value. `cellEditingStarted`, `cellEditingStopped`, `cellEditRequest` and `cellKeyDown` are available as grid-option callbacks. `readOnlyEdit` emits a request without a setter or mutation; a start callback can call `api.stopEditing(true)` to cancel immediately. Stale editor callbacks, replaced source data, retired view attachments and destroyed owners cannot commit a new session. Sorting/filtering are not implicitly rerun after a source setter; use the explicit source refresh contract when the application requires a query refresh.

The collapsed **Source editing contracts lab** inside the bridge demo exercises typed label setters, provided number editing, groups, read-only requests and cancellation on original synthetic class records. Private isolated comparisons run an unchanged consumer description editor against installed AG Grid 31.3.4 and OpenGrid with its source Enter/Tab suppression policy. They verify captured values and event sequences, not full calculation-page integration or backend behavior.

## Remaining replacement gaps

Selection, column width/order/visibility/pinning, pagination and group expansion preserve the existing computed sort/filter/group projections after a retained class record changes and a view-only refresh. Direct cell values remain live. Applying unchanged source sort/group state does not implicitly rerun those stages. Native explicit query/data/cache-refresh operations remain effective.

`api.refreshClientSideRowModel()` (or `"everything"` / `"group"`) explicitly refreshes the complete resident source query and publishes the model update. It preserves original record and row-node identities. Independent partial stages such as `"aggregate"`, `"filter"` and `"sort"` are unfinished and explicitly rejected; the full-refresh API must not be substituted for a required partial-stage contract. The demo uses full refresh after mutating a local synthetic class instance.

AG Grid `initialState`/`getState` translation, complete filter models and custom-filter hooks, full business-editor integration, paste and backend undo transactions, menu/status/tool-panel registries, complete service APIs, source-theme DOM/CSS compatibility and authenticated application acceptance remain unfinished. Native OpenGrid features in these areas do not automatically satisfy legacy contracts. Inline source editing can invoke an application's setter; the application owns any persistence it performs. The demonstration makes no backend request. A source callback retained in metadata is not proof that its feature is implemented.

Original regression fixtures cover public imports/ref lifecycle, nullable options, event ordering and filtering. Private read-only source fixtures additionally compare unchanged consumer components and the installed reference implementation; those source files and application data are not published. The unchanged complete application is **not supported yet**: the explicit gaps above prevent a complete replacement, independently of the pending authenticated acceptance.
