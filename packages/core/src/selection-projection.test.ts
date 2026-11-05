import { expect, it, vi } from "vitest";
import { createGrid } from "./index.js";

class Entry {
  constructor(
    public id: string,
    public amount: number,
    public phase = "First",
  ) {}
}
function setup() {
  const rows = [
    new Entry("a", 1),
    new Entry("b", 2),
    new Entry("c", 3, "Second"),
  ];
  const read = vi.fn((row: Entry) => row.amount);
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      { id: "amount", valueGetter: read, type: "number", aggregate: "sum" },
      { id: "phase", field: "phase" },
    ],
  });
  return { rows, read, model };
}
it("selection retains a computed sort while direct value reads remain live", () => {
  const { rows, read, model } = setup();
  model.setSort("amount", "asc");
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["a", "b", "c"]);
  rows[0].amount = 99;
  read.mockClear();
  model.selectRows(["b"]);
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["a", "b", "c"]);
  expect(model.getRowModel().map((r) => r.id)).toEqual(["a", "b", "c"]);
  expect(read).not.toHaveBeenCalled();
  expect(model.getValue(rows[0], "amount")).toBe(99);
  model.setSort("amount", "asc");
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["b", "c", "a"]);
});
it("selection retains existing external-filter membership until explicit refresh", () => {
  const { rows, model } = setup();
  const predicate = vi.fn((row: Entry) => row.amount < 3);
  model.setExternalFilter(predicate);
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["a", "b"]);
  rows[0].amount = 99;
  predicate.mockClear();
  model.toggleSelection("b", true);
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["a", "b"]);
  expect(predicate).not.toHaveBeenCalled();
  model.setExternalFilter(predicate);
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["b"]);
});
it("selection preserves all computed hierarchy stages and aggregates", () => {
  const { rows, model } = setup();
  model.setState({
    groupBy: ["phase"],
    sorting: [{ columnId: "amount", direction: "asc" }],
  });
  const before = ["source", "filtered", "sorted"].map((stage) =>
    model.getRowHierarchy!(stage as "source" | "filtered" | "sorted"),
  );
  const displayed = model.getRowModel();
  rows[0].amount = 99;
  rows[0].phase = "Moved";
  model.setState({ selected: ["b"] });
  for (const [i, stage] of ["source", "filtered", "sorted"].entries())
    expect(
      model.getRowHierarchy!(stage as "source" | "filtered" | "sorted"),
    ).toEqual(before[i]);
  expect(model.getRowModel()).toEqual(displayed);
  expect(model.getState().selected).toEqual(["b"]);
  model.setRows(rows);
  expect(
    model.getRowHierarchy!("source").some((node) => node.label === "Moved"),
  ).toBe(true);
});
it("selection publishes frozen state and notifies reentrant listeners normally", () => {
  const { model } = setup();
  let calls = 0;
  model.subscribe(() => {
    calls++;
    if (calls === 1) model.selectRows(["c"]);
  });
  model.selectRows(["b"]);
  expect(model.getState().selected).toEqual(["c"]);
  expect(Object.isFrozen(model.getState())).toBe(true);
  expect(calls).toBe(2);
});

it("failed query preparation restores prior projections before subsequent selection", () => {
  const rows = [new Entry("a", 1), new Entry("b", 2)];
  let fail = false;
  const model = createGrid({
    rows,
    getRowId: (r) => r.id,
    columns: [
      {
        id: "amount",
        type: "number",
        valueGetter: (r) => {
          if (fail) throw Error("unavailable");
          return r.amount;
        },
      },
    ],
  });
  model.setSort("amount", "asc");
  const before = model.getRowHierarchy!("sorted");
  model.getRowModel();
  rows[0].amount = 99;
  fail = true;
  expect(() => model.setSort("amount", "desc")).toThrow("unavailable");
  fail = false;
  model.selectRows(["b"]);
  expect(model.getRowHierarchy!("sorted")).toEqual(before);
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["a", "b"]);
  expect(model.getState().sorting).toEqual([
    { columnId: "amount", direction: "asc" },
  ]);
});
