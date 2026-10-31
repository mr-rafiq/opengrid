import { describe, expect, it } from "vitest";
import { createGrid } from "./index";
import type { Column } from "./types";
type Row = {
  id: string;
  team: string | null;
  area: string;
  value: number;
  label: string;
};
const rows: Row[] = [
  { id: "a", team: "A", area: "West", value: 1, label: "Z" },
  { id: "b", team: "B", area: "East", value: 4, label: "A" },
  { id: "c", team: "A", area: "East", value: 9, label: "B" },
  { id: "d", team: "B", area: "East", value: 4, label: "C" },
];
const columns: Column<Row>[] = [
  { id: "team", field: "team" },
  { id: "area", field: "area" },
  {
    id: "value",
    field: "value",
    type: "number",
    aggregate: "sum",
    editable: true,
  },
  { id: "label", field: "label", groupable: false },
];
function make(initialState = {}) {
  return createGrid({
    rows,
    columns,
    getRowId: (r) => r.id,
    initialState: { groupBy: ["team"], ...initialState },
  });
}
function expand(model: ReturnType<typeof make>) {
  for (const node of model.getRowModel())
    if (node.kind === "group") model.toggleExpanded(node.id);
}
describe("resident grouping and totals", () => {
  it("sorts groups by filtered aggregates rather than smallest leaf values", () => {
    const grid = make();
    grid.setSort("value", "asc");
    expect(grid.getRowModel().map((n) => n.label)).toEqual(["B", "A"]);
    grid.setFilter("value", { op: "lt", value: 9 });
    expect(grid.getRowModel().map((n) => n.label)).toEqual(["A", "B"]);
    grid.setSort("value", "desc");
    expect(grid.getRowModel().map((n) => n.label)).toEqual(["B", "A"]);
  });
  it("retains source structural order on non-group leaf sorting and when clearing sort", () => {
    const grid = make();
    grid.setSort("label", "asc");
    expect(grid.getRowModel().map((n) => n.label)).toEqual(["A", "B"]);
    grid.setSort("value", "asc");
    grid.setSort("value", null);
    expect(grid.getRowModel().map((n) => n.label)).toEqual(["A", "B"]);
  });
  it("sorts group keys using typed/custom comparison with blanks last in either direction", () => {
    const grid = createGrid({
      rows: [
        ...rows,
        { id: "empty", team: null, area: "", value: 3, label: "" },
      ],
      columns: columns.map((c) =>
        c.id === "team"
          ? { ...c, compare: (a, b) => String(b).localeCompare(String(a)) }
          : c,
      ),
      getRowId: (r) => r.id,
      initialState: { groupBy: ["team"] },
    });
    grid.setSort("team", "asc");
    expect(grid.getRowModel().map((n) => n.label)).toEqual([
      "B",
      "A",
      "(blank)",
    ]);
    grid.setSort("team", "desc");
    expect(grid.getRowModel().map((n) => n.label)).toEqual([
      "A",
      "B",
      "(blank)",
    ]);
  });
  it("sorts each sibling level using its own aggregates and retains expansion IDs", () => {
    const grid = make({ groupBy: ["team", "area"] });
    const before = grid.getRowModel().map((n) => n.id);
    expand(grid);
    grid.setSort("value", "desc");
    const nodes = grid.getRowModel();
    expect(nodes.filter((n) => n.depth === 0).map((n) => n.label)).toEqual([
      "A",
      "B",
    ]);
    expect(
      nodes
        .filter((n) => n.depth === 1 && n.kind === "group")
        .map((n) => n.label),
    ).toEqual(["East", "West", "East"]);
    expect(grid.getState().expanded).toEqual(before);
  });
  for (const position of ["top", "bottom"] as const)
    it(`projects ${position} subtotal and grand rows without duplicated leaves or selectable source IDs`, () => {
      const grid = make({ groupTotalRow: position, grandTotalRow: position });
      expand(grid);
      const nodes = grid.getRowModel();
      expect(
        nodes
          .filter((n) => n.kind === "row")
          .map((n) => n.id)
          .sort(),
      ).toEqual(["a", "b", "c", "d"]);
      expect(
        nodes
          .filter((n) => n.total === "group")
          .map((n) => n.aggregates?.value),
      ).toEqual([10, 8]);
      const grand = nodes.find((n) => n.total === "grand")!;
      expect(grand.aggregates?.value).toBe(18);
      expect(nodes[position === "top" ? 0 : nodes.length - 1]).toBe(grand);
      for (const group of nodes.filter((n) => n.kind === "group")) {
        const index = nodes.indexOf(group);
        const total = nodes.find((n) => n.parentId === group.id)!;
        expect(nodes.indexOf(total)).toBe(index + (position === "top" ? 1 : 3));
      }
      expect(grid.getHierarchySelectionPlan().rowIds).toHaveLength(4);
      grid.selectRows(nodes.filter((n) => n.kind === "total").map((n) => n.id));
      expect(grid.getState().selected).toEqual([]);
    });
  it("hides subtotals on collapse, keeps grand totals and recomputes after filter/edit/undo", () => {
    const grid = make({ groupTotalRow: "bottom", grandTotalRow: "bottom" });
    expand(grid);
    grid.toggleExpanded(grid.getRowModel().find((n) => n.label === "A")!.id);
    expect(grid.getRowModel().filter((n) => n.total === "group")).toHaveLength(
      1,
    );
    grid.setQuickFilter("West");
    expect(grid.getRowModel().at(-1)?.aggregates?.value).toBe(1);
    expect(grid.editCell("a", "value", 5)).toBeUndefined();
    expect(grid.getRowModel().at(-1)?.aggregates?.value).toBe(5);
    grid.undo();
    expect(grid.getRowModel().at(-1)?.aggregates?.value).toBe(1);
  });
  it("calculates weighted averages from source rows, not child aggregates", () => {
    const grid = createGrid({
      rows,
      columns: columns.map((c) =>
        c.id === "value" ? { ...c, aggregate: "avg" } : c,
      ),
      getRowId: (r) => r.id,
      initialState: { groupBy: ["team", "area"], grandTotalRow: "bottom" },
    });
    expect(grid.getRowModel().at(-1)?.aggregates?.value).toBe(4.5);
  });
  it("handles empty filtered totals, explicit disabling, bounded pagination and colliding source IDs", () => {
    const grid = createGrid({
      rows: [{ ...rows[0], id: "total:grand" }],
      columns,
      getRowId: (r) => r.id,
      initialState: { grandTotalRow: "top", pageSize: 1 },
    });
    expect(grid.getRowModel()[0].id).toBe("total:grand:");
    expect(grid.getPageCount()).toBe(2);
    expect(grid.getPageRows()).toHaveLength(1);
    grid.setQuickFilter("absent");
    expect(grid.getRowModel()).toHaveLength(1);
    expect(grid.getRowModel()[0].aggregates?.value).toBe(0);
    grid.setState({ grandTotalRow: false });
    expect(grid.getRowModel()).toEqual([]);
  });
  it("retains exact BigInt aggregates and stable tie order", () => {
    const grid = createGrid({
      rows: [
        { id: "a", team: "A", value: 9007199254740993n },
        { id: "b", team: "B", value: 9007199254740992n },
      ],
      columns: [
        { id: "team", field: "team" },
        { id: "value", field: "value", type: "bigint", aggregate: "sum" },
      ],
      getRowId: (r) => r.id,
      initialState: { groupBy: ["team"], grandTotalRow: "bottom" },
    });
    grid.setSort("value", "asc");
    expect(grid.getRowModel()[0].label).toBe("B");
    expect(grid.getRowModel().at(-1)?.aggregates?.value).toBe(
      18014398509481985n,
    );
    const tied = make();
    tied.setFilter("value", { op: "equals", value: 4 });
    tied.setSort("value", "asc");
    expect(tied.getRowModel()[0].label).toBe("B");
  });
  it("rejects invalid modes atomically and removes disallowed/replaced group columns", () => {
    const grid = make();
    const before = grid.getState();
    expect(() => grid.setState({ grandTotalRow: "sticky" as never })).toThrow();
    expect(grid.getState()).toBe(before);
    grid.setState({ groupBy: ["label", "team", "team"] });
    expect(grid.getState().groupBy).toEqual(["team"]);
    grid.setColumns(
      columns.map((c) => (c.id === "team" ? { ...c, groupable: false } : c)),
    );
    expect(grid.getState().groupBy).toEqual([]);
  });
  it("leaves source rows and exported CSV unchanged by totals", () => {
    const grid = make({ groupTotalRow: "bottom", grandTotalRow: "bottom" });
    expand(grid);
    expect(grid.exportCsv({ allRows: true }).split("\n")).toHaveLength(5);
    expect(grid.getRows()).toEqual(rows);
  });
});
