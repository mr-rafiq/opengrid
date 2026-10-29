import type { Filter, Sort } from "./types.js";
export interface DataRequest {
  startRow: number;
  endRow: number;
  sorting: Sort[];
  filters: Record<string, Filter>;
  signal: AbortSignal;
}
export interface DataResponse<T> {
  rows: T[];
  rowCount: number;
}
export interface DataSource<T> {
  getRows(request: DataRequest): Promise<DataResponse<T>>;
}
export interface InfiniteOptions {
  blockSize?: number;
  maxBlocks?: number;
}
/** Flat infinite-block loader. Does not implement grouped server-side or live viewport row models. */
export class InfiniteDataSource<T> {
  private cache = new Map<number, DataResponse<T>>();
  private pending = new Map<
    number,
    { controller: AbortController; promise: Promise<DataResponse<T>> }
  >();
  private revision = 0;
  private sorting: Sort[] = [];
  private filters: Record<string, Filter> = {};
  readonly blockSize: number;
  readonly maxBlocks: number;
  constructor(
    private source: DataSource<T>,
    options: InfiniteOptions = {},
  ) {
    this.blockSize = options.blockSize ?? 100;
    this.maxBlocks = options.maxBlocks ?? 10;
    if (
      !Number.isInteger(this.blockSize) ||
      this.blockSize < 1 ||
      !Number.isInteger(this.maxBlocks) ||
      this.maxBlocks < 1
    )
      throw new RangeError(
        "Block size and cache size must be positive integers",
      );
  }
  setQuery(sorting: Sort[], filters: Record<string, Filter>) {
    this.invalidate();
    this.sorting = structuredClone(sorting);
    this.filters = structuredClone(filters);
  }
  invalidate() {
    this.revision++;
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    this.cache.clear();
  }
  dispose() {
    this.invalidate();
  }
  async loadBlock(index: number): Promise<DataResponse<T>> {
    if (!Number.isInteger(index) || index < 0)
      throw new RangeError("Block index must be a nonnegative integer");
    const cached = this.cache.get(index);
    if (cached) {
      this.cache.delete(index);
      this.cache.set(index, cached);
      return structuredClone(cached);
    }
    const existing = this.pending.get(index);
    if (existing) return structuredClone(await existing.promise);
    const controller = new AbortController();
    const revision = this.revision;
    const promise = Promise.resolve()
      .then(() =>
        this.source.getRows({
          startRow: index * this.blockSize,
          endRow: (index + 1) * this.blockSize,
          sorting: structuredClone(this.sorting),
          filters: structuredClone(this.filters),
          signal: controller.signal,
        }),
      )
      .then((response) => {
        if (controller.signal.aborted || revision !== this.revision)
          throw new DOMException("Request superseded", "AbortError");
        if (
          !Number.isInteger(response.rowCount) ||
          response.rowCount < 0 ||
          response.rows.length > this.blockSize
        )
          throw new Error("Invalid datasource response");
        const snapshot = structuredClone(response);
        this.cache.set(index, snapshot);
        while (this.cache.size > this.maxBlocks)
          this.cache.delete(this.cache.keys().next().value!);
        return snapshot;
      })
      .finally(() => {
        if (this.pending.get(index)?.controller === controller)
          this.pending.delete(index);
      });
    this.pending.set(index, { controller, promise });
    return structuredClone(await promise);
  }
}
