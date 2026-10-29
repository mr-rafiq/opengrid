/** Internal order planner. Not part of the package's public export map. */
export interface RowMoveDelta {
  readonly kind: "move";
  readonly count: number;
  readonly items: readonly Readonly<{ id: string; originalIndex: number }>[];
  readonly targetId: string;
  readonly position: "before" | "after";
}
interface RowMovePlan<T> {
  next: T[];
  delta?: RowMoveDelta;
  error?: string;
}

function indexRows<T>(
  rows: T[],
  getId: (row: T) => string,
): Map<string, number> {
  const index = new Map<string, number>();
  for (let position = 0; position < rows.length; position++) {
    const id = getId(rows[position]);
    if (typeof id !== "string" || !id || index.has(id))
      throw new Error("Resident row IDs must remain unique nonempty strings");
    index.set(id, position);
  }
  return index;
}

export function planRowMove<T>(
  rows: T[],
  ids: readonly string[],
  targetId: string,
  position: "before" | "after",
  getId: (row: T) => string,
): RowMovePlan<T> {
  const fail = (error: string): RowMovePlan<T> => ({ next: rows, error });
  if (position !== "before" && position !== "after")
    return fail("Row position must be before or after");
  if (typeof targetId !== "string" || !targetId)
    return fail("Target row ID must be a nonempty string");
  if (!Array.isArray(ids)) return fail("Moved row IDs must be an array");
  if (ids.length > rows.length) return fail("Too many moved row IDs");
  const selected = new Set<string>();
  for (let index = 0; index < ids.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(ids, String(index));
    if (!descriptor || !("value" in descriptor))
      return fail("Moved row IDs cannot contain holes or accessors");
    const id: unknown = descriptor.value;
    if (typeof id !== "string" || !id)
      return fail("Moved row IDs must be nonempty strings");
    if (selected.has(id)) return fail(`Duplicate moved row ID: ${id}`);
    selected.add(id);
  }
  let byId: Map<string, number>;
  try {
    byId = indexRows(rows, getId);
  } catch {
    return fail("Cannot reorder invalid resident row IDs");
  }
  if (!byId.has(targetId)) return fail(`Unknown target row: ${targetId}`);
  for (const id of selected)
    if (!byId.has(id)) return fail(`Unknown moved row: ${id}`);
  if (!selected.size || selected.has(targetId)) return { next: rows };
  const items = [...byId]
    .filter(([id]) => selected.has(id))
    .map(([id, originalIndex]) => ({ id, originalIndex }));
  const originalIndices = new Set(items.map((item) => item.originalIndex));
  const moving = items.map((item) => rows[item.originalIndex]);
  const remaining = rows.filter((_, index) => !originalIndices.has(index));
  const targetIndex = byId.get(targetId)!;
  const removedBefore = items.reduce(
    (count, item) => count + (item.originalIndex < targetIndex ? 1 : 0),
    0,
  );
  const insertion =
    targetIndex - removedBefore + (position === "after" ? 1 : 0);
  const next = remaining
    .slice(0, insertion)
    .concat(moving, remaining.slice(insertion));
  if (next.every((row, index) => row === rows[index])) return { next: rows };
  const delta: RowMoveDelta = Object.freeze({
    kind: "move",
    count: rows.length,
    items: Object.freeze(items.map((item) => Object.freeze(item))),
    targetId,
    position,
  });
  return { next, delta };
}

/** Reconstruct a move using current row objects; chronological edits retain their values. */
export function replayRowMove<T>(
  rows: T[],
  delta: RowMoveDelta,
  direction: "undo" | "redo",
  getId: (row: T) => string,
): T[] {
  if (rows.length !== delta.count)
    throw new Error(
      "Row move history no longer matches the resident row count",
    );
  const byId = indexRows(rows, getId);
  if (!byId.has(delta.targetId))
    throw new Error("Row move history target is no longer present");
  let previous = -1;
  const moving = new Map<string, T>();
  for (const item of delta.items) {
    if (
      !Number.isInteger(item.originalIndex) ||
      item.originalIndex <= previous ||
      item.originalIndex >= delta.count ||
      moving.has(item.id) ||
      !byId.has(item.id) ||
      item.id === delta.targetId
    )
      throw new Error("Row move history no longer matches resident IDs");
    moving.set(item.id, rows[byId.get(item.id)!]);
    previous = item.originalIndex;
  }
  if (direction === "redo") {
    const plan = planRowMove(
      rows,
      [...moving.keys()],
      delta.targetId,
      delta.position,
      getId,
    );
    if (plan.error || !plan.delta)
      throw new Error(
        plan.error ?? "Row move history no longer matches resident order",
      );
    return plan.next;
  }
  const movedIndices = new Set([...moving.keys()].map((id) => byId.get(id)!));
  const remaining = rows.filter((_, index) => !movedIndices.has(index));
  const next: T[] = new Array(delta.count);
  let movedIndex = 0,
    remainingIndex = 0;
  for (let index = 0; index < delta.count; index++) {
    const item = delta.items[movedIndex];
    if (item?.originalIndex === index) {
      next[index] = moving.get(item.id)!;
      movedIndex++;
    } else next[index] = remaining[remainingIndex++];
  }
  if (next.every((row, index) => row === rows[index]))
    throw new Error("Row move history no longer matches resident order");
  return next;
}
