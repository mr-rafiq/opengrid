import { expect, it, vi } from "vitest";
import { createAg31ReactiveFilter } from "./ag31-reactive-filter.js";
it("acknowledges opaque models only after the current hook and render commit", async () => {
  const changed = vi.fn(),
    filter = createAg31ReactiveFilter<{ data: { id: string } }>(changed),
    seen = vi.fn((p) => p.data.id === "a");
  const model = { values: ["a"] },
    pending = filter.stage(model);
  let finished = false;
  pending.then(() => (finished = true));
  model.values.push("b");
  expect(filter.getModel()).toEqual({ values: ["a"] });
  await Promise.resolve();
  expect(finished).toBe(false);
  filter.register({ doesFilterPass: seen });
  filter.commit(0);
  await Promise.resolve();
  expect(finished).toBe(false);
  filter.commit(1);
  expect(await pending).toBe(true);
  const params = { data: { id: "a" } };
  expect(filter.doesFilterPass(params)).toBe(true);
  expect(seen).toHaveBeenCalledWith(params);
  expect(changed).not.toHaveBeenCalled();
  filter.destroy();
});
it("rejects a committed component without required hooks and settles pending work", async () => {
  const filter = createAg31ReactiveFilter(() => {}),
    pending = filter.stage({ values: ["a"] });
  expect(() => filter.commit(1)).toThrow(/useGridFilter/);
  expect(await pending).toBe(false);
  expect(filter.isDestroyed()).toBe(true);
});
it("coalesces superseded renders, applies component changes after commit and revokes retired work", async () => {
  const changed = vi.fn(),
    filter = createAg31ReactiveFilter(changed);
  filter.register({ doesFilterPass: () => true });
  filter.commit(0);
  const old = filter.stage(false),
    latest = filter.changeModel({ values: [] });
  filter.commit(1);
  expect(changed).not.toHaveBeenCalled();
  filter.commit(2);
  expect(await old).toBe(true);
  await latest;
  expect(changed).toHaveBeenCalledTimes(1);
  const pending = filter.changeModel(null);
  filter.destroy();
  await pending;
  expect(changed).toHaveBeenCalledTimes(1);
  expect(await filter.stage({ anything: true })).toBe(false);
  expect(filter.isFilterActive()).toBe(false);
});
it("owns nullable model activity and ignores component getModel as a model source", async () => {
  const filter = createAg31ReactiveFilter(() => {}),
    pass = vi.fn(() => false),
    hooks = { doesFilterPass: pass, getModel: () => ({ forged: true }) };
  filter.register(hooks);
  filter.commit(0);
  expect(filter.doesFilterPass({ data: { id: "a" } })).toBe(true);
  expect(pass).not.toHaveBeenCalled();
  const staged = filter.stage(0);
  filter.commit(1);
  await staged;
  expect(filter.isFilterActive()).toBe(true);
  expect(filter.getModel()).toBe(0);
  expect(filter.doesFilterPass({ data: { id: "a" } })).toBe(false);
  filter.destroy();
});
it("retains attach/detach without duplicate attachment and rejects unfinished hook contracts", () => {
  const filter = createAg31ReactiveFilter(() => {}),
    attach = vi.fn(),
    detach = vi.fn();
  for (const key of [
    "onNewRowsLoaded",
    "onAnyFilterChanged",
    "getModelAsString",
  ])
    expect(() =>
      filter.register(
        Object.assign({ doesFilterPass: () => true }, { [key]: () => {} }),
      ),
    ).toThrow(/separate lifecycle adapter/);
  filter.register({
    doesFilterPass: () => true,
    afterGuiAttached: attach,
    afterGuiDetached: detach,
  });
  const params = { hidePopup: vi.fn(), suppressFocus: true };
  filter.attach(params);
  filter.attach(params);
  expect(attach).toHaveBeenCalledExactlyOnceWith(params);
  filter.detach();
  filter.detach();
  expect(detach).toHaveBeenCalledTimes(1);
  filter.attach(params);
  filter.destroy();
  expect(detach).toHaveBeenCalledTimes(2);
  filter.attach(params);
});
