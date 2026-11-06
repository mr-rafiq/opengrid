import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";

function setup() {
  const rows = [
    { id: "a", phase: "21", subphase: "A", amount: 1 },
    { id: "b", phase: "21", subphase: "B", amount: 2 },
    { id: "c", phase: "22", subphase: "B", amount: 3 },
    { id: "d", phase: null, subphase: null, amount: 4 },
  ];
  const owner = createAg31ClientController({
    rows,
    getRowId: (r) => r.id,
    definitions: [
      { field: "phase", filter: "agSetColumnFilter" },
      { field: "subphase", filter: "agSetColumnFilter" },
      { field: "amount", filter: "agNumberColumnFilter" },
    ],
  });
  const ids = () => {
    const result: string[] = [];
    owner.api.forEachNodeAfterFilterAndSort((n) => {
      if (!n.group) result.push(n.id);
    });
    return result;
  };
  return { ...owner, rows, ids };
}
it("stages the original phase actions until explicit refresh and composes intersections", async () => {
  const c = setup(),
    changed = vi.fn();
  c.api.addEventListener("filterChanged", changed);
  await c.api.setColumnFilterModel("phase", { values: ["21"] });
  expect(c.api.getFilterModel()).toEqual({
    phase: { filterType: "set", values: ["21"] },
  });
  expect(c.ids()).toEqual(["a", "b", "c", "d"]);
  expect(changed).not.toHaveBeenCalled();
  c.api.onFilterChanged();
  expect(c.ids()).toEqual(["a", "b"]);
  await c.api.setColumnFilterModel("subphase", {
    filterType: "set",
    type: "startsWith",
    values: ["B"],
  });
  expect(c.api.getFilterModel()?.subphase).toEqual({
    filterType: "set",
    values: ["B"],
  });
  expect(c.ids()).toEqual(["a", "b"]);
  c.api.onFilterChanged();
  expect(c.ids()).toEqual(["b"]);
  await c.api.setColumnFilterModel("phase", null);
  // The measured reference activates the staged clear when a row transaction refilters.
  c.api.applyTransaction({ update: [{ ...c.rows[0], amount: 10 }] });
  expect(c.ids()).toEqual(["b", "c"]);
  c.api.onFilterChanged();
  expect(c.ids()).toEqual(["b", "c"]);
  c.api.destroy();
});
it("whole-model apply activates an identical pending model and infers provided numeric types", async () => {
  const c = setup();
  await c.api.setColumnFilterModel("amount", {
    type: "greaterThan",
    filter: 2,
  });
  expect(c.ids()).toHaveLength(4);
  c.api.setFilterModel(c.api.getFilterModel());
  expect(c.ids()).toEqual(["c", "d"]);
  await c.api.setColumnFilterModel("amount", { type: "lessThan", filter: 2 });
  expect(c.ids()).toEqual(["c", "d"]);
  c.api.setGridOption("isExternalFilterPresent", () => true);
  c.api.setGridOption("doesExternalFilterPass", () => true);
  expect(c.ids()).toEqual(["a"]);
  c.api.onFilterChanged();
  expect(c.ids()).toEqual(["a"]);
  c.api.destroy();
});
it("exposes owned cached model facades without leaking snapshots or accepting foreign rows", async () => {
  const c = setup();
  const f = await c.api.getColumnFilterInstance("phase");
  expect(f).toBe(await c.api.getColumnFilterInstance(c.api.getColumn("phase")));
  await f!.setModel({ values: ["21"] });
  expect(f!.isFilterActive()).toBe(true);
  const snapshot = f!.getModel();
  if (snapshot && "values" in snapshot)
    (snapshot.values as (string | null)[]).push("22");
  expect(f!.getModel()).toEqual({ filterType: "set", values: ["21"] });
  expect(f!.doesFilterPass({ node: c.api.getRowNode("a")! })).toBe(true);
  expect(f!.doesFilterPass({ node: c.api.getRowNode("c")! })).toBe(false);
  const other = setup();
  expect(f!.doesFilterPass({ node: other.api.getRowNode("a")! })).toBe(false);
  expect(await c.api.getColumnFilterInstance("missing")).toBeUndefined();
  c.api.destroy();
  expect(f!.getModel()).toBeNull();
  expect(f!.isFilterActive()).toBe(false);
  await f!.setModel({ values: ["22"] });
  other.api.destroy();
});
it("rejects invalid staged models atomically without invoking accessor properties", async () => {
  const c = setup(),
    getter = vi.fn(() => ["22"]);
  c.api.setFilterModel({ phase: { filterType: "set", values: ["21"] } });
  await expect(
    c.api.setColumnFilterModel(
      "phase",
      Object.defineProperty({}, "values", { get: getter }),
    ),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(c.api.getFilterModel()).toEqual({
    phase: { filterType: "set", values: ["21"] },
  });
  expect(c.ids()).toEqual(["a", "b"]);
  c.api.destroy();
});

it("activates staged numeric replacements and clears when row data refilters", async () => {
  const c = setup();
  await c.api.setColumnFilterModel("amount", {
    type: "greaterThan",
    filter: 2,
  });
  c.api.onFilterChanged();
  expect(c.ids()).toEqual(["c", "d"]);
  await c.api.setColumnFilterModel("amount", { type: "lessThan", filter: 2 });
  expect(c.ids()).toEqual(["c", "d"]);
  c.api.applyTransaction({ update: [c.rows[0]] });
  expect(c.ids()).toEqual(["a"]);
  await c.api.setColumnFilterModel("amount", null);
  expect(c.ids()).toEqual(["a"]);
  c.api.setGridOption("rowData", [...c.rows]);
  expect(c.ids()).toEqual(["a", "b", "c", "d"]);
  c.api.destroy();
});
