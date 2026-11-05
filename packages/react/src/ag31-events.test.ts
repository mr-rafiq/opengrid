import { afterEach, describe, expect, it, vi } from "vitest";
import { createAg31EventHub, type Ag31Event } from "./ag31-events.js";
afterEach(() => vi.useRealTimers());
describe("AG 31 asynchronous event boundary", () => {
  it("delivers current grid-option callbacks after captured API listeners, including handlers installed after dispatch", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    let current: ((event: Ag31Event) => void) | undefined;
    const hub = createAg31EventHub(
      () => ({ api: {} }),
      (event) => current?.(event),
    );
    hub.addEventListener("selectionChanged", () => calls.push("api"));
    current = () => calls.push("old");
    hub.dispatchEvent({ type: "selectionChanged" });
    calls.push("after-call");
    current = () => calls.push("new");
    vi.runOnlyPendingTimers();
    expect(calls).toEqual(["after-call", "api", "new"]);
    calls.length = 0;
    current = undefined;
    hub.dispatchEvent({ type: "selectionChanged" });
    current = () => calls.push("installed-later");
    vi.runOnlyPendingTimers();
    expect(calls).toEqual(["api", "installed-later"]);
    calls.length = 0;
    hub.dispatchEvent({ type: "selectionChanged" });
    hub.destroy();
    vi.runOnlyPendingTimers();
    expect(calls).toEqual([]);
  });
  it("delivers after the microtask phase with stable API and dispatch context", async () => {
    vi.useFakeTimers();
    const api = {},
      columnApi = {},
      context = { name: "first" },
      listener = vi.fn();
    const hub = createAg31EventHub(() => ({ api, columnApi, context }));
    hub.addEventListener("sortChanged", listener);
    const event: Ag31Event = { type: "sortChanged", source: "api" };
    hub.dispatchEvent(event);
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(listener).toHaveBeenCalledExactlyOnceWith(event);
    expect(event).toMatchObject({ api, columnApi, context });
  });
  it("matches installed 31.3.4 dispatch-time membership after removal and late registration", () => {
    vi.useFakeTimers();
    const calls: string[] = [],
      hub = createAg31EventHub(() => ({ api: {} }));
    const stable = () => calls.push("stable"),
      removed = () => calls.push("removed"),
      late = () => calls.push("late");
    hub.addEventListener("sortChanged", stable);
    hub.addEventListener("sortChanged", removed);
    hub.dispatchEvent({ type: "sortChanged" });
    hub.removeEventListener("sortChanged", removed);
    hub.addEventListener("sortChanged", late);
    vi.runOnlyPendingTimers();
    expect(calls).toEqual(["stable", "removed"]);
    hub.dispatchEvent({ type: "sortChanged" });
    vi.runOnlyPendingTimers();
    expect(calls).toEqual(["stable", "removed", "stable", "late"]);
  });
  it("matches installed event identity and borrowed changes before asynchronous delivery", () => {
    vi.useFakeTimers();
    const api = {},
      hub = createAg31EventHub(() => ({ api })),
      listener = vi.fn();
    hub.addEventListener("sortChanged", listener);
    const event: Ag31Event = { type: "sortChanged", source: "before" };
    hub.dispatchEvent(event);
    expect(event.api).toBe(api);
    event.source = "after";
    vi.runOnlyPendingTimers();
    expect(listener.mock.calls[0][0]).toBe(event);
    expect(listener.mock.calls[0][0].source).toBe("after");
  });
  it("deduplicates listeners, isolates event types and batches one scheduled turn", () => {
    vi.useFakeTimers();
    const hub = createAg31EventHub(() => ({ api: {} })),
      a = vi.fn(),
      b = vi.fn();
    hub.addEventListener("sortChanged", a);
    hub.addEventListener("sortChanged", a);
    hub.addEventListener("modelUpdated", b);
    hub.dispatchEvent({ type: "sortChanged", order: 1 });
    hub.dispatchEvent({ type: "modelUpdated" });
    hub.dispatchEvent({ type: "sortChanged", order: 2 });
    expect(vi.getTimerCount()).toBe(1);
    vi.runOnlyPendingTimers();
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledOnce();
    expect(a.mock.calls.map(([event]) => event.order)).toEqual([1, 2]);
  });
  it("captures common parameters when dispatching rather than when flushing", () => {
    vi.useFakeTimers();
    let context = { name: "old" };
    const api = {},
      hub = createAg31EventHub(() => ({ api, context })),
      listener = vi.fn();
    hub.addEventListener("modelUpdated", listener);
    hub.dispatchEvent({ type: "modelUpdated" });
    context = { name: "new" };
    vi.runOnlyPendingTimers();
    expect(listener.mock.calls[0][0].context).toEqual({ name: "old" });
    hub.dispatchEvent({ type: "modelUpdated" });
    vi.runOnlyPendingTimers();
    expect(listener.mock.calls[1][0].context).toBe(context);
  });
  it("puts reentrant dispatch into the next turn without replaying an event", () => {
    vi.useFakeTimers();
    const hub = createAg31EventHub(() => ({ api: {} })),
      calls: number[] = [];
    hub.addEventListener("modelUpdated", (event) => {
      calls.push(Number(event.step));
      if (event.step === 1)
        hub.dispatchEvent({ type: "modelUpdated", step: 2 });
    });
    hub.dispatchEvent({ type: "modelUpdated", step: 1 });
    vi.advanceTimersToNextTimer();
    expect(calls).toEqual([1]);
    vi.advanceTimersToNextTimer();
    expect(calls).toEqual([1, 2]);
  });
  it("releases pending callbacks and stops touching owner metadata after destruction", () => {
    vi.useFakeTimers();
    const common = vi.fn(() => ({ api: {} })),
      hub = createAg31EventHub(common),
      listener = vi.fn();
    hub.addEventListener("sortChanged", listener);
    hub.dispatchEvent({ type: "sortChanged" });
    hub.destroy();
    hub.destroy();
    hub.addEventListener("sortChanged", listener);
    hub.dispatchEvent({ type: "sortChanged" });
    hub.removeEventListener("sortChanged", listener);
    vi.runOnlyPendingTimers();
    expect(listener).not.toHaveBeenCalled();
    expect(common).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(hub.isDestroyed()).toBe(true);
  });
  it("does not swallow callback exceptions or keep a broken timer ownership flag", () => {
    vi.useFakeTimers();
    const hub = createAg31EventHub(() => ({ api: {} })),
      bad = () => {
        throw new Error("host callback failed");
      },
      good = vi.fn();
    hub.addEventListener("modelUpdated", bad);
    hub.dispatchEvent({ type: "modelUpdated" });
    expect(() => vi.runOnlyPendingTimers()).toThrow("host callback failed");
    hub.removeEventListener("modelUpdated", bad);
    hub.addEventListener("modelUpdated", good);
    hub.dispatchEvent({ type: "modelUpdated" });
    vi.runOnlyPendingTimers();
    expect(good).toHaveBeenCalledOnce();
  });
  it("validates malformed listeners and events before scheduling", () => {
    vi.useFakeTimers();
    const hub = createAg31EventHub(() => ({ api: {} }));
    expect(() => hub.addEventListener("", () => {})).toThrow();
    expect(() => hub.addEventListener("sortChanged", null as never)).toThrow();
    expect(() => hub.dispatchEvent({ type: "" })).toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
