import { describe, expect, it, vi } from "vitest";
import {
  InfiniteRowModel,
  INFINITE_ROW_LIMITS,
  type InfiniteResponse,
  type InfiniteRowModelOptions,
} from "./infinite-row-model.js";
import type { DataRequest } from "./datasource.js";

type Row = { id: string; value: number };
const rows = (start: number, end: number) =>
  Array.from({ length: Math.max(0, end - start) }, (_, offset) => ({
    id: `r${start + offset}`,
    value: start + offset,
  }));
const options = (
  patch: Partial<InfiniteRowModelOptions<Row>> = {},
): InfiniteRowModelOptions<Row> => ({
  getRowId: (row) => row.id,
  blockSize: 2,
  maxBlocks: 3,
  ...patch,
});
const idle = async (model: InfiniteRowModel<Row>) =>
  vi.waitFor(() => expect(model.getSnapshot().loading).toBe(false));
async function turns() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(count = 7, patch: Partial<InfiniteRowModelOptions<Row>> = {}) {
  const getRows = vi.fn(async (request: DataRequest) => ({
    rows: rows(request.startRow, Math.min(request.endRow, count)),
    rowCount: count,
  }));
  return {
    getRows,
    model: new InfiniteRowModel<Row>({ getRows }, options(patch)),
  };
}

describe("observable bounded infinite blocks", () => {
  it("constructs stable frozen snapshots without provider calls", () => {
    const { model, getRows } = fixture();
    const snapshot = model.getSnapshot();
    expect(getRows).not.toHaveBeenCalled();
    expect(snapshot).toBe(model.getSnapshot());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.rowCount).toBeNull();
    expect(snapshot.estimatedRowCount).toBe(2);
    expect(snapshot.rows).toEqual([]);
    expect(Object.isFrozen(INFINITE_ROW_LIMITS)).toBe(true);
  });
  it("pulls only requested blocks and exposes absolute sparse rows and exact count", async () => {
    const { model, getRows } = fixture(5);
    model.setViewport(2, 4);
    await idle(model);
    expect(getRows).toHaveBeenCalledTimes(1);
    expect(getRows.mock.calls[0][0]).toMatchObject({ startRow: 2, endRow: 4 });
    expect(model.getSnapshot().rows.map((row) => [row.index, row.id])).toEqual([
      [2, "r2"],
      [3, "r3"],
    ]);
    expect(model.getSnapshot().rowCount).toBe(5);
    expect(model.getRow(0)).toBeUndefined();
    expect(model.getRow(2)?.value).toBe(2);
  });
  it("grows an unknown estimate until a short terminal block supplies the count", async () => {
    const model = new InfiniteRowModel<Row>(
      {
        getRows: async ({ startRow, endRow }) => ({
          rows: rows(startRow, Math.min(endRow, 5)),
        }),
      },
      options(),
    );
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().rowCount).toBeNull();
    expect(model.getSnapshot().estimatedRowCount).toBe(4);
    model.setViewport(2, 4);
    await idle(model);
    expect(model.getSnapshot().estimatedRowCount).toBe(6);
    model.setViewport(4, 6);
    await idle(model);
    expect(model.getSnapshot().rowCount).toBe(5);
    expect(model.getSnapshot().window).toEqual({ startRow: 4, endRow: 5 });
    expect(model.getSnapshot().rows.map((row) => row.index)).toEqual([4]);
  });
  it("discovers zero rows without a count and an exact full-block boundary with an empty next block", async () => {
    const empty = new InfiniteRowModel<Row>(
      { getRows: async () => ({ rows: [] }) },
      options(),
    );
    empty.setViewport(0, 2);
    await idle(empty);
    expect(empty.getSnapshot().rowCount).toBe(0);
    const model = new InfiniteRowModel<Row>(
      {
        getRows: async ({ startRow }) => ({
          rows: startRow === 0 ? rows(0, 2) : [],
        }),
      },
      options(),
    );
    model.setViewport(0, 2);
    await idle(model);
    model.setViewport(2, 4);
    await idle(model);
    expect(model.getSnapshot().rowCount).toBe(2);
    expect(model.getSnapshot().error).toBeNull();
  });
  it("does not invent a count from an unknown empty block after a far jump", async () => {
    const model = new InfiniteRowModel<Row>(
      { getRows: async () => ({ rows: [] }) },
      options(),
    );
    model.setViewport(100, 102);
    await idle(model);
    expect(model.getSnapshot().rowCount).toBeNull();
    expect(model.getSnapshot().error).toContain("requires rowCount");
    expect(model.getSnapshot().cachedBlocks).toEqual([]);
  });
  it("accepts an explicit count after an out-of-range jump without treating empty positions as rows", async () => {
    const { model } = fixture(5);
    model.setViewport(100, 102);
    await idle(model);
    expect(model.getSnapshot().rowCount).toBe(5);
    expect(model.getSnapshot().error).toBeNull();
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().error).toBeNull();
    expect(model.getRow(0)?.id).toBe("r0");
  });
  it("deduplicates unchanged windows and serves returning cached blocks", async () => {
    const { model, getRows } = fixture();
    model.setViewport(0, 2);
    model.setViewport(0, 2);
    await idle(model);
    model.setViewport(2, 4);
    await idle(model);
    model.setViewport(0, 2);
    await idle(model);
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(model.getSnapshot().rows[0].id).toBe("r0");
  });
  it("evicts least-recent blocks while retaining every active-window block", async () => {
    const { model, getRows } = fixture(20, { maxBlocks: 2 });
    for (const start of [0, 2, 0, 4]) {
      model.setViewport(start, start + 2);
      await idle(model);
    }
    expect(model.getSnapshot().cachedBlocks).toEqual([0, 2]);
    model.setViewport(2, 4);
    await idle(model);
    expect(getRows).toHaveBeenCalledTimes(4);
    expect(model.getSnapshot().cachedBlocks).toHaveLength(2);
  });
  it("rejects oversized and unsafe windows before changing state or requesting rows", () => {
    const { model, getRows } = fixture(20, { maxBlocks: 2 });
    const before = model.getSnapshot();
    for (const [start, end] of [
      [0, 5],
      [-1, 1],
      [2, 1],
      [0, Infinity],
      [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER],
    ])
      expect(() => model.setViewport(start, end)).toThrow(RangeError);
    expect(model.getSnapshot()).toBe(before);
    expect(getRows).not.toHaveBeenCalled();
  });
  it("includes buffer rows in bounds and enforces the configured window cap", async () => {
    const { model } = fixture(20, { buffer: 1, maxWindowSize: 4 });
    model.setViewport(1, 3);
    await idle(model);
    expect(model.getSnapshot().window).toEqual({ startRow: 0, endRow: 4 });
    const before = model.getSnapshot();
    expect(() => model.setViewport(1, 5)).toThrow(/window/);
    expect(model.getSnapshot()).toBe(before);
  });
  it("caps actual outstanding requests even when old providers ignore cancellation", async () => {
    const first = deferred<InfiniteResponse<Row>>(),
      second = deferred<InfiniteResponse<Row>>();
    const getRows = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const model = new InfiniteRowModel<Row>(
      { getRows },
      options({ maxConcurrent: 1 }),
    );
    model.setViewport(0, 2);
    await turns();
    model.setViewport(10, 12);
    await turns();
    expect(getRows).toHaveBeenCalledTimes(1);
    expect(getRows.mock.calls[0][0].signal.aborted).toBe(true);
    expect(model.getSnapshot().queuedBlocks).toEqual([5]);
    first.resolve({ rows: rows(0, 2), rowCount: 20 });
    await turns();
    expect(getRows).toHaveBeenCalledTimes(2);
    second.resolve({ rows: rows(10, 12), rowCount: 20 });
    await idle(model);
    expect(model.getSnapshot().rows.map((row) => row.index)).toEqual([10, 11]);
    expect(model.getSnapshot().cachedBlocks).toEqual([5]);
  });
  it("schedules queued blocks as slots settle and keeps their logical ordering", async () => {
    const tasks = [
      deferred<InfiniteResponse<Row>>(),
      deferred<InfiniteResponse<Row>>(),
      deferred<InfiniteResponse<Row>>(),
    ];
    let index = 0;
    const getRows = vi.fn(() => tasks[index++].promise);
    const model = new InfiniteRowModel<Row>(
      { getRows },
      options({ maxConcurrent: 2 }),
    );
    model.setViewport(0, 6);
    await turns();
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(model.getSnapshot().queuedBlocks).toEqual([2]);
    tasks[1].resolve({ rows: rows(2, 4), rowCount: 6 });
    await turns();
    expect(getRows).toHaveBeenCalledTimes(3);
    tasks[2].resolve({ rows: rows(4, 6), rowCount: 6 });
    tasks[0].resolve({ rows: rows(0, 2), rowCount: 6 });
    await idle(model);
    expect(model.getSnapshot().rows.map((row) => row.index)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
  it("does not invoke providers superseded before their initial microtask", async () => {
    const { model, getRows } = fixture(20, { maxConcurrent: 1 });
    model.setViewport(0, 2);
    model.setViewport(4, 6);
    await idle(model);
    expect(getRows).toHaveBeenCalledTimes(1);
    expect(getRows.mock.calls[0][0].startRow).toBe(4);
  });
  it("fences query generations and waits for canceled slots before fetching a new query", async () => {
    const old = deferred<InfiniteResponse<Row>>();
    const getRows = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue({ rows: rows(0, 2), rowCount: 9 });
    const model = new InfiniteRowModel<Row>(
      { getRows },
      options({ maxConcurrent: 1 }),
    );
    model.setViewport(0, 2);
    await turns();
    model.setQuery({ sorting: [{ columnId: "value", direction: "desc" }] });
    expect(getRows.mock.calls[0][0].signal.aborted).toBe(true);
    old.resolve({ rows: rows(0, 2), rowCount: 500 });
    await idle(model);
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(getRows.mock.calls[1][0].sorting).toEqual([
      { columnId: "value", direction: "desc" },
    ]);
    expect(model.getSnapshot().rowCount).toBe(9);
  });
  it("owns source responses, snapshots, getRow copies and query request copies", async () => {
    const sourceRows = rows(0, 2),
      sorting = [{ columnId: "value", direction: "asc" as const }];
    const getRows = vi.fn(async (request: DataRequest) => {
      request.sorting[0].direction = "desc";
      return { rows: sourceRows, rowCount: 2 };
    });
    const model = new InfiniteRowModel<Row>(
      { getRows },
      options({ query: { sorting } }),
    );
    sorting[0].columnId = "changed";
    model.setViewport(0, 2);
    await idle(model);
    sourceRows[0].value = 999;
    const copy = model.getRow(0)!;
    copy.value = 888;
    expect(model.getSnapshot().rows[0].data.value).toBe(0);
    expect(model.getRow(0)?.value).toBe(0);
    expect(model.getQuery().sorting[0]).toEqual({
      columnId: "value",
      direction: "asc",
    });
    expect(Object.isFrozen(model.getSnapshot().rows[0].data)).toBe(true);
  });
  it("keeps failures visible without automatic retry loops and retries explicitly", async () => {
    const getRows = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ rows: rows(0, 2), rowCount: 2 });
    const model = new InfiniteRowModel<Row>({ getRows }, options());
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().error).toBe("offline");
    model.setViewport(0, 2);
    await turns();
    expect(getRows).toHaveBeenCalledTimes(1);
    model.retry();
    await idle(model);
    expect(model.getSnapshot().error).toBeNull();
    expect(getRows).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["empty Error", (): unknown => new Error()],
    ["blank text", (): unknown => "   "],
    [
      "throwing text conversion",
      (): unknown => ({
        toString(): never {
          throw new Error("conversion failed");
        },
      }),
    ],
  ] as const)("keeps an actionable failure for %s", async (_name, reason) => {
    const model = new InfiniteRowModel<Row>(
      {
        getRows: async () => {
          throw reason();
        },
      },
      options(),
    );
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().error?.trim().length).toBeGreaterThan(0);
    expect(model.getSnapshot().failedBlocks).toHaveLength(1);
    model.dispose();
  });
  it("bounds displayed provider errors without losing retry ownership", async () => {
    const model = new InfiniteRowModel<Row>(
      {
        getRows: async () => {
          throw new Error("x".repeat(10000));
        },
      },
      options(),
    );
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().error?.length).toBeLessThanOrEqual(4096);
    expect(model.getSnapshot().failedBlocks).toHaveLength(1);
    model.dispose();
  });
  it("refreshes an empty result into growing data", async () => {
    const getRows = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValue({ rows: rows(0, 2), rowCount: 3 });
    const model = new InfiniteRowModel<Row>({ getRows }, options());
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().rowCount).toBe(0);
    model.refresh();
    await idle(model);
    expect(model.getSnapshot().rowCount).toBe(3);
    expect(model.getSnapshot().rows).toHaveLength(2);
  });
  it.each([
    { rows: rows(0, 3), rowCount: 3 },
    { rows: rows(0, 1), rowCount: 3 },
    { rows: rows(0, 2), rowCount: -1 },
    { rows: rows(0, 2), rowCount: 1.5 },
    { rows: "invalid", rowCount: 2 },
  ])(
    "rejects invalid block shape or exact count atomically: %j",
    async (response) => {
      const model = new InfiniteRowModel<Row>(
        { getRows: async () => response as InfiniteResponse<Row> },
        options(),
      );
      model.setViewport(0, 2);
      await idle(model);
      expect(model.getSnapshot().error).toBeTruthy();
      expect(model.getSnapshot().cachedBlocks).toEqual([]);
      expect(model.getSnapshot().rowCount).toBeNull();
    },
  );
  it("rejects duplicate IDs across resident blocks without changing accepted count or rows", async () => {
    const model = new InfiniteRowModel<Row>(
      {
        getRows: async ({ startRow }) => ({
          rows: startRow ? rows(0, 2) : rows(0, 2),
          rowCount: 6,
        }),
      },
      options(),
    );
    model.setViewport(0, 2);
    await idle(model);
    model.setViewport(2, 4);
    await idle(model);
    expect(model.getSnapshot().error).toContain("duplicate");
    expect(model.getSnapshot().cachedBlocks).toEqual([0]);
    expect(model.getRow(0)?.id).toBe("r0");
  });
  it("rejects a count change until refresh and preserves accepted blocks", async () => {
    const model = new InfiniteRowModel<Row>(
      {
        getRows: async ({ startRow, endRow }) => ({
          rows: rows(startRow, endRow),
          rowCount: startRow ? 20 : 10,
        }),
      },
      options(),
    );
    model.setViewport(0, 2);
    await idle(model);
    model.setViewport(2, 4);
    await idle(model);
    expect(model.getSnapshot().rowCount).toBe(10);
    expect(model.getSnapshot().error).toContain("refresh");
    expect(model.getSnapshot().cachedBlocks).toEqual([0]);
  });
  it("remembers accepted positions after eviction when validating terminal counts", async () => {
    const model = new InfiniteRowModel<Row>(
      {
        getRows: async ({ startRow, endRow }) =>
          startRow === 0
            ? { rows: [], rowCount: 0 }
            : { rows: rows(startRow, endRow) },
      },
      options({ maxBlocks: 1 }),
    );
    model.setViewport(4, 6);
    await idle(model);
    model.setViewport(8, 10);
    await idle(model);
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().error).toContain("contradicts");
    expect(model.getSnapshot().rowCount).toBeNull();
    expect(model.getSnapshot().cachedBlocks).toEqual([4]);
  });
  it("validates query changes before aborting the current generation", async () => {
    const task = deferred<InfiniteResponse<Row>>(),
      getRows = vi.fn((_request: DataRequest) => task.promise);
    const model = new InfiniteRowModel<Row>({ getRows }, options());
    model.setViewport(0, 2);
    await turns();
    const before = model.getSnapshot();
    expect(() =>
      model.setQuery({
        sorting: [{ columnId: "value", direction: "invalid" as never }],
      }),
    ).toThrow();
    expect(model.getSnapshot()).toBe(before);
    expect(getRows.mock.calls[0][0].signal.aborted).toBe(false);
    model.dispose();
    task.resolve({ rows: rows(0, 2), rowCount: 2 });
    await turns();
  });
  it("retains the newest viewport installed by a synchronous abort listener", async () => {
    const old = deferred<InfiniteResponse<Row>>();
    let model!: InfiniteRowModel<Row>;
    const getRows = vi.fn((request: DataRequest) => {
      if (request.startRow === 0) {
        request.signal.addEventListener(
          "abort",
          () => model.setViewport(10, 12),
          { once: true },
        );
        return old.promise;
      }
      return Promise.resolve({
        rows: rows(request.startRow, request.endRow),
        rowCount: 20,
      });
    });
    model = new InfiniteRowModel<Row>(
      { getRows },
      options({ maxConcurrent: 1 }),
    );
    model.setViewport(0, 2);
    await turns();
    model.setViewport(4, 6);
    old.resolve({ rows: rows(0, 2), rowCount: 20 });
    await idle(model);
    expect(model.getSnapshot().viewport).toEqual({ startRow: 10, endRow: 12 });
    expect(model.getSnapshot().rows.map((row) => row.index)).toEqual([10, 11]);
    expect(getRows.mock.calls.map(([request]) => request.startRow)).toEqual([
      0, 10,
    ]);
  });
  it("retains a newer query installed by an abort listener during refresh", async () => {
    const old = deferred<InfiniteResponse<Row>>();
    let model!: InfiniteRowModel<Row>;
    const getRows = vi.fn((request: DataRequest) => {
      if (!request.sorting.length) {
        request.signal.addEventListener(
          "abort",
          () =>
            model.setQuery({
              sorting: [{ columnId: "value", direction: "desc" }],
            }),
          { once: true },
        );
        return old.promise;
      }
      return Promise.resolve({ rows: rows(0, 2), rowCount: 2 });
    });
    model = new InfiniteRowModel<Row>(
      { getRows },
      options({ maxConcurrent: 1 }),
    );
    model.setViewport(0, 2);
    await turns();
    model.refresh();
    old.resolve({ rows: rows(0, 2), rowCount: 100 });
    await idle(model);
    expect(model.getQuery().sorting).toEqual([
      { columnId: "value", direction: "desc" },
    ]);
    expect(model.getSnapshot().rowCount).toBe(2);
    expect(getRows).toHaveBeenCalledTimes(2);
  });
  it("captures the original ID callback without freezing borrowed functions", async () => {
    const config = options(),
      original = config.getRowId;
    const model = new InfiniteRowModel<Row>(
      { getRows: async () => ({ rows: rows(0, 2), rowCount: 2 }) },
      config,
    );
    config.getRowId = () => "duplicate";
    model.setViewport(0, 2);
    await idle(model);
    expect(model.getSnapshot().error).toBeNull();
    expect(model.getSnapshot().rows.map((row) => row.id)).toEqual(["r0", "r1"]);
    expect(Object.isFrozen(original)).toBe(false);
  });
  it("resets queries to row zero while refresh retains the current logical viewport", async () => {
    const { model, getRows } = fixture(100);
    model.setViewport(40, 44);
    await idle(model);
    const queryRevision = model.getSnapshot().queryRevision;
    model.refresh();
    await idle(model);
    expect(model.getSnapshot().viewport).toEqual({ startRow: 40, endRow: 44 });
    expect(model.getSnapshot().queryRevision).toBe(queryRevision);
    model.setQuery({ sorting: [{ columnId: "value", direction: "desc" }] });
    await idle(model);
    expect(model.getSnapshot().viewport).toEqual({ startRow: 0, endRow: 4 });
    expect(model.getSnapshot().queryRevision).toBe(queryRevision + 1);
    expect(getRows.mock.calls.at(-1)?.[0].startRow).toBeLessThan(4);
  });
  it("validates a raw viewport even when an empty known result could clip an oversized request", async () => {
    const { model, getRows } = fixture(0);
    model.setViewport(0, 2);
    await idle(model);
    const before = model.getSnapshot();
    expect(() => model.setViewport(0, 1000)).toThrow();
    expect(model.getSnapshot()).toBe(before);
    model.refresh();
    await idle(model);
    expect(model.getSnapshot().error).toBeNull();
    expect(getRows).toHaveBeenCalledTimes(2);
  });
  it("releases observers and aborts provider work on idempotent disposal", async () => {
    const task = deferred<InfiniteResponse<Row>>();
    let signal: AbortSignal | undefined;
    const model = new InfiniteRowModel<Row>(
      {
        getRows: (request) => {
          signal = request.signal;
          return task.promise;
        },
      },
      options(),
    );
    const listener = vi.fn(),
      stop = model.subscribe(listener);
    model.setViewport(0, 2);
    await turns();
    stop();
    const calls = listener.mock.calls.length;
    model.dispose();
    model.dispose();
    expect(signal?.aborted).toBe(true);
    task.resolve({ rows: rows(0, 2), rowCount: 100 });
    await turns();
    expect(model.getSnapshot().disposed).toBe(true);
    expect(model.getSnapshot().rows).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(() => model.setViewport(0, 2)).toThrow(/disposed/);
    expect(() => model.subscribe(() => {})).toThrow(/disposed/);
  });
  it.each([
    { blockSize: 0 },
    { maxBlocks: 1001 },
    { maxConcurrent: 17 },
    { maxWindowSize: 10001 },
    { buffer: -1 },
    { blockSize: 10000, maxBlocks: 1000 },
  ])("rejects invalid resource bounds: %j", (patch) => {
    expect(
      () =>
        new InfiniteRowModel<Row>(
          { getRows: async () => ({ rows: [] }) },
          options(patch),
        ),
    ).toThrow(RangeError);
  });
});
