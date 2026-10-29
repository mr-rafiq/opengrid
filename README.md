# OpenGrid

An original **MIT-licensed React and TypeScript data grid**, built around a framework-neutral engine. Sorting, filtering, editing, grouping, aggregation, tree data, column controls and virtualized rendering are usable today. This is an early preview with its own API, not a drop-in AG Grid replacement.

The long-term goal covers Community and Enterprise feature families in AG Grid **36.2.0**. Full parity has **not** been achieved. The [feature ledger](docs/FEATURE_PARITY.md) identifies working subsets, limitations and missing capabilities with links to the reference documentation. All OpenGrid functionality in this repository is MIT licensed.

![OpenGrid portfolio example](docs/demo.png)

## Try the interactive example

Requires Node.js 24.14+ and npm 11+. No account or license key is needed.

```sh
git clone https://github.com/mr-rafiq/opengrid.git
cd opengrid
npm ci
npm run dev
```

Open the printed localhost URL. Explore up to 100,000 deterministic portfolio rows; switch to grouped or tree views, edit prices and shares, pin and resize columns, select rows, inspect a pivot summary and export CSV. Data stays in the local browser. The trend graphics are illustrative sample values, not financial data.

## React quick start

The two packages are workspace packages. **They have not been published to npm**, and their npm names have not been reserved or checked for availability. Use the workspace or local tarballs from `npm pack -w @opengrid/core` and `npm pack -w @opengrid/react` after building.

```tsx
import { useMemo } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";
import "@opengrid/react/styles.css";

interface Product {
  id: string;
  name: string;
  price: number;
}
const columns: Column<Product>[] = [
  {
    id: "name",
    field: "name",
    header: "Product",
    editable: true,
    pinned: "left",
  },
  {
    id: "price",
    field: "price",
    type: "number",
    editable: true,
    aggregate: "sum",
    validate: (value) =>
      Number(value) >= 0 ? undefined : "Use a positive price",
  },
];

export function Products() {
  const model = useMemo(
    () =>
      createGrid<Product>({
        rows: [{ id: "p1", name: "Notebook", price: 12 }],
        columns,
        getRowId: (row) => row.id,
      }),
    [],
  );
  return <DataGrid model={model} height={480} ariaLabel="Products" />;
}
```

Treat model state, row objects and callback inputs as read-only. Use `setState`, `setRows`, `applyTransaction`, `editCell` or `batchEdit` to make changes; mutating returned objects bypasses subscriptions and caches. Row IDs must be unique, nonempty, stable strings. Column schemas are fixed when the model is created.

## Working capabilities

- Stable multi-column sort and typed text, numeric, date, boolean, BigInt and membership filter predicates; quick search and pagination.
- Editable fields with parsers, validators, atomic batch changes and bounded undo/redo; add/update/remove transactions.
- Single/multiple row selection, column resize/reorder/hide/pin and configuration chooser.
- Fixed-height row virtualization, keyboard navigation, ARIA attributes and validation announcements.
- Expandable grouping and path-based trees, built-in/custom aggregates and a standalone pivot utility.
- CSV with RFC 4180 escaping and spreadsheet formula neutralization; basic SVG sparklines.
- Standalone safe arithmetic formulas and a flat infinite-block data loader with deduplication, invalidation, cancellation, retry and bounded LRU cache.

The browser grid currently uses the client-side model. The infinite loader is an independent building block. Grouped server-side and live viewport models, XLSX/PDF, integrated chart tooling, rectangular ranges/fill/clipboard, rich editors, spanning, and many other advanced features remain on the roadmap. See the ledger for exact scope. Automated accessibility checks are not screen-reader verification.

## Keyboard controls

Arrow keys move between cells. Home/End move across a row; Ctrl/Cmd+Home/End reach the first/last cell on the rendered page. Page Up/Down move by the visible area. Enter/F2 or double-click starts an edit, Escape cancels, and Enter/Tab commits. Space toggles a row. Shift-click a header for multiple sort keys. Focus a column separator and use Left/Right to resize. The column chooser provides keyboard-operable move/pin/hide controls.

## Development and verification

```sh
npm run check                  # strict TypeScript, unit/React tests, package and demo builds
npx playwright install chromium
npm run test:e2e               # real Chromium interactions and axe-core scan
```

GitHub Actions runs these checks on push and pull requests. See [verification evidence](docs/VERIFICATION.md), [API](docs/API.md), [architecture](docs/ARCHITECTURE.md), [research provenance](docs/RESEARCH.md), and [contribution guide](CONTRIBUTING.md).

## License and provenance

[MIT](LICENSE). OpenGrid is independent of AG Grid Ltd and has no AG Grid runtime dependency. Its implementation was written from public feature documentation, without copying enterprise source or removing license controls. AG Grid and its product names belong to their respective owners. Repository name availability was checked under `mr-rafiq` only; no claim of globally unique branding or npm name availability is made. Third-party runtime and development dependencies retain their own licenses; see [notices](THIRD_PARTY_NOTICES.md).
