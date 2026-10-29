# Verification record

## Explicit RTL presentation

`npm run check` passed strict TypeScript, **1,014 tests in 56 files** (137.69 seconds), all three ESM/declaration package builds and the production demo. New RTL/view-order coverage totals 76 cases, including pure scroll/geometry bounds, physical pin and merged-span offsets, group identity, client editor/filter/keyboard behavior, range/Find ordering, remote provider retention, nonzero scroll preservation and repeated focus of oversized center cells. Built ESM and React server rendering verified public direction helpers, fractional negative-scroll normalization, physical pins, view-ordered range/Find and RTL markup.

The four focused Chromium direction flows passed in 20.2 seconds with one worker. They check actual pin positions through negative horizontal scrolling, bounded rendered columns, arrows/Home/End, keyboard resizing, active editor DOM/draft/focus through direction changes, clipboard order/paste/fill/undo, independent column/row spans with retained offscreen owners, server route controls and million-row RTL navigation. The composed merged view passed a serious/critical axe scan. The complete Chromium suite passed **53 scenarios with one worker in 3.0 minutes**, including existing default-English/LTR, 100,000-row, remote, editing, merge and export regressions.

Review found an oversized live-grid column could alternate its leading/trailing scroll alignment on repeated focus; it now consistently reveals the inline leading edge. Remote scrolling uses measured browser maxima with readback, and direction changes restore owned cell focus without taking focus from external controls. An asynchronous editor test now waits for the provider effect before asserting its invocation. No touch, manual screen-reader, legacy-browser or physical-device conformance is inferred. The feature ledger remains four Implemented, 52 Partial and two Missing broad categories.

The production Pages artifact passed with **39 documentation routes**, and all **9 site scenarios passed with one worker in 16.4 seconds**. The new RTL guide, direction lab and remote direction controls are included. Existing generated-route, responsive navigation, search/copy, real 404 and serious/critical axe checks remain green.

## Built-in UI localization

`npm run check` passed strict TypeScript, **938 tests in 50 files** (102.34 seconds), all package/declaration builds and the production demo. This includes 44 locale foundation/grid/control/analysis/remote cases and 14 status-ownership cases in addition to existing regressions. Targeted compatibility/localization verification passed 81 cases with one worker. Catalog tests resolved all 339 keys in both languages. Built ESM and React server rendering verified Spanish grid output, escaped literal overrides and core/React status ownership through installed package entry points.

The complete Chromium suite passed **49 scenarios with one worker in 2.5 minutes**. The language example verifies an active cell draft/DOM/focus and undo surviving a switch, preserved quick-filter state, pending async choices, an open native row form and plain-text note, retained chart configuration and a stale print capture that updates only on explicit refresh. Spanish composed workflows passed an automated serious/critical axe scan. Standalone controls, dialogs, charts, print and sparkline roots expose their resolved language; nested provider and raw application-label/error behavior have direct component coverage.

The default-English regression run caught replacement of application-provided row-move rejection text. Only original frozen built-in statuses are now translated, through private WeakSet ownership and a read-only query; custom/copied/serialized statuses remain authoritative without matching English text. Core status shape and existing messages remain unchanged. One multistep remote route/page/language integration case allows a 15-second functional timeout for slow hosts; no latency guarantee is inferred.

The catalogs and provider cover built-in UI workflows, not arbitrary application data, parsers, labels or existing unstructured core diagnostics. RTL geometry, touch-specific gestures and physical-device/manual assistive-technology verification remain open. The ledger records four Implemented, 52 Partial and two Missing broad categories; this is not a completion percentage or a claim that only two capabilities remain unimplemented.

The production Pages build passed with 38 documentation routes, and all **9 site scenarios passed with one worker in 22.3 seconds**. The localization guide links the live example; the site still advertises source/workspace installation rather than unpublished npm packages.

Published as `b71d2acd8bdeb337e74963629b8679f349bca00d`; [CI](https://github.com/mr-rafiq/opengrid/actions/runs/40861286004) and [Pages](https://github.com/mr-rafiq/opengrid/actions/runs/40861286222) passed for that exact commit. Live HTTPS checks verified the localization and gap guides, preserved active editor DOM/focus and undo, pending choices, row-dialog drafts, plain-text notes, chart configuration and explicit refresh of a stale print capture. The composed Spanish workflows reported zero runtime errors and no serious/critical axe findings; deployed editor and composed screenshots were visually inspected.

## Vertical row spans and gap audit

`npm run check` passed strict TypeScript, **880 tests in 44 files** (78.23 seconds), all three ESM/declaration package builds and the production demo. New focused coverage totals 69 cases: compact run planning, core metadata validation and 17 React interactions. A built-ESM smoke verified exported owner/window lookup, real model editing and undo. All local test configurations now default to one concurrent worker; no system memory/security settings or unrelated processes were changed.

The complete Chromium suite passed **46 scenarios with one worker in 2.4 minutes**. Vertical spans were checked with 120-row/4560-pixel owners, independent right-pinned runs, original ARIA column/row-span positions, selection per source row, owner edit splitting and undo/focus restoration, and offscreen anchor skeletons that omit unrelated controls/values. Real hit-testing verified pinned owners across horizontal scrolling and detail controls outside merged runs. Pin, detail and full-width boundaries, Find counts and a combined-view serious/critical axe scan passed. Existing remote/million-row and client/100,000-row regressions also passed.

Review found an invalidation gap when pure getter/predicate closure dependencies changed without replacing row objects. Explicit value-cache expiry and same-reference `setRows` now rebuild runs, while actual selection/width-only changes reuse them. Date/BigInt filter operands are compared without JSON serialization; unsupported or over-budget state shapes conservatively invalidate. Tests cover both refresh paths following cosmetic changes. Compact planner tests exercise 100,000 rows; component tests verify bounded rendered anchors over 10,000 rows. These are functional/resource bounds, not latency or throughput benchmarks.

The new [gap inventory](GAP_INVENTORY.md) separates completed bounded contracts from partial breadth. Combined two-dimensional spans, merged clipboard/export, auto-measured height, remote row spans, localization/RTL/touch and the other listed workflows remain open. Automated checks do not establish manual screen-reader or physical-device conformance.

The production Pages build passed with 37 documentation routes, and all **9 site scenarios passed with one worker in 12.5 seconds**. The two new guides are available through documentation navigation and full-text search.

Published as `a8df50f780cd063e26e288405c00e4b7e66fec5f`; [CI](https://github.com/mr-rafiq/opengrid/actions/runs/40851257386) and [Pages](https://github.com/mr-rafiq/opengrid/actions/runs/40851257447) passed for that exact commit. Live HTTPS checks verified both new guide routes, 120-row/4560-pixel owners, navigation/edit/undo/focus, skeletal offscreen anchors, Find and pin/detail/full-width boundaries with zero runtime errors and no serious/critical axe findings. Deployed anchor and boundary screenshots were visually inspected.

## Column spanning

After recovering the Windows execution connection, strict typecheck passed and `npm test -- --maxWorkers=1` passed **811 tests in 41 files** (71.66 seconds). All package/declaration and production demo builds passed. New coverage includes 13 React integration scenarios, bounded immutable span planning, static metadata validation, covered-value Find exclusion and Strict Mode predicate lifecycle. Built React ESM smoke verified public geometry/window exports and merged right-pin offsets.

The complete Chromium suite passed **43 scenarios with one worker in 1.5 minutes**. Span scenarios verify actual merged pixel widths, original logical ARIA indices, clipped pin regions, owner retention when its origin is outside the viewport, pinned overlay hit-testing, keyboard/editor Tab and undo, vertical focus remapping, Find counts after dynamic ownership edits, normal row selection and disabled rectangle controls. The span view passed an automated serious/critical axe scan. Existing 100,000-row and million-row browser regressions also passed.

An eager row-plan allocation found in review was replaced with lazy geometry and a 256-entry LRU; a 10,000-row component regression checks bounded initial planning, scrolling and eviction/revisit. A cancelled covered editor now restores owner focus. No unrelated processes or system memory/security settings were changed. Row spans, remote span layout and merged export formats remain unsupported; no manual screen-reader or touch-device conformance is claimed.

The production Pages build passed with 35 documentation routes, and all **9 site scenarios passed with one worker in 10.1 seconds**. The parity ledger records 4 Implemented, 51 Partial and 3 Missing broad categories, not a completion percentage.

## Managed row moving

`npm run check` passed strict TypeScript, **751 tests in 38 files** (72.33 seconds), all three package builds and the production demo. New coverage includes 18 core reorder/history cases, an explicit server-facade guard and 23 React drag/control cases. A built-ESM smoke verified move/undo/redo, original row identity and transformed-view rejection. Move entries retain only moved IDs and original positions rather than two full-dataset snapshots.

The complete Chromium suite passed **40 scenarios in 45.0 seconds**. Actual native drag/drop, one-step undo/redo (including Ctrl+Y), keyboard and toolbar cell focus, selection retention, logical ARIA indices, transformed/pinned guards, body-edge scrolling, outside-grid cancellation and an automated serious/critical axe scan passed. Browser checks caught and corrected focus-policy and accessible-label defects before publication. No touch-device or manual screen-reader claim is made.

The production Pages build passed with 34 documentation routes, and **9 local site scenarios passed in 7.9 seconds**. The reference ledger now records 4 Implemented, 50 Partial and 4 Missing broad categories; these counts do not indicate percentage completion. Multi-row UI gestures, external/cross-grid drops, transformed-view reparenting and touch-specific dragging remain unsupported.

## Calculated columns and custom filters

`npm run check` passed strict TypeScript, **709 tests in 35 files** (20.52 seconds), three package builds and the production example. This includes 31 calculated-grid integration cases, two per-column generic-cache cases, 18 custom-filter cases and all 46 existing formula-engine regressions after the shared-language refactor. Built-ESM smoke verified calculated values, edit recalculation, CSV output and the legacy formula API without import-cycle errors.

The full Chromium grid suite passed **37 scenarios in 34.2 seconds**. New workflows verify authoring/recreating definitions without changing raw data, derived sort/filter/group aggregation, chained additions, read-only cells, positional-reference rejection, runtime cycle diagnostics/recovery, valid filter preservation across invalid drafts/remounts and native/custom filter focus through horizontal virtualization. The combined view passed a serious/critical axe scan. Production Pages build succeeded with 32 documentation routes and **9 site scenarios passed in 6.7 seconds**. Schemas, ranges, remote calculations and multi-filter limits remain explicit in their guides.

## GitHub Pages delivery

The showcase/docs site was published as `7a7550764112832acbdd217eae6d8dc5f89d1cbb` at [mr-rafiq.github.io/opengrid](https://mr-rafiq.github.io/opengrid/), with the actual [portfolio playground](https://mr-rafiq.github.io/opengrid/demo/) and 30 prerendered documentation routes. Both [Pages build/deployment](https://github.com/mr-rafiq/opengrid/actions/runs/40830293363) and [CI](https://github.com/mr-rafiq/opengrid/actions/runs/40830293390) passed for that exact commit.

Final merged validation passed clean install/audit (0 advisories), formatting, strict typing, 658 unit/React tests, all package/demo/site builds, 33 grid browser scenarios and 9 local production-site scenarios. Against the public HTTPS URL, 8 browser scenarios passed (the local-filesystem artifact audit is intentionally skipped), including live grid interaction, physical deep links/encoded aliases, mobile navigation, docs search/code copying, genuine 404 behavior and three serious/critical axe scans. An independent live crawl verified all 32 sitemap pages and 38 internal page/asset targets with zero failures. Live XLSX and PDF downloads had real `PK`/`%PDF-` signatures, and published pinned/full-width controls worked without runtime errors. Actual deployed desktop/mobile landing and documentation screenshots were visually inspected with no document-wide horizontal overflow. No manual screen-reader or touch-device conformance claim is made.

## Pinned and full-width row milestone

`npm run check` passed strict TypeScript, **658 tests in 33 files** (23.57 seconds), all three package builds and the production example build. The full Chromium suite passed **33 scenarios in 33.2 seconds**. Fifteen new component cases exercise pin resolution, stable-ID focus through pin changes, modal restoration, range copy/paste/fill/undo, tree presentation without source mutation, full-width exclusion, details and nested-grid event isolation.

Browser evidence verifies stationary top/bottom row boxes across body scrolling, original-ID editing/undo and Ctrl+End focus, full-width controls and keyboard navigation, clipboard transactions crossing pin bands while excluding absent cells, declared 92+360-pixel full-width/detail geometry, logical ARIA counts and no serious/critical axe violations in the combined view. Separate browser diagnostics verified full-width horizontal alignment and body-edge auto-scroll stopping inside pin bands. No manual assistive-technology or touch-device claim is made.

## Display tools milestone

This milestone adds five percentage projections (with explicit caller-provided parent denominators), running totals and prior differences, exact BigInt ratios, a bounded captured print view, and shared-column model alignment. The demo exposes transform selection, print refresh/layout and two independently sorted grids with synchronized columns. The separate row-projection helper has tests and design documentation; pinned/full-width DataGrid integration is still pending.

`npm run check` passed strict TypeScript, **643 tests in 32 files** (15.19 seconds), three package builds and the production demo build. New focused coverage includes 34 transform cases, 37 alignment cases, 16 print cases and 12 projection-helper cases. Group aggregate rendering now reads only own properties for prototype-like column IDs. The print table has a named keyboard focus target for its scroll area, correcting an axe finding before publication.

The final full Chromium run passed **30 scenarios in 29.8 seconds**, including pivot transform arithmetic/source preservation, aligned visibility with independent sorting, captured print refresh/staleness, serious/critical axe checks, target-isolated print CSS, a genuine browser-generated PDF and print-target cleanup. No physical printer was invoked: the test replaces `window.print` and exercises Chromium's print rendering separately. Built-module smoke checks confirmed width propagation, an exact 20.00% BigInt ratio and detached print rows. All three local package archives contain declarations and their MIT license.

## Interaction and remote-binding milestone

This milestone adds read-only server/live React grids and local simulated providers, typed advanced-filter expressions and a visual builder, formatted-cell Find, plain-text notes, variable-height rows and nested detail grids, nested column headers, explicit modal row editing, optional bounded getter caching, and schema-driven XLSX import. The new importer validates ZIP/XML structure and resource budgets before workbook parsing; it does not evaluate formulas or mutate grid data automatically.

Browser checks now include grouped-header collapse, atomic row editing, remote sort/filter/drilldown and live scrolling, Find focus, notes, advanced filters, nested-detail layout and an XLSX download/import round trip. React Strict Mode, disappearing group-toggle focus, prototype-like IDs, whole-row staged validation and no-op history behavior have explicit regressions.

Final local results on Windows/Node 24.14.0: `npm run check` passed strict TypeScript, **543 tests in 28 files** (37.28 seconds), three ESM/declaration package builds and the Vite production demo build. `npm run test:e2e` passed **27 Chromium tests in 31.2 seconds**, including automated serious/critical axe checks in flat, dark, grouped, nested-detail and column-group views. Vitest concurrency is capped at four workers after the expanded suite exposed host-contention timeouts. A Strict Mode session-cancellation defect and disappearing group-toggle focus defect were fixed before this final run.

All three local `npm pack` archives contain their MIT license and declaration entry point. Runtime-only `npm audit --omit=dev` reported **0 advisories** for the installed graph. ExcelJS's optional browser chunk is about 929 kB minified and loads on demand; Vite reports its standard large-chunk warning. No npm publication, deployment, manual screen-reader verification or cross-browser certification occurred.

Published as `0ff3c2b29bfe2f2452619a16acbb20eb8fb5b023`; [GitHub Actions passed for that exact commit](https://github.com/mr-rafiq/opengrid/actions/runs/40823592254).

## Expanded preview milestone

The second implementation milestone adds horizontal virtualization, cell-range/clipboard/fill transactions, typed/custom/async editors, formula dependencies, SVG charts, hierarchical server blocks, live viewport strategies, and optional genuine XLSX/PDF output. Local strict typecheck and all three package/demo builds passed. The integrated unit run passed **258 tests in 13 files**. The complete Chromium run passed **17 tests in 57.2 seconds**, including keyboard navigation that mounts an offscreen native editor. Remote CI is separate evidence in the repository Actions tab.

New evidence includes 46 range-controller tests, 46 formula-dependency tests, 29 provider-strategy tests, 17 editor tests, 14 chart tests, 9 horizontal-window tests and 10 exporter tests. Browser scenarios cover atomic paste/undo and rejection, pointer numeric-series fill, wide-grid pinning/logical focus, native select/checkbox/multiline editors, range-linked SVG downloads, formula recalculation/cycles, and real XLSX/PDF downloads. ZIP/OOXML and PDF.js independent parsing validate document formats. Fixed-size windows retain focused/editing cells. Default automatic scans still do not constitute manual assistive-technology verification.

The installed workspace dependency tree currently audits with **0 reported vulnerabilities** after pinning UUID 11.1.1. This does not audit or rewrite embedded dependencies in ExcelJS's upstream prebuilt browser bundle; see [third-party notices](../THIRD_PARTY_NOTICES.md).

## Initial foundation milestone

Date: **2026-10-29**. Local execution: HH24, Windows, Node.js **24.14.0**, npm **11.9.0**. This records the first preview's tested scope, not full AG Grid parity.

| Check                    | Result                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`      | Passed, strict TypeScript across core, React, example and tests                                            |
| `npm test`               | **82 passed**, 3 files: 52 core, 15 extension, 15 React integration tests                                  |
| `npm run build`          | Passed: ESM/declarations for both packages, CSS copy, Vite example production bundle                       |
| `npm run test:e2e`       | **9 passed** in Chromium, 17.6 seconds in the final local run                                              |
| Local `npm pack`         | Both packages produced real tarballs containing ESM, declarations and MIT license; React also contains CSS |
| Built-export smoke       | Passed: imported built core and React exports and executed a grid and arithmetic formula                   |
| Dependency install audit | 0 reported vulnerabilities in the installed lockfile at installation time                                  |

The browser suite exercises sort/filter/selection/CSV download, rejected and accepted edits plus undo, keyboard focus across offscreen rows and pinned cells, chooser/pin/hide/move/resize, group/tree expansion and pivot summary. It checks a bounded DOM after loading the deterministic 100,000-row dataset and filtering after a large scroll. This is a functional regression, **not a throughput or latency benchmark**.

axe-core scans run in flat, dark and expanded grouped views. All three reported **no serious or critical violations**. Earlier findings were fixed: flat rows no longer misuse `aria-level`, hierarchy uses `treegrid`, and low-contrast labels/count badges were corrected. Moderate/minor issues and every possible UI state are not certified by this result. No manual screen-reader, touch, Firefox, Safari, NVDA, JAWS or VoiceOver verification was performed.

Unit coverage includes stable multi-sort/null handling, typed predicates including BigInt, filtering compositions, column state, selection, atomic validation and history, transactions, grouping/tree identity, aggregates, safe CSV quoting/formula neutralization, parser safety, pivot typing, block-cache deduplication/eviction/retry and stale-request rejection. React tests cover keyboard and edit behavior, dimension guards, scroll recovery, hierarchy roles and controls.

GitHub Actions is configured to repeat typecheck/tests/build/browser checks on push and pull requests. The Actions run itself is separate evidence from this local record. See the repository Actions tab for current remote status.

## Limits

No full parity claim, API-compatibility claim, production-readiness certification or performance guarantee is made. Runtime supports the bounded features in [FEATURE_PARITY.md](FEATURE_PARITY.md). Missing capabilities include RTL/touch coverage, AI/MCP and additional framework UI adapters. Multi-filter panels, external row drops, combined two-dimensional spans and other partial features retain their stated limits. Existing partial features have separate limits in the ledger. Package names are local workspace names; npm publication/name reservation was not performed.
