# Staged full-row editing

`createRowEditSession` stages editable raw fields for one stable row ID. Draft changes remain local until one atomic `model.batchEdit` commit. Cancellation and unchanged drafts do not mutate grid rows, history, filtering, selection or column layout.

## Quick start

```ts
import { createRowEditSession } from "@opengrid/core";

const session = createRowEditSession(model, "order-42");
session.setValue("quantity", "12");
session.setValue("description", "Updated description");

const error = session.commit();
if (error) {
  // Session stays editing; show the error and permit corrections or cancellation.
  showError(error);
} else {
  // All dirty fields passed parsing and final-row validation.
  model.undo(); // reverses the whole committed row batch in one step
}
```

`session.cancel()` discards local drafts. A committed or cancelled session is terminal; create a new session for later editing. This standalone primitive supplies the shared state/commit contract for a React row editor or application-specific modal.

## API

```ts
type RowEditOptions = {
  conflictPolicy?: "reject" | "overwrite"; // default: reject
};

type RowEditSnapshot = {
  readonly rowId: string;
  readonly status: "editing" | "committed" | "cancelled";
  readonly values: Readonly<Record<string, unknown>>;
  readonly dirtyColumns: readonly string[];
  readonly error?: string;
};

interface RowEditSession {
  getSnapshot(): RowEditSnapshot;
  subscribe(listener: () => void): () => void;
  setValue(columnId: string, value: unknown): string | undefined;
  commit(): string | undefined;
  cancel(): void;
}
```

The factory takes `(model, rowId, options?)`. Missing rows and unsupported conflict-policy configuration throw at creation. `setValue` and `commit` return a readable error string on ordinary validation/conflict failures; successful operations return `undefined`.

`getSnapshot` and `subscribe` are bound callbacks suitable for external-store subscriptions. Repeated snapshot reads preserve object identity until local state changes. The snapshot object, `values` record and `dirtyColumns` array are frozen. Sessions do not subscribe to the grid eagerly: outside model changes are checked on commit, rather than generating draft updates. Callers own the returned unsubscribe functions.

## Editable values and dirty tracking

Snapshot `values` are keyed by **column ID**, which can differ from a raw field name. The session captures only columns with `editable: true`, a nonempty `field`, and no `valueGetter`. It reads raw row fields rather than formatted values or computed getters. Hidden and pinned editable columns remain eligible. Read-only, computed, fieldless and unknown columns reject draft writes.

The baseline is captured once at session creation. Drafts become dirty only when they differ from that baseline; restoring the baseline clears their dirty flag. Primitive values use `Object.is`, preserving exact BigInt identity and distinguishing actual type changes. Date values compare millisecond timestamps; equivalent Date instances do not mark a field dirty. Dates are copied at the input/snapshot boundaries, so mutating a supplied or returned Date cannot change the internal draft.

The frozen values record is shallow. Custom compound field objects follow the grid's immutable-row ownership contract; avoid mutating their contents in place. The engine does not perform arbitrary object graph cloning or deep structural comparison. Custom parsers/validators should be deterministic and side-effect-free.

When multiple editable column IDs point at one raw field, their drafts stay coherent. The most recently edited alias supplies that field's parser and validator once at commit. The resulting parsed raw value is shown under every alias in the committed snapshot. A row-ID column may appear if configured editable, but the core's row-ID protection still rejects attempts to change its identity.

## Parsing, final-row validation and atomic commit

No parser or validator runs on `setValue`. Commit sends the dirty fields to `model.batchEdit` once. The model handles typed parsing, custom parser exceptions, row-ID guards, validation and history.

Batch parsing remains deterministic in edit order. Each parser sees the progressively staged row, including earlier parsed edits. **Column validators run only after all target fields have been staged.** Each targeted row/column validator runs once against its final value and the complete final row, even when a column occurs several times in the batch. This makes cross-field constraints independent of validator order:

```ts
const columns = [
  {
    id: "minimum",
    field: "minimum",
    editable: true,
    type: "number",
    validate: (value, row) =>
      Number(value) > row.maximum ? "Invalid interval" : undefined,
  },
  {
    id: "maximum",
    field: "maximum",
    editable: true,
    type: "number",
    validate: (value, row) =>
      Number(value) < row.minimum ? "Invalid interval" : undefined,
  },
];

// Existing row: { minimum: 5, maximum: 10 }
session.setValue("minimum", "20");
session.setValue("maximum", "30");
session.commit(); // valid final row: { minimum: 20, maximum: 30 }
```

A parser failure, invalid typed value, changed row ID, validator rejection or validator exception leaves model rows, history, caches and subscriptions unchanged. The session retains its draft and error so the user can correct it. All dirty fields commit together, produce one model notification, and share one undo unit. As with ordinary grid callbacks, mutating model-owned objects inside parser/validator callbacks is unsupported.

An unchanged session skips `batchEdit` entirely and closes successfully. If dirty raw input normalizes back to the same stored values—for example `'5'` parsed over numeric `5`—the core also skips row replacement, history and notification after validation. Existing redo history is preserved for these normalized no-ops. Successful session snapshots refresh all editable fields from the current committed row, including parsed values and external changes to untouched fields, then clear dirty flags.

Unexpected exceptions from application subscribers can propagate after a committed model change, as with other model mutations. They are not validation failures or a rollback protocol. Keep subscription callbacks free of mutation/errors.

## Concurrent updates

The default `conflictPolicy: 'reject'` compares each dirty raw field against its original baseline at commit time. If that field changed externally, commit rejects without overwriting it. Changes to untouched fields merge naturally because the batch applies against the latest model row.

```ts
const session = createRowEditSession(model, "order-42");
session.setValue("quantity", 12);
model.editCell("order-42", "description", "Server update");
session.commit(); // merges quantity=12 with the new description
```

`conflictPolicy: 'overwrite'` explicitly allows replacing externally changed **dirty** fields. It still preserves untouched fields and rejects a row missing at commit. It does not bypass parsing, validators or row-ID protection.

Conflict detection uses Date timestamps and exact primitive values, including BigInt. It is value-based, without row versions or a record of intermediate deletions. External changes restored to the original value do not conflict; a removed and reinserted row with the same stable ID is compared as the current logical row. Sessions cannot lock remote data or replace a server's own concurrency/version checks.

Rows filtered out of the current view remain editable by stable ID. `model.getRow(rowId)` reads the resident row store, independently of sorting, filtering, grouping and pagination. It builds a row-ID Map lazily and reuses it while the underlying rows-array identity stays unchanged, giving constant-time subsequent lookups. Edits, undo/redo, transactions and row replacement change that identity and refresh the index on demand. Returned rows follow the existing immutable-row ownership contract; the lookup does not expose the `getRowId` callback.

## Cancellation and terminal states

Cancel restores the local baseline, clears dirty flags/errors and publishes `status: 'cancelled'`. It never invokes model mutation. Later `setValue` or `commit` calls return a terminal-state error without changing the snapshot. Repeated cancellation is harmless. Committed sessions are likewise closed, and cancellation cannot undo their model changes; use `model.undo()` when desired.

## Verification and parity boundary

`row-edit.test.ts` covers raw field eligibility; local snapshots and subscriptions; typed parsing; one atomic commit/undo; complete final-row validation; parser failure/retry; unchanged and normalized no-ops; cancellation; terminal states; conflicts, merging and overwrite policy; deletion; Date/BigInt precision; aliases; row-ID protection; and filtered/pinned state independence. `core.test.ts` additionally checks final-row validation in both edit orders, duplicate target validation, normalized no-op redo preservation, direct lookup invalidation and prototype-like column IDs.

The public AG Grid v36.2.0 [Full Row Editing](https://www.ag-grid.com/react-data-grid/cell-editing-full-row/) documentation informed the feature inventory. This session API and implementation are original. A standalone session does not itself supply keyboard focus management, a multi-editor React view, remote persistence, asynchronous validators, optimistic server rollback or whole-workbook transactions. Those integrations retain their own lifecycle and accessibility requirements.
