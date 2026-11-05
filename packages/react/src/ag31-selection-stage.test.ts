import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
class Entry {
  constructor(
    public id: string,
    public amount: number,
    public phase = "First",
  ) {}
}
function setup(grouped = false) {
  const rows = [
    new Entry("a", 1),
    new Entry("b", 2),
    new Entry("c", 3, "Second"),
  ];
  const owner = createAg31ClientController({
    rows,
    getRowId: (r) => r.id,
    definitions: [
      { field: "amount", cellDataType: "number" },
      { field: "phase", enableRowGroup: true },
    ],
    initialState: grouped ? { groupBy: ["phase"] } : undefined,
  });
  const order = () => {
    const ids: string[] = [];
    owner.api.forEachNodeAfterFilterAndSort((n) => {
      if (!n.group) ids.push(n.id);
    });
    return ids;
  };
  return { ...owner, rows, order };
}
it("source node selection retains an explicitly sorted projection after view refresh", () => {
  const c = setup();
  c.api.applyColumnState({ state: [{ colId: "amount", sort: "asc" }] });
  expect(c.order()).toEqual(["a", "b", "c"]);
  const a = c.api.getRowNode("a")!;
  c.rows[0].amount = 99;
  c.api.refreshCells({ force: true });
  c.api.getRowNode("b")!.setSelected(true);
  expect(c.order()).toEqual(["a", "b", "c"]);
  expect(c.api.getDisplayedRowAtIndex(0)).toBe(a);
  expect(c.api.getCellValue({ rowNode: a, colKey: "amount" })).toBe(99);
  expect(c.api.getSelectedRows()).toEqual([c.rows[1]]);
  c.api.refreshClientSideRowModel();
  expect(c.order()).toEqual(["b", "c", "a"]);
  c.api.destroy();
});
it("source selection preserves filtered membership and owned group identity", () => {
  vi.useFakeTimers();
  const c = setup(true);
  const root = c.nodes.getRootNode(),
    group = root.childrenAfterGroup![0];
  c.api.setGridOption("isExternalFilterPresent", () => true);
  c.api.setGridOption(
    "doesExternalFilterPass",
    (node: typeof group) => node.data!.amount < 3,
  );
  const before = c.order();
  c.rows[0].amount = 99;
  c.rows[0].phase = "Moved";
  c.api.refreshCells();
  c.api.getRowNode("b")!.setSelected(true);
  expect(c.order()).toEqual(before);
  expect(root.childrenAfterGroup![0]).toBe(group);
  expect(c.api.getRowNode("a")!.parent).toBe(group);
  expect(group.isSelected()).toBeUndefined();
  c.api.onFilterChanged();
  expect(c.order()).toEqual(["b"]);
  c.api.destroy();
  vi.useRealTimers();
});
