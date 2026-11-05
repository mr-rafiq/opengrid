# Release notes

## 0.22.0 - 2026-11-05

Resident loading and empty overlays. Created by Mohamed Rafiq. Source release; npm publication is coordinated separately.

- Render owned automatic/manual overlays, suppression flags, localized messages, registered React components and parameter functions. Reflect real destruction through the narrow overlay lifetime service.
- Cover the actual viewport including headers and pinned cells, block loading pointer input, preserve keyboard focus and expose busy state without refreshing resident cell values.
- Correct nullable runtime row updates to retain resident records; an explicit empty array clears them. Update the original demo and document initial versus runtime behavior.
- Support the saved-view helper's null advanced-filter clearing path. Non-null source expressions and native-expression serialization fail explicitly pending the expression adapter.
- Add an original responsive overlay lab with language, custom-content, null/empty, manual control and host-resize interactions. Complete state, sizing/scroll APIs, custom filter hooks, business editing, menus/panels and authenticated calculation-page acceptance remain open; the unchanged application is not supported yet.

## 0.21.0 - 2026-11-05

Resident declared query and column reset. Created by Mohamed Rafiq. Source release only; no npm publication.

- Initialize declared source sort/group defaults and preserve raw sort indices independently from native normalized order, including signed safe integer indices.
- Restore static column order, pins, visibility, query and declared widths through ref/column APIs; unspecified widths retain their current sizes. Regular and initial reset precedence follows measured reference behavior.
- Stage generated source groups during candidate processing, preserve successful callback node identity and retain committed graphs/events when preparation fails. Handle initial pinning.
- Add an original responsive reset example with source-filter, selection and header-state retention checks.
- Complete saved state, overlays, content autosizing, scroll service restoration, custom filters/editors/panels and authenticated calculation-page acceptance remain open.

## 0.20.0 - 2026-11-05

Resident host layout and theme. Created by Mohamed Rafiq. Source release only; no npm publication.

- Put the consumer class on the source root, measure implicit flex height and retain explicit viewport sizing. Native viewport/body floors remain defaults with optional constrained-host overrides.
- Adopt inherited host theme/font/header tokens within the source component, handle live metric props/ref APIs and clearing, and restore the OpenGrid palette when overrides disappear.
- Span balanced padding leaf headers across header tiers, keep accessible header metadata and correct mixed-pin release order through measured right/left alternation.
- Add an original responsive host-layout/palette example. The source view omits the unrelated native count bar; native status/pager behavior remains enabled by default.
- Complete saved state, custom filters/editors/menus/status/tool panels, partial source processing and authenticated full application acceptance remain open.

## 0.19.0 - 2026-11-05

Resident provided header groups. Created by Mohamed Rafiq. Source release only; no npm publication.

- Add ref/column API group-state snapshots, restore/reset and explicit group opening with measured generated/padding IDs and nested ordering.
- Render open/closed-only child columns without overwriting saved leaf visibility. Hidden children update group expandability; equal captions retain independent identities.
- Recompute width geometry when controlled display changes, preserve keyboard toggle focus and reconcile pin pressure. An original example reveals optional value details.
- Full group objects/events, dynamic source definitions, complete saved state, custom filters/editors/panels and authenticated full application acceptance remain open.

## 0.18.0 - 2026-11-05

Resident view-stage refresh correction. Created by Mohamed Rafiq. Source release only; no npm publication.

- Retain resident sort/filter/group and aggregate projections during column resizing, pinning, hiding, reordering, pagination and expansion after an original class record changes.
- Applying unchanged source sort/group state preserves the existing query. Add explicit complete `refreshClientSideRowModel()` with full/group stages; partial source stages remain explicitly unsupported.
- Preserve atomic external-filter invalidation and rollback. The public bridge example distinguishes view refresh from explicit model refresh.
- Full saved state, source group visibility, custom filter/editor/panel contracts and authenticated application acceptance remain open.

## 0.17.0 - 2026-11-05

Resident source filter-model APIs. Created by Mohamed Rafiq. Source release only; no npm publication.

- Add typed experimental `getFilterModel`/`setFilterModel` for resident text, numeric and set JSON models, compatible two-condition legacy fields, original filter getters/key creators and external Smart Search composition.
- Canonicalize resident set keys, discard absent selections, clear all-key models and reconcile key changes after row replacement/transactions without reviving removed selections. Snapshots are detached; query replacement rolls back on preparation failure.
- Native external predicates can replace column conditions atomically in one query publication. The public bridge lab demonstrates source-model filtering alongside external predicates.
- Custom filter hooks, supplied/tree set-value services, native-dialog serialization, complete saved-state/panel/editor contracts and authenticated application replacement remain unfinished. These API contracts do not certify matching source filter UI or full replacement readiness.

## 0.16.1 - 2026-11-05

Retain computed resident projections during selection. Created by Mohamed Rafiq. Source release only; no npm publication.

- Selecting or clearing source rows no longer reruns existing sort/filter/group projections after retained class records change. Live cell reads and presentation refresh remain available. Explicit query/data/cache-refresh operations still recompute the model.
- Cache source, filtered and sorted hierarchy projections with rollback after failed query preparation. Returned hierarchy snapshots remain detached and frozen.
- This corrects the measured selection-only defect; complete independent processing stages, business editing and authenticated application acceptance remain unfinished.

## 0.16.0 - 2026-11-05

Resident source presentation callbacks. Created by Mohamed Rafiq. Source release only; no npm publication.

- Native `getRowStyle` and `getCellStyle` provide row/cell paint and typography while retaining native row/column geometry precedence.
- The experimental resident bridge applies source `getRowStyle`, column `cellStyle`, static/callback classes, function-valued class rules and plain-text tooltip getters/fields using original records and current context. Imperative row-style replacement/clearing survives unrelated React updates. False rules and cleared styles disappear on refresh.
- Absent/static decorations and field-only tooltips avoid extra domain getter/formatter evaluation. Accessor style records and unimplemented string class expressions fail explicitly.
- The responsive bridge lab demonstrates live sample-change highlights and tooltips without changing source values or history. Source-theme DOM/CSS, custom tooltip components, full saved-state/filter/editor/panel contracts and authenticated application replacement remain unfinished.

## 0.15.0 - 2026-11-05

Experimental public resident React/ref bridge. Created by Mohamed Rafiq. Source release only; no npm publication.

- Export `Ag31ClientGrid` and its typed ref, configuration, event, column, row-node and value contracts. The new original demo uses public package imports, class-backed synthetic records, nullable loading, grouping, selection and external filtering.
- Keep omitted columns and rows stable through the public ref/ready lifecycle, including StrictMode and unrelated prop changes.
- Preserve measured `gridOptions`/defined-prop precedence and imperative option changes across unrelated React updates. Deliver supported event options after API listeners, resolving current handlers at delivery and canceling queued work on destruction.
- Apply changed external-filter callbacks immediately, including constructor and React-prop paths, nullable clearing and missing-predicate behavior. Unchanged callback identities do not reapply the filter; stable closures can request `onFilterChanged` explicitly.
- Release pinned bands under narrow-viewport pressure with a reserved center and no automatic repinning. Keep short inline-end pin bands aligned in LTR/RTL, including merged/grouped headers and selection gutters. Isolate source component controls from native input/button styles.
- The bridge remains read-only and experimental. Saved-state/filter translation, business editors/backend transactions, menu/status/panel registries, complete source-theme compatibility and authenticated application acceptance remain unfinished. This release does not certify full replacement readiness.

Created by Mohamed Rafiq.

## 0.14.0 - 2026-11-05

Integrated hierarchy checkboxes and selection-scope contracts. Created by Mohamed Rafiq. Source release only; no npm publication.

- Native `selectionCheckboxColumn` places selection inside an existing data column, with correct logical column indices and no duplicate utility checkbox. The calculation lab demonstrates this compact layout. Labels isolate checkbox pointer/keyboard actions from sorting and editing.
- Optional native `selectionControls` separates host-owned checkbox state from row/header actions while retaining the same selected source IDs. Default current-page/subtree selection remains unchanged.
- Optional `floatingFilters` hides all or selected floating inputs without clearing or disabling model filtering. The internal source bridge honors each column's floating-filter configuration.
- The internal resident bridge implements the measured filtered-descendant group action, all-descendant mixed state and all-source header action, and detached legacy column-state snapshots. Original source fixtures compare real checkbox interactions against the installed reference. The bridge remains internal and read-only; full application, state/filter/panel/editor and authenticated acceptance are still incomplete.

## 0.13.0 - 2026-11-04

Interactive source headers and resident React bridge development. Created by Mohamed Rafiq. Source release only; no npm publication.

- Native `renderHeaderControls` lets an application header own its sort and menu actions without nested or duplicate buttons, while preserving real column menus, resizing, dragging and keyboard behavior. The calculation lab includes an interactive total header.
- Native `renderTreePrefix` lets a complete hierarchy renderer own its indentation and disclosure controls while retaining native hierarchy ARIA and keyboard expansion.
- Internal resident adapters own stable API/ref lifetimes, original class data and node/column identities, typed formatted values, view-only refreshes, row transactions and synchronous column-local sort notifications. Their scalar comparator preserves measured legacy null/text ordering without changing native defaults.
- Unchanged source-component fixtures exercise the bridge on React 18.3.1. The bridge remains internal and read-only; full application compatibility, saved state, filters, menus/panels, business editors, responsive pinned geometry and authenticated acceptance remain unfinished. This release does not certify replacement readiness.

## 0.12.1 - 2026-11-04

Balanced group ordering and source-leaf traversal. Created by Mohamed Rafiq. Source release only; no npm publication.

- Optional native `groupBlanksLast` gives blank keys a stable last-place fallback at each grouping level while preserving explicit comparisons, source rows and existing default order. Provider grids reject this resident-only option explicitly.
- Internal consumer adapters preserve original source insertion order in each group's complete leaf list, independently of grouped child order, filtering and sorting. Generated custom-group comparator values remain separate from displayed group values.
- Original regressions and private unchanged-source comparisons cover the measured contracts. This remains adapter development, not an exported compatibility component or certification of full application replacement.

## 0.12.0 - 2026-11-04

Domain-object grouping and complete client hierarchy metadata. Created by Mohamed Rafiq. Source release only; no npm publication.

- Native `groupKeyGetter` merges groups by stable string keys while retaining original domain instances and source representatives. `groupValueGetter` supplies typed generated-group values without fabricated source rows, and explicit blank-comparator opt-in supports metadata-based ordering.
- Frozen source/filtered/sorted hierarchy forests are independent of expansion, pagination and subtotal placement. Source order stays stable when filtering removes a group's first matching leaf. Rendering and HTML print captures share generated-value formatting.
- The keyed class grouping lab demonstrates three groups from 24 distinct Department instances, European currency, filtered totals and keyboard navigation in shared light/dark themes. Controls wrap on narrow screens, have verified 44px targets and omit unrelated toolbar actions.
- Original internal resident-row/column/value adapters preserve class references, distinct traversal stages, row-local events and measured callback contracts. They are not exported as `AgGridReact`. Complete component/filter/panel/state/editing translation and authenticated application replacement remain open. Provider bindings reject client-only group callbacks explicitly.

## 0.11.0 - 2026-11-04

Typed custom editors and client view commands. Created by Mohamed Rafiq. Source release only; no npm publication.

- Custom cell/row editors can stage class instances through `rawValue`/`onRawChange` and commit synchronously without coercion. Text drafts and native rich string options retain their existing paths. Editor ownership guards prevent obsolete callbacks from modifying another edit or a replaced/unmounted grid. Reentrant commit notifications cannot submit duplicate host requests.
- `viewRef` exposes stable focus/reveal/scroll and cell edit/commit/cancel commands. It uses current virtualized geometry, pinned columns and merged owners; invalid/inactive targets fail explicitly. Synchronous host acknowledgement restores focus after the new view commits.
- The host-edit demo includes a typed review-stage selector and expandable view commands. Original browser fixtures exercise 1,000 rows/40 metrics, pinned cells, both virtual axes, object selection, model replacement and unmount.
- These native seams support consumer adapters; they do not publish an AG Grid compatibility facade, generated-group business editing, arbitrary-object native rich lists, saved AG state migration or authenticated replacement certification.

## 0.10.0 - 2026-11-04

Host-owned edit requests. Created by Mohamed Rafiq. Source release only; no npm publication.

- Validated edit requests preserve original row/class references, bypass owned setters and leave source data and local cell undo untouched. The host owns asynchronous persistence, ordering, errors and authoritative acknowledgement.
- Cell, row, paste and fill workflows support editable getter/fieldless columns in request mode. Row drafts report `requested`, and English/German/Spanish controls announce submission rather than a completed save.
- Original apply/reject demo, public API/ownership documentation and regressions cover request boundaries, reentrancy, read-only behavior, schema changes and host transactions.
- Internal original AG 31 column-state/event helpers are not a public compatibility facade. Full unchanged-consumer, group business-editing and authenticated backend/UI acceptance remain unverified; native examples do not certify replacement readiness.

## 0.9.0 - 2026-11-04

German native workflows and shared panel localization. Created by Mohamed Rafiq. Source release only; no npm publication.

- Original `deDE` catalog completes all 518 library-owned UI message keys, alongside English and Spanish. Typed parameters, counts, UTC dates, BigInt formatting and immutable notices retain the existing localization contract.
- Client/provider sidebars and responsive workspaces share the locale provider, with explicit host-label overrides. Aggregation labels translate while their API values remain unchanged.
- English/Deutsch calculation lab preserves source data, active model and undo history, with explicit European currency formatting; the localization lab demonstrates retaining an active editor during switching.
- German phone drawers wrap long controls instead of squeezing the field selector. Library controls, application labels, legacy core diagnostics, business persistence and locale-aware parsing have explicit boundaries in the [localization guide](docs/LOCALIZATION.md) and [replacement matrix](docs/CALCULATION_WORKSPACES.md). This is not authenticated application replacement or pixel-parity certification.

## 0.8.0 - 2026-11-04

Calculation-workspace foundations with original synthetic demo data. Created by Mohamed Rafiq. Source release only; no npm publication.

- Synchronous per-row edit policies and getter-backed custom row setters with owned drafts, stable IDs, final candidate validation, atomic paste/fill and one-step history. Getter-backed row-session drafts remain independent when sharing a backing object.
- Dynamic read-only edit/history/reorder gate, enforced column position/pin/visibility locks, independent Columns-panel visibility, separate filter values/choice labels and source/group comparator context.
- React header/group rendering, cell/row decorations/tooltips, status content and an accessible extensible workspace with desktop tabs and a native mobile/tablet drawer.
- Compact estimate lab with protected items, computed/filtered currency totals, session views and notes, text/numeric external search, responsive pin policy and light/dark styling.
- Explicit [replacement-readiness matrix](docs/CALCULATION_WORKSPACES.md). Async backend edits, application persistence/recalculation and backend undo, generated-group business edits, AG Grid state migration, header-aware clipboard variants and a complete German catalog remain gaps. Actual application replacement and authenticated visual parity are not certified.

## 0.7.2 - 2026-11-02

This source patch strengthens verification of virtualized keyboard behavior. Created by Mohamed Rafiq. No npm publication.

- Eight production browser scenarios cover both virtual axes, 100,000 source records in one case, theme/preset changes, forced-color focus, reduced motion, native header-menu focus return and filter input retention.
- Functional DOM budgets and attached screenshots/JSON make the exercised scope inspectable; they do not establish throughput, memory or manual assistive-technology certification.
- Local browser suites require exclusive ownership of their server port, preventing accidental verification of an older preview from another worktree.
- See [keyboard and scale checks](docs/KEYBOARD_HARDENING.md) for reproduction and limits. Library behavior and the broad parity classifications are unchanged by this verification patch.

## 0.7.1 - 2026-11-02

This source patch hardens delayed React toolbar clipboard operations. Created by Mohamed Rafiq. No npm publication.

- Pending reads cannot mutate a disposed/replaced controller, fresh data under the same row IDs, a changed schema/range/view or any intervening model state.
- Opening a cell editor, row editor or note dialog cancels pending clipboard intent without losing its draft.
- Only the newest clipboard intent can paste; later native paste supersedes a pending toolbar read. Current failures remain retryable and successful changes still use atomic validation and one undo transaction.
- Stale copy completion/errors are suppressed after ownership, source or selection changes. Already issued operating-system writes cannot be revoked.
- Multi-range/rich HTML clipboard and formula-reference rewriting remain outside this patch. See [clipboard behavior](docs/API.md#cell-ranges-clipboard-and-fill).

## 0.7.0 - 2026-11-02

This source milestone connects a responsive sidebar to actual server block/tree providers. Created by Mohamed Rafiq. No npm publication.

- Controlled `ServerSidePanel` visibility, searchable column categories, owned header/sidebar dragging and native row-group controls, built-in value operations and staged typed conditions publish real provider queries.
- Server bindings retain stable-ID column layout and branch state for visibility changes. The breadcrumb chooser can mirror its schema through `onColumnsChange`.
- Group amounts use row-free aggregate formatting with the live requested operation; source-row callbacks still receive real records.
- A synthetic asynchronous demo executes nested grouping, aggregation, filters, sort and paging. Minimal/Material desktop panel/mobile drawer share light/dark themes and keyboard/touch alternatives.
- Playground form styles no longer add boxes to component-owned sidebar buttons. Sidebar group names remain readable with compact controls rather than vertical letter wrapping.
- No server pivot/schema UI, backend writes, infinite/viewport sidebar or server-wide distinct-value/selection claim. See [provider sidebar](docs/SERVER_SIDEBAR.md).

## 0.6.0 - 2026-11-02

This source milestone adds a bounded client pivot matrix and functional React configuration. Created by Mohamed Rafiq. No npm publication.

- Rows/Columns/Values field zones with native pointer dragging, select/Add, reordering/removal, aggregation choices and totals switches.
- Source-derived sum/average/minimum/maximum/count, weighted totals, typed stable category identities, raw numeric/BigInt sorting and shared aggregate formatting.
- Read-only derived React model follows source filters/edits while preserving its stable-ID layout. Invalid source/configuration hides stale output; explicit size limits reject excessive matrices.
- Participant showcase Records/Pivot switch, responsive themed desktop panel/mobile drawer and genuine formula-neutralized Pivot CSV with totals.
- Flat multi-key result rows are supported; hierarchical pivot drill-down/subtotals, server pivot UI, post-aggregate filters and pivot charts remain open. See [client pivot contract](docs/CLIENT_PIVOT.md).

## 0.5.0 - 2026-11-02

Adds explicit aggregate display formatting for grouped grids and print snapshots. Created by Mohamed Rafiq. No npm publication.

- Optional `Column.aggregateFormatter(value, context)` formats group, subtotal and grand-total cells with immutable metadata and no fabricated source row.
- Shared `formatAggregateValue` preserves legacy raw display when absent; aggregation, sorting, editing and raw BigInt precision remain unchanged.
- Print snapshots capture the same display, including first-column totals, once per cell and retain frozen strings after source edits.
- Participant and portfolio examples use consistent currency/number formatting; counts use whole numbers rather than currency or percent symbols.
- Runtime definition updates retain the formatter, reject malformed callbacks atomically and use the current aggregation operation.

## 0.4.3 - 2026-11-02

This patch unifies column controls in the grid and sidebar. Created by Mohamed Rafiq. No npm publication.

- Grouped headers use an inline label and SVG disclosure chevron with one quiet button, replacing narrow boxed plus/minus glyphs. Collapse, keyboard focus and RTL behavior are retained.
- Sentence-case leaf headers reserve aligned menu targets and display sort arrows only for active sorting, keeping narrow labels readable.
- Header menus, sidebar filters, grouping chips and column-chooser actions share restrained hover, focus, open, disabled and active-filter states without repeated nested boxes.
- The showcase Columns & filters launcher uses the same column icon family. Minimal and Material remain distinct in light/dark, with responsive and native touch alternatives preserved.

## 0.4.2 - 2026-11-02

This patch improves phone, tablet and landscape layouts of the participant showcase and shared website navigation. Created by Mohamed Rafiq. No npm publication.

- Bounded header action slots keep Menu and documentation search reachable on narrow screens.
- Explicit responsive toolbar rows keep dataset, style, appearance, quick search and Columns & filters controls inside their container.
- Phone/tablet grouping places the column chooser beside its label and gives chips and the drop target a complete row; multiple groups retain native reorder/remove alternatives.
- The showcase grid adapts its height to the viewport and visible rows while keeping all 22 columns available through its own horizontal scrollbar.
- Native navigation and tools drawers use the remaining viewport height for scrollable content, including short landscape screens.
- Production browser coverage includes 320/375/390/556/768/1440px, both presets and color modes, live resizing, short landscape touch interactions and enlarged text.

## 0.4.1 - 2026-11-02

This source correction completes the sidebar-to-grouping drag path in the participant showcase. Created by Mohamed Rafiq. No npm publication.

- Visible sidebar column grips support native pointer dragging to both grouping areas, plus keyboard/touch toggling without changing column visibility.
- Clearly outlined group drop areas retain an explicit append target after groups exist; chips can still be dragged to reorder and removed through native controls.
- Compact category disclosure and bulk visibility use separate accessible controls. Column and Values lists scroll independently while the sidebar Row Groups area stays visible.
- Name joins the eligible grouping fields. The showcase widens its Record column on entering grouping so labels are readable, restores its prior width afterward, and retains intentional resizing.
- The older `/demo/` playground links directly to the participant showcase with its resident sidebar. Minimal remains the default; Material and both color modes are retained.

## 0.4.0 - 2026-10-31

This source release adds the interactive participant showcase, a model-bound React sidebar and an optional original Material-inspired preset. Created by Mohamed Rafiq. Packages remain source/local-tarball previews, without npm publication.

- 22 synthetic participant columns, grouped headers, country flags, star ratings, editable purchase checkboxes and 1k/10k/100k client-side data options.
- Searchable expandable Columns/Filters sidebar, working visibility/grouping/aggregate controls and typed condition dialogs. Responsive native mobile tools drawer with keyboard focus return.
- Separate Minimal/Material style and System/Light/Dark appearance controls; Material includes flat surfaces, horizontal separators, underline fields, spacious rows and square pink checked states.
- Public static `/showcase/` route, source documentation and visible shared version; existing component playground remains available.
- Owned `getColumnDefinitions()` readback keeps aggregate changes from baking current visibility, sizing or pinning into reset defaults.
- New `GridSidePanel` API, optional `GridThemeSelect.ariaLabel` and decorative `ColumnConditionFilter.trigger`. Full AG Grid parity is not claimed; pivot configuration and remote sidebar adapters remain open.

## 0.3.0 â€” 2026-10-31

This source release adds resident grouping controls and totals, aggregate sorting, and bounded simultaneous server branches. The grid, showcase, documentation and playground share the 0.3.0 release version and light/dark/system themes. Packages remain source/local-tarball previews and have not been published to npm.

- Opaque sticky selection headers prevent scrolled column text from showing behind row controls in both themes.
- Optional row-group panel with native keyboard/touch controls and model-owned header/chip dragging.
- Filtered subtotal/grand-total rows, aggregate sorting, localized labels and print-view integration.
- Simultaneously expanded read-only server branches with route-qualified IDs, explicit branch paging, bounded cache reservations, real refresh/retry and query fencing.
- Source-only hierarchy page selection with totals, fully contained 44px branch actions, and a compact focused phone grouping demo.

## 0.2.0 â€” 2026-10-31

This release adds a minimal responsive interface and shared light, dark and system appearance across the React grid, showcase, documentation and playground.

- Consistent original SVG command icons, restrained semantic colors and accessible labels.
- Persistent appearance preferences, live system updates, local theme overrides and themed charts and exports.
- Collapsible playground navigation and grouped documentation sidebars with modal mobile drawers, Escape, focus return and background scroll locking.
- Compact phone layouts, view/export disclosures and reachable horizontal grid data.
- A single workspace release version displayed by the showcase, documentation and playground, plus a version-consistency check for manifests, internal dependencies and the lockfile.

All workspace packages now use the same release version. The packages remain source/local-tarball previews and **have not been published to npm**. See [getting started](examples/site/content/getting-started.md) and [themes and responsive UI](docs/themes.md).

The feature-parity goal remains ongoing; see the [feature ledger](docs/FEATURE_PARITY.md) for working subsets and limitations. Third-party and contributor notices remain in [dependency notices](THIRD_PARTY_NOTICES.md) and the [MIT license](LICENSE).

## 0.1.0 â€” 2026-10-29

Initial public React and TypeScript preview with a framework-neutral core, interactive examples and an explicit feature-parity roadmap. Subsequent development through this preview expanded the grid, exports, remote models, editing and documentation before the 0.2.0 appearance release.
