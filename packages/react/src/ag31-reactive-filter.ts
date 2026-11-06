import {
  normalizeAg31CustomFilterModel,
  type Ag31CustomFilterValue,
} from "./ag31-custom-filter-model.js";

export interface Ag31ReactiveFilterCallbacks<P> {
  doesFilterPass(params: P): boolean;
  afterGuiAttached?(params: {
    hidePopup(): void;
    suppressFocus: boolean;
  }): void;
  afterGuiDetached?(): void;
}
export interface Ag31ReactiveFilterSnapshot {
  readonly revision: number;
  readonly model: Ag31CustomFilterValue;
}

/** One retained reactive filter. Model acknowledgements belong to a committed
 * React render, not a timer or the component's optional getModel hook. */
export function createAg31ReactiveFilter<P>(onModelChange: () => void) {
  let snapshot: Ag31ReactiveFilterSnapshot = { revision: 0, model: null };
  let callbacks: Ag31ReactiveFilterCallbacks<P> | undefined;
  let destroyed = false,
    committedRevision = -1,
    attached = false;
  const listeners = new Set<() => void>();
  const waiting = new Map<number, Set<(active: boolean) => void>>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const waitFor = (revision: number) =>
    destroyed
      ? Promise.resolve(false)
      : committedRevision >= revision
        ? Promise.resolve(true)
        : new Promise<boolean>((resolve) => {
            let entries = waiting.get(revision);
            if (!entries) waiting.set(revision, (entries = new Set()));
            entries.add(resolve);
          });
  function freezeModel(value: Ag31CustomFilterValue): Ag31CustomFilterValue {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freezeModel(child);
      Object.freeze(value);
    }
    return value;
  }
  function stage(input: unknown): Promise<boolean> {
    if (destroyed) return Promise.resolve(false);
    const model = freezeModel(normalizeAg31CustomFilterModel(input));
    snapshot = Object.freeze({ revision: snapshot.revision + 1, model });
    const pending = waitFor(snapshot.revision);
    notify();
    return pending;
  }
  function register(value: Ag31ReactiveFilterCallbacks<P>) {
    if (destroyed) return () => {};
    if (!value || typeof value.doesFilterPass !== "function")
      throw new TypeError(
        "A reactive source filter must register doesFilterPass",
      );
    for (const key of ["afterGuiAttached", "afterGuiDetached"] as const)
      if (value[key] != null && typeof value[key] !== "function")
        throw new TypeError(
          "Reactive source filter callbacks must be functions",
        );
    for (const key of [
      "onNewRowsLoaded",
      "onAnyFilterChanged",
      "getModelAsString",
    ])
      if ((value as unknown as Record<string, unknown>)[key] != null)
        throw new TypeError(
          `Source filter hook ${key} requires its separate lifecycle adapter`,
        );
    callbacks = value;
    return () => {
      if (callbacks === value) callbacks = undefined;
    };
  }
  function commit(revision: number) {
    if (destroyed || revision !== snapshot.revision) return;
    if (!callbacks) {
      destroy();
      throw new TypeError(
        "A reactive source filter must register useGridFilter before its render commits",
      );
    }
    committedRevision = revision;
    for (const [key, resolvers] of waiting)
      if (key <= revision) {
        waiting.delete(key);
        for (const resolve of resolvers) resolve(true);
      }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    try {
      if (attached) callbacks?.afterGuiDetached?.();
    } finally {
      attached = false;
      callbacks = undefined;
      listeners.clear();
      for (const resolvers of waiting.values())
        for (const resolve of resolvers) resolve(false);
      waiting.clear();
    }
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    getModel: () =>
      destroyed ? null : normalizeAg31CustomFilterModel(snapshot.model),
    subscribe: (listener: () => void) => {
      if (!destroyed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stage,
    register,
    commit,
    whenReady: () => waitFor(snapshot.revision),
    changeModel: async (input: unknown) => {
      if (await stage(input)) onModelChange();
    },
    isFilterActive: () => !destroyed && snapshot.model !== null,
    doesFilterPass: (params: P) =>
      !destroyed &&
      (snapshot.model === null || (callbacks?.doesFilterPass(params) ?? false)),
    attach: (params: { hidePopup(): void; suppressFocus: boolean }) => {
      if (!destroyed && !attached) {
        attached = true;
        callbacks?.afterGuiAttached?.(params);
      }
    },
    detach: () => {
      if (attached) {
        attached = false;
        callbacks?.afterGuiDetached?.();
      }
    },
    destroy,
    isDestroyed: () => destroyed,
  });
}
