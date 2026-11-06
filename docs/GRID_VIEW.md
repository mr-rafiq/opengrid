# Client view commands

`DataGrid` accepts `viewRef: Ref<DataGridViewController>` for commands against its mounted client view. The handle retains its identity across layout, data and draft updates. Replacing the model creates a new handle; retained old handles and unmounted handles become inert. This is an OpenGrid API, not an AG Grid API facade.

```tsx
const view = useRef<DataGridViewController>(null);

<DataGrid model={model} viewRef={view} />;

view.current?.focusCell({ rowId: "record-700", columnId: "amount" });
view.current?.revealRow("record-1"); // scroll only; retain logical focus/range
view.current?.startEditingCell({ rowId: "record-1", columnId: "amount" });
view.current?.stopEditing(); // validate and commit/submit
view.current?.stopEditing({ cancel: true }); // discard
```

Commands use row and column IDs in the current committed projection. They can reveal virtualized cells and resolve covered cells to their real merged owner. Missing, hidden, collapsed, filtered-out and other-page cells return `false`; they do not fetch remote data, change pages or expand groups. `revealRow` can reveal a visible full-width row without inventing a cell.

`isActive()` means the current model snapshot has a committed mounted view. During a pending model/schema update, commands return `false` until the new view commits. Retry from the host's React layout/effect lifecycle when synchronizing data and issuing view commands together. Do not equate this readiness signal with application/model destruction.

The optional `onViewCommit(view)` callback runs in a layout effect after the current view handle is installed. It is a readiness notification for queued integrations, not a promise that every model update produces a distinct callback. Check `view.isActive()` and keep callbacks idempotent; do not create an unconditional update loop.

## Focus and scrolling

- `getFocusedCell()` returns a frozen `{ rowId, columnId }` or `null`. This is logical grid focus, which may remain on a scrolled-out cell.
- `focusCell(position, { takeFocus?, extendRange? })` uses the same virtualized, pinned and merged navigation as the keyboard. `takeFocus` defaults to `true`; `false` updates logical focus without taking DOM focus. `extendRange` defaults to `false`.
- `revealCell(position)` and `revealRow(rowId)` scroll without changing logical focus or range selection.
- `getScrollPosition()` returns a frozen `{ top, left }` or `null` when inactive. `left` is a normalized direction-relative offset, independent of the browser's native RTL scroll representation.
- `scrollTo({ top?, left? })` accepts finite nonnegative offsets, clamps to browser geometry and updates both virtual windows. An empty or invalid request returns `false`.

These are client viewport commands, not a backend seek protocol or a migration of another grid's private scroll service.

## Editing

`startEditingCell(position, { initialText? })` operates in cell editing mode. It respects read-only policies, actual merged owners and validation when replacing an active edit. Starting the same active cell retains its draft. It does not open or control the full-row modal or edit generated group rows.

`getEditingCell()` returns the current cell position, or `null`. `stopEditing()` validates and commits through the model's local write or [host request](EXTERNAL_EDITS.md) path. Invalid input keeps its editor and returns `false`. Cancellation creates no edit. Reentrant editing/focus commands during a commit notification return `false`; issue follow-up commands after the committed view is ready. A synchronous host acknowledgement is reflected before restoring focus to the current cell geometry.

Custom editors can stage an object with `onRawChange(value)` and immediately call `view.current?.stopEditing()` in the same event. See [typed custom drafts](EDITORS.md). This preserves class instances without requiring an unsafe string cast.

The original [host-owned editing demo](https://mr-rafiq.github.io/opengrid/demo/#external-edits) exposes the commands and a typed review-stage editor. Tests also exercise 1,000 rows and 40 metrics, both virtual axes, a pinned field, merged owners, host acknowledgement, model replacement and unmount. This does not establish authenticated application compatibility or physical-device/manual screen-reader acceptance.
