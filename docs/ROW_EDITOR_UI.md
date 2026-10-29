# Whole-row editing dialog

`RowEditDialog<T>` provides an original modal workflow for atomic row editing.
It is an explicit form with Save, Cancel and Reload actions. It does not claim
the same inline full-row lifecycle or automatic focus-loss saving as AG Grid.

Required props are `model`, `rowId` and `onClose`. Optional props are
`editorOptions`, `renderEditor`, `initialColumnId`, `conflictPolicy` and
`onCommit(rowId)`. Editor configuration uses the same `EditorConfig` and
`CellEditorRenderer<T>` contracts as DataGrid. Text, number, date, checkbox,
select, asynchronous choices, multiline text and custom editors are supported.
Custom editor context includes the baseline typed row and that field's current
string draft; raw drafts are not presented as a parsed typed row.

The dialog creates a `createRowEditSession` snapshot and renders only visible
columns represented in `session.values`. Read-only, value-getter-only and
fieldless columns do not become editable merely because they have a renderer.
When there are no eligible visible fields, Save is disabled and the dialog
explains why. Missing-row and constructor errors are shown without crashing.

Changes remain local across Tab and blur. Save, or Enter in a single-line
editor, commits the entire session through one validated atomic model batch.
In multiline editors, Enter inserts a newline; Control/Cmd+Enter saves the row.
A validation failure leaves every model field unchanged and retains the draft
for correction. One successful batch produces one undo step. Escape and Cancel
discard the session. The host receives `onCommit` after successful saving and
restores grid focus after the dialog unmounts.

`conflictPolicy="reject"` is the default. An external change to an edited raw
field is reported on Save, while the local draft remains intact. The dialog
does not silently overwrite or reload edits. **Reload row** asks for an explicit
**Discard draft and reload** confirmation before taking a fresh snapshot;
**Keep editing** preserves the draft. Applications may explicitly choose
`conflictPolicy="overwrite"` when they want the core's overwrite behavior.
The store still handles validation and missing-row checks in that mode.

The initial eligible field is focused, preferring `initialColumnId`; other
editors receive `autoFocus={false}` so they do not compete for focus. The
component uses native `dialog.showModal()` after mount and closes it during
cleanup. An `open`-attribute fallback supports JSDOM without providing an
independent focus trap. Replacing `model`, `rowId`, or the conflict policy
cancels the old session and takes a new snapshot; cleanup never commits edits.

As with all custom editors, callbacks must follow the supplied draft and
keyboard contract. Async select providers should have stable function
identities. Application persistence, collaboration conflict resolution beyond
the configured policy, and assistive-technology verification remain host
responsibilities.
