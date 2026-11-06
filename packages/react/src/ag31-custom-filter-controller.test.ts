import { afterEach, expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import type { Ag31CustomFilterPassParams } from "./ag31-custom-filters.js";
type Row = { id: string; amount: number };
const owners: ReturnType<typeof createAg31ClientController<Row>>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.api.destroy();
});
function setup() {
  const Source = () => null,
    rows = [
      { id: "a", amount: 1 },
      { id: "b", amount: 2 },
    ],
    c = createAg31ClientController({
      rows,
      getRowId: (r) => r.id,
      definitions: [
        { field: "id", filter: Source },
        { field: "amount", filter: "agNumberColumnFilter" },
      ],
    });
  owners.push(c);
  const release = c.customFilters.attachHost(() => Source),
    entry = c.customFilters.ensure("id")!;
  const passes = vi.fn((p: Ag31CustomFilterPassParams<Row>) => {
    const value = entry.filter.getModel();
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Array.isArray(value.values) &&
      value.values.includes(p.data?.id ?? "")
    );
  });
  entry.filter.register({ doesFilterPass: passes });
  entry.filter.commit(0);
  const ids = () => {
    const result: string[] = [];
    c.api.forEachNodeAfterFilterAndSort((node) => {
      if (!node.group) result.push(node.id);
    });
    return result;
  };
  const commit = async (promise: Promise<unknown> | void) => {
    const unsubscribe = entry.filter.subscribe(() =>
      entry.filter.commit(entry.filter.getSnapshot().revision),
    );
    entry.filter.commit(entry.filter.getSnapshot().revision);
    try {
      return await promise;
    } finally {
      unsubscribe();
    }
  };
  return { ...c, rows, entry, passes, ids, release, commit };
}
it("stages opaque per-column models until refresh and supplies owned node/data to predicates", async () => {
  const c = setup(),
    model = { values: ["b"] },
    pending = c.api.setColumnFilterModel("id", model);
  model.values.push("a");
  expect(c.ids()).toEqual(["a", "b"]);
  await c.commit(pending);
  expect(c.api.getFilterModel()).toEqual({ id: { values: ["b"] } });
  expect(c.ids()).toEqual(["a", "b"]);
  c.api.onFilterChanged();
  expect(c.ids()).toEqual(["b"]);
  expect(c.passes).toHaveBeenCalledWith(
    expect.objectContaining({ node: c.api.getRowNode("b"), data: c.rows[1] }),
  );
  expect(c.api.getColumn("id")!.isFilterActive()).toBe(true);
  const instance = await c.api.getColumnFilterInstance("id");
  expect(instance).toBe(
    await c.api.getColumnFilterInstance(c.api.getColumn("id")),
  );
  expect(instance!.getModel()).toEqual({ values: ["b"] });
  expect(instance!.doesFilterPass({ node: c.api.getRowNode("a")! })).toBe(
    false,
  );
});
it("prepares provided and custom whole models atomically and clears both after committed rendering", async () => {
  const c = setup();
  const pending = c.api.setFilterModel({
    id: { values: ["b"] },
    amount: { filterType: "number", type: "greaterThan", filter: 1 },
  });
  expect(c.ids()).toEqual(["a", "b"]);
  await c.commit(pending);
  expect(c.ids()).toEqual(["b"]);
  const before = c.api.getFilterModel(),
    revision = c.entry.filter.getSnapshot().revision;
  expect(() =>
    c.api.setFilterModel({
      id: { values: ["a"] },
      amount: { filterType: "date", type: "equals", filter: "x" },
    }),
  ).toThrow();
  expect(c.api.getFilterModel()).toEqual(before);
  expect(c.entry.filter.getSnapshot().revision).toBe(revision);
  const cyclic: any = {};
  cyclic.self = cyclic;
  expect(() =>
    c.api.setFilterModel({
      id: cyclic,
      amount: { filterType: "number", type: "equals", filter: 1 },
    }),
  ).toThrow();
  expect(c.api.getFilterModel()).toEqual(before);
  expect(c.ids()).toEqual(["b"]);
  await c.commit(c.api.setFilterModel(null));
  expect(c.api.getFilterModel()).toEqual({});
  expect(c.ids()).toEqual(["a", "b"]);
});
it("revokes superseded whole-model applications and pending work on owner retirement", async () => {
  const c = setup(),
    first = c.api.setFilterModel({ id: { values: ["a"] } }),
    second = c.api.setFilterModel({ id: { values: ["b"] } }),
    observed: string[][] = [];
  c.model.subscribe(() => observed.push(c.ids()));
  await c.commit(Promise.all([first, second]));
  expect(c.ids()).toEqual(["b"]);
  expect(observed).toEqual([["b"]]);
  const instance = await c.api.getColumnFilterInstance("id"),
    pending = c.api.setColumnFilterModel("id", { values: ["a"] });
  c.api.destroy();
  await pending;
  expect(instance!.getModel()).toBeNull();
  expect(instance!.isFilterActive()).toBe(false);
  await instance!.setModel({ values: ["b"] });
  expect(c.api.getFilterModel()).toBeUndefined();
  expect(c.entry.filter.isDestroyed()).toBe(true);
});
it("does not keep a retired host predicate in later row projections", async () => {
  const c = setup();
  await c.commit(c.api.setColumnFilterModel("id", { values: ["b"] }));
  c.api.onFilterChanged();
  expect(c.ids()).toEqual(["b"]);
  c.release();
  c.model.setRows([...c.rows]);
  expect(c.ids()).toEqual(["a", "b"]);
  expect(c.api.getFilterModel()).toEqual({});
});

it("replaces native column conditions atomically when applying a whole custom model", async () => {
  const c = setup();
  c.model.setFilter("amount", { op: "equals", value: 1 });
  expect(c.ids()).toEqual(["a"]);
  const pending = c.api.setFilterModel({ id: { values: ["b"] } });
  expect(c.ids()).toEqual(["a"]);
  const observed: string[][] = [];
  c.model.subscribe(() => observed.push(c.ids()));
  await c.commit(pending);
  expect(c.model.getState().filters).toEqual({});
  expect(c.ids()).toEqual(["b"]);
  expect(observed).toEqual([["b"]]);
  expect(c.api.getFilterModel()).toEqual({ id: { values: ["b"] } });
});
it("settles pending models and notifies owner retirement even if a custom detach hook throws", async () => {
  const c = setup(),
    retired = vi.fn();
  c.subscribeLifecycle(retired);
  c.entry.filter.register({
    doesFilterPass: () => true,
    afterGuiDetached: () => {
      throw new Error("source detach failed");
    },
  });
  c.entry.filter.attach({ hidePopup: () => {}, suppressFocus: true });
  const pending = c.api.setColumnFilterModel("id", { values: ["a"] });
  expect(() => c.api.destroy()).toThrow("source detach failed");
  await pending;
  expect(retired).toHaveBeenCalledTimes(1);
  expect(c.getLifecycleSnapshot()).toBe(true);
  expect(c.entry.filter.isDestroyed()).toBe(true);
});
