# Getting started

OpenGrid is an independent MIT-licensed React and TypeScript data grid. The framework-neutral core owns your data and state; the React adapter supplies the interaction and rendering. No account or license key is required.

This is an early preview with its own API. The packages have **not been published to npm**, and the workspace package names are not an npm availability claim. Start from source, or build local tarballs.

## Run the example

Use Node.js 24.14 or later and npm 11 or later.

```bash
git clone https://github.com/mr-rafiq/opengrid.git
cd opengrid
npm ci
npm run dev
```

Open the localhost URL printed by Vite, or [explore the hosted portfolio demo](/opengrid/demo/). Its sample holdings and live provider simulations are illustrative, not real financial data.

## Create a grid

Keep a stable model instance and give every row a nonempty, unique ID. Import the adapter stylesheet once.

```tsx
import { useMemo } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";
import "@opengrid/react/styles.css";

type Product = { id: string; name: string; price: number };
const columns: Column<Product>[] = [
  { id: "name", field: "name", header: "Product", editable: true },
  { id: "price", field: "price", type: "number", editable: true },
];

export function Products() {
  const model = useMemo(
    () =>
      createGrid({
        rows: [{ id: "p1", name: "Notebook", price: 12 }],
        columns,
        getRowId: (row) => row.id,
      }),
    [],
  );
  return <DataGrid model={model} height={420} ariaLabel="Products" />;
}
```

This example runs inside the cloned workspace. To use the library in another application, build the packages and install their local tarballs together.

## Build local packages

```bash
npm run build
npm pack -w @opengrid/core
npm pack -w @opengrid/react
# Optional spreadsheet and PDF package:
npm pack -w @opengrid/export
```

Install the generated core and React tarballs together in your own React application. No npm-registry publication or download is implied by these workspace names. Review [dependency notices](../../../THIRD_PARTY_NOTICES.md) when redistributing.

## Choose the next step

- [Read the API guide](../../../docs/API.md) for models, selection, editing and state.
- [Explore the feature ledger](../../../docs/FEATURE_PARITY.md) for precise support and gaps.
- [Understand the architecture](../../../docs/ARCHITECTURE.md) and package boundaries.
- [Contribute](../../../CONTRIBUTING.md) with a reproducible behavior change and useful tests.

The complete AG Grid feature goal remains a roadmap. OpenGrid is not affiliated with AG Grid, and automated accessibility checks do not establish screen-reader conformance.

See [Themes and responsive UI](../../../docs/themes.md) for shared light, dark and system appearance.
