import { AUTO_ROW_HEIGHT_LIMITS } from "./auto-row-heights.js";

export interface AutoHeightCell {
  readonly kind?: "cell" | "detail";
  readonly epoch: object;
  readonly rowId: string;
  readonly columnId: string;
  readonly endRowId: string;
  readonly rowCount: number;
  readonly data: unknown;
  readonly isCurrent: () => boolean;
}
export interface AutoHeightMeasurement extends Omit<
  AutoHeightCell,
  "isCurrent"
> {
  readonly height: number;
  readonly width: number;
}
interface Observer {
  observe(element: HTMLElement): void;
  unobserve(element: HTMLElement): void;
  disconnect(): void;
}
interface Registration {
  readonly element: HTMLElement;
  readonly token: object;
  readonly cell: AutoHeightCell;
}
export interface AutoHeightControllerOptions {
  maxCachedCells?: number;
  maxConnectedCells?: number;
  measure?: (element: HTMLElement) => { height: number; width: number };
  schedule?: (callback: () => void) => () => void;
  createObserver?: (
    callback: (elements: readonly HTMLElement[]) => void,
  ) => Observer | undefined;
}
function defaultMeasure(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const parent = element.parentElement;
  const style = parent ? getComputedStyle(parent) : undefined;
  const number = (text: string | undefined) =>
    Number.parseFloat(text ?? "") || 0;
  const padding =
    number(style?.paddingTop) +
    number(style?.paddingBottom) +
    number(style?.borderTopWidth) +
    number(style?.borderBottomWidth);
  return {
    width: rect.width,
    height: Math.ceil(Math.max(element.scrollHeight, rect.height) + padding),
  };
}
function defaultSchedule(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(id);
  }
  const timer = setTimeout(callback, 0);
  return () => clearTimeout(timer);
}
function defaultObserver(
  callback: (elements: readonly HTMLElement[]) => void,
): Observer | undefined {
  if (typeof ResizeObserver === "undefined") return;
  return new ResizeObserver((entries) =>
    callback(entries.map((entry) => entry.target as HTMLElement)),
  );
}
const keyOf = (cell: Pick<AutoHeightCell, "kind" | "rowId" | "columnId">) =>
  JSON.stringify([cell.kind ?? "cell", cell.rowId, cell.columnId]);

/** Private committed-DOM measurement owner. Construction has no browser side effects. */
export class AutoHeightController {
  private readonly maxCachedCells: number;
  private readonly maxConnectedCells: number;
  private readonly measure: (element: HTMLElement) => {
    height: number;
    width: number;
  };
  private readonly schedule: (callback: () => void) => () => void;
  private readonly createObserver: (
    callback: (elements: readonly HTMLElement[]) => void,
  ) => Observer | undefined;
  private readonly active = new Map<string, Registration>();
  private readonly byElement = new Map<HTMLElement, string>();
  private readonly cache = new Map<string, AutoHeightMeasurement>();
  private readonly dirty = new Set<HTMLElement>();
  private readonly listeners = new Set<() => void>();
  private epoch: object | undefined;
  private observer: Observer | undefined;
  private connected = false;
  private connection = 0;
  private scheduled: object | undefined;
  private cancel: (() => void) | undefined;
  private flushing = false;
  private revision = 0;
  constructor(options: AutoHeightControllerOptions = {}) {
    this.maxCachedCells = options.maxCachedCells ?? 10_000;
    this.maxConnectedCells = options.maxConnectedCells ?? 2_048;
    if (
      !Number.isSafeInteger(this.maxCachedCells) ||
      this.maxCachedCells < 1 ||
      this.maxCachedCells > AUTO_ROW_HEIGHT_LIMITS.maxCachedCells ||
      !Number.isSafeInteger(this.maxConnectedCells) ||
      this.maxConnectedCells < 1 ||
      this.maxConnectedCells > AUTO_ROW_HEIGHT_LIMITS.maxConnectedCells ||
      this.maxConnectedCells > this.maxCachedCells
    )
      throw new RangeError("Invalid automatic height cache/observer bounds");
    this.measure = options.measure ?? defaultMeasure;
    this.schedule = options.schedule ?? defaultSchedule;
    this.createObserver = options.createObserver ?? defaultObserver;
  }
  getSnapshot = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.revision++;
    for (const listener of [...this.listeners]) listener();
  }
  commitEpoch(epoch: object): void {
    if (this.epoch === epoch) return;
    this.epoch = epoch;
    const changed = this.cache.size > 0;
    this.cache.clear();
    if (changed) this.changed();
    this.refresh();
  }
  *measurements(epoch: object): IterableIterator<AutoHeightMeasurement> {
    if (this.epoch !== epoch) return;
    yield* this.cache.values();
  }
  register(
    element: HTMLElement | null,
    cell: AutoHeightCell,
    token: object,
  ): void {
    const key = keyOf(cell),
      previous = this.active.get(key);
    if (!element) {
      if (previous?.token === token) this.remove(key, previous);
      return;
    }
    if (
      (cell.kind !== undefined &&
        cell.kind !== "cell" &&
        cell.kind !== "detail") ||
      typeof cell.rowId !== "string" ||
      !cell.rowId ||
      typeof cell.columnId !== "string" ||
      !cell.columnId ||
      typeof cell.endRowId !== "string" ||
      !cell.endRowId ||
      !Number.isSafeInteger(cell.rowCount) ||
      cell.rowCount < 1 ||
      cell.rowCount > AUTO_ROW_HEIGHT_LIMITS.maxRows ||
      typeof cell.isCurrent !== "function"
    )
      throw new TypeError("Invalid automatic height cell registration");
    const other = this.byElement.get(element);
    const additions = previous || other !== undefined ? 0 : 1;
    if (this.active.size + additions > this.maxConnectedCells)
      throw new RangeError("Automatic height exceeds the connected cell limit");
    if (previous) this.remove(key, previous);
    if (other !== undefined) {
      const registration = this.active.get(other);
      if (registration) this.remove(other, registration);
    }
    const registration = { element, cell: { ...cell }, token };
    this.active.set(key, registration);
    this.byElement.set(element, key);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
    }
    if (this.connected) this.observer?.observe(element);
    this.dirty.add(element);
    this.request();
  }
  private remove(key: string, registration: Registration) {
    if (this.active.get(key) !== registration) return;
    this.active.delete(key);
    this.byElement.delete(registration.element);
    this.dirty.delete(registration.element);
    this.observer?.unobserve(registration.element);
  }
  connect(): () => void {
    this.disconnect();
    this.connected = true;
    const connection = this.connection;
    this.observer = this.createObserver((elements) => {
      if (!this.connected || this.connection !== connection) return;
      for (const element of elements)
        if (this.byElement.has(element)) this.dirty.add(element);
      this.request();
    });
    for (const registration of this.active.values())
      this.observer?.observe(registration.element);
    if (typeof window !== "undefined")
      window.addEventListener("resize", this.refresh);
    this.refresh();
    return () => {
      if (this.connection === connection) this.disconnect();
    };
  }
  disconnect(): void {
    this.connection++;
    this.connected = false;
    this.observer?.disconnect();
    this.observer = undefined;
    this.scheduled = undefined;
    this.cancel?.();
    this.cancel = undefined;
    this.dirty.clear();
    if (typeof window !== "undefined")
      window.removeEventListener("resize", this.refresh);
  }
  refresh = (): void => {
    for (const registration of this.active.values())
      this.dirty.add(registration.element);
    this.request();
  };
  clear = (): void => {
    if (this.cache.size) {
      this.cache.clear();
      this.changed();
    }
    this.refresh();
  };
  private request() {
    if (!this.connected || this.flushing || this.scheduled || !this.dirty.size)
      return;
    const token = {};
    this.scheduled = token;
    const cancel = this.schedule(() => {
      if (this.scheduled !== token) return;
      this.scheduled = undefined;
      this.cancel = undefined;
      this.flush();
    });
    if (this.scheduled === token) this.cancel = cancel;
    else cancel();
  }
  private owned(
    key: string,
    registration: Registration,
    connection: number,
    epoch: object | undefined,
  ) {
    if (
      !this.connected ||
      this.connection !== connection ||
      this.epoch !== epoch ||
      registration.cell.epoch !== epoch ||
      this.active.get(key) !== registration
    )
      return false;
    let current = false;
    try {
      current = registration.cell.isCurrent();
    } catch {
      return false;
    }
    return (
      current &&
      this.connected &&
      this.connection === connection &&
      this.epoch === epoch &&
      this.active.get(key) === registration
    );
  }
  private flush() {
    if (!this.connected || this.flushing) return;
    this.flushing = true;
    const connection = this.connection,
      epoch = this.epoch,
      elements = [...this.dirty];
    this.dirty.clear();
    let changed = false;
    try {
      for (const element of elements) {
        const key = this.byElement.get(element),
          registration = key === undefined ? undefined : this.active.get(key);
        if (
          key === undefined ||
          !registration ||
          !this.owned(key, registration, connection, epoch)
        )
          continue;
        let metric: { height: number; width: number };
        try {
          metric = this.measure(element);
        } catch {
          continue;
        }
        if (
          !this.owned(key, registration, connection, epoch) ||
          !Number.isFinite(metric.height) ||
          metric.height < 0 ||
          metric.height > AUTO_ROW_HEIGHT_LIMITS.maxMeasuredHeight ||
          !Number.isFinite(metric.width) ||
          metric.width <= 0 ||
          metric.width > Number.MAX_SAFE_INTEGER
        )
          continue;
        const height = Math.ceil(metric.height),
          width = metric.width,
          old = this.cache.get(key),
          cell = registration.cell;
        if (
          old &&
          old.height === height &&
          old.width === width &&
          old.data === cell.data &&
          old.endRowId === cell.endRowId &&
          old.rowCount === cell.rowCount
        )
          continue;
        this.cache.delete(key);
        this.cache.set(
          key,
          Object.freeze({
            kind: cell.kind ?? "cell",
            epoch: cell.epoch,
            rowId: cell.rowId,
            columnId: cell.columnId,
            endRowId: cell.endRowId,
            rowCount: cell.rowCount,
            data: cell.data,
            height,
            width,
          }),
        );
        changed = true;
      }
      for (const key of this.cache.keys()) {
        if (this.cache.size <= this.maxCachedCells) break;
        if (!this.active.has(key)) {
          this.cache.delete(key);
          changed = true;
        }
      }
      if (this.cache.size > this.maxCachedCells)
        throw new Error("Automatic height cache pin invariant");
      if (
        changed &&
        this.connected &&
        this.connection === connection &&
        this.epoch === epoch
      )
        this.changed();
    } finally {
      this.flushing = false;
      this.request();
    }
  }
}
