import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index";
import { createCalculatedGrid } from "./calculated-grid";
import { planRowMove, replayRowMove } from "./row-order";
import type { GridOptions } from "./types";

type Item = { id: string; value: number };
const freshRows = (): Item[] =>
  "abcde".split("").map((id, value) => ({ id, value }));
function fixture(patch: Partial<GridOptions<Item>> = {}) {
  return createGrid({
    rows: freshRows(),
    columns: [
      { id: "id", field: "id" },
      { id: "value", field: "value", editable: true, type: "number" },
    ],
    getRowId: (row) => row.id,
    ...patch,
  });
}
const order = (model: ReturnType<typeof fixture>) =>
  model
    .getRows()
    .map((row) => row.id)
    .join("");

describe("atomic managed resident row order", () => {
  it.each([
    [["a"], "d", "before", "bcade"],
    [["a"], "d", "after", "bcdae"],
    [["e"], "b", "before", "aebcd"],
    [["e"], "b", "after", "abecd"],
    [["d", "b"], "e", "after", "acebd"],
    [["e", "c"], "a", "before", "ceabd"],
  ] as const)(
    "moves %j %s %s preserving resident source order",
    (ids, target, position, expected) => {
      const rows = freshRows(),
        model = fixture({ rows });
      model.selectRows(["e", "b"]);
      const selection = model.getState().selected,
        listener = vi.fn();
      model.subscribe(listener);
      expect(model.moveRows(ids, target, position)).toBeUndefined();
      expect(order(model)).toBe(expected);
      for (const row of model.getRows())
        expect(row).toBe(rows.find((original) => original.id === row.id));
      expect(model.getState().selected).toBe(selection);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(model.undo()).toBe(true);
      expect(order(model)).toBe("abcde");
      expect(model.redo()).toBe(true);
      expect(order(model)).toBe(expected);
    },
  );

  it("exhaustively replays all five-row subsets, anchors and directions", () => {
    const rows = freshRows();
    for (let mask = 0; mask < 32; mask++)
      for (const target of rows)
        for (const position of ["before", "after"] as const) {
          const ids = rows
            .filter((_, index) => mask & (1 << index))
            .map((row) => row.id)
            .reverse();
          const plan = planRowMove(
            rows,
            ids,
            target.id,
            position,
            (row) => row.id,
          );
          expect(plan.error).toBeUndefined();
          expect(new Set(plan.next).size).toBe(5);
          expect(plan.next.filter((row) => ids.includes(row.id))).toEqual(
            rows.filter((row) => ids.includes(row.id)),
          );
          expect(plan.next.filter((row) => !ids.includes(row.id))).toEqual(
            rows.filter((row) => !ids.includes(row.id)),
          );
          if (!plan.delta) {
            expect(plan.next).toBe(rows);
            continue;
          }
          expect(
            replayRowMove(plan.next, plan.delta, "undo", (row) => row.id),
          ).toEqual(rows);
          expect(
            replayRowMove(rows, plan.delta, "redo", (row) => row.id),
          ).toEqual(plan.next);
        }
  });

  it("keeps no-ops snapshot-stable and preserves redo and derived caches", () => {
    const model = fixture(),
      listener = vi.fn();
    model.editCell("b", "value", 9);
    model.undo();
    const state = model.getState(),
      filtered = model.getFilteredRows(),
      nodes = model.getRowModel();
    model.subscribe(listener);
    for (const [ids, target, position] of [
      [["b"], "b", "before"],
      [["a", "b"], "c", "before"],
      [["b", "c"], "a", "after"],
      [[], "c", "after"],
      [["a", "e"], "e", "after"],
    ] as const)
      expect(model.moveRows(ids, target, position)).toBeUndefined();
    expect(model.getState()).toBe(state);
    expect(model.getFilteredRows()).toEqual(filtered);
    model
      .getRowModel()
      .forEach((node, index) => expect(node).toBe(nodes[index]));
    expect(listener).not.toHaveBeenCalled();
    expect(model.redo()).toBe(true);
    expect(model.getRow("b")!.value).toBe(9);
  });

  it("validates all IDs before a target-in-selection no-op or mutation", () => {
    const model = fixture(),
      listener = vi.fn();
    const state = model.getState(),
      filtered = model.getFilteredRows();
    model.subscribe(listener);
    let getterCalls = 0;
    const accessor: string[] = ["a"];
    Object.defineProperty(accessor, "0", {
      get() {
        getterCalls++;
        return "a";
      },
    });
    const invalid: unknown[][] = [
      [["a", "a"], "b", "before"],
      [["a", "stale"], "a", "before"],
      [["a"], "missing", "after"],
      [[], "missing", "before"],
      [[""], "a", "after"],
      [[1], "a", "before"],
      [new Array(1), "b", "before"],
      [accessor, "b", "before"],
      [null, "a", "before"],
      [["a"], "", "before"],
      [["a"], "b", "sideways"],
      [Array(6).fill("a"), "b", "before"],
    ];
    for (const args of invalid)
      expect(
        (model.moveRows as (...args: unknown[]) => unknown)(...args),
      ).toEqual(expect.any(String));
    expect(getterCalls).toBe(0);
    expect(model.getState()).toBe(state);
    expect(model.getFilteredRows()).toEqual(filtered);
    expect(order(model)).toBe("abcde");
    expect(listener).not.toHaveBeenCalled();
    expect(model.undo()).toBe(false);
  });

  it("composes edit snapshots and compact move deltas in chronological history", () => {
    const model = fixture();
    model.editCell("a", "value", 10);
    const edited = model.getRow("a");
    model.moveRows(["e", "b"], "a", "before");
    expect(order(model)).toBe("beacd");
    expect(model.getRow("a")).toBe(edited);
    model.editCell("b", "value", 20);
    model.moveRows(["d"], "b", "before");
    expect(order(model)).toBe("dbeac");
    expect(model.undo()).toBe(true);
    expect(order(model)).toBe("beacd");
    expect(model.getRow("b")!.value).toBe(20);
    model.undo();
    expect(model.getRow("b")!.value).toBe(1);
    model.undo();
    expect(order(model)).toBe("abcde");
    expect(model.getRow("a")).toBe(edited);
    model.undo();
    expect(model.getRow("a")!.value).toBe(0);
    expect(model.undo()).toBe(false);
    for (let index = 0; index < 4; index++) expect(model.redo()).toBe(true);
    expect(order(model)).toBe("dbeac");
    expect(model.getRow("a")!.value).toBe(10);
    expect(model.getRow("b")!.value).toBe(20);
    expect(model.redo()).toBe(false);
  });

  it("limits history, clears redo on actual moves and resets it after row replacement/transactions", () => {
    const model = fixture({ historyLimit: 1 });
    model.moveRows(["a"], "e", "after");
    model.moveRows(["b"], "e", "after");
    model.undo();
    expect(order(model)).toBe("bcdea");
    expect(model.undo()).toBe(false);
    model.moveRows(["c"], "a", "after");
    expect(model.redo()).toBe(false);
    model.applyTransaction({ remove: ["b"] });
    expect(model.undo()).toBe(false);
    const snapshot = model.getState();
    expect(model.moveRows(["b"], "a", "before")).toContain("Unknown");
    expect(model.getState()).toBe(snapshot);
    model.moveRows(["d"], "a", "after");
    model.setRows(freshRows());
    expect(model.undo()).toBe(false);
    expect(model.redo()).toBe(false);
    const disabled = fixture({ historyLimit: 0 });
    disabled.moveRows(["a"], "e", "after");
    expect(disabled.undo()).toBe(false);
  });

  it("replays existing history after view restrictions change", () => {
    const model = fixture();
    model.moveRows(["a"], "e", "after");
    model.setSort("value", "desc");
    model.setFilter("value", { op: "gte", value: 2 });
    model.setState({ groupBy: ["value"] });
    model.setExternalFilter((row) => row.value >= 0);
    expect(model.getRowReorderStatus()).toMatchObject({
      allowed: false,
      reason: "grouping",
    });
    expect(model.undo()).toBe(true);
    expect(order(model)).toBe("abcde");
    expect(model.redo()).toBe(true);
    expect(order(model)).toBe("bcdea");
    expect(model.getState().sorting).toEqual([
      { columnId: "value", direction: "desc" },
    ]);
    expect(model.getState().groupBy).toEqual(["value"]);
  });

  it("reports authoritative status without evaluating application callbacks", () => {
    const throwing = vi.fn(() => {
      throw new Error("must not evaluate");
    });
    const model = fixture();
    expect(model.getRowReorderStatus()).toEqual({ allowed: true });
    expect(Object.isFrozen(model.getRowReorderStatus())).toBe(true);
    model.setSort("value", "asc");
    expect(model.getRowReorderStatus()).toMatchObject({ reason: "sorting" });
    const before = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    expect(model.moveRows(["a"], "b", "after")).toContain("sorting");
    expect(model.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    model.setSort("value", null);
    model.setFilter("value", { op: "blank" });
    expect(model.getRowReorderStatus()).toMatchObject({ reason: "filtering" });
    model.setFilter("value");
    model.setQuickFilter("abc");
    expect(model.getRowReorderStatus()).toMatchObject({ reason: "filtering" });
    model.setQuickFilter("  \t");
    expect(model.getRowReorderStatus()).toEqual({ allowed: true });
    model.setAdvancedFilter({
      kind: "condition",
      columnId: "value",
      filter: { op: "gte", value: 0 },
    });
    expect(model.getRowReorderStatus()).toMatchObject({ reason: "filtering" });
    model.setAdvancedFilter(null);
    model.setState({ groupBy: ["value"] });
    expect(model.getRowReorderStatus()).toMatchObject({ reason: "grouping" });
    model.setState({ groupBy: [] });
    const predicate = vi.fn(() => true);
    model.setExternalFilter(predicate);
    predicate.mockClear();
    expect(model.getRowReorderStatus()).toMatchObject({
      reason: "external-filter",
    });
    expect(predicate).not.toHaveBeenCalled();
    model.setExternalFilter();
    expect(model.getRowReorderStatus()).toEqual({ allowed: true });
    expect(
      fixture({ getTreePath: throwing }).getRowReorderStatus(),
    ).toMatchObject({ reason: "tree-data" });
    expect(throwing).not.toHaveBeenCalled();
  });

  it("supports global resident moves with pagination while retaining the current page", () => {
    const model = fixture({ initialState: { pageSize: 2, page: 1 } });
    model.moveRows(["a"], "e", "after");
    expect(order(model)).toBe("bcdea");
    expect(model.getState().page).toBe(1);
    expect(model.getPageRows().map((row) => row.id)).toEqual(["d", "e"]);
    expect(
      model
        .exportCsv({ allRows: true })
        .split("\r\n")
        .slice(1)
        .map((line) => line[1])
        .join(""),
    ).toBe("bcdea");
  });

  it("invalidates getter and calculated caches on moves and replay", () => {
    let factor = 1;
    const getter = vi.fn((row: Item) => row.value * factor);
    const { model, calculations } = createCalculatedGrid({
      rows: freshRows(),
      columns: [{ id: "base", valueGetter: getter, type: "number" }],
      calculatedColumns: [
        { id: "double", expression: "[base] * 2", type: "number" },
      ],
      getRowId: (row) => row.id,
      valueCache: true,
    });
    expect(calculations.getResult("b", "double")).toBe(2);
    expect(calculations.getResult("b", "double")).toBe(2);
    expect(getter).toHaveBeenCalledTimes(1);
    factor = 3;
    model.moveRows(["a"], "e", "after");
    expect(calculations.getResult("b", "double")).toBe(6);
    expect(getter).toHaveBeenCalledTimes(2);
    factor = 4;
    model.undo();
    expect(calculations.getResult("b", "double")).toBe(8);
    factor = 5;
    model.redo();
    expect(calculations.getResult("b", "double")).toBe(10);
  });

  it("retains only moved IDs and indices for a single move in 100,000 rows", () => {
    const rows = Array.from({ length: 100_000 }, (_, value) => ({
      id: String(value),
      value,
    }));
    const plan = planRowMove(rows, ["0"], "99999", "after", (row) => row.id);
    expect(plan.delta).toEqual({
      kind: "move",
      count: 100_000,
      items: [{ id: "0", originalIndex: 0 }],
      targetId: "99999",
      position: "after",
    });
    expect(JSON.stringify(plan.delta).length).toBeLessThan(160);
    expect(Object.isFrozen(plan.delta!.items[0])).toBe(true);
    expect(
      replayRowMove(plan.next, plan.delta!, "undo", (row) => row.id),
    ).toEqual(rows);
  });

  it("does not consume undo when a caller illegally mutates a stable row ID", () => {
    const rows = freshRows(),
      model = fixture({ rows });
    model.moveRows(["a"], "e", "after");
    const snapshot = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    rows[0].id = "e";
    expect(() => model.undo()).toThrow("unique");
    expect(model.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    rows[0].id = "a";
    expect(model.undo()).toBe(true);
    expect(order(model)).toBe("abcde");
  });

  it("uses collision-safe identity for prototype-like IDs", () => {
    const model = fixture({
      rows: ["__proto__", "constructor", "toString"].map((id, value) => ({
        id,
        value,
      })),
    });
    expect(
      model.moveRows(["constructor"], "__proto__", "before"),
    ).toBeUndefined();
    expect(model.getRows().map((row) => row.id)).toEqual([
      "constructor",
      "__proto__",
      "toString",
    ]);
    model.undo();
    expect(model.getRows()[0].id).toBe("__proto__");
    model.redo();
    expect(model.getRows()[0].id).toBe("constructor");
  });
});
