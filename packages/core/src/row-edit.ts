import type { Column, GridModel } from "./types.js";

export interface RowEditOptions {
  conflictPolicy?: "reject" | "overwrite";
}
export interface RowEditSnapshot {
  readonly rowId: string;
  readonly status: "editing" | "committed" | "cancelled";
  readonly values: Readonly<Record<string, unknown>>;
  readonly dirtyColumns: readonly string[];
  readonly error?: string;
}
export interface RowEditSession {
  getSnapshot(): RowEditSnapshot;
  subscribe(listener: () => void): () => void;
  setValue(columnId: string, value: unknown): string | undefined;
  commit(): string | undefined;
  cancel(): void;
}
const equal = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? Object.is(a.getTime(), b.getTime())
    : Object.is(a, b);
const copy = (value: unknown): unknown =>
  value instanceof Date ? new Date(value.getTime()) : value;

/** Drafts are local; the sole model mutation is one validated atomic batch on commit. */
export function createRowEditSession<T>(
  model: GridModel<T>,
  rowId: string,
  options: RowEditOptions = {},
): RowEditSession {
  const conflictPolicy = options.conflictPolicy ?? "reject";
  if (conflictPolicy !== "reject" && conflictPolicy !== "overwrite")
    throw new TypeError("Unknown row-edit conflict policy");
  const initialRow = model.getRow(rowId);
  if (initialRow == null) throw new Error(`Cannot edit missing row: ${rowId}`);
  const allColumns = new Map(
    model.getColumns().map((column) => [column.id, column]),
  );
  const editable = new Map(
    [...allColumns].filter(
      (entry): entry is [string, Column<T> & { field: keyof T & string }] =>
        !!entry[1].editable && !!entry[1].field && !entry[1].valueGetter,
    ),
  );
  const baseline = new Map<string, unknown>(),
    draft = new Map<string, unknown>();
  const fieldSources = new Map<string, string>();
  for (const [id, column] of editable) {
    const value = copy(initialRow[column.field]);
    baseline.set(id, value);
    draft.set(id, copy(value));
  }
  const listeners = new Set<() => void>();
  let status: RowEditSnapshot["status"] = "editing",
    currentError: string | undefined;
  function dirtyColumns(): string[] {
    return [...editable.keys()].filter(
      (id) => !equal(baseline.get(id), draft.get(id)),
    );
  }
  function snapshot(): RowEditSnapshot {
    return Object.freeze({
      rowId,
      status,
      values: Object.freeze(
        Object.fromEntries([...draft].map(([id, value]) => [id, copy(value)])),
      ),
      dirtyColumns: Object.freeze(dirtyColumns()),
      ...(currentError ? { error: currentError } : {}),
    });
  }
  let current = snapshot();
  function publish() {
    current = snapshot();
    for (const listener of [...listeners]) listener();
  }
  function fail(message: string) {
    if (currentError !== message) {
      currentError = message;
      publish();
    }
    return message;
  }
  const closed = () => `Row edit session is ${status}`;
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setValue(columnId, value) {
      if (status !== "editing") return closed();
      const column = editable.get(columnId);
      if (!column)
        return fail(
          allColumns.has(columnId)
            ? `Column is read only: ${columnId}`
            : `Unknown column: ${columnId}`,
        );
      const previous = draft.get(columnId),
        changed = !equal(previous, value);
      // Multiple column IDs can edit the same raw field. Keep their drafts coherent and
      // use the most recently edited alias's parser/validator once when committing.
      for (const [id, alias] of editable)
        if (alias.field === column.field) draft.set(id, copy(value));
      fieldSources.set(column.field, columnId);
      if (changed || currentError !== undefined) {
        currentError = undefined;
        publish();
      }
      return undefined;
    },
    commit() {
      if (status !== "editing") return closed();
      const row = model.getRow(rowId);
      if (row == null) return fail(`Row was deleted: ${rowId}`);
      const dirty = dirtyColumns(),
        edits: { rowId: string; columnId: string; value: unknown }[] = [];
      const stagedFields = new Set<string>();
      for (const id of dirty) {
        const column = editable.get(id)!;
        if (stagedFields.has(column.field)) continue;
        stagedFields.add(column.field);
        if (
          conflictPolicy === "reject" &&
          !equal(baseline.get(id), row[column.field])
        )
          return fail(`Row changed externally in column: ${id}`);
        const source = fieldSources.get(column.field) ?? id;
        edits.push({ rowId, columnId: source, value: copy(draft.get(source)) });
      }
      if (edits.length) {
        const error = model.batchEdit(edits);
        if (error) return fail(error);
      }
      // Display committed parsed values, including concurrent changes to untouched fields.
      const committed = model.getRow(rowId)!;
      for (const [id, column] of editable) {
        const value = copy(committed[column.field]);
        baseline.set(id, value);
        draft.set(id, copy(value));
      }
      status = "committed";
      currentError = undefined;
      publish();
      return undefined;
    },
    cancel() {
      if (status !== "editing") return;
      for (const [id, value] of baseline) draft.set(id, copy(value));
      fieldSources.clear();
      status = "cancelled";
      currentError = undefined;
      publish();
    },
  };
}
