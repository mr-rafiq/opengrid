# Release notes

Created by Mohamed Rafiq.

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
