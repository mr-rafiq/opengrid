# Release notes

Created by Mohamed Rafiq.

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

## 0.3.0 — 2026-10-31

This source release adds resident grouping controls and totals, aggregate sorting, and bounded simultaneous server branches. The grid, showcase, documentation and playground share the 0.3.0 release version and light/dark/system themes. Packages remain source/local-tarball previews and have not been published to npm.

- Opaque sticky selection headers prevent scrolled column text from showing behind row controls in both themes.
- Optional row-group panel with native keyboard/touch controls and model-owned header/chip dragging.
- Filtered subtotal/grand-total rows, aggregate sorting, localized labels and print-view integration.
- Simultaneously expanded read-only server branches with route-qualified IDs, explicit branch paging, bounded cache reservations, real refresh/retry and query fencing.
- Source-only hierarchy page selection with totals, fully contained 44px branch actions, and a compact focused phone grouping demo.

## 0.2.0 — 2026-10-31

This release adds a minimal responsive interface and shared light, dark and system appearance across the React grid, showcase, documentation and playground.

- Consistent original SVG command icons, restrained semantic colors and accessible labels.
- Persistent appearance preferences, live system updates, local theme overrides and themed charts and exports.
- Collapsible playground navigation and grouped documentation sidebars with modal mobile drawers, Escape, focus return and background scroll locking.
- Compact phone layouts, view/export disclosures and reachable horizontal grid data.
- A single workspace release version displayed by the showcase, documentation and playground, plus a version-consistency check for manifests, internal dependencies and the lockfile.

All workspace packages now use the same release version. The packages remain source/local-tarball previews and **have not been published to npm**. See [getting started](examples/site/content/getting-started.md) and [themes and responsive UI](docs/themes.md).

The feature-parity goal remains ongoing; see the [feature ledger](docs/FEATURE_PARITY.md) for working subsets and limitations. Third-party and contributor notices remain in [dependency notices](THIRD_PARTY_NOTICES.md) and the [MIT license](LICENSE).

## 0.1.0 — 2026-10-29

Initial public React and TypeScript preview with a framework-neutral core, interactive examples and an explicit feature-parity roadmap. Subsequent development through this preview expanded the grid, exports, remote models, editing and documentation before the 0.2.0 appearance release.
