# Optional XLSX and native PDF exports

`@opengrid/export` is an optional ESM package. The neutral grid core has no exporter dependency. The optional package uses ExcelJS **4.4.0** and pdf-lib **1.17.1** (both MIT), loaded through dynamic imports when an export is requested. Package names remain local workspace names, not an npm publication claim.

```ts
import { exportXlsx, exportPdf, exportWorkbook } from "@opengrid/export";

const xlsx = await exportXlsx(model, {
  sheetName: "Inventory",
  table: true,
  freezeColumns: 1,
  numberFormats: { price: "$#,##0.00" },
});
const pdf = await exportPdf(model, {
  title: "Inventory",
  pageSize: "A4",
  orientation: "landscape",
});
// Uint8Array bytes: Blob in a browser, fs.writeFile in Node.js.
const xlsxBlob = new Blob([new Uint8Array(xlsx)], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const pdfBlob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
```

The XLSX result is an actual ZIP-based Office Open XML workbook, not renamed CSV. The PDF result is an actual paginated PDF file, not a browser print command or screenshot.

## Shared row and column policy

Both functions default to all **filtered and sorted data rows**, excluding synthetic group rows, and all visible columns in current model order. Group collapse and pagination do not restrict this data export. Aggregates, group headers and tree indentation are not currently exported.

- `columnIds?: string[]` explicitly chooses order and may include hidden columns. Unknown or duplicate IDs and an empty column set reject.
- `allRows?: boolean` bypasses filters and sorting, using source row order.
- `selectedOnly?: boolean` intersects the chosen row scope with selected stable IDs.
- `getRowId?: (row) => string` is **required with selectedOnly**. It must use the same identity policy as the grid.
- `useFormatters?: boolean` defaults to **false for XLSX** and **true for PDF**.

The exporter reads model getters and formatters. It does not infer custom React renderer content from the DOM. A formatter or getter that throws causes export to reject.

## XLSX support

`exportXlsx<T>(model, options?): Promise<Uint8Array>` emits one sheet. `exportWorkbook<T>(sheets: XlsxSheet<T>[]): Promise<Uint8Array>` emits multiple sheets, where each descriptor has a `model` and the same export options. Each sheet can use its own row and column scope.

```ts
const bytes = await exportWorkbook([
  { model, sheetName: "Visible view", table: true },
  {
    model,
    sheetName: "Selection",
    selectedOnly: true,
    getRowId: (row) => row.id,
  },
]);
```

Supported values are numbers, booleans, strings, JavaScript `Date` objects and blanks. BigInt values become exact decimal strings to avoid Excel numeric precision loss. Date-typed columns receive a `yyyy-mm-dd` number format; an ISO string remains a string unless an application getter supplies a Date. Non-finite numbers, invalid Date values, oversized cell strings and unsupported XML control characters reject.

Supported presentation options:

| Option                      | Behavior                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sheetName`                 | Default `Sheet1`; 1-31 characters, unique ignoring case, no Excel-reserved name characters                          |
| `freezeHeader`              | Default true; freezes one header row                                                                                |
| `freezeColumns`             | Number of leading exported columns to freeze, default 0                                                             |
| `table`                     | Nonempty exports become genuine OOXML tables with striped style and filters; an empty export retains a plain header |
| `headerFill`, `headerColor` | Six-digit RGB or eight-digit ARGB hexadecimal colors                                                                |
| `numberFormats`             | Per-column Excel number-format strings                                                                              |

Column widths derive from configured grid pixel widths and are bounded for spreadsheet readability. Native row groups, row spans, images, notes, hyperlinks, protected sheets, print setup and full theme parity remain unsupported. Tables require unique column header names.

### Explicit formulas

Ordinary strings beginning with `=`, `+`, `-` or `@` remain **string cells**. Formula execution is never inferred from row text. An application must explicitly opt in and supply formula descriptors:

```ts
const bytes = await exportXlsx(model, {
  allowFormulas: true,
  formula: ({ column, rowNumber }) =>
    column.id === "total"
      ? { formula: `B${rowNumber}*C${rowNumber}`, result: 0 }
      : undefined,
});
```

The callback must return an Excel expression without a leading `=` and may provide a cached numeric/string/boolean result. OpenGrid does **not** calculate that expression or validate its Excel semantics; the spreadsheet reader decides recalculation. Do not put untrusted expressions in this opt-in callback. There is no XLSX import parser in this package.

## PDF support

`exportPdf<T>(model, options?): Promise<Uint8Array>` provides A4 or Letter, portrait or landscape, repeated title and column headers, alternating row shading, grid borders, cell wrapping, row-aware vertical pagination and page numbers.

| Option            | Default / limits                                   |
| ----------------- | -------------------------------------------------- |
| `pageSize`        | `A4`; `Letter` also supported                      |
| `orientation`     | `portrait`; `landscape` also supported             |
| `title`           | `OpenGrid export`                                  |
| `margin`          | 32 points; allowed 12-100                          |
| `fontSize`        | 9 points; allowed 6-24                             |
| `maxLinesPerCell` | 3; allowed 1-10, with explicit ellipsis truncation |

All selected columns fit the same page width proportionally. A layout too narrow to display readable cells rejects with a corrective error; there is no horizontal multi-page sectioning. Rows do not split across pages. This is a deliberately bounded report renderer, not full PDF styling parity.

PDF uses standard Helvetica/Helvetica Bold and supports the **WinAnsi character set**. Unsupported text rejects explicitly; custom fonts and general Unicode/CJK/RTL text are not supported yet. Images, links, watermarks, notes, nested detail grids and arbitrary styling are also absent. Applications requiring those capabilities must not treat the present PDF exporter as complete parity.

## Verification

Exporter tests independently inspect XLSX ZIP members using JSZip (MIT option), then round-trip cell types and workbook styles. PDF tests use **PDF.js 6.4.299** (Apache-2.0) as an independent parser to verify pages, dimensions, repeated headers and extracted text. Tests also cover formula-string safety, explicit formula opt-in, selected rows, filtered/all row scope, invalid names/layouts and text limits. See the repository verification record for the current integrated run.

ExcelJS declares a browser bundle through its package `browser` field. Vite resolves that build; Node uses its normal package entry. Export functions return bytes and do not write to disk, access the clipboard, or initiate a download themselves.
