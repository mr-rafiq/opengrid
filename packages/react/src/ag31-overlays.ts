export type Ag31OverlayKind = "loading" | "noRows" | null;
export interface Ag31OverlaySnapshot {
  readonly kind: Ag31OverlayKind;
  readonly revision: number;
}
export interface Ag31OverlayFlags {
  suppressLoadingOverlay?: boolean | null;
  suppressNoRowsOverlay?: boolean | null;
}
export type Ag31LocaleText = Readonly<Record<string, string>>;
export function assertAg31LocaleText(
  value: unknown,
): asserts value is Ag31LocaleText | null | undefined {
  if (value == null) return;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length > 2048
  )
    throw new TypeError("Source locale text requires a bounded plain record");
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== "string" ||
      key.length > 256 ||
      !("value" in field) ||
      typeof field.value !== "string" ||
      field.value.length > 32768
    )
      throw new TypeError("Source locale text entries must be bounded strings");
  }
}
/** Owns real overlay state without invalidating resident rows or cell projections. */
export function createAg31Overlays(options: {
  rowCount: number;
  initiallyLoading: boolean;
  flags(): Ag31OverlayFlags;
}) {
  const count = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError("A resident overlay needs a nonnegative row count");
  };
  count(options.rowCount);
  const flags = options.flags();
  let alive = true;
  let snapshot: Ag31OverlaySnapshot = Object.freeze({
    kind: options.initiallyLoading
      ? flags.suppressLoadingOverlay
        ? null
        : "loading"
      : options.rowCount === 0 && !flags.suppressNoRowsOverlay
        ? "noRows"
        : null,
    revision: 0,
  });
  const listeners = new Set<() => void>();
  function change(kind: Ag31OverlayKind, force = false) {
    if (!alive || (!force && snapshot.kind === kind)) return;
    if (snapshot.revision === Number.MAX_SAFE_INTEGER)
      throw new RangeError("Source overlay revision limit reached");
    snapshot = Object.freeze({ kind, revision: snapshot.revision + 1 });
    for (const listener of [...listeners]) listener();
  }
  const service = Object.freeze({ isAlive: () => alive });
  return Object.freeze({
    service,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (alive) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    showLoading() {
      if (!options.flags().suppressLoadingOverlay) change("loading");
    },
    showNoRows() {
      if (!options.flags().suppressNoRowsOverlay) change("noRows");
    },
    hide() {
      change(null);
    },
    dataUpdated(rowCount: number) {
      count(rowCount);
      change(
        rowCount === 0 && !options.flags().suppressNoRowsOverlay
          ? "noRows"
          : null,
      );
    },
    invalidate() {
      change(snapshot.kind, true);
    },
    destroy() {
      if (!alive) return;
      alive = false;
      snapshot = Object.freeze({ kind: null, revision: snapshot.revision });
      listeners.clear();
    },
  });
}
