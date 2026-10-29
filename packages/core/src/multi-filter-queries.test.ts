import { describe, expect, it, vi } from "vitest";
import {
  ColumnFilterValidationError,
  InfiniteDataSource,
  ServerSideRowModel,
  LiveViewportRowModel,
  type DataRequest,
  type DataResponse,
  type ServerRequest,
  type ServerResponse,
  type ViewportRequest,
  type MultiColumnFilter,
  type Filter,
} from "./index.js";
const query = (
  values: unknown[] = [10, -0, 9007199254740993n],
): MultiColumnFilter => ({
  op: "multi",
  filters: [
    { id: "__proto__", filter: { op: "in", value: values } },
    {
      id: "range",
      filter: {
        op: "or",
        conditions: [{ op: "gte", value: 10 }, { op: "blank" }],
      },
    },
  ],
});
const bad = () =>
  ({
    op: "multi",
    filters: [{ id: "nested", filter: query() }],
  }) as unknown as Filter;
const values = (filter: Filter) =>
  (filter as MultiColumnFilter).filters[0].filter!.value as unknown[];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe("atomic named multi-filter transport queries", () => {
  it("owns infinite query/request copies and rejects before aborting pending blocks", async () => {
    const pending = deferred<DataResponse<{ id: string }>>(),
      requests: DataRequest[] = [],
      members = [10, -0, 9007199254740993n];
    const model = new InfiniteDataSource(
      {
        getRows: async (request: DataRequest) => {
          requests.push(request);
          return request.startRow === 1
            ? pending.promise
            : { rows: [], rowCount: 10 };
        },
      },
      { blockSize: 1 },
    );
    model.setQuery([], { measure: query(members) });
    members.push(99);
    await model.loadBlock(0);
    expect(requests[0].filters.measure).toEqual(query());
    values(requests[0].filters.measure).push("provider mutation");
    const loading = model.loadBlock(1);
    await Promise.resolve();
    expect(() => model.setQuery([], { measure: bad() })).toThrow(
      ColumnFilterValidationError,
    );
    expect(requests[1].signal.aborted).toBe(false);
    expect(requests[1].filters.measure).toEqual(query());
    await model.loadBlock(0);
    expect(requests).toHaveLength(2);
    pending.resolve({ rows: [], rowCount: 10 });
    await loading;
    await model.loadBlock(2);
    expect(requests[2].filters.measure).toEqual(query());
    model.dispose();
  });
  it("preserves server query/cache/snapshot and pending signals after invalid named models", async () => {
    const pending = deferred<ServerResponse<{ id: string }>>(),
      requests: ServerRequest[] = [],
      members = [10, -0, 9007199254740993n];
    const model = new ServerSideRowModel(
      {
        getRows: async (request: ServerRequest) => {
          requests.push(request);
          return request.startRow === 1
            ? pending.promise
            : {
                nodes: [
                  {
                    kind: "row" as const,
                    id: String(request.startRow),
                    data: { id: String(request.startRow) },
                  },
                ],
                rowCount: 10,
              };
        },
      },
      { blockSize: 1, query: { filters: { measure: query(members) } } },
    );
    members.push(99);
    await model.loadBlock([], 0);
    expect(requests[0].filters.measure).toEqual(query());
    values(requests[0].filters.measure).push("provider mutation");
    const copy = model.getQuery();
    values(copy.filters.measure).push("snapshot mutation");
    const loading = model.loadBlock([], 1);
    await Promise.resolve();
    const before = model.getSnapshot(),
      changed = vi.fn(),
      stop = model.subscribe(changed);
    expect(() => model.setQuery({ filters: { measure: bad() } })).toThrow(
      ColumnFilterValidationError,
    );
    expect(model.getSnapshot()).toBe(before);
    expect(model.getQuery().filters.measure).toEqual(query());
    expect(changed).not.toHaveBeenCalled();
    expect(requests[1].signal.aborted).toBe(false);
    await model.loadBlock([], 0);
    expect(requests).toHaveLength(2);
    pending.resolve({
      nodes: [{ kind: "row", id: "pending", data: { id: "pending" } }],
      rowCount: 10,
    });
    await loading;
    stop();
    model.dispose();
  });
  it("owns viewport copies without replacing live subscriptions, rows or cleanup on rejection", () => {
    const requests: ViewportRequest<{ value: number }>[] = [],
      cleanup = vi.fn(),
      members = [10, -0, 9007199254740993n];
    const model = new LiveViewportRowModel(
      {
        subscribe: (request: ViewportRequest<{ value: number }>) => {
          requests.push(request);
          return cleanup;
        },
      },
      { buffer: 0, query: { filters: { measure: query(members) } } },
    );
    members.push(99);
    model.setViewport(0, 1);
    expect(requests[0].filters.measure).toEqual(query());
    requests[0].onRows([{ index: 0, id: "row", data: { value: 10 } }]);
    values(requests[0].filters.measure).push("provider mutation");
    const before = model.getSnapshot();
    expect(() => model.setQuery({ filters: { measure: bad() } })).toThrow(
      ColumnFilterValidationError,
    );
    expect(model.getSnapshot()).toBe(before);
    expect(requests[0].signal.aborted).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    model.setViewport(1, 2);
    expect(requests[1].filters.measure).toEqual(query());
    model.dispose();
  });
});
