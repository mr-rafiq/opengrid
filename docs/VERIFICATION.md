# Verification record

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

No full parity claim, API-compatibility claim, production-readiness certification or performance guarantee is made. Runtime supports the bounded features in [FEATURE_PARITY.md](FEATURE_PARITY.md). Especially important missing areas include column virtualization, range/fill/clipboard operations, complete server-side/viewport models, XLSX/PDF, rich editing lifecycle and integrated chart tools. Package names are local workspace names; npm publication/name reservation was not performed.
