import type { Filter, Sort } from "./types.js";
import { prepareColumnFilters } from "./column-filter-model.js";

export interface ViewportRow<T> {
  index: number;
  id: string;
  data: T;
}
export interface ViewportQuery {
  sorting: Sort[];
  filters: Record<string, Filter>;
}
export interface ViewportRequest<T> extends ViewportQuery {
  startRow: number;
  endRow: number;
  signal: AbortSignal;
  /** Absolute indexes, with an optional complete replacement of this window. */
  onRows(rows: ViewportRow<T>[], replace?: boolean): void;
  onRowCount(count: number): void;
  onError(error: unknown): void;
}
export interface ViewportDataSource<T> {
  subscribe(request: ViewportRequest<T>): (() => void) | Promise<() => void>;
}
export interface ViewportOptions {
  buffer?: number;
  maxWindowSize?: number;
  query?: Partial<ViewportQuery>;
}
export interface ViewportSnapshot<T> {
  revision: number;
  viewport: { startRow: number; endRow: number };
  window: { startRow: number; endRow: number };
  rows: readonly ViewportRow<T>[];
  rowCount: number | null;
  loading: boolean;
  error: string | null;
  disposed: boolean;
}
const validIndex = (value: number) => Number.isSafeInteger(value) && value >= 0;
function frozen<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value &&
    typeof value === "object" &&
    !Object.isFrozen(value) &&
    !seen.has(value)
  ) {
    seen.add(value);
    for (const item of Object.values(value)) frozen(item, seen);
    Object.freeze(value);
  }
  return value;
}

/** Live sparse window, driven by server pushes rather than one-shot block fetches. */
export class LiveViewportRowModel<T> {
  readonly buffer: number;
  readonly maxWindowSize: number;
  private query: ViewportQuery;
  private rows = new Map<number, ViewportRow<T>>();
  private rowCount: number | null = null;
  private viewport = { startRow: 0, endRow: 0 };
  private window = { startRow: 0, endRow: 0 };
  private loading = false;
  private error: string | null = null;
  private disposed = false;
  private generation = 0;
  private revision = 0;
  private controller?: AbortController;
  private cleanup?: () => void;
  private listeners = new Set<() => void>();
  private snapshot: ViewportSnapshot<T> = frozen({
    revision: 0,
    viewport: { startRow: 0, endRow: 0 },
    window: { startRow: 0, endRow: 0 },
    rows: [],
    rowCount: null,
    loading: false,
    error: null,
    disposed: false,
  });
  constructor(
    private source: ViewportDataSource<T>,
    options: ViewportOptions = {},
  ) {
    this.buffer = options.buffer ?? 10;
    this.maxWindowSize = options.maxWindowSize ?? 10000;
    if (
      !validIndex(this.buffer) ||
      !validIndex(this.maxWindowSize) ||
      !this.maxWindowSize
    )
      throw new RangeError("Invalid viewport buffer or maximum window size");
    this.query = this.normalizeQuery({
      sorting: [],
      filters: {},
      ...options.query,
    });
  }
  private alive() {
    if (this.disposed) throw new Error("Viewport model is disposed");
  }
  private normalizeQuery(query: ViewportQuery) {
    const next = structuredClone({
      ...query,
      filters: prepareColumnFilters(query.filters),
    });
    next.filters = prepareColumnFilters(next.filters);
    if (
      !Array.isArray(next.sorting) ||
      next.sorting.some(
        (sort) => !sort.columnId || !["asc", "desc"].includes(sort.direction),
      ) ||
      !next.filters ||
      typeof next.filters !== "object" ||
      Array.isArray(next.filters)
    )
      throw new Error("Invalid viewport query");
    return next;
  }
  private emit() {
    this.snapshot = frozen(
      structuredClone({
        revision: ++this.revision,
        viewport: this.viewport,
        window: this.window,
        rows: [...this.rows.values()].sort((a, b) => a.index - b.index),
        rowCount: this.rowCount,
        loading: this.loading,
        error: this.error,
        disposed: this.disposed,
      }),
    );
    for (const listener of [...this.listeners]) listener();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.alive();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private stop() {
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    }
  }
  private bounds() {
    if (this.viewport.startRow === this.viewport.endRow)
      return {
        startRow: this.viewport.startRow,
        endRow: this.viewport.startRow,
      };
    const count = this.rowCount;
    const startRow =
      count !== null && this.viewport.startRow >= count
        ? count
        : Math.max(0, this.viewport.startRow - this.buffer);
    const endRow = Math.max(
      startRow,
      Math.min(
        count ?? Number.MAX_SAFE_INTEGER,
        this.viewport.endRow + this.buffer,
      ),
    );
    if (!validIndex(endRow) || endRow - startRow > this.maxWindowSize)
      throw new RangeError(
        "Requested buffered viewport exceeds maximum window size",
      );
    return { startRow, endRow };
  }
  private start() {
    this.stop();
    const { startRow, endRow } = this.bounds();
    this.window = { startRow, endRow };
    this.error = null;
    this.rows = new Map(
      [...this.rows].filter(([index]) => index >= startRow && index < endRow),
    );
    if (this.viewport.startRow === this.viewport.endRow) {
      this.loading = false;
      this.emit();
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    const generation = this.generation;
    const active = () =>
      !this.disposed &&
      !controller.signal.aborted &&
      generation === this.generation;
    const fail = (error: unknown) => {
      if (!active()) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.loading = false;
      this.emit();
    };
    this.loading = this.rowCount !== 0;
    this.emit();
    const request: ViewportRequest<T> = {
      ...structuredClone(this.query),
      startRow,
      endRow,
      signal: controller.signal,
      onRows: (updates, replace = false) => {
        if (!active()) return;
        try {
          if (!Array.isArray(updates))
            throw new Error("Viewport rows must be an array");
          const next = replace
              ? new Map<number, ViewportRow<T>>()
              : new Map(this.rows),
            seen = new Set<number>();
          for (const row of updates) {
            if (
              !validIndex(row.index) ||
              row.index < startRow ||
              row.index >= endRow ||
              (this.rowCount !== null && row.index >= this.rowCount) ||
              typeof row.id !== "string" ||
              !row.id ||
              !("data" in row) ||
              seen.has(row.index)
            )
              throw new Error(
                "Invalid viewport row or duplicate absolute index",
              );
            seen.add(row.index);
            next.set(row.index, structuredClone(row));
          }
          const ids = [...next.values()].map((row) => row.id);
          if (new Set(ids).size !== ids.length)
            throw new Error(
              "Viewport row IDs must be unique within the window",
            );
          this.rows = next;
          this.error = null;
          this.loading = false;
          this.emit();
        } catch (error) {
          fail(error);
        }
      },
      onRowCount: (count) => {
        if (!active()) return;
        if (!validIndex(count)) {
          fail(
            new Error("Viewport rowCount must be a nonnegative safe integer"),
          );
          return;
        }
        this.rowCount = count;
        this.rows = new Map([...this.rows].filter(([index]) => index < count));
        this.error = null;
        if (count === 0) this.loading = false;
        this.emit();
        const next = this.bounds();
        if (next.startRow !== startRow || next.endRow !== endRow)
          queueMicrotask(() => {
            if (active()) this.start();
          });
      },
      onError: fail,
    };
    try {
      const returned = this.source.subscribe(request);
      if (typeof returned === "function") {
        if (active()) this.cleanup = returned;
        else returned();
      } else
        Promise.resolve(returned)
          .then((cleanup) => {
            if (typeof cleanup !== "function")
              throw new Error(
                "Viewport subscribe must return a cleanup function",
              );
            if (active()) this.cleanup = cleanup;
            else cleanup();
          })
          .catch(fail);
    } catch (error) {
      fail(error);
    }
  }
  setViewport(startRow: number, endRow: number) {
    this.alive();
    if (
      !validIndex(startRow) ||
      !validIndex(endRow) ||
      endRow < startRow ||
      !validIndex(endRow + this.buffer) ||
      endRow - startRow + this.buffer * 2 > this.maxWindowSize
    )
      throw new RangeError("Invalid or oversized viewport range");
    if (
      startRow === this.viewport.startRow &&
      endRow === this.viewport.endRow &&
      this.controller
    )
      return;
    this.viewport = { startRow, endRow };
    this.start();
  }
  setQuery(query: Partial<ViewportQuery>) {
    this.alive();
    const next = this.normalizeQuery({ ...this.query, ...query });
    this.query = next;
    this.rows.clear();
    this.rowCount = null;
    this.start();
  }
  retry() {
    this.alive();
    this.start();
  }
  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.rows.clear();
    this.loading = false;
    this.emit();
    this.listeners.clear();
  }
}
