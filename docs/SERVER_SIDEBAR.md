# Provider sidebar

Created by Mohamed Rafiq. `ServerSidePanel` binds columns, grouping, aggregation and typed conditions to an actual `ServerSideRowModel<T>`. It supplies no fabricated resident records or client-side substitute for provider operations. The **Server grouping lab** in the component playground demonstrates a synthetic asynchronous provider that really executes the requested operations.

## Controlled composition

```tsx
import { useState } from "react";
import type { Column, ServerSideRowModel } from "@opengrid/core";
import { ServerSidePanel, ServerTreeDataGrid } from "@opengrid/react";

type Order = { name: string; team: string; amount: number };
function ServerOrders({ model }: { model: ServerSideRowModel<Order> }) {
  const [columns, setColumns] = useState<Column<Order>[]>([
    { id: "name", field: "name", header: "Order" },
    { id: "team", field: "team", header: "Team" },
    {
      id: "amount",
      field: "amount",
      header: "Amount",
      type: "number",
      groupable: false,
      aggregateFormatter: (value, context) =>
        context.aggregate === "count"
          ? String(value ?? "")
          : Number(value).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            }),
    },
  ]);
  return (
    <div className="my-responsive-server-workbench">
      <ServerTreeDataGrid model={model} columns={columns} height={440} />
      <ServerSidePanel
        model={model}
        columns={columns}
        onColumnsChange={setColumns}
      />
    </div>
  );
}
```

The model/provider and column definitions remain application-owned. `onColumnsChange` receives a new definition array for visibility changes; these never replace provider records or issue a query. Host the panel beside the grid on desktop or in your own accessible modal drawer on phones. The playground uses a native drawer with Escape/focus return, a fixed reachable Close action and scrollable content. Minimal/Material presets and shared light/dark/system tokens apply to the panel.

The breadcrumb `ServerDataGrid` also accepts `onColumnsChange`. Pass the **same callback** to it and the sidebar when using its built-in visibility/pinning chooser, so chooser updates appear in the controlled column definitions. Compatible runtime column updates retain locally resized widths, order and pinning; explicit changed visibility defaults clear the matching local override. Removed or incompatible fields still require application/provider schema coordination. `ServerTreeDataGrid` keeps simultaneous branch state when visibility changes because this does not reset the provider query.

## Real query controls

- **Columns:** searchable field/category disclosure, mixed bulk checkboxes and individual visibility. Groupable fields have separate drag/toggle buttons; checkboxes do not change grouping.
- **Row groups:** header/column drags, chip reordering, native select/Add, move earlier/later, remove and group-sort controls update `rowGroupColumns`/`sorting` through `setQuery`. Aliased drag ownership connects the binding facade to its actual provider; foreign-provider and unknown/non-groupable field drags are rejected.
- **Values:** sum, average, minimum, maximum and count for numeric/BigInt fields; an existing nonnumeric value field can use count. The panel configures one operation per field ID. Alias definitions/provider IDs are needed for several operations over the same underlying field.
- **Filters:** staged typed scalar/AND/OR conditions call the provider's real filters query. Authoritative `getFilter` reads fence stale drafts. Failed publication keeps the draft retryable; a different model owner closes the old editor. There is no fabricated provider-wide set-list of distinct values.

The provider computes the math, grouping, sorting, filtering, route keys and block counts. Query changes retain the core generation/cancellation/retry contracts and reset branch expansion as documented in [remote grouping](GROUPING.md). The panel does not silently discard query fields outside its column list; unknown grouped fields are disclosed. Opaque externally supplied aggregation names remain selected until that field is explicitly changed; the panel does not implement arbitrary server operations itself. The example provider rejects unknown fields, invalid routes and unsupported operations with real errors.

## Aggregate formatting

Both server bindings apply source `aggregateFormatter` to actual provider aggregate slots without inventing a `T` row. The immutable context has a route-qualified row ID, group label, and the live requested built-in operation, so switching from sum/average to count can change currency formatting into integer formatting. `childCount` describes immediate children and is **not** invented as a descendant leaf count. An opaque provider operation supplies `aggregate: undefined`; applications needing custom operation-specific formatting can close over their query contract. With no query descriptor, the column's configured aggregate is the fallback.

Leaf `valueFormatter`/`renderCell` receive real provider records. Provider values remain raw for ordering/math; displayed formatting does not change requests. The leading visible group cell is still reserved for its group label; keep a nonmeasure column visible when displaying measure aggregates. Server-wide totals and automatic pivot result schemas are not introduced by this panel.

## Bounds and responsibilities

This is a **Partial** read-only server block/tree integration, not a backend, write protocol or full remote feature family. Infinite/live-viewport sidebar adapters, remote distinct-value loading, server pivot configuration/schema UI, server-wide selection/editing, automatic route scrolling and remote detail/total protocols remain outside this slice. The existing model cache/request limits still apply, including bounded active-route reservations; rejected capacity does not imply missing data was loaded.

Translate `labels` for panel headings/hints and use `GridLocaleProvider` for the embedded group/condition controls; application field headers/formatters remain caller-owned. The generic panel installs no global navigation or persistent access. Model disposal belongs to the application after its consumers unmount. See [provider contracts](REMOTE_MODELS.md), [remote bindings](REMOTE_GRIDS.md) and [query scheduling](SERVER_REQUESTS.md).

The reused `RowGroupPanel` now accepts the narrower `RowGroupPanelModel<T>` interface: stable subscribed `getState()` snapshots containing group fields/sorting, `getColumns`, `setState` and `setSort`. Existing client `GridModel<T>` instances remain compatible. A provider adapter needs no resident row data. Browser tests and screenshot review cover native pointer dragging, keyboard/native and emulated touch alternatives, responsive drawers and both presets/color modes; no physical-device or screen-reader certification is claimed.
