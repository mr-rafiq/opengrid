# Cell note dialog

`CellNoteDialog` edits an annotation in `CellNotesStore`, independently of row
fields. Required props are `store`, `position: { rowId, columnId }`, and
`onClose`; `columnLabel` optionally supplies a readable column title.

The dialog reads the selected cell's note when mounted or when the store or cell
IDs change. It focuses the textarea and keeps a local draft. Editing does not
write to the store until **Save note**. **Delete note** removes an existing note.
Saving an exactly empty string also removes the note; whitespace is preserved.
**Cancel** and Escape close without saving.

In supporting browsers the component calls native `dialog.showModal()` after
mount, without setting `open` beforehand. This supplies native modal focus
containment and inert background behavior. A direct `open` attribute fallback
supports environments such as JSDOM where the native modal API is absent. The
fallback does not implement a separate focus trap. Cleanup closes the dialog.
The host restores grid focus after unmount, using the cell's logical position
so scrolling and virtualization do not require a retained DOM cell reference.

Notes and labels are plain text. HTML and Markdown are not interpreted. The
textarea never silently truncates pasted text and does not use `maxLength`.
Character-count feedback uses `store.maxTextLength` (10,000 by default), while
the store remains authoritative for character, note-count, ID and serialized
size limits. A rejected Save or Delete keeps the dialog open and preserves the
draft and prior stored note; the error is announced and linked to the textarea.

The dialog does not replace an in-progress draft when the same store changes
externally. Hosts should coordinate concurrent editing if several editors share
a store. Use the same store instance across grid view changes when annotations
should survive sorting, filtering, grouping and pagination. Store import/export
and pruning remain separate application actions.

Client `DataGrid` remounts its note editor when the supplied store or cell identity
changes, so a previous owner's draft cannot save into a replacement store. A
language/direction change with the same owner retains the draft and focused
textarea. Pending contextual commands are canceled when note-store ownership
changes. `ServerDataGrid` has a separate query/route-scoped default and optional
application resolver; see [server note ownership](REMOTE_GRIDS.md#server-notes-and-namespace-ownership).

Component tests cover creation, reading, deletion, empty-note behavior,
cancellation, focus, Escape, native modal lifecycle, safe text rendering and
atomic storage failures. Native browser behavior and assistive-technology
verification require their corresponding integration checks.
