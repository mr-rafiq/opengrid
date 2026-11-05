# Calculation workspaces

OpenGrid provides native React building blocks for estimating and calculation screens. It is **not an AG Grid API-compatible replacement**. The [calculation workspace lab](../examples/demo/src/calculation-lab.tsx) uses original synthetic records; it connects no business database. Open the **Calculation workspace lab** in the [playground](https://mr-rafiq.github.io/opengrid/demo/#calculation).

## Editing nested records

```tsx
const columns: Column<Estimate>[] = [
  {
    id: "quantity",
    field: "item", // backing field for eligibility and draft tracking
    type: "number",
    editable: (row) => !row.locked,
    valueGetter: (row) => row.item.quantity,
    valueSetter: (value, draft) => {
      draft.item.quantity = Number(value);
      return draft;
    },
    validate: (value) =>
      Number(value) < 0 ? "Use a positive quantity" : undefined,
  },
];
```

`editable` must synchronously return `true`; exceptions and other values deny the edit. The same policy applies to native editors, row sessions, paste, fill and direct model edits. A getter-backed cell requires a `valueSetter` and a backing `field` to be editable. Two setters using the same backing object retain independent row-session drafts.

The setter receives an owned data copy and must synchronously return the complete row with the same stable ID. Final validation reads the getter from the staged candidate, without the value cache. A rejected multi-cell operation publishes no staged changes or history. A successful batch has one undo transaction. Source-row or schema replacement during callbacks cancels publication.

Owned copies support bounded public data graphs, arrays, Date, Map, Set, cycles and objects whose state is stored in own data properties. Own accessors and opaque native objects are rejected without invoking accessors. This is **not** an arbitrary class serializer: private fields, external resources and shared functions require a host adapter. Keep callbacks synchronous and free of external side effects; library rollback cannot undo a network request or a captured-object mutation.

Asynchronous owned setters are rejected. The native [host-owned edit-request mode](EXTERNAL_EDITS.md) submits validated edits without changing source rows, running owned setters or recording cell undo. Backend persistence, recalculation, server conflict handling, acknowledgement and backend-aware undo still require the host application adapter. This is not an AG Grid API facade. Editable formula columns also require raw scalar fields and cannot use custom setters. Calculated columns remain read only.

## Protected views and utility columns

```tsx
model.setReadOnly(true);
// Copy, exports, filtering, navigation and selection remain available.
// Edit, native history and row-move commands are blocked.
model.setReadOnly(false);

const treeColumn = {
  id: "item",
  field: "description",
  pinned: "left",
  lockPosition: "left",
  lockPinned: true,
  lockVisible: true,
  movable: false,
  columnsPanel: false,
};
```

`readOnly` is also a creation option. It cancels mounted native editors and blocks direct model batch commands. It does not grant or enforce server authorization. Host synchronization through `setRows`/`applyTransaction` remains available; independently owned notes and custom application actions must enforce the host's permissions too.

`lockPosition` anchors a column at its declared edge within the effective pin band. Locked columns keep declaration order. `lockPinned` and `lockVisible` enforce definition defaults even when restoring state. Changing definitions may change those defaults. `movable: false` blocks user move commands; explicit restored order can still move an otherwise unanchored column. `columnsPanel: false` omits a utility field from the chooser/Columns panel without removing its independently available filter. These controls appear disabled where appropriate in menus and both client/provider sidebars.

## Filtering and sorting values

`filterValueGetter(row)` supplies the scalar used by column conditions, advanced conditions and resident set choices. Display, exports, quick search, sorting and aggregation continue using the ordinary getter. `filterValueFormatter(value, row)` labels set choices. When a separate filter getter has no filter formatter, scalar labels are used instead of the display formatter.

`compare(a, b, context)` receives `rowA`/`rowB` for source-row sorting or `nodeA`/`nodeB` for generated-group sorting. Group nodes contain real children and aggregates; no source row is fabricated. Only an actively sorted group-key/aggregate column participates in generated-group sorting. Remote ordering belongs to the provider; remote read-only projection adapters do not fabricate source context.

## Presentation and application panels

`DataGrid` supports:

- `renderHeader({ column, model })`: a noninteractive label inside the native sort button. Its rendered contents supply the accessible name, with the sort action available as a title; native sort, menu and resize controls remain available. Custom labels are excluded from automatic header measurement.
- `renderHeaderControls({ column, model, progressSort, showColumnMenu })`: interactive content replacing the native label, sort and menu buttons for a leaf header. Return `undefined` to keep the default controls for that column, or `null` to suppress them. `progressSort(multi)` cycles ascending, descending and unsorted using current model state. `showColumnMenu(anchor)` opens the real native menu. Resizing, column dragging and header keyboard sorting remain available; the host owns its replacement controls' accessible names and internal keyboard behavior. Do not put interactive buttons in `renderHeader`.
- `renderGroupCell({ node, column, value, displayValue })`: content for generated group/total cells. Expansion normally uses the native prefix; selection remains native.
- `renderTreePrefix(context)`: replace the first data cell's hierarchy prefix, including indentation and group/detail controls. Return `null` when a complete cell renderer already draws them. Native row hierarchy ARIA, keyboard expansion and selection remain available. The host owns any replacement controls' accessible labels, focus, event propagation and sizing; stop click propagation when an action should not select or edit the containing cell.
- `getRowClassName(node)`, `getCellClassName(context)` and `getCellTooltip(context)`: host decoration. Formula-error tooltips take precedence.
- `statusContent`: application content appended to the native counts and pagination bar.

`selectionCheckboxColumn="item"` places row and header checkboxes in an existing data column, without an extra utility column. The default separate checkbox column remains available. `selectionControls` can supply explicit row/header checkbox states and actions when a host needs distinct display and action scopes. Its callbacks must publish selected source IDs into the same model; they do not replace range selection or provide remote/global selection. Returning `null` hides a checkbox and a disabled state prevents its action. Keyboard Space and the row context command use the same host action. The calculation lab demonstrates integrated native hierarchy checkboxes.

`floatingFilters={false}` hides the floating-input row while retaining the model's filtering and filter panels. A predicate `(column) => boolean` shows inputs for selected filterable columns. The default remains `true`; hiding inputs does not clear existing filter state.

`GridWorkspace` hosts real React panels alongside a grid. Supply unique `id`, `label`, optional `icon` and `content` per panel. The tab rail supports Arrow Up/Down and Home/End. At 1024 CSS pixels and below it becomes a modal drawer with native focus containment, Escape dismissal and launcher focus return. Only the selected panel mounts; keep persistent panel state in the host. Default `label`, `openLabel` and `closeLabel` follow `GridLocaleProvider`; explicit host overrides take priority. The workbench uses shared light/dark tokens.

The lab offers English/Deutsch without replacing its model, source records or history. German mode uses explicit `de-DE` currency formatting for source values, aggregates and totals, plus German native controls and an **Ansichten** host-panel label. Its original business headers and data intentionally remain application-owned. Locale selection alone never changes stored numbers or enables locale-aware parsing. See [localization](LOCALIZATION.md) for the full boundary.

## Replacement readiness matrix

The [experimental legacy React bridge](LEGACY_REACT_BRIDGE.md) now exposes selected measured source-style React/ref/API contracts publicly. It preserves resident class records, option precedence, supported callback lifetimes, nullable loading rows, external filtering and responsive pinned layouts. It remains read-only and does not close the application integration gaps below.

This matrix describes native capabilities and remaining integration work, not a certification of an unseen application screen.

| Requirement                           | Status and boundary                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated grouped tree and aggregates | Native client grouping, expansion, filtered totals and subtree selection exist. Custom generated group rendering and comparator context added. Host-specific group editing/fan-out still needs an adapter. |
| Protected pinned utility column       | Native enforced layout locks and independent panel visibility added.                                                                                                                                       |
| Nested column headers                 | Native; custom header labels and filtered sums can be supplied by the host.                                                                                                                                |
| Row-dependent editing                 | Native synchronous policy across core, ranges and React editors.                                                                                                                                           |
| Getter-backed nested values           | Native owned synchronous row setters with validation and atomic history.                                                                                                                                   |
| Dynamic custom editors/renderers      | Existing React extension points; host maps its components and context to the OpenGrid API.                                                                                                                 |
| Text/number/set/advanced filters      | Native; separate filter getters/choice labels added. Host-specific hierarchical filter UI remains custom.                                                                                                  |
| External Smart Search                 | Predicate API exists. The lab demonstrates text plus one numeric condition, **not** a complete search language or application parser.                                                                      |
| Multi-row/range/group selection       | Native current-view rectangle and all/filtered subtree selection. Full reference-specific group policies and multi-range behavior remain partial.                                                          |
| Read-only screen                      | Native edit/history/reorder gate added. Server authorization and custom actions remain host-owned.                                                                                                         |
| Backend paste batching/recalculation  | Native validated local paste and host-owned edit requests exist. Source-specific paste events/batching, server acknowledgement, business recalculation and backend undo remain integration gaps.           |
| Clipboard headers/cut variants        | Plain-text rectangle copy/paste exists. Group/header-aware copy and transactional cut are not yet provided.                                                                                                |
| Saved layouts/views                   | Native state snapshots; working session-only example. AG Grid state translation, schema-version migration and backend persistence remain adapters.                                                         |
| Custom cell/header menus              | Existing native extension points; business commands need host implementations. Generated-group business menus remain partial.                                                                              |
| Custom status panels/decorations      | Native React status content, row/cell classes, tooltips and group/header rendering added.                                                                                                                  |
| Custom side panels                    | Native responsive panel host added. Actual document, article, phase, recalculation and permission services are application responsibilities.                                                               |
| CSV and genuine XLSX                  | Existing exports; application-specific grouped workbook formats and business reports require adapters.                                                                                                     |
| German/English presentation           | Native `deDE` catalog supplies all 518 library-owned UI messages, including workspace/client/provider sidebar controls. Application labels, parsing and legacy core diagnostics remain host-owned.         |
| Compact themes/responsiveness         | Original 12px workbench styling and shared light/dark tokens; tested fixture evidence is distinct from actual application visual acceptance.                                                               |
| Actual application replacement        | **Not verified.** Requires the host adapters above, application tests, authenticated runtime access and visual acceptance. No target application source is changed by this release.                        |

Tests: [core contracts](../packages/core/src/calculation-contracts.test.ts), [setter ownership](../packages/core/src/value-setters.test.ts), [column locks](../packages/core/src/column-locks.test.ts), [React extensions](../packages/react/src/calculation-extensions.test.tsx), [workspace navigation](../packages/react/src/grid-workspace.test.tsx), and [browser workflows](../tests/calculation.spec.ts).
