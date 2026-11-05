import type { Ag31ColumnDefinition } from "./ag31-leaf-columns.js";

export interface Ag31ColumnGroupState {
  groupId: string;
  open: boolean;
}
export interface SourceHeaderPathPart {
  key: string;
  label: string;
}
type Group<T> = {
  id: string;
  definition?: Ag31ColumnDefinition<T>;
  children: Branch<T>[];
  open: boolean;
  initialOpen: boolean;
  padding: boolean;
};
type Leaf = { leafId: string; show?: "open" | "closed" };
type Branch<T> = { group: Group<T>; show?: "open" | "closed" } | Leaf;

/** Resident provided groups own display conditions independently from saved leaf visibility. */
export function createAg31ColumnGroups<T>(
  definitions: readonly Ag31ColumnDefinition<T>[],
  changed: (groupIds: readonly string[]) => void,
  visibility?: { isVisible(id: string): boolean; snapshot(): unknown },
) {
  const groups = new Map<string, Group<T>>(),
    leaves = new Map<
      string,
      {
        conditions: { group: Group<T>; show: "open" | "closed" }[];
        path: SourceHeaderPathPart[];
      }
    >();
  const stack = new Set<object>();
  let nextId = 0,
    count = 0,
    maximumDepth = 0;
  function key(requested?: unknown): string {
    let base: string;
    if (requested == null) {
      while (groups.has(String(nextId))) nextId++;
      return String(nextId++);
    } else {
      if (
        typeof requested !== "string" ||
        !requested ||
        requested.length > 4096
      )
        throw new TypeError("Source group IDs require bounded nonempty text");
      base = requested;
    }
    let result = base,
      duplicate = 0;
    while (groups.has(result)) result = `${base}_${++duplicate}`;
    return result;
  }
  function show(definition: Ag31ColumnDefinition<T>) {
    const value = definition.columnGroupShow;
    if (value != null && value !== "open" && value !== "closed")
      throw new TypeError("columnGroupShow must be open or closed");
    return value as "open" | "closed" | undefined;
  }
  function build(
    input: readonly Ag31ColumnDefinition<T>[],
    depth: number,
  ): Branch<T>[] {
    if (depth > 8)
      throw new RangeError("Source header groups support at most eight levels");
    maximumDepth = Math.max(maximumDepth, depth);
    return input.map((definition) => {
      if (
        !definition ||
        typeof definition !== "object" ||
        stack.has(definition) ||
        ++count > 9000
      )
        throw new TypeError(
          "Source header definitions require a bounded acyclic tree",
        );
      const display = show(definition);
      if (definition.children !== undefined) {
        if (!Array.isArray(definition.children))
          throw new TypeError("Source group children must be an array");
        const id = key(definition.groupId);
        const group: Group<T> = {
          id,
          definition,
          children: [],
          open: definition.openByDefault === true,
          initialOpen: definition.openByDefault === true,
          padding: false,
        };
        groups.set(id, group);
        stack.add(definition);
        group.children = build(definition.children, depth + 1);
        stack.delete(definition);
        return { group, show: display };
      }
      const id = definition.colId ?? definition.field;
      if (typeof id !== "string" || !id || leaves.has(id))
        throw new TypeError("Source leaves require unique explicit IDs");
      leaves.set(id, { conditions: [], path: [] });
      return { leafId: id, show: display };
    });
  }
  const roots = build(definitions, 0);
  function balance(branches: Branch<T>[], depth: number): Branch<T>[] {
    return branches.map((branch) => {
      if ("group" in branch) {
        branch.group.children = balance(branch.group.children, depth + 1);
        return branch;
      }
      if (depth === maximumDepth) return branch;
      const id = key();
      const group: Group<T> = {
        id,
        children: [],
        open: false,
        initialOpen: false,
        padding: true,
      };
      groups.set(id, group);
      group.children = balance([{ ...branch, show: undefined }], depth + 1);
      return { group, show: branch.show };
    });
  }
  const balanced = balance(roots, 0),
    ordered: Group<T>[] = [];
  function register(
    branches: Branch<T>[],
    parents: Group<T>[],
    conditions: { group: Group<T>; show: "open" | "closed" }[],
  ) {
    for (const branch of branches) {
      const parent = parents.at(-1);
      const next =
        branch.show && parent
          ? [...conditions, { group: parent, show: branch.show }]
          : conditions;
      if ("group" in branch) {
        const children = branch.group.children;
        register(children, [...parents, branch.group], next);
        ordered.push(branch.group);
      } else {
        const leaf = leaves.get(branch.leafId)!;
        leaf.conditions = next;
        leaf.path = parents.map((group) => ({
          key: group.id,
          label: group.padding
            ? ""
            : String(
                group.definition?.headerName ?? group.definition?.groupId ?? "",
              ),
        }));
      }
    }
  }
  register(balanced, [], []);
  let visibilitySnapshot: unknown = Symbol("unprepared");
  const projections = new Map<
    Group<T>,
    { visible: boolean; expandable: boolean }
  >();
  function projection(group: Group<T>): {
    visible: boolean;
    expandable: boolean;
  } {
    const snapshot = visibility?.snapshot();
    if (!Object.is(snapshot, visibilitySnapshot)) {
      visibilitySnapshot = snapshot;
      projections.clear();
    }
    const cached = projections.get(group);
    if (cached) return cached;
    const children = group.children.filter((child) =>
      "group" in child
        ? projection(child.group).visible
        : (visibility?.isVisible(child.leafId) ?? true),
    );
    const result = {
      visible: children.length > 0,
      expandable:
        !group.padding &&
        children.some((child) => child.show !== undefined) &&
        children.some((child) => child.show !== "open") &&
        children.some((child) => child.show !== "closed"),
    };
    projections.set(group, result);
    return result;
  }
  function publish(updates: Map<Group<T>, boolean>) {
    const changedIds: string[] = [];
    for (const [group, open] of updates)
      if (group.open !== open) {
        group.open = open;
        changedIds.push(group.id);
      }
    if (changedIds.length) changed(changedIds);
  }
  return Object.freeze({
    getColumnGroupState: (): Ag31ColumnGroupState[] =>
      ordered.map((group) => ({ groupId: group.id, open: group.open })),
    setColumnGroupState(input: readonly Ag31ColumnGroupState[]) {
      if (!Array.isArray(input) || input.length > 9000)
        throw new TypeError("Source group state requires a bounded array");
      const updates = new Map<Group<T>, boolean>();
      for (const record of input) {
        if (
          !record ||
          typeof record !== "object" ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(record))
        )
          throw new TypeError("Source group state requires plain records");
        const id = Object.getOwnPropertyDescriptor(record, "groupId"),
          open = Object.getOwnPropertyDescriptor(record, "open");
        if (
          !id ||
          !("value" in id) ||
          typeof id.value !== "string" ||
          !open ||
          !("value" in open) ||
          typeof open.value !== "boolean"
        )
          throw new TypeError(
            "Source group state requires groupId text and open boolean",
          );
        const group = groups.get(id.value);
        if (group) updates.set(group, open.value);
      }
      publish(updates);
    },
    resetColumnGroupState: () =>
      publish(new Map(ordered.map((group) => [group, group.initialOpen]))),
    setColumnGroupOpened(id: string, open: boolean) {
      if (typeof id !== "string" || typeof open !== "boolean")
        throw new TypeError("A source group ID and boolean are required");
      const group = groups.get(id);
      if (group) publish(new Map([[group, open]]));
    },
    isColumnDisplayed(id: string) {
      return (
        leaves
          .get(id)
          ?.conditions.every(
            ({ group, show }) =>
              !projection(group).expandable || group.open === (show === "open"),
          ) ?? false
      );
    },
    getPath: (id: string): readonly SourceHeaderPathPart[] =>
      leaves.get(id)?.path.map((part) => ({ ...part })) ?? [],
    isExpanded: (path: readonly string[]) =>
      groups.get(path.at(-1) ?? "")?.open ?? false,
    canToggle: (path: readonly string[]) =>
      groups.has(path.at(-1) ?? "")
        ? projection(groups.get(path.at(-1) ?? "")!).expandable
        : false,
    toggle(path: readonly string[]) {
      const group = groups.get(path.at(-1) ?? "");
      if (group && projection(group).expandable)
        publish(new Map([[group, !group.open]]));
    },
  });
}
