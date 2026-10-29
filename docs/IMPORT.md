# Bounded XLSX import

`importXlsx<T>(bytes, options)` parses a real ZIP-based Office Open XML workbook into application rows. It never applies a transaction, replaces grid data, follows hyperlinks, evaluates formulas or writes a file. Review the returned preview before an application explicitly updates its grid.

```ts
import { importXlsx } from "@opengrid/export";

const preview = await importXlsx(new Uint8Array(await file.arrayBuffer()), {
  columns,
  sheetName: "Inventory", // optional; first worksheet is the default
  mapRow: (values, rowNumber) => ({
    id: `import-${rowNumber}`,
    name: values.name,
    price: values.price,
    active: values.active,
  }),
});

// preview.rows and preview.warnings are data. No model mutation has occurred.
```

The importer belongs to the optional export package. ExcelJS provides workbook interpretation, JSZip (MIT option) provides streamed decompression, and saxes (ISC) provides strict XML parsing. The neutral grid core remains independent of these dependencies.

## Header and schema mapping

`columns` supplies the import schema. A plain-string worksheet header matches either the column `id` or its configured `header`, with surrounding whitespace trimmed and case preserved. Duplicate header bindings, ambiguous schema aliases, unknown headers, duplicate column IDs and data under a blank/unmapped header reject the import. The default header row is 1; `headerRow` may select rows 1-100.

Cell values passed to `mapRow` are keyed by **column ID**, not field path. Blank cells, explicit empty strings and missing cells become `undefined`; completely empty data rows are skipped. Unbound schema columns are not automatically synthesized. `mapRow` must return an object and controls row identity and application-specific field construction. It is responsible for mapping ID-keyed values to the row's actual field names.

Without a custom parser, the importer applies the configured numeric, boolean, BigInt, date or text type before `mapRow`. JavaScript Date values are preserved as new Date instances. ISO date text is accepted for date columns with calendar validation; unformatted numeric Excel date serials are not guessed. BigInt text is parsed exactly. An unsafe numeric integer cannot be recovered and rejects rather than pretending to retain precision.

Custom `valueParser` callbacks receive the original imported value and the full provisional mapped row. Their results are then applied to configured `field` properties. All validators run after all custom parser results have been applied, so they inspect the complete mapped row. Computed columns validate their getter value. A parser, mapper or validator failure rejects the entire import result; no partially accepted row array is returned. Application callbacks should themselves be side-effect-free.

## Formula policies

Formulas are **never executed** by the importer.

| `formulaPolicy`    | Behavior                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `reject` (default) | Any formula in mapped data rejects the import                                                                  |
| `cached`           | Uses the workbook's existing cached result and emits a `formula-cached` warning; missing cached results reject |
| `text`             | Preserves `=expression` as inert string text and emits a `formula-text` warning                                |

Cached results may be stale or maliciously supplied. They are not recalculated or vouched for. Formula-text mode still runs the application's type/parser/validation policy; a numeric column therefore needs an appropriate custom parser if it is intended to retain formula strings. Spreadsheet error values reject. Rich text is flattened, and hyperlink cells retain display text only, with explicit warnings. No hyperlink target is fetched.

Warnings contain `code`, `rowNumber`, `columnId` and `message`. Header formulas are not accepted as plain header text.

## Resource boundaries before workbook parsing

The importer preflights **every archive part**, including unselected worksheets, before ExcelJS is allowed to parse workbook objects. Limits are conservative and intentionally reject some otherwise valid workbooks.

| Option / fixed bound              | Default                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `maxFileBytes`                    | 10,000,000 compressed bytes                                         |
| `maxUncompressedBytes`            | 32,000,000 actual expanded bytes across all parts                   |
| `maxRows`                         | 50,000 data-row budget, plus bounded header allowance across sheets |
| `maxColumns`                      | 256, including declared coordinates/column spans                    |
| `maxCells`                        | 250,000 physical cells and shared-string entries                    |
| Worksheet parts / workbook sheets | At most 32                                                          |
| ZIP entries                       | At most 2,048                                                       |
| Compression ratio                 | At most 1,000 expanded bytes per compressed byte, per part          |
| XML nesting                       | At most 64 levels, plus an aggregate XML-node budget                |

Budgets must be positive safe integers. Row/column caps cannot exceed the XLSX format bounds. Raising byte/count budgets increases the memory and CPU the application permits; the importer is not an operating-system sandbox or a latency guarantee. Browser applications importing large workbooks should run work off the UI thread and provide cancellation around their own workflow.

Preflight checks include:

- Independently parsed ZIP central-directory metadata, local-header consistency, entry ranges, descriptors, duplicate paths and required OOXML parts. No private JSZip metadata fields are trusted.
- Ordinary single-disk ZIP only. ZIP64, encryption, symlinks, overlapping parts, ambiguous Unicode-path extras, non-ASCII archive part names, traversal paths, macros, binary workbooks and embedded objects reject.
- Actual decompressed chunks are counted **before** XML processing; chunks are never concatenated by preflight. The public JSZip stream is paused and the promise rejects as soon as declared or configured byte limits are exceeded. A currently executing inflater input chunk may finish emitting discarded output, but further compressed input is paused and no failed output is retained.
- CRC32 and exact actual/declared expanded-size agreement for every part. ExcelJS only receives the original archive after every stream and XML check passes.
- UTF-8 XML only; DTD/entity declarations reject. Strict XML parsing checks nesting, collection declarations, actual shared strings and references, row/cell indices, dimensions, ranges, column declarations, sparse sheet IDs and duplicate sheet names/IDs.

**Merged cells and named ranges currently reject completely.** This prevents their implicit cell-matrix allocation from bypassing physical-cell limits. In particular, a one-element named range or merge spanning millions of cells is not treated as a one-cell workbook. Other unsupported complex or nonstandard OOXML layouts may also reject. A rejected import never falls back to an unbounded parse.

The supported format is ordinary `.xlsx`; `.xls`, `.xlsb`, `.xlsm`, password-protected workbooks, general archive extraction, template fidelity, arbitrary embedded content and full Excel import parity are not offered.

## Verification

Tests round-trip real exported workbooks with typed Date/BigInt values, headers, sheet selection, blanks, parsers and full-row validation. Formula-policy tests verify default rejection and explicit cached/text warnings. Adversarial fixtures cover malformed/encrypted/ZIP64/traversal/duplicate/macro archives, CRC failure, oversized dimensions/metadata, DTD declarations, missing/excess shared strings, sparse sheet IDs, merges and named ranges.

A forged archive declares a 16-byte local and central size for a genuinely compressed 2,000,000-byte payload. The import rejects during actual streamed-byte preflight, and a spy confirms ExcelJS workbook loading was never reached. This is the regression protecting against trusting central-directory sizes alone.
