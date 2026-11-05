import { expect, it } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
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
  const c = createAg31ClientController({
    rows,
    getRowId: (r) => r.id,
    definitions: [
      { field: "id" },
      { field: "amount", cellDataType: "number" },
      { field: "phase", enableRowGroup: true },
    ],
  });
  c.api.applyColumnState({ state: [{ colId: "amount", sort: "asc" }] });
  const order = () => {
    const ids: string[] = [];
    c.api.forEachNodeAfterFilterAndSort((n) => {
      if (!n.group) ids.push(n.id);
    });
    return ids;
  };
  order();
  rows[0].amount = 99;
  c.api.refreshCells();
  return { ...c, rows, order };
}
it.each(["resize", "hide", "pin", "reorder", "same-sort"] as const)(
  "%s retains existing source stages",
  (action) => {
    const c = setup();
    if (action === "resize")
      c.api.applyColumnState({ state: [{ colId: "amount", width: 180 }] });
    else if (action === "hide")
      c.api.applyColumnState({ state: [{ colId: "phase", hide: true }] });
    else if (action === "pin")
      c.api.applyColumnState({ state: [{ colId: "id", pinned: "left" }] });
    else if (action === "reorder")
      c.api.applyColumnState({
        state: [{ colId: "amount" }, { colId: "id" }, { colId: "phase" }],
        applyOrder: true,
      });
    else c.api.applyColumnState({ state: [{ colId: "amount", sort: "asc" }] });
    expect(c.order()).toEqual(["a", "b", "c"]);
    expect(
      c.api.getCellValue({ rowNode: c.api.getRowNode("a")!, colKey: "amount" }),
    ).toBe(99);
    c.api.destroy();
  },
);
it("full refresh reprocesses class records without changing their identity", () => {
  const c = setup();
  c.api.refreshClientSideRowModel();
  expect(c.order()).toEqual(["b", "c", "a"]);
  expect(c.api.getRowNode("a")!.data).toBe(c.rows[0]);
  c.api.destroy();
});
it("rejects unsupported partial refresh stages instead of doing a different query", () => {
  const c = setup();
  expect(() => c.api.refreshClientSideRowModel("aggregate" as never)).toThrow(
    /Partial source processing/,
  );
  expect(c.order()).toEqual(["a", "b", "c"]);
  c.api.destroy();
});
