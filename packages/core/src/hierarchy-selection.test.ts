import { describe, expect, it, vi } from "vitest";
import type { RowNode } from "./types.js";
import { createGrid } from "./index.js";
import {
  createHierarchySelectionPlan,
  HierarchySelectionError,
  HIERARCHY_SELECTION_LIMITS,
} from "./hierarchy-selection.js";
const row = (id: string, children?: RowNode<unknown>[]): RowNode<unknown> => ({
  id,
  kind: "row",
  depth: 0,
  children,
});
const group = (id: string, children: RowNode<unknown>[]): RowNode<unknown> => ({
  id,
  kind: "group",
  depth: 0,
  children,
});
const forest = () => [
  group("north", [row("a"), group("nested", [row("b"), row("c")])]),
  group("south", [row("d")]),
];

describe("resident model hierarchy planning", () => {
  it("rejects oversized source/depth before group value callbacks and skips irrelevant aggregates", () => {
    let reads = 0;
    const large = createGrid({
      rows: Array.from(
        { length: HIERARCHY_SELECTION_LIMITS.maxRows + 1 },
        (_, index) => ({ id: String(index) }),
      ),
      columns: [
        {
          id: "group",
          valueGetter: () => {
            reads++;
            return "same";
          },
        },
      ],
      getRowId: (row) => row.id,
      externalFilter: () => false,
      initialState: { groupBy: ["group"] },
    });
    expect(() => large.getHierarchySelectionPlan({ filtered: false })).toThrow(
      /source\/depth budget/,
    );
    expect(reads).toBe(0);
    const ids = Array.from(
      { length: HIERARCHY_SELECTION_LIMITS.maxDepth + 1 },
      (_, index) => `g${index}`,
    );
    const deep = createGrid({
      rows: [{ id: "r" }],
      columns: ids.map((id) => ({
        id,
        valueGetter: () => {
          reads++;
          return "same";
        },
      })),
      getRowId: (row) => row.id,
      externalFilter: () => false,
      initialState: { groupBy: ids },
    });
    expect(() => deep.getHierarchySelectionPlan({ filtered: false })).toThrow(
      /source\/depth budget/,
    );
    expect(reads).toBe(0);
    const aggregate = vi.fn(() => 5),
      normal = createGrid({
        rows: [
          { id: "a", region: "North", amount: 2 },
          { id: "b", region: "North", amount: 3 },
        ],
        columns: [
          { id: "region", field: "region" },
          { id: "amount", field: "amount", aggregate },
        ],
        getRowId: (row) => row.id,
        initialState: { groupBy: ["region"] },
      });
    normal.getRowModel();
    aggregate.mockClear();
    normal.getHierarchySelectionPlan({ filtered: false });
    expect(aggregate).not.toHaveBeenCalled();
    expect(normal.getRowModel()[0].aggregates?.amount).toBe(5);
  });
  it("stops source grouping work during construction without publishing or building all levels", () => {
    let reads = 0;
    const ids = Array.from(
      { length: HIERARCHY_SELECTION_LIMITS.maxDepth },
      (_, index) => `g${index}`,
    );
    const model = createGrid({
      rows: Array.from({ length: 8000 }, (_, index) => ({ id: String(index) })),
      columns: ids.map((id) => ({
        id,
        valueGetter: () => {
          reads++;
          return "same";
        },
      })),
      getRowId: (row) => row.id,
      externalFilter: () => false,
      initialState: { groupBy: ids },
    });
    const before = model.getState(),
      changed = vi.fn(),
      stop = model.subscribe(changed);
    expect(() => model.getHierarchySelectionPlan({ filtered: false })).toThrow(
      /projection resource budget/,
    );
    expect(reads).toBeLessThanOrEqual(
      HIERARCHY_SELECTION_LIMITS.maxProjectionWork,
    );
    expect(reads).toBeLessThan(8000 * ids.length);
    expect(model.getState()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    stop();
  });
  it("bounds tree path work/depth while preserving ordinary filtered tree reads", () => {
    const prefix = Array.from(
      { length: HIERARCHY_SELECTION_LIMITS.maxDepth },
      (_, index) => `p${index}`,
    );
    const model = createGrid({
      rows: Array.from({ length: 4000 }, (_, index) => ({
        id: String(index),
        path: [...prefix, String(index)],
      })),
      columns: [{ id: "id", field: "id" }],
      getRowId: (row) => row.id,
      getTreePath: (row) => row.path,
      externalFilter: () => false,
    });
    const before = model.getState();
    expect(() => model.getHierarchySelectionPlan({ filtered: false })).toThrow(
      /projection resource budget/,
    );
    expect(model.getState()).toBe(before);
    expect(model.getRowModel()).toEqual([]);
    const tooDeep = createGrid({
      rows: [{ id: "r", path: [...prefix, "extra", "leaf"] }],
      columns: [{ id: "id", field: "id" }],
      getRowId: (row) => row.id,
      getTreePath: (row) => row.path,
      externalFilter: () => false,
    });
    expect(() =>
      tooDeep.getHierarchySelectionPlan({ filtered: false }),
    ).toThrow(/path depth budget/);
  });
  it("plans collapsed/off-page groups with explicit all/filtered source scopes and silent reads", () => {
    const model = createGrid({
      rows: [
        { id: "a", region: "north", amount: 1 },
        { id: "b", region: "north", amount: 2 },
        { id: "c", region: "south", amount: 3 },
      ],
      columns: [
        { id: "region", field: "region" },
        { id: "amount", field: "amount", type: "number" },
      ],
      getRowId: (row) => row.id,
      initialState: { groupBy: ["region"], pageSize: 1 },
    });
    const north = model.getRowModel()[0].id,
      south = model.getRowModel()[1].id;
    expect(model.getPageRows()).toHaveLength(1);
    expect(model.getHierarchySelectionPlan().getRowIds(north)).toEqual([
      "a",
      "b",
    ]);
    model.setFilter("amount", { op: "gte", value: "2" });
    model.selectRows(["a"]);
    const snapshot = model.getState(),
      changed = vi.fn(),
      stop = model.subscribe(changed);
    const filtered = model.getHierarchySelectionPlan(),
      all = model.getHierarchySelectionPlan({ filtered: false });
    expect(filtered.getRowIds(north)).toEqual(["b"]);
    expect(all.getRowIds(north)).toEqual(["a", "b"]);
    expect(all.getRowIds(south)).toEqual(["c"]);
    expect(filtered.resolve(snapshot.selected).toggle([north])).toEqual([
      "a",
      "b",
    ]);
    expect(model.getState()).toBe(snapshot);
    expect(changed).not.toHaveBeenCalled();
    stop();
    expect(() =>
      model.getHierarchySelectionPlan({
        filtered: "yes" as unknown as boolean,
      }),
    ).toThrow(/boolean/);
  });
  it("uses actual matching source identities when tree ancestors remain visible", () => {
    const model = createGrid({
      rows: [
        { id: "parent", path: ["Root"], amount: 1 },
        { id: "child", path: ["Root", "Child"], amount: 9 },
        { id: "other", path: ["Other"], amount: 2 },
      ],
      columns: [{ id: "amount", field: "amount", type: "number" }],
      getRowId: (row) => row.id,
      getTreePath: (row) => row.path,
    });
    model.setFilter("amount", { op: "gt", value: 5 });
    expect(model.getRowModel()[0].id).toBe("parent");
    expect(model.getHierarchySelectionPlan().getRowIds("parent")).toEqual([
      "child",
    ]);
    expect(
      model.getHierarchySelectionPlan({ filtered: false }).getRowIds("parent"),
    ).toEqual(["parent", "child"]);
    const filtered = model
      .getHierarchySelectionPlan()
      .resolve(["parent", "other"]);
    expect(filtered.toggle(["parent"])).toEqual(["parent", "other", "child"]);
  });
  it("does not confuse a real source ID with a synthetic group label", () => {
    const collision = 'group:[["string","north"]]';
    const model = createGrid({
      rows: [
        { id: collision, region: "north" },
        { id: "b", region: "north" },
      ],
      columns: [{ id: "region", field: "region" }],
      getRowId: (row) => row.id,
      initialState: { groupBy: ["region"] },
    });
    const node = model.getRowModel()[0];
    expect(node.id).not.toBe(collision);
    const plan = model.getHierarchySelectionPlan();
    expect(plan.resolve([]).toggle([node.id])).toEqual([collision, "b"]);
    expect(plan.resolve([]).toggle([collision])).toEqual([collision]);
  });
});

describe("compact hierarchy selection", () => {
  it("rejects a union that would exceed the selected-row budget without changing its snapshot", () => {
    const plan = createHierarchySelectionPlan([row("target")]);
    const snapshot = plan.resolve(
      Array.from(
        { length: HIERARCHY_SELECTION_LIMITS.maxRows },
        (_, index) => `outside${index}`,
      ),
    );
    expect(() => snapshot.toggle(["target"])).toThrow(/Selection row budget/);
    expect(snapshot.selection).toHaveLength(HIERARCHY_SELECTION_LIMITS.maxRows);
    expect(snapshot.getState("target")?.selected).toBe(0);
  });
  it("resolves collapsed descendants and mixed ancestors without selecting synthetic IDs", () => {
    const plan = createHierarchySelectionPlan(forest());
    expect(plan.nodeCount).toBe(7);
    expect(plan.rowIds).toEqual(["a", "b", "c", "d"]);
    const selection = plan.resolve(["b"]);
    expect(selection.getState("north")).toEqual({
      total: 3,
      selected: 1,
      checked: false,
      mixed: true,
    });
    expect(selection.getState("nested")).toEqual({
      total: 2,
      selected: 1,
      checked: false,
      mixed: true,
    });
    expect(selection.getState("b")).toEqual({
      total: 1,
      selected: 1,
      checked: true,
      mixed: false,
    });
    expect(selection.getState("south")).toEqual({
      total: 1,
      selected: 0,
      checked: false,
      mixed: false,
    });
    expect(selection.toggle(["north"])).toEqual(["b", "a", "c"]);
    expect(plan.resolve(["a", "b", "c", "d"]).toggle(["north"])).toEqual(["d"]);
  });
  it("unions overlapping targets once, preserves outside selections and honors explicit intent", () => {
    const plan = createHierarchySelectionPlan(forest()),
      state = plan.resolve(["d", "outside", "b", "b"]);
    expect(state.selection).toEqual(["d", "outside", "b"]);
    expect(state.getUnionState(["north", "nested", "a", "south"])).toEqual({
      total: 4,
      selected: 2,
      checked: false,
      mixed: true,
    });
    expect(state.getUnionState([])).toEqual({
      total: 0,
      selected: 0,
      checked: false,
      mixed: false,
    });
    expect(state.toggle(["nested", "north", "a", "north"], true)).toEqual([
      "d",
      "outside",
      "b",
      "a",
      "c",
    ]);
    expect(state.toggle(["north", "nested"], false)).toEqual(["d", "outside"]);
    expect(state.toggle([], true)).toBe(state.selection);
    expect(state.toggle(["south"], true)).toBe(state.selection);
    expect(state.toggle(["a"], false)).toBe(state.selection);
    expect(() => state.toggle(["missing"])).toThrow(HierarchySelectionError);
    expect(state.selection).toEqual(["d", "outside", "b"]);
  });
  it("limits selection to eligible rows while retaining hidden selected rows", () => {
    const plan = createHierarchySelectionPlan(forest(), {
      eligibleRowIds: ["b", "d"],
    });
    expect(plan.rowIds).toEqual(["b", "d"]);
    expect(plan.getRowIds("north")).toEqual(["b"]);
    const state = plan.resolve(["a", "c", "d"]);
    expect(state.getState("north")).toEqual({
      total: 1,
      selected: 0,
      checked: false,
      mixed: false,
    });
    expect(state.toggle(["north"])).toEqual(["a", "c", "d", "b"]);
    expect(plan.resolve(["a", "b", "c", "d"]).toggle(["north"])).toEqual([
      "a",
      "c",
      "d",
    ]);
    expect(() =>
      createHierarchySelectionPlan(forest(), { eligibleRowIds: ["north"] }),
    ).toThrow(HierarchySelectionError);
    expect(() =>
      createHierarchySelectionPlan(forest(), { eligibleRowIds: ["unknown"] }),
    ).toThrow(HierarchySelectionError);
  });
  it("includes data-bearing branches, yet can exclude nonmatching source ancestors", () => {
    const nodes = [row("parent", [row("child")])];
    expect(createHierarchySelectionPlan(nodes).getRowIds("parent")).toEqual([
      "parent",
      "child",
    ]);
    const plan = createHierarchySelectionPlan(nodes, {
      eligibleRowIds: ["child"],
    });
    expect(plan.getRowIds("parent")).toEqual(["child"]);
    expect(plan.resolve([]).toggle(["parent"])).toEqual(["child"]);
  });
  it("owns frozen snapshots without freezing borrowed metadata, data or selections", () => {
    const nodes = forest(),
      selected = ["b"],
      plan = createHierarchySelectionPlan(nodes),
      state = plan.resolve(selected);
    nodes[0].children!.splice(0);
    selected.push("a");
    expect(plan.getRowIds("north")).toEqual(["a", "b", "c"]);
    expect(state.selection).toEqual(["b"]);
    for (const value of [
      plan,
      plan.rowIds,
      plan.getRowIds("north"),
      state,
      state.selection,
      state.getState("north"),
      state.toggle(["north"]),
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(nodes)).toBe(false);
    expect(Object.isFrozen(nodes[0])).toBe(false);
    expect(plan.getRowIds("unknown")).toBeUndefined();
    expect(state.getState("unknown")).toBeUndefined();
  });
  it("handles empty forests, empty groups and special string IDs", () => {
    const empty = createHierarchySelectionPlan([]).resolve([]);
    expect(empty.toggle([])).toBe(empty.selection);
    const plan = createHierarchySelectionPlan([
      group("empty", []),
      row("__proto__"),
      row("constructor"),
    ]);
    expect(plan.resolve([]).getState("empty")).toEqual({
      total: 0,
      selected: 0,
      checked: false,
      mixed: false,
    });
    expect(plan.resolve([]).toggle(["empty"])).toEqual([]);
    expect(plan.resolve([]).toggle(["__proto__", "constructor"])).toEqual([
      "__proto__",
      "constructor",
    ]);
  });
  it("does not invoke row data, metadata or array getters", () => {
    const data = vi.fn(() => {
        throw new Error("data");
      }),
      metadata = vi.fn(() => "x"),
      entry = vi.fn(() => row("x"));
    const safe = row("r");
    Object.defineProperty(safe, "data", { get: data });
    expect(createHierarchySelectionPlan([safe]).rowIds).toEqual(["r"]);
    expect(data).not.toHaveBeenCalled();
    const bad = row("bad");
    Object.defineProperty(bad, "id", { get: metadata });
    expect(() => createHierarchySelectionPlan([bad])).toThrow(
      HierarchySelectionError,
    );
    expect(metadata).not.toHaveBeenCalled();
    const array: RowNode<unknown>[] = [];
    Object.defineProperty(array, "0", { get: entry });
    expect(() => createHierarchySelectionPlan(array)).toThrow(
      HierarchySelectionError,
    );
    expect(entry).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    [null],
    [{ id: "x", kind: "bad" }],
    [row("")],
    [Object.assign(row("x"), { children: null })],
    new Array(1),
    Object.assign([], { extra: true }),
  ])("rejects malformed forests atomically: %j", (nodes) => {
    expect(() =>
      createHierarchySelectionPlan(nodes as RowNode<unknown>[]),
    ).toThrow(HierarchySelectionError);
  });
  it("distinguishes a cycle from repeated/duplicate nodes", () => {
    const cyclic = row("cycle");
    cyclic.children = [cyclic];
    try {
      createHierarchySelectionPlan([cyclic]);
      throw new Error("accepted");
    } catch (error) {
      expect(error).toMatchObject({ code: "CYCLE" });
    }
    for (const nodes of [
      [row("x"), row("x")],
      (() => {
        const child = row("x");
        return [group("a", [child]), group("b", [child])];
      })(),
    ])
      expect(() => createHierarchySelectionPlan(nodes)).toThrow(/unique/);
  });
  it("enforces depth, scheduling, ID text and selection budgets before returning work", () => {
    let deep = row("leaf");
    for (let index = 0; index <= HIERARCHY_SELECTION_LIMITS.maxDepth; index++)
      deep = group(`g${index}`, [deep]);
    expect(() => createHierarchySelectionPlan([deep])).toThrow(/depth budget/);
    expect(() =>
      createHierarchySelectionPlan(
        new Array(HIERARCHY_SELECTION_LIMITS.maxNodes + 1),
      ),
    ).toThrow(/array budget/);
    expect(() =>
      createHierarchySelectionPlan([
        row("x".repeat(HIERARCHY_SELECTION_LIMITS.maxIdLength + 1)),
      ]),
    ).toThrow(/text budget/);
    const plan = createHierarchySelectionPlan(forest());
    expect(() =>
      plan.resolve(new Array(HIERARCHY_SELECTION_LIMITS.maxRows + 1)),
    ).toThrow(/array budget/);
    expect(() => plan.resolve([1] as unknown as string[])).toThrow(/strings/);
    expect(() =>
      plan.resolve([]).toggle(["north"], "yes" as unknown as boolean),
    ).toThrow(/boolean/);
  });
  it("agrees with an independent recursive set oracle over overlapping generated forests", () => {
    for (let seed = 0; seed < 20; seed++) {
      const nodes = Array.from({ length: 4 }, (_, branch) =>
        group(
          `g${branch}`,
          Array.from({ length: 5 }, (_, leaf) => row(`r${branch}-${leaf}`)),
        ),
      );
      const allowed = Array.from(
        { length: 20 },
        (_, index) => `r${Math.floor(index / 5)}-${index % 5}`,
      ).filter((_, index) => (index + seed) % 3 !== 0);
      const selected = allowed.filter((_, index) => (index + seed) % 2 === 0),
        plan = createHierarchySelectionPlan(nodes, { eligibleRowIds: allowed });
      const collect = (node: RowNode<unknown>): string[] => [
        ...(node.kind === "row" && allowed.includes(node.id) ? [node.id] : []),
        ...(node.children ?? []).flatMap(collect),
      ];
      for (const node of [
        ...nodes,
        ...nodes.flatMap((item) => item.children!),
      ]) {
        const targets = collect(node),
          count = targets.filter((id) => selected.includes(id)).length;
        expect(plan.resolve(selected).getState(node.id)).toEqual({
          total: targets.length,
          selected: count,
          checked: targets.length > 0 && count === targets.length,
          mixed: count > 0 && count < targets.length,
        });
        const actual = plan.resolve(selected).toggle([node.id]);
        const expected =
          targets.length > 0 && targets.every((id) => selected.includes(id))
            ? selected.filter((id) => !targets.includes(id))
            : [...new Set([...selected, ...targets])];
        expect(actual).toEqual(expected);
      }
    }
  });
});
