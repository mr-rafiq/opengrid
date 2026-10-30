import { describe, expect, it, vi } from "vitest";
import {
  ServerSideRowModel,
  type ServerRequest,
  type ServerResponse,
  type ServerSideOptions,
  ServerRequestCapacityError,
  SERVER_REQUEST_LIMITS,
} from "./server-side.js";

type Row = { id: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const empty = (): ServerResponse<Row> => ({ nodes: [], rowCount: 0 });
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
const handled = <T>(promise: Promise<T>) =>
  promise.catch((error: unknown) => error);

function tracked(options: ServerSideOptions = {}) {
  const waits: ReturnType<typeof deferred<ServerResponse<Row>>>[] = [],
    requests: ServerRequest[] = [];
  const source = {
    getRows: vi.fn((request: ServerRequest) => {
      const wait = deferred<ServerResponse<Row>>();
      waits.push(wait);
      requests.push(request);
      return wait.promise;
    }),
  };
  const model = new ServerSideRowModel<Row>(source, options);
  const promises: Promise<unknown>[] = [];
  const load = (route: string[] = [], block = 0) => {
    const promise = handled(model.loadBlock(route, block));
    promises.push(promise);
    return promise;
  };
  const close = async () => {
    model.dispose();
    for (const wait of waits) wait.resolve(empty());
    await Promise.all(promises);
    await flush();
  };
  return { model, source, waits, requests, load, close };
}

describe("server request resource and reentrant ownership", () => {
  it("queues a third distinct route behind the default two provider requests", async () => {
    const waits: ReturnType<typeof deferred<ServerResponse<Row>>>[] = [];
    const source = {
      getRows: vi.fn(() => {
        const wait = deferred<ServerResponse<Row>>();
        waits.push(wait);
        return wait.promise;
      }),
    };
    const model = new ServerSideRowModel<Row>(source);
    const promises = [0, 1, 2].map((index) =>
      handled(model.loadBlock([`route${index}`], 0)),
    );
    try {
      await flush();
      expect(source.getRows).toHaveBeenCalledTimes(2);
      expect(model.getSnapshot().loading).toHaveLength(3);
      waits[0].resolve(empty());
      await vi.waitFor(() => expect(source.getRows).toHaveBeenCalledTimes(3));
      waits[1].resolve(empty());
      waits[2].resolve(empty());
      for (const result of await Promise.all(promises))
        expect(result).toEqual(empty());
    } finally {
      model.dispose();
      for (const wait of waits) wait.resolve(empty());
      await Promise.all(promises);
      await flush();
    }
  });
  it("keeps ignored-abort provider promises in the concurrency budget across queries", async () => {
    const waits: ReturnType<typeof deferred<ServerResponse<Row>>>[] = [],
      signals: AbortSignal[] = [];
    const source = {
      getRows: vi.fn((request: ServerRequest) => {
        const wait = deferred<ServerResponse<Row>>();
        waits.push(wait);
        signals.push(request.signal);
        return wait.promise;
      }),
    };
    const model = new ServerSideRowModel<Row>(source);
    const first = handled(model.loadBlock(["first"], 0)),
      second = handled(model.loadBlock(["second"], 0));
    let replacement: Promise<unknown> | undefined;
    try {
      await flush();
      expect(source.getRows).toHaveBeenCalledTimes(2);
      model.setQuery({ sorting: [{ columnId: "id", direction: "asc" }] });
      replacement = handled(model.loadBlock([], 0));
      await flush();
      expect(await first).toMatchObject({ name: "AbortError" });
      expect(await second).toMatchObject({ name: "AbortError" });
      expect(signals.slice(0, 2).every((signal) => signal.aborted)).toBe(true);
      expect(source.getRows).toHaveBeenCalledTimes(2);
      waits[0].resolve(empty());
      await vi.waitFor(() => expect(source.getRows).toHaveBeenCalledTimes(3));
      waits[2].resolve(empty());
      expect(await replacement).toEqual(empty());
    } finally {
      model.dispose();
      for (const wait of waits) wait.resolve(empty());
      await Promise.all([first, second, replacement]);
      await flush();
    }
  });
  it("retains a newer query chosen synchronously by an abort listener", async () => {
    const wait = deferred<ServerResponse<Row>>();
    let model!: ServerSideRowModel<Row>,
      entered = false;
    model = new ServerSideRowModel<Row>({
      getRows: ({ signal }) => {
        signal.addEventListener(
          "abort",
          () => {
            if (!entered) {
              entered = true;
              model.setQuery({
                sorting: [{ columnId: "id", direction: "desc" }],
              });
            }
          },
          { once: true },
        );
        return wait.promise;
      },
    });
    const pending = handled(model.loadBlock([], 0));
    try {
      await flush();
      model.setQuery({ sorting: [{ columnId: "id", direction: "asc" }] });
      expect(entered).toBe(true);
      expect(model.getQuery().sorting).toEqual([
        { columnId: "id", direction: "desc" },
      ]);
      expect(await pending).toMatchObject({ name: "AbortError" });
    } finally {
      model.dispose();
      wait.resolve(empty());
      await pending;
      await flush();
    }
  });
});

describe("bounded server scheduling and atomic reentrant operations", () => {
  it("isolates mutable provider query arguments from queued requests and the authoritative query", async () => {
    const wait = deferred<ServerResponse<Row>>();
    const received: ServerRequest[] = [];
    const model = new ServerSideRowModel<Row>(
      {
        getRows: (request) => {
          received.push(request);
          if (received.length === 1) {
            request.sorting[0].direction = "desc";
            request.rowGroupColumns.push("changed");
            return wait.promise;
          }
          return Promise.resolve(empty());
        },
      },
      {
        maxConcurrentRequests: 1,
        query: { sorting: [{ columnId: "id", direction: "asc" }] },
      },
    );
    const first = handled(model.loadBlock(["first"], 0)),
      next = handled(model.loadBlock(["next"], 0));
    try {
      await flush();
      expect(model.getQuery().sorting[0].direction).toBe("asc");
      expect(model.getQuery().rowGroupColumns).toEqual([]);
      wait.resolve(empty());
      expect(await first).toEqual(empty());
      expect(await next).toEqual(empty());
      expect(received[1].sorting[0].direction).toBe("asc");
      expect(received[1].rowGroupColumns).toEqual([]);
    } finally {
      model.dispose();
      wait.resolve(empty());
      await Promise.all([first, next]);
      await flush();
    }
  });
  it("refreshes exactly one cached block while retaining its stale response", async () => {
    const wait = deferred<ServerResponse<Row>>();
    const source = {
      getRows: vi
        .fn()
        .mockResolvedValueOnce(empty())
        .mockImplementationOnce(() => wait.promise),
    };
    const model = new ServerSideRowModel<Row>(source);
    try {
      await model.loadBlock(["a"], 0);
      const stale = model.getSnapshot().blocks[0].response;
      const refresh = model.refreshBlock(["a"], 0);
      await flush();
      expect(source.getRows).toHaveBeenCalledTimes(2);
      expect(model.getSnapshot().blocks[0].response).toEqual(stale);
      expect(model.getSnapshot().loading).toHaveLength(1);
      wait.resolve({
        nodes: [{ kind: "row", id: "new", data: { id: "new" } }],
        rowCount: 1,
      });
      expect((await refresh).nodes[0].id).toBe("new");
      expect(model.getSnapshot().blocks[0].response.nodes[0].id).toBe("new");
      expect(model.getSnapshot().loading).toEqual([]);
    } finally {
      model.dispose();
      wait.resolve(empty());
      await flush();
    }
  });
  it("uses FIFO queueing and a configured single provider slot", async () => {
    const f = tracked({ maxConcurrentRequests: 1, maxPendingRequests: 3 });
    try {
      const results = [
        f.load(["first"]),
        f.load(["second"]),
        f.load(["third"]),
      ];
      await flush();
      expect(f.requests.map((request) => request.groupKeys)).toEqual([
        ["first"],
      ]);
      f.waits[0].resolve(empty());
      await vi.waitFor(() => expect(f.requests).toHaveLength(2));
      expect(f.requests[1].groupKeys).toEqual(["second"]);
      f.waits[1].resolve(empty());
      await vi.waitFor(() => expect(f.requests).toHaveLength(3));
      expect(f.requests[2].groupKeys).toEqual(["third"]);
      f.waits[2].resolve(empty());
      expect(await Promise.all(results)).toEqual([empty(), empty(), empty()]);
      expect(f.model.getSnapshot().loading).toEqual([]);
    } finally {
      await f.close();
    }
  });
  it("rejects pending-capacity overflow without changing the snapshot and still deduplicates", async () => {
    const f = tracked({ maxConcurrentRequests: 1, maxPendingRequests: 2 });
    try {
      const first = f.load(["first"]),
        second = f.load(["second"]);
      await flush();
      const snapshot = f.model.getSnapshot();
      await expect(f.model.loadBlock(["overflow"], 0)).rejects.toBeInstanceOf(
        ServerRequestCapacityError,
      );
      expect(f.model.getSnapshot()).toBe(snapshot);
      const same = f.load(["first"]);
      f.waits[0].resolve(empty());
      await vi.waitFor(() => expect(f.requests).toHaveLength(2));
      f.waits[1].resolve(empty());
      expect(await Promise.all([first, second, same])).toEqual([
        empty(),
        empty(),
        empty(),
      ]);
      expect(f.source.getRows).toHaveBeenCalledTimes(2);
    } finally {
      await f.close();
    }
  });
  it("cancels queued work before provider invocation and fences an ignored-abort rejection", async () => {
    const f = tracked({ maxConcurrentRequests: 1, maxPendingRequests: 3 });
    try {
      const first = f.load(["first"]),
        queued = f.load(["queued"]);
      await flush();
      f.model.setQuery({ sorting: [{ columnId: "id", direction: "desc" }] });
      const next = f.load(["current"]);
      expect(await first).toMatchObject({ name: "AbortError" });
      expect(await queued).toMatchObject({ name: "AbortError" });
      await flush();
      expect(f.requests).toHaveLength(1);
      f.waits[0].reject(new Error("Late obsolete failure"));
      await vi.waitFor(() => expect(f.requests).toHaveLength(2));
      expect(f.requests[1].groupKeys).toEqual(["current"]);
      expect(f.requests[1].sorting).toEqual([
        { columnId: "id", direction: "desc" },
      ]);
      f.waits[1].resolve(empty());
      expect(await next).toEqual(empty());
      expect(f.model.getSnapshot().errors).toEqual([]);
      expect(
        f.model.getSnapshot().blocks.map((block) => block.groupKeys),
      ).toEqual([["current"]]);
    } finally {
      await f.close();
    }
  });
  it("releases a provider slot after a synchronous throw and starts queued work", async () => {
    const getRows = vi.fn((request: ServerRequest) => {
      if (request.groupKeys[0] === "first")
        throw new Error("Synchronous offline");
      return Promise.resolve(empty());
    });
    const model = new ServerSideRowModel<Row>(
      { getRows },
      { maxConcurrentRequests: 1 },
    );
    try {
      const first = handled(model.loadBlock(["first"], 0)),
        next = handled(model.loadBlock(["next"], 0));
      expect(await first).toMatchObject({ message: "Synchronous offline" });
      expect(await next).toEqual(empty());
      expect(getRows).toHaveBeenCalledTimes(2);
      expect(model.getSnapshot().loading).toEqual([]);
    } finally {
      model.dispose();
    }
  });
  it("publishes coherent new-query state before abort callbacks and retains their new request", async () => {
    const wait = deferred<ServerResponse<Row>>();
    let model!: ServerSideRowModel<Row>,
      current: Promise<unknown> | undefined,
      seen: unknown;
    const requests: ServerRequest[] = [];
    model = new ServerSideRowModel<Row>({
      getRows: (request) => {
        requests.push(request);
        if (request.groupKeys[0] === "pending") {
          request.signal.addEventListener(
            "abort",
            () => {
              seen = {
                sorting: model.getQuery().sorting,
                blocks: model.getSnapshot().blocks.length,
                loading: model.getSnapshot().loading.length,
              };
              model.setQuery({
                sorting: [{ columnId: "id", direction: "desc" }],
              });
              current = handled(model.loadBlock(["new"], 0));
            },
            { once: true },
          );
          return wait.promise;
        }
        return Promise.resolve(empty());
      },
    });
    await model.loadBlock(["cached"], 0);
    const pending = handled(model.loadBlock(["pending"], 0));
    try {
      await flush();
      model.setQuery({ sorting: [{ columnId: "id", direction: "asc" }] });
      expect(seen).toEqual({
        sorting: [{ columnId: "id", direction: "asc" }],
        blocks: 0,
        loading: 0,
      });
      expect(model.getQuery().sorting).toEqual([
        { columnId: "id", direction: "desc" },
      ]);
      expect(await pending).toMatchObject({ name: "AbortError" });
      expect(await current).toEqual(empty());
      expect(requests.at(-1)?.sorting).toEqual([
        { columnId: "id", direction: "desc" },
      ]);
      expect(
        model.getSnapshot().blocks.map((block) => block.groupKeys),
      ).toEqual([["new"]]);
    } finally {
      model.dispose();
      wait.resolve(empty());
      await Promise.all([pending, current]);
      await flush();
    }
  });
  it("does not submit a stale refresh batch after an abort listener changes the query", async () => {
    const wait = deferred<ServerResponse<Row>>();
    let model!: ServerSideRowModel<Row>,
      calls = 0;
    model = new ServerSideRowModel<Row>({
      getRows: (request) => {
        calls++;
        if (calls === 2) {
          request.signal.addEventListener(
            "abort",
            () =>
              model.setQuery({
                sorting: [{ columnId: "id", direction: "desc" }],
              }),
            { once: true },
          );
          return wait.promise;
        }
        return Promise.resolve(empty());
      },
    });
    await model.loadBlock([], 0);
    const first = handled(model.refresh({ purge: false }));
    let second: Promise<unknown> | undefined;
    try {
      await flush();
      second = handled(model.refresh());
      expect(await first).toMatchObject({ name: "AbortError" });
      expect(await second).toMatchObject({ name: "AbortError" });
      await flush();
      expect(calls).toBe(2);
      expect(model.getQuery().sorting).toEqual([
        { columnId: "id", direction: "desc" },
      ]);
      expect(model.getSnapshot().blocks).toEqual([]);
      expect(await model.loadBlock([], 0)).toEqual(empty());
      expect(calls).toBe(3);
    } finally {
      model.dispose();
      wait.resolve(empty());
      await Promise.all([first, second]);
      await flush();
    }
  });
  it("does not restore an obsolete transaction cache after its abort listener changes the query", async () => {
    const wait = deferred<ServerResponse<Row>>();
    let model!: ServerSideRowModel<Row>,
      calls = 0;
    model = new ServerSideRowModel<Row>({
      getRows: (request) => {
        if (++calls === 1)
          return Promise.resolve({
            nodes: [{ kind: "row", id: "a", data: { id: "a" } }],
            rowCount: 1,
          });
        request.signal.addEventListener(
          "abort",
          () =>
            model.setQuery({
              sorting: [{ columnId: "id", direction: "desc" }],
            }),
          { once: true },
        );
        return wait.promise;
      },
    });
    await model.loadBlock([], 0);
    const refresh = handled(model.refresh({ purge: false }));
    try {
      await flush();
      model.applyTransaction([], {
        update: [{ kind: "row", id: "a", data: { id: "changed" } }],
      });
      expect(model.getQuery().sorting).toEqual([
        { columnId: "id", direction: "desc" },
      ]);
      expect(model.getSnapshot().blocks).toEqual([]);
      expect(await refresh).toMatchObject({ name: "AbortError" });
    } finally {
      model.dispose();
      wait.resolve(empty());
      await refresh;
      await flush();
    }
  });
  it("preflights wide refresh capacity without purging or partly dispatching it", async () => {
    const getRows = vi.fn(async () => empty());
    const model = new ServerSideRowModel<Row>(
      { getRows },
      { maxConcurrentRequests: 1, maxPendingRequests: 1, maxBlocks: 2 },
    );
    try {
      await model.loadBlock(["a"], 0);
      await model.loadBlock(["b"], 0);
      const snapshot = model.getSnapshot();
      await expect(model.refresh()).rejects.toBeInstanceOf(
        ServerRequestCapacityError,
      );
      expect(model.getSnapshot()).toBe(snapshot);
      expect(getRows).toHaveBeenCalledTimes(2);
      await model.refreshRoute(["a"]);
      expect(getRows).toHaveBeenCalledTimes(3);
      expect(model.getSnapshot().blocks).toHaveLength(2);
    } finally {
      model.dispose();
    }
  });
  it("rejects active and queued callers on dispose without starting queued providers or publishing late results", async () => {
    const f = tracked({ maxConcurrentRequests: 1 });
    const first = f.load(["first"]),
      queued = f.load(["queued"]),
      listener = vi.fn();
    f.model.subscribe(listener);
    try {
      await flush();
      f.model.dispose();
      const snapshot = f.model.getSnapshot(),
        notifications = listener.mock.calls.length;
      expect(await first).toMatchObject({ name: "AbortError" });
      expect(await queued).toMatchObject({ name: "AbortError" });
      f.waits[0].resolve(empty());
      await flush();
      expect(f.model.getSnapshot()).toBe(snapshot);
      expect(listener).toHaveBeenCalledTimes(notifications);
      expect(f.requests).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
  it.each([
    new Error(""),
    new Error(" "),
    null,
    undefined,
    {
      toString() {
        throw new Error("conversion failed");
      },
    },
    "x".repeat(5000),
  ])(
    "normalizes provider failures into nonempty bounded errors %#",
    async (failure) => {
      const model = new ServerSideRowModel<Row>({
        getRows: async () => {
          throw failure;
        },
      });
      try {
        await expect(model.loadBlock([], 0)).rejects.toBeInstanceOf(Error);
        const message = model.getSnapshot().errors[0].message;
        expect(message.trim().length).toBeGreaterThan(0);
        expect(message.length).toBeLessThanOrEqual(
          SERVER_REQUEST_LIMITS.maxErrorLength,
        );
        expect(model.getSnapshot().loading).toEqual([]);
      } finally {
        model.dispose();
      }
    },
  );
  it("fences a query change triggered while cloning the provider response", async () => {
    let model!: ServerSideRowModel<Row>,
      entered = false;
    model = new ServerSideRowModel<Row>({
      getRows: async () => {
        if (entered) return empty();
        return {
          rowCount: 0,
          get nodes() {
            entered = true;
            model.setQuery({
              sorting: [{ columnId: "id", direction: "desc" }],
            });
            return [];
          },
        };
      },
    });
    try {
      await expect(model.loadBlock([], 0)).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(model.getSnapshot().blocks).toEqual([]);
      expect(model.getSnapshot().errors).toEqual([]);
      expect(model.getQuery().sorting).toEqual([
        { columnId: "id", direction: "desc" },
      ]);
      expect(await model.loadBlock([], 0)).toEqual(empty());
    } finally {
      model.dispose();
    }
  });
  it.each([
    { maxConcurrentRequests: 0 },
    { maxConcurrentRequests: 17 },
    { maxConcurrentRequests: 1.5 },
    { maxPendingRequests: 0 },
    { maxPendingRequests: 4097 },
    { maxConcurrentRequests: 3, maxPendingRequests: 2 },
  ])("rejects invalid request bounds before fetching %j", (options) => {
    const getRows = vi.fn(async () => empty());
    expect(() => new ServerSideRowModel<Row>({ getRows }, options)).toThrow(
      RangeError,
    );
    expect(getRows).not.toHaveBeenCalled();
  });
});
