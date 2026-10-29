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

Selection stores stable row IDs. Unknown selection IDs are discarded; removed rows are cleared from selection. There is no selected-cell-range or hierarchical cascade model.

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

## CSV

`model.exportCsv()` serializes visible columns and filtered/sorted rows. `{ allRows: true }` exports source order without filters; `{ selectedOnly: true }` limits either scope by selected IDs. It does not export synthetic group rows or only the current page. Headers and cells are always quoted; quote characters are doubled. Formula-like string prefixes are neutralized with a leading apostrophe, including whitespace/control-character cases. The result is CSV, not XLSX. The React toolbar's download currently requests all source rows.

## React adapter

| Prop                     | Default / purpose                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `model`                  | Required `GridModel<T>`.                                                               |
| `height`                 | `480` pixels for grid viewport; toolbar/status add space outside it.                   |
| `rowHeight`              | `38`, fixed pixel row height.                                                          |
| `overscan`               | `6` rows around the visible window.                                                    |
| `selectionMode`          | `multiple`; also `single` or `none`.                                                   |
| `ariaLabel`              | `Data grid`; use a task-specific name.                                                 |
| `toolbar` / `pagination` | Both `true`; disable pagination for a single virtualized display model.                |
| `className`              | Additional root CSS class.                                                             |
| `renderCell`             | `(context: { value, row, column }) => ReactNode` for data cells.                       |
| `onCellEdit`             | Receives attempted `{ rowId, columnId, value, error? }`; value is the raw input draft. |

Arrow keys move cell focus; Home/End move across a row; Control/Command Home/End move to grid bounds; Page keys move a viewport. Enter/F2 start editing; Escape cancels; Space selects rows; Control/Command Z and Shift Z undo/redo. Shift-click headers adds sort keys. Resize separators support Arrow keys. Column chooser buttons provide keyboard alternatives to dragging. Group/tree rows expand with Enter or Left/Right navigation where applicable.

`Sparkline` accepts `values: number[]`, optional width (`100`), height (`28`), label (`Trend`) and color (`currentColor`). It renders a labeled SVG line, omitting nonfinite points; it has no tooltips, axes, area/bar modes or integrated chart state. Provide a meaningful text label and, where necessary, a separate accessible data representation.

Automated browser checks and ARIA attributes do not establish screen-reader conformance. Manual screen-reader verification remains an explicit gap.
