# Host-owned edit requests

`createGrid({ onEditRequest })` submits cell, batch, range and row edits to the application. It does not change source rows, run owned `valueSetter` callbacks, create cell undo entries, or claim a successful save. This supports applications whose setters perform asynchronous business operations and later provide authoritative data.

```ts
const model = createGrid({
  rows,
  columns,
  getRowId: (row) => row.id,
  onEditRequest(request) {
    // Return synchronously. The host owns completion, errors and request ordering.
    void saveChanges(request.edits)
      .then((updatedRows) => model.applyTransaction({ update: updatedRows }))
      .catch(showApplicationError);
  },
});
```

The callback must return `undefined`; do not make it `async`. An accidentally returned promise is rejected as a configuration-contract error, and its rejection is consumed. This cannot undo side effects already started by a host callback. A thrown synchronous error is returned by `editCell`/`batchEdit` and keeps an editor open. The host must provide an appropriate policy for failures and retries.

## Validation and ownership

The core checks the whole batch before invoking the callback once. Unknown rows/columns, read-only policies, parse errors and validators prevent dispatch. Standard number/BigInt/boolean/date parsing still applies; explicit parsers take precedence. Parsers and validators see the original source row, not a fabricated proposed class instance. Cross-field business validation belongs in the host. Keep callbacks deterministic and free of mutations during preflight: schema, row-array, grid-state or read-only changes invalidate the request.

Getter-only and fieldless columns may be editable in this mode. They remain ineligible for local writes. Owned `valueSetter` callbacks are bypassed: the host maps each column ID to its actual business operation.

Each request has a monotonically increasing `id`, a `columnRevision` and an ordered `edits` array. Each edit contains `rowId`, `columnId`, the parsed `value`, `previousValue` and the original `row` reference. Request metadata and edit records are frozen; values and application row objects are borrowed, not cloned or frozen. Do not treat this as an immutable server snapshot. Capture any business payload you need when the request arrives.

There is no built-in acknowledgement protocol, cancellation, backend undo, retry queue, conflict resolution or stale-response protection. The host must decide whether later responses are still relevant, check row/schema versions as appropriate, and synchronize authoritative data with `applyTransaction` or `setRows`. Host transactions may synchronously acknowledge inside the callback. Reentrant edit requests during dispatch are rejected. Formula/calculated grid extensions cannot be combined with this mode.

## React and row drafts

`DataGrid` uses the same mode for cell editing, paste, fill and full-row dialogs. Announcements say that a change was requested, and the row action is **Submit row**. The displayed source data remains unchanged until the host provides new rows. `onCellEdit`, `onRowEdit` and `RowEditDialog.onCommit` report successful submission in request mode, not backend persistence.

`createRowEditSession` reports `status: "requested"` after submitting a changed draft. Its snapshot retains the submitted draft; it does not replace it with the old source values. Independent getter/fieldless column drafts are keyed by column ID. Existing source-conflict checks still apply. This mode does not add editing support for generated group rows or implement an AG Grid compatibility facade.

Try the original synthetic [host-owned editing example](https://mr-rafiq.github.io/opengrid/demo/#external-edits). Apply/reject buttons simulate the host; the example makes no network calls.
