import type { DataRequest, InfiniteOptions } from "./datasource.js";
import type { Filter, Sort } from "./types.js";
import type { ViewportRow, ViewportSnapshot } from "./viewport.js";
import { prepareColumnFilters } from "./column-filter-model.js";

export interface InfiniteQuery {
  sorting: Sort[];
  filters: Record<string, Filter>;
}
export interface InfiniteResponse<T> {
  rows: T[];
  /** Omit for a full block with an unknown total. A short block terminates the result. */
  rowCount?: number | null;
}
export interface InfiniteProvider<T> {
  getRows(request: DataRequest): Promise<InfiniteResponse<T>>;
}
export interface InfiniteRowModelOptions<T> extends InfiniteOptions {
  getRowId: (row: T) => string;
  maxConcurrent?: number;
  buffer?: number;
  maxWindowSize?: number;
  query?: Partial<InfiniteQuery>;
}
export interface InfiniteSnapshot<T> extends ViewportSnapshot<T> {
  queryRevision: number;
  estimatedRowCount: number;
  cachedBlocks: readonly number[];
  pendingBlocks: readonly number[];
  queuedBlocks: readonly number[];
  failedBlocks: readonly { blockIndex: number; message: string }[];
}
export const INFINITE_ROW_LIMITS = Object.freeze({
  maxBlockSize: 10_000,
  maxBlocks: 1_000,
  maxCacheRows: 1_000_000,
  maxConcurrent: 16,
  maxWindowSize: 10_000,
  maxIdLength: 1_024,
  maxErrorLength: 4_096,
});
const indexValue = (value: number) => Number.isSafeInteger(value) && value >= 0;
function message(error: unknown): string {
  try {
    const text = (error instanceof Error ? error.message : String(error)).slice(
      0,
      INFINITE_ROW_LIMITS.maxErrorLength,
    );
    return text.trim() ? text : "Infinite provider request failed";
  } catch {
    return "Infinite provider request failed";
  }
}
function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freeze(child, seen);
    Object.freeze(value);
  }
  return value;
}
interface Task {
  index: number;
  generation: number;
  controller: AbortController;
}

/** Pull-based bounded flat blocks. This model never subscribes to a live push stream. */
export class InfiniteRowModel<T> {
  readonly blockSize: number;
  readonly maxBlocks: number;
  readonly maxConcurrent: number;
  readonly buffer: number;
  readonly maxWindowSize: number;
  private query: InfiniteQuery;
  private viewport = { startRow: 0, endRow: 0 };
  private window = { startRow: 0, endRow: 0 };
  private rowCount: number | null = null;
  private acceptedEnd = 0;
  private cache = new Map<number, readonly ViewportRow<T>[]>();
  private pending = new Map<number, Task>();
  // Canceled providers still occupy a slot until they settle, even if they ignore AbortSignal.
  private inflight = new Set<Task>();
  private queue: number[] = [];
  private desired = new Set<number>();
  private errors = new Map<number, string>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private ownership = 0;
  private readonly getRowId: (row: T) => string;
  private revision = 0;
  private queryRevision = 0;
  private disposed = false;
  private snapshot: InfiniteSnapshot<T>;
  constructor(
    private readonly source: InfiniteProvider<T>,
    options: InfiniteRowModelOptions<T>,
  ) {
    this.blockSize = options.blockSize ?? 100;
    this.maxBlocks = options.maxBlocks ?? 10;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.buffer = options.buffer ?? 0;
    this.maxWindowSize =
      options.maxWindowSize ??
      Math.min(
        INFINITE_ROW_LIMITS.maxWindowSize,
        this.blockSize * this.maxBlocks,
      );
    for (const [name, value, maximum] of [
      ["blockSize", this.blockSize, INFINITE_ROW_LIMITS.maxBlockSize],
      ["maxBlocks", this.maxBlocks, INFINITE_ROW_LIMITS.maxBlocks],
      ["maxConcurrent", this.maxConcurrent, INFINITE_ROW_LIMITS.maxConcurrent],
      ["maxWindowSize", this.maxWindowSize, INFINITE_ROW_LIMITS.maxWindowSize],
    ] as const)
      if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
        throw new RangeError(`Invalid infinite ${name}`);
    if (
      !indexValue(this.buffer) ||
      this.buffer > INFINITE_ROW_LIMITS.maxWindowSize ||
      this.blockSize * this.maxBlocks > INFINITE_ROW_LIMITS.maxCacheRows
    )
      throw new RangeError("Invalid infinite cache or buffer bound");
    if (
      !source ||
      typeof source.getRows !== "function" ||
      typeof options.getRowId !== "function"
    )
      throw new TypeError("An infinite provider and getRowId are required");
    this.getRowId = options.getRowId;
    this.query = this.normalize({ sorting: [], filters: {}, ...options.query });
    this.snapshot = this.makeSnapshot();
  }
  private alive() {
    if (this.disposed) throw new Error("Infinite model is disposed");
  }
  private normalize(query: InfiniteQuery): InfiniteQuery {
    const owned = structuredClone({
      ...query,
      filters: prepareColumnFilters(query.filters),
    });
    if (
      !Array.isArray(owned.sorting) ||
      owned.sorting.some(
        (sort) =>
          !sort ||
          typeof sort.columnId !== "string" ||
          !sort.columnId ||
          !["asc", "desc"].includes(sort.direction),
      ) ||
      new Set(owned.sorting.map((sort) => sort.columnId)).size !==
        owned.sorting.length
    )
      throw new TypeError("Invalid infinite sorting");
    owned.filters = prepareColumnFilters(owned.filters);
    return owned;
  }
  private makeSnapshot(): InfiniteSnapshot<T> {
    const rows = [...this.desired]
      .flatMap((index) =>
        (this.cache.get(index) ?? []).filter(
          (row) =>
            row.index >= this.window.startRow && row.index < this.window.endRow,
        ),
      )
      .sort((a, b) => a.index - b.index);
    const estimate = Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.max(
        this.blockSize,
        this.viewport.endRow,
        this.acceptedEnd + this.blockSize,
      ),
    );
    return freeze(
      structuredClone({
        revision: this.revision,
        queryRevision: this.queryRevision,
        viewport: this.viewport,
        window: this.window,
        rows,
        rowCount: this.rowCount,
        estimatedRowCount: this.rowCount ?? estimate,
        loading: this.pending.size > 0 || this.queue.length > 0,
        error: this.errors.values().next().value ?? null,
        disposed: this.disposed,
        cachedBlocks: [...this.cache.keys()],
        pendingBlocks: [...this.pending.keys()],
        queuedBlocks: this.queue,
        failedBlocks: [...this.errors].map(([blockIndex, message]) => ({
          blockIndex,
          message,
        })),
      }),
    );
  }
  private emit() {
    this.revision++;
    this.snapshot = this.makeSnapshot();
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
  getQuery(): InfiniteQuery {
    return structuredClone(this.query);
  }
  getRow(index: number): T | undefined {
    if (!indexValue(index)) throw new RangeError("Invalid infinite row index");
    const row = this.cache
      .get(Math.floor(index / this.blockSize))
      ?.find((row) => row.index === index);
    return row ? structuredClone(row.data) : undefined;
  }
  private bounds(
    viewport: { startRow: number; endRow: number },
    rowCount = this.rowCount,
  ) {
    if (viewport.startRow === viewport.endRow) return { ...viewport };
    const startRow =
      rowCount !== null && viewport.startRow >= rowCount
        ? rowCount
        : Math.max(0, viewport.startRow - this.buffer);
    const endRow = Math.max(
      startRow,
      Math.min(
        rowCount ?? Number.MAX_SAFE_INTEGER,
        viewport.endRow + this.buffer,
      ),
    );
    if (!indexValue(endRow) || endRow - startRow > this.maxWindowSize)
      throw new RangeError("Infinite viewport exceeds maximum window size");
    const count =
      endRow === startRow
        ? 0
        : Math.floor((endRow - 1) / this.blockSize) -
          Math.floor(startRow / this.blockSize) +
          1;
    if (
      count > this.maxBlocks ||
      (endRow &&
        Math.ceil(endRow / this.blockSize) * this.blockSize >
          Number.MAX_SAFE_INTEGER)
    )
      throw new RangeError("Infinite viewport exceeds the bounded block cache");
    return { startRow, endRow };
  }
  private active(task: Task) {
    return (
      !this.disposed &&
      task.generation === this.generation &&
      !task.controller.signal.aborted &&
      this.pending.get(task.index) === task
    );
  }
  private reconcile() {
    const ownership = ++this.ownership;
    this.window = this.bounds(this.viewport);
    const wanted: number[] = [];
    if (this.window.endRow > this.window.startRow)
      for (
        let block = Math.floor(this.window.startRow / this.blockSize);
        block <= Math.floor((this.window.endRow - 1) / this.blockSize);
        block++
      )
        wanted.push(block);
    this.desired = new Set(wanted);
    const canceled: Task[] = [];
    for (const [index, task] of this.pending)
      if (!this.desired.has(index)) {
        this.pending.delete(index);
        canceled.push(task);
      }
    for (const index of this.errors.keys())
      if (!this.desired.has(index)) this.errors.delete(index);
    for (const index of wanted) {
      const block = this.cache.get(index);
      if (block) {
        this.cache.delete(index);
        this.cache.set(index, block);
      }
    }
    this.queue = wanted.filter(
      (index) =>
        !this.cache.has(index) &&
        !this.pending.has(index) &&
        !this.errors.has(index),
    );
    this.evict();
    // Abort listeners may synchronously install a newer viewport or query.
    for (const task of canceled) task.controller.abort();
    if (ownership !== this.ownership || this.disposed) return;
    this.pump(false);
    this.emit();
  }
  private evict() {
    while (this.cache.size > this.maxBlocks) {
      const victim = [...this.cache.keys()].find(
        (index) => !this.desired.has(index),
      );
      if (victim === undefined) throw new Error("Infinite cache pin invariant");
      this.cache.delete(victim);
    }
  }
  private pump(publish = true) {
    if (this.disposed) return;
    let changed = false;
    while (this.inflight.size < this.maxConcurrent && this.queue.length) {
      const index = this.queue.shift()!;
      if (
        !this.desired.has(index) ||
        this.cache.has(index) ||
        this.pending.has(index) ||
        this.errors.has(index)
      )
        continue;
      const task: Task = {
        index,
        generation: this.generation,
        controller: new AbortController(),
      };
      this.pending.set(index, task);
      this.inflight.add(task);
      changed = true;
      void this.run(task);
    }
    if (changed && publish) this.emit();
  }
  private prepare(task: Task, response: InfiniteResponse<T>) {
    if (!response || typeof response !== "object")
      throw new TypeError("Invalid infinite block response");
    const owned = structuredClone(response),
      start = task.index * this.blockSize;
    if (!Array.isArray(owned.rows) || owned.rows.length > this.blockSize)
      throw new TypeError("Invalid infinite block response");
    let count = owned.rowCount ?? null;
    if (count !== null && !indexValue(count))
      throw new RangeError("Invalid infinite row count");
    if (count === null && owned.rows.length < this.blockSize) {
      if (!owned.rows.length && start > 0 && start !== this.acceptedEnd)
        throw new Error(
          "An empty block beyond the accepted boundary requires rowCount",
        );
      count = start + owned.rows.length;
    }
    if (this.rowCount !== null && count !== null && count !== this.rowCount)
      throw new Error("Infinite row count changed; refresh the model");
    count ??= this.rowCount;
    if (
      count !== null &&
      (count < this.acceptedEnd ||
        owned.rows.length !==
          Math.max(0, Math.min(this.blockSize, count - start)))
    )
      throw new Error(
        "Infinite block length or count contradicts accepted rows",
      );
    const ids = new Set<string>();
    for (const [index, block] of this.cache)
      if (index !== task.index) for (const row of block) ids.add(row.id);
    const rows = owned.rows.map((data, offset) => {
      const id = this.getRowId(data);
      if (
        typeof id !== "string" ||
        !id.length ||
        id.length > INFINITE_ROW_LIMITS.maxIdLength ||
        ids.has(id)
      )
        throw new Error("Invalid or duplicate resident infinite row ID");
      ids.add(id);
      return { index: start + offset, id, data };
    });
    return {
      rows: freeze(rows),
      count,
      end: rows.length ? start + rows.length : 0,
    };
  }
  private async run(task: Task) {
    try {
      await Promise.resolve();
      if (!this.active(task)) return;
      const response = await this.source.getRows({
        ...structuredClone(this.query),
        startRow: task.index * this.blockSize,
        endRow: (task.index + 1) * this.blockSize,
        signal: task.controller.signal,
      });
      if (!this.active(task)) return;
      const accepted = this.prepare(task, response);
      if (!this.active(task)) return;
      this.rowCount = accepted.count;
      this.acceptedEnd = Math.max(this.acceptedEnd, accepted.end);
      this.cache.delete(task.index);
      this.cache.set(task.index, accepted.rows);
      this.pending.delete(task.index);
      this.reconcile();
    } catch (error) {
      if (this.active(task)) {
        this.pending.delete(task.index);
        this.errors.set(task.index, message(error));
        this.emit();
      }
    } finally {
      this.inflight.delete(task);
      if (this.pending.get(task.index) === task)
        this.pending.delete(task.index);
      this.pump();
    }
  }
  setViewport(startRow: number, endRow: number): void {
    this.alive();
    if (!indexValue(startRow) || !indexValue(endRow) || endRow < startRow)
      throw new RangeError("Invalid infinite viewport");
    const next = { startRow, endRow };
    // Validate the requested window even when a known short result currently clips it.
    this.bounds(next, null);
    if (startRow === this.viewport.startRow && endRow === this.viewport.endRow)
      return;
    this.viewport = next;
    this.reconcile();
  }
  private reset() {
    this.generation++;
    const canceled = [...this.pending.values()];
    this.pending.clear();
    this.cache.clear();
    this.queue = [];
    this.errors.clear();
    this.rowCount = null;
    this.acceptedEnd = 0;
    try {
      this.reconcile();
    } finally {
      for (const task of canceled) task.controller.abort();
    }
  }
  setQuery(patch: Partial<InfiniteQuery>): void {
    this.alive();
    const query = this.normalize({ ...this.query, ...patch });
    const size = this.viewport.endRow - this.viewport.startRow;
    this.query = query;
    this.queryRevision++;
    this.viewport = { startRow: 0, endRow: size };
    this.reset();
  }
  refresh(): void {
    this.alive();
    this.reset();
  }
  retry(): void {
    this.alive();
    if (!this.errors.size) return;
    this.errors.clear();
    this.reconcile();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    for (const task of this.pending.values()) task.controller.abort();
    this.pending.clear();
    this.cache.clear();
    this.queue = [];
    this.errors.clear();
    this.desired.clear();
    this.rowCount = null;
    this.acceptedEnd = 0;
    this.emit();
    this.listeners.clear();
  }
}
