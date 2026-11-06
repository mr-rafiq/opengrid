import { expect, it } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";

it("matches the observed resident aggregate-stage filter/group retention and downstream leaf sort", () => {
  class Entry {
    constructor(
      public id: string,
      public index: number,
      public position: { Position: string },
      public amount: number,
    ) {}
    tag() {
      return "original";
    }
  }
  const rows = Array.from(
    { length: 200 },
    (_, index) =>
      new Entry(
        String(index),
        index,
        { Position: `G${String(Math.floor(index / 10)).padStart(2, "0")}` },
        index * 10,
      ),
  );
  const owner = createAg31ClientController({
    rows,
    getRowId: (row) => row.id,
    definitions: [
      {
        field: "position.Position",
        rowGroup: true,
        hide: true,
        enableRowGroup: false,
      },
      {
        field: "index",
        cellDataType: "number",
        filter: "agNumberColumnFilter",
      },
      { field: "amount", cellDataType: "number" },
    ],
  });
  const api = owner.api;
  api.setFilterModel({
    index: { filterType: "number", type: "greaterThanOrEqual", filter: 100 },
  });
  api.applyColumnState({ state: [{ colId: "index", sort: "desc" }] });
  const target = api.getRowNode("109")!,
    parent = target.parent!,
    selected = api.getRowNode("100")!;
  parent.setExpanded(true);
  selected.setSelected(true);
  expect(parent.childrenAfterSort!.map((node) => node.id)).toEqual([
    "109",
    "108",
    "107",
    "106",
    "105",
    "104",
    "103",
    "102",
    "101",
    "100",
  ]);
  rows[109].index = -1;
  rows[109].position.Position = "G99";
  rows[109].amount = 12999;
  api.refreshClientSideRowModel("aggregate");
  expect(api.getRowNode("109")).toBe(target);
  expect(target.data).toBe(rows[109]);
  expect(target.data!.tag()).toBe("original");
  expect(target.parent).toBe(parent);
  expect(parent.key).toBe("G10");
  expect(parent.childrenAfterFilter).toHaveLength(10);
  expect(parent.childrenAfterSort!.map((node) => node.id)).toEqual([
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
  expect(target.rowIndex).toBe(10);
  expect(api.getDisplayedRowCount()).toBe(20);
  expect(api.getSelectedNodes()).toEqual([selected]);
  expect(() => api.refreshClientSideRowModel("filter" as never)).toThrow(
    "Partial source processing stages",
  );
  api.refreshClientSideRowModel("group");
  expect(target.parent!.key).toBe("G99");
  expect(target.rowIndex).toBeNull();
  api.destroy();
  expect(() => api.refreshClientSideRowModel("aggregate")).not.toThrow();
});
