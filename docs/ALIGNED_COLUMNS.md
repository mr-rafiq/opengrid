# Aligned column models

`createAlignedColumns(models, options?)` synchronizes a bounded set of column properties across two to 32 existing OpenGrid models. Grids may have different row types, row data, sorting, filters, selection and pagination. The utility is framework-neutral and synchronous.

```ts
const link = createAlignedColumns([topGrid, bottomGrid], {
  properties: ["order", "width", "visibility", "pinning"],
  initialSourceIndex: 0,
});
// Either model may now initiate changes to those properties.
link.dispose();
```

The four properties and initial source index zero are defaults. `properties` must be a nonempty unique list; unknown options and an out-of-range/noninteger source index reject setup. Models must be distinct and have at least one column ID in common.

## Scope and defaults

**Shared columns means the intersection of IDs present in every linked model.** With three models, a column present in only two stays independent. `link.sharedColumnIds` is a frozen list identifying that intersection, initially ordered by the chosen source. It is metadata, not a reactive current-order list.

Order synchronization replaces shared-column slots in each target's logical `columnOrder`. Nonshared columns keep their current slots and relative order. Pinning is a separate property: order-only links do not mistake pinned visual partitions for logical column order.

Width, visibility and pinning use effective values, including column-definition defaults and explicit state overrides. An absent width falls back to 160; absent `hidden` means visible; absent pinning means unpinned. Explicit `null` pinning overrides a pinned definition. Nonshared state entries and unknown state entries are retained. Properties omitted from the list remain independent.

For width synchronization, the allowed range is the intersection of each shared column's min/max constraints across all models. An absent minimum uses the core's override minimum of 40; an absent maximum is unbounded. Desired widths clamp to that common interval, including on the initiating model, so all models can agree. Incompatible intervals reject setup before subscriptions or writes. Schemas and sizing constraints must stay fixed for the lifetime of a link; dispose and recreate it after schema/constraint changes.

## Notifications and lifecycle

Initial synchronization runs immediately. In React, create the link inside an effect and return `link.dispose` from the cleanup. Creating a live link in a render/useMemo initializer would register listeners before React commits it.

Only changes to selected shared-column properties propagate. Changes to row data, sorting, filters, group expansion, selection or pagination do not trigger column writes. The utility does not mutate caller arrays, option lists, column definitions or returned state objects. It copies the input model list.

Each propagation event captures a complete selected-property snapshot. Notifications caused by the utility's own writes are recognized and suppressed. Reentrant observer changes are queued and processed in notification order, so a later captured change is not discarded merely because another model is being updated. Overlapping compatible links can coexist.

Propagation has a maximum queue size of 100 events and at most 100 passes per drain. A nonconverging external observer, invalid model change or runtime setter failure throws and disposes the link rather than leaving an infinite recursive loop. A runtime failure can leave some models with the last successfully applied values; this is not a distributed transaction.

Validation occurs before listener registration. If a subscription fails, prior subscriptions are removed. If initial synchronization fails, the utility removes subscriptions and attempts to restore the original shared selected properties, preserving current nonshared/unrelated state. A rollback or cleanup failure is surfaced as an `AggregateError`; it is not hidden. Disposal is idempotent and stops further propagation, including when invoked by an observer during a write. Genuine `GridModel.subscribe` implementations must return working unsubscribe functions.

## Limits

This is partial aligned-grid support. It does **not** synchronize horizontal/vertical scrolling, row heights, group schemas/column groups, spanning, row data, filters, selection, focused cells or viewport models. Independent links with conflicting constraints or observers that continually overwrite one another are not a coordination protocol. There is no asynchronous scheduler or external transport.

`packages/core/src/aligned-columns.test.ts` verifies initial and bidirectional sync, selected-property controls, effective defaults, nonshared columns, common constraints, row-state isolation, heterogeneous models, reentrant/overlapping observers, disposal, failed setup and bounded nonconvergence.

Genuine client `setColumns` updates now publish a definition revision. An existing alignment link detects that epoch and detaches before using stale shared IDs/constraints; recreate it after the desired schema changes. Custom structural models can expose optional `getColumnRevision()` for this behavior. Without it, the fixed-schema contract above continues to apply. New shared columns are not discovered automatically.
