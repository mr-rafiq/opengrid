# API guide

This is OpenGrid's API, not an AG Grid compatibility layer. The source of truth for complete types is [`packages/core/src/types.ts`](../packages/core/src/types.ts) and the exported React props in [`packages/react/src/index.tsx`](../packages/react/src/index.tsx). See the [parity ledger](FEATURE_PARITY.md) for supported subsets and missing systems.

## Creating a model

```tsx
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";
import "@opengrid/react/styles.css";

type Product = { id: string; name: string; region: string; price: number };
const columns: Column<Product>[] = [
  {
    id: "name",
    field: "name",
    header: "Product",
    editable: true,
    pinned: "left",
  },
  { id: "region", field: "region", header: "Region" },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    editable: true,
    aggregate: "sum",
    validate: (value) =>
      Number(value) < 0 ? "Use a nonnegative price" : undefined,
  },
];

// Retain one model instance per grid. Inside a React component, initialize it
// with useState(() => createGrid(...)) or another stable ownership mechanism.
const model = createGrid<Product>({
  rows: [{ id: "p1", name: "Notebook", region: "Europe", price: 12 }],
  columns,
  getRowId: (row) => row.id,
  initialState: { pageSize: 25 },
  historyLimit: 100,
});

export function Example() {
  return <DataGrid model={model} height={480} ariaLabel="Product inventory" />;
}
```

Rows and columns require nonempty unique string IDs. A field is a direct property name; dotted nested-field paths are not resolved. `valueGetter(row)` takes precedence over `field`. `valueFormatter(value, row)` controls displayed/search/export text; sort/filter comparisons use raw values. A getter-only column is read-only. `sortable` and `filterable` default to enabled; `editable` must be explicitly enabled.

Column types are `text`, `number`, `boolean`, `date`, and `bigint`. Date comparisons use parsed timestamps; date edits validate input but do not normalize it into a new timezone or Date object. Supply a custom parser if the application needs a precise date-storage policy. BigInt values remain exact. Empty strings are permitted as blank edit values; add a validator when a value is required.

## Reading and changing data

| Method                                      | Behavior                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `getRows()`                                 | Source rows in source order; new array, row objects should be treated as read-only.                                                |
| `setRows(rows)`                             | Replace rows, validate IDs, clear edit history and reset page.                                                                     |
| `getValue(row, columnId)`                   | Read getter/field value for a known column.                                                                                        |
| `getFilteredRows()`                         | Filtered and sorted leaf rows; not paginated or group nodes.                                                                       |
| `getRowModel()`                             | Expanded display nodes, including synthetic groups/tree branches.                                                                  |
| `getPageRows()`                             | Slice of the expanded display-node model.                                                                                          |
| `getPageCount()`                            | At least one, including an empty model.                                                                                            |
| `applyTransaction({ add, update, remove })` | Atomic ID-based update. Updates require existing IDs; duplicate resulting IDs reject. Removes are ID strings. Clears edit history. |
| `subscribe(listener)`                       | Receive model changes; returns unsubscribe function.                                                                               |

Do not mutate rows or state returned by model readers. Use model operations so derived caches and subscribers remain correct. Nested row values are not a general deep-clone boundary.

## Sorting, filtering and selection

```ts
model.setSort("region", "asc");
model.setSort("price", "desc", true); // append a secondary sort
model.setSort("price", null, true); // remove that sort
model.setFilter("price", { op: "between", value: 10, to: 50 });
model.setFilter("region", { op: "in", value: ["Europe", "Asia"] });
model.setQuickFilter("notebook europe");
model.setFilter("price"); // remove one column filter
model.toggleSelection("p1", true); // true allows multiple selected rows
model.selectRows(["p1"]);
```

Sorts are stable, with blank values last in both directions. Comparators can be supplied per column. Column filters combine with AND. Quick-search terms also combine with AND and search formatted column text. Text comparisons are case-insensitive. Supported operators are `contains`, `equals`, `notEqual`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`, `lte`, `in`, `between`, `blank`, and `notBlank`. The React floating input intentionally exposes only contains/equality; use the model API for other operators.

Row selection stores stable IDs. Unknown IDs are discarded; removed rows are cleared. The separate cell-range controller supports one rectangular range; hierarchical row-selection cascade remains absent.

## Column state and persistence

```ts
model.resizeColumn("name", 240);
model.moveColumn("price", 0);
model.pinColumn("price", "right");
model.pinColumn("price", null);
model.hideColumn("region", true);
const saved = structuredClone(model.getState());
model.setState(saved);
model.setState({ page: 1, pageSize: 50 });
```

`getState()` is a read-only snapshot contract; never edit it directly. `setState` accepts a shallow patch. For maps such as `filters` or `columnWidths`, supply the complete desired map or use the dedicated method. Unknown sort/selection/column-order IDs are normalized. Widths are clamped to configured limits, pages are clamped, and page size must be positive. There is no versioned persistence migration format. JSON persistence needs explicit BigInt encoding for BigInt filter values; `structuredClone` preserves them in memory.

## Edits and history

```ts
const error = model.editCell("p1", "price", "15");
if (error) console.error(error);
const batchError = model.batchEdit([
  { rowId: "p1", columnId: "price", value: "18" },
  { rowId: "p1", columnId: "name", value: "Updated notebook" },
]);
model.undo();
model.redo();
```

Edit methods return `undefined` on success or a validation/error string. Parsing and validation precede publication. One invalid member cancels the whole batch; a successful batch creates one undo unit. Row-ID edits are rejected. Default history limit is 100. New edits invalidate redo. This is an atomic API batch, not a staged full-row/multi-editor UI.

## Groups, aggregates and trees

Set `initialState: { groupBy: ['region'] }` or `model.setState({ groupBy: ['region'] })` to create client-side groups. `getRowModel()` returns collapsed nodes until `toggleExpanded(node.id)` is called. `RowNode.kind` is `row` or `group`; generated nodes may have `children`, `aggregates`, `leafCount`, `label` and `depth`. Generated IDs are opaque; do not parse them.

`Column.aggregate` accepts `sum`, `avg`, `min`, `max`, `count` or a callback over values. `aggregateValues` and its alias `aggregate` share the same behavior: count includes every supplied value; numeric operations ignore non-numeric and nonfinite values; empty sum is `0`, other empty numeric results are `null`. BigInt average truncates through integer division. Mixing Number and BigInt rejects rather than silently losing precision.

Supply `getTreePath: row => row.path` for a path-based tree instead of grouping. Paths must be nonempty and unique. Missing branches are synthesized; matching children retain ancestors under filtering. Nested/self-referential import adapters and hierarchical selection are not supplied.

## Standalone utilities

```ts
import {
  pivot,
  evaluateFormula,
  findCells,
  InfiniteDataSource,
} from "@opengrid/core";

const summary = pivot({
  rows: model.getFilteredRows(),
  rowKeys: ["region"],
  pivotKey: "name",
  values: [{ field: "price", aggregate: "sum" }],
});
const derived = evaluateFormula("=SUM([price] * 2, 3)", (columnId) =>
  Number(model.getValue(model.getRows()[0], columnId)),
);
const matches = findCells(
  model.getFilteredRows(),
  model.getColumns(),
  "notebook",
);
```

`pivot` returns `{ columns, rows: [{ keys, cells }] }`; column keys are encoded opaque strings. It is a client utility, not an integrated grid pivot mode. It accepts JSON-serializable scalar category values; BigInt/object/cyclic category support is not promised.

`evaluateFormula` supports numbers, `[column]` references via the supplied resolver, arithmetic, parentheses, unary signs and SUM/MIN/MAX/AVG. It rejects invalid syntax, nonfinite values, division by zero, excessive nesting and long expressions. It never evaluates JavaScript. It has no cell ranges, row references, dependency graph, cycle handling or spreadsheet compatibility.

The newer **`FormulaEngine`** is a separate export with an AST, A1/absolute and current-row references, rectangular ranges, built-in aggregate/comparison/IF expressions, dependency graphs, targeted invalidation, memoization, cycle detection and typed errors. The application registers formulas explicitly with `setFormula`; raw strings do not silently execute. It is standalone: no automatic grid edit binding, formula editor, autocomplete, structural rewrite or copy/fill reference adjustment. Read the [formula API](FORMULAS.md) for syntax, error data, resource budgets and reference identity. Do not infer the small helper's limits apply to this engine, or that the larger engine changes ordinary cell text semantics.

`findCells(rows, columns, query)` returns zero-based row coordinates and column IDs for formatted visible-column matches. It does not change selection, scroll, highlight or provide next/previous UI.

`getVirtualWindow(count, scrollTop, height, rowHeight, overscan?)` returns `{ start, end, offset, totalHeight }`, where end is exclusive. Dimensions must be finite/valid; heights are fixed.

### Flat infinite loader

```ts
const loader = new InfiniteDataSource<Product>(
  {
    async getRows(request) {
      // Application transports startRow/endRow, sorting and filters to its API.
      // Pass request.signal to fetch; return { rows, rowCount }.
      const response = await fetch(
        `/api/products?start=${request.startRow}&end=${request.endRow}`,
        { signal: request.signal },
      );
      if (!response.ok) throw new Error("Loading products failed");
      return response.json();
    },
  },
  { blockSize: 100, maxBlocks: 10 },
);
const block = await loader.loadBlock(0);
loader.setQuery([{ columnId: "price", direction: "asc" }], {});
loader.dispose();
```

This loader is independent of `DataGrid`; an application must integrate its rows and count. `loadBlock(index)` deduplicates concurrent requests, clones responses and uses a bounded LRU cache. `setQuery` invalidates old generations and cancels pending requests; late results reject with `AbortError`. A failed request can be retried by calling it again. Responses require an exact nonnegative integer `rowCount`; unknown counts are unsupported. `invalidate()` clears the cache and cancels pending work. This is neither grouped server-side processing nor a live viewport subscription.

### Hierarchical server-side and live viewport models

**`ServerSideRowModel<T>`** forwards sort/filter/group/aggregate/pivot query descriptors to a provider, caches validated blocks by group route and block index, exposes stable subscription snapshots, cancels stale generations, refreshes/retries routes and applies atomic updates to already-loaded node IDs. The provider computes the requested operations; updates change the cache, not a backend. Add/remove/reorder persistence requires an application server write and refresh.

**`LiveViewportRowModel<T>`** subscribes to a buffered absolute-index window, merges server-pushed rows/counts, validates batches, retains overlap, rejects stale-generation callbacks, retries failures and invokes synchronous/asynchronous cleanup. The application supplies its transport and backend; no WebSocket service or reconnect/backoff framework is bundled.

Both are independent store/provider APIs, not automatic `DataGrid` remote binding. Loading/error placeholders, recursive remote expansion, result-column rendering, server selection and persistence integration remain application work. See [remote model contracts](REMOTE_MODELS.md) for request/response shapes and examples.

## Cell ranges, clipboard and fill

```ts
import { createCellRangeModel } from "@opengrid/core";

const ranges = createCellRangeModel(model);
ranges.setRange({ rowId: "p1", columnId: "price" });
const tsv = ranges.copy();
const pasteError = ranges.paste("20");
const fillError = ranges.fill("down");
ranges.clear();
ranges.dispose();
```

`CellRange` is `{ anchor: { rowId, columnId }, focus: { rowId, columnId } }`. The controller exposes `getSnapshot`, `subscribe`, `setRange`, `extend`, `clear`, `contains`, `getCells`, `copy`, `paste`, `fill`, `fillRange`, `refresh` and `dispose`. It supports one rectangle over visible columns and displayed data rows, excluding generated group headers. An optional `getRowIds` callback can further restrict order/scope; the React integration supplies **current-page visible data-row IDs**, so selection/fill cannot silently span another page or collapsed descendants. Invalidated endpoints clear the range.

`copy({ formatted? })` serializes quoted TSV. `paste(tsv, anchor?)` parses bounded text and submits one atomic edit batch; malformed TSV, ragged/beyond-boundary blocks, read-only cells or validation errors reject without partial writes. `fill('down'|'right')` repeats the leading row/column into the selection. `fillRange(source, target, 'copy'|'series')` extends a source rectangle; series mode recognizes numeric/BigInt progressions. No multi-range selection, rich HTML clipboard or formula-reference rewriting is supplied. Successful paste/fill is one undo unit.

`parseTsv` and `serializeTsv` are exported independently. Default limits bound selections/parser output to 100,000 cells and clipboard input to 10 million characters. Formula-like strings are neutralized on serialization by default; raw numeric negatives remain numeric text. Native browser clipboard access remains permission/secure-context dependent, and the React controls surface failures rather than claiming success.

## CSV

`model.exportCsv()` serializes visible columns and filtered/sorted rows. `{ allRows: true }` exports source order without filters; `{ selectedOnly: true }` limits either scope by selected IDs. It does not export synthetic group rows or only the current page. Headers and cells are always quoted; quote characters are doubled. Formula-like string prefixes are neutralized with a leading apostrophe, including whitespace/control-character cases. The result is CSV, not XLSX. The React toolbar's download currently requests all source rows.

## Optional XLSX and PDF package

`@opengrid/export` exports `exportXlsx`, `exportWorkbook` and `exportPdf`, returning promises of actual `Uint8Array` file bytes. Its dynamically loaded ExcelJS/pdf-lib dependencies stay out of the neutral core. Read [export options and examples](EXPORTS.md) before relying on format support.

Both default to filtered/sorted data rows and visible columns; group collapse/pagination do not restrict them. `selectedOnly` requires a matching `getRowId` callback. XLSX defaults to raw typed values; PDF defaults to formatters. Exporters do not infer custom React cell DOM content or initiate downloads themselves.

XLSX supports multiple sheets, typed cells, widths/colors/number formats, freeze panes, tables and explicitly opted-in formula descriptors. BigInt is written as exact decimal text. Ordinary formula-like text stays a string. Images/notes/hyperlinks/protection/group layout and native import remain absent. PDF provides A4/Letter pagination, wrapping/repeated headers and page numbers, using WinAnsi Helvetica; unsupported Unicode/CJK/RTL text rejects. No custom fonts, images, links, watermarks or horizontal pagination are supplied.

## React adapter

| Prop                     | Default / purpose                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `model`                  | Required `GridModel<T>`.                                                                               |
| `height`                 | `480` pixels for grid viewport; toolbar/status add space outside it.                                   |
| `rowHeight`              | `38`, fixed pixel row height.                                                                          |
| `overscan`               | `6` rows around the visible window.                                                                    |
| `columnOverscan`         | `200` pixels around the horizontal window.                                                             |
| `virtualizeColumns`      | `true`; retain pinned/focused columns while windowing other fixed-width columns.                       |
| `selectionMode`          | `multiple`; also `single` or `none`.                                                                   |
| `cellSelection`          | `true`; enables one rectangular range, clipboard and fill interactions independently of row selection. |
| `onCellRangeChange`      | Receives `CellRange` or `null`; pass it to a sibling chart when desired.                               |
| `editorOptions`          | Per-column `{ type?, options?, asyncOptions? }` configuration.                                         |
| `renderEditor`           | Custom `CellEditorRenderer<T>`; keep the supplied draft/commit/cancel/error contract.                  |
| `ariaLabel`              | `Data grid`; use a task-specific name.                                                                 |
| `toolbar` / `pagination` | Both `true`; disable pagination for a single virtualized display model.                                |
| `className`              | Additional root CSS class.                                                                             |
| `renderCell`             | `(context: { value, row, column }) => ReactNode` for data cells.                                       |
| `onCellEdit`             | Receives attempted `{ rowId, columnId, value, error? }`; value is the raw input draft.                 |

Arrow keys move cell focus; Home/End move across a row; Control/Command Home/End move to grid bounds; Page keys move a viewport. Enter/F2 start editing; Escape cancels; Space selects rows; Control/Command Z and Shift Z undo/redo. Shift-click headers adds sort keys. Resize separators support Arrow keys. Column chooser buttons provide keyboard alternatives to dragging. Group/tree rows expand with Enter or Left/Right navigation where applicable.

With cell selection enabled, Shift+navigation extends the rectangle; Control/Command+A selects current-page data cells; C/V use clipboard events; D fills down and R fills right. Dragging selects a rectangle with edge auto-scroll; dragging its corner repeats values, and Alt-drag requests numeric series extension. Toolbar copy/paste buttons use native clipboard APIs and show permission failures. Editing inputs retain their native selection/clipboard behavior.

Both row and column windows retain logical ARIA coordinates. `getColumnWindow(columns, options)` is exported for fixed-width horizontal projection, returning rendered-column and spacer entries; pinned and explicitly retained indexes always render. These mechanisms do not support variable row heights, spans or RTL layout.

`CellEditor` provides text, number, date, checkbox, select and textarea controls. BigInt uses text to preserve precision. Async select providers receive an AbortSignal, reject stale responses and expose retry; rich search, virtualized options and multi-select are not implemented. Large text uses the grid's editing host rather than variable row heights. See [editor contracts](EDITORS.md) for custom-host keyboard/error/lifecycle requirements.

`Sparkline` accepts `values: number[]`, optional width (`100`), height (`28`), label (`Trend`) and color (`currentColor`). It renders a labeled SVG line, omitting nonfinite points; it has no tooltips, axes, area/bar modes or integrated chart state. Provide a meaningful text label and, where necessary, a separate accessible data representation.

### Integrated charts

`GridChart` renders a model-reactive SVG bar/line/scatter panel with labeled controls, legend, a table of displayed points and SVG download. Supply `model`, optional `range`, `xColumnId`, `yColumnIds`, `type`, `aggregation`, `height`, `maxPoints` and `ariaLabel`. `computeGridChartData` exports the same pure bounded projection. Numeric values must be finite JavaScript numbers; BigInts/numeric strings are not coerced. Bar/line charts aggregate repeated categories, while scatter plots individual numeric-X rows.

Without a range, charting uses all filtered rows; a range restricts eligible visible rows/columns and invalid endpoints yield an empty chart. Pass a new range prop when the grid's `onCellRangeChange` fires. The chart does not own selection or silently broaden invalid ranges. Point limiting uses deterministic uniform sampling, which can miss intermediate extrema; the panel reports sampling. No full chart persistence, pivot configuration, cross-filtering, zoom/pan, date axis or PNG/JPEG export is supplied. See [chart behavior and limits](CHARTS.md).

Automated browser checks and ARIA attributes do not establish screen-reader conformance. Manual screen-reader verification remains an explicit gap.
