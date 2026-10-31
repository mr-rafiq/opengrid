# Release notes

Created by Mohamed Rafiq.

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
