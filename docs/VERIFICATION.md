# Verification record

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

No full parity claim, API-compatibility claim, production-readiness certification or performance guarantee is made. Runtime supports the bounded features in [FEATURE_PARITY.md](FEATURE_PARITY.md). Missing families include spans, localization/RTL/touch coverage, AI/MCP and additional framework UI adapters. Multi-filter panels, external row drops and other partial features retain their stated limits. Existing partial features have separate limits in the ledger. Package names are local workspace names; npm publication/name reservation was not performed.
