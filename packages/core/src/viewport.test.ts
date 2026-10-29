import { describe, expect, it, vi } from "vitest";
import {
  LiveViewportRowModel,
  type ViewportRequest,
  type ViewportRow,
} from "./viewport.js";
type Item = { price: number };
const row = (index: number, price = index): ViewportRow<Item> => ({
  index,
  id: String(index),
  data: { price },
});
function fixture(options: { buffer?: number; maxWindowSize?: number } = {}) {
  const requests: ViewportRequest<Item>[] = [];
  const cleanups: ReturnType<typeof vi.fn>[] = [];
  const subscribe = vi.fn((request: ViewportRequest<Item>) => {
    requests.push(request);
    const cleanup = vi.fn();
    cleanups.push(cleanup);
    return cleanup;
  });
  return {
    model: new LiveViewportRowModel<Item>({ subscribe }, options),
    requests,
    cleanups,
    subscribe,
  };
}

describe("live viewport row model", () => {
  it("keeps loading until rows arrive rather than treating count metadata as row data", () => {
    const { model, requests } = fixture({ buffer: 0 });
    model.setViewport(0, 3);
    requests[0].onRowCount(100);
    expect(model.getSnapshot().loading).toBe(true);
    requests[0].onRows([row(0)]);
    expect(model.getSnapshot().loading).toBe(false);
  });
  it("subscribes to a buffered absolute window and accepts live server pushes", () => {
    const { model, requests } = fixture({ buffer: 2 });
    model.setViewport(10, 20);
    expect(requests[0]).toMatchObject({
      startRow: 8,
      endRow: 22,
      sorting: [],
      filters: {},
    });
    expect(model.getSnapshot().loading).toBe(true);
    requests[0].onRows([row(10), row(11)]);
    expect(model.getSnapshot().rows).toEqual([row(10), row(11)]);
    requests[0].onRows([row(10, 99)]);
    expect(model.getSnapshot().rows[0].data.price).toBe(99);
    expect(model.getSnapshot().loading).toBe(false);
  });
  it("forwards sort/filter query and replaces subscriptions without client sorting", () => {
    const { model, requests, cleanups } = fixture({ buffer: 0 });
    model.setViewport(0, 5);
    requests[0].onRows([row(0)]);
    const sorting = [{ columnId: "price", direction: "desc" as const }];
    model.setQuery({ sorting, filters: { price: { op: "gte", value: 20 } } });
    sorting[0].columnId = "mutated";
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(requests[0].signal.aborted).toBe(true);
    expect(model.getSnapshot().rows).toEqual([]);
    expect(model.getSnapshot().rowCount).toBeNull();
    expect(requests[1]).toMatchObject({
      sorting: [{ columnId: "price", direction: "desc" }],
      filters: { price: { op: "gte", value: 20 } },
    });
    requests[0].onRows([row(0, 999)]);
    expect(model.getSnapshot().rows).toEqual([]);
  });
  it("retains only overlapping cached rows when the viewport moves and drops late callbacks", () => {
    const { model, requests, cleanups } = fixture({ buffer: 1 });
    model.setViewport(2, 5);
    requests[0].onRows([row(1), row(2), row(3), row(4), row(5)]);
    model.setViewport(4, 7);
    expect(model.getSnapshot().rows.map((r) => r.index)).toEqual([3, 4, 5]);
    expect(requests[1]).toMatchObject({ startRow: 3, endRow: 8 });
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    requests[0].onError(new Error("stale"));
    requests[0].onRowCount(0);
    expect(model.getSnapshot().error).toBeNull();
    expect(model.getSnapshot().rowCount).toBeNull();
  });
  it("validates row pushes atomically and rejects out-of-window/duplicate IDs", () => {
    const { model, requests } = fixture({ buffer: 0 });
    model.setViewport(0, 4);
    requests[0].onRows([row(0)]);
    requests[0].onRows([row(1), row(4)]);
    expect(model.getSnapshot().rows).toEqual([row(0)]);
    expect(model.getSnapshot().error).toContain("Invalid viewport row");
    requests[0].onRows([{ ...row(1), id: "0" }]);
    expect(model.getSnapshot().error).toContain("IDs must be unique");
    requests[0].onRows([row(1), row(1)]);
    expect(model.getSnapshot().rows).toEqual([row(0)]);
    requests[0].onRows([row(1)]);
    expect(model.getSnapshot().error).toBeNull();
    expect(model.getSnapshot().rows).toEqual([row(0), row(1)]);
  });
  it("supports complete sparse-window replacements", () => {
    const { model, requests } = fixture({ buffer: 0 });
    model.setViewport(0, 5);
    requests[0].onRows([row(0), row(1)]);
    requests[0].onRows([row(3)], true);
    expect(model.getSnapshot().rows).toEqual([row(3)]);
    requests[0].onRows([], true);
    expect(model.getSnapshot().rows).toEqual([]);
  });
  it("shrinks row count, evicts stale rows and resubscribes to the bounded window", async () => {
    const { model, requests, cleanups } = fixture({ buffer: 0 });
    model.setViewport(0, 10);
    requests[0].onRows([row(0), row(8)]);
    requests[0].onRowCount(5);
    expect(model.getSnapshot().rows).toEqual([row(0)]);
    await Promise.resolve();
    expect(requests[1]).toMatchObject({ startRow: 0, endRow: 5 });
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    requests[1].onRows([row(6)]);
    expect(model.getSnapshot().error).toContain("Invalid");
  });
  it("keeps a count subscription on empty datasets and resumes when the server count grows", async () => {
    const { model, requests } = fixture({ buffer: 0 });
    model.setViewport(0, 5);
    requests[0].onRowCount(0);
    await Promise.resolve();
    expect(requests[1]).toMatchObject({ startRow: 0, endRow: 0 });
    requests[1].onRowCount(3);
    await Promise.resolve();
    expect(requests[2]).toMatchObject({ startRow: 0, endRow: 3 });
    requests[2].onRows([row(0), row(1), row(2)]);
    expect(model.getSnapshot().rows).toHaveLength(3);
  });
  it("retries a failed subscription and ignores callbacks from the failed generation", () => {
    const { model, requests, cleanups } = fixture({ buffer: 0 });
    model.setViewport(0, 2);
    requests[0].onError(new Error("offline"));
    expect(model.getSnapshot().error).toBe("offline");
    model.retry();
    expect(model.getSnapshot().error).toBeNull();
    expect(model.getSnapshot().loading).toBe(true);
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    requests[0].onRows([row(0, 999)]);
    requests[1].onRows([row(0, 3)]);
    expect(model.getSnapshot().rows).toEqual([row(0, 3)]);
  });
  it("handles synchronous provider failure and malformed async cleanup", async () => {
    const model = new LiveViewportRowModel<Item>({
      subscribe: () => {
        throw new Error("connection refused");
      },
    });
    model.setViewport(0, 3);
    expect(model.getSnapshot().error).toBe("connection refused");
    const invalid = new LiveViewportRowModel<Item>({
      subscribe: () => Promise.resolve(undefined as unknown as () => void),
    });
    invalid.setViewport(0, 3);
    await Promise.resolve();
    await Promise.resolve();
    expect(invalid.getSnapshot().error).toContain("cleanup");
  });
  it("cleans up delayed async subscriptions exactly once after they are superseded", async () => {
    let finish!: (cleanup: () => void) => void;
    const cleanup = vi.fn();
    const model = new LiveViewportRowModel<Item>(
      {
        subscribe: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
      { buffer: 0 },
    );
    model.setViewport(0, 3);
    const oldFinish = finish;
    model.setViewport(5, 8);
    oldFinish(cleanup);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
    model.dispose();
  });
  it("disposes active streams and makes late events inert", () => {
    const { model, requests, cleanups } = fixture();
    model.setViewport(0, 3);
    const listener = vi.fn();
    model.subscribe(listener);
    model.dispose();
    expect(requests[0].signal.aborted).toBe(true);
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    const snapshot = model.getSnapshot();
    requests[0].onRows([row(0)]);
    requests[0].onError("late");
    expect(model.getSnapshot()).toBe(snapshot);
    expect(snapshot.disposed).toBe(true);
    expect(() => model.retry()).toThrow("disposed");
    model.dispose();
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
  });
  it("returns stable detached frozen snapshots and notifies subscribers", () => {
    const { model, requests } = fixture({ buffer: 0 });
    const initial = model.getSnapshot();
    expect(model.getSnapshot()).toBe(initial);
    const listener = vi.fn();
    const unsubscribe = model.subscribe(listener);
    model.setViewport(0, 2);
    const update = row(0, 2);
    requests[0].onRows([update]);
    const snapshot = model.getSnapshot();
    update.data.price = 999;
    expect(snapshot.rows[0].data.price).toBe(2);
    expect(Object.isFrozen(snapshot.rows[0].data)).toBe(true);
    expect(() => {
      (snapshot.rows as unknown[]).push({});
    }).toThrow();
    expect(model.getSnapshot()).toBe(snapshot);
    unsubscribe();
    const count = listener.mock.calls.length;
    requests[0].onRows([row(1)]);
    expect(listener).toHaveBeenCalledTimes(count);
  });
  it("rejects oversized/invalid requests and leaves the current stream intact", () => {
    expect(() => fixture({ buffer: -1 })).toThrow();
    const { model, requests, cleanups } = fixture({
      buffer: 1,
      maxWindowSize: 10,
    });
    model.setViewport(0, 5);
    const snapshot = model.getSnapshot();
    expect(() => model.setViewport(0, 20)).toThrow("oversized");
    expect(model.getSnapshot()).toBe(snapshot);
    expect(cleanups[0]).not.toHaveBeenCalled();
    model.setViewport(0, 5);
    expect(requests).toHaveLength(1);
    expect(() =>
      model.setQuery({ sorting: [{ columnId: "", direction: "asc" }] }),
    ).toThrow();
    expect(model.getSnapshot()).toBe(snapshot);
  });
  it("does not subscribe for an explicitly empty visible viewport and rejects invalid counts", () => {
    const { model, requests, subscribe } = fixture();
    model.setViewport(2, 2);
    expect(subscribe).not.toHaveBeenCalled();
    model.setViewport(2, 5);
    requests[0].onRowCount(-1);
    expect(model.getSnapshot().error).toContain("rowCount");
    expect(model.getSnapshot().rowCount).toBeNull();
  });
});
