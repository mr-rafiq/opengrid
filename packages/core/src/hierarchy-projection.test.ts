import { describe, expect, it } from "vitest";
import { createGrid, type GridHierarchyNode } from "./index";

class RecordRow {
  #amount: number;
  constructor(
    public id: string,
    public team: string,
    amount: number,
  ) {
    this.#amount = amount;
  }
  amount() {
    return this.#amount;
  }
}
const make = () => {
  const rows = [
    new RecordRow("one", "Zulu", 3),
    new RecordRow("two", "Alpha", 9),
    new RecordRow("three", "Zulu", 6),
  ];
  return createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      { id: "team", field: "team" },
      {
        id: "amount",
        type: "number",
        valueGetter: (row) => row.amount(),
        aggregate: "sum",
      },
    ],
    initialState: {
      groupBy: ["team"],
      pageSize: 1,
      groupTotalRow: "bottom",
      grandTotalRow: "top",
    },
  });
};
const ids = <T>(nodes: readonly GridHierarchyNode<T>[]) =>
  nodes.map((node) => node.id);

describe("complete hierarchy projections", () => {
  it("retains source group order after filtering its first leaf and sorting a nonaggregate metric", () => {
    const grid = make();
    grid.setColumns([
      { id: "team", field: "team" },
      { id: "amount", type: "number", valueGetter: (row) => row.amount() },
    ]);
    grid.setFilter("amount", { op: "gt", value: 3 });
    grid.setSort("amount", "desc");
    expect(
      grid.getRowHierarchy!("sorted").map((node) => node.groupValue),
    ).toEqual(["Zulu", "Alpha"]);
    expect(
      grid
        .getRowModel()
        .filter((node) => node.kind === "group")
        .map((node) => node.groupValue),
    ).toEqual(["Zulu", "Alpha"]);
    expect(
      grid.getRowHierarchy!("filtered").map((node) => node.groupValue),
    ).toEqual(["Zulu", "Alpha"]);
  });
  it("distinguishes source, filtered source order and sorted descendants independently of collapse/page/totals", () => {
    const grid = make();
    grid.setSort("amount", "desc");
    grid.setFilter("amount", { op: "gt", value: 3 });
    const source = grid.getRowHierarchy!("source"),
      filtered = grid.getRowHierarchy!("filtered"),
      sorted = grid.getRowHierarchy!("sorted");
    expect(source.map((node) => node.label)).toEqual(["Zulu", "Alpha"]);
    expect(ids(source[0].children!)).toEqual(["one", "three"]);
    expect(ids(filtered[0].children!)).toEqual(["three"]);
    expect(sorted.map((node) => node.label)).toEqual(["Alpha", "Zulu"]);
    expect(source.every((node) => node.kind === "group")).toBe(true);
    expect(grid.getPageRows()).toHaveLength(1);
    expect(source[0].groupColumnId).toBe("team");
    expect(source[0].groupValue).toBe("Zulu");
    grid.setFilter("amount");
    expect(ids(grid.getRowHierarchy!("filtered")[0].children!)).toEqual([
      "one",
      "three",
    ]);
    expect(
      ids(
        grid.getRowHierarchy!("sorted").find(
          (node) => node.groupValue === "Zulu",
        )!.children!,
      ),
    ).toEqual(["three", "one"]);
  });

  it("freezes owned metadata and aggregates while preserving original class/data identity", () => {
    const grid = make(),
      row = grid.getRow("one")!;
    const forest = grid.getRowHierarchy!(),
      group = forest[0];
    expect(Object.isFrozen(forest)).toBe(true);
    expect(Object.isFrozen(group)).toBe(true);
    expect(Object.isFrozen(group.children)).toBe(true);
    expect(Object.isFrozen(group.aggregates)).toBe(true);
    expect(group.children![0].data).toBe(row);
    expect(group.children![0].data!.amount()).toBe(3);
    expect(Object.isFrozen(row)).toBe(false);
    expect(() => (group.children as unknown[]).push({})).toThrow();
    expect(() => {
      (group.aggregates as Record<string, unknown>).amount = 1;
    }).toThrow();
    expect(grid.getRowModel()[0].kind).toBe("total");
    expect(grid.getRowModel()[1].aggregates!.amount).toBe(9);
  });

  it("computes presentation aggregates only for the sorted projection", () => {
    const grid = make();
    grid.setFilter("amount", { op: "gt", value: 3 });
    expect(grid.getRowHierarchy!("source")[0].aggregates).toBeUndefined();
    expect(grid.getRowHierarchy!("filtered")[0].aggregates).toBeUndefined();
    expect(
      grid.getRowHierarchy!("sorted").find(
        (node) => node.groupValue === "Zulu",
      )!.aggregates!.amount,
    ).toBe(6);
  });

  it("retains nested source structure even when filtered-out top groups have no presentation node", () => {
    const grid = createGrid({
      rows: [
        { id: "a", team: "A", area: "West" },
        { id: "b", team: "A", area: "East" },
        { id: "c", team: "B", area: "East" },
      ],
      getRowId: (row) => row.id,
      columns: [
        { id: "team", field: "team" },
        { id: "area", field: "area" },
      ],
      initialState: { groupBy: ["team", "area"] },
    });
    grid.setFilter("team", { op: "equals", value: "B" });
    const source = grid.getRowHierarchy!("source"),
      filtered = grid.getRowHierarchy!("filtered");
    expect(source).toHaveLength(2);
    expect(source[0].children!.map((node) => node.groupColumnId)).toEqual([
      "area",
      "area",
    ]);
    expect(source[0].children![0].children![0].data?.id).toBe("a");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(source[1].id);
    expect(filtered[0].children![0].id).toBe(source[1].children![0].id);
  });

  it("keeps object group identity and values separate from string labels", () => {
    const a = { toString: () => "Same" },
      b = { toString: () => "Same" };
    const grid = createGrid({
      rows: [
        { id: "a", team: a },
        { id: "b", team: b },
      ],
      getRowId: (row) => row.id,
      columns: [{ id: "team", field: "team" }],
      initialState: { groupBy: ["team"] },
    });
    const forest = grid.getRowHierarchy!("source");
    expect(forest.map((node) => node.label)).toEqual(["Same", "Same"]);
    expect(forest[0].id).not.toBe(forest[1].id);
    expect(forest[0].groupValue).toBe(a);
    expect(forest[1].groupValue).toBe(b);
    expect(Object.isFrozen(a)).toBe(false);
  });

  it("retains old metadata snapshots across authoritative transactions and definition replacement", () => {
    const grid = make(),
      before = grid.getRowHierarchy!("source"),
      old = before[0].children![0].data;
    const next = new RecordRow("one", "Alpha", 20);
    grid.applyTransaction({ update: [next] });
    const after = grid.getRowHierarchy!("source");
    expect(before[0].children![0].data).toBe(old);
    expect(
      after.find((node) => node.groupValue === "Alpha")!.children![0].data,
    ).toBe(next);
    grid.setColumns([
      { id: "amount", type: "number", valueGetter: (row) => row.amount() },
    ]);
    expect(grid.getRowHierarchy!("source").map((node) => node.kind)).toEqual([
      "row",
      "row",
      "row",
    ]);
  });

  it("projects data-bearing tree parents without changing collapsed presentation or borrowed rows", () => {
    const rows = [
      { id: "parent", path: ["A"], value: 1 },
      { id: "child", path: ["A", "B"], value: 2 },
    ];
    const grid = createGrid({
      rows,
      getRowId: (row) => row.id,
      getTreePath: (row) => row.path,
      columns: [
        { id: "value", field: "value", type: "number", aggregate: "sum" },
      ],
    });
    const forest = grid.getRowHierarchy!();
    expect(forest[0].data).toBe(rows[0]);
    expect(forest[0].children![0].data).toBe(rows[1]);
    expect(forest[0].aggregates!.value).toBe(3);
    expect(grid.getRowModel()).toHaveLength(1);
    expect(grid.getHierarchySelectionPlan().getRowIds("parent")).toEqual([
      "parent",
      "child",
    ]);
  });

  it("rejects unknown stages explicitly without changing state", () => {
    const grid = make(),
      state = grid.getState();
    expect(() => grid.getRowHierarchy!("unknown" as never)).toThrow(
      "Unknown hierarchy",
    );
    expect(grid.getState()).toEqual(state);
  });
});
