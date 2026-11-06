import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import { createAg31CustomFilters } from "./ag31-custom-filters.js";
function setup() {
  const Source = () => null,
    owner = createAg31ClientController({
      rows: [{ id: "a" }],
      getRowId: (r) => r.id,
      definitions: [
        { field: "id", filter: Source },
        { colId: "provided", field: "id", filter: "agSetColumnFilter" },
      ],
    }),
    changed = vi.fn(),
    filters = createAg31CustomFilters({
      getColumn: owner.columns.getColumn,
      onModelChange: changed,
    });
  return { owner, filters, changed, Source };
}
it("requires an owned host and component, retaining a single instance through popup closure", () => {
  const c = setup();
  expect(() => c.filters.ensure("id")).toThrow(/registered hook adapter/);
  expect(c.filters.ensure("missing")).toBeUndefined();
  expect(c.filters.ensure("provided")).toBeUndefined();
  const release = c.filters.attachHost(() => c.Source),
    entry = c.filters.show("id")!;
  expect(c.filters.getSnapshot().open).toBe(entry);
  c.filters.hide();
  expect(c.filters.getSnapshot().entries).toEqual([entry]);
  expect(c.filters.ensure(c.owner.api.getColumn("id"))).toBe(entry);
  expect(c.filters.show("id")).toBe(entry);
  release();
  expect(entry.filter.isDestroyed()).toBe(true);
  expect(c.filters.getSnapshot().entries).toEqual([]);
  c.filters.destroy();
  c.owner.api.destroy();
});
it("revokes queued model acknowledgements when its host retires and ignores stale cleanup", async () => {
  const c = setup(),
    release = c.filters.attachHost(() => c.Source),
    entry = c.filters.ensure("id")!;
  entry.filter.register({ doesFilterPass: () => true });
  entry.filter.commit(0);
  const pending = entry.filter.changeModel({ values: ["a"] });
  release();
  await pending;
  expect(c.changed).not.toHaveBeenCalled();
  const nextRelease = c.filters.attachHost(() => c.Source),
    next = c.filters.ensure("id")!;
  expect(next).not.toBe(entry);
  release();
  expect(c.filters.ensure("id")).toBe(next);
  nextRelease();
  c.filters.destroy();
  c.owner.api.destroy();
});
it("dispatches only current committed source changes and destroys every retained entry", async () => {
  const c = setup();
  c.filters.attachHost(() => c.Source);
  const entry = c.filters.ensure("id")!;
  entry.filter.register({ doesFilterPass: () => true });
  entry.filter.commit(0);
  const pending = entry.filter.changeModel(false);
  entry.filter.commit(1);
  await pending;
  expect(c.changed).toHaveBeenCalledExactlyOnceWith(entry.column);
  c.filters.destroy();
  expect(c.filters.isDestroyed()).toBe(true);
  expect(entry.filter.isDestroyed()).toBe(true);
  expect(c.filters.show("id")).toBeUndefined();
  expect(c.filters.getSnapshot().open).toBeNull();
  c.owner.api.destroy();
});
it("rejects unavailable or legacy component registrations without creating a pending entry", () => {
  const c = setup();
  const release = c.filters.attachHost(() => undefined);
  expect(() => c.filters.ensure("id")).toThrow(
    /registered reactive React component/,
  );
  expect(c.filters.getSnapshot().entries).toEqual([]);
  release();
  const Legacy = class {};
  Object.assign(Legacy.prototype, { isReactComponent: {} });
  c.filters.attachHost(() => Legacy);
  expect(() => c.filters.ensure("id")).toThrow(/imperative component adapter/);
  expect(c.filters.getSnapshot().entries).toEqual([]);
  c.filters.destroy();
  c.owner.api.destroy();
});
