import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
class Entry {
  constructor(
    public id: string,
    public amount: number | null,
    public category: unknown,
  ) {}
}
function setup() {
  const rows = [
    new Entry("a", null, null),
    new Entry("b", 1, "01"),
    new Entry("c", 3, ["alpha", "beta"]),
    new Entry("d", 5, "ALPHA"),
  ];
  const owner = createAg31ClientController({
    rows,
    getRowId: (r) => r.id,
    definitions: [
      { field: "amount", filter: "agNumberColumnFilter" },
      { field: "category", filter: "agSetColumnFilter" },
    ],
  });
  const ids = () => {
    const ids: string[] = [];
    owner.api.forEachNodeAfterFilterAndSort((n) => {
      if (!n.group) ids.push(n.id);
    });
    return ids;
  };
  return { ...owner, rows, ids };
}
it("applies numeric source models, exposes active columns and owns snapshots", () => {
  const c = setup(),
    input = { amount: { filterType: "number", type: "notEqual", filter: 0 } };
  c.api.setFilterModel(input);
  expect(c.ids()).toEqual(["b", "c", "d"]);
  expect(c.api.getColumn("amount")!.isFilterActive()).toBe(true);
  input.amount.filter = 3;
  const snapshot = c.api.getFilterModel()!;
  if ("filter" in snapshot.amount) snapshot.amount.filter = 5;
  expect(c.ids()).toEqual(["b", "c", "d"]);
  expect(c.api.getFilterModel()!.amount).toEqual({
    filterType: "number",
    type: "notEqual",
    filter: 0,
  });
  c.api.setFilterModel(null);
  expect(c.ids()).toEqual(["a", "b", "c", "d"]);
  expect(c.api.getColumn("amount")!.isFilterActive()).toBe(false);
  c.api.destroy();
});
it("matches source set keys including arrays and case-insensitive membership", () => {
  const c = setup();
  c.api.setFilterModel({ category: { filterType: "set", values: ["alpha"] } });
  expect(c.ids()).toEqual(["c", "d"]);
  c.api.setFilterModel({ category: { filterType: "set", values: ["01"] } });
  expect(c.ids()).toEqual(["b"]);
  c.api.setFilterModel({ category: { filterType: "set", values: [] } });
  expect(c.ids()).toEqual([]);
  c.api.destroy();
});
it("composes source models with external Smart Search callbacks", () => {
  const c = setup();
  c.api.setGridOption("isExternalFilterPresent", () => true);
  c.api.setGridOption(
    "doesExternalFilterPass",
    (n: Ag31RowNode<Entry>) => n.data!.id !== "d",
  );
  c.api.setFilterModel({
    amount: { filterType: "number", type: "greaterThan", filter: 1 },
  });
  expect(c.ids()).toEqual(["c"]);
  c.api.setGridOption("isExternalFilterPresent", null);
  expect(c.ids()).toEqual(["c", "d"]);
  c.api.setFilterModel(null);
  expect(c.ids()).toEqual(["a", "b", "c", "d"]);
  c.api.destroy();
});
it("clears native conditions atomically without an intermediate source projection", () => {
  const c = setup();
  c.model.setFilter("amount", { op: "equals", value: 5 });
  const observed: unknown[] = [];
  c.model.subscribe(() => observed.push(c.ids()));
  c.api.setFilterModel({
    amount: { filterType: "number", type: "lessThan", filter: 4 },
  });
  expect(observed).toEqual([["b", "c"]]);
  expect(c.model.getState().filters).toEqual({});
  c.api.destroy();
});
it("rolls back an invalid whole model and rejects unsupported custom hooks", () => {
  const c = setup();
  c.api.setFilterModel({ category: { filterType: "set", values: ["01"] } });
  const before = c.api.getFilterModel();
  expect(() =>
    c.api.setFilterModel({
      amount: { filterType: "date", type: "equals", filter: 1 },
    }),
  ).toThrow();
  expect(c.api.getFilterModel()).toEqual(before);
  expect(c.ids()).toEqual(["b"]);
  c.api.setFilterModel({
    unknown: { filterType: "number", type: "equals", filter: 1 },
  });
  expect(c.ids()).toHaveLength(4);
  c.api.destroy();
  const custom = createAg31ClientController({
    rows: [{ id: "a" }],
    getRowId: (r) => r.id,
    definitions: [{ field: "id", filter: () => null }],
  });
  expect(() => custom.api.setFilterModel({ id: { values: ["a"] } })).toThrow(
    /registered hook adapter/,
  );
  custom.api.destroy();
});
it("uses filter-specific getters and key creators with original source records", () => {
  class Choice {
    constructor(public key: string) {}
  }
  const choice = new Choice("alpha"),
    row = { id: "a", choice },
    key = vi.fn((p) => p.value.key),
    getter = vi.fn((p) => p.data.choice);
  const c = createAg31ClientController({
    rows: [row],
    getRowId: (r) => r.id,
    definitions: [
      {
        field: "choice",
        filter: "agSetColumnFilter",
        filterValueGetter: getter,
        filterParams: { keyCreator: key },
      },
    ],
  });
  c.api.setFilterModel({ choice: { filterType: "set", values: ["alpha"] } });
  expect(c.api.getDisplayedRowCount()).toBe(1);
  expect(key.mock.calls[0][0]).toMatchObject({ value: choice, data: row });
  expect(getter.mock.calls[0][0].data).toBe(row);
  c.api.destroy();
});
it("reports native-dialog serialization as an explicit remaining contract", () => {
  const c = setup();
  c.model.setFilter("amount", { op: "gt", value: 1 });
  expect(() => c.api.getFilterModel()).toThrow(/source filter UI adapter/);
  c.api.destroy();
});

it("canonicalizes requested set keys and discards keys absent from the source", () => {
  const c = setup();
  c.api.setFilterModel({
    category: {
      filterType: "set",
      values: ["beta", "ALPHA", "beta", "missing", null],
    },
  });
  expect(c.api.getFilterModel()).toEqual({
    category: { filterType: "set", values: ["beta", "alpha", null] },
  });
  expect(c.ids()).toEqual(["a", "c", "d"]);
  c.api.destroy();
});
it("clears all-key selection so a later new key is eligible", () => {
  const c = setup();
  c.api.setFilterModel({
    category: { filterType: "set", values: [null, "01", "alpha", "beta"] },
  });
  expect(c.api.getFilterModel()).toEqual({});
  expect(c.api.getColumn("category")!.isFilterActive()).toBe(false);
  c.api.applyTransaction({ add: [new Entry("new", 9, "gamma")] });
  expect(c.ids()).toEqual(["a", "b", "c", "d", "new"]);
  c.api.destroy();
});
it("does not revive selected keys after they disappear and source rows return", () => {
  const c = setup();
  c.api.setFilterModel({ category: { filterType: "set", values: ["alpha"] } });
  c.api.setGridOption("rowData", c.rows.slice(0, 2));
  expect(c.api.getFilterModel()).toEqual({
    category: { filterType: "set", values: [] },
  });
  expect(c.ids()).toEqual([]);
  c.api.setGridOption("rowData", c.rows);
  expect(c.api.getFilterModel()).toEqual({
    category: { filterType: "set", values: [] },
  });
  expect(c.ids()).toEqual([]);
  c.api.destroy();
});
it("updates the canonical source key through an owned row transaction", () => {
  const c = setup();
  c.api.setFilterModel({ category: { filterType: "set", values: ["alpha"] } });
  c.api.applyTransaction({ update: [new Entry("c", 3, ["renamed", "beta"])] });
  expect(c.api.getFilterModel()).toEqual({
    category: { filterType: "set", values: ["ALPHA"] },
  });
  expect(c.ids()).toEqual(["d"]);
  c.api.destroy();
});
it("clears an empty-data set request before later rows load", () => {
  const c = setup();
  c.api.setGridOption("rowData", []);
  c.api.setFilterModel({ category: { filterType: "set", values: ["alpha"] } });
  expect(c.api.getFilterModel()).toEqual({});
  c.api.setGridOption("rowData", c.rows);
  expect(c.ids()).toHaveLength(4);
  c.api.destroy();
});
it("rejects unimplemented supplied/tree key services instead of silently using resident values", () => {
  const c = createAg31ClientController({
    rows: [{ id: "a", category: "alpha" }],
    getRowId: (r) => r.id,
    definitions: [
      {
        field: "category",
        filter: "agSetColumnFilter",
        filterParams: { values: ["alpha", "beta"] },
      },
    ],
  });
  expect(() =>
    c.api.setFilterModel({ category: { filterType: "set", values: ["beta"] } }),
  ).toThrow(/value-service adapter/);
  expect(c.api.getFilterModel()).toEqual({});
  c.api.destroy();
});
