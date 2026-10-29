import { describe, expect, it, vi } from "vitest";
import {
  ColumnFilterValidationError,
  InfiniteDataSource,
  LiveViewportRowModel,
  ServerSideRowModel,
} from "./index.js";
import type {
  CompoundFilter,
  DataRequest,
  DataResponse,
  Filter,
  ServerRequest,
  ServerResponse,
  ViewportRequest,
} from "./index.js";

const group = (): CompoundFilter => ({
  op: "and",
  conditions: [
    { op: "in", value: [10, 20, 9007199254740993n] },
    { op: "notEqual", value: -0 },
  ],
});
const bad = () =>
  ({
    op: "and",
    conditions: [{ op: "equals", value: new Date("2026-01-01") }],
  }) as unknown as Filter;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe("atomic compound-filter query preparation", () => {
  it("infinite model rejects malformed groups before aborting pending work or dropping loaded blocks", async () => {
    const wait = deferred<DataResponse<{ id: string }>>(),
      requests: DataRequest[] = [];
    const getRows = vi.fn((request: DataRequest) => {
      requests.push(request);
      return request.startRow === 2
        ? wait.promise
        : Promise.resolve({
            rows: [{ id: String(request.startRow) }],
            rowCount: 10,
          });
    });
    const model = new InfiniteDataSource({ getRows }, { blockSize: 2 });
    model.setQuery([], { value: group() });
    await model.loadBlock(0);
    const pending = model.loadBlock(1);
    await Promise.resolve();
    expect(requests).toHaveLength(2);
    expect(() => model.setQuery([], { value: bad() })).toThrow(
      ColumnFilterValidationError,
    );
    expect(requests[1]!.signal.aborted).toBe(false);
    await expect(model.loadBlock(0)).resolves.toEqual({
      rows: [{ id: "0" }],
      rowCount: 10,
    });
    expect(getRows).toHaveBeenCalledTimes(2);
    wait.resolve({ rows: [{ id: "2" }], rowCount: 10 });
    await expect(pending).resolves.toEqual({
      rows: [{ id: "2" }],
      rowCount: 10,
    });
    await model.loadBlock(2);
    expect(requests[2]!.filters.value).toEqual(group());
    model.dispose();
  });

  it("infinite model prepares both transport clones before invalidating, including legacy clone failures", async () => {
    const requests: DataRequest[] = [],
      pendingResponse = deferred<DataResponse<{ id: string }>>();
    const getRows = vi.fn((request: DataRequest) => {
      requests.push(request);
      return request.startRow === 1
        ? pendingResponse.promise
        : Promise.resolve({ rows: [{ id: "r" }], rowCount: 3 });
    });
    const model = new InfiniteDataSource({ getRows }, { blockSize: 1 });
    model.setQuery([], { value: { op: "equals", value: "old" } });
    await model.loadBlock(0);
    const pending = model.loadBlock(1);
    await Promise.resolve();
    expect(() =>
      model.setQuery([], {
        value: { op: "equals", value: () => "uncloneable" },
      }),
    ).toThrow();
    expect(requests[1]!.signal.aborted).toBe(false);
    expect(() =>
      model.setQuery(
        [{ columnId: "value", direction: "asc", extra: () => {} } as never],
        {},
      ),
    ).toThrow();
    await model.loadBlock(0);
    expect(getRows).toHaveBeenCalledTimes(2);
    pendingResponse.resolve({ rows: [{ id: "pending" }], rowCount: 3 });
    await pending;
    await model.loadBlock(2);
    expect(requests[2]!.filters.value).toEqual({ op: "equals", value: "old" });
    model.dispose();
  });

  it("infinite provider queries own nested arrays, BigInts, signed zero and legacy Dates", async () => {
    const requests: DataRequest[] = [],
      initial = group(),
      date = new Date("2026-01-01");
    const getRows = vi.fn(async (request: DataRequest) => {
      requests.push(request);
      return { rows: [], rowCount: 0 };
    });
    const model = new InfiniteDataSource({ getRows }, { blockSize: 1 });
    model.setQuery([], { value: initial, date: { op: "equals", value: date } });
    (initial.conditions[0]!.value as unknown[]).push(99);
    date.setUTCDate(2);
    await model.loadBlock(0);
    const first = requests[0]!.filters.value as CompoundFilter;
    expect(first.conditions[0]!.value).toEqual([10, 20, 9007199254740993n]);
    expect(Object.is(first.conditions[1]!.value, -0)).toBe(true);
    expect((requests[0]!.filters.date!.value as Date).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    (first.conditions[0]!.value as unknown[]).push("provider mutation");
    (requests[0]!.filters.date!.value as Date).setUTCDate(10);
    await model.loadBlock(1);
    expect(requests[1]!.filters.value).toEqual(group());
    expect((requests[1]!.filters.date!.value as Date).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    model.dispose();
  });

  it("server store rejects before changing query, snapshot, loaded blocks or pending signals", async () => {
    const wait = deferred<ServerResponse<{ id: string }>>(),
      requests: ServerRequest[] = [];
    const getRows = vi.fn((request: ServerRequest) => {
      requests.push(request);
      return request.startRow === 1
        ? wait.promise
        : Promise.resolve({
            nodes: [{ kind: "row" as const, id: "r0", data: { id: "r0" } }],
            rowCount: 3,
          });
    });
    const model = new ServerSideRowModel(
      { getRows },
      { blockSize: 1, query: { filters: { value: group() } } },
    );
    await model.loadBlock([], 0);
    const pending = model.loadBlock([], 1);
    await Promise.resolve();
    const state = model.getSnapshot(),
      query = model.getQuery(),
      notify = vi.fn();
    model.subscribe(notify);
    expect(() => model.setQuery({ filters: { value: bad() } })).toThrow(
      ColumnFilterValidationError,
    );
    expect(model.getSnapshot()).toBe(state);
    expect(model.getQuery()).toEqual(query);
    expect(requests[1]!.signal.aborted).toBe(false);
    await model.loadBlock([], 0);
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
    wait.resolve({
      nodes: [{ kind: "row", id: "r1", data: { id: "r1" } }],
      rowCount: 3,
    });
    await pending;
    model.dispose();
  });

  it("server query snapshots and provider requests cannot mutate the stored compound model", async () => {
    const requests: ServerRequest[] = [],
      original = group();
    const model = new ServerSideRowModel(
      {
        getRows: async (request: ServerRequest) => {
          requests.push(request);
          return { nodes: [], rowCount: 0 };
        },
      },
      { blockSize: 1, query: { filters: { constructor: original } } },
    );
    original.conditions[0]!.value = [999];
    const copy = model.getQuery();
    (
      Object.getOwnPropertyDescriptor(copy.filters, "constructor")!
        .value as CompoundFilter
    ).conditions[0]!.value = [777];
    await model.loadBlock([], 0);
    expect(requests[0]!.filters.constructor).toEqual(group());
    (
      Object.getOwnPropertyDescriptor(requests[0]!.filters, "constructor")!
        .value as CompoundFilter
    ).conditions[0]!.value = [555];
    expect(model.getQuery().filters.constructor).toEqual(group());
    model.dispose();
  });

  it("live viewport rejects before replacing callbacks, rows, query, cleanup or snapshot", () => {
    const requests: ViewportRequest<{ value: number }>[] = [],
      cleanup = vi.fn();
    const subscribe = vi.fn((request: ViewportRequest<{ value: number }>) => {
      requests.push(request);
      return cleanup;
    });
    const model = new LiveViewportRowModel(
      { subscribe },
      { buffer: 0, query: { filters: { value: group() } } },
    );
    model.setViewport(0, 2);
    requests[0]!.onRows([{ index: 0, id: "r", data: { value: 10 } }]);
    const state = model.getSnapshot(),
      notify = vi.fn();
    model.subscribe(notify);
    expect(() => model.setQuery({ filters: { value: bad() } })).toThrow(
      ColumnFilterValidationError,
    );
    expect(model.getSnapshot()).toBe(state);
    expect(requests[0]!.signal.aborted).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    requests[0]!.onRows([{ index: 1, id: "second", data: { value: 20 } }]);
    expect(model.getSnapshot().rows).toHaveLength(2);
    model.setViewport(2, 4);
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(requests[1]!.filters.value).toEqual(group());
    model.dispose();
  });

  it("live viewport owns query snapshots and rejects malformed constructor queries before subscribing", () => {
    const subscribe = vi.fn(() => () => {});
    expect(
      () =>
        new LiveViewportRowModel(
          { subscribe },
          { query: { filters: { value: bad() } } },
        ),
    ).toThrow(ColumnFilterValidationError);
    expect(subscribe).not.toHaveBeenCalled();
    const requests: ViewportRequest<unknown>[] = [],
      original = group();
    const model = new LiveViewportRowModel(
      {
        subscribe: (request: ViewportRequest<unknown>) => {
          requests.push(request);
          return () => {};
        },
      },
      { buffer: 0, query: { filters: { value: original } } },
    );
    original.conditions[0]!.value = [999];
    model.setViewport(0, 1);
    expect(requests[0]!.filters.value).toEqual(group());
    (requests[0]!.filters.value as CompoundFilter).conditions[0]!.value = [555];
    model.setViewport(1, 2);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.filters.value).toEqual(group());
    original.conditions[1]!.value = 888;
    (requests[1]!.filters.value as CompoundFilter).conditions[0]!.value = [777];
    model.setViewport(2, 3);
    expect(requests).toHaveLength(3);
    expect(requests[2]!.filters.value).toEqual(group());
    model.dispose();
  });

  it("does not invoke compound/filter-map accessors before rejecting provider query updates", () => {
    const read = vi.fn(() => [{ op: "blank" }]);
    const malformed = { op: "and" };
    Object.defineProperty(malformed, "conditions", {
      get: read,
      enumerable: true,
    });
    const getRows = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const infinite = new InfiniteDataSource({ getRows });
    expect(() => infinite.setQuery([], { value: malformed as Filter })).toThrow(
      ColumnFilterValidationError,
    );
    const server = new ServerSideRowModel({
      getRows: async () => ({ nodes: [], rowCount: 0 }),
    });
    expect(() =>
      server.setQuery({ filters: { value: malformed as Filter } }),
    ).toThrow(ColumnFilterValidationError);
    const live = new LiveViewportRowModel({ subscribe: () => () => {} });
    expect(() =>
      live.setQuery({ filters: { value: malformed as Filter } }),
    ).toThrow(ColumnFilterValidationError);
    expect(read).not.toHaveBeenCalled();
    expect(getRows).not.toHaveBeenCalled();
    infinite.dispose();
    server.dispose();
    live.dispose();
  });
});
