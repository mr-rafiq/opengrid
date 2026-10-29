import type { Filter, Sort } from "./types.js";
import { prepareColumnFilters } from "./column-filter-model.js";

export interface ServerValueColumn {
  columnId: string;
  aggregate: string;
}
export interface ServerQuery {
  rowGroupColumns: string[];
  valueColumns: ServerValueColumn[];
  pivotColumns: string[];
  sorting: Sort[];
  filters: Record<string, Filter>;
}
export interface ServerRequest extends ServerQuery {
  startRow: number;
  endRow: number;
  /** Server-owned group keys, from root to the parent being loaded. */
  groupKeys: string[];
  signal: AbortSignal;
}
export type ServerNode<T> =
  | { kind: "row"; id: string; data: T }
  | {
      kind: "group";
      id: string;
      key: string;
      label?: string;
      childCount?: number;
      aggregates?: Record<string, unknown>;
    };
export interface ServerPivotColumn {
  id: string;
  header?: string;
  path?: string[];
  valueColumnId?: string;
}
export interface ServerResponse<T> {
  nodes: ServerNode<T>[];
  /** Exact number of children at this route, not the number of descendant leaves. */
  rowCount: number;
  pivotColumns?: ServerPivotColumn[];
}
export interface ServerSideDataSource<T> {
  getRows(request: ServerRequest): Promise<ServerResponse<T>>;
}
export interface ServerBlockAddress {
  groupKeys: readonly string[];
  blockIndex: number;
}
export interface LoadedServerBlock<T> extends ServerBlockAddress {
  response: ServerResponse<T>;
}
export interface ServerSideSnapshot<T> {
  revision: number;
  blocks: readonly LoadedServerBlock<T>[];
  loading: readonly ServerBlockAddress[];
  errors: readonly (ServerBlockAddress & { message: string })[];
}
export interface ServerSideOptions {
  blockSize?: number;
  maxBlocks?: number;
  query?: Partial<ServerQuery>;
}
export interface ServerRefreshOptions {
  purge?: boolean;
  descendants?: boolean;
}
export interface LoadedServerTransaction<T> {
  update: ServerNode<T>[];
}

const abortError = () => new DOMException("Request superseded", "AbortError");
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value &&
    typeof value === "object" &&
    !Object.isFrozen(value) &&
    !seen.has(value)
  ) {
    seen.add(value);
    for (const item of Object.values(value)) freeze(item, seen);
    Object.freeze(value);
  }
  return value;
}
function routeKey(groupKeys: readonly string[]) {
  return JSON.stringify(groupKeys);
}
function addressKey(groupKeys: readonly string[], blockIndex: number) {
  return JSON.stringify([groupKeys, blockIndex]);
}
function assertRoute(groupKeys: readonly string[]) {
  if (
    !Array.isArray(groupKeys) ||
    groupKeys.some((key) => typeof key !== "string")
  )
    throw new TypeError("Group routes must contain strings");
}
function includesRoute(
  candidate: readonly string[],
  route: readonly string[],
  descendants: boolean,
) {
  return (
    (descendants
      ? candidate.length >= route.length
      : candidate.length === route.length) &&
    route.every((key, index) => candidate[index] === key)
  );
}
function validateNode<T>(node: ServerNode<T>) {
  if (
    !node ||
    typeof node.id !== "string" ||
    !node.id ||
    (node.kind !== "row" && node.kind !== "group")
  )
    throw new Error(
      "Server nodes require nonempty stable IDs and a supported kind",
    );
  if (
    node.kind === "group" &&
    (typeof node.key !== "string" ||
      (node.childCount !== undefined && !integer(node.childCount)))
  )
    throw new Error("Invalid server group node");
  if (node.kind === "row" && !("data" in node))
    throw new Error("Server row is missing data");
}

/**
 * Hierarchical, query-aware server block store. Grouping, sorting, filtering and
 * pivot computation execute in the supplied provider; no client recomputation.
 * The store is independent of React and does not itself flatten an expanded tree.
 */
export class ServerSideRowModel<T> {
  readonly blockSize: number;
  readonly maxBlocks: number;
  private query: ServerQuery;
  private cache = new Map<string, LoadedServerBlock<T>>();
  private pending = new Map<
    string,
    ServerBlockAddress & {
      controller: AbortController;
      promise: Promise<ServerResponse<T>>;
    }
  >();
  private errors = new Map<string, ServerBlockAddress & { message: string }>();
  private listeners = new Set<() => void>();
  private disposed = false;
  private revision = 0;
  private snapshot: ServerSideSnapshot<T> = freeze({
    revision: 0,
    blocks: [],
    loading: [],
    errors: [],
  });

  constructor(
    private source: ServerSideDataSource<T>,
    options: ServerSideOptions = {},
  ) {
    this.blockSize = options.blockSize ?? 100;
    this.maxBlocks = options.maxBlocks ?? 10;
    if (
      !integer(this.blockSize) ||
      !this.blockSize ||
      !integer(this.maxBlocks) ||
      !this.maxBlocks
    )
      throw new RangeError(
        "Block size and cache size must be positive safe integers",
      );
    this.query = this.normalizeQuery({
      rowGroupColumns: [],
      valueColumns: [],
      pivotColumns: [],
      sorting: [],
      filters: {},
      ...options.query,
    });
  }
  private alive() {
    if (this.disposed) throw new Error("Server-side model is disposed");
  }
  private normalizeQuery(query: ServerQuery): ServerQuery {
    const copy = structuredClone({
      ...query,
      filters: prepareColumnFilters(query.filters),
    });
    copy.filters = prepareColumnFilters(copy.filters);
    for (const ids of [copy.rowGroupColumns, copy.pivotColumns]) {
      if (
        !Array.isArray(ids) ||
        ids.some((id) => typeof id !== "string" || !id) ||
        new Set(ids).size !== ids.length
      )
        throw new Error("Server column IDs must be nonempty unique strings");
    }
    if (
      !Array.isArray(copy.valueColumns) ||
      copy.valueColumns.some(
        (column) =>
          !column.columnId ||
          typeof column.aggregate !== "string" ||
          !column.aggregate,
      ) ||
      new Set(copy.valueColumns.map((column) => column.columnId)).size !==
        copy.valueColumns.length
    )
      throw new Error("Invalid server value columns");
    if (
      !Array.isArray(copy.sorting) ||
      copy.sorting.some(
        (sort) => !sort.columnId || !["asc", "desc"].includes(sort.direction),
      ) ||
      !copy.filters ||
      typeof copy.filters !== "object" ||
      Array.isArray(copy.filters)
    )
      throw new Error("Invalid server query");
    return copy;
  }
  private emit() {
    this.snapshot = freeze(
      structuredClone({
        revision: ++this.revision,
        blocks: [...this.cache.values()],
        loading: [...this.pending.values()].map(
          ({ groupKeys, blockIndex }) => ({ groupKeys, blockIndex }),
        ),
        errors: [...this.errors.values()],
      }),
    );
    for (const listener of [...this.listeners]) listener();
  }
  getSnapshot = (): ServerSideSnapshot<T> => this.snapshot;
  /** Detached authoritative provider query for UI bindings and persistence. */
  getQuery = (): ServerQuery => structuredClone(this.query);
  subscribe = (listener: () => void) => {
    this.alive();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setQuery(query: Partial<ServerQuery>) {
    this.alive();
    const next = this.normalizeQuery({ ...this.query, ...query });
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    this.cache.clear();
    this.errors.clear();
    this.query = next;
    this.emit();
  }
  private validateResponse(
    response: ServerResponse<T>,
    groupKeys: readonly string[],
    blockIndex: number,
  ) {
    const start = blockIndex * this.blockSize;
    if (
      !response ||
      !integer(response.rowCount) ||
      !Array.isArray(response.nodes) ||
      response.nodes.length !==
        Math.min(this.blockSize, Math.max(0, response.rowCount - start))
    )
      throw new Error(
        "Invalid server response: supply a complete contiguous block and exact route rowCount",
      );
    const ids = new Set<string>();
    for (const node of response.nodes) {
      validateNode(node);
      if (ids.has(node.id)) throw new Error("Duplicate server node ID");
      ids.add(node.id);
    }
    if (
      response.pivotColumns &&
      (!Array.isArray(response.pivotColumns) ||
        response.pivotColumns.some((column) => !column.id) ||
        new Set(response.pivotColumns.map((column) => column.id)).size !==
          response.pivotColumns.length)
    )
      throw new Error("Invalid server pivot columns");
    for (const block of this.cache.values()) {
      if (
        routeKey(block.groupKeys) !== routeKey(groupKeys) ||
        block.blockIndex === blockIndex
      )
        continue;
      if (block.response.rowCount !== response.rowCount)
        throw new Error(
          "Server route count changed; purge-refresh this route before loading",
        );
      if (block.response.nodes.some((node) => ids.has(node.id)))
        throw new Error("Server node IDs must be unique within a route");
    }
  }
  loadBlock(
    groupKeys: readonly string[],
    blockIndex: number,
  ): Promise<ServerResponse<T>> {
    return this.requestBlock(groupKeys, blockIndex);
  }
  private async requestBlock(
    groupKeys: readonly string[],
    blockIndex: number,
    force = false,
  ): Promise<ServerResponse<T>> {
    this.alive();
    assertRoute(groupKeys);
    if (!integer(blockIndex) || !integer((blockIndex + 1) * this.blockSize))
      throw new RangeError("Invalid server block index");
    const route = [...groupKeys],
      key = addressKey(route, blockIndex);
    const cached = this.cache.get(key);
    if (cached && !force) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return structuredClone(cached.response);
    }
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing.promise);
    const controller = new AbortController();
    const query = structuredClone(this.query);
    let rejectAbort!: (error: DOMException) => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(abortError());
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const promise = Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortError();
        return this.source.getRows({
          ...query,
          groupKeys: [...route],
          startRow: blockIndex * this.blockSize,
          endRow: (blockIndex + 1) * this.blockSize,
          signal: controller.signal,
        });
      }),
      aborted,
    ])
      .then((response) => {
        if (controller.signal.aborted || this.disposed) throw abortError();
        this.validateResponse(response, route, blockIndex);
        const copy = structuredClone(response);
        this.cache.set(key, { groupKeys: route, blockIndex, response: copy });
        while (this.cache.size > this.maxBlocks)
          this.cache.delete(this.cache.keys().next().value!);
        this.errors.delete(key);
        return copy;
      })
      .catch((error) => {
        if (!controller.signal.aborted && !this.disposed) {
          this.errors.set(key, {
            groupKeys: route,
            blockIndex,
            message: error instanceof Error ? error.message : String(error),
          });
          while (this.errors.size > this.maxBlocks)
            this.errors.delete(this.errors.keys().next().value!);
        }
        throw error;
      })
      .finally(() => {
        controller.signal.removeEventListener("abort", onAbort);
        if (this.pending.get(key)?.controller === controller) {
          this.pending.delete(key);
          this.emit();
        }
      });
    this.errors.delete(key);
    this.pending.set(key, {
      groupKeys: route,
      blockIndex,
      controller,
      promise,
    });
    this.emit();
    return structuredClone(await promise);
  }
  async refreshRoute(
    groupKeys: readonly string[],
    options: ServerRefreshOptions = {},
  ): Promise<ServerResponse<T>[]> {
    this.alive();
    assertRoute(groupKeys);
    const descendants = options.descendants ?? false,
      purge = options.purge ?? true;
    const matches = (address: ServerBlockAddress) =>
      includesRoute(address.groupKeys, groupKeys, descendants);
    const reload = new Map<string, ServerBlockAddress>();
    for (const [key, block] of this.cache)
      if (matches(block)) {
        reload.set(key, block);
        if (purge) this.cache.delete(key);
      }
    for (const [key, request] of this.pending)
      if (matches(request)) {
        reload.set(key, request);
        request.controller.abort();
        this.pending.delete(key);
      }
    for (const [key, error] of this.errors)
      if (matches(error)) {
        reload.set(key, error);
        this.errors.delete(key);
      }
    const promises = [...reload.values()].map((address) =>
      this.requestBlock(address.groupKeys, address.blockIndex, true),
    );
    this.emit();
    return Promise.all(promises);
  }
  refresh(options: Omit<ServerRefreshOptions, "descendants"> = {}) {
    return this.refreshRoute([], { ...options, descendants: true });
  }
  /** Updates existing loaded nodes only. Structural add/remove belongs on the server, followed by purge-refresh. */
  applyTransaction(
    groupKeys: readonly string[],
    transaction: LoadedServerTransaction<T>,
  ): void {
    this.alive();
    assertRoute(groupKeys);
    const updates = new Map<string, ServerNode<T>>();
    for (const node of transaction.update) {
      validateNode(node);
      if (updates.has(node.id))
        throw new Error("Duplicate transaction node ID");
      updates.set(node.id, structuredClone(node));
    }
    const found = new Set<string>(),
      changes = new Map<string, LoadedServerBlock<T>>();
    for (const [key, block] of this.cache) {
      if (routeKey(block.groupKeys) !== routeKey(groupKeys)) continue;
      const nodes = block.response.nodes.map((node) => {
        const update = updates.get(node.id);
        if (!update) return node;
        if (
          update.kind !== node.kind ||
          (update.kind === "group" &&
            node.kind === "group" &&
            update.key !== node.key)
        )
          throw new Error(
            "Transactions cannot change node identity, kind or group key",
          );
        found.add(node.id);
        return update;
      });
      changes.set(key, { ...block, response: { ...block.response, nodes } });
    }
    if (found.size !== updates.size)
      throw new Error(
        "Every transaction node must already be loaded at the specified route",
      );
    if (!updates.size) return;
    for (const [key, request] of this.pending)
      if (routeKey(request.groupKeys) === routeKey(groupKeys)) {
        request.controller.abort();
        this.pending.delete(key);
      }
    for (const [key, block] of changes) this.cache.set(key, block);
    this.emit();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    this.cache.clear();
    this.errors.clear();
    this.emit();
    this.listeners.clear();
  }
}
