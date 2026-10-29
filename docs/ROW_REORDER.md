# Managed row order

The client model owns resident row order and can move one or several stable row IDs atomically:

```ts
const status = model.getRowReorderStatus();
if (status.allowed) {
  const error = model.moveRows(["order-7", "order-2"], "order-9", "before");
  if (error) console.error(error);
}
model.undo();
model.redo();
```

`moveRows(ids, targetId, "before" | "after")` returns an error string or `undefined`. Sources retain their current resident order, regardless of the order of IDs in the argument. Unmoved rows retain their relative order. Row objects and selection stay intact. Every source ID, the target and the position are validated before writes. Duplicate, missing, blank or stale IDs are rejected. Sparse/accessor source arrays are rejected without invoking their getters. Row IDs must remain stable and unique for the lifetime of a resident row.

An empty source array with a valid target, a target included in the sources, or a permutation already in the requested position is a no-op: no state snapshot, listeners, cache invalidation or history changes. No-ops preserve redo. A real move updates filtered rows, page rows and CSV order and invalidates derived/getter/calculated caches.

## View constraints

`getRowReorderStatus()` returns a frozen `{ allowed: true }` or `{ allowed: false, reason, message }`. New commands are disabled for tree data (`tree-data`), grouping (`grouping`), sorting (`sorting`), active column/quick/advanced filters (`filtering`) or an external filter callback (`external-filter`). In that precedence order, status uses model configuration and state without executing application callbacks. A whitespace-only quick filter is inactive. Clear these constraints before a new move. Status does not encode presentation-only restrictions such as pinned rows, full-width rows, active editors or detail panels; React checks those separately.

The core API acts on the complete resident client dataset, including across page boundaries, and preserves the current page. The initial React managed controls deliberately restrict moves to a single ordinary row and targets on the current page. This is an original behavior choice: [AG Grid managed dragging](https://www.ag-grid.com/react-data-grid/row-dragging-managed/) disables dragging with pagination. OpenGrid does not claim compatible drag event/API semantics.

ServerDataGrid explicitly overrides both methods: status is `read-only` and `moveRows` returns a provider-authoritative error. Loaded server pages cannot be reordered by mutating the local facade. Remote provider writes, tree/group moves and cross-grid transfer are outside this API.

React localization translates only original frozen built-in statuses, identified by `getBuiltinRowReorderReason(status)`. Custom statuses, wrappers and copies retain their own raw message text. The query does not add fields or alter the headless status shape; copying a status gives the caller ownership of its message.

## History and cost

A real move is one entry in the same chronological undo/redo stream as cell and atomic batch edits. Move entries retain only moved IDs, original indices, the anchor and direction, plus a row-count guard: O(m) retained metadata for m moved rows, rather than two dataset-sized ID arrays. Existing edit entries continue to retain row snapshots. Computing or replaying a move takes O(n + m) time and a temporary O(n) result array. `historyLimit` applies to both kinds; replacing rows or applying a transaction clears history. A successful new move clears redo.

Undo/redo uses current row objects and bypasses new-command view restrictions, so applying a filter or sort after a move does not prevent restoring resident order. It does not restore selection or presentation state. Invalid replay caused by unsupported external ID mutation throws before changing rows or consuming history; fix the source data or replace rows explicitly. Reorder does not persist through serialized GridState: persist your reordered row data separately.
