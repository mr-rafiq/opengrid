# Server-side and live viewport strategies

OpenGrid has distinct remote-data primitives. They are original APIs, independent of React. They do **not** turn a `DataGrid` client-side `GridModel` into a complete server-backed renderer automatically. A rendering integration must map loaded data, expansion, placeholder/error rows and requested windows into its UI. `InfiniteRowModel` now has a distinct read-only `InfiniteDataGrid` scroll binding with unknown/terminal counts and bounded outstanding requests; see [infinite rows](INFINITE_ROWS.md). The existing `InfiniteDataSource` remains the simpler exact-count, one-shot block loader.

## Hierarchical server-side model

`ServerSideRowModel<T>` stores server-computed child blocks by a group route and block index. The supplied provider owns grouping, aggregation, pivoting, sorting and filtering. OpenGrid sends those query settings to the provider rather than computing a client-side substitute.

```ts
import { ServerSideRowModel, type ServerSideDataSource } from "@opengrid/core";

type Order = { region: string; year: number; revenue: number };
const source: ServerSideDataSource<Order> = {
  async getRows({ signal, ...request }) {
    const result = await fetch("/api/orders/grid", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!result.ok) throw new Error(`Grid request failed: ${result.status}`);
    return result.json();
  },
};

const remote = new ServerSideRowModel(source, {
  blockSize: 100,
  maxBlocks: 10,
  query: {
    rowGroupColumns: ["region"],
    valueColumns: [{ columnId: "revenue", aggregate: "sum" }],
    pivotColumns: ["year"],
    sorting: [{ columnId: "revenue", direction: "desc" }],
  },
});

const root = await remote.loadBlock([], 0);
const firstGroup = root.nodes.find((node) => node.kind === "group");
if (firstGroup?.kind === "group") {
  const children = await remote.loadBlock([firstGroup.key], 0);
}
```

The request is `{ startRow, endRow, groupKeys, rowGroupColumns, valueColumns, pivotColumns, sorting, filters, signal }`. End indexes are exclusive. `groupKeys` contains server-owned string keys from root to parent. For nested groups, append each returned key to that route. Serialize transport-specific values such as BigInt filter arguments explicitly; the JSON example assumes JSON-compatible filter values.

A response contains:

- `nodes`: a complete contiguous block of either `{ kind:'row', id, data }` or `{ kind:'group', id, key, label?, childCount?, aggregates? }`.
- `rowCount`: the **exact child count at that route**, rather than a global leaf count. A full nonterminal block has `blockSize` nodes; the last block has the remaining count. A request beyond the end returns zero nodes and the same count.
- Optional `pivotColumns`: `{ id, header?, path?, valueColumnId? }[]` describing server-generated result columns. A renderer decides how to configure those columns.

Node IDs must be nonempty and unique within each route; group keys and kinds must stay stable for loaded-node updates. Server data should be structured-cloneable, preferably plain JSON-like payloads. Invalid blocks, inconsistent counts, duplicate IDs and malformed pivot metadata reject rather than partially enter the cache. Cache results and snapshots are detached from the provider's objects.

### Cache, refresh and failure behavior

- Concurrent requests to the same route/block deduplicate. Different routes can load concurrently. Successful blocks use a bounded LRU cache; `maxBlocks` limits the number of cached blocks and retained error records, not caller-controlled concurrent requests.
- `getSnapshot()` returns a stable frozen snapshot until a change. It contains `revision`, `blocks`, `loading` and `errors`. `subscribe(listener)` returns an unsubscribe function. Snapshot arrays and ordinary payload objects are read-only; collections with their own mutating methods should not be used as mutable snapshot stores.
- `setQuery(partialQuery)` merges and validates the new query, clears cache/errors and immediately aborts old requests. Results from noncooperative providers are discarded. Existing in-flight promises reject with `AbortError`.
- `loadBlock(route, index)` retries a previously failed block when called again. Errors remain observable by route/block until retry or refresh.
- `await refreshRoute(route, { purge:true, descendants:false })` aborts matching requests and reloads previously cached, loading or failed addresses at that route. `purge:true` is the default. Use `descendants:true` to include the subtree; unrelated routes remain cached. `await refresh()` refreshes all known routes.
- `purge:false` retains old visible blocks while replacements load. If child counts changed across cached blocks, use a purge refresh; the store rejects incompatible route counts instead of mixing positions from different counts.
- `dispose()` aborts outstanding requests, clears cache/listeners and prevents new work. Observe or catch outstanding promises when canceling a view.

### Loaded-node transactions

```ts
remote.applyTransaction(["Europe"], {
  update: [{ kind: "row", id: "order-42", data: updatedOrder }],
});
```

This is an **atomic cache update**, not an HTTP write. Every updated ID must already be loaded at the specified route. Duplicate IDs, missing IDs, changed node kinds and changed group keys reject the whole update. Positions, block lengths and route counts stay fixed. Matching in-flight requests are aborted so a late response cannot overwrite the local cache update. Persist to the server separately, and include explicit group-aggregate updates if required. Add/remove/reorder operations belong on the server followed by purge refresh. No edit history or optimistic server-write protocol is supplied by this class.

## Live viewport model

`LiveViewportRowModel<T>` subscribes to a buffered absolute row-index window and accepts later server pushes. It does not repeatedly fetch independent blocks. Its provider receives `{ startRow, endRow, sorting, filters, signal, onRows, onRowCount, onError }` and must return a cleanup function, synchronously or asynchronously.

```ts
import { LiveViewportRowModel, type ViewportDataSource } from "@opengrid/core";

const liveSource: ViewportDataSource<Order> = {
  subscribe(request) {
    const stream = connectYourServerStream({
      startRow: request.startRow,
      endRow: request.endRow,
      sorting: request.sorting,
      filters: request.filters,
    });
    stream.onRows = (rows) => request.onRows(rows);
    stream.onCount = (count) => request.onRowCount(count);
    stream.onError = (error) => request.onError(error);
    return () => stream.close();
  },
};
const live = new LiveViewportRowModel(liveSource, { buffer: 10 });
live.setViewport(200, 250); // provider initially receives [190, 260)
const stopListening = live.subscribe(() =>
  renderYourWindow(live.getSnapshot()),
);
// Later: live.setViewport(...), live.setQuery(...), live.retry(), live.dispose().
```

`connectYourServerStream` and `renderYourWindow` above are application integration functions, not exported OpenGrid APIs. The transport is intentionally supplied by the application; no WebSocket service, credentials or backend is bundled.

Push rows as `{ index, id, data }[]` with **absolute indexes** within the requested buffered window. `onRows(rows)` merges an atomic update; `onRows(rows, true)` replaces the complete sparse window and is useful after server-side reordering. Duplicate indexes or IDs, indexes outside the subscription window, and indexes beyond a known row count reject the whole batch and populate the error snapshot. Count pushes validate nonnegative safe integers, remove rows beyond a shrinking count and adjust subscriptions when the bounded window changes. An empty dataset retains a count subscription so later growth can resume rows. An explicitly empty visible viewport starts no subscription.

Changing the viewport aborts and cleans up the previous generation, retaining only overlap in the new window. Late row/count/error callbacks cannot modify the new generation. Sorting/filter changes clear rows and unknown counts and establish a new subscription; the provider executes those operations. `retry()` restarts the current subscription after failure. Async cleanup arriving after a subscription was superseded is still invoked once. `dispose()` cleans up and makes later callbacks inert.

The snapshot contains `viewport`, requested buffered `window`, sorted sparse `rows`, `rowCount` (null until known), `loading`, `error`, `revision` and `disposed`. Count metadata alone does not mark a nonempty row window loaded. The default maximum buffered window is 10,000 rows, configurable with `maxWindowSize`; oversized requests reject before disturbing the existing stream.

## Tested boundaries and remaining work

Focused tests use separate provider fixtures to verify group routes, query forwarding, dynamic pivot metadata, concurrent blocks, LRU, retry, route refresh, validation, cancellation/stale responses, atomic loaded-node updates, live pushes, absolute indexes, count changes, empty-to-growing datasets and delayed cleanup. They verify **provider contracts and stores**, not a production server or an integrated remote React grid. There is no server-side selection protocol, recursive server expansion UI, master/detail server strategy, transport-specific reconnect/backoff, server transaction scheduler or end-to-end remote backend yet.
