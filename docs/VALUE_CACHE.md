# Optional value-getter cache

OpenGrid can memoize expensive `Column.valueGetter` results in a bounded least-recently-used cache. It is disabled by default. Enable it when getters are pure and row data follows the model's immutable ownership contract.

```ts
const model = createGrid({
  rows,
  columns: [
    { id: "description", field: "description" },
    {
      id: "total",
      valueGetter: (row) => expensiveCalculation(row),
      type: "number",
    },
  ],
  getRowId: (row) => row.id,
  valueCache: true,
  valueCacheMaxEntries: 100_000, // optional; this is the default
});
```

## API and bounds

| Option or method                            | Behavior                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GridOptions.valueCache?: boolean`          | Enables getter memoization; default `false`                                        |
| `GridOptions.valueCacheMaxEntries?: number` | Shared entry capacity across all rows and columns; default `100000`                |
| `GridModel.expireValueCache(): void`        | Clears all getter entries and derived filter/row caches, then notifies subscribers |

The capacity must be a positive safe integer no larger than `1000000`, even if caching is currently disabled. Invalid values throw `RangeError` during model creation; nonboolean enablement throws `TypeError`. The limit bounds entry count, not the size of objects a getter returns.

## Canonical rows and cache keys

Only getter reads for resident canonical row objects participate. The model verifies that `model.getRow(rowId) === row` before caching. A foreign object with the same ID is evaluated separately and cannot reuse, replace or evict the canonical row's cached entry. Nonresident IDs do not populate this cache.

Keys are JSON tuples of `[rowId, columnId]`, avoiding collisions between delimiter-containing or prototype-like identifiers. The cache holds results exactly as returned, including `undefined`, `null`, `false`, zero, empty strings and BigInt. A thrown getter exception propagates and is never stored, so later calls can retry.

Every hit moves the entry to the most recently used position. Inserting beyond the configured capacity evicts the least recently used entry. Different columns and rows share one capacity; there is no unbounded per-row secondary cache.

The existing stable-ID row index is reused to check canonical identity. A model row remains the same logical entity through sorting/filtering, but replacing it with a different object makes the old object a foreign row for cache purposes.

## Preservation and invalidation

Getter entries survive operations that change only state: sorting, column/advanced/quick filters, selection, pagination, grouping, expansion, and column width/order/visibility/pinning. These operations can recompute derived row models while reusing the getter's result.

Any underlying rows-array replacement clears all getter entries before subsequent notification/use. This includes successful edits and row batches, transactions, `setRows`, undo and redo. The invalidation is deliberately coarse: editing one row also invalidates cached getters on unchanged rows. A parsed no-op or rejected edit does not replace rows and retains cached values. `setRows` creates a new resident array and invalidates even when its supplied row objects are unchanged.

Use explicit expiry when a getter depends on closure/application data that did not replace rows:

```ts
let exchangeRate = 1;
const model = createGrid({
  rows,
  columns: [
    { id: "converted", valueGetter: (row) => row.amount * exchangeRate },
  ],
  getRowId: (row) => row.id,
  valueCache: true,
});

exchangeRate = 1.25;
model.expireValueCache();
```

Expiry invalidates both getter entries and cached filtered/grouped row models, and publishes a fresh stable model snapshot. It does not evaluate getters eagerly. The next read computes fresh results, so closure-dependent filters, sorting, aggregation, exports and cell reads can observe the change. Calling it with getter caching disabled still refreshes derived row caches. It does not create an undo unit or alter layout, filters, selection or row data.

The engine also avoids installing a getter result if rows changed or explicit expiry occurred reentrantly during that calculation. This protects the new cache generation from an old result; it does not make side effects inside getters a supported programming model.

## Purity and ownership contract

With caching enabled, a getter must return a deterministic result for the resident row and its explicitly managed external dependencies. Read IDs and row objects as immutable. Do not mutate model-owned rows, the cached result, column definitions or external dependencies in place and expect automatic observation. Use model edit/transaction/row replacement methods, or expire explicitly.

Getter return values are not deep-cloned or frozen by this feature. Returning a mutable object makes its ownership the application's responsibility. Cyclic getter calls are not resolved by this cache; use the standalone formula engine for managed formula dependencies and cycle diagnostics.

Raw field reads are not memoized by the value cache. `valueFormatter` output is not memoized either. Independent derived query caches may still avoid repeating work until the model changes or expires; do not confuse that existing behavior with a formatter cache. Formula-engine memoization, Find state and remote row-store caches retain their own APIs and invalidation contracts.

## Column group-path metadata

`Column.groupPath?: readonly string[]` records the ordered labels of a column's header ancestry:

```ts
const columns = [
  { id: "quantity", field: "quantity", groupPath: ["Order"] },
  { id: "net", field: "net", groupPath: ["Order", "Totals"] },
  { id: "tax", field: "tax", groupPath: ["Order", "Totals"] },
];
```

The core copies this array at creation and defensively copies it again in every `getColumns()` result. Caller mutation cannot change internal metadata, and mutating a returned array cannot affect later reads. Missing and empty paths are accepted. Nonarrays, nonstring members and sparse arrays reject with `TypeError`. There is no core UI-depth restriction; a renderer may define its own supported display depth and presentation rules.

This metadata does not group row data or alter getter caching. It belongs to column definitions, outside persisted `GridState`. Header rendering, ARIA relationships, pin-boundary splitting and group expand/collapse are separate renderer capabilities, rather than effects of setting this field alone.

## Verification and parity boundary

`core.test.ts` covers default/opt-in behavior, getter invocation counts across state changes, data mutation and undo/redo invalidation, explicit closure expiry, LRU eviction, shared capacity, falsy results, exceptions/retry, foreign and stale row objects, raw/formatter bypass, collision-safe IDs, reentrant invalidation, rejected capacity settings, and defensive group-path copying.

The public AG Grid v36.2.0 [Value Cache](https://www.ag-grid.com/react-data-grid/value-cache/) and [Column Groups](https://www.ag-grid.com/react-data-grid/column-groups/) documentation informed the feature inventory. This implementation and API are original. It supplies an optional bounded getter cache and header metadata, without a granular dependency graph, per-row expiry API, never-expire mode, animation policy or general performance guarantee. Published callback-count tests establish cache behavior; they are not a latency/throughput benchmark.
