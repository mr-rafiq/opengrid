import type { GridState, Pin } from "./types.js";

export type AlignedColumnProperty =
  "order" | "width" | "visibility" | "pinning";
export interface AlignedColumn {
  readonly id: string;
  readonly width?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly hidden?: boolean;
  readonly pinned?: Pin;
}
/** Structural surface accepts grids with different row types and data. */
export interface AlignedColumnModel {
  getState(): GridState;
  setState(patch: Partial<GridState>): void;
  getColumns(): readonly AlignedColumn[];
  getColumnRevision?(): number;
  subscribe(listener: () => void): () => void;
}
export interface AlignedColumnsOptions {
  properties?: readonly AlignedColumnProperty[];
  initialSourceIndex?: number;
}
export interface AlignedColumnsLink {
  readonly sharedColumnIds: readonly string[];
  dispose(): void;
}

const properties: readonly AlignedColumnProperty[] = [
  "order",
  "width",
  "visibility",
  "pinning",
];
const maximumModels = 32,
  maximumPasses = 100;
const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
const sameArray = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  left.every((id, index) => id === right[index]);
interface Snapshot {
  order: string[];
  widths: Map<string, number>;
  visibility: Map<string, boolean>;
  pinning: Map<string, Pin>;
  fingerprint: string;
}
interface View {
  state: GridState;
  columns: Map<string, AlignedColumn>;
}

/** Align the column IDs present in every model. Setup is synchronous; dispose detaches every listener. */
export function createAlignedColumns(
  models: readonly AlignedColumnModel[],
  options: AlignedColumnsOptions = {},
): AlignedColumnsLink {
  if (
    !Array.isArray(models) ||
    models.length < 2 ||
    models.length > maximumModels
  )
    throw new RangeError(`Align between 2 and ${maximumModels} column models`);
  if (new Set(models).size !== models.length)
    throw new Error("Aligned column models must be distinct");
  models = [...models];
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => key !== "properties" && key !== "initialSourceIndex",
    )
  )
    throw new TypeError("Invalid aligned columns options");
  const selected =
    options.properties === undefined ? properties : options.properties;
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((property) => !properties.includes(property))
  )
    throw new TypeError(
      "properties must be a nonempty unique list of aligned column properties",
    );
  const enabled = new Set<AlignedColumnProperty>(selected);
  const initialSourceIndex =
    options.initialSourceIndex === undefined ? 0 : options.initialSourceIndex;
  if (
    !Number.isInteger(initialSourceIndex) ||
    initialSourceIndex < 0 ||
    initialSourceIndex >= models.length
  )
    throw new RangeError("initialSourceIndex is outside the model list");
  for (const model of models)
    if (
      !model ||
      typeof model.getState !== "function" ||
      typeof model.setState !== "function" ||
      typeof model.getColumns !== "function" ||
      typeof model.subscribe !== "function"
    )
      throw new TypeError(
        "Each aligned model must provide getState, setState, getColumns and subscribe",
      );
  function view(index: number): View {
    const state = models[index].getState(),
      descriptors = models[index].getColumns();
    if (
      !state ||
      typeof state !== "object" ||
      !Array.isArray(state.columnOrder) ||
      !descriptors ||
      !Array.isArray(descriptors)
    )
      throw new TypeError("Invalid column model state");
    const columns = new Map<string, AlignedColumn>();
    for (const column of descriptors) {
      if (
        !column ||
        typeof column.id !== "string" ||
        !column.id ||
        columns.has(column.id)
      )
        throw new Error("Aligned column IDs must be nonempty and unique");
      columns.set(column.id, column);
    }
    if (
      state.columnOrder.length !== columns.size ||
      new Set(state.columnOrder).size !== columns.size ||
      state.columnOrder.some((id) => typeof id !== "string" || !columns.has(id))
    )
      throw new Error(
        "Column order must contain each model column exactly once",
      );
    for (const name of [
      "columnWidths",
      "columnVisibility",
      "columnPinning",
    ] as const)
      if (
        !state[name] ||
        typeof state[name] !== "object" ||
        Array.isArray(state[name])
      )
        throw new TypeError(`Invalid ${name} record`);
    return { state, columns };
  }
  const initial = models.map((_, index) => view(index));
  const shared = initial[initialSourceIndex].state.columnOrder.filter((id) =>
    initial.every((model) => model.columns.has(id)),
  );
  if (!shared.length)
    throw new Error("At least one column ID must exist in every aligned model");
  const sharedSet = new Set(shared);
  const limits = new Map<string, { min: number; max: number }>();
  if (enabled.has("width"))
    for (const id of shared) {
      let min = 0,
        max = Infinity;
      for (const model of initial) {
        const column = model.columns.get(id)!,
          low = column.minWidth ?? 40,
          high = column.maxWidth ?? Infinity;
        if (
          !Number.isFinite(low) ||
          low < 0 ||
          typeof high !== "number" ||
          Number.isNaN(high) ||
          high < low
        )
          throw new RangeError(`Invalid width bounds for column ${id}`);
        min = Math.max(min, low);
        max = Math.min(max, high);
      }
      if (min > max)
        throw new RangeError(
          `Aligned width bounds do not overlap for column ${id}`,
        );
      limits.set(id, { min, max });
    }
  function snapshot(current: View): Snapshot {
    const result: Snapshot = {
      order: current.state.columnOrder.filter((id) => sharedSet.has(id)),
      widths: new Map(),
      visibility: new Map(),
      pinning: new Map(),
      fingerprint: "",
    };
    for (const id of shared) {
      const column = current.columns.get(id);
      if (!column)
        throw new Error("Aligned schema changed; recreate the column link");
      if (enabled.has("width")) {
        const width =
          own(current.state.columnWidths, id) ?? column.width ?? 160;
        if (typeof width !== "number" || !Number.isFinite(width) || width < 0)
          throw new RangeError(`Invalid effective width for column ${id}`);
        result.widths.set(id, width);
      }
      if (enabled.has("visibility")) {
        const override = own(current.state.columnVisibility, id);
        if (
          (override !== undefined && typeof override !== "boolean") ||
          (column.hidden !== undefined && typeof column.hidden !== "boolean")
        )
          throw new TypeError(`Invalid visibility for column ${id}`);
        result.visibility.set(
          id,
          override === undefined ? !column.hidden : override,
        );
      }
      if (enabled.has("pinning")) {
        const override = own(current.state.columnPinning, id),
          pin = override === undefined ? (column.pinned ?? null) : override;
        if (pin !== null && pin !== "left" && pin !== "right")
          throw new TypeError(`Invalid pinning for column ${id}`);
        result.pinning.set(id, pin);
      }
    }
    result.fingerprint = JSON.stringify([
      enabled.has("order") ? result.order : [],
      [...result.widths],
      [...result.visibility],
      [...result.pinning],
    ]);
    return result;
  }
  function canonical(source: Snapshot): Snapshot {
    const result: Snapshot = { ...source, widths: new Map(source.widths) };
    for (const [id, width] of result.widths) {
      const limit = limits.get(id)!;
      result.widths.set(id, Math.max(limit.min, Math.min(limit.max, width)));
    }
    result.fingerprint = JSON.stringify([
      enabled.has("order") ? result.order : [],
      [...result.widths],
      [...result.visibility],
      [...result.pinning],
    ]);
    return result;
  }
  const revisions = models.map((model) => model.getColumnRevision?.());
  const initialSnapshots = initial.map(snapshot); // Validate all effective values before registering listeners or writing.
  let active = true,
    ready = false,
    busy = false;
  const unsubscribers: (() => void)[] = [],
    pending: Snapshot[] = [];
  const observed = initialSnapshots.map((value) => value.fingerprint);
  const attempted = new Set<number>();
  function dispose() {
    if (!active) return;
    active = false;
    pending.length = 0;
    const failures: unknown[] = [];
    for (const unsubscribe of unsubscribers.splice(0).reverse())
      try {
        unsubscribe();
      } catch (error) {
        failures.push(error);
      }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Failed to dispose an aligned columns subscription",
      );
  }
  function patch(current: View, wanted: Snapshot): Partial<GridState> {
    const next: Partial<GridState> = {};
    const currentValues = snapshot(current);
    if (enabled.has("order")) {
      let cursor = 0;
      const order = current.state.columnOrder.map((id) =>
        sharedSet.has(id) ? wanted.order[cursor++] : id,
      );
      if (!sameArray(order, current.state.columnOrder))
        next.columnOrder = order;
    }
    for (const [property, stateName, values] of [
      ["width", "columnWidths", wanted.widths],
      ["visibility", "columnVisibility", wanted.visibility],
      ["pinning", "columnPinning", wanted.pinning],
    ] as const) {
      if (!enabled.has(property)) continue;
      const changes: [string, unknown][] = [];
      const existing =
        property === "width"
          ? currentValues.widths
          : property === "visibility"
            ? currentValues.visibility
            : currentValues.pinning;
      for (const [id, value] of values)
        if (existing.get(id) !== value) changes.push([id, value]);
      if (changes.length)
        Object.assign(next, {
          [stateName]: {
            ...current.state[stateName],
            ...Object.fromEntries(changes),
          },
        });
    }
    return next;
  }
  function schemaCurrent() {
    if (
      models.some(
        (model, index) => model.getColumnRevision?.() !== revisions[index],
      )
    ) {
      dispose();
      return false;
    }
    return true;
  }
  function enqueue(source: Snapshot) {
    if (pending.length >= maximumPasses)
      throw new Error(
        "Aligned column notifications exceeded the bounded queue",
      );
    pending.push(source);
  }
  function drain() {
    if (busy || !ready || !active) return;
    busy = true;
    let passes = 0;
    try {
      while (pending.length && active) {
        if (++passes > maximumPasses)
          throw new Error(
            "Aligned columns did not converge within 100 propagation passes",
          );
        const wanted = canonical(pending.shift()!);
        for (let index = 0; index < models.length && active; index++) {
          if (!schemaCurrent()) return;
          const current = view(index),
            changes = patch(current, wanted);
          if (!Object.keys(changes).length) {
            observed[index] = snapshot(current).fingerprint;
            continue;
          }
          observed[index] = wanted.fingerprint;
          attempted.add(index);
          models[index].setState(changes);
          if (!active || !schemaCurrent()) return;
          const actual = snapshot(view(index));
          if (actual.fingerprint !== observed[index]) {
            observed[index] = actual.fingerprint;
            enqueue(actual);
          }
        }
      }
    } catch (error) {
      let cleanup: unknown;
      try {
        dispose();
      } catch (failure) {
        cleanup = failure;
      }
      if (cleanup)
        throw new AggregateError(
          [error, cleanup],
          "Aligned column synchronization failed",
        );
      throw error;
    } finally {
      busy = false;
    }
  }
  function notified(index: number) {
    if (!active || !ready || !schemaCurrent()) return;
    try {
      const current = snapshot(view(index));
      if (current.fingerprint === observed[index]) return;
      observed[index] = current.fingerprint;
      enqueue(current);
      drain();
    } catch (error) {
      if (active)
        try {
          dispose();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Aligned column synchronization failed",
          );
        }
      throw error;
    }
  }
  function rollback(): unknown[] {
    const failures: unknown[] = [];
    for (const index of attempted) {
      try {
        const current = view(index),
          original = initial[index].state,
          changes: Partial<GridState> = {};
        if (enabled.has("order")) {
          const order = original.columnOrder.filter((id) => sharedSet.has(id));
          let cursor = 0;
          changes.columnOrder = current.state.columnOrder.map((id) =>
            sharedSet.has(id) ? order[cursor++] : id,
          );
        }
        for (const [property, stateName] of [
          ["width", "columnWidths"],
          ["visibility", "columnVisibility"],
          ["pinning", "columnPinning"],
        ] as const)
          if (enabled.has(property))
            Object.assign(changes, {
              [stateName]: Object.fromEntries([
                ...Object.entries(current.state[stateName]).filter(
                  ([id]) => !sharedSet.has(id),
                ),
                ...Object.entries(original[stateName]).filter(([id]) =>
                  sharedSet.has(id),
                ),
              ]),
            });
        models[index].setState(changes);
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  }
  try {
    for (let index = 0; index < models.length; index++) {
      const unsubscribe = models[index].subscribe(() => notified(index));
      if (typeof unsubscribe !== "function")
        throw new TypeError(
          "Aligned model subscribe must return an unsubscribe function",
        );
      unsubscribers.push(unsubscribe);
    }
    ready = true;
    enqueue(snapshot(view(initialSourceIndex)));
    drain();
    attempted.clear();
  } catch (error) {
    const failures: unknown[] = [];
    try {
      dispose();
    } catch (cleanup) {
      failures.push(cleanup);
    }
    failures.push(...rollback());
    if (failures.length)
      throw new AggregateError(
        [error, ...failures],
        "Aligned column setup failed and could not fully roll back",
      );
    throw error;
  }
  return Object.freeze({
    sharedColumnIds: Object.freeze([...shared]),
    dispose,
  });
}
