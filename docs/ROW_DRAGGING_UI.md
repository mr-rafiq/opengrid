# Managed row moving in DataGrid

Enable `rowDragging` to show native drag handles, visible move instructions and
accessible Move up/Move down toolbar controls. `onRowMove` receives
`{ rowIds, targetRowId, position: "before" | "after" }` only when an actual
reorder succeeds. This initial UI moves one row, even when multiple rows are
selected. It preserves the core row objects and selected row IDs.

Drag a handle and drop in the upper or lower half of another row to insert before
or after that row. The indicator previews the insertion point; hovering never
changes data. Alt+Up and Alt+Down work on normal data cells and drag handles.
Each successful gesture or command creates one undo step. Identity no-ops leave
history and callbacks unchanged. Keyboard movement retains logical row focus;
the grid scrolls the moved row into view without replacing cell-range anchors.

Moves in the UI stay within the currently visible page. First/last rows cannot
cross the page boundary through a gesture or keyboard command. Pagination is an
intentional OpenGrid behavior and does not claim AG Grid's managed-drag policy.
The core `moveRows` API can express wider resident-row operations separately.

The authoritative core status blocks sorting, column/quick/advanced filters,
grouping, tree data, external predicates and read-only remote models. The UI also
blocks moves while editing, with actual pinned or full-width rows in the view,
with expanded detail panels, or when no data column is visible. The reason is
shown visibly, and both handles and toolbar controls are disabled. Close details,
finish/cancel editing or remove the relevant view transformation to resume.

The drag handle shares one logical row-controls column with the selection
checkbox. Its extra width is 32 pixels; it does not become a data column or a
cell-range member. Pinned data columns, grouped headers and logical column
indices account for that gutter. The handle's Alt-arrow shortcut has the same
behavior as the toolbar controls and does not require pointer dragging.

A private active-drag record and per-drag nonce bind drops to their owning grid.
Foreign grids, nested-grid targets, unrelated drag types and tampered payloads
cannot supply row moves. A changed page/order, disabled eligibility, model
replacement, native drag cancellation, Escape or unmount discards the drag.
Rows are validated again at commit. Selection-only changes do not invalidate an
otherwise unchanged page. Native body-edge auto-scroll is scoped to the owning
viewport and its visible body bounds; animation frames are cleaned up on exit.

Cell ranges keep their logical endpoint IDs. Reordering can change which rows
lie between those endpoints, just as sorting changes visual interval membership;
the grid does not pretend that a rectangular range is a fixed set of records.
No multi-row UI dragging, cross-page gesture, cross-grid transfer, row-group/tree
reparenting, touch-specific dragging or external drop-zone API is claimed by
this slice. See the core reorder documentation for programmatic history rules.
