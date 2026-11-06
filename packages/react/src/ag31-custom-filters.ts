import type { ComponentType } from "react";
import type { Ag31LeafColumn } from "./ag31-leaf-columns.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
import { createAg31ReactiveFilter } from "./ag31-reactive-filter.js";

export interface Ag31CustomFilterPassParams<T> {
  node: Ag31RowNode<T>;
  data: T | undefined;
}
export interface Ag31CustomFilterEntry<T> {
  readonly column: Ag31LeafColumn<T>;
  readonly component: ComponentType<any>;
  readonly filter: ReturnType<
    typeof createAg31ReactiveFilter<Ag31CustomFilterPassParams<T>>
  >;
}
export interface Ag31CustomFilterHostState<T> {
  readonly entries: readonly Ag31CustomFilterEntry<T>[];
  readonly open: Ag31CustomFilterEntry<T> | null;
  readonly anchor: HTMLElement | null;
}
export function isAg31CustomFilter(value: unknown) {
  return (
    typeof value === "function" ||
    (value !== null && typeof value === "object") ||
    (typeof value === "string" &&
      ![
        "agSetColumnFilter",
        "agTextColumnFilter",
        "agNumberColumnFilter",
        "agDateColumnFilter",
        "agMultiColumnFilter",
      ].includes(value))
  );
}

/** A resident owner requests retained filter components through one committed
 * host. Detaching that host revokes pending render acknowledgements. */
export function createAg31CustomFilters<T>(options: {
  getColumn(key: unknown): Ag31LeafColumn<T> | null;
  onModelChange(column: Ag31LeafColumn<T>): void;
}) {
  let snapshot: Ag31CustomFilterHostState<T> = Object.freeze({
    entries: Object.freeze([]),
    open: null,
    anchor: null,
  });
  let destroyed = false;
  let host:
    { token: symbol; resolve(column: Ag31LeafColumn<T>): unknown } | undefined;
  const entries = new Map<string, Ag31CustomFilterEntry<T>>(),
    listeners = new Set<() => void>();
  function publish(open = snapshot.open, anchor = snapshot.anchor) {
    snapshot = Object.freeze({
      entries: Object.freeze([...entries.values()]),
      open,
      anchor,
    });
    for (const listener of [...listeners]) listener();
  }
  function validate(key: unknown) {
    if (destroyed) return;
    const column = options.getColumn(key);
    if (!column || !isAg31CustomFilter(column.getColDef().filter)) return;
    const current = entries.get(column.colId);
    if (current) return { column, component: current.component };
    if (!host)
      throw new TypeError(
        "Custom source filter components require their registered hook adapter",
      );
    const Component = host.resolve(column);
    if (
      typeof Component !== "function" &&
      !(
        Component !== null &&
        typeof Component === "object" &&
        "$$typeof" in Component
      )
    )
      throw new TypeError(
        "A custom source filter requires a registered reactive React component",
      );
    if (
      typeof Component === "function" &&
      Component.prototype?.isReactComponent
    )
      throw new TypeError(
        "Legacy class filters require their separate imperative component adapter",
      );
    return { column, component: Component as ComponentType<any> };
  }
  function ensure(key: unknown): Ag31CustomFilterEntry<T> | undefined {
    const resolved = validate(key);
    if (!resolved) return;
    const { column, component } = resolved;
    const current = entries.get(column.colId);
    if (current) return current;
    const entry: Ag31CustomFilterEntry<T> = Object.freeze({
      column,
      component,
      filter: createAg31ReactiveFilter<Ag31CustomFilterPassParams<T>>(() => {
        if (!destroyed && entries.get(column.colId) === entry)
          options.onModelChange(column);
      }),
    });
    entries.set(column.colId, entry);
    publish();
    return entry;
  }
  function clear() {
    const retired = [...entries.values()];
    entries.clear();
    publish(null, null);
    let failure: unknown;
    for (const entry of retired)
      try {
        entry.filter.destroy();
      } catch (error) {
        failure ??= error;
      }
    if (failure) throw failure;
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      if (!destroyed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attachHost: (resolve: (column: Ag31LeafColumn<T>) => unknown) => {
      if (destroyed) return () => {};
      if (host)
        throw new Error("The source filter owner already has an attached host");
      const token = Symbol("source filter host");
      host = { token, resolve };
      return () => {
        if (host?.token === token) {
          host = undefined;
          clear();
        }
      };
    },
    ensure,
    validate,
    get: (key: unknown) => {
      const column = options.getColumn(key);
      return column ? entries.get(column.colId) : undefined;
    },
    show: (key: unknown, anchor: HTMLElement | null = null) => {
      const entry = ensure(key);
      if (entry) publish(entry, anchor);
      return entry;
    },
    hide: () => {
      if (!destroyed && snapshot.open) publish(null, null);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      host = undefined;
      try {
        clear();
      } finally {
        listeners.clear();
      }
    },
    isDestroyed: () => destroyed,
  });
}
