import type { RowId, RowNode } from "./types.js";

export const HIERARCHY_SELECTION_LIMITS = Object.freeze({
  maxNodes: 200_000,
  maxRows: 100_000,
  maxDepth: 128,
  maxProjectionWork: 1_000_000,
  maxIdLength: 4096,
  maxIdCharacters: 16_000_000,
});
export class HierarchySelectionError extends TypeError {
  constructor(
    readonly code: "SHAPE" | "DUPLICATE" | "CYCLE" | "LIMIT",
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "HierarchySelectionError";
  }
}
export interface HierarchySelectionState {
  readonly total: number;
  readonly selected: number;
  readonly checked: boolean;
  readonly mixed: boolean;
}
export interface ResolvedHierarchySelection {
  readonly selection: readonly RowId[];
  getState(nodeId: string): HierarchySelectionState | undefined;
  getUnionState(nodeIds: readonly string[]): HierarchySelectionState;
  /** Toggle a union once; explicit checked sets/clears it. Unrelated IDs survive. */
  toggle(nodeIds: readonly string[], checked?: boolean): readonly RowId[];
}
export interface HierarchySelectionPlan {
  readonly rowIds: readonly RowId[];
  readonly nodeCount: number;
  getRowIds(nodeId: string): readonly RowId[] | undefined;
  resolve(selected: readonly RowId[]): ResolvedHierarchySelection;
}
type Interval = Readonly<{ start: number; end: number }>;
function fail(
  code: HierarchySelectionError["code"],
  path: string,
  message: string,
): never {
  throw new HierarchySelectionError(code, path, message);
}
function arrayEntries(
  input: unknown,
  path: string,
  maximum: number,
): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype)
    fail("SHAPE", path, "Expected a dense ordinary array");
  if (input.length > maximum)
    fail("LIMIT", path, "Hierarchy array budget exceeded");
  if (Reflect.ownKeys(input).length !== input.length + 1)
    fail(
      "SHAPE",
      path,
      "Hierarchy arrays cannot have holes or extra properties",
    );
  return Array.from({ length: input.length }, (_, index) => {
    const entry = Object.getOwnPropertyDescriptor(input, String(index));
    if (!entry || !("value" in entry))
      fail(
        "SHAPE",
        `${path}[${index}]`,
        "Hierarchy arrays require data entries",
      );
    return entry.value;
  });
}
function idList(input: unknown, path: string, maximum: number): Set<string> {
  const result = new Set<string>();
  let characters = 0;
  for (const value of arrayEntries(input, path, maximum)) {
    if (typeof value !== "string" || !value)
      fail("SHAPE", path, "Selection IDs must be nonempty strings");
    characters += value.length;
    if (
      value.length > HIERARCHY_SELECTION_LIMITS.maxIdLength ||
      characters > HIERARCHY_SELECTION_LIMITS.maxIdCharacters
    )
      fail("LIMIT", path, "Selection ID text budget exceeded");
    result.add(value);
  }
  return result;
}
function field(record: object, key: string, path: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor))
    fail("SHAPE", `${path}.${key}`, "Hierarchy metadata cannot use accessors");
  return descriptor.value;
}

/** Snapshot a forest, including collapsed descendants; optional eligibility filters source IDs.
 * Data-bearing branches include their own source row. No row data/getters are read. */
export function createHierarchySelectionPlan<T>(
  nodes: readonly RowNode<T>[],
  options: { eligibleRowIds?: readonly RowId[] } = {},
): HierarchySelectionPlan {
  const eligible =
    options.eligibleRowIds === undefined
      ? undefined
      : idList(
          options.eligibleRowIds,
          "eligibleRowIds",
          HIERARCHY_SELECTION_LIMITS.maxRows,
        );
  const roots = arrayEntries(
    nodes,
    "nodes",
    HIERARCHY_SELECTION_LIMITS.maxNodes,
  );
  const intervals = new Map<string, Interval>(),
    kinds = new Map<string, "row" | "group">(),
    active = new WeakSet<object>(),
    rowIds: string[] = [];
  type Task =
    | { value: unknown; path: string; depth: number }
    | { exit: object; id: string; start: number };
  const stack: Task[] = roots
    .map((value, index) => ({ value, path: `nodes[${index}]`, depth: 0 }))
    .reverse();
  let scheduled = roots.length,
    rows = 0,
    characters = 0;
  while (stack.length) {
    const task = stack.pop()!;
    if ("exit" in task) {
      active.delete(task.exit);
      intervals.set(
        task.id,
        Object.freeze({ start: task.start, end: rowIds.length }),
      );
      continue;
    }
    const { value, path, depth } = task;
    if (
      !value ||
      typeof value !== "object" ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    )
      fail("SHAPE", path, "Hierarchy nodes must be ordinary records");
    if (active.has(value))
      fail("CYCLE", path, "Hierarchy cycles are unsupported");
    if (depth > HIERARCHY_SELECTION_LIMITS.maxDepth)
      fail("LIMIT", path, "Hierarchy depth budget exceeded");
    const id = field(value, "id", path),
      kind = field(value, "kind", path);
    if (typeof id !== "string" || !id || (kind !== "row" && kind !== "group"))
      fail("SHAPE", path, "Hierarchy nodes require an ID and row/group kind");
    characters += id.length;
    if (
      id.length > HIERARCHY_SELECTION_LIMITS.maxIdLength ||
      characters > HIERARCHY_SELECTION_LIMITS.maxIdCharacters
    )
      fail("LIMIT", path, "Hierarchy ID text budget exceeded");
    if (kinds.has(id))
      fail("DUPLICATE", `${path}.id`, "Hierarchy node IDs must be unique");
    kinds.set(id, kind);
    const children = field(value, "children", path);
    const entries =
      children === undefined
        ? []
        : arrayEntries(
            children,
            `${path}.children`,
            HIERARCHY_SELECTION_LIMITS.maxNodes,
          );
    scheduled += entries.length;
    if (scheduled > HIERARCHY_SELECTION_LIMITS.maxNodes)
      fail("LIMIT", path, "Hierarchy node budget exceeded");
    const start = rowIds.length;
    if (kind === "row") {
      if (++rows > HIERARCHY_SELECTION_LIMITS.maxRows)
        fail("LIMIT", path, "Hierarchy source row budget exceeded");
      if (!eligible || eligible.has(id)) rowIds.push(id);
    }
    active.add(value);
    stack.push({ exit: value, id, start });
    for (let index = entries.length - 1; index >= 0; index--)
      stack.push({
        value: entries[index],
        path: `${path}.children[${index}]`,
        depth: depth + 1,
      });
  }
  if (eligible)
    for (const id of eligible)
      if (kinds.get(id) !== "row")
        fail(
          "SHAPE",
          "eligibleRowIds",
          "Eligible IDs must identify source rows in this forest",
        );
  const ownedRows = Object.freeze(rowIds);
  function unionRanges(nodeIds: readonly string[]): Interval[] {
    const ids = idList(nodeIds, "nodeIds", HIERARCHY_SELECTION_LIMITS.maxNodes);
    const ranges: Interval[] = [];
    for (const id of ids) {
      const range = intervals.get(id);
      if (!range)
        fail("SHAPE", "nodeIds", "Selection target is not in this forest");
      if (range.start !== range.end) ranges.push(range);
    }
    ranges.sort(
      (left, right) => left.start - right.start || right.end - left.end,
    );
    const merged: { start: number; end: number }[] = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range.start <= last.end)
        last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    return merged;
  }
  return Object.freeze({
    rowIds: ownedRows,
    nodeCount: kinds.size,
    getRowIds(nodeId: string) {
      const range = intervals.get(nodeId);
      return range
        ? Object.freeze(ownedRows.slice(range.start, range.end))
        : undefined;
    },
    resolve(selected: readonly RowId[]) {
      const selectedSet = idList(
        selected,
        "selected",
        HIERARCHY_SELECTION_LIMITS.maxRows,
      );
      const selection = Object.freeze([...selectedSet]);
      const prefix = new Uint32Array(ownedRows.length + 1);
      for (let index = 0; index < ownedRows.length; index++)
        prefix[index + 1] =
          prefix[index] + Number(selectedSet.has(ownedRows[index]));
      function countRanges(
        ranges: readonly Interval[],
      ): HierarchySelectionState {
        let total = 0,
          count = 0;
        for (const { start, end } of ranges) {
          total += end - start;
          count += prefix[end] - prefix[start];
        }
        return Object.freeze({
          total,
          selected: count,
          checked: total > 0 && count === total,
          mixed: count > 0 && count < total,
        });
      }
      return Object.freeze({
        selection,
        getState(nodeId: string) {
          const range = intervals.get(nodeId);
          if (!range) return undefined;
          return countRanges([range]);
        },
        getUnionState(nodeIds: readonly string[]) {
          return countRanges(unionRanges(nodeIds));
        },
        toggle(nodeIds: readonly string[], checked?: boolean) {
          if (checked !== undefined && typeof checked !== "boolean")
            fail("SHAPE", "checked", "Selection intent must be boolean");
          const merged = unionRanges(nodeIds),
            all = countRanges(merged).checked;
          const next = new Set(selectedSet),
            add = checked ?? !all;
          let changed = false;
          for (const { start, end } of merged)
            for (let index = start; index < end; index++) {
              const id = ownedRows[index];
              if (add && !next.has(id)) {
                if (next.size >= HIERARCHY_SELECTION_LIMITS.maxRows)
                  fail("LIMIT", "selected", "Selection row budget exceeded");
                next.add(id);
                changed = true;
              } else if (!add && next.delete(id)) changed = true;
            }
          return changed ? Object.freeze([...next]) : selection;
        },
      });
    },
  });
}
