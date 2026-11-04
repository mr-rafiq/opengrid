import { describe, expect, it, vi } from "vitest";
import { createGrid } from "@opengrid/core";
import { createAg31RowNodes, type Ag31RowNode } from "./ag31-row-nodes";

class Row {
  #caption: string;
  constructor(
    public id: string,
    public team: string,
    public amount: number,
  ) {
    this.#caption = id;
  }
  caption() {
    return this.#caption;
  }
}
const setup = () => {
  const rows = [
    new Row("one", "East", 3),
    new Row("two", "West", 9),
    new Row("three", "East", 6),
  ];
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      { id: "team", field: "team" },
      { id: "amount", field: "amount", type: "number" },
    ],
    initialState: { groupBy: ["team"], pageSize: 100 },
  });
  const write = vi.fn(() => true),
    selection = vi.fn();
  const nodes = createAg31RowNodes({
    model,
    getRowId: (row) => row.id,
    rowHeight: 40,
    writeCell: write,
    selectionChanged: selection,
    groupIdentity(node, parent) {
      const key = String(node.groupValue ?? ""),
        field = node.groupColumnId;
      return {
        id: `${parent.id === "ROOT_NODE_ID" ? "row-group" : parent.id}-${field}-${key}`,
        key,
        field,
      };
    },
  });
  return { model, nodes, rows, write, selection };
};

it("exposes only the consumed context read path, tracks host context replacement and releases it on destroy", () => {
  const model = createGrid({
    rows: [{ id: "a" }],
    getRowId: (row) => row.id,
    columns: [{ id: "id", field: "id" }],
  });
  let context: unknown = { phases: [{ ID: 1 }] };
  const nodes = createAg31RowNodes({
    model,
    getRowId: (row) => row.id,
    rowHeight: 32,
    context: () => context,
    groupIdentity: (node) => ({ id: node.id, key: String(node.groupValue) }),
    writeCell: () => false,
  });
  const node = nodes.getRowNode("a")!,
    beans = node.beans;
  expect(beans.gos.context).toBe(context);
  context = { phases: [{ ID: 2 }] };
  expect(node.beans).toBe(beans);
  expect(beans.gos.context).toBe(context);
  expect(Object.keys(beans)).toEqual(["gos"]);
  expect(Object.keys(beans.gos)).toEqual(["context"]);
  nodes.destroy();
  expect(beans.gos.context).toBeUndefined();
});
type Store = ReturnType<typeof setup>["nodes"];
function collect(
  nodes: Store,
  method:
    | "forEachNode"
    | "forEachLeafNode"
    | "forEachNodeAfterFilter"
    | "forEachNodeAfterFilterAndSort",
) {
  const result: { id: string; index: number }[] = [];
  nodes[method]((node, index) => result.push({ id: node.id, index }));
  return result;
}
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("resident AG31 row-node boundary", () => {
  it("retains the original group display object and host entries for same-key authoritative updates", () => {
    class Category {
      constructor(
        public key: string,
        public label: string,
      ) {}
      toString(): string {
        throw new Error("Unexpected display coercion");
      }
    }
    const first = new Category("X", "First"),
      second = new Category("X", "Second");
    const rows = [
      { id: "a", category: first },
      { id: "b", category: second },
    ];
    const model = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        {
          id: "category",
          field: "category",
          groupKeyGetter: (value) => (value as Category).key,
          valueFormatter: (value) => (value as Category).label,
        },
      ],
      initialState: { groupBy: ["category"] },
    });
    const nodes = createAg31RowNodes({
      model,
      getRowId: (row) => row.id,
      rowHeight: 40,
      writeCell: () => false,
      groupIdentity: (node) => ({
        id: `row-group-category-${node.groupKey}`,
        key: String(node.groupKey),
        field: "category",
        groupData: { tree: node.groupValue },
      }),
    });
    const parent = nodes.getRowNode("a")!.parent!;
    expect(parent.id).toBe("row-group-category-X");
    expect(parent.allLeafChildren).toHaveLength(2);
    expect(parent.groupData!.tree).toBe(first);
    expect(Object.keys(parent.groupData!)).toEqual(["tree"]);
    expect(parent.groupData!["ag-Grid-AutoColumn-category"]).toBeUndefined();
    parent.groupData!.custom = "host-owned";
    const updated = { id: "a", category: new Category("X", "Updated") };
    model.applyTransaction({ update: [updated] });
    expect(nodes.getRowNode("a")!.data).toBe(updated);
    expect(nodes.getRowNode("a")!.parent).toBe(parent);
    expect(parent.groupData!.tree).toBe(first);
    expect(parent.groupData!.custom).toBe("host-owned");
    expect(model.getRowHierarchy!("source")[0].groupValue).toBe(
      updated.category,
    );
  });

  it("owns display dictionaries while borrowing their values and leaves non-group data absent", () => {
    const { model } = setup(),
      value = { label: "Borrowed" },
      supplied = { tree: value };
    const nodes = createAg31RowNodes({
      model,
      getRowId: (row) => row.id,
      rowHeight: 40,
      writeCell: () => false,
      groupIdentity: (node) => ({
        id: node.id,
        key: String(node.groupValue),
        groupData: supplied,
      }),
    });
    const leaf = nodes.getRowNode("one")!,
      parent = leaf.parent!;
    expect(leaf.groupData).toBeUndefined();
    expect(nodes.getRootNode().groupData).toBeUndefined();
    expect(parent.groupData).not.toBe(supplied);
    expect(parent.groupData!.tree).toBe(value);
    parent.groupData!.extra = true;
    expect(Object.hasOwn(supplied, "extra")).toBe(false);
    expect(setup().nodes.getRowNode("one")!.parent!.groupData).toEqual({});
  });
  it("stages the complete source graph before custom group comparators and filtered traversal", () => {
    let nodes: ReturnType<typeof createAg31RowNodes<Row>>;
    const rows = [
      new Row("one", "West", 3),
      new Row("two", "East", 9),
      new Row("three", "West", 6),
    ];
    const groups: string[] = [];
    const model = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        {
          id: "team",
          field: "team",
          compare(a, b, context) {
            const left = context.nodeA
              ? nodes.getRowNodeByNativeId(context.nodeA.id)!
              : nodes.getRowNode(context.rowA!.id)!;
            expect(left).toBeDefined();
            if (context.nodeA) {
              expect(left.group).toBe(true);
              expect(left.field).toBe("team");
              expect(left.key).toBe(a);
              expect(left.childrenAfterFilter!.length).toBeGreaterThan(0);
              groups.push(left.id);
              const all: string[] = [];
              nodes.forEachNode((node) => all.push(node.id));
              expect(all).toEqual([
                "group-West",
                "one",
                "three",
                "group-East",
                "two",
              ]);
            } else expect(left.data).toBe(context.rowA);
            expect(
              nodes.getRootNode().allLeafChildren!.map((node) => node.id),
            ).toEqual(["one", "two", "three"]);
            return String(a).localeCompare(String(b));
          },
        },
        { id: "amount", field: "amount", type: "number" },
      ],
      initialState: {
        groupBy: ["team"],
        sorting: [{ columnId: "team", direction: "asc" }],
      },
    });
    nodes = createAg31RowNodes({
      model,
      getRowId: (row) => row.id,
      rowHeight: 40,
      writeCell: () => false,
      groupIdentity: (node) => ({
        id: `group-${node.groupValue}`,
        key: String(node.groupValue),
        field: node.groupColumnId,
      }),
    });
    expect(nodes.getRowNode("one")!.data).toBe(rows[0]);
    expect(groups.length).toBeGreaterThan(0);
    expect(ids(collect(nodes, "forEachNodeAfterFilterAndSort"))).toEqual([
      "group-East",
      "two",
      "group-West",
      "one",
      "three",
    ]);
  });

  it("enforces source size before allocating identities or evaluating the hierarchy", () => {
    const { model, rows } = setup();
    const hierarchy = vi.fn(model.getRowHierarchy!),
      identity = vi.fn((row: Row) => row.id);
    const oversized = {
      ...model,
      getRows: () => Array<Row>(100_001).fill(rows[0]),
      getRowHierarchy: hierarchy,
    };
    const nodes = createAg31RowNodes({
      model: oversized,
      getRowId: identity,
      rowHeight: 40,
      writeCell: () => false,
      groupIdentity: (node) => ({ id: node.id, key: String(node.groupValue) }),
    });
    expect(() => nodes.getRowNode("one")).toThrow(
      "source/depth budget exceeded",
    );
    expect(identity).not.toHaveBeenCalled();
    expect(hierarchy).not.toHaveBeenCalled();
  });
  it("bootstraps real row wrappers before value getters and stages authoritative class updates", () => {
    let nodes: ReturnType<typeof createAg31RowNodes<Row>>;
    const row = new Row("one", "East", 3),
      reads: number[] = [];
    const model = createGrid({
      rows: [row],
      getRowId: (row) => row.id,
      columns: [
        { id: "team", field: "team" },
        {
          id: "amount",
          type: "number",
          aggregate: "sum",
          valueGetter: (row) => {
            const node = nodes.getRowNode(row.id)!;
            expect(node.group).toBe(false);
            expect(node.data).toBe(row);
            expect(node.data!.caption()).toBe("one");
            expect(node.selected).toBe(true);
            const projected: Row[] = [];
            nodes.forEachLeafNode((node) => projected.push(node.data!));
            expect(projected).toEqual([row]);
            expect(projected[0]).toBe(row);
            reads.push(node.data!.amount);
            return node.data!.amount;
          },
        },
      ],
      initialState: { groupBy: ["team"], selected: ["one"] },
    });
    nodes = createAg31RowNodes({
      model,
      getRowId: (row) => row.id,
      rowHeight: 40,
      groupIdentity: (node) => ({
        id: `group-${node.groupValue}`,
        key: String(node.groupValue),
      }),
      writeCell: () => false,
    });
    const one = nodes.getRowNode("one")!;
    expect(one.data).toBe(row);
    expect(reads).toContain(3);
    reads.length = 0;
    const updated = new Row("one", "East", 20);
    model.applyTransaction({ update: [updated] });
    expect(one.data).toBe(updated);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((value) => value === 20)).toBe(true);
  });

  it("exposes staged parent keys and levels while allocating nested group identities", () => {
    const model = createGrid({
      rows: [{ id: "a", team: "East", area: "North" }],
      getRowId: (row) => row.id,
      columns: [
        { id: "team", field: "team" },
        { id: "area", field: "area" },
      ],
      initialState: { groupBy: ["team", "area"] },
    });
    const observed: unknown[] = [];
    const nodes = createAg31RowNodes({
      model,
      getRowId: (row) => row.id,
      rowHeight: 40,
      writeCell: () => false,
      groupIdentity(node, parent) {
        observed.push({
          depth: node.depth,
          key: parent.key,
          level: parent.level,
        });
        return {
          id: `${parent.id}-${node.groupValue}`,
          key: String(node.groupValue),
          field: node.groupColumnId,
        };
      },
    });
    expect(nodes.getRowNode("a")!.parent!.parent!.key).toBe("East");
    expect(observed).toEqual([
      { depth: 0, key: null, level: -1 },
      { depth: 1, key: "East", level: 0 },
    ]);
  });

  it("rejects inconsistent source IDs without publishing provisional wrappers and recovers on a valid projection", () => {
    const { model } = setup();
    let invalid = true;
    const nodes = createAg31RowNodes({
      model,
      getRowId: (row) => (invalid ? `wrong-${row.id}` : row.id),
      rowHeight: 40,
      groupIdentity: (node) => ({
        id: `group-${node.groupValue}`,
        key: String(node.groupValue),
      }),
      writeCell: () => false,
    });
    expect(() => nodes.getRowNode("one")).toThrow("Hierarchy identity differs");
    invalid = false;
    expect(nodes.getRowNode("one")!.data).toBe(model.getRow("one"));
    expect(nodes.getRowNode("wrong-one")).toBeUndefined();
    expect(ids(collect(nodes, "forEachLeafNode"))).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("rejects a model change during projection before publishing the graph", () => {
    const { model } = setup();
    let change = true;
    const nodes = createAg31RowNodes({
      model,
      getRowId: (row) => row.id,
      rowHeight: 40,
      writeCell: () => false,
      groupIdentity(node) {
        if (change) {
          change = false;
          model.setQuickFilter("East");
        }
        return { id: `group-${node.groupValue}`, key: String(node.groupValue) };
      },
    });
    expect(() => nodes.getRowNode("one")).toThrow(
      "Grid changed during row-node projection",
    );
    expect(nodes.getRowNode("one")!.data).toBe(model.getRow("one"));
    expect(ids(collect(nodes, "forEachNodeAfterFilter"))).toEqual([
      "group-East",
      "one",
      "three",
    ]);
  });
  it("dispatches synchronous row-local expansion events without grid API injection", () => {
    const { nodes, model } = setup(),
      parent = nodes.getRowNode("one")!.parent!;
    const calls: unknown[] = [];
    const listener = (event: { type: string; node: Ag31RowNode<Row> }) =>
      calls.push({
        keys: Object.keys(event).sort(),
        sameNode: event.node === parent,
        expanded: event.node.expanded,
      });
    parent.addEventListener("expandedChanged", listener);
    parent.addEventListener("expandedChanged", listener);
    parent.setExpanded(true);
    expect(calls).toEqual([
      { keys: ["node", "type"], sameNode: true, expanded: true },
    ]);
    parent.setExpanded(true);
    expect(calls).toHaveLength(1);
    const native = model.getRowHierarchy!("source")[0];
    model.toggleExpanded(native.id);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      keys: ["node", "type"],
      sameNode: true,
      expanded: false,
    });
    parent.removeEventListener("expandedChanged", listener);
    model.toggleExpanded(native.id);
    expect(calls).toHaveLength(2);
  });

  it("keeps direct selected properties and synchronous rowSelected events consistent with mixed source descendants", () => {
    const { nodes, model } = setup(),
      one = nodes.getRowNode("one")!,
      parent = one.parent!;
    const values: unknown[] = [];
    parent.addEventListener("rowSelected", (event) =>
      values.push({
        selected: event.node.selected,
        keys: Object.keys(event).sort(),
        sameNode: event.node === parent,
      }),
    );
    one.setSelected(true);
    expect(one.selected).toBe(true);
    expect(parent.selected).toBeUndefined();
    parent.setSelected(true);
    expect(parent.selected).toBe(true);
    expect(values).toEqual([
      { selected: undefined, keys: ["node", "type"], sameNode: true },
      { selected: true, keys: ["node", "type"], sameNode: true },
    ]);
    model.setState({ selected: [] });
    expect(parent.selected).toBe(false);
    expect(values).toHaveLength(3);
    expect(nodes.getRootNode().selected).toBe(false);
  });

  it("matches filtered child counts, sorted sibling flags and retained measured row heights", () => {
    const { nodes, model } = setup(),
      one = nodes.getRowNode("one")!,
      parent = one.parent!,
      three = nodes.getRowNode("three")!;
    expect(parent.allChildrenCount).toBe(2);
    expect(nodes.getRootNode().allChildrenCount).toBe(3);
    expect(parent.rowHeight).toBe(40);
    expect(one.rowHeight).toBeUndefined();
    expect(one.firstChild).toBe(true);
    expect(one.lastChild).toBe(false);
    expect(one.childIndex).toBe(0);
    model.setSort("amount", "desc");
    expect(one.firstChild).toBe(false);
    expect(one.lastChild).toBe(true);
    expect(one.childIndex).toBe(1);
    parent.setExpanded(true);
    expect(one.rowHeight).toBe(40);
    model.setFilter("amount", { op: "gt", value: 3 });
    expect(parent.allChildrenCount).toBe(1);
    expect(nodes.getRootNode().allChildrenCount).toBe(2);
    expect(one.rowIndex).toBeNull();
    expect(one.rowHeight).toBe(40);
    expect(one.childIndex).toBe(1);
    expect(one.lastChild).toBe(true);
    expect(three.childIndex).toBe(0);
    expect(three.firstChild).toBe(true);
    expect(three.lastChild).toBe(true);
  });

  it("clears row listeners and root graph references when the registry is destroyed", () => {
    const { nodes, model } = setup(),
      parent = nodes.getRowNode("one")!.parent!,
      root = nodes.getRootNode(),
      listener = vi.fn();
    parent.addEventListener("expandedChanged", listener);
    nodes.destroy();
    model.setState({ expanded: [] });
    parent.setExpanded(true);
    expect(listener).not.toHaveBeenCalled();
    expect(root.childrenAfterGroup).toEqual([]);
    expect(root.allLeafChildren).toEqual([]);
  });
  it("matches source leaf order and group preorder with global callback indices, ignoring collapsed rows", () => {
    const { nodes } = setup();
    expect(ids(collect(nodes, "forEachLeafNode"))).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(collect(nodes, "forEachNode")).toEqual([
      { id: "row-group-team-East", index: 0 },
      { id: "one", index: 1 },
      { id: "three", index: 2 },
      { id: "row-group-team-West", index: 3 },
      { id: "two", index: 4 },
    ]);
    const one = nodes.getRowNode("one")!;
    expect(one.rowIndex).toBeNull();
    expect(one.rowTop).toBeNull();
    expect(one.parent!.parent).toBe(nodes.getRootNode());
    expect(one.parent!.field).toBe("team");
    expect(one.parent!.key).toBe("East");
    expect(one.parent!.level).toBe(0);
    expect(one.level).toBe(1);
  });

  it("keeps independent source/filter/sort child lists and preserves filtered group order", () => {
    const { nodes, model } = setup(),
      parent = nodes.getRowNode("one")!.parent!;
    model.setFilter("amount", { op: "gt", value: 3 });
    expect(ids(parent.childrenAfterGroup!)).toEqual(["one", "three"]);
    expect(ids(parent.childrenAfterFilter!)).toEqual(["three"]);
    expect(ids(parent.allLeafChildren!)).toEqual(["one", "three"]);
    expect(ids(collect(nodes, "forEachNodeAfterFilter"))).toEqual([
      "row-group-team-East",
      "three",
      "row-group-team-West",
      "two",
    ]);
    model.setFilter("amount");
    model.setSort("amount", "desc");
    expect(ids(parent.childrenAfterSort!)).toEqual(["three", "one"]);
    expect(ids(collect(nodes, "forEachLeafNode"))).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(ids(collect(nodes, "forEachNodeAfterFilterAndSort"))).toEqual([
      "row-group-team-East",
      "three",
      "one",
      "row-group-team-West",
      "two",
    ]);
  });

  it("uses postorder depthFirstSearch including the starting node and ignores callback false", () => {
    const { nodes } = setup(),
      parent = nodes.getRowNode("one")!.parent!,
      visited: string[] = [];
    expect(
      parent.depthFirstSearch((node) => {
        visited.push(node.id);
        return false;
      }),
    ).toBeUndefined();
    expect(visited).toEqual(["one", "three", "row-group-team-East"]);
    const all: string[] = [];
    nodes.getRootNode().depthFirstSearch((node) => all.push(node.id));
    expect(all).toEqual([
      "one",
      "three",
      "row-group-team-East",
      "two",
      "row-group-team-West",
      "ROOT_NODE_ID",
    ]);
  });

  it("preserves wrappers and original private-field class data through authoritative updates and regrouping", () => {
    const { nodes, model, rows } = setup(),
      one = nodes.getRowNode("one")!,
      oldGroup = one.parent!;
    expect(one.data).toBe(rows[0]);
    expect(one.data!.caption()).toBe("one");
    const next = new Row("one", "West", 20);
    model.applyTransaction({ update: [next] });
    expect(nodes.getRowNode("one")).toBe(one);
    expect(one.data).toBe(next);
    expect(one.data!.caption()).toBe("one");
    expect(one.parent!.key).toBe("West");
    expect(ids(oldGroup.childrenAfterGroup!)).toEqual(["three"]);
    model.applyTransaction({ remove: ["three"] });
    expect(oldGroup.childrenAfterGroup).toEqual([]);
    expect(nodes.getRowNode(oldGroup.id)).toBeUndefined();
  });

  it("selects every source descendant through programmatic group selection even with active filters", () => {
    const { nodes, model, selection } = setup(),
      one = nodes.getRowNode("one")!,
      parent = one.parent!;
    model.setFilter("amount", { op: "gt", value: 3 });
    one.setSelected(true);
    expect(parent.isSelected()).toBeUndefined();
    parent.setSelected(true, false, "contract");
    expect(model.getState().selected).toEqual(["one", "three"]);
    expect(parent.isSelected()).toBe(true);
    expect(selection).toHaveBeenLastCalledWith("contract");
    nodes.getRowNode("two")!.setSelected(true, true);
    expect(model.getState().selected).toEqual(["two"]);
    expect(parent.isSelected()).toBe(false);
    const calls = selection.mock.calls.length;
    nodes.getRowNode("two")!.setSelected(true);
    expect(selection).toHaveBeenCalledTimes(calls);
  });

  it("reveals live geometry on expansion without assigning positions to collapsed leaves", () => {
    const { nodes } = setup(),
      one = nodes.getRowNode("one")!,
      east = one.parent!;
    expect(east.rowIndex).toBe(0);
    expect(east.rowTop).toBe(0);
    expect(one.rowIndex).toBeNull();
    east.setExpanded(true);
    expect(east.expanded).toBe(true);
    expect(one.rowIndex).toBe(1);
    expect(one.rowTop).toBe(40);
    expect(nodes.getRowNode("two")!.parent!.rowIndex).toBe(3);
    east.setExpanded(false);
    expect(one.rowIndex).toBeNull();
    expect(one.rowTop).toBeNull();
  });

  it("delegates actual write contracts once and blocks removed, read-only and destroyed nodes", () => {
    const { nodes, model, rows, write } = setup(),
      one = nodes.getRowNode("one")!,
      object = { value: 7 };
    expect(one.setDataValue("amount", object, "paste")).toBe(true);
    expect(write).toHaveBeenCalledExactlyOnceWith(
      one,
      "amount",
      object,
      "paste",
    );
    model.setReadOnly(true);
    expect(one.setDataValue("amount", 5)).toBe(false);
    one.setSelected(true);
    expect(model.getState().selected).toContain("one");
    model.setReadOnly(false);
    model.applyTransaction({ remove: ["one"] });
    expect(nodes.getRowNode("one")).toBeUndefined();
    expect(one.data).toBe(rows[0]);
    expect(one.setDataValue("amount", 8)).toBe(false);
    one.setSelected(true);
    expect(model.getState().selected).not.toContain("one");
    const two = nodes.getRowNode("two")!;
    nodes.destroy();
    expect(two.setDataValue("amount", 9)).toBe(false);
    expect(nodes.isDestroyed()).toBe(true);
    expect(nodes.getRowNode("two")).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("gives re-added source IDs new wrappers and keeps old handles inert", () => {
    const { nodes, model } = setup(),
      old = nodes.getRowNode("one")!;
    model.applyTransaction({ remove: ["one"] });
    expect(nodes.getRowNode("one")).toBeUndefined();
    const fresh = new Row("one", "East", 15);
    model.applyTransaction({ add: [fresh] });
    const next = nodes.getRowNode("one")!;
    expect(next).not.toBe(old);
    expect(next.data).toBe(fresh);
    old.setSelected(true);
    expect(next.isSelected()).toBe(false);
  });

  it("ends subscriptions and all traversal after destroy", () => {
    const { nodes, model } = setup(),
      root = nodes.getRootNode(),
      callback = vi.fn();
    nodes.destroy();
    nodes.destroy();
    model.setQuickFilter("East");
    nodes.forEachNode(callback);
    nodes.forEachLeafNode(callback);
    root.depthFirstSearch(callback);
    expect(callback).not.toHaveBeenCalled();
  });
});

it("keeps allLeafChildren in original source order across nested interleaved groups, filtering and sorting", () => {
  const model = createGrid({
    rows: [
      { id: "a", outer: "X", inner: "" },
      { id: "b", outer: "X", inner: "N" },
      { id: "c", outer: "Y", inner: "N" },
      { id: "d", outer: "X", inner: "M" },
      { id: "e", outer: "X", inner: "N" },
    ],
    getRowId: (row) => row.id,
    columns: (["outer", "inner"] as const).map((id) => ({ id, field: id })),
    initialState: { groupBy: ["outer", "inner"] },
  });
  const nodes = createAg31RowNodes({
    model,
    getRowId: (row) => row.id,
    rowHeight: 32,
    writeCell: () => false,
    groupIdentity: (node) => ({
      id: node.id,
      key: String(node.groupValue),
      field: node.groupColumnId,
    }),
  });
  const outer = nodes.getRowNode("a")!.parent!.parent!;
  const check = () => {
    expect(outer.allLeafChildren!.map((n) => n.id)).toEqual([
      "a",
      "b",
      "d",
      "e",
    ]);
    expect(nodes.getRootNode().allLeafChildren!.map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  };
  check();
  model.setSort("inner", "desc");
  check();
  model.setFilter("inner", { op: "notEqual", value: "N" });
  check();
  expect(
    outer.childrenAfterFilter!.flatMap((n) =>
      n.allLeafChildren!.map((c) => c.id),
    ),
  ).toEqual(["a", "d"]);
});
