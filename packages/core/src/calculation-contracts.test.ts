import { expect, it } from "vitest";
import { createGrid, createSetFilterIndex } from "./index.js";
it("filters and indexes a separate scalar without changing display, sorting or aggregate values", () => {
  const grid = createGrid({
    rows: [
      { id: "a", value: 20, tag: "approved" },
      { id: "b", value: 10, tag: "draft" },
    ],
    getRowId: (r) => r.id,
    columns: [
      {
        id: "amount",
        field: "value",
        filterValueGetter: (r) => r.tag,
        aggregate: "sum",
      },
    ],
  });
  expect(
    createSetFilterIndex(grid, "amount").entries.map((e) => e.value),
  ).toEqual(["approved", "draft"]);
  grid.setFilter("amount", { op: "equals", value: "approved" });
  expect(grid.getFilteredRows().map((r) => r.id)).toEqual(["a"]);
  expect(grid.getValue(grid.getRow("a")!, "amount")).toBe(20);
  grid.setFilter("amount");
  grid.setSort("amount", "asc");
  expect(grid.getRowModel().map((n) => n.id)).toEqual(["b", "a"]);
});
it("passes source rows or actual generated group nodes to custom comparators", () => {
  const grid = createGrid({
    rows: [
      { id: "a", group: "First", rank: 2 },
      { id: "b", group: "Second", rank: 1 },
    ],
    getRowId: (r) => r.id,
    columns: [
      {
        id: "group",
        field: "group",
        compare: (_a, _b, context) =>
          context.rowA && context.rowB
            ? context.rowA.rank - context.rowB.rank
            : (context.nodeB?.leafCount ?? 0) - (context.nodeA?.leafCount ?? 0),
      },
    ],
    initialState: { sorting: [{ columnId: "group", direction: "asc" }] },
  });
  expect(grid.getRowModel().map((n) => n.id)).toEqual(["b", "a"]);
  grid.setState({ groupBy: ["group"] });
  expect(grid.getRowModel().map((n) => n.label)).toEqual(["First", "Second"]);
});
it("blocks edit, paste, row moves and history while retaining read/navigation and host updates", () => {
  const grid = createGrid({
    rows: [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ],
    getRowId: (r) => r.id,
    columns: [{ id: "value", field: "value", editable: true }],
  });
  grid.editCell("a", "value", 3);
  grid.setReadOnly(true);
  expect(grid.isReadOnly()).toBe(true);
  expect(grid.getColumns()[0].editable).toBe(false);
  expect(grid.editCell("a", "value", 8)).toMatch(/read only/);
  expect(grid.batchEdit([{ rowId: "a", columnId: "value", value: 9 }])).toMatch(
    /read only/,
  );
  expect(grid.moveRows(["a"], "b", "after")).toMatch(/read only/);
  expect(grid.undo()).toBe(false);
  expect(grid.exportCsv()).toContain("3");
  grid.setReadOnly(false);
  expect(grid.undo()).toBe(true);
  expect(grid.getRow("a")!.value).toBe(1);
  grid.setReadOnly(true);
  grid.applyTransaction({ update: [{ id: "a", value: 7 }] });
  expect(grid.getRow("a")!.value).toBe(7);
});
it("rejects a reentrant read-only policy change before publishing the edit", () => {
  const grid = createGrid({
    rows: [{ id: "a", value: 1 }],
    getRowId: (r) => r.id,
    columns: [
      {
        id: "value",
        field: "value",
        editable: true,
        validate: () => {
          grid.setReadOnly(true);
          return undefined;
        },
      },
    ],
  });
  expect(grid.editCell("a", "value", 3)).toMatch(/read only/);
  expect(grid.getRow("a")!.value).toBe(1);
});
