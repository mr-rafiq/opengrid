import { describe, expect, it, vi } from "vitest";
import {
  ServerSideRowModel,
  type ServerNode,
  type ServerRequest,
  type ServerResponse,
} from "./server-side.js";

type Item = { name: string; price: number; region?: string };
const row = (id: string, price = 1): ServerNode<Item> => ({
  kind: "row",
  id,
  data: { name: id, price },
});
const response = (
  nodes: ServerNode<Item>[],
  rowCount = nodes.length,
): ServerResponse<Item> => ({ nodes, rowCount });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("hierarchical server-side row model", () => {
  it("forwards grouped/pivot query to the provider and loads server-owned routes", async () => {
    const requests: ServerRequest[] = [];
    const getRows = vi.fn(
      async (request: ServerRequest): Promise<ServerResponse<Item>> => {
        requests.push(request);
        if (!request.groupKeys.length)
          return {
            nodes: [
              {
                kind: "group",
                id: "group:Europe",
                key: "Europe",
                childCount: 2,
                aggregates: { price: 90 },
              },
            ],
            rowCount: 1,
            pivotColumns: [
              { id: "2026_price", path: ["2026"], valueColumnId: "price" },
            ],
          };
        expect(request.groupKeys).toEqual(["Europe"]);
        const serverRows = [row("a", 40), row("b", 50)];
        // The provider, rather than the store, executes the requested order.
        serverRows.sort((a, b) =>
          a.kind === "row" && b.kind === "row"
            ? b.data.price - a.data.price
            : 0,
        );
        return response(serverRows.slice(request.startRow, request.endRow), 2);
      },
    );
    const model = new ServerSideRowModel(
      { getRows },
      {
        blockSize: 2,
        query: {
          rowGroupColumns: ["region"],
          valueColumns: [{ columnId: "price", aggregate: "sum" }],
          pivotColumns: ["year"],
          sorting: [{ columnId: "price", direction: "desc" }],
          filters: { price: { op: "gte", value: 40 } },
        },
      },
    );
    const root = await model.loadBlock([], 0);
    const children = await model.loadBlock(["Europe"], 0);
    expect(root.pivotColumns?.[0].id).toBe("2026_price");
    expect(children.nodes.map((node) => node.id)).toEqual(["b", "a"]);
    expect(requests[1]).toMatchObject({
      startRow: 0,
      endRow: 2,
      rowGroupColumns: ["region"],
      valueColumns: [{ columnId: "price", aggregate: "sum" }],
      pivotColumns: ["year"],
      sorting: [{ columnId: "price", direction: "desc" }],
      filters: { price: { op: "gte", value: 40 } },
    });
    expect(requests[1].signal).toBeInstanceOf(AbortSignal);
  });
  it("deduplicates route/block requests and detaches cached responses", async () => {
    const wait = deferred<ServerResponse<Item>>();
    const getRows = vi.fn(() => wait.promise);
    const model = new ServerSideRowModel({ getRows });
    const a = model.loadBlock(["a/b"], 0),
      b = model.loadBlock(["a/b"], 0);
    await Promise.resolve();
    expect(getRows).toHaveBeenCalledTimes(1);
    wait.resolve(response([row("1")]));
    const [first, second] = await Promise.all([a, b]);
    if (first.nodes[0].kind === "row") first.nodes[0].data.price = 999;
    expect(second.nodes[0]).toEqual(row("1"));
    expect((await model.loadBlock(["a/b"], 0)).nodes[0]).toEqual(row("1"));
  });
  it("keeps route identity collision-safe and permits concurrent route loads", async () => {
    const one = deferred<ServerResponse<Item>>(),
      two = deferred<ServerResponse<Item>>();
    const source = {
      getRows: vi.fn((r: ServerRequest) =>
        r.groupKeys.length === 1 ? one.promise : two.promise,
      ),
    };
    const model = new ServerSideRowModel(source);
    const first = model.loadBlock(["a/b"], 0),
      second = model.loadBlock(["a", "b"], 0);
    await Promise.resolve();
    two.resolve(response([row("two")]));
    one.resolve(response([row("one")]));
    await Promise.all([first, second]);
    expect(model.getSnapshot().blocks).toHaveLength(2);
    expect(source.getRows).toHaveBeenCalledTimes(2);
  });
  it("evicts least recently used blocks and bounds failure records", async () => {
    const getRows = vi.fn(async (r: ServerRequest) =>
      response([row(String(r.startRow))], 10),
    );
    const model = new ServerSideRowModel(
      { getRows },
      { blockSize: 1, maxBlocks: 2 },
    );
    await model.loadBlock([], 0);
    await model.loadBlock([], 1);
    await model.loadBlock([], 0);
    await model.loadBlock([], 2);
    expect(model.getSnapshot().blocks.map((b) => b.blockIndex)).toEqual([0, 2]);
    await model.loadBlock([], 1);
    expect(getRows).toHaveBeenCalledTimes(4);
    const failures = new ServerSideRowModel<Item>(
      {
        getRows: async () => {
          throw new Error("offline");
        },
      },
      { maxBlocks: 2 },
    );
    for (const route of ["a", "b", "c"])
      await expect(failures.loadBlock([route], 0)).rejects.toThrow("offline");
    expect(failures.getSnapshot().errors).toHaveLength(2);
  });
  it("reports loading/errors and permits explicit retry after provider failure", async () => {
    const source = {
      getRows: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(response([row("x")])),
    };
    const model = new ServerSideRowModel<Item>(source);
    const listener = vi.fn();
    model.subscribe(listener);
    const first = model.loadBlock([], 0);
    expect(model.getSnapshot().loading).toHaveLength(1);
    await expect(first).rejects.toThrow("offline");
    expect(model.getSnapshot().errors[0].message).toBe("offline");
    await model.loadBlock([], 0);
    expect(model.getSnapshot().errors).toEqual([]);
    expect(listener).toHaveBeenCalled();
  });
  it("aborts immediately on a query change even when the provider ignores cancellation", async () => {
    const wait = deferred<ServerResponse<Item>>();
    let signal!: AbortSignal;
    const model = new ServerSideRowModel<Item>({
      getRows: (r) => {
        signal = r.signal;
        return wait.promise;
      },
    });
    const pending = model.loadBlock([], 0);
    await Promise.resolve();
    model.setQuery({ sorting: [{ columnId: "price", direction: "asc" }] });
    expect(signal.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    wait.resolve(response([row("stale")]));
    await Promise.resolve();
    expect(model.getSnapshot().blocks).toEqual([]);
    expect(model.getSnapshot().errors).toEqual([]);
  });
  it("does not start a superseded provider request and validates query before mutation", async () => {
    const getRows = vi.fn(async () => response([row("x")]));
    const model = new ServerSideRowModel({ getRows });
    const pending = model.loadBlock([], 0);
    model.setQuery({ filters: {} });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(getRows).not.toHaveBeenCalled();
    await model.loadBlock([], 0);
    const snapshot = model.getSnapshot();
    expect(() => model.setQuery({ rowGroupColumns: ["a", "a"] })).toThrow();
    expect(model.getSnapshot()).toBe(snapshot);
  });
  it("refreshes one route or its descendants without disturbing siblings", async () => {
    let version = 1;
    const getRows = vi.fn(async (r: ServerRequest) =>
      response([row(r.groupKeys.join("/") || "root", version)]),
    );
    const model = new ServerSideRowModel({ getRows });
    await model.loadBlock([], 0);
    await model.loadBlock(["Europe"], 0);
    await model.loadBlock(["Europe", "UK"], 0);
    await model.loadBlock(["Asia"], 0);
    version = 2;
    await model.refreshRoute(["Europe"], { descendants: true });
    expect(getRows).toHaveBeenCalledTimes(6);
    const value = (route: string) => {
      const node = model
        .getSnapshot()
        .blocks.find((b) => b.groupKeys.join("/") === route)!.response.nodes[0];
      return node.kind === "row" ? node.data.price : 0;
    };
    expect(value("Europe")).toBe(2);
    expect(value("Europe/UK")).toBe(2);
    expect(value("Asia")).toBe(1);
    expect(value("")).toBe(1);
  });
  it("retains stale visible blocks during an explicit non-purge refresh", async () => {
    const wait = deferred<ServerResponse<Item>>();
    const source = {
      getRows: vi
        .fn()
        .mockResolvedValueOnce(response([row("x", 1)]))
        .mockImplementationOnce(() => wait.promise),
    };
    const model = new ServerSideRowModel<Item>(source);
    await model.loadBlock([], 0);
    const refresh = model.refreshRoute([], { purge: false });
    expect(model.getSnapshot().blocks[0].response.nodes[0]).toEqual(
      row("x", 1),
    );
    expect(model.getSnapshot().loading).toHaveLength(1);
    wait.resolve(response([row("x", 2)]));
    await refresh;
    expect(model.getSnapshot().blocks[0].response.nodes[0]).toEqual(
      row("x", 2),
    );
  });
  it("rejects inconsistent route counts and accepts count changes after purge refresh", async () => {
    let count = 2;
    const getRows = vi.fn(async (r: ServerRequest) =>
      response(r.startRow < count ? [row(String(r.startRow))] : [], count),
    );
    const model = new ServerSideRowModel({ getRows }, { blockSize: 1 });
    await model.loadBlock([], 0);
    count = 3;
    await expect(model.loadBlock([], 1)).rejects.toThrow("count changed");
    await model.refreshRoute([]);
    expect(
      model.getSnapshot().blocks.every((b) => b.response.rowCount === 3),
    ).toBe(true);
  });
  it("applies loaded-node updates atomically without changing positions or route counts", async () => {
    const model = new ServerSideRowModel<Item>({
      getRows: async () => response([row("a", 1), row("b", 2)]),
    });
    await model.loadBlock(["Europe"], 0);
    const snapshot = model.getSnapshot();
    expect(() =>
      model.applyTransaction(["Europe"], {
        update: [row("a", 4), row("missing", 5)],
      }),
    ).toThrow("already be loaded");
    expect(model.getSnapshot()).toBe(snapshot);
    model.applyTransaction(["Europe"], { update: [row("a", 4), row("b", 5)] });
    expect(model.getSnapshot().blocks[0].response).toEqual(
      response([row("a", 4), row("b", 5)]),
    );
    expect(() =>
      model.applyTransaction(["Asia"], { update: [row("a")] }),
    ).toThrow();
    expect(() =>
      model.applyTransaction(["Europe"], { update: [row("a"), row("a")] }),
    ).toThrow("Duplicate");
  });
  it("rejects structural group edits and invalid provider blocks without corrupting cache", async () => {
    const group: ServerNode<Item> = {
      kind: "group",
      id: "g",
      key: "Europe",
      childCount: 2,
    };
    const model = new ServerSideRowModel<Item>({
      getRows: async () => response([group]),
    });
    await model.loadBlock([], 0);
    expect(() =>
      model.applyTransaction([], { update: [{ ...group, key: "Asia" }] }),
    ).toThrow("group key");
    const invalid = new ServerSideRowModel<Item>({
      getRows: async () => response([row("same"), row("same")]),
    });
    await expect(invalid.loadBlock([], 0)).rejects.toThrow("Duplicate");
    expect(invalid.getSnapshot().blocks).toEqual([]);
    const gap = new ServerSideRowModel<Item>(
      { getRows: async () => response([row("a")], 10) },
      { blockSize: 2 },
    );
    await expect(gap.loadBlock([], 0)).rejects.toThrow("contiguous");
  });
  it("exposes stable frozen snapshots and isolates provider mutation", async () => {
    const item = row("a");
    const model = new ServerSideRowModel<Item>({
      getRows: async () => response([item]),
    });
    const initial = model.getSnapshot();
    expect(model.getSnapshot()).toBe(initial);
    await model.loadBlock([], 0);
    const snapshot = model.getSnapshot();
    expect(model.getSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot.blocks[0].response.nodes)).toBe(true);
    expect(() => {
      (snapshot.blocks as unknown[]).push({});
    }).toThrow();
    if (item.kind === "row") item.data.price = 999;
    expect(snapshot.blocks[0].response.nodes[0]).toEqual(row("a"));
  });
  it("aborts outstanding work on dispose and rejects invalid dimensions/addresses", async () => {
    expect(
      () =>
        new ServerSideRowModel(
          { getRows: async () => response([]) },
          { blockSize: 0 },
        ),
    ).toThrow();
    const model = new ServerSideRowModel<Item>({
      getRows: () => new Promise(() => {}),
    });
    await expect(model.loadBlock([], -1)).rejects.toThrow();
    const pending = model.loadBlock([], 0);
    await Promise.resolve();
    model.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(() => model.setQuery({})).toThrow("disposed");
    await expect(model.loadBlock([], 0)).rejects.toThrow("disposed");
  });
});
