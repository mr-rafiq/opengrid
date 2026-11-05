import { expect, it, vi } from "vitest";
import { createGrid } from "./index.js";
class Entry {
  constructor(
    public id: string,
    public amount: number,
    public phase: string,
  ) {}
}
function setup(grouped = false) {
  const rows = [
      new Entry("a", 1, "First"),
      new Entry("b", 2, "First"),
      new Entry("c", 3, "Second"),
    ],
    read = vi.fn((r: Entry) => r.amount);
  const model = createGrid({
    rows,
    getRowId: (r) => r.id,
    columns: [
      { id: "amount", type: "number", valueGetter: read, aggregate: "sum" },
      { id: "phase", field: "phase" },
    ],
    initialState: {
      sorting: [{ columnId: "amount", direction: "asc" }],
      ...(grouped
        ? { groupBy: ["phase"], grandTotalRow: "bottom" as const }
        : {}),
    },
  });
  model.getRowModel();
  model.getRowHierarchy!("source");
  model.getRowHierarchy!("filtered");
  model.getRowHierarchy!("sorted");
  return { model, rows, read };
}
it.each(["resize", "pin", "hide", "move", "page", "pageSize"] as const)(
  "%s does not rerun an existing source query",
  (action) => {
    const { model, rows, read } = setup();
    rows[0].amount = 99;
    read.mockClear();
    if (action === "resize") model.resizeColumn("amount", 180);
    else if (action === "pin") model.pinColumn("phase", "left");
    else if (action === "hide") model.hideColumn("phase", true);
    else if (action === "move") model.moveColumn("phase", 0);
    else if (action === "page") model.setState({ page: 1, pageSize: 1 });
    else model.setState({ pageSize: 2 });
    expect(model.getFilteredRows().map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(model.getRowModel().map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(read).not.toHaveBeenCalled();
    model.expireValueCache();
    expect(model.getFilteredRows().map((r) => r.id)).toEqual(["b", "c", "a"]);
  },
);
it("group expansion reuses membership, child order and aggregate snapshots", () => {
  const { model, rows, read } = setup(true);
  const first = model.getRowModel()[0],
    grand = model.getRowModel().at(-1)!;
  expect(first.aggregates!.amount).toBe(3);
  expect(grand.aggregates!.amount).toBe(6);
  rows[0].amount = 99;
  rows[0].phase = "Changed";
  read.mockClear();
  model.toggleExpanded(first.id);
  expect(model.getRowModel().map((n) => n.id)).toEqual([
    first.id,
    "a",
    "b",
    expect.any(String),
    grand.id,
  ]);
  expect(model.getRowModel()[0].aggregates!.amount).toBe(3);
  expect(model.getRowModel().at(-1)!.aggregates!.amount).toBe(6);
  expect(read).not.toHaveBeenCalled();
  model.expireValueCache();
  expect(model.getRowModel().at(-1)!.aggregates!.amount).toBe(104);
});
