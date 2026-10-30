# Infinite rows

`InfiniteRowModel<T>` pulls flat blocks as a visible window moves. `InfiniteDataGrid<T>` binds it to read-only React scrolling. It supports unknown totals that extend until a terminal result, exact totals, bounded LRU caching, bounded concurrent requests, explicit retry and generation cancellation. This is an original API; it does not claim complete [AG Grid infinite-model](https://www.ag-grid.com/react-data-grid/infinite-scrolling/) compatibility.

The older `InfiniteDataSource<T>` remains available with its exact-count, manually called `loadBlock` API. The hierarchical `ServerSideRowModel` and push-based `LiveViewportRowModel` remain distinct strategies. Sharing sparse rendering does not turn an infinite provider into a subscription or grouped backend.

## Quick start

Use the packages built from this repository; package installation instructions remain in the [source quick start](../README.md#react-quick-start).

```tsx
import { InfiniteRowModel, type Column } from "@opengrid/core";
import { InfiniteDataGrid } from "@opengrid/react";
import "@opengrid/react/styles.css";

type Order = { id: string; customer: string; amount: number };
const columns: Column<Order>[] = [
  { id: "customer", field: "customer", header: "Customer", pinned: "left" },
  { id: "amount", field: "amount", header: "Amount", type: "number" },
];

// Construct once outside rendering, or in a stable owner with explicit cleanup.
const model = new InfiniteRowModel<Order>(
  {
    async getRows({ signal, ...query }) {
      const response = await fetch("/api/orders/window", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      if (!response.ok) throw new Error("Loading orders failed");
      return response.json();
    },
  },
  { getRowId: (row) => row.id, blockSize: 100, maxBlocks: 10 },
);

<InfiniteDataGrid model={model} columns={columns} height={420} />;
// The model's application owner eventually calls model.dispose().
```

The transport must serialize any non-JSON query values, including BigInt filters, explicitly. No backend, authentication or retry transport is installed by the component.

## Provider and terminal counts

`InfiniteProvider<T>.getRows` receives `DataRequest`: `{ startRow, endRow, sorting, filters, signal }`. End indexes are exclusive. It returns a promise of `{ rows: T[], rowCount?: number | null }`. The provider executes sorting and filtering over the full dataset. The grid renders its authoritative order; resident cache rows are never sorted into a substitute query result.

- With an exact count, return exactly `min(blockSize, max(0, rowCount - startRow))` rows. Beyond the end, return an empty array and the same exact count.
- With an unknown count, a full block may omit `rowCount` or use null. Its acceptance extends the estimated scroll space by one further block.
- A short nonempty block without a count infers `startRow + rows.length` as the terminal count. An initially empty block at zero establishes zero rows.
- An empty block at a previously accepted full-data boundary can establish that boundary as the count, including after that block was evicted. An empty unknown block after a far jump cannot establish an exact total and rejects; return an explicit count for that case.

Counts must be nonnegative safe integers. Counts and complete block lengths must agree within a query/refresh generation. A reported terminal count cannot precede an already accepted row, including one whose cache block was evicted. Changing dataset membership requires `refresh()` or a query change. Invalid responses become visible errors without partially publishing their rows or count.

`getRowId` is a captured pure callback, called on owned response rows. IDs must be nonempty strings of at most 1,024 characters and unique among resident blocks. The application remains responsible for stable dataset identities. Source responses and `getRow()` results are detached copies; published snapshot records/arrays are frozen and detached from the internal cache. Mutable platform objects such as Date/Map retain their JavaScript semantics; record freezing is not a security membrane for their methods.

## Bounds and lifecycle

| Option          | Default                            | Maximum / behavior                                                      |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `blockSize`     | 100                                | 10,000 rows                                                             |
| `maxBlocks`     | 10                                 | 1,000 blocks; configured cache capacity at most 1,000,000 rows          |
| `maxConcurrent` | 2                                  | 16 outstanding provider requests                                        |
| `buffer`        | 0                                  | 10,000 additional rows on each side, subject to the window/cache limits |
| `maxWindowSize` | min(10,000, blockSize × maxBlocks) | 10,000 requested buffered rows                                          |
| `query`         | empty sorting/filters              | Detached validated sort/filter settings                                 |

The complete buffered window must fit both its row limit and the block cache, including block alignment. Oversized/unsafe viewport requests reject before replacing the current window. Active window blocks are pinned; other cached blocks use LRU eviction. Queue, errors and active pending ownership stay bounded by the requested blocks. Snapshot rows contain only the current buffered window; no array proportional to the complete dataset is allocated.

Actual outstanding provider promises occupy concurrency slots until they settle. Canceling a request that ignores `AbortSignal` does not free its slot and create unlimited orphan work. A provider that ignores cancellation and never settles can therefore delay new requests. Pass the signal through the transport. Stale responses are ignored using both generation and request ownership. Synchronous abort listeners that install newer queries/windows retain the newer view.

Construction and SSR do not fetch. `setViewport(start, end)` schedules missing blocks, deduplicates active requests and reuses cache entries. It does not automatically retry a failed block. `retry()` clears active-window errors and retries them. `refresh()` clears cache/count/error generations and reloads the same logical viewport. `setQuery(patch)` validates first, then invalidates and starts the new query at row zero with the previous window size. `getQuery()` returns a detached copy. `getRow(index)` reads a detached cached data row or undefined.

`subscribe` and `getSnapshot` expose stable snapshots with `revision`, `queryRevision`, requested `viewport`, buffered `window`, sparse `{ index, id, data }` rows, `rowCount`, `estimatedRowCount`, loading/error/disposed state, and bounded `cachedBlocks`, `pendingBlocks`, `queuedBlocks`, `failedBlocks` metadata. Displayed provider errors are capped at 4,096 characters; blank or unreadable thrown values get a nonempty fallback so Retry remains available. `dispose()` is idempotent, aborts pending ownership, clears caches/observers and prevents further mutations/subscriptions. React unmount only detaches its observers; it does not dispose the borrowed model. Use one model per independently scrolling view.

## React behavior

Props match the sparse live renderer: `model`, `columns`, optional `height`, `rowHeight`, `overscan`, `direction`, `ariaLabel`, `className` and `renderCell`. The component keeps fixed-height rows, pinned columns, horizontal column windows and a bounded eight-million-pixel physical scroll space. Query controls are application-owned; call `model.setQuery({ sorting, filters })`. A new query or replacement model resets vertical scroll; refresh retains it.

Arrow, Home/End, Page Up/Down and Control/Cmd+Home/End navigate absolute indexes and request missing blocks. Unknown totals use `aria-rowcount=-1`; Control/Cmd+End reaches the current estimated end until a terminal response supplies the final count. Keyboard focus remains on a loading cell as its data arrives. If a terminal count removes that placeholder, grid-owned focus moves to the last valid row; intentional outside focus is retained. Loading cells have accessible labels and busy rows. Direction/language changes retain provider/cache and focused cells.

The Remote model lab uses generated delayed local records: unknown 137-row and exact million-row datasets, actual provider sort/filter, simulated failure/retry, cache metadata and the last eight requests. It creates only requested data, has 22 columns with both pin sides, and uses no external service.

## Verification and remaining scope

Core tests cover bounds, sparse ownership, unknown/terminal counts, invalid/contradictory responses, LRU/pinning, request caps, late generations, synchronous abort reentrancy, explicit retry and disposal. React tests cover real pull windows, source queries, SSR, replacement, retained live behavior, terminal focus, outside focus, localization/RTL and bounded million-row DOM. Real Chromium flows exercise the actual demo, provider queries, terminal discovery, retry, pinning/RTL and axe. Executed results belong in [verification](VERIFICATION.md).

Still partial: no infinite row edits/paste/write transactions, server-wide selection/ranges/notes, grouping/pivot/aggregation, interactive column resize/reorder, variable-height/merged rows, automatic query controls, targeted block refresh, debounce/prefetch policies, transport backoff or complete reference API parity. Browser/DOM checks are not a throughput benchmark, physical-device or manual screen-reader certification.
