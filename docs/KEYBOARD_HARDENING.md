# Keyboard and scale verification

OpenGrid's keyboard regressions exercise actual virtualized cells. They do not establish general latency/memory guarantees or manual screen-reader support.

## Run the focused checks

Use the repository's locked dependencies and installed Chromium, then run from its root:

```sh
npm run build:pages
npx playwright test --config examples/site/playwright.config.ts examples/site/tests/virtual-focus.spec.ts
```

Local browser suites own their configured server port and fail if it is already occupied. Stop that preview or choose a separate Playwright configuration/port before running checks. The grid suite defaults to 5173 and Pages to 4174. An explicitly supplied `SITE_URL` targets that URL instead of starting a local site server; leave it unset for local artifact verification. Both suites use one worker.

## Exercised behavior

Eight scenarios combine Minimal/Material, light/dark and 390px/1440px viewports with Chromium forced-color and reduced-motion emulation. One desktop scenario uses 100,000 synthetic source records; the other scenarios use 1,000.

- Ctrl+End reaches the final online cell through both virtual windows; Home reaches the same row's first Record cell, and Ctrl+Home returns to the first source row.
- The focused cell stays inside the grid viewport, its final column index matches the declared count and only one rendered data cell has the roving zero tab index.
- Rendered row/cell counts remain below the documented regression budgets of 80/1,000 for this fixture. These are DOM budgets, not supported maximum data sizes.
- Forced-color focus retains a nontransparent outline of at least two pixels. Reduced-motion cells have no animation or transition.
- A native column menu opens by keyboard; Escape returns focus to its trigger. Filtering and clearing retain intentional search-input focus.
- The document remains within the viewport while the grid owns horizontal scrolling.

Each scenario attaches a grid screenshot and JSON containing its source/rendered counts and configuration. Inspect those artifacts alongside assertion results. The [verification record](VERIFICATION.md) distinguishes executed results from planned checks.

## Remaining evidence

Physical keyboards/devices, manual assistive technology, other browser engines and a published repeatable latency/memory benchmark remain open. Forced-color emulation and computed focus styles complement visual review; they do not measure every OS palette or human perception. Merged layouts, remote route focus and rich editors have separate bounded suites; this fixture does not establish complete AG Grid parity. See the [gap inventory](GAP_INVENTORY.md).
