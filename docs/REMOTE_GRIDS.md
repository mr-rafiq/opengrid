# React bindings for remote models

`ServerDataGrid` and `LiveViewportDataGrid` are read-only React bindings for the distinct provider models described in [REMOTE_MODELS.md](REMOTE_MODELS.md). They render actual provider results and call provider-model operations; they do not present a client-side sort/filter as an operation over unloaded server data. Import `@opengrid/react/styles.css` as with the client grid.

## ServerDataGrid

```tsx
import { ServerDataGrid } from "@opengrid/react";
import type { Column, ServerSideRowModel } from "@opengrid/core";

function RemoteOrders({
  model,
  columns,
}: {
  model: ServerSideRowModel<Order>;
  columns: Column<Order>[];
}) {
  return (
    <ServerDataGrid
      model={model}
      columns={columns}
      height={420}
      ariaLabel="Remote orders"
    />
  );
}
```

Props are `model`, `columns`, optional `height`, `ariaLabel`, `className` and `renderCell`. The cell-renderer context has the original row data and column schema. Keep the column-array identity stable when retaining local layout state is desired.

The binding loads root block zero, displays complete provider blocks, and pages using `blockSize` and the exact child `rowCount` at the active route. Group records show an **Open group** button in the first visible column. Opening a group drills into its route; breadcrumb buttons return to ancestors. This is a flat drilldown view, not mixed-route expansion with grouped footers or server tree selection.

Header sort changes, including Shift multi-sort, are sent to `model.setQuery({ sorting })`. Column filter changes are sent as server query filters. The sort/filter controls reflect `model.getQuery()`, including the model's initialized query and changes made externally. Query changes reset block paging to zero. The renderer preserves the returned node order and records even if a deliberately unusual provider returns records that do not match those controls; execution of the query is the provider's responsibility. There is no global quick-search UI because the remote provider contract has no global search field.

The binding reuses the client grid's virtual rendering, keyboard navigation, pinned columns, resizing, header reordering and read-only cell rendering. A small column chooser changes visibility and pinning locally. Row checkbox selection is **loaded-page scoped**; changing pages prunes unloaded selections. Selected group records do not cascade to children. There is no server-selection protocol or remote editor/paste/write transaction UI. The inner row count reflects the loaded block; the binding's route-count status and pager describe the complete remote route.

Errors display a retry control. Late results for another route/page do not replace the active view. Loading, missing blocks and errors are surfaced rather than filled by client-computed substitutes. Server pivot metadata is reported when available, but this component does not automatically synthesize a pivot column schema; supply matching columns explicitly.

## LiveViewportDataGrid

```tsx
import { LiveViewportDataGrid } from "@opengrid/react";

<LiveViewportDataGrid
  model={liveModel}
  columns={columns}
  height={420}
  rowHeight={36}
  overscan={4}
  ariaLabel="Live prices"
/>;
```

Props are `model`, `columns`, optional `height`, `rowHeight`, `overscan`, `ariaLabel`, `className` and `renderCell`. The component is fixed-height and read-only. Configure live sorting/filtering through `liveModel.setQuery` externally; this binding has no query toolbar or editor.

Scrolling requests the visible row indexes plus rendering overscan through `setViewport`; the model adds its configured provider buffer. Sparse pushed rows are rendered at their absolute indexes, with loading placeholders for missing data. No placeholder array proportional to `rowCount` is allocated. A one-million-row model renders only its visible window. Logical heights exceeding eight million pixels use a bounded physical scroll space, preserving access to the last logical row while avoiding common browser element-height limits. This scaling is a scrolling strategy, not a performance benchmark or a promise for every JavaScript safe-integer row count.

The same horizontal column-window utility renders visible center columns and all pinned columns. Column widths, pinning and visibility come from props; there are no interactive resize/reorder/selection controls in the live binding. ARIA column indexes remain logical indexes despite omitted columns; row indexes are absolute and include the single header row. Unknown row count uses `aria-rowcount="-1"`.

Arrow keys, Home/End, Page Up/Down and Control/Cmd+Home/End navigate by absolute row and column index. Keyboard navigation moves the viewport, focuses a loading cell if needed, and retains that element as a push populates its data. Focus follows the absolute index rather than an immutable record identity when the server reorders positions. Cell values update without using a new DOM key for every live data version. A retry control restarts failed provider subscriptions. Empty datasets retain the model's count stream, so server growth can populate rows again.

## Ownership and shared state

Both bindings subscribe and unsubscribe their own React observers. They **do not dispose the supplied model on unmount** or cancel a model owned by another part of an application. The owner must call `dispose()` when the model itself is no longer needed. A viewport model holds one active window, so coordinate ownership if multiple views share it; separate models are normally appropriate for independently scrolling views.

The example `RemoteLab` owns its models and disposes them when its own lifecycle ends. Its providers are explicitly in-memory simulations: a delayed server-query function and an interval generating only requested live rows. No hosted backend, network service, credentials or real market feed is supplied.

## Verification and boundaries

React provider-integration tests cover routes, breadcrumbs, paging, authoritative provider order/filter records, initialized and external query synchronization, detached query copies, retry, local layout/selection, caller-owned lifetime, million-row bounded DOM/height, scaled end navigation, focus retained through live pushes, stale generations, empty-to-growing data and pinned virtual columns. Browser tests and manual screen-reader verification remain separate evidence; these component tests do not certify assistive-technology conformance.

Still missing: full server expansion/selection semantics, cache-backed cross-route editing, master/detail remote models, row dragging/spanning, automatic server pivot schema generation, transport-specific authentication/backoff and complete AG Grid server/viewport API compatibility. The bindings are working subsets, not claims of complete remote-grid parity.
