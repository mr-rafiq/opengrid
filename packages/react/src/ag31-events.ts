export interface Ag31Event {
  type: string;
  [key: string]: unknown;
}
export type Ag31EventListener = (event: Ag31Event) => void;
export interface Ag31CommonEventParams {
  api: object;
  columnApi?: object;
  context?: unknown;
}

/** Legacy adapter events retain dispatch-time listener snapshots and run in a later timer turn. */
export function createAg31EventHub(
  commonParams: () => Ag31CommonEventParams,
  afterListeners?: (event: Ag31Event) => void,
) {
  const listeners = new Map<string, Set<Ag31EventListener>>();
  let pending: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  function flush() {
    timer = undefined;
    const batch = pending;
    pending = [];
    for (const callback of batch) {
      if (destroyed) return;
      callback();
    }
  }
  function addEventListener(type: string, listener: Ag31EventListener) {
    if (typeof type !== "string" || !type || typeof listener !== "function")
      throw new TypeError("An event type and listener function are required");
    if (destroyed) return;
    let entries = listeners.get(type);
    if (!entries) listeners.set(type, (entries = new Set()));
    entries.add(listener);
  }
  function removeEventListener(type: string, listener: Ag31EventListener) {
    const entries = listeners.get(type);
    entries?.delete(listener);
    if (entries?.size === 0) listeners.delete(type);
  }
  function dispatchEvent(event: Ag31Event) {
    if (destroyed) return;
    if (!event || typeof event.type !== "string" || !event.type)
      throw new TypeError("An event type is required");
    const common = commonParams();
    for (const key of ["api", "columnApi", "context"] as const)
      Object.defineProperty(event, key, {
        value: common[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    // Removing a listener does not revoke an already queued notification.
    const captured = [...(listeners.get(event.type) ?? [])];
    if (!captured.length && !afterListeners) return;
    for (const listener of captured) pending.push(() => listener(event));
    // Grid-option handlers are global listeners. Their current option is read
    // during delivery, after the dispatch-time API listener snapshot.
    if (afterListeners) pending.push(() => afterListeners(event));
    if (timer === undefined) timer = setTimeout(flush, 0);
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = [];
    listeners.clear();
  }
  return Object.freeze({
    addEventListener,
    removeEventListener,
    dispatchEvent,
    destroy,
    isDestroyed: () => destroyed,
  });
}
