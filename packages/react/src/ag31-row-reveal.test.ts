import { expect, it, vi } from "vitest";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
import { createAg31ClientController } from "./ag31-client-controller.js";

class Record {
  constructor(
    public id: string,
    public amount: number,
  ) {}
}
function setup() {
  const rows = Array.from(
      { length: 30 },
      (_, index) => new Record(String(index), index),
    ),
    owner = createAg31ClientController({
      rows,
      getRowId: (row) => row.id,
      definitions: [
        { field: "id" },
        { field: "amount", filter: "agNumberColumnFilter" },
      ],
      rowHeight: 32,
    });
  let top = 0,
    bodyHeight = 200,
    active = true;
  const scrollTo = vi.fn((value: { top?: number; left?: number }) => {
      if (value.top !== undefined) top = value.top;
      return true;
    }),
    read = () => ({
      view: {
        isActive: () => active,
        getScrollPosition: () => ({ top, left: 80 }),
        scrollTo,
      },
      bodyHeight,
    }),
    detach = owner.rowReveal.attach(read);
  return {
    owner,
    rows,
    scrollTo,
    detach,
    read,
    top: () => top,
    height(value: number) {
      bodyHeight = value;
    },
    active(value: boolean) {
      active = value;
    },
  };
}
it.each([
  ["top", 320],
  ["middle", 236],
  ["bottom", 152],
] as const)(
  "reveals the displayed source node at %s without changing horizontal position, focus or selection",
  async (position, expected) => {
    const c = setup(),
      events = vi.fn();
    c.owner.api.addEventListener("modelUpdated", events);
    const before = c.owner.model.getState();
    c.owner.api.ensureNodeVisible(c.owner.api.getRowNode("10")!, position);
    expect(c.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: expected });
    expect(c.owner.api.getSelectedNodes()).toEqual([]);
    await Promise.resolve();
    expect(c.owner.model.getState()).toBe(before);
    expect(events).not.toHaveBeenCalled();
    expect(c.owner.api.getRowNode("10")!.data).toBe(c.rows[10]);
    c.owner.api.destroy();
  },
);
it("uses minimum necessary scrolling and current viewport height", () => {
  const c = setup();
  c.owner.api.ensureIndexVisible(2);
  expect(c.scrollTo).not.toHaveBeenCalled();
  c.owner.api.ensureIndexVisible(10);
  expect(c.top()).toBe(152);
  c.owner.api.ensureIndexVisible(10);
  expect(c.scrollTo).toHaveBeenCalledTimes(1);
  c.owner.api.ensureIndexVisible(2);
  expect(c.top()).toBe(64);
  c.height(400);
  c.owner.api.ensureIndexVisible(10, "middle");
  expect(c.top()).toBe(136);
  c.height(16);
  c.owner.api.ensureIndexVisible(10, "middle");
  expect(c.top()).toBe(320);
  c.owner.api.ensureIndexVisible(0, "bottom");
  expect(c.top()).toBe(16);
  c.owner.api.destroy();
});
it("accepts original data and first matching displayed predicate but rejects lookalike node/data identities", () => {
  const c = setup(),
    predicate = vi.fn((node: Ag31RowNode<Record>) => node.data?.amount === 8);
  c.owner.api.ensureNodeVisible(c.rows[7], "top");
  expect(c.top()).toBe(224);
  c.owner.api.ensureNodeVisible(predicate, "top");
  expect(c.top()).toBe(256);
  expect(predicate).toHaveBeenCalledTimes(9);
  expect(predicate.mock.calls[8][0]).toBe(c.owner.api.getRowNode("8"));
  c.owner.api.ensureNodeVisible(new Record("20", 20), "top");
  c.owner.api.ensureNodeVisible({ ...c.owner.api.getRowNode("20")! }, "top");
  expect(c.scrollTo).toHaveBeenCalledTimes(2);
  c.owner.api.destroy();
});
it("uses the filtered and sorted displayed row index without expanding hidden descendants", () => {
  const c = setup(),
    hidden = c.owner.api.getRowNode("4")!;
  c.owner.api.setFilterModel({
    amount: { filterType: "number", type: "greaterThan", filter: 20 },
  });
  c.owner.model.setSort("amount", "desc");
  c.owner.api.ensureNodeVisible(hidden, "top");
  expect(c.scrollTo).not.toHaveBeenCalled();
  c.owner.api.ensureIndexVisible(3, "top");
  expect(c.top()).toBe(96);
  expect(c.owner.api.getDisplayedRowAtIndex(3)!.data).toBe(c.rows[26]);
  c.owner.api.destroy();
});
it("does nothing for invalid indices or unavailable geometry and revokes retired attachments", () => {
  const c = setup();
  for (const index of [-1, NaN, Infinity, 0.5, 30])
    c.owner.api.ensureIndexVisible(index, "top");
  c.active(false);
  c.owner.api.ensureIndexVisible(10, "top");
  c.active(true);
  c.height(0);
  c.owner.api.ensureIndexVisible(10, "top");
  c.height(200);
  const oldDetach = c.owner.rowReveal.attach(c.read);
  c.owner.rowReveal.attach(c.read);
  oldDetach();
  c.owner.api.ensureIndexVisible(10, "top");
  expect(c.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 320 });
  c.owner.api.destroy();
  const predicate = vi.fn(() => true);
  c.owner.api.ensureNodeVisible(predicate, "top");
  c.owner.api.ensureIndexVisible(10, "top");
  expect(predicate).not.toHaveBeenCalled();
  expect(c.scrollTo).toHaveBeenCalledTimes(1);
});
it("applies only the latest queued reveal after the current sorted view commits", () => {
  const c = setup();
  c.active(false);
  c.owner.api.ensureIndexVisible(5, "top");
  c.owner.model.setSort("amount", "desc");
  c.owner.api.ensureNodeVisible(c.rows[10], "middle");
  c.owner.rowReveal.flush();
  expect(c.scrollTo).not.toHaveBeenCalled();
  c.active(true);
  c.owner.rowReveal.flush();
  expect(c.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 524 });
  c.owner.rowReveal.flush();
  expect(c.scrollTo).toHaveBeenCalledTimes(1);
  c.owner.api.destroy();
});
it("cancels deferred commands when their row or view is retired", () => {
  const c = setup();
  c.active(false);
  c.owner.api.ensureNodeVisible(c.rows[10], "top");
  c.owner.api.applyTransaction({ remove: [c.rows[10]] });
  c.active(true);
  c.owner.rowReveal.flush();
  c.owner.api.applyTransaction({ add: [c.rows[10]] });
  c.owner.rowReveal.flush();
  expect(c.scrollTo).not.toHaveBeenCalled();
  c.active(false);
  c.owner.api.ensureIndexVisible(10, "top");
  c.detach();
  c.owner.rowReveal.attach(c.read);
  c.active(true);
  c.owner.rowReveal.flush();
  expect(c.scrollTo).not.toHaveBeenCalled();
  c.owner.api.destroy();
});
