# Cell editors

OpenGrid's React editor controls keep a string draft. The grid model parses the
committed value, validates it, and applies an atomic edit. Native inputs do not
convert large integers through JavaScript `Number`.

`CellEditor<T>` and its related types are implemented in
`packages/react/src/editors.tsx`. The DataGrid adapter can supply these controls
through its editor integration. The controls can also be used directly in a
custom editing host.

## Contract

Required props are `row`, `column`, `value`, `label`, `onChange`, `onCommit`, and
`onCancel`. Optional props are `editorType`, `options`, `asyncOptions`, `error`,
`errorId`, `inlineValidation`, `onBlur`, `onKeyDown`, and `autoFocus`.
Rich choice controls additionally accept `searchMode`, `displayValue`,
`editingContext`, a stable `contextKey` and `onApplyValue`; see the
[searchable choice contract](RICH_SELECT.md).

`CellEditorRenderer<T>` is a function from `CellEditorProps<T>` to a React node.
`CellEditorComponent<T>` is the corresponding React component type. A custom
editor must call `onChange` with the draft string and let `onCommit` perform the
model update. Return `false` from `onCommit` to retain invalid input on Tab.

Each control receives an accessible label. A validation `error` sets
`aria-invalid` and references a rendered alert. Supply `errorId` when the host
needs a stable identifier; it must be unique within the page. Focus and text
selection are set when the editor mounts, and are preserved across draft updates.
When the host already renders the error alert, set `inlineValidation={false}`
and supply its `errorId`; the control retains invalid/described-by semantics
without rendering a duplicate alert. The editor shell exposes
`data-editor-type` for type-specific popup styling.

## Built-in controls

| Type         | Native control        | Notes                                                           |
| ------------ | --------------------- | --------------------------------------------------------------- |
| `text`       | Text input            | Default for text and BigInt columns                             |
| `number`     | Number input          | BigInt columns use numeric text input to preserve digits        |
| `date`       | Date input            | String values use native `YYYY-MM-DD` date format               |
| `boolean`    | Checkbox              | Writes exactly `"true"` or `"false"`                            |
| `select`     | Select                | Options contain string `value` and `label`; optional `disabled` |
| `richSelect` | Modal searchable list | Staged single choice, virtualized options, exact string IDs     |
| `largeText`  | Textarea              | Newlines are retained; host controls editor dimensions          |

By default, column `type` chooses number, date, boolean, or text. Select and
large-text controls are selected explicitly with `editorType`.

## Keyboard and commit policy

Without a host `onKeyDown`, Enter commits, Escape cancels, and Tab commits before
native focus movement. A failed commit prevents Tab from leaving. In `largeText`,
Enter inserts a newline and Control/Cmd+Enter commits. Leaving the entire editor
commits by default. A supplied `onBlur` replaces this automatic blur commit.

A host `onKeyDown` replaces the entire default keyboard policy, allowing DataGrid
to own cell navigation and prevent duplicate commits. The event is typed as
`React.KeyboardEvent<HTMLElement>` because controls include inputs, select, and
textarea. Hosts should retain the multiline Enter behavior where appropriate.

## Asynchronous choices

`asyncOptions(signal?: AbortSignal)` returns a promise for a readonly option
array. The signal is aborted when the provider changes, the editor changes type,
or the editor unmounts. Providers that ignore cancellation remain safe: late
results are discarded using request identity and an active-request guard.

The control announces loading and preserves its current draft even if that
value is absent from the loaded choices. A rejected or malformed response shows
an error and a Retry button. Moving focus from the control to Retry does not
commit the draft. A retry makes a fresh request; no value is committed merely
because a request finishes. Keep the provider function reference stable with
`useCallback` so ordinary parent renders do not restart requests.

The native `select` does not implement search or virtualized options. Choose
`richSelect` for the bounded searchable single-choice dialog. Remote query text,
complex values, custom option renderers and multi-select remain open. Rich
controls use explicit Apply/Cancel rather than automatic blur commit.
Large-text editors need a sufficiently sized editing host; the grid
does not measure or expand row height automatically. Explicit `getRowHeight` and
detail heights are supported separately; the large-text editing host supplies
its own usable dimensions.
