# Contributing

OpenGrid is an independent MIT data-grid library. Contributions should implement original code, preserve dependency notices, and update the [feature ledger](docs/FEATURE_PARITY.md). Do not contribute proprietary AG Grid Enterprise code or remove another project's license checks. Public behavior documentation can inform requirements.

## Local development

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run dev
```

Run checks before submitting a change:

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser installation may need network access. Record environmental failures accurately; a check that could not run is not a passing check. CI should run from the lockfile and report unit, build and browser results separately.

## Changes and tests

Keep algorithms/provider stores in `packages/core`, browser interactions/editors/charts in `packages/react`, optional file generation in `packages/export`, and application-specific examples in `examples/demo`. Add regression tests for observable cross-feature behavior: sorting after edits, filtering after transactions, two-axis focus after scrolling, pinned offsets, page-bound ranges and whole-batch undo.

Remote changes need provider fixtures for stale generations, malformed responses, retries, refresh and cleanup. Distinguish cache updates from backend persistence and standalone provider stores from React integration. Formula changes need dependency invalidation/cycle/budget tests; edited strings must never become executable formulas without explicit opt-in. Reference rewriting and structural migration need their own semantics and tests.

Use stable row and column IDs. Preserve input data ownership, exact BigInt values, atomic invalid-edit rejection, and safe CSV escaping. Do not use `eval` or `new Function` for data expressions. Exporters must produce the advertised format; CSV renamed to XLSX is not an Excel exporter.

XLSX/PDF changes need independent format-reader checks as well as browser download tests. Preserve dependency notices and formula-string safety; keep WinAnsi/custom-font limitations explicit. Clipboard changes must test quoted/malformed TSV, protected cells, bounds, permission failures and atomic rollback. Chart changes must document sampling and numeric precision rather than implying financial/statistical fidelity.

Import changes must preserve actual streamed-byte and XML preflight budgets before workbook parsing, atomic preview validation and inert formula policies. Add adversarial fixtures for changed archive/schema handling. Header/layout changes need pin-boundary/logical-ARIA and variable-height/detail focus cases. Find, notes and modal row edits need lifecycle, view-scope, cancellation and conflict tests; callback invocation counts are not performance benchmarks.

Analytical transforms need denominator, measure-isolation, exact BigInt-ratio and diagnostic/budget cases. Print changes need snapshot scope/staleness, no-silent-truncation and target-isolation cleanup tests; native PDF and physical print remain different evidence. Column-alignment changes need shared/nonshared state, width-bound intersections, feedback convergence and disposal tests; they do not imply scroll alignment.

For a new feature, include its public API, working example where useful, meaningful tests, limitations, and a ledger update linked to relevant evidence. A stub, type definition or extension callback does not justify marking the complete feature implemented. Status rows may be partial when the supported subset is described precisely.

## Accessibility

Exercise the entire task by keyboard. Check visible focus, named controls, editor commit/cancel, error feedback, expansion and navigation after virtual scrolling. Automated axe checks and ARIA snapshots complement real-browser interaction tests. Screen-reader support requires manual verification; report reader/browser/OS versions and scenarios instead of inferring support from markup.

## Pull requests

Explain the user-visible problem, resulting behavior, verification and remaining limitations. Keep changes focused. Include relevant command results and reproducible steps for bug fixes. Update documentation if the API, state schema, supported feature subset or dependency footprint changes.

Discuss new runtime dependencies before adding them, including maintenance and license implications. npm publication, hosted deployment and external paid services are separate release decisions. This repository's package names do not establish npm-name availability or global branding uniqueness.
