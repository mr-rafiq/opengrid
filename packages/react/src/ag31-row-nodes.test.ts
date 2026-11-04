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
