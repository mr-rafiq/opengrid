import { expect, it, vi } from "vitest";
import { createGrid } from "./index.js";
import type { GridModel } from "./types.js";

class Entry {
  constructor(
    public id: string,
    public position: string,
    public index: number,
    public amount: number,
  ) {}
  tag() {
    return "original";
  }
}

it("reaggregates retained filter/group membership and runs downstream sorting like the measured source stage", () => {
  const rows = Array.from(
    { length: 200 },
    (_, index) =>
      new Entry(
        String(index),
        `G${String(Math.floor(index / 10)).padStart(2, "0")}`,
        index,
        index * 10,
      ),
  );
  const filter = vi.fn((row: Entry) => row.index >= 100),
    key = vi.fn((value: unknown) => String(value));
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    valueCache: true,
    externalFilter: filter,
    columns: [
      { id: "position", field: "position", groupKeyGetter: key },
      { id: "index", type: "number", valueGetter: (row) => row.index },
      {
        id: "amount",
        type: "number",
        valueGetter: (row) => row.amount,
        aggregate: "sum",
      },
    ],
    initialState: {
      groupBy: ["position"],
      sorting: [{ columnId: "index", direction: "desc" }],
      grandTotalRow: "top",
      groupTotalRow: "bottom",
    },
  });
  model.getRowModel();
  for (const stage of ["source", "filtered", "sorted"] as const)
    model.getRowHierarchy!(stage);
  const group = model.getRowModel().find((node) => node.label === "G10")!;
  model.toggleExpanded(group.id);
  model.setState({ selected: ["100"] });
  filter.mockClear();
  key.mockClear();
  rows[109].index = -1;
  rows[109].position = "G99";
  rows[109].amount = 12999;
  model.refreshAggregates!();
  expect(filter).not.toHaveBeenCalled();
  expect(key).not.toHaveBeenCalled();
  const after = model.getRowModel().find((node) => node.id === group.id)!;
  expect(after.label).toBe("G10");
  expect(after.children!.map((node) => node.id)).toEqual([
    "108",
    "107",
    "106",
    "105",
    "104",
    "103",
    "102",
    "101",
    "100",
    "109",
  ]);
  expect(after.aggregates!.amount).toBe(22359);
  expect(
    model.getRowModel().find((node) => node.total === "grand")!.aggregates!
      .amount,
  ).toBe(161409);
  expect(
    model
      .getRowModel()
      .find((node) => node.total === "group" && node.parentId === group.id)!
      .aggregates!.amount,
  ).toBe(22359);
  expect(model.getFilteredRows()).toHaveLength(100);
  expect(model.getFilteredRows().at(-1)).toBe(rows[109]);
  expect(model.getState().selected).toEqual(["100"]);
  expect(model.getState().expanded).toContain(group.id);
  expect(
    model.getRowHierarchy!("source")
      .find((node) => node.id === group.id)!
      .children!.map((node) => node.id),
  ).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 100)));
  expect(
    model.getRowHierarchy!("sorted")
      .find((node) => node.id === group.id)!
      .children!.at(-1)!.data,
  ).toBe(rows[109]);
  expect(rows[109].tag()).toBe("original");
});

it("uses original structural order when changed aggregates become equal", () => {
  const rows = [new Entry("a", "A", 0, 10), new Entry("b", "B", 1, 20)];
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      { id: "position", field: "position" },
      { id: "amount", field: "amount", type: "number", aggregate: "sum" },
    ],
    initialState: {
      groupBy: ["position"],
      sorting: [{ columnId: "amount", direction: "desc" }],
    },
  });
  expect(model.getRowModel().map((node) => node.label)).toEqual(["B", "A"]);
  model.getRowHierarchy!("sorted");
  rows[0].amount = 20;
  model.refreshAggregates!();
  expect(model.getRowModel().map((node) => node.label)).toEqual(["A", "B"]);
  expect(model.getRowHierarchy!("sorted").map((node) => node.label)).toEqual([
    "A",
    "B",
  ]);
  rows[1].amount = 30;
  model.refreshAggregates!();
  expect(model.getRowModel().map((node) => node.label)).toEqual(["B", "A"]);
});

it("resorts a flat retained filtered projection without rerunning predicates", () => {
  const rows = [
      new Entry("a", "A", 1, 1),
      new Entry("b", "B", 2, 2),
      new Entry("c", "C", 3, 3),
    ],
    filter = vi.fn((row: Entry) => row.amount < 3);
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    externalFilter: filter,
    columns: [{ id: "amount", field: "amount", type: "number" }],
    initialState: { sorting: [{ columnId: "amount", direction: "asc" }] },
  });
  expect(model.getRowModel().map((node) => node.id)).toEqual(["a", "b"]);
  filter.mockClear();
  rows[0].amount = 99;
  model.refreshAggregates!();
  expect(model.getRowModel().map((node) => node.id)).toEqual(["b", "a"]);
  expect(filter).not.toHaveBeenCalled();
  model.expireValueCache();
  expect(model.getRowModel().map((node) => node.id)).toEqual(["b"]);
});

it.each(["asc", "desc"] as const)(
  "keeps native blanks last during %s downstream sorting",
  (direction) => {
    const rows = [
      { id: "blank", amount: null as number | null },
      { id: "small", amount: 1 },
      { id: "large", amount: 3 },
    ];
    const model = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [{ id: "amount", field: "amount", type: "number" }],
      initialState: { sorting: [{ columnId: "amount", direction }] },
    });
    model.getRowModel();
    rows[1].amount = 4;
    model.refreshAggregates!();
    expect(model.getRowModel().map((node) => node.id)).toEqual(
      direction === "asc"
        ? ["large", "small", "blank"]
        : ["small", "large", "blank"],
    );
  },
);

it("does not publish a partial aggregate result and restores the value cache after a callback throws", () => {
  let fail = false;
  const rows = [new Entry("a", "A", 0, 1), new Entry("b", "A", 1, 2)];
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    valueCache: true,
    columns: [
      { id: "position", field: "position" },
      {
        id: "amount",
        valueGetter: (row) => row.amount,
        aggregate: (values) => {
          if (fail) throw new Error("Aggregate failed");
          return (values as number[]).reduce((a, b) => a + b, 0);
        },
      },
    ],
    initialState: { groupBy: ["position"] },
  });
  const before = model.getRowModel()[0],
    state = model.getState(),
    changed = vi.fn();
  model.subscribe(changed);
  rows[0].amount = 100;
  fail = true;
  expect(() => model.refreshAggregates!()).toThrow("Aggregate failed");
  expect(model.getState()).toBe(state);
  expect(changed).not.toHaveBeenCalled();
  expect(model.getRowModel()[0]).toBe(before);
  expect(model.getValue(rows[0], "amount")).toBe(1);
  fail = false;
  model.refreshAggregates!();
  expect(model.getRowModel()[0].aggregates!.amount).toBe(102);
  expect(changed).toHaveBeenCalledTimes(1);
});

it("does not overwrite a reentrant legitimate state change with a prepared aggregate projection", () => {
  let armed = false;
  let model: GridModel<Entry>;
  const rows = [new Entry("a", "A", 0, 1), new Entry("b", "A", 1, 2)];
  model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      { id: "position", field: "position" },
      {
        id: "amount",
        field: "amount",
        aggregate: (values) => {
          if (armed) {
            armed = false;
            model.setState({ selected: ["a"] });
          }
          return (values as number[]).reduce((a, b) => a + b, 0);
        },
      },
    ],
    initialState: { groupBy: ["position"] },
  });
  const before = model.getRowModel()[0];
  rows[0].amount = 100;
  armed = true;
  expect(() => model.refreshAggregates!()).toThrow(
    "Grid changed while preparing aggregate refresh",
  );
  expect(model.getState().selected).toEqual(["a"]);
  expect(model.getRowModel()[0]).toBe(before);
  expect(before.aggregates!.amount).toBe(3);
});

it("rejects the separate tree-path stage without changing state", () => {
  const model = createGrid({
    rows: [{ id: "a", path: ["A"] }],
    getRowId: (row) => row.id,
    getTreePath: (row) => row.path,
    columns: [{ id: "id", field: "id" }],
  });
  const state = model.getState();
  expect(() => model.refreshAggregates!()).toThrow(
    "tree paths is not supported",
  );
  expect(model.getState()).toBe(state);
});

it("does not invoke presentation group getters while preparing structural or filtered forests", () => {
  const rows = [new Entry("a", "A", 0, 1), new Entry("b", "B", 1, 2)];
  const groupValue = vi.fn((node: { aggregates?: Record<string, unknown> }) => {
    if (!node.aggregates) throw new Error("Presentation getter before binding");
    return node.aggregates.amount;
  });
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      { id: "position", field: "position" },
      {
        id: "amount",
        field: "amount",
        type: "number",
        aggregate: "sum",
        groupValueGetter: groupValue,
      },
    ],
    initialState: {
      groupBy: ["position"],
      sorting: [{ columnId: "amount", direction: "desc" }],
    },
  });
  expect(model.getRowHierarchy!("source").map((node) => node.label)).toEqual([
    "A",
    "B",
  ]);
  expect(model.getRowHierarchy!("filtered").map((node) => node.label)).toEqual([
    "A",
    "B",
  ]);
  expect(groupValue).not.toHaveBeenCalled();
  expect(model.getRowHierarchy!("sorted").map((node) => node.label)).toEqual([
    "B",
    "A",
  ]);
  expect(groupValue).toHaveBeenCalled();
});
