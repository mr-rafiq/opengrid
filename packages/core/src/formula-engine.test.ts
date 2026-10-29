import { describe, expect, it, vi } from "vitest";
import {
  FormulaEngine,
  formulaCellKey,
  isFormulaError,
} from "./formula-engine";
import type {
  FormulaCell,
  FormulaEngineOptions,
  FormulaResult,
} from "./formula-engine";

const cell = (columnId = "d", rowId = "r3"): FormulaCell => ({
  rowId,
  columnId,
});
function fixture(patch: Partial<FormulaEngineOptions> = {}) {
  const data = new Map<string, unknown>();
  const rowIds = ["r1", "r2", "r3"],
    columnIds = ["a", "b", "c", "d"];
  rowIds.forEach((rowId, row) =>
    columnIds.forEach((columnId, column) =>
      data.set(
        formulaCellKey({ rowId, columnId }),
        (column + 1) * (row === 0 ? 1 : row === 1 ? 10 : 100),
      ),
    ),
  );
  const getRawValue = vi.fn((rowId: string, columnId: string) =>
    data.get(formulaCellKey({ rowId, columnId })),
  );
  return {
    engine: new FormulaEngine({ rowIds, columnIds, getRawValue, ...patch }),
    data,
    getRawValue,
  };
}
function code(result: FormulaResult) {
  return isFormulaError(result) ? result.code : result;
}

describe("safe formula syntax and typed values", () => {
  it.each([
    ["=1 + 2 * 3", 7],
    ["=(1 + 2) * 3", 9],
    ["=-2 * -3 + +4", 10],
    ["=10-3-2", 5],
    ["=20/2/2", 5],
    ["=1.2e2 + .5", 120.5],
    ["=TRUE", true],
    ["=FALSE", false],
    ['="hello ""friend"""', 'hello "friend"'],
    ["=2>=2", true],
    ["=2<>3", true],
    ["=2!=2", false],
    ['="a"<"b"', true],
    ["=1==1", true],
    ["=2>3", false],
    ["=2<=2", true],
    ["=TRUE+1", 2],
  ])("evaluates %s", (formula, expected) => {
    const { engine } = fixture();
    engine.setFormula(cell(), String(formula));
    expect(engine.evaluate(cell())).toBe(expected);
  });
  it("resolves cross-row, absolute, case-insensitive addresses and exact row-local column IDs", () => {
    const { engine } = fixture();
    engine.setFormula(cell(), "=A1 + $B$2 + a2 + [c]");
    expect(engine.evaluate(cell())).toBe(331);
    expect(engine.getDependencies(cell())).toEqual([
      cell("a", "r1"),
      cell("b", "r2"),
      cell("a", "r2"),
      cell("c", "r3"),
    ]);
  });
  it("leaves raw formula-looking text inert until setFormula explicitly opts in", () => {
    const { engine, data } = fixture();
    data.set(formulaCellKey(cell("a", "r1")), "=1+2");
    expect(engine.evaluate(cell("a", "r1"))).toBe("=1+2");
    engine.setFormula(cell(), "=A1 + 1");
    expect(code(engine.evaluate(cell()))).toBe("VALUE");
  });
  it("supports blank arithmetic but rejects numeric strings, NaN, objects and BigInt", () => {
    const { engine, data } = fixture();
    data.set(formulaCellKey(cell("a", "r1")), undefined);
    engine.setFormula(cell(), "=A1+1");
    expect(engine.evaluate(cell())).toBe(1);
    for (const value of ["2", NaN, Infinity, {}, 2n]) {
      data.set(formulaCellKey(cell("a", "r1")), value);
      engine.invalidate([cell("a", "r1")]);
      expect(code(engine.evaluate(cell()))).toBe("VALUE");
    }
  });
  it("reports reference, division, value, name and parse errors without executing code", () => {
    const { engine } = fixture();
    const cases = [
      ["=A0", "REF"],
      ["=Z9", "REF"],
      ["=[missing]", "REF"],
      ["=1/0", "DIV0"],
      ['="2"+1', "VALUE"],
      ["=1e308*10", "VALUE"],
      ["=UNKNOWN(1)", "NAME"],
      ["=PI", "NAME"],
      ["=1 +", "PARSE"],
      ["=(1", "PARSE"],
      ["=1 2", "PARSE"],
      ["=A1:B2", "VALUE"],
      ['="a"<1', "VALUE"],
    ] as const;
    for (const [formula, expected] of cases) {
      engine.setFormula(cell(), formula);
      expect(code(engine.evaluate(cell())), formula).toBe(expected);
    }
  });
  it("returns VALUE when the raw provider throws without exposing its error text", () => {
    const engine = new FormulaEngine({
      rowIds: ["r"],
      columnIds: ["a"],
      getRawValue() {
        throw new Error("private provider secret");
      },
    });
    expect(engine.evaluate({ rowId: "r", columnId: "a" })).toEqual({
      kind: "error",
      code: "VALUE",
      message: "Raw cell provider failed",
    });
  });
  it.each([
    "=globalThis.process.exit()",
    "=A1.constructor",
    '=fetch("https://example.org")',
    "=1; alert(1)",
    "=(()=>1)()",
    "=__proto__",
    "=SUM(...A1)",
    '=A1["constructor"]',
    "=`template`",
  ])("rejects JavaScript injection %s", (formula) => {
    const { engine } = fixture();
    engine.setFormula(cell(), formula);
    expect(isFormulaError(engine.evaluate(cell()))).toBe(true);
  });
});

describe("ranges and lazy conditionals", () => {
  it("evaluates rectangular ranges, reverse ranges and aggregate mixtures", () => {
    const { engine } = fixture();
    const cases = [
      ["=SUM(A1:B2)", 33],
      ["=SUM(B2:A1, 7, C1)", 43],
      ["=AVG(A1:B2)", 8.25],
      ["=AVERAGE(A1:B2)", 8.25],
      ["=MIN(A1:B2)", 1],
      ["=MAX(A1:B2)", 20],
      ["=COUNT(A1:B2)", 4],
      ["=SUM()", 0],
      ["=COUNT()", 0],
    ] as const;
    for (const [formula, expected] of cases) {
      engine.setFormula(cell(), formula);
      expect(engine.evaluate(cell()), formula).toBe(expected);
    }
  });
  it("aggregate ranges count/aggregate finite numeric values and ignore text, booleans and blanks", () => {
    const { engine, data } = fixture();
    data.set(formulaCellKey(cell("a", "r1")), 2);
    data.set(formulaCellKey(cell("b", "r1")), "2");
    data.set(formulaCellKey(cell("a", "r2")), null);
    data.set(formulaCellKey(cell("b", "r2")), false);
    engine.setFormula(cell(), "=COUNT(A1:B2) + SUM(A1:B2)");
    expect(engine.evaluate(cell())).toBe(3);
    engine.setFormula(cell(), "=AVG(B1:B2)");
    expect(code(engine.evaluate(cell()))).toBe("VALUE");
  });
  it("propagates referenced formula errors in ranges and rejects out-of-bounds endpoints", () => {
    const { engine } = fixture();
    engine.setFormula(cell("b", "r2"), "=1/0");
    engine.setFormula(cell(), "=SUM(A1:B2)");
    expect(code(engine.evaluate(cell()))).toBe("DIV0");
    engine.setFormula(cell(), "=SUM(A1:Z99)");
    expect(code(engine.evaluate(cell()))).toBe("REF");
  });
  it("evaluates only the chosen IF branch including invalid references, unknown functions and self references", () => {
    const { engine } = fixture();
    for (const formula of [
      "=IF(TRUE,7,1/0)",
      "=IF(FALSE,Z99,7)",
      "=IF(TRUE,7,UNKNOWN())",
      "=IF(FALSE,D3,7)",
    ]) {
      engine.setFormula(cell(), formula);
      expect(engine.evaluate(cell()), formula).toBe(7);
    }
    engine.setFormula(cell(), '=IF(A1>0,"positive","negative")');
    expect(engine.evaluate(cell())).toBe("positive");
    engine.setFormula(cell(), "=IF(1/0,2,3)");
    expect(code(engine.evaluate(cell()))).toBe("DIV0");
    engine.setFormula(cell(), "=IF(TRUE,1)");
    expect(code(engine.evaluate(cell()))).toBe("VALUE");
  });
  it("records dependencies in both IF branches so a condition/branch update invalidates safely", () => {
    const { engine, data } = fixture();
    engine.setFormula(cell(), "=IF(A1>0,B1,C1)");
    expect(engine.getDependencies(cell())).toHaveLength(3);
    expect(engine.evaluate(cell())).toBe(2);
    data.set(formulaCellKey(cell("a", "r1")), -1);
    data.set(formulaCellKey(cell("c", "r1")), 42);
    engine.invalidate([cell("a", "r1"), cell("c", "r1")]);
    expect(engine.evaluate(cell())).toBe(42);
  });
});

describe("dependency graph, memoization and structural contracts", () => {
  it("memoizes a diamond dependency graph and invalidates all descendants of an updated input", () => {
    const { engine, data, getRawValue } = fixture();
    engine.setFormula(cell("b", "r1"), "=A1*2");
    engine.setFormula(cell("c", "r1"), "=A1+1");
    engine.setFormula(cell("d", "r1"), "=B1+C1");
    expect(engine.evaluate(cell("d", "r1"))).toBe(4);
    expect(getRawValue).toHaveBeenCalledTimes(1);
    expect(engine.evaluate(cell("d", "r1"))).toBe(4);
    expect(getRawValue).toHaveBeenCalledTimes(1);
    expect(
      new Set(engine.getDependents(cell("a", "r1"), true).map(formulaCellKey)),
    ).toEqual(
      new Set(
        [cell("b", "r1"), cell("c", "r1"), cell("d", "r1")].map(formulaCellKey),
      ),
    );
    data.set(formulaCellKey(cell("a", "r1")), 8);
    engine.invalidate([cell("a", "r1")]);
    expect(engine.evaluate(cell("d", "r1"))).toBe(25);
    expect(getRawValue).toHaveBeenCalledTimes(2);
  });
  it("retains unrelated caches when invalidating only affected cells", () => {
    const { engine, getRawValue } = fixture();
    engine.setFormula(cell("b", "r1"), "=A1*2");
    engine.setFormula(cell("b", "r2"), "=A2*2");
    engine.recalculate();
    expect(getRawValue).toHaveBeenCalledTimes(2);
    engine.invalidate([cell("a", "r1")]);
    engine.recalculate();
    expect(getRawValue).toHaveBeenCalledTimes(3);
    engine.invalidate();
    engine.recalculate();
    expect(getRawValue).toHaveBeenCalledTimes(5);
  });
  it("replaces dependency edges when a formula changes and removes them when deleted", () => {
    const { engine, data } = fixture();
    engine.setFormula(cell("b", "r1"), "=A1*5");
    engine.setFormula(cell("d", "r1"), "=B1+1");
    expect(engine.evaluate(cell("d", "r1"))).toBe(6);
    engine.setFormula(cell("b", "r1"), "=A2");
    expect(engine.getDependents(cell("a", "r1"))).toEqual([]);
    expect(engine.evaluate(cell("d", "r1"))).toBe(11);
    engine.removeFormula(cell("b", "r1"));
    expect(engine.getFormula(cell("b", "r1"))).toBeUndefined();
    expect(engine.getDependencies(cell("b", "r1"))).toEqual([]);
    expect(engine.getDependents(cell("a", "r2"))).toEqual([]);
    data.set(formulaCellKey(cell("b", "r1")), 21);
    engine.invalidate([cell("b", "r1")]);
    expect(engine.evaluate(cell("d", "r1"))).toBe(22);
  });
  it("finds direct and indirect cycles, propagates errors, and recovers after replacing a formula", () => {
    const { engine } = fixture();
    engine.setFormula(cell("a", "r1"), "=A1+1");
    expect(code(engine.evaluate(cell("a", "r1")))).toBe("CYCLE");
    engine.setFormula(cell("a", "r1"), "=B1");
    engine.setFormula(cell("b", "r1"), "=C1");
    engine.setFormula(cell("c", "r1"), "=A1");
    expect(code(engine.evaluate(cell("a", "r1")))).toBe("CYCLE");
    engine.setFormula(cell("c", "r1"), "=8");
    expect(engine.evaluate(cell("a", "r1"))).toBe(8);
    expect(engine.getSnapshot().errors).toEqual({});
  });
  it("binds positional references to copied ordered IDs, independent of later caller mutations", () => {
    const rowIds = ["one", "two"],
      columnIds = ["price", "total"];
    const getRawValue = (row: string, column: string) =>
      row === "one" && column === "price" ? 9 : 0;
    const engine = new FormulaEngine({ rowIds, columnIds, getRawValue });
    engine.setFormula({ rowId: "two", columnId: "total" }, "=$A$1");
    rowIds.reverse();
    columnIds.reverse();
    expect(engine.evaluate({ rowId: "two", columnId: "total" })).toBe(9);
  });
  it("uses collision-safe stable cell keys and returns detached graph entries", () => {
    expect(formulaCellKey({ rowId: "a:b", columnId: "c" })).not.toBe(
      formulaCellKey({ rowId: "a", columnId: "b:c" }),
    );
    const { engine } = fixture();
    engine.setFormula(cell(), "=A1");
    const deps = engine.getDependencies(cell());
    deps[0].rowId = "changed";
    expect(engine.getDependencies(cell())).toEqual([cell("a", "r1")]);
  });
  it("rejects invalid constructor configuration and unknown target formula cells", () => {
    expect(
      () =>
        new FormulaEngine({
          rowIds: ["r", "r"],
          columnIds: ["x"],
          getRawValue: () => 1,
        }),
    ).toThrow(/unique/);
    expect(() => fixture({ limits: { maxTokens: 0 } })).toThrow(RangeError);
    const { engine } = fixture();
    expect(engine.setFormula(cell("missing"), "=1")?.code).toBe("REF");
    expect(code(engine.evaluate(cell("missing")))).toBe("REF");
  });
});

describe("resource budgets and stable error snapshots", () => {
  it("enforces length, token, parser-depth and total range cell budgets", () => {
    const cases: [FormulaEngineOptions["limits"], string][] = [
      [{ maxFormulaLength: 10 }, "=12345678901"],
      [{ maxTokens: 4 }, "=1+2+3"],
      [{ maxDepth: 4 }, "=(((((1)))))"],
      [{ maxRangeCells: 3 }, "=SUM(A1:B2)"],
      [{ maxRangeCells: 4 }, "=SUM(A1:B1,A1:C1)"],
    ];
    for (const [limits, expression] of cases) {
      const { engine } = fixture({ limits });
      expect(engine.setFormula(cell(), expression)?.code).toBe("LIMIT");
      expect(code(engine.evaluate(cell()))).toBe("LIMIT");
      expect(engine.getSnapshot().errors[formulaCellKey(cell())]?.code).toBe(
        "LIMIT",
      );
    }
  });
  it("enforces evaluation and dependency depth budgets without poisoning independent evaluations", () => {
    const { engine } = fixture({ limits: { maxEvaluationSteps: 3 } });
    engine.setFormula(cell(), "=A1+B1");
    expect(code(engine.evaluate(cell()))).toBe("LIMIT");
    expect(engine.evaluate(cell("a", "r1"))).toBe(1);
    const chain = new FormulaEngine({
      rowIds: ["r"],
      columnIds: ["a", "b", "c", "d", "e"],
      getRawValue: () => 9,
      limits: { maxDepth: 3 },
    });
    for (const [target, reference] of [
      ["a", "B1"],
      ["b", "C1"],
      ["c", "D1"],
      ["d", "E1"],
    ])
      chain.setFormula({ rowId: "r", columnId: target }, "=" + reference);
    expect(code(chain.evaluate({ rowId: "r", columnId: "a" }))).toBe("LIMIT");
    expect(chain.evaluate({ rowId: "r", columnId: "d" })).toBe(9);
  });
  it("provides frozen stable snapshots, subscriptions, errors and recovery", () => {
    const { engine } = fixture(),
      listener = vi.fn(),
      unsubscribe = engine.subscribe(listener),
      before = engine.getSnapshot();
    expect(engine.getSnapshot()).toBe(before);
    engine.setFormula(cell(), "=1/0");
    expect(listener).toHaveBeenCalledTimes(1);
    const afterSet = engine.getSnapshot();
    expect(afterSet).not.toBe(before);
    engine.evaluate(cell());
    expect(listener).toHaveBeenCalledTimes(2);
    const failed = engine.getSnapshot();
    expect(failed.errors[formulaCellKey(cell())].code).toBe("DIV0");
    expect(Object.isFrozen(failed.errors)).toBe(true);
    engine.evaluate(cell());
    expect(engine.getSnapshot()).toBe(failed);
    engine.setFormula(cell(), "=2");
    expect(engine.evaluate(cell())).toBe(2);
    expect(engine.getSnapshot().errors).toEqual({});
    unsubscribe();
    const count = listener.mock.calls.length;
    engine.invalidate();
    expect(listener).toHaveBeenCalledTimes(count);
  });
});
