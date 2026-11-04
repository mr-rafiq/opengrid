import type { GridHierarchyNode, GridModel } from "@opengrid/core";

/** Internal resident-client boundary, not an exported AG Grid facade. */
export interface Ag31RowNode<T> {
  readonly id: string;
  readonly data: T | undefined;
  readonly group: boolean;
  readonly level: number;
  readonly key: string | null;
  readonly field: string | undefined;
  readonly parent: Ag31RowNode<T> | null;
  readonly rowIndex: number | null;
  readonly rowTop: number | null;
  readonly expanded: boolean;
  readonly childrenAfterGroup: Ag31RowNode<T>[] | undefined;
  readonly childrenAfterFilter: Ag31RowNode<T>[] | undefined;
  readonly childrenAfterSort: Ag31RowNode<T>[] | undefined;
  readonly allLeafChildren: Ag31RowNode<T>[] | undefined;
  readonly aggData: Readonly<Record<string, unknown>> | null;
  isSelected(): boolean | undefined;
  setSelected(value: boolean, clearSelection?: boolean, source?: string): void;
  setExpanded(value: boolean): void;
  setDataValue(column: unknown, value: unknown, source?: string): boolean;
  depthFirstSearch(callback: (node: Ag31RowNode<T>) => unknown): void;
}
export interface Ag31RowNodeOptions<T> {
  model: GridModel<T>;
  rowHeight: number;
  groupIdentity(
    node: GridHierarchyNode<T>,
    parent: Ag31RowNode<T>,
  ): {
    id: string;
    key: string;
    field?: string;
  };
  writeCell(
    node: Ag31RowNode<T>,
    column: unknown,
    value: unknown,
    source: string,
  ): boolean;
  selectionChanged?(source: string): void;
}
type Entry<T> = {
  node: Ag31RowNode<T>;
  nativeId: string;
  live: boolean;
  data?: T;
  group: boolean;
  level: number;
  key: string | null;
  field?: string;
  parent: Ag31RowNode<T> | null;
  rowIndex: number | null;
  rowTop: number | null;
  expanded: boolean;
  grouped?: Ag31RowNode<T>[];
  filtered?: Ag31RowNode<T>[];
  sorted?: Ag31RowNode<T>[];
  leaves?: Ag31RowNode<T>[];
  aggData: Readonly<Record<string, unknown>> | null;
};

export function createAg31RowNodes<T>(options: Ag31RowNodeOptions<T>) {
  const { model } = options;
  if (!model.getRowHierarchy)
    throw new TypeError("Complete client hierarchy projections are required");
  if (!Number.isFinite(options.rowHeight) || options.rowHeight <= 0)
    throw new TypeError("A positive row height is required");
  let dirty = true,
    syncing = false,
    destroyed = false;
  let byId = new Map<string, Entry<T>>(),
    byNative = new Map<string, Entry<T>>();
  let sourceLeaves: Ag31RowNode<T>[] = [];
  const entries = new Map<Ag31RowNode<T>, Entry<T>>();

  function flatten(
    start: Ag31RowNode<T>[],
    children: "grouped" | "filtered" | "sorted",
    postorder = false,
  ) {
    const result: Ag31RowNode<T>[] = [];
    const visit = (nodes: Ag31RowNode<T>[]) => {
      for (const node of nodes) {
        if (!postorder) result.push(node);
        visit(entries.get(node)![children] ?? []);
        if (postorder) result.push(node);
      }
    };
    visit(start);
    return result;
  }
  function leafIds(entry: Entry<T>): string[] {
    return entry.group
      ? (entry.leaves ?? []).map((node) => node.id)
      : [entry.node.id];
  }
  function selected(entry: Entry<T>): boolean | undefined {
    sync();
    if (destroyed || !entry.live) return false;
    const ids = leafIds(entry),
      selected = new Set(model.getState().selected);
    const count = ids.filter((id) => selected.has(id)).length;
    return count === 0 ? false : count === ids.length ? true : undefined;
  }
  function create(id: string, nativeId: string): Entry<T> {
    let entry: Entry<T>;
    const read = () => {
      sync();
      return entry;
    };
    const node: Ag31RowNode<T> = {
      id,
      get data() {
        return read().data;
      },
      get group() {
        return read().group;
      },
      get level() {
        return read().level;
      },
      get key() {
        return read().key;
      },
      get field() {
        return read().field;
      },
      get parent() {
        return read().parent;
      },
      get rowIndex() {
        return read().rowIndex;
      },
      get rowTop() {
        return read().rowTop;
      },
      get expanded() {
        return read().expanded;
      },
      get childrenAfterGroup() {
        return read().grouped;
      },
      get childrenAfterFilter() {
        return read().filtered;
      },
      get childrenAfterSort() {
        return read().sorted;
      },
      get allLeafChildren() {
        return read().leaves;
      },
      get aggData() {
        return read().aggData;
      },
      isSelected: () => selected(entry),
      setSelected(value, clearSelection = false, source = "api") {
        if (typeof value !== "boolean" || typeof clearSelection !== "boolean")
          throw new TypeError("Selection flags must be boolean");
        sync();
        if (destroyed || !entry.live) return;
        const previous = model.getState().selected,
          next = new Set(clearSelection ? [] : previous);
        for (const id of leafIds(entry)) {
          if (value) next.add(id);
          else next.delete(id);
        }
        if (
          previous.length === next.size &&
          previous.every((id) => next.has(id))
        )
          return;
        model.setState({ selected: [...next] });
        options.selectionChanged?.(source);
      },
      setExpanded(value) {
        if (typeof value !== "boolean")
          throw new TypeError("Expansion must be boolean");
        sync();
        if (
          destroyed ||
          !entry.live ||
          entry === root ||
          !entry.group ||
          entry.expanded === value
        )
          return;
        model.toggleExpanded(entry.nativeId);
      },
      setDataValue(column, value, source = "edit") {
        sync();
        if (destroyed || !entry.live || model.isReadOnly()) return false;
        return options.writeCell(node, column, value, source);
      },
      depthFirstSearch(callback) {
        if (typeof callback !== "function")
          throw new TypeError("A traversal callback is required");
        sync();
        if (destroyed || !entry.live) return;
        for (const node of flatten([entry.node], "grouped", true))
          callback(node);
      },
    };
    entry = {
      node,
      nativeId,
      live: false,
      group: false,
      level: 0,
      key: null,
      parent: null,
      rowIndex: null,
      rowTop: null,
      expanded: false,
      aggData: null,
    };
    entries.set(node, entry);
    return entry;
  }
  const root = create("ROOT_NODE_ID", "ROOT_NODE_ID");
  root.live = true;
  root.group = true;
  root.level = -1;
  root.expanded = true;

  function sync() {
    if (!dirty || syncing || destroyed) return;
    syncing = true;
    const created: Entry<T>[] = [];
    try {
      const source = model.getRowHierarchy!("source"),
        filtered = model.getRowHierarchy!("filtered"),
        sorted = model.getRowHierarchy!("sorted");
      const nextById = new Map<string, Entry<T>>(),
        nextByNative = new Map<string, Entry<T>>();
      const sourceByData = new Map<T, Entry<T>>();
      const expanded = new Set(model.getState().expanded);
      const assignments = new Map<Entry<T>, Partial<Entry<T>>>();
      function visit(
        nodes: readonly GridHierarchyNode<T>[],
        parent: Entry<T>,
      ): Ag31RowNode<T>[] {
        return nodes.map((node) => {
          const group = node.kind === "group" || !!node.children;
          if (group && node.data !== undefined)
            throw new TypeError(
              "Data-bearing tree groups require a separate compatibility projection",
            );
          const identity = group
            ? options.groupIdentity(node, parent.node)
            : { id: node.id, key: null, field: undefined };
          if (
            !identity.id ||
            identity.id === root.node.id ||
            nextById.has(identity.id)
          )
            throw new TypeError(
              "Duplicate/reserved compatibility row identity",
            );
          const previous = byNative.get(node.id);
          const entry =
            previous?.node.id === identity.id
              ? previous
              : create(identity.id, node.id);
          if (entry !== previous) created.push(entry);
          nextById.set(identity.id, entry);
          nextByNative.set(node.id, entry);
          if (node.data !== undefined) sourceByData.set(node.data, entry);
          const grouped = node.children
            ? visit(node.children, entry)
            : undefined;
          const leaves = group
            ? (grouped ?? []).flatMap((child) => {
                const childEntry = entries.get(child)!,
                  assignment = assignments.get(childEntry)!;
                return assignment.group ? (assignment.leaves ?? []) : [child];
              })
            : undefined;
          assignments.set(entry, {
            live: true,
            data: node.data,
            group,
            level: node.depth,
            key: identity.key,
            field: identity.field,
            parent: parent.node,
            grouped,
            filtered: group ? [] : undefined,
            sorted: group ? [] : undefined,
            leaves,
            expanded: group && expanded.has(node.id),
            rowIndex: null,
            rowTop: null,
            aggData: null,
          });
          return entry.node;
        });
      }
      const grouped = visit(source, root);
      function project(
        nodes: readonly GridHierarchyNode<T>[],
        key: "filtered" | "sorted",
      ): Ag31RowNode<T>[] {
        return nodes.map((node) => {
          const entry = nextByNative.get(node.id);
          if (!entry)
            throw new TypeError("Projected hierarchy has no source node");
          const assignment = assignments.get(entry)!;
          assignment[key] = node.children
            ? project(node.children, key)
            : undefined;
          if (key === "sorted") assignment.aggData = node.aggregates ?? null;
          return entry.node;
        });
      }
      const afterFilter = project(filtered, "filtered"),
        afterSort = project(sorted, "sorted");
      let top = 0;
      model.getRowModel().forEach((node, index) => {
        const entry = nextByNative.get(node.id);
        if (entry)
          Object.assign(assignments.get(entry)!, {
            rowIndex: index,
            rowTop: top,
          });
        top += options.rowHeight;
      });
      const nextLeaves = model.getRows().map((row) => {
        const entry = sourceByData.get(row);
        if (!entry) throw new TypeError("Source row has no hierarchy node");
        return entry.node;
      });
      for (const entry of byId.values())
        if (nextById.get(entry.node.id) !== entry) {
          entry.live = false;
          entry.rowIndex = entry.rowTop = null;
          if (entry.group)
            entry.grouped = entry.filtered = entry.sorted = entry.leaves = [];
          entries.delete(entry.node);
        }
      for (const [entry, assignment] of assignments)
        Object.assign(entry, assignment);
      root.grouped = grouped;
      root.filtered = afterFilter;
      root.sorted = afterSort;
      root.leaves = nextLeaves;
      byId = nextById;
      byNative = nextByNative;
      sourceLeaves = nextLeaves;
      dirty = false;
    } catch (error) {
      for (const entry of created) entries.delete(entry.node);
      throw error;
    } finally {
      syncing = false;
    }
  }
  const unsubscribe = model.subscribe(() => {
    dirty = true;
  });
  function forEach(
    children: "grouped" | "filtered" | "sorted",
    callback: (node: Ag31RowNode<T>, index: number) => void,
  ) {
    sync();
    if (destroyed) return;
    flatten(root[children] ?? [], children).forEach(callback);
  }
  return Object.freeze({
    getRowNode(id: string) {
      sync();
      return destroyed ? undefined : byId.get(id)?.node;
    },
    getRootNode() {
      sync();
      return root.node;
    },
    forEachNode: (callback: (node: Ag31RowNode<T>, index: number) => void) =>
      forEach("grouped", callback),
    forEachNodeAfterFilter: (
      callback: (node: Ag31RowNode<T>, index: number) => void,
    ) => forEach("filtered", callback),
    forEachNodeAfterFilterAndSort: (
      callback: (node: Ag31RowNode<T>, index: number) => void,
    ) => forEach("sorted", callback),
    forEachLeafNode(callback: (node: Ag31RowNode<T>, index: number) => void) {
      sync();
      if (!destroyed) [...sourceLeaves].forEach(callback);
    },
    refresh() {
      if (!destroyed) {
        dirty = true;
        sync();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      for (const entry of entries.values()) {
        entry.live = false;
        entry.rowIndex = entry.rowTop = null;
      }
      byId.clear();
      byNative.clear();
      sourceLeaves = [];
    },
    isDestroyed: () => destroyed,
  });
}
