import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import { createAg31Presentation } from "./ag31-presentation.js";
import type { Ag31ValueParams } from "./ag31-value-columns.js";

class Entry {
  detail = { caption: "Original tooltip" };
  constructor(
    public id: string,
    public phase: string,
    public amount: number,
  ) {}
  caption() {
    return `Line ${this.id}`;
  }
}
function setup() {
  const row = new Entry("one", "Planning", 12);
  const rowStyle = vi.fn((p) => ({
    backgroundColor: p.data ? "gold" : "silver",
  }));
  const owner = createAg31ClientController({
    rows: [row],
    getRowId: (r) => r.id,
    context: { active: true },
    getRowStyle: rowStyle,
    initialState: { groupBy: ["phase"] },
    definitions: [
      { field: "phase", enableRowGroup: true },
      {
        field: "amount",
        valueFormatter: (p: Ag31ValueParams<Entry>) => `${p.value} EUR`,
        cellStyle: (p: Ag31ValueParams<Entry>) => ({
          color: p.data?.caption() === "Line one" ? "navy" : "gray",
        }),
        cellClass: ["amount", "number"],
        cellClassRules: {
          changed: (p: Ag31ValueParams<Entry>) =>
            (p.context as { active: boolean }).active,
        },
        tooltipField: "detail.caption",
      },
    ],
  });
  return { owner, row, rowStyle, presentation: createAg31Presentation(owner) };
}
it("skips value getters and formatters for absent decorations, static styles/classes and field-only tooltips", () => {
  const getter = vi.fn((p: Ag31ValueParams<Entry>) => p.data!.amount),
    formatter = vi.fn((p: Ag31ValueParams<Entry>) => String(p.value));
  const owner = createAg31ClientController({
    rows: [new Entry("one", "Planning", 12)],
    getRowId: (r) => r.id,
    definitions: [
      { field: "amount", valueGetter: getter, valueFormatter: formatter },
    ],
  });
  const presentation = createAg31Presentation(owner),
    node = owner.api.getRowNode("one")!;
  getter.mockClear();
  formatter.mockClear();
  expect(presentation.cellStyle(node, "amount")).toBeUndefined();
  expect(presentation.cellClass(node, "amount")).toBe("");
  expect(presentation.tooltip(node, "amount")).toBe("");
  const definition = owner.columns.getColumn("amount")!.getColDef();
  definition.cellStyle = { color: "navy" };
  definition.cellClass = "static";
  definition.tooltipField = "detail.caption";
  expect(presentation.cellStyle(node, "amount")).toEqual({ color: "navy" });
  expect(presentation.cellClass(node, "amount")).toBe("static");
  expect(presentation.tooltip(node, "amount")).toBe("Original tooltip");
  expect(getter).not.toHaveBeenCalled();
  expect(formatter).not.toHaveBeenCalled();
  owner.api.destroy();
});
it("passes original classes, owned nodes, API and live context to row/group styles", () => {
  const { owner, row, rowStyle, presentation } = setup(),
    node = owner.api.getRowNode("one")!;
  expect(presentation.rowStyle(node)).toEqual({ backgroundColor: "gold" });
  expect(rowStyle.mock.calls[0][0]).toMatchObject({
    api: owner.api,
    columnApi: owner.columnApi,
    node,
    data: row,
    rowIndex: null,
    context: { active: true },
  });
  expect(presentation.rowStyle(node.parent!)).toEqual({
    backgroundColor: "silver",
  });
  owner.api.setGridOption("context", { active: false });
  presentation.rowStyle(node);
  expect(rowStyle.mock.lastCall![0].context).toEqual({ active: false });
  expect(row.amount).toBe(12);
  owner.api.destroy();
});
it("replaces or clears row style callbacks with a view-only refresh and nullable getter", () => {
  const { owner, presentation } = setup(),
    node = owner.api.getRowNode("one")!,
    notify = vi.fn();
  owner.subscribeViewRefresh(notify);
  const next = () => ({ color: "red" });
  owner.api.setGridOption("getRowStyle", next);
  expect(presentation.rowStyle(node)).toEqual({ color: "red" });
  owner.api.setGridOption("getRowStyle", next);
  expect(notify).toHaveBeenCalledTimes(1);
  owner.api.setGridOption("getRowStyle", null);
  expect(owner.api.getGridOption("getRowStyle")).toBeUndefined();
  expect(presentation.rowStyle(node)).toBeUndefined();
  expect(() => owner.api.setGridOption("getRowStyle", {})).toThrow(
    /must be a function/,
  );
  owner.api.destroy();
});
it("applies column styles and removes false classes on context refresh without mutating definitions", () => {
  const { owner, presentation } = setup(),
    node = owner.api.getRowNode("one")!;
  expect(presentation.cellStyle(node, "amount")).toEqual({ color: "navy" });
  expect(presentation.cellClass(node, "amount")).toBe("amount number changed");
  owner.api.setGridOption("context", { active: false });
  expect(presentation.cellClass(node, "amount")).toBe("amount number");
  expect(owner.columns.getColumn("amount")!.getColDef().cellClass).toEqual([
    "amount",
    "number",
  ]);
  owner.api.destroy();
});
it("reads dotted tooltip fields and keeps callback precedence, original instances and formatted values", () => {
  const { owner, row, presentation } = setup(),
    node = owner.api.getRowNode("one")!;
  expect(presentation.tooltip(node, "amount")).toBe("Original tooltip");
  const definition = owner.columns.getColumn("amount")!.getColDef();
  const callback = vi.fn(
    (p: Ag31ValueParams<Entry> & { valueFormatted: unknown }) =>
      `${p.data!.caption()}: ${p.valueFormatted}`,
  );
  definition.tooltipValueGetter = callback;
  expect(presentation.tooltip(node, "amount")).toBe("Line one: 12 EUR");
  expect(callback.mock.calls[0][0].data).toBe(row);
  definition.tooltipValueGetter = () => undefined;
  expect(presentation.tooltip(node, "amount")).toBe("");
  owner.api.destroy();
});
it("copies static style records and rejects unsupported class expression strings", () => {
  const { owner, presentation } = setup(),
    node = owner.api.getRowNode("one")!,
    definition = owner.columns.getColumn("amount")!.getColDef();
  const original = { paddingRight: "var(--domain-gap)", height: "100%" };
  definition.cellStyle = original;
  const copy = presentation.cellStyle(node, "amount");
  expect(copy).toEqual(original);
  expect(copy).not.toBe(original);
  definition.cellClassRules = { expression: "value > 0" };
  expect(() => presentation.cellClass(node, "amount")).toThrow(
    /expression adapter/,
  );
  definition.cellStyle = {
    get color() {
      throw new Error("Accessor evaluated");
    },
  };
  expect(() => presentation.cellStyle(node, "amount")).toThrow(
    /cannot contain accessors/,
  );
  owner.api.destroy();
});
