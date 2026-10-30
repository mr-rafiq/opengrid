import { describe, expect, it, vi } from "vitest";
import {
  AutoHeightController,
  type AutoHeightCell,
  type AutoHeightControllerOptions,
} from "./auto-height-controller.js";

function fixture(options: AutoHeightControllerOptions = {}) {
  const jobs: (() => void)[] = [],
    callbacks: ((elements: readonly HTMLElement[]) => void)[] = [];
  const observers: {
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const measure = vi.fn(() => ({ height: 50.2, width: 120 }));
  const controller = new AutoHeightController({
    measure,
    schedule: (callback) => {
      jobs.push(callback);
      return () => {};
    },
    createObserver: (callback) => {
      callbacks.push(callback);
      const observer = {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
      observers.push(observer);
      return observer;
    },
    ...options,
  });
  const epoch = {},
    data = { text: "Original" },
    element = {} as HTMLElement,
    token = {};
  const cell: AutoHeightCell = {
    epoch,
    rowId: "__proto__",
    columnId: "constructor",
    endRowId: "__proto__",
    rowCount: 1,
    data,
    isCurrent: () => true,
  };
  const drain = () => {
    for (let cycle = 0; jobs.length; cycle++) {
      if (cycle > 20) throw new Error("Unexpected measurement loop");
      const current = jobs.splice(0);
      for (const job of current) job();
    }
  };
  return {
    controller,
    measure,
    jobs,
    callbacks,
    observers,
    epoch,
    data,
    element,
    token,
    cell,
    drain,
  };
}
function mount(f: ReturnType<typeof fixture>) {
  f.controller.register(f.element, f.cell, f.token);
  f.controller.commitEpoch(f.epoch);
  return f.controller.connect();
}
const entries = (f: ReturnType<typeof fixture>, epoch = f.epoch) => [
  ...f.controller.measurements(epoch),
];

describe("committed automatic height measurement ownership", () => {
  it("constructs without scheduling, observing or measuring and publishes owned metrics in one batch", () => {
    const f = fixture(),
      listener = vi.fn();
    f.controller.subscribe(listener);
    expect(f.jobs).toEqual([]);
    expect(f.observers).toEqual([]);
    expect(f.measure).not.toHaveBeenCalled();
    mount(f);
    expect(f.measure).not.toHaveBeenCalled();
    f.drain();
    expect(entries(f)).toMatchObject([
      { rowId: "__proto__", columnId: "constructor", height: 51, width: 120 },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(entries(f)[0])).toBe(true);
    expect(Object.isFrozen(f.data)).toBe(false);
    expect("isCurrent" in entries(f)[0]).toBe(false);
  });
  it("does not republish identical metrics and coalesces repeated observer notifications", () => {
    const f = fixture(),
      listener = vi.fn();
    f.controller.subscribe(listener);
    mount(f);
    f.drain();
    for (let index = 0; index < 10; index++) f.callbacks[0]([f.element]);
    expect(f.jobs).toHaveLength(1);
    f.drain();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(f.measure).toHaveBeenCalledTimes(2);
  });
  it("rejects stale callbacks, scheduled work and cleanup from an older connection", () => {
    const f = fixture();
    const stop = mount(f);
    const oldCallback = f.callbacks[0];
    stop();
    f.drain();
    expect(entries(f)).toEqual([]);
    const current = f.controller.connect();
    stop();
    oldCallback([f.element]);
    f.drain();
    expect(entries(f)).toHaveLength(1);
    expect(f.observers[1].disconnect).not.toHaveBeenCalled();
    current();
    f.callbacks[1]([f.element]);
    f.drain();
    expect(f.measure).toHaveBeenCalledTimes(1);
  });
  it("retains registered cells across effect replay while replacing the observer", () => {
    const f = fixture();
    const stop = mount(f);
    stop();
    f.controller.connect();
    f.drain();
    expect(f.observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(f.observers[1].observe).toHaveBeenCalledWith(f.element);
    expect(entries(f)).toHaveLength(1);
  });
  it("does not measure or retain a source that is no longer current", () => {
    const f = fixture();
    f.controller.register(
      f.element,
      { ...f.cell, isCurrent: () => false },
      f.token,
    );
    f.controller.commitEpoch(f.epoch);
    f.controller.connect();
    f.drain();
    expect(f.measure).not.toHaveBeenCalled();
    expect(entries(f)).toEqual([]);
  });
  it("rechecks source ownership after measuring and tolerates predicates that throw", () => {
    let current = true;
    const f = fixture({
      measure: () => {
        current = false;
        return { height: 90, width: 120 };
      },
    });
    f.controller.register(
      f.element,
      { ...f.cell, isCurrent: () => current },
      f.token,
    );
    f.controller.commitEpoch(f.epoch);
    f.controller.connect();
    f.drain();
    expect(entries(f)).toEqual([]);
    f.controller.register(
      f.element,
      {
        ...f.cell,
        isCurrent: () => {
          throw new Error("Source unavailable");
        },
      },
      {},
    );
    f.drain();
    expect(entries(f)).toEqual([]);
  });
  it("does not let an obsolete measurement overwrite a newer epoch installed while reading the DOM", () => {
    const next = {};
    let f!: ReturnType<typeof fixture>;
    f = fixture({
      measure: () => {
        f.controller.commitEpoch(next);
        return { height: 90, width: 120 };
      },
    });
    mount(f);
    f.drain();
    expect(entries(f)).toEqual([]);
    expect(entries(f, next)).toEqual([]);
  });
  it("replacing a cell registration rejects an old null-ref cleanup", () => {
    const f = fixture();
    mount(f);
    f.drain();
    const replacement = {} as HTMLElement,
      token = {};
    f.controller.register(
      replacement,
      { ...f.cell, data: { text: "Replacement" } },
      token,
    );
    f.controller.register(null, f.cell, f.token);
    f.drain();
    expect(f.observers[0].observe).toHaveBeenLastCalledWith(replacement);
    expect(entries(f)[0].data).toEqual({ text: "Replacement" });
  });
  it("recycled DOM elements are measured for their newest source row", () => {
    const f = fixture();
    mount(f);
    f.drain();
    f.controller.register(
      f.element,
      { ...f.cell, rowId: "new", endRowId: "new", data: "New record" },
      {},
    );
    f.controller.register(null, f.cell, f.token);
    f.callbacks[0]([f.element]);
    f.drain();
    expect(entries(f).find((entry) => entry.rowId === "new")?.data).toBe(
      "New record",
    );
    expect(f.observers[0].observe).toHaveBeenLastCalledWith(f.element);
  });
  it.each([
    { height: NaN, width: 100 },
    { height: 50, width: 0 },
    { height: -1, width: 100 },
    { height: 1_000_001, width: 100 },
    { height: 50, width: Infinity },
  ])(
    "ignores unreadable or hidden geometry %j without discarding a prior valid height",
    (metric) => {
      let invalid = false;
      const f = fixture({
        measure: () => (invalid ? metric : { height: 50, width: 120 }),
      });
      mount(f);
      f.drain();
      invalid = true;
      f.callbacks[0]([f.element]);
      f.drain();
      expect(entries(f)[0].height).toBe(50);
    },
  );
  it("retains valid metrics when a DOM read throws", () => {
    let fail = false;
    const f = fixture({
      measure: () => {
        if (fail) throw new Error("Detached DOM read");
        return { height: 80, width: 100 };
      },
    });
    mount(f);
    f.drain();
    fail = true;
    f.controller.refresh();
    f.drain();
    expect(entries(f)[0].height).toBe(80);
  });
  it("bounds cached cells with LRU eviction while pinning connected owners", () => {
    const f = fixture({ maxCachedCells: 2, maxConnectedCells: 1 });
    mount(f);
    f.drain();
    f.controller.register(null, f.cell, f.token);
    const second = { ...f.cell, rowId: "second", endRowId: "second" },
      secondToken = {};
    f.controller.register({} as HTMLElement, second, secondToken);
    f.drain();
    f.controller.register(null, second, secondToken);
    const third = { ...f.cell, rowId: "third", endRowId: "third" };
    f.controller.register({} as HTMLElement, third, {});
    f.drain();
    expect(entries(f).map((entry) => entry.rowId)).toEqual(["second", "third"]);
  });
  it("rejects excessive connected cells before replacing the valid owner", () => {
    const f = fixture({ maxCachedCells: 2, maxConnectedCells: 1 });
    mount(f);
    f.drain();
    expect(() =>
      f.controller.register(
        {} as HTMLElement,
        { ...f.cell, rowId: "other", endRowId: "other" },
        {},
      ),
    ).toThrow(/connected cell limit/);
    f.controller.refresh();
    f.drain();
    expect(entries(f)).toHaveLength(1);
  });
  it("invalidates an old epoch without retaining callbacks or obsolete metrics", () => {
    const f = fixture();
    mount(f);
    f.drain();
    const next = {};
    f.controller.commitEpoch(next);
    f.drain();
    expect(entries(f)).toEqual([]);
    expect(entries(f, next)).toEqual([]);
    f.controller.register(f.element, { ...f.cell, epoch: next }, {});
    f.drain();
    expect(entries(f, next)).toHaveLength(1);
    expect(entries(f)).toEqual([]);
  });
  it("clears and remeasures explicitly and releases listeners independently", () => {
    const f = fixture(),
      listener = vi.fn(),
      stop = f.controller.subscribe(listener);
    mount(f);
    f.drain();
    stop();
    f.controller.clear();
    expect(entries(f)).toEqual([]);
    f.drain();
    expect(entries(f)).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("handles synchronous scheduler shims without leaving a phantom pending task", () => {
    const f = fixture({
      schedule: (callback) => {
        callback();
        return () => {};
      },
    });
    mount(f);
    expect(entries(f)).toHaveLength(1);
    const revision = f.controller.getSnapshot();
    f.controller.clear();
    expect(entries(f)).toHaveLength(1);
    expect(f.controller.getSnapshot()).toBeGreaterThan(revision);
  });
  it.each([
    { maxCachedCells: 0 },
    { maxConnectedCells: 8193 },
    { maxCachedCells: 100001 },
    { maxCachedCells: 1, maxConnectedCells: 2 },
  ])("rejects invalid lifecycle bounds %j", (options) =>
    expect(() => new AutoHeightController(options)).toThrow(RangeError),
  );
});
