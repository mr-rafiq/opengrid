# Experimental legacy React bridge

`Ag31ClientGrid` is a public, **read-only resident-client bridge** for selected measured AG Grid 31 contracts. It is not an alias for `AgGridReact`, a complete compatibility layer, or certification that an existing application can replace its grid unchanged. Unsupported grid options fail explicitly.

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

`gridOptions` supplies the same supported configuration as direct props. Defined props take precedence; an undefined prop preserves its option. Omitted rows and `rowData={null}` provide an empty resident projection and read as undefined through `getGridOption`, matching the measured nullable source behavior. Omitted definitions use a stable immutable empty schema, so the component can commit its ref and ready lifecycle without a false structural replacement. Changed rows are forwarded individually; unrelated renders do not overwrite an imperative context or callback change.

Supported configuration includes `getRowId`, `rowData`, `columnDefs`, `defaultColDef`, `context`, React `components`, native `initialModelState`, height/rowHeight, className/ariaLabel, multiple row selection, custom group display, filtered group selection, complete tree rendering and the native row-group panel. Measured false-only grouping policies and reactive-component mode are validated rather than silently approximated.

## Events and external filtering

The supported event options are `onGridReady`, `onSortChanged`, `onFilterChanged`, `onSelectionChanged`, `onModelUpdated`, `onRowDataUpdated` and `onColumnRowGroupChanged`. API listeners run before the corresponding option callback. The option is resolved when the queued event is delivered, so replacement or clearing before delivery takes effect. Event records carry the owned API, column API and context. This does not establish complete payload parity for every AG Grid event.

`isExternalFilterPresent` and `doesExternalFilterPass` work in initial options, direct props and `api.setGridOption`. A changed callback immediately refreshes the resident filtered projection. Returning true from the presence callback with no predicate excludes all leaves. Clearing the presence callback disables the external filter. If a stable callback closes over changed external state, call `api.onFilterChanged()` explicitly. Callback identity is retained by `getGridOption`; setting the same callback again does not reapply it.

## Available API surface

The typed ref exposes resident row/node traversal and selection, value and formatted-value reads, row transactions, column lookup/state, sorting/grouping state, refresh, supported option getters/setters, event listeners and destruction. Methods operate on this component's owned model. Transactions are local; they do not save backend changes. `refreshCells` refreshes the view without explicitly rerunning sort/filter stages.

Pinned columns release under viewport pressure with a 50px center reservation, right before left, and do not automatically repin when the viewport grows. Native explicit pin locks remain enforced. Short schemas keep the inline-end pin band at the viewport edge in LTR and RTL without adding data/ARIA columns. Custom source components are isolated from native button/input styling; they remain responsible for their own accessible controls and styling.

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

## Provided header groups

`api.getColumnGroupState()`, `setColumnGroupState([{ groupId, open }])`, `resetColumnGroupState()` and `setColumnGroupOpened(groupId, open)` control resident provided header groups. The same methods are available through `columnApi`. Explicit IDs remain stable; generated and padding IDs follow the measured construction order, and snapshots include nested groups in postorder. Reset restores `openByDefault`, while unknown IDs are ignored.

`columnGroupShow: "open" | "closed"` affects display without changing a leaf's own `isVisible()` or column-state `hide` flag. Therefore `getAllDisplayedColumns()` can exclude a column that is still visible in saved column state. Expansion availability follows currently visible children; nonexpandable groups show surviving columns and have no misleading toggle. Nested conditions compose, and identical captions retain distinct group identities.

The source group methods update the actual header/cell view without rerunning row queries. Keyboard toggle focus survives expansion, and pin pressure is reconciled for newly displayed columns. The original bridge example reveals an optional raw-value column and resets the group independently of leaf visibility.

This is bounded to static resident definitions, at most eight header levels, 1,000 source leaves and 9,000 header-tree nodes. Full source group objects/events, group drag/resize constraints, dynamic definition migration and complete saved-state restoration remain unfinished. Source host CSS/theme translation is separate.

## Source decorations

`getRowStyle` receives the owned source node, original data, row index, API/column API and current context. It works in initial options, direct props and `api.setGridOption`; clearing it removes previous inline styles. An imperative callback change survives unrelated prop updates. `api.refreshCells()` reevaluates view decorations without explicitly rerunning sort/filter stages.

Column `cellStyle` records or callbacks, `cellClass` strings/arrays/callbacks and function-valued `cellClassRules` use owned column/value parameters. False rules disappear on refresh; source records and definitions are not rewritten. String rule expressions are rejected because an expression engine is a separate contract. Native row and column geometry takes precedence over corresponding style values.

`tooltipValueGetter` takes precedence over a dotted `tooltipField`. Nullish callback results clear the ordinary browser title rather than falling back to a stale value. This is plain-text browser-tooltip support, not the reference custom-tooltip component/lifecycle. Existing source CSS classes are preserved, but AG Grid DOM/theme selectors are not translated automatically.

## Remaining replacement gaps

Selection, column width/order/visibility/pinning, pagination and group expansion preserve the existing computed sort/filter/group projections after a retained class record changes and a view-only refresh. Direct cell values remain live. Applying unchanged source sort/group state does not implicitly rerun those stages. Native explicit query/data/cache-refresh operations remain effective.

`api.refreshClientSideRowModel()` (or `"everything"` / `"group"`) explicitly refreshes the complete resident source query and publishes the model update. It preserves original record and row-node identities. Independent partial stages such as `"aggregate"`, `"filter"` and `"sort"` are unfinished and explicitly rejected; the full-refresh API must not be substituted for a required partial-stage contract. The demo uses full refresh after mutating a local synthetic class instance.

AG Grid `initialState`/`getState` translation, complete filter models and custom-filter hooks, business editors/value setters, paste and backend undo transactions, menu/status/tool-panel registries, complete service APIs, source-theme DOM/CSS compatibility and authenticated application acceptance remain unfinished. Native OpenGrid features in these areas do not automatically satisfy legacy contracts. The bridge does not enable editing or backend writes. A source callback retained in metadata is not proof that its feature is implemented.

Original regression fixtures cover public imports/ref lifecycle, nullable options, event ordering and filtering. Private read-only source fixtures additionally compare unchanged consumer components and the installed reference implementation; those source files and application data are not published. Full application compatibility remains **unverified**.
