import type { GridHierarchyNode, GridModel } from "@opengrid/core";
import {
  HIERARCHY_SELECTION_LIMITS,
  HierarchySelectionError,
} from "@opengrid/core";

/** Internal resident-client boundary, not an exported AG Grid facade. */
export interface Ag31RowNode<T> {
  readonly id: string;
  readonly data: T | undefined;
  readonly group: boolean;
  readonly level: number;
  readonly key: string | null;
  readonly groupData: Record<string, unknown> | undefined;
  readonly field: string | undefined;
  readonly parent: Ag31RowNode<T> | null;
  readonly rowIndex: number | null;
  readonly rowTop: number | null;
  readonly rowHeight: number | undefined;
  readonly allChildrenCount: number | undefined;
  readonly firstChild: boolean | undefined;
  readonly lastChild: boolean | undefined;
  readonly childIndex: number | undefined;
  readonly selected: boolean | undefined;
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
  addEventListener(type: string, listener: Ag31RowNodeListener<T>): void;
  removeEventListener(type: string, listener: Ag31RowNodeListener<T>): void;
}
export interface Ag31RowNodeEvent<T> {
  readonly type: string;
  readonly node: Ag31RowNode<T>;
}
export type Ag31RowNodeListener<T> = (event: Ag31RowNodeEvent<T>) => void;
export interface Ag31RowNodeOptions<T> {
  model: GridModel<T>;
  /** Must be the same identity function used by the native model. */
  getRowId(row: T): string;
  rowHeight: number;
  groupIdentity(
    node: GridHierarchyNode<T>,
    parent: Ag31RowNode<T>,
  ): {
    id: string;
    key: string;
    field?: string;
    groupData?: Readonly<Record<string, unknown>>;
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
  groupData?: Record<string, unknown>;
  field?: string;
  parent: Ag31RowNode<T> | null;
  rowIndex: number | null;
  rowTop: number | null;
  rowHeight?: number;
  allChildrenCount?: number;
  firstChild?: boolean;
  lastChild?: boolean;
  childIndex?: number;
  selectionValue: boolean | undefined;
  listeners: Map<string, Set<Ag31RowNodeListener<T>>>;
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
  if (typeof options.getRowId !== "function")
    throw new TypeError("The native source identity function is required");
  if (!Number.isFinite(options.rowHeight) || options.rowHeight <= 0)
    throw new TypeError("A positive row height is required");
  let dirty = true,
    syncing = false,
    destroyed = false;
  let revision = 0;
  let byId = new Map<string, Entry<T>>(),
    byNative = new Map<string, Entry<T>>();
  let sourceLeaves: Ag31RowNode<T>[] = [];
  const entries = new Map<Ag31RowNode<T>, Entry<T>>();
  let pendingAssignments: Map<Entry<T>, Partial<Entry<T>>> | undefined;
  let pendingById: Map<string, Entry<T>> | undefined;
  let pendingLeaves: Ag31RowNode<T>[] | undefined;
  let pendingByNative: Map<string, Entry<T>> | undefined;
  let pendingRoot: Partial<Entry<T>> | undefined;
  const current = (entry: Entry<T>): Entry<T> => {
    const assignment =
      entry === root ? pendingRoot : pendingAssignments?.get(entry);
    return assignment ? { ...entry, ...assignment } : entry;
  };

  function flatten(
    start: Ag31RowNode<T>[],
    children: "grouped" | "filtered" | "sorted",
    postorder = false,
  ) {
    const result: Ag31RowNode<T>[] = [];
    const visit = (nodes: Ag31RowNode<T>[]) => {
      for (const node of nodes) {
        if (!postorder) result.push(node);
        visit(current(entries.get(node)!)[children] ?? []);
        if (postorder) result.push(node);
      }
    };
    visit(start);
    return result;
  }
  function leafIds(entry: Entry<T>): string[] {
    entry = current(entry);
    return entry.group
      ? (entry.leaves ?? []).map((node) => node.id)
      : [entry.node.id];
  }
  function selected(entry: Entry<T>): boolean | undefined {
    sync();
    if (destroyed || !current(entry).live || entry === root) return false;
    const ids = leafIds(entry),
      selected = new Set(model.getState().selected);
    const count = ids.filter((id) => selected.has(id)).length;
    return count === 0 ? false : count === ids.length ? true : undefined;
  }
  function create(id: string, nativeId: string): Entry<T> {
    let entry: Entry<T>;
    const read = () => {
      sync();
      return current(entry);
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
      get groupData() {
        return read().groupData;
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
      get rowHeight() {
        return read().rowHeight;
      },
      get allChildrenCount() {
        return read().allChildrenCount;
      },
      get firstChild() {
        return read().firstChild;
      },
      get lastChild() {
        return read().lastChild;
      },
      get childIndex() {
        return read().childIndex;
      },
      get selected() {
        return selected(entry);
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
        if (destroyed || !entry.live || syncing) return;
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
          syncing ||
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
        if (destroyed || !entry.live || syncing || model.isReadOnly())
          return false;
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
      addEventListener(type, listener) {
        if (typeof type !== "string" || !type || typeof listener !== "function")
          throw new TypeError("A row-event type and listener are required");
        sync();
        if (destroyed || !entry.live) return;
        let listeners = entry.listeners.get(type);
        if (!listeners) entry.listeners.set(type, (listeners = new Set()));
        listeners.add(listener);
      },
      removeEventListener(type, listener) {
        const listeners = entry.listeners.get(type);
        listeners?.delete(listener);
        if (!listeners?.size) entry.listeners.delete(type);
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
      selectionValue: false,
      listeners: new Map(),
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
    const events: { entry: Entry<T>; type: string }[] = [];
    const expectedRevision = revision;
    try {
      const assignments = new Map<Entry<T>, Partial<Entry<T>>>();
      pendingAssignments = assignments;
      pendingById = new Map();
      pendingLeaves = [];
      pendingRoot = { leaves: pendingLeaves };
      const state = model.getState();
      const sourceRows = model.getRows();
      if (
        sourceRows.length > HIERARCHY_SELECTION_LIMITS.maxRows ||
        state.groupBy.length > HIERARCHY_SELECTION_LIMITS.maxDepth
      )
        throw new HierarchySelectionError(
          "LIMIT",
          "hierarchy",
          "Compatibility hierarchy source/depth budget exceeded",
        );
      // Getters can inspect their own row node during the very first projection.
      // Stage original references before asking the model to evaluate any values.
      for (const row of sourceRows) {
        const id = options.getRowId(row);
        if (
          typeof id !== "string" ||
          !id ||
          id === root.node.id ||
          pendingById.has(id)
        )
          throw new TypeError("Duplicate/reserved source row identity");
        const old = byId.get(id);
        const entry = old && !old.group ? old : create(id, id);
        if (entry !== old) created.push(entry);
        pendingById.set(id, entry);
        pendingLeaves.push(entry.node);
        assignments.set(entry, {
          live: true,
          data: row,
          group: false,
          level: old?.level ?? state.groupBy.length,
          key: null,
          field: undefined,
          parent: old?.parent ?? root.node,
        });
      }
      const source = model.getRowHierarchy!("source");
      const nextById = new Map<string, Entry<T>>(),
        nextByNative = new Map<string, Entry<T>>();
      pendingByNative = nextByNative;
      const sourceByData = new Map<T, Entry<T>>();
      const expanded = new Set(model.getState().expanded);
      const selectedIds = new Set(model.getState().selected);
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
          const entry = !group
            ? pendingById!.get(identity.id)!
            : previous?.node.id === identity.id
              ? previous
              : create(identity.id, node.id);
          if (!entry)
            throw new TypeError(
              "Hierarchy identity differs from source identity",
            );
          if (group && entry !== previous) created.push(entry);
          nextById.set(identity.id, entry);
          nextByNative.set(node.id, entry);
          pendingById!.set(identity.id, entry);
          if (node.data !== undefined) sourceByData.set(node.data, entry);
          const assignment: Partial<Entry<T>> = {
            ...assignments.get(entry),
            live: true,
            data: node.data,
            group,
            level: node.depth,
            key: identity.key,
            groupData: group
              ? (entry.groupData ??
                Object.fromEntries(
                  Object.entries(
                    "groupData" in identity ? (identity.groupData ?? {}) : {},
                  ),
                ))
              : undefined,
            field: identity.field,
            parent: parent.node,
            filtered: group ? [] : undefined,
            sorted: group ? [] : undefined,
            expanded: group && expanded.has(node.id),
            rowIndex: null,
            rowTop: null,
            aggData: null,
          };
          assignments.set(entry, assignment);
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
          Object.assign(assignment, { grouped, leaves });
          return entry.node;
        });
      }
      const grouped = visit(source, root);
      pendingRoot.grouped = grouped;
      function project(
        nodes: readonly GridHierarchyNode<T>[],
        key: "filtered" | "sorted",
      ): Ag31RowNode<T>[] {
        return nodes.map((node, index) => {
          const entry = nextByNative.get(node.id);
          if (!entry)
            throw new TypeError("Projected hierarchy has no source node");
          const assignment = assignments.get(entry)!;
          assignment[key] = node.children
            ? project(node.children, key)
            : undefined;
          if (key === "sorted") assignment.aggData = node.aggregates ?? null;
          if (key === "sorted")
            Object.assign(assignment, {
              childIndex: index,
              firstChild: index === 0,
              lastChild: index === nodes.length - 1,
            });
          return entry.node;
        });
      }
      const afterFilter = project(
        model.getRowHierarchy!("filtered"),
        "filtered",
      );
      pendingRoot.filtered = afterFilter;
      const counts = new Map<Ag31RowNode<T>, number>();
      function countFiltered(node: Ag31RowNode<T>): number {
        if (counts.has(node)) return counts.get(node)!;
        const assignment = assignments.get(entries.get(node)!)!;
        const value = assignment.group
          ? (assignment.filtered ?? []).reduce(
              (sum, child) => sum + countFiltered(child),
              0,
            )
          : 1;
        counts.set(node, value);
        return value;
      }
      for (const [entry, assignment] of assignments) {
        assignment.allChildrenCount = assignment.group
          ? countFiltered(entry.node)
          : undefined;
        const ids = assignment.group
          ? (assignment.leaves ?? []).map((node) => node.id)
          : [entry.node.id];
        const count = ids.filter((id) => selectedIds.has(id)).length;
        assignment.selectionValue =
          count === 0 ? false : count === ids.length ? true : undefined;
        if (assignment.group)
          assignment.sorted = [...(assignment.filtered ?? [])];
      }
      pendingRoot.allChildrenCount = afterFilter.reduce(
        (sum, node) => sum + countFiltered(node),
        0,
      );
      pendingRoot.sorted = [...afterFilter];
      const afterSort = project(model.getRowHierarchy!("sorted"), "sorted");
      pendingRoot.sorted = afterSort;
      let top = 0;
      model.getRowModel().forEach((node, index) => {
        const entry = nextByNative.get(node.id);
        if (entry)
          Object.assign(assignments.get(entry)!, {
            rowIndex: index,
            rowTop: top,
            rowHeight: options.rowHeight,
          });
        top += options.rowHeight;
      });
      const nextLeaves = model.getRows().map((row) => {
        const entry = sourceByData.get(row);
        if (!entry) throw new TypeError("Source row has no hierarchy node");
        return entry.node;
      });
      if (revision !== expectedRevision)
        throw new Error("Grid changed during row-node projection");
      for (const entry of byId.values())
        if (nextById.get(entry.node.id) !== entry) {
          entry.live = false;
          entry.rowIndex = entry.rowTop = null;
          if (entry.group)
            entry.grouped = entry.filtered = entry.sorted = entry.leaves = [];
          entries.delete(entry.node);
          entry.listeners.clear();
        }
      for (const [entry, assignment] of assignments) {
        if (entry.live && entry.expanded !== assignment.expanded)
          events.push({ entry, type: "expandedChanged" });
        if (entry.live && entry.selectionValue !== assignment.selectionValue)
          events.push({ entry, type: "rowSelected" });
        Object.assign(entry, assignment);
      }
      root.grouped = grouped;
      root.filtered = afterFilter;
      root.sorted = afterSort;
      root.leaves = nextLeaves;
      root.allChildrenCount = afterFilter.reduce(
        (sum, child) => sum + countFiltered(child),
        0,
      );
      byId = nextById;
      byNative = nextByNative;
      sourceLeaves = nextLeaves;
      dirty = false;
    } catch (error) {
      for (const entry of created) entries.delete(entry.node);
      throw error;
    } finally {
      pendingAssignments = undefined;
      pendingById = undefined;
      pendingLeaves = undefined;
      pendingByNative = undefined;
      pendingRoot = undefined;
      syncing = false;
    }
    for (const { entry, type } of events) {
      if (destroyed || !entry.live) continue;
      const event = { type, node: entry.node };
      for (const listener of [...(entry.listeners.get(type) ?? [])])
        listener(event);
    }
  }
  const unsubscribe = model.subscribe(() => {
    revision++;
    dirty = true;
    sync();
  });
  function forEach(
    children: "grouped" | "filtered" | "sorted",
    callback: (node: Ag31RowNode<T>, index: number) => void,
  ) {
    sync();
    if (destroyed) return;
    flatten(current(root)[children] ?? [], children).forEach(callback);
  }
  return Object.freeze({
    getRowNode(id: string) {
      sync();
      if (destroyed) return undefined;
      if (pendingById)
        return (
          pendingById.get(id)?.node ??
          (byId.get(id)?.group ? byId.get(id)?.node : undefined)
        );
      return byId.get(id)?.node;
    },
    /** Internal bridge lookup; the public AG API uses compatibility IDs. */
    getRowNodeByNativeId(id: string) {
      sync();
      if (destroyed) return undefined;
      return (
        pendingByNative?.get(id)?.node ??
        (pendingById?.get(id)?.group === false
          ? pendingById.get(id)?.node
          : undefined) ??
        byNative.get(id)?.node
      );
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
      if (!destroyed) [...(pendingLeaves ?? sourceLeaves)].forEach(callback);
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
        entry.listeners.clear();
      }
      root.grouped = root.filtered = root.sorted = root.leaves = [];
      entries.clear();
      byId.clear();
      byNative.clear();
      sourceLeaves = [];
    },
    isDestroyed: () => destroyed,
  });
}
