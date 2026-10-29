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

Keep data algorithms in `packages/core`, browser interactions in `packages/react`, and application-specific examples in `examples/demo`. Add regression tests for observable behavior, especially cross-feature interactions. Examples include sorting after an edit, filtering after a transaction, focus after scrolling to an offscreen row, and pin offsets after column resizing.

Use stable row and column IDs. Preserve input data ownership, exact BigInt values, atomic invalid-edit rejection, and safe CSV escaping. Do not use `eval` or `new Function` for data expressions. Exporters must produce the advertised format; CSV renamed to XLSX is not an Excel exporter.

For a new feature, include its public API, working example where useful, meaningful tests, limitations, and a ledger update linked to relevant evidence. A stub, type definition or extension callback does not justify marking the complete feature implemented. Status rows may be partial when the supported subset is described precisely.

## Accessibility

Exercise the entire task by keyboard. Check visible focus, named controls, editor commit/cancel, error feedback, expansion and navigation after virtual scrolling. Automated axe checks and ARIA snapshots complement real-browser interaction tests. Screen-reader support requires manual verification; report reader/browser/OS versions and scenarios instead of inferring support from markup.

## Pull requests

Explain the user-visible problem, resulting behavior, verification and remaining limitations. Keep changes focused. Include relevant command results and reproducible steps for bug fixes. Update documentation if the API, state schema, supported feature subset or dependency footprint changes.

Discuss new runtime dependencies before adding them, including maintenance and license implications. npm publication, hosted deployment and external paid services are separate release decisions. This repository's package names do not establish npm-name availability or global branding uniqueness.
