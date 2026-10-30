# Bounded server request scheduling

`ServerSideRowModel` limits actual provider work across routes and query changes. This extends the existing provider-authoritative cache; it does not calculate grouping, sorting, filtering or pivot results locally.

```ts
import { ServerSideRowModel, ServerRequestCapacityError } from "@opengrid/core";

const model = new ServerSideRowModel(source, {
  blockSize: 100,
  maxBlocks: 10,
  maxConcurrentRequests: 2,
  maxPendingRequests: 256,
});

try {
  const block = await model.loadBlock(["Europe"], 0);
  // Ask for a fresh response for one address, retaining cached rows meanwhile:
  await model.refreshBlock(["Europe"], 0);
} catch (error) {
  if (error instanceof ServerRequestCapacityError) {
    // Wait for existing work or request a smaller set of independent addresses.
  } else {
    throw error;
  }
}
```

`source` implements the provider in the [server model guide](REMOTE_MODELS.md). The source packages are available through the [quick start](../README.md#react-quick-start); no npm publication is implied.

## Concurrency, pending capacity and cancellation

The defaults are **two concurrent provider requests** and **256 current-query pending requests**. Pending means running plus queued current requests. `SERVER_REQUEST_LIMITS` exposes fixed maximums of 16 concurrent requests, 4,096 pending requests and 4,096 UTF-16 code units per normalized error message. Values must be positive safe integers, and pending capacity must be at least concurrency. These are original bounded APIs; the reference's `-1` unlimited mode is not accepted.

Distinct addresses enter a FIFO queue. The scheduler reserves a slot before its provider microtask; a superseded request can therefore be canceled before `getRows` is invoked. The slot then remains occupied until the actual provider promise settles. Same-address callers share current work and receive detached response copies. Cache hits use the LRU and return a detached cached response, including during an explicit non-purge refresh.

Changing the query rejects superseded callers promptly and aborts their signals. A provider that ignores cancellation still occupies its slot until it resolves or rejects. New-query requests wait within the same model's budget. A provider that never settles can keep the queue waiting; implement cancellation by settling its promise. The scheduler does not create replacement model instances or release an actual outstanding request's slot just because its caller was canceled.

`snapshot.loading` contains current-query active and queued addresses. Canceled providers holding old slots are excluded from this current-query list. Queued tasks retain the model-owned query generation; each dispatched provider receives an independent copy, so mutating its request arguments cannot change another request or `getQuery()`.

When pending capacity is full, a new independent address rejects with `ServerRequestCapacityError` before changing the cache, failure list or published snapshot. A cache hit or same-address join still works at capacity. Capacity errors are distinct from provider failures and do not create a transport-error record. Each independent `loadBlock` has its own admission decision; a sequence of calls is not an atomic batch.

## Refresh, retry and reentrant operations

`refreshBlock(groupKeys, blockIndex)` reloads one address and retains its prior cached response until successful replacement. It joins any current same-address request. It validates the replacement against other resident route blocks. A changed route count may require a purge refresh when other blocks would be inconsistent. Failed refreshes retain cached rows and expose the failure.

`refreshRoute(route, { purge, descendants })` and `refresh()` retain their documented route scopes. They preflight the complete matching address set against pending capacity before deleting cache entries or canceling current work. An over-capacity refresh rejects without partly purging or dispatching. Configure adequate capacity, wait for pending work, or refresh smaller routes. An admitted refresh installs its complete replacement batch before notifying subscribers or invoking abort listeners.

Query changes, refreshes and loaded-node transactions publish coherent committed state before source abort callbacks run. A callback can synchronously change the query, start a new request or dispose the model; resumed older operations cannot restore obsolete cache/query state. Late responses, failures and clone-time source changes are fenced by task ownership. Disposal rejects active/queued callers and prevents later cache/error/notification publication. Actual canceled provider promises are still allowed to settle and release their slots.

Provider and response-validation failures become owned `Error` objects with nonempty bounded messages. Blank, null, unconvertible and oversized diagnostics still leave visible retryable failures. Original provider error identity/subclasses or arbitrary status payloads are not preserved by this normalization. Request-address/configuration errors retain their separate validation contract.

The React route view's Retry control performs a fresh single-block request when a failed refresh still has cached rows. Those rows remain visible during retry; successful provider data replaces them. An explicit retry belongs to its current model/query/route/block. Empty-view announcements render outside the ARIA grid role while keeping the logical row count unchanged.

## Demonstration and remaining work

In **Remote model lab → Server requests share a bounded queue**, the local provider waits for manual response buttons and intentionally ignores cancellation. Queue routes, change the query, and settle the canceled providers to see queued work begin without exceeding two active calls. Repeated admission shows the eight-pending demo bound. Reject a response for a nonempty failure and real Retry; refresh the cached root, reject it, then Retry to fetch a replacement. The recent event list is capped at 12 entries. All providers are local promises; no network service or credentials are required.

The widget displays the root route. Its independent route requests expose scheduling. Simultaneous mixed-route tree rendering, visible-route cache pinning, load debouncing/priorities, per-level cache policies, automatic pivot columns, server-wide selection, remote write/conflict handling and remote detail lifecycle remain open. Cache/data payload dimensions still follow the separate model contract; request-count caps do not certify byte usage, throughput, latency, browser/device coverage or manual assistive technology.

The public [AG Grid 36.2 SSRM API reference](https://www.ag-grid.com/react-data-grid/server-side-model-api-reference/) documents datasource concurrency and queueing. OpenGrid implements its own bounded ownership, backpressure and promise lifecycle in original MIT code. The server-side family remains Partial in the [feature ledger](FEATURE_PARITY.md).
