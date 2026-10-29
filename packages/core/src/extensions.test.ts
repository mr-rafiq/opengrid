import { describe, it, expect, vi } from "vitest";
import { aggregate, pivot, getVirtualWindow, findCells } from "./analytics";
import { InfiniteDataSource } from "./datasource";
import { evaluateFormula } from "./formulas";
describe("analytics", () => {
  it("aggregates finite numbers with explicit empty semantics", () => {
    expect(aggregate([1, null, NaN, 3], "avg")).toBe(2);
    expect(aggregate([], "min")).toBeNull();
    expect(aggregate([null, 2], "count")).toBe(2);
  });
  it("pivots collision-safe typed categories", () => {
    const result = pivot({
      rows: [
        { region: "a", year: 1, sales: 2 },
        { region: "a", year: 1, sales: 3 },
        { region: "a", year: "1", sales: 9 },
      ],
      rowKeys: ["region"],
      pivotKey: "year",
      values: [{ field: "sales", aggregate: "sum" }],
    });
    expect(result.columns).toHaveLength(2);
    expect(Object.values(result.rows[0].cells)).toEqual([5, 9]);
  });
  it("bounds a virtual window and rejects unsafe dimensions", () => {
    expect(getVirtualWindow(1000, 3800, 380, 38, 2)).toEqual({
      start: 98,
      end: 112,
      offset: 3724,
      totalHeight: 38000,
    });
    expect(getVirtualWindow(0, 0, 200, 40).end).toBe(0);
    expect(() => getVirtualWindow(1, 0, 10, 0)).toThrow();
  });
  it("finds formatted cells without searching hidden columns", () => {
    expect(
      findCells(
        [{ price: 4, secret: "four" }],
        [
          { id: "price", field: "price", valueFormatter: (v) => `USD ${v}` },
          { id: "secret", field: "secret", hidden: true },
        ],
        "usd",
      ),
    ).toEqual([{ rowIndex: 0, columnId: "price" }]);
  });
});
describe("arithmetic formulas", () => {
  it("handles precedence references unary signs and nested functions", () => {
    expect(evaluateFormula("=SUM([price]*2, AVG(2,4)) - -1", () => 5)).toBe(14);
    expect(evaluateFormula("2*(3+4)", () => 0)).toBe(14);
  });
  it.each([
    "globalThis.alert(1)",
    "[x].constructor",
    "1/0",
    "SUM()",
    "1 2",
    "1e999",
  ])("rejects invalid or unsafe expression %s", (value) =>
    expect(() => evaluateFormula(value, () => 1)).toThrow(),
  );
  it("limits adversarial nesting and rejects nonfinite refs", () => {
    expect(() =>
      evaluateFormula("(".repeat(70) + "1" + ")".repeat(70), () => 0),
    ).toThrow();
    expect(() => evaluateFormula("[x]", () => Infinity)).toThrow();
  });
});
describe("flat infinite data loader", () => {
  it("deduplicates concurrent requests, clones responses and evicts least-recent blocks", async () => {
    const getRows = vi.fn(async ({ startRow }: { startRow: number }) => ({
      rows: [{ id: startRow }],
      rowCount: 10,
    }));
    const source = new InfiniteDataSource(
      { getRows },
      { blockSize: 2, maxBlocks: 1 },
    );
    const [a, b] = await Promise.all([
      source.loadBlock(0),
      source.loadBlock(0),
    ]);
    a.rows[0].id = 999;
    expect(b.rows[0].id).toBe(0);
    expect(getRows).toHaveBeenCalledTimes(1);
    await source.loadBlock(1);
    await source.loadBlock(0);
    expect(getRows).toHaveBeenCalledTimes(3);
  });
  it("does not cache late responses after query invalidation", async () => {
    let finish!: (v: { rows: number[]; rowCount: number }) => void;
    const source = new InfiniteDataSource<number>({
      getRows: () =>
        new Promise<{ rows: number[]; rowCount: number }>((resolve) => {
          finish = resolve;
        }),
    });
    const pending = source.loadBlock(0);
    await Promise.resolve();
    source.setQuery([], { name: { op: "equals", value: "new" } });
    finish({ rows: [1], rowCount: 1 });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("retries failures and passes query parameters to the source", async () => {
    const getRows = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ rows: [1], rowCount: 1 });
    const source = new InfiniteDataSource<number>({ getRows });
    source.setQuery([{ columnId: "a", direction: "desc" }], {});
    await expect(source.loadBlock(0)).rejects.toThrow("offline");
    await expect(source.loadBlock(0)).resolves.toEqual({
      rows: [1],
      rowCount: 1,
    });
    expect(getRows.mock.calls[1][0].sorting).toEqual([
      { columnId: "a", direction: "desc" },
    ]);
  });
});
