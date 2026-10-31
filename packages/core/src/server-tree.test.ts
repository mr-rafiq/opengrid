import { describe, expect, it } from "vitest";
import {
  ServerSideRowModel,
  type ServerRequest,
  type ServerResponse,
} from "./server-side";
import { projectServerTree, serverNodeId, serverRouteKey } from "./server-tree";
type Row = { name: string; amount: number };
const root: ServerResponse<Row> = {
  nodes: [
    { kind: "group", id: "same", key: "A", aggregates: { amount: 100 } },
    { kind: "group", id: "second", key: "B", aggregates: { amount: 200 } },
  ],
  rowCount: 2,
};
const source = {
  getRows: async (request: ServerRequest): Promise<ServerResponse<Row>> =>
    request.groupKeys.length
      ? {
          nodes: [
            {
              kind: "row",
              id: "same",
              data: { name: request.groupKeys[0], amount: 1 },
            },
          ],
          rowCount: 1,
        }
      : root,
};
describe("server cache reservations and simultaneous tree projection", () => {
  it("retains visible sibling blocks within the cache bound and releases them", async () => {
    const model = new ServerSideRowModel(source, {
      blockSize: 2,
      maxBlocks: 3,
    });
    const owner = {};
    model.setActiveBlocks(owner, [
      { groupKeys: [], blockIndex: 0 },
      { groupKeys: ["A"], blockIndex: 0 },
      { groupKeys: ["B"], blockIndex: 0 },
    ]);
    await model.loadBlock([], 0);
    await model.loadBlock(["A"], 0);
    await model.loadBlock(["B"], 0);
    await model.loadBlock(["C"], 0);
    expect(model.getSnapshot().blocks.map((b) => b.groupKeys)).toEqual([
      [],
      ["A"],
      ["B"],
    ]);
    model.releaseActiveBlocks(owner);
    await model.loadBlock(["C"], 0);
    expect(model.getSnapshot().blocks.map((b) => b.groupKeys)).toContainEqual([
      "C",
    ]);
    expect(model.getSnapshot().blocks).toHaveLength(3);
  });
  it("rejects cross-owner overcommit atomically and allows shared reservations", async () => {
    const model = new ServerSideRowModel(source, {
      blockSize: 2,
      maxBlocks: 2,
    });
    const one = {},
      two = {};
    model.setActiveBlocks(one, [{ groupKeys: [], blockIndex: 0 }]);
    model.setActiveBlocks(two, [{ groupKeys: ["A"], blockIndex: 0 }]);
    expect(() =>
      model.setActiveBlocks(one, [
        { groupKeys: [], blockIndex: 0 },
        { groupKeys: ["B"], blockIndex: 0 },
      ]),
    ).toThrow(/capacity/);
    await model.loadBlock([], 0);
    await model.loadBlock(["A"], 0);
    await model.loadBlock(["B"], 0);
    expect(model.getSnapshot().blocks.map((b) => b.groupKeys)).toEqual([
      [],
      ["A"],
    ]);
    model.setActiveBlocks(two, [{ groupKeys: [], blockIndex: 0 }]);
    model.setActiveBlocks(one, [{ groupKeys: ["B"], blockIndex: 0 }]);
    await model.loadBlock(["B"], 0);
    expect(model.getSnapshot().blocks).toHaveLength(2);
  });
  it("keeps query identity monotonic for same-query resets and detached responses", async () => {
    const model = new ServerSideRowModel(source, { blockSize: 2 });
    expect(model.getSnapshot().queryRevision).toBe(0);
    await model.loadBlock([], 0);
    model.setQuery({});
    expect(model.getSnapshot().queryRevision).toBe(1);
    model.setQuery({});
    expect(model.getSnapshot().queryRevision).toBe(2);
    expect(model.getSnapshot().blocks).toEqual([]);
  });
  it("projects two branches in provider order with route-qualified reused IDs and authoritative aggregates", async () => {
    const model = new ServerSideRowModel(source, {
      blockSize: 2,
      maxBlocks: 4,
    });
    await model.loadBlock([], 0);
    await model.loadBlock(["A"], 0);
    await model.loadBlock(["B"], 0);
    const plan = projectServerTree(
      model.getSnapshot(),
      2,
      new Set([serverRouteKey(["A"]), serverRouteKey(["B"])]),
    );
    expect(plan.entries.map((entry) => entry.id)).toEqual([
      serverNodeId([], "same"),
      serverNodeId(["A"], "same"),
      serverNodeId([], "second"),
      serverNodeId(["B"], "same"),
    ]);
    expect(plan.addresses).toHaveLength(3);
    expect(plan.entries.map((entry) => entry.depth)).toEqual([0, 1, 0, 1]);
    expect(
      plan.entries[0].kind === "node" &&
        plan.entries[0].node.kind === "group" &&
        plan.entries[0].node.aggregates?.amount,
    ).toBe(100);
    const collapsed = projectServerTree(
      model.getSnapshot(),
      2,
      new Set([serverRouteKey(["B"])]),
    );
    expect(collapsed.entries).toHaveLength(3);
    expect(collapsed.addresses.map((a) => a.groupKeys)).toEqual([[], ["B"]]);
  });
  it("exposes per-route more/loading/error/empty statuses without inventing missing rows", async () => {
    const model = new ServerSideRowModel<Row>(
      {
        getRows: async ({ groupKeys, startRow }) =>
          groupKeys.length
            ? {
                nodes: Array.from(
                  { length: Math.min(2, 3 - startRow) },
                  (_, i) => ({
                    kind: "row" as const,
                    id: String(i + startRow),
                    data: { name: String(i + startRow), amount: 1 },
                  }),
                ),
                rowCount: 3,
              }
            : root,
      },
      { blockSize: 2, maxBlocks: 5 },
    );
    await model.loadBlock([], 0);
    let plan = projectServerTree(
      model.getSnapshot(),
      2,
      new Set([serverRouteKey(["A"])]),
    );
    expect(plan.entries[1].kind).toBe("loading");
    await model.loadBlock(["A"], 0);
    plan = projectServerTree(
      model.getSnapshot(),
      2,
      new Set([serverRouteKey(["A"])]),
    );
    expect(plan.entries.map((e) => e.kind)).toEqual([
      "node",
      "node",
      "node",
      "more",
      "node",
    ]);
    await model.loadBlock(["A"], 1);
    plan = projectServerTree(
      model.getSnapshot(),
      2,
      new Set([serverRouteKey(["A"])]),
      new Map([[serverRouteKey(["A"]), 2]]),
    );
    expect(plan.entries.filter((e) => e.kind === "node")).toHaveLength(5);
    expect(plan.entries.some((e) => e.kind === "more")).toBe(false);
    const empty = new ServerSideRowModel<Row>({
      getRows: async () => ({ nodes: [], rowCount: 0 }),
    });
    await empty.loadBlock([], 0);
    expect(
      projectServerTree(empty.getSnapshot(), 100, new Set()).entries[0].kind,
    ).toBe("empty");
    const failed = new ServerSideRowModel<Row>({
      getRows: async () => {
        throw Error("Offline");
      },
    });
    await expect(failed.loadBlock([], 0)).rejects.toThrow("Offline");
    expect(
      projectServerTree(failed.getSnapshot(), 100, new Set()).entries[0],
    ).toMatchObject({ kind: "error", message: "Offline" });
  });
  it("rejects duplicate group route keys within and across blocks", async () => {
    const duplicate = new ServerSideRowModel<Row>({
      getRows: async () => ({
        nodes: [
          { kind: "group", id: "one", key: "A" },
          { kind: "group", id: "two", key: "A" },
        ],
        rowCount: 2,
      }),
    });
    await expect(duplicate.loadBlock([], 0)).rejects.toThrow(/group keys/);
    const across = new ServerSideRowModel<Row>(
      {
        getRows: async ({ startRow }) => ({
          nodes: [{ kind: "group", id: String(startRow), key: "A" }],
          rowCount: 2,
        }),
      },
      { blockSize: 1 },
    );
    await across.loadBlock([], 0);
    await expect(across.loadBlock([], 1)).rejects.toThrow(/group keys/);
  });
  it("bounds projection pages and validates reservations without mutating the snapshot", async () => {
    const model = new ServerSideRowModel(source, {
      blockSize: 2,
      maxBlocks: 2,
    });
    await model.loadBlock([], 0);
    const before = model.getSnapshot();
    expect(() =>
      projectServerTree(before, 2, new Set(), new Map([["[]", 0]])),
    ).toThrow();
    expect(() =>
      model.setActiveBlocks({}, [{ groupKeys: [], blockIndex: -1 }]),
    ).toThrow();
    projectServerTree(before, 2, new Set());
    expect(model.getSnapshot()).toBe(before);
  });
  it("stops recursive expansion at the explicit 32-level boundary", () => {
    const blocks = Array.from({ length: 34 }, (_, depth) => ({
      groupKeys: Array(depth).fill("A") as string[],
      blockIndex: 0,
      response: {
        nodes: [{ kind: "group" as const, id: "same", key: "A" }],
        rowCount: 1,
      },
    }));
    const expanded = new Set(
      blocks.slice(1).map((block) => serverRouteKey(block.groupKeys)),
    );
    const plan = projectServerTree(
      { revision: 1, queryRevision: 0, blocks, loading: [], errors: [] },
      1,
      expanded,
    );
    expect(plan.entries).toHaveLength(33);
    expect(plan.addresses).toHaveLength(33);
    expect(plan.entries.at(-1)).toMatchObject({
      kind: "node",
      depth: 32,
      expanded: false,
    });
  });
});
