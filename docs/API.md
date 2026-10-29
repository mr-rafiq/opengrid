# API guide

This is OpenGrid's API, not an AG Grid compatibility layer. The source of truth for complete types is [`packages/core/src/types.ts`](../packages/core/src/types.ts) and the exported client React props in [`data-grid.tsx`](../packages/react/src/data-grid.tsx), with public exports in [`index.tsx`](../packages/react/src/index.tsx). See the [parity ledger](FEATURE_PARITY.md) for supported subsets and missing systems.

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

Edit methods return `undefined` on success or a validation/error string. Parsing and validation precede publication. One invalid member cancels the whole batch; a successful batch creates one undo unit. Row-ID edits are rejected. Default history limit is 100. New edits invalidate redo. This batch API remains distinct from the staged whole-row session and modal workflow described below.

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

`createFormulaGrid({...gridOptions,formulaColumns,formulaGridLimits?,formulaLimits?,validateFormulaResult?})` supplies a separate `{model,formulas}` adapter. `formulaInput(expression)` creates an explicit frozen atom; ordinary equals-prefixed strings remain literals. Its computed `getValue` feeds real model operations, while registered React grids automatically seed the raw Formula/Literal editor. The controller exposes raw inputs/results and atomic edits, fixed identities and shared history. Raw `column.validate` and final-sheet `validateFormulaResult` have distinct contracts; typed errors project to null for scalar pipelines and remain available from `getResult`. Full-row sessions, structural changes, rich authoring and formula-reference rewriting remain open. See [editable formula grids](FORMULA_GRID.md).

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

Both stores remain independent of the client `DataGrid`, with separate read-only React bindings. `ServerDataGrid` renders authoritative blocks, server sort/filter, route drilldown/breadcrumbs, paging, loading/retry and loaded-page selection. It has no mixed-route expansion, server-wide selection/write editing or automatic pivot schema. `LiveViewportDataGrid` binds sparse absolute indexes, placeholders, scrolling subscriptions and logical keyboard focus, with bounded physical scroll space. It is fixed-height/read-only; query configuration is external and interactive selection/column editing are absent. Unmount detaches React observers; the model owner calls dispose. See [provider contracts](REMOTE_MODELS.md) and [binding APIs](REMOTE_GRIDS.md).

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

`onCellRangeChange` receives an initial snapshot when attached and subsequent semantic range or active-view changes. Replacing a handler function or editing values without changing range/view identity does not replay the selection; the newest handler receives the next event. Observe the model separately when a consumer also needs data-value changes.

## CSV

`model.exportCsv()` serializes visible columns and filtered/sorted rows. `{ allRows: true }` exports source order without filters; `{ selectedOnly: true }` limits either scope by selected IDs. It does not export synthetic group rows or only the current page. Headers and cells are always quoted; quote characters are doubled. Formula-like string prefixes are neutralized with a leading apostrophe, including whitespace/control-character cases. The result is CSV, not XLSX. The React toolbar's download currently requests all source rows.

## Optional XLSX and PDF package

`@opengrid/export` exports `exportXlsx`, `exportWorkbook` and `exportPdf`, returning promises of actual `Uint8Array` file bytes. Its dynamically loaded ExcelJS/pdf-lib dependencies stay out of the neutral core. Read [export options and examples](EXPORTS.md) before relying on format support.

Both default to filtered/sorted data rows and visible columns; group collapse/pagination do not restrict them. `selectedOnly` requires a matching `getRowId` callback. XLSX defaults to raw typed values; PDF defaults to formatters. Exporters do not infer custom React cell DOM content or initiate downloads themselves.

XLSX supports multiple sheets, typed cells, widths/colors/number formats, freeze panes, tables and explicitly opted-in formula descriptors. BigInt is written as exact decimal text. Ordinary formula-like text stays a string. Images/notes/hyperlinks/protection/group layout remain absent. A separate bounded `importXlsx` is now exported; see the import section below. PDF provides A4/Letter pagination, wrapping/repeated headers and page numbers, using WinAnsi Helvetica; unsupported Unicode/CJK/RTL text rejects. No custom fonts, images, links, watermarks or horizontal pagination are supplied.

## React adapter

| Prop                     | Default / purpose                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `model`                  | Required `GridModel<T>`.                                                                                                  |
| `height`                 | `480` pixels for grid viewport; toolbar/status add space outside it.                                                      |
| `rowHeight`              | `38`, fixed pixel row height.                                                                                             |
| `overscan`               | `6` rows around the visible window.                                                                                       |
| `columnOverscan`         | `200` pixels around the horizontal window.                                                                                |
| `virtualizeColumns`      | `true`; retain pinned/focused columns while windowing other fixed-width columns.                                          |
| `selectionMode`          | `multiple`; also `single` or `none`.                                                                                      |
| `cellSelection`          | `true`; enables one rectangular range, clipboard and fill interactions independently of row selection.                    |
| `onCellRangeChange`      | Receives `CellRange` or `null`; pass it to a sibling chart when desired.                                                  |
| `editorOptions`          | Per-column `{ type?, options?, asyncOptions?, searchMode? }` configuration; `richSelect` uses a staged searchable dialog. |
| `renderEditor`           | Custom `CellEditorRenderer<T>`; keep the supplied draft/commit/cancel/error contract.                                     |
| `ariaLabel`              | `Data grid`; use a task-specific name.                                                                                    |
| `toolbar` / `pagination` | Both `true`; disable pagination for a single virtualized display model.                                                   |
| `className`              | Additional root CSS class.                                                                                                |
| `renderCell`             | `(context: { value, row, column }) => ReactNode` for data cells.                                                          |
| `onCellEdit`             | Receives attempted `{ rowId, columnId, value, error? }`; value is the raw input draft.                                    |

Arrow keys move cell focus; Home/End move across a row; Control/Command Home/End move to grid bounds; Page keys move a viewport. Enter/F2 start editing; Escape cancels; Space selects rows; Control/Command Z and Shift Z undo/redo. Shift-click headers adds sort keys. Resize separators support Arrow keys. Column chooser buttons provide keyboard alternatives to dragging. Group/tree rows expand with Enter or Left/Right navigation where applicable.

With cell selection enabled, Shift+navigation extends the rectangle; Control/Command+A selects current-page data cells; C/V use clipboard events; D fills down and R fills right. Dragging selects a rectangle with edge auto-scroll; dragging its corner repeats values, and Alt-drag requests numeric series extension. Toolbar copy/paste buttons use native clipboard APIs and show permission failures. Editing inputs retain their native selection/clipboard behavior.

Both row and column windows retain logical ARIA coordinates. `getColumnWindow(columns, options)` is exported for fixed-width horizontal projection, returning rendered-column and spacer entries; pinned and explicitly retained indexes always render. It accepts explicit `direction`; its scroll offset is a positive distance from inline start. Independent merged spans use owner-aware geometry and remain clipped at pin boundaries. Client row geometry uses explicit variable heights and prefix sums; see the layout section below.

`CellEditor` provides text, number, date, checkbox, select and textarea controls. BigInt uses text to preserve precision. Async select providers receive an AbortSignal, reject stale responses and expose retry. `richSelect` adds bounded searchable/virtualized single-string choices, staged Apply/Cancel and row-form integration; multi-select, complex objects and remote query text remain open. See [rich choices](RICH_SELECT.md). Large text uses the grid's editing host rather than variable row heights. See [editor contracts](EDITORS.md) for custom-host keyboard/error/lifecycle requirements.

`Sparkline` accepts `values: number[]`, optional width (`100`), height (`28`), label (`Trend`) and color (`currentColor`). It renders a labeled SVG line, omitting nonfinite points; it has no tooltips, axes, area/bar modes or integrated chart state. Provide a meaningful text label and, where necessary, a separate accessible data representation.

### Integrated charts

`GridChart` renders a model-reactive SVG bar/line/scatter panel with labeled controls, legend, a table of displayed points and SVG download. Supply `model`, optional `range`, `xColumnId`, `yColumnIds`, `type`, `aggregation`, `height`, `maxPoints` and `ariaLabel`. `computeGridChartData` exports the same pure bounded projection. Numeric values must be finite JavaScript numbers; BigInts/numeric strings are not coerced. Bar/line charts aggregate repeated categories, while scatter plots individual numeric-X rows.

Without a range, charting uses all filtered rows; a range restricts eligible visible rows/columns and invalid endpoints yield an empty chart. Pass a new range prop when the grid's `onCellRangeChange` fires. The chart does not own selection or silently broaden invalid ranges. Point limiting uses deterministic uniform sampling, which can miss intermediate extrema; the panel reports sampling. No full chart persistence, pivot configuration, cross-filtering, zoom/pan, date axis or PNG/JPEG export is supplied. See [chart behavior and limits](CHARTS.md).

Automated browser checks and ARIA attributes do not establish screen-reader conformance. Manual screen-reader verification remains an explicit gap.

## Advanced filter trees and builder

`setAdvancedFilter(expression)` accepts a typed immutable condition/AND/OR/NOT AST; `setExternalFilter(predicate?)` replaces/removes a synchronous application callback. Per-column conditions, the tree, external predicate and quick terms compose with AND. Invalid trees throw `AdvancedFilterValidationError` before changing state; valid trees are detached/frozen under resource budgets. Advanced BigInt/Date operands normalize for JSON; ordinary filter values retain their separate persistence policy. External predicates stay outside serialized state and do not automatically run remotely.

`AdvancedFilterBuilder` edits a controlled draft with Apply/Clear/Cancel, nested groups and typed operands. DataGrid's `advancedFiltering` defaults true. It is not the reference expression syntax, an async filter service or a multi/custom-component lifecycle. See [AST](ADVANCED_FILTERS.md) and [builder](FILTER_BUILDER.md).

## Find and notes

`createFindModel(grid, options?)` searches literal formatted text without filtering rows. It offers stable snapshots, wrapping next/previous/select navigation, refresh and lazy subscriptions. The client Find bar highlights matching cells, shows counts and focuses matches through virtual scrolling. Its view is current-page visible data rows; no regex/replace, occurrence offsets or server-wide search. Control/Command F opens the bar when toolbar is enabled.

`CellNotesStore` / `createCellNotesStore` keep bounded stable-ID plain-text annotations independently of row fields/history. Versioned JSON import replaces atomically; persistence and pruning are explicit. DataGrid accepts `notes` as a supplied store, false to disable, or an owned default store. Note markers, toolbar/Alt N and `CellNoteDialog` provide add/edit/delete with native modal focus and literal text rendering. No rich text, collaboration or author metadata. See [Find/notes](FIND_NOTES.md) and [notes UI](NOTES_UI.md).

## Variable heights, detail blocks and grouped headers

`getRowHeight(node)` overrides the client row's fallback `rowHeight`. `createRowLayout(heights)` supplies immutable prefix offsets and binary-search windows; callback-provided dimensions are not automatic DOM measurements. `renderDetail({row,rowId})` renders client detail content, including a separately owned nested grid. `detailHeight` defaults to 180 and accepts a number/row callback. Expansion is uncontrolled through `defaultExpandedDetailRows` or controlled through `expandedDetailRows` plus `onExpandedDetailRowsChange`. Alt Enter toggles a focused data row's detail. The application owns nested model lifecycle/data refresh; there is no ResizeObserver sizing or remote master/detail strategy. See [layout](ROW_LAYOUT.md).

`Column.groupPath` supplies nested header labels; `columnGroups` defaults true. `computeHeaderGroups` and `HeaderGroupRows` split contiguous segments by pin region, retain logical spans/positions through horizontal windows and support a collapse callback. Client DataGrid collapse keeps a representative visible leaf and restores prior visibility on expansion. There is no married-child policy, group-resize distribution or group drag. See [groups](COLUMN_GROUPS.md).

## Whole-row sessions and modal editor

DataGrid now accepts `editMode: 'cell' | 'row'` (default `cell`), `rowConflictPolicy: 'reject' | 'overwrite'` (default `reject`), and `onRowEdit({ rowId })`. Row mode opens `RowEditDialog` through editing keys/double-click or the Edit row toolbar button and restores grid focus when closed. The callback reports a successful row commit; `onCellEdit` remains the inline cell-attempt callback. This mode is an explicit-save modal, not automatic inline full-row blur saving.

`createRowEditSession(model,rowId,{conflictPolicy?})` stages eligible raw fields, exposes values/dirty columns through a stable snapshot, and commits one atomic parsed/validated batch or cancels locally. Validators see final staged rows; raw-field aliases are coordinated. Default conflict handling rejects external edits to dirty fields; explicit overwrite is available.

`RowEditDialog` takes model, rowId, onClose and optional editor configuration, renderEditor, initialColumnId, conflictPolicy and onCommit. It supports Save/Cancel/confirmed reload, typed/async/custom editors and one-step undo. This is a modal explicit-save workflow rather than inline blur-to-save or backend persistence. See [sessions](ROW_EDIT.md) and [dialog](ROW_EDITOR_UI.md).

## Bounded XLSX import

`importXlsx(bytes,{columns,mapRow,...limits})` returns a validated typed preview plus warnings; it never mutates a grid. Header/schema mapping, parsers and final-row validators run before returning rows. Callers review the preview and explicitly choose model replacement/transactions.

Every ZIP/XML part is preflighted using actual expanded-byte/count/depth budgets before workbook parsing. Formula policy defaults reject; cached/text modes are explicit and never execute formulas. Ordinary XLSX only: merges/named ranges, macros, encrypted/ZIP64/legacy workbooks and general workbook fidelity are unsupported/rejected. See [import](IMPORT.md) for precision, limits and warning semantics.

## Optional getter cache

`GridOptions.valueCache` defaults false; true enables bounded LRU memoization of valueGetter results for current resident rows. `valueCacheMaxEntries` defaults 100,000, capped at 1,000,000 entries. Data changes/undo/redo invalidate generations; `expireValueCache()` refreshes getters/derived models for changed closure dependencies. Raw fields/formatters are not memoized; getters must remain pure and their returned objects immutable by convention. No granular dependency/never-expire policy or throughput guarantee. See [cache](VALUE_CACHE.md).

## Analytical display transforms

`transformValues(matrix, { columns, transform, totals?, limits? })` projects a pivot/aggregate matrix without changing raw values, row order or grid state. Explicitly select columns of **one compatible measure**; opaque column IDs do not identify units or hierarchy automatically. Supported modes are percent of row/column/grand total and percent of parent row/column total, plus running total, difference from previous and percent difference from previous along the supplied row/column order. Parent modes require explicit per-cell denominator tables; ordinary totals can be overridden for non-additive/subtotal-aware calculations.

Number percentages are fractions (`0.25` means 25%). BigInt ratios remain reduced exact `ValueRatio` fractions; `formatValueRatio` formats them with bounded rounding without converting to Number. Mixed nonzero Number/BigInt measures reject. Blank/invalid/zero-denominator/overflow cases produce null cells and diagnostics; malformed configuration or budgets reject. No automatic parent discovery, menu/state integration, display-value sorting/filtering or server calculation is supplied. See [Show Values As](SHOW_VALUES_AS.md) for all five percentage modes, ordered differences, precision and limits.

## Static browser print view

`GridPrintView` renders a separate bounded HTML table from a detached string-only snapshot. It captures model values, marks later model changes stale and requires an explicit Refresh to recapture. `scope` is filtered (default), view, page, selected or all; selected intersects current filtered rows, while view/page preserve visible group labels/aggregates/depth. Only visible columns are captured; custom React renderer/detail content is not scraped.

`maxRows` defaults 1,000 (hard maximum 10,000) and `maxCells` defaults 100,000 (hard maximum 1,000,000, including headers). Exceeding limits rejects instead of truncating. The explicit Print snapshot button calls `window.print`, isolates the selected snapshot through print-only CSS and restores markers/listeners after printing/cleanup. Page size/orientation and repeated-header/break requests remain browser/printer dependent. `buildGridPrintSnapshot` exports the same pure projection. This is browser printing, distinct from `exportPdf` file bytes. See [printing](PRINTING.md).

## Shared aligned-column state

`createAlignedColumns(models, { properties?, initialSourceIndex? })` links two through 32 distinct structural column models, even with different row types. It aligns only IDs present in **every** model. Properties default to order, width, visibility and pinning; a selected subset can be supplied. Initialization is synchronous from source index zero by default. Shared order replaces shared slots while nonshared columns retain their own positions/properties; widths use the intersection of participating constraints.

The returned link exposes frozen `sharedColumnIds` and `dispose` to detach listeners. No-op fingerprints and bounded queued propagation prevent ordinary feedback loops; invalid schema/constraints or failed convergence report errors and detach rather than continuing indefinitely. Recreate links after schema changes. This is column-state alignment only: no horizontal scroll synchronization, row/filter/selection sharing or complete aligned-grid compatibility.

Read the [alignment guide](ALIGNED_COLUMNS.md) for initialization, effect ownership and failure semantics; [focused tests](../packages/core/src/aligned-columns.test.ts) cover those boundaries. Runtime failure can leave already-applied values and is not a distributed transaction.

## Pinned and full-width rows

`DataGrid` accepts `pinnedTopRowIds` and `pinnedBottomRowIds`. Visible leaf records in the current page (or expanded view when pagination is off) move into ordered sticky bands, with one rendered instance per ID. Absent/filtered/collapsed/off-page IDs are ignored, top wins duplicate requests, and at most 1,000 combined requests are accepted. Bands remain mounted; the viewport expands when necessary to retain a usable body. Core sorting, filtering, pagination, aggregates and exports remain unchanged.

`isFullWidthRow(node)` with `renderFullWidthRow({node,rowId,rowPinned,viewportWidth})` renders one gridcell spanning all logical columns. It uses the declared row height and remains a keyboard row target, while ordinary cell ranges/Find exclude its absent per-column cells. Interactive descendants own their controls. Optional detail blocks remain separately counted and can open with Alt+Enter. Stable-ID focus, editing and ranges continue across ordinary pinned rows. No automatic height measurement or split left/center/right renderer is supplied. See [projection and adapter contract](PINNED_FULL_WIDTH_ROWS.md).

## Calculated columns

`createCalculatedGrid({...gridOptions,calculatedColumns,calculationCacheMaxEntries?,calculationLimits?})` returns `{model,calculations}`. Definitions compile once and add read-only number/text/boolean columns. Same-row `[columnId]` references and safe formula operations feed actual sorting, typed/advanced/quick filtering, grouping/aggregation and exports. A1 addresses and ranges are rejected in this mode; the separate cell formula engine retains its own positional language.

The controller exposes `getResult(rowId,columnId)`, `evaluate(row,columnId)`, `getDefinitions()`, `getDependencies(columnId)`, `getStats()`, `expire()` and `dispose()`. Typed errors project to null in data operations and error labels in cells; raw rows remain unchanged. Bounded cached results track model snapshot and canonical row identity, while transient failures can retry. Getter evaluation emits no notifications or model subscriptions. Explicit expiry refreshes the model; reusable cache-only disposal supports Strict Mode cleanup.

Schemas remain fixed per instance. Applying edited definitions recreates a model with explicitly compatible state and resets history; this is demonstrated in the authoring lab. No implicit schema migration, BigInt/date formula evaluation, pivot definition management or backend persistence is supplied. See [calculated columns](CALCULATED_COLUMNS.md).

## Custom filter components

`DataGrid.filterComponents` maps column IDs to React component types accepting `ColumnFilterProps<T>`. The grid supplies the column, optional source `model`, controlled filter, accessible label and bound `onFilterChange`/`onClear` callbacks. Components use normal React lifecycle; persisted filters survive hiding/unmounting and focused native/custom filter columns stay mounted through horizontal virtualization. The native input remains the default.

`NumberRangeFilter` provides inclusive number, exact BigInt-string and ISO-date/timestamp bounds. Invalid or reversed drafts keep the last valid applied filter and show an associated error; external filter changes resynchronize the controls. Multiple independent component instances and AND/OR multi-filter panels are not implemented by this registry. See [custom filters](CUSTOM_FILTERS.md).

`SetListFilter` provides searchable, paged native checkbox choices over all resident source rows, staged Apply/Cancel/Clear, explicit-empty membership and incoming data/filter reconciliation. It uses `createSetFilterIndex(model, columnId, limits?)`, with frozen scalar entries and exact canonical membership independent of formatted labels. Both index and UI enforce documented row/value/text bounds. Tree/remote lists and independent multi-filter panels remain unsupported. See [set-list identity, updates and limits](SET_FILTERS.md).

## Managed row moving

`model.moveRows(ids, targetId, "before" | "after")` moves resident rows in canonical order as one undo step. It returns an error string for invalid requests or disabled views, and `undefined` for success or a validated no-op. `getRowReorderStatus()` exposes an immutable allowed result or a precise reason without running user predicates. Selection and original row objects are preserved; `setRows` and transactions retain their existing history-reset semantics. See [history and validation](ROW_REORDER.md).

Enable `DataGrid.rowDragging` for single-row native handles, before/after indicators, body-edge scrolling, Alt+Up/Down and accessible toolbar controls. Moves stay in the current page; sorting/filtering/grouping/tree/read-only models and incompatible active layouts disable movement visibly. `onRowMove` receives accepted non-noop operations. Foreign/stale/cancelled drags never write. See [React interaction and limits](ROW_DRAGGING_UI.md).

## Column spans

`Column.colSpan` accepts a positive safe integer or pure `(row) => number` callback. Client `DataGrid` clips spans to their pin region and renders only the owner, while preserving logical header/filter positions and ARIA column indices. Navigation, editing, notes and Find resolve owners; hidden/covered drafts cancel. Rectangular range, grid clipboard and fill operations are disabled visibly whenever span metadata is configured. Row selection, native editor text clipboard and separate full-row form fields remain available.

The React package exports `createColumnSpanPlan`, `getColumnSpanOwner` and `getColumnSpanWindow` for bounded immutable geometry. Separate vertical and combined rectangular planners support row spans; remote adapter layout and merged exports remain unsupported. See [column spans](COLUMN_SPANS.md), [row spans](ROW_SPANS.md) and [combined spans](COMBINED_SPANS.md) for callback behavior, budgets, cache and focus semantics.

## Row spans

`Column.spanRows` accepts `true` for raw `Object.is` equality or a pure `(previousRow,nextRow) => boolean` predicate. Client DataGrid merges eligible adjacent leaf cells within the current projected page/pin region. Synthetic, nonleaf, full-width and expanded-detail rows, depth changes and geometry gaps break runs. Owners retain original IDs and logical ARIA positions; covered cells are absent. Offscreen anchors render only intersecting merged cells.

Owner editing changes only the source owner row. Enter resolves the next logical row against the new run plan; Down skips a merged run. Find and notes target owners, row selection remains per source row, and the separate row form retains all visible fields. Configured row spans disable rectangular grid clipboard/fill and managed row movement. Combined active row/column spans use the separate bounded rectangular-ownership contract.

`createRowSpanPlan` exports compact immutable runs with binary `ownerAt`/`intersecting` lookups. Limits are 100,000 rows, eight active span columns, one million work units and 1000 rows per run; limits can be tightened. Auto-measured heights, merged exports and remote adapters remain unsupported. See [row spans](ROW_SPANS.md).

## UI localization

Wrap built-ins with `GridLocaleProvider locale={esES}` (or `enUS`) and optional typed `messages` overrides. `createGridLocale(id, overrides, base?)` builds a custom bundle with English fallback by default. `useGridLocale()` exposes typed `t`, `resolveMessage`, the locale tag and Intl number/date/plural helpers. Built-in roots set HTML lang; the document language is not mutated.

`gridMessage(key, params?)` creates a frozen language-independent descriptor for stored UI notices. Resolving during render retranslates an already-visible notice without resetting its workflow. Application headers/values/choices/formatters and raw errors remain application-owned; legacy core diagnostics can remain English. Explicit RTL geometry and touch interactions are separate presentation workflows; automatic locale-aware data parsing remains open. See [localization](LOCALIZATION.md), [RTL layout](RTL.md) and [touch](TOUCH.md).

## Layout direction

`DataGrid`, `ServerDataGrid` and `LiveViewportDataGrid` accept `direction?: "ltr" | "rtl"` (default `"ltr"`). Physical pin sides remain stable. Inline order, horizontal navigation, resize controls, header/merged geometry and range/Find order follow the displayed direction. Switching direction preserves the model and active workflow; focused unpinned cells are revealed when needed. UI language and export ordering are independent.

The React package exports `normalizeScrollLeft(native, maximum, direction)`, `denormalizeScrollLeft(inline, maximum, direction)`, `getInlineColumnOrder(columns, direction)` and `createDirectionLayout(options)`. Native negative RTL offsets are normalized to positive inline distances by default. Explicit legacy endpoint models are helper options, not automatic browser detection. Range/Find core options accept `getColumnIds` for a validated ordered subset of visible columns. See [RTL](RTL.md) for contracts and limits.

## Touch workflow

Ordinary touch cell backgrounds retain native pan/pinch behavior. Completed taps focus/select; guarded double-tap or the Edit cell action opens the configured editor. Extend range retains a valid current anchor and lets users scroll before tapping an endpoint. Fill mode chooses copy or numeric series for the dedicated fill grip; release uses the existing atomic validation/history pipeline.

Pointer resizing previews local geometry and commits a changed width once on release, for mouse, pen and touch. Captured gestures track their owning primary pointer and cancel on interruption, stale model/view state or unmount. Touch header/group/row drag-and-drop and physical-device coverage remain open. See [touch interaction](TOUCH.md).

## Rectangular merged cells

Client DataGrid combines colSpan and spanRows through matching horizontal footprints before joining vertical runs. React exports createCombinedRowSpanPlan, CombinedSpanColumn, CombinedSpanOptions and COMBINED_SPAN_LIMITS. Combined mode has a 100,000 projected-cell budget. See [rectangular merged cells](COMBINED_SPANS.md) for ownership, virtualization, interaction and remaining limits.

## Column sizing

DataGrid accepts sizingRef for explicit proportional sizeColumnsToFit, rendered-text sizing, resolved-width snapshots and manual-override reset. GridModel.getColumnWidthDefaults returns frozen original widths; core fitColumnWidths provides the pure constrained proportional allocation. Column.flex enables constrained measured-container allocation. See [column sizing](COLUMN_SIZING.md) for exact signatures, reports, budgets and limitations.

## Column condition filters

ScalarFilter contains the scalar operators, including notContains. CompoundFilter joins 1–16 scalar conditions with op and/or; Filter is their union. Advanced AST condition leaves remain ScalarFilter. Core preparation helpers own and validate new groups before client/remote state mutation.

ColumnConditionFilter registers through filterComponents and defaults to four staged conditions (configurable to 16). ColumnFilterProps.getFilter optionally reads the latest authoritative applied filter for conflict fencing. DataGrid supplies it from current model state; DataGridProps.getColumnFilter can override that read for an adapter, and ServerDataGrid uses the provider query. The getter guards popups and does not replace rendered model state. See [typed column conditions](COLUMN_FILTERS.md).

## Resident subtree selection

`DataGrid.hierarchySelection` accepts `self` (default), `subtree` or `filteredSubtree` in multiple-selection mode. Subtrees include real source parents when eligible, independently of collapse/pages, and preserve selections outside the action. Header actions union represented page subtrees; native mixed state and Space use the same model operation. The headless `model.getHierarchySelectionPlan({filtered?: boolean})` and `createHierarchySelectionPlan(roots,{eligibleRowIds?})` expose compact immutable counts/unions and atomic next-ID snapshots. These are resident source operations, not remote/global selection or reference API compatibility. See [hierarchy selection](HIERARCHY_SELECTION.md) for exact bounds, fresh-state fences and parent semantics.
