import { describe, expect, it, vi } from "vitest";
import { pivot } from "./analytics";
import { formatValueRatio, transformValues } from "./value-transforms";
import type { PivotResult } from "./analytics";
import type {
  ValueTransform,
  ValueTransformOptions,
  ValueRatio,
} from "./value-transforms";

function matrix(
  values: unknown[][],
  columns = ["first", "second"],
): PivotResult {
  return {
    columns,
    rows: values.map((row, index) => ({
      keys: [index],
      cells: Object.fromEntries(columns.map((id, column) => [id, row[column]])),
    })),
  };
}
function run(
  values: unknown[][],
  transform: ValueTransform,
  patch: Partial<ValueTransformOptions> = {},
) {
  return transformValues(matrix(values), {
    columns: ["first", "second"],
    transform,
    ...patch,
  });
}
const cells = (result: ReturnType<typeof transformValues>) =>
  result.rows.map((row) => result.columns.map((id) => row.cells[id]));
const ratio = (numerator: bigint, denominator: bigint): ValueRatio => ({
  kind: "ratio",
  numerator,
  denominator,
});

describe("percentage matrix transforms", () => {
  it("calculates selected row, column and grand proportions as fractions", () => {
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfRowTotal" },
        ),
      ),
    ).toEqual([
      [0.25, 0.75],
      [1 / 3, 2 / 3],
    ]);
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfColumnTotal" },
        ),
      ),
    ).toEqual([
      [1 / 3, 3 / 7],
      [2 / 3, 4 / 7],
    ]);
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfGrandTotal" },
        ),
      ),
    ).toEqual([
      [0.1, 0.3],
      [0.2, 0.4],
    ]);
  });
  it("uses supplied totals for non-additive measures and falls back only for unspecified column overrides", () => {
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfRowTotal" },
          { totals: { rows: [8, 12] } },
        ),
      ),
    ).toEqual([
      [0.125, 0.375],
      [1 / 6, 1 / 3],
    ]);
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfColumnTotal" },
          { totals: { columns: { first: 10 } } },
        ),
      ),
    ).toEqual([
      [0.1, 3 / 7],
      [0.2, 4 / 7],
    ]);
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfGrandTotal" },
          { totals: { grand: 20 } },
        ),
      ),
    ).toEqual([
      [0.05, 0.15],
      [0.1, 0.2],
    ]);
  });
  it("supports explicit cell-specific parent row and parent column denominators", () => {
    const parentRows = [
      { first: 4, second: 12 },
      { first: 8, second: 16 },
    ];
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfParentRowTotal" },
          { totals: { parentRows } },
        ),
      ),
    ).toEqual([
      [0.25, 0.25],
      [0.25, 0.25],
    ]);
    const parentColumns = [
      { first: 2, second: 6 },
      { first: 4, second: 8 },
    ];
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "percentOfParentColumnTotal" },
          { totals: { parentColumns } },
        ),
      ),
    ).toEqual([
      [0.5, 0.5],
      [0.5, 0.5],
    ]);
  });
  it("does not infer absent parents and reports missing, zero and invalid supplied parent totals", () => {
    expect(() => run([[1, 2]], { type: "percentOfParentRowTotal" })).toThrow(
      /parentRows/,
    );
    expect(() => run([[1, 2]], { type: "percentOfParentColumnTotal" })).toThrow(
      /parentColumns/,
    );
    const missing = run(
      [
        [1, 2],
        [3, 4],
      ],
      { type: "percentOfParentRowTotal" },
      { totals: { parentRows: [null, { first: 0, second: NaN }] } },
    );
    expect(cells(missing)).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(missing.diagnostics.map((item) => item.code)).toEqual([
      "MISSING_TOTAL",
      "MISSING_TOTAL",
      "ZERO_DENOMINATOR",
      "INVALID_TOTAL",
    ]);
  });
  it("keeps negative and greater-than-one proportions signed without clamping", () => {
    expect(cells(run([[10, -5]], { type: "percentOfRowTotal" }))).toEqual([
      [2, -1],
    ]);
    expect(cells(run([[-2, -3]], { type: "percentOfGrandTotal" }))).toEqual([
      [0.4, 0.6],
    ]);
  });
  it("isolates one explicit measure and treats pivot-generated column IDs as opaque", () => {
    const summary = pivot({
      rows: [
        { region: "EU", year: "2025", sales: 10, count: 1 },
        { region: "EU", year: "2026", sales: 30, count: 8 },
      ],
      rowKeys: ["region"],
      pivotKey: "year",
      values: [
        { field: "sales", aggregate: "sum" },
        { field: "count", aggregate: "sum" },
      ],
    });
    const sales = [
      JSON.stringify(["2025", "sales"]),
      JSON.stringify(["2026", "sales"]),
    ];
    const result = transformValues(summary, {
      columns: sales,
      transform: { type: "percentOfRowTotal" },
    });
    expect(cells(result)).toEqual([[0.25, 0.75]]);
    expect(result.columns).toEqual(sales);
    const opaque = matrix([[2, 6]], ["not-json", "__proto__"]);
    expect(
      cells(
        transformValues(opaque, {
          columns: opaque.columns,
          transform: { type: "percentOfRowTotal" },
        }),
      ),
    ).toEqual([[0.25, 0.75]]);
  });
  it("reports zero and missing denominators without NaN or Infinity", () => {
    const zero = run(
      [
        [0, 0],
        [1, -1],
      ],
      { type: "percentOfRowTotal" },
    );
    expect(cells(zero)).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(
      zero.diagnostics.every((item) => item.code === "ZERO_DENOMINATOR"),
    ).toBe(true);
    const absent = run(
      [[1, 2]],
      { type: "percentOfGrandTotal" },
      { totals: { grand: null } },
    );
    expect(absent.diagnostics.map((item) => item.code)).toEqual([
      "MISSING_TOTAL",
      "MISSING_TOTAL",
    ]);
  });
});

describe("ordered analytical transforms", () => {
  it("computes running totals over either axis in supplied order", () => {
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
            [5, 6],
          ],
          { type: "runningTotal", axis: "rows" },
        ),
      ),
    ).toEqual([
      [1, 3],
      [3, 7],
      [8, 13],
    ]);
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
            [5, 6],
          ],
          { type: "runningTotal", axis: "columns" },
        ),
      ),
    ).toEqual([
      [1, 4],
      [2, 6],
      [5, 11],
    ]);
    const reversed = transformValues(matrix([[1, 3]]), {
      columns: ["second", "first"],
      transform: { type: "runningTotal", axis: "columns" },
    });
    expect(cells(reversed)).toEqual([[3, 4]]);
  });
  it("computes differences against the adjacent previous raw cell", () => {
    const result = run(
      [
        [1, 3],
        [2, 4],
        [5, 6],
      ],
      { type: "differenceFromPrevious", axis: "rows" },
    );
    expect(cells(result)).toEqual([
      [null, null],
      [1, 1],
      [3, 2],
    ]);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "NO_PREVIOUS",
      "NO_PREVIOUS",
    ]);
    expect(
      cells(
        run(
          [
            [1, 3],
            [2, 4],
          ],
          { type: "differenceFromPrevious", axis: "columns" },
        ),
      ),
    ).toEqual([
      [null, 2],
      [null, 2],
    ]);
  });
  it("computes percent differences with a signed prior denominator", () => {
    expect(
      cells(
        run(
          [
            [2, 4],
            [3, 2],
            [-3, -4],
          ],
          { type: "percentDifferenceFromPrevious", axis: "rows" },
        ),
      ),
    ).toEqual([
      [null, null],
      [0.5, -0.5],
      [-2, -3],
    ]);
    expect(
      cells(
        run([[-2, -3]], {
          type: "percentDifferenceFromPrevious",
          axis: "columns",
        }),
      ),
    ).toEqual([[null, 0.5]]);
  });
  it("never skips a missing or invalid previous position for difference modes", () => {
    const result = run(
      [
        [1, 0],
        [null, "bad"],
        [4, 5],
      ],
      { type: "differenceFromPrevious", axis: "rows" },
    );
    expect(cells(result)).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "NO_PREVIOUS",
      "NO_PREVIOUS",
      "INVALID_VALUE",
      "NO_PREVIOUS_VALUE",
      "INVALID_PREVIOUS",
    ]);
    const zero = run(
      [
        [0, 0],
        [0, 3],
      ],
      { type: "percentDifferenceFromPrevious", axis: "rows" },
    );
    expect(zero.diagnostics.map((item) => item.code)).toEqual([
      "NO_PREVIOUS",
      "NO_PREVIOUS",
      "ZERO_DENOMINATOR",
      "ZERO_DENOMINATOR",
    ]);
  });
  it("running totals retain the prefix across blanks and invalid inputs while exposing invalid cells", () => {
    const result = run(
      [
        [1, 2],
        [null, "bad"],
        [3, 4],
      ],
      { type: "runningTotal", axis: "rows" },
    );
    expect(cells(result)).toEqual([
      [1, 2],
      [null, null],
      [4, 6],
    ]);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "INVALID_VALUE",
    ]);
  });
});

describe("exact BigInt transforms and formatter", () => {
  it("preserves integers beyond Number precision for running totals and differences", () => {
    const large = 9007199254740993n;
    expect(
      cells(
        run(
          [
            [large, large + 2n],
            [2n, 4n],
          ],
          { type: "runningTotal", axis: "rows" },
        ),
      ),
    ).toEqual([
      [large, large + 2n],
      [large + 2n, large + 6n],
    ]);
    expect(
      cells(
        run([[large, large + 2n]], {
          type: "differenceFromPrevious",
          axis: "columns",
        }),
      ),
    ).toEqual([[null, 2n]]);
  });
  it("returns reduced exact ratios with positive denominators without integer truncation", () => {
    expect(
      cells(
        run(
          [
            [1n, 3n],
            [2n, 4n],
          ],
          { type: "percentOfRowTotal" },
        ),
      ),
    ).toEqual([
      [ratio(1n, 4n), ratio(3n, 4n)],
      [ratio(1n, 3n), ratio(2n, 3n)],
    ]);
    expect(cells(run([[10n, -5n]], { type: "percentOfRowTotal" }))).toEqual([
      [ratio(2n, 1n), ratio(-1n, 1n)],
    ]);
    expect(cells(run([[-2n, -3n]], { type: "percentOfGrandTotal" }))).toEqual([
      [ratio(2n, 5n), ratio(3n, 5n)],
    ]);
    expect(
      cells(
        run([[3n, 4n]], {
          type: "percentDifferenceFromPrevious",
          axis: "columns",
        }),
      ),
    ).toEqual([[null, ratio(1n, 3n)]]);
  });
  it("lifts exact numeric zero only for sparse BigInt pivot compatibility", () => {
    const summary = pivot({
      rows: [
        { region: "A", year: "2025", sales: 3n },
        { region: "B", year: "2026", sales: 9n },
      ],
      rowKeys: ["region"],
      pivotKey: "year",
      values: [{ field: "sales", aggregate: "sum" }],
    });
    const result = transformValues(summary, {
      columns: summary.columns,
      transform: { type: "percentOfGrandTotal" },
    });
    expect(cells(result)).toEqual([
      [ratio(1n, 4n), ratio(0n, 1n)],
      [ratio(0n, 1n), ratio(3n, 4n)],
    ]);
    expect(
      cells(run([[0, 2n]], { type: "runningTotal", axis: "columns" })),
    ).toEqual([[0n, 2n]]);
  });
  it("rejects every nonzero Number/BigInt mixture in inputs or explicit totals", () => {
    expect(() =>
      run([[1n, 2]], { type: "runningTotal", axis: "columns" }),
    ).toThrow(/mix/);
    expect(() =>
      run(
        [[1n, 2n]],
        { type: "percentOfGrandTotal" },
        { totals: { grand: 3 } },
      ),
    ).toThrow(/mix/);
    expect(() =>
      run([[1, 2]], { type: "percentOfGrandTotal" }, { totals: { grand: 3n } }),
    ).toThrow(/mix/);
  });
  it("enforces source/total magnitude limits and diagnoses derived integer overflow", () => {
    expect(() =>
      run(
        [[8n, 1n]],
        { type: "runningTotal", axis: "columns" },
        { limits: { maxIntegerBits: 3 } },
      ),
    ).toThrow(/bit budget/);
    expect(() =>
      run(
        [[1n, 2n]],
        { type: "percentOfGrandTotal" },
        { totals: { grand: 8n }, limits: { maxIntegerBits: 3 } },
      ),
    ).toThrow(/bit budget/);
    const running = run(
      [[3n, 3n]],
      { type: "runningTotal", axis: "columns" },
      { limits: { maxIntegerBits: 2 } },
    );
    expect(cells(running)).toEqual([[3n, null]]);
    expect(running.diagnostics[0].code).toBe("LIMIT");
    const diff = run(
      [[-3n, 3n]],
      { type: "differenceFromPrevious", axis: "columns" },
      { limits: { maxIntegerBits: 2 } },
    );
    expect(diff.diagnostics.at(-1)?.code).toBe("LIMIT");
  });
  it.each([
    [ratio(1n, 3n), {}, "33.33%"],
    [ratio(1n, 8n), { style: "decimal" as const, fractionDigits: 3 }, "0.125"],
    [ratio(1n, 8n), { fractionDigits: 0 }, "13%"],
    [ratio(-1n, 8n), { fractionDigits: 0 }, "-13%"],
    [ratio(1n, -8n), { style: "decimal" as const, fractionDigits: 2 }, "-0.13"],
    [ratio(-1n, -8n), { style: "decimal" as const, fractionDigits: 2 }, "0.13"],
    [ratio(-1n, 1000000n), { fractionDigits: 2 }, "0.00%"],
    [
      ratio(9007199254740993n, 1n),
      { style: "decimal" as const, fractionDigits: 0 },
      "9007199254740993",
    ],
  ])(
    "formats exact ratios without Number coercion %#",
    (value, options, expected) =>
      expect(formatValueRatio(value, options)).toBe(expected),
  );
  it("validates formatter value, denominator, precision, style and integer bounds", () => {
    expect(() =>
      formatValueRatio({ kind: "ratio", numerator: 1n, denominator: 0n }),
    ).toThrow(RangeError);
    for (const fractionDigits of [-1, 13, 1.5, NaN])
      expect(() => formatValueRatio(ratio(1n, 3n), { fractionDigits })).toThrow(
        RangeError,
      );
    expect(() =>
      formatValueRatio(ratio(1n, 3n), { style: "invalid" as "percent" }),
    ).toThrow(TypeError);
    expect(() =>
      formatValueRatio({
        numerator: 1,
        denominator: 2,
      } as unknown as ValueRatio),
    ).toThrow(TypeError);
    expect(() =>
      formatValueRatio(ratio(8n, 1n), { maxIntegerBits: 3 }),
    ).toThrow(RangeError);
    expect(formatValueRatio(ratio(1n, 3n), { fractionDigits: 12 })).toBe(
      "33.333333333333%",
    );
  });
});

describe("invalid values, immutable snapshots and resource boundaries", () => {
  it("reports invalid source cells and excludes them from numeric totals while preserving blanks", () => {
    const result = run(
      [
        [1, "2"],
        [null, NaN],
        [2, Infinity],
      ],
      { type: "percentOfGrandTotal" },
    );
    expect(cells(result)).toEqual([
      [1 / 3, null],
      [null, null],
      [2 / 3, null],
    ]);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "INVALID_VALUE",
      "INVALID_VALUE",
      "INVALID_VALUE",
    ]);
    expect(
      cells(run([[true, {}]], { type: "runningTotal", axis: "columns" })),
    ).toEqual([[null, null]]);
  });
  it("reports numeric sum, difference and division overflow without nonfinite output", () => {
    const sum = run([[1e308, 1e308]], { type: "percentOfGrandTotal" });
    expect(cells(sum)).toEqual([[null, null]]);
    expect(sum.diagnostics[0].code).toBe("OVERFLOW");
    const diff = run([[-1e308, 1e308]], {
      type: "differenceFromPrevious",
      axis: "columns",
    });
    expect(diff.diagnostics.at(-1)?.code).toBe("OVERFLOW");
    const division = run(
      [[1e308, 1]],
      { type: "percentOfGrandTotal" },
      { totals: { grand: 1e-308 } },
    );
    expect(division.rows[0].cells.first).toBeNull();
    expect(division.diagnostics[0].code).toBe("OVERFLOW");
  });
  it("creates frozen detached container snapshots without freezing borrowed object keys or mutating input", () => {
    const borrowed = { region: "EU" },
      source = matrix([[1, 3]]);
    source.rows[0].keys = [borrowed];
    const before = structuredClone(source);
    const result = transformValues(source, {
      columns: ["second", "first"],
      transform: { type: "percentOfRowTotal" },
    });
    expect(source).toEqual(before);
    expect(result.rows[0].keys).not.toBe(source.rows[0].keys);
    expect(result.rows[0].keys[0]).toBe(borrowed);
    expect(Object.isFrozen(borrowed)).toBe(false);
    for (const value of [
      result,
      result.columns,
      result.rows,
      result.rows[0],
      result.rows[0].keys,
      result.rows[0].cells,
      result.diagnostics,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    const exact = run([[1n, 3n]], { type: "percentOfGrandTotal" });
    expect(Object.isFrozen(exact.rows[0].cells.first)).toBe(true);
    source.columns[0] = "changed";
    source.rows[0].keys.push("changed");
    source.rows[0].cells.first = 999;
    expect(result.columns).toEqual(["second", "first"]);
    expect(result.rows[0].keys).toHaveLength(1);
    expect(result.rows[0].cells.first).toBe(0.25);
  });
  it("handles empty matrices and empty selections explicitly", () => {
    expect(
      transformValues(
        { columns: [], rows: [] },
        { columns: [], transform: { type: "percentOfGrandTotal" } },
      ),
    ).toEqual({ columns: [], rows: [], diagnostics: [] });
    expect(
      cells(
        transformValues(matrix([[1, 2]]), {
          columns: [],
          transform: { type: "runningTotal", axis: "rows" },
        }),
      ),
    ).toEqual([[]]);
  });
  it("treats inherited cell values as missing and supports prototype-like own columns", () => {
    const source = {
      columns: ["constructor", "__proto__"],
      rows: [{ keys: ["row"], cells: {} as Record<string, unknown> }],
    };
    expect(
      cells(
        transformValues(source, {
          columns: source.columns,
          transform: { type: "percentOfRowTotal" },
        }),
      ),
    ).toEqual([[null, null]]);
    source.rows[0].cells = JSON.parse('{"constructor":1,"__proto__":3}');
    const result = transformValues(source, {
      columns: source.columns,
      transform: { type: "percentOfRowTotal" },
    });
    expect(cells(result)).toEqual([[0.25, 0.75]]);
    expect(Object.getPrototypeOf(result.rows[0].cells)).toBe(Object.prototype);
  });
  it("rejects accessors and sparse arrays without executing getters", () => {
    const getter = vi.fn(() => 1),
      source = matrix([[1, 2]]);
    Object.defineProperty(source.rows[0].cells, "first", { get: getter });
    expect(() =>
      transformValues(source, {
        columns: source.columns,
        transform: { type: "percentOfRowTotal" },
      }),
    ).toThrow(/accessor/);
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      transformValues(
        { columns: ["a"], rows: Array(1) },
        { columns: ["a"], transform: { type: "percentOfGrandTotal" } },
      ),
    ).toThrow(/holes/);
  });
  it("validates duplicate/unknown columns, mode, axis and totals shape before producing a result", () => {
    expect(() =>
      run(
        [[1, 2]],
        { type: "percentOfGrandTotal" },
        { columns: ["first", "first"] },
      ),
    ).toThrow(/unique/);
    expect(() =>
      run([[1, 2]], { type: "percentOfGrandTotal" }, { columns: ["missing"] }),
    ).toThrow(/not present/);
    expect(() =>
      run([[1, 2]], { type: "invalid" } as unknown as ValueTransform),
    ).toThrow(/mode/);
    expect(() =>
      run([[1, 2]], { type: "runningTotal" } as ValueTransform),
    ).toThrow(/axis/);
    expect(() =>
      run([[1, 2]], { type: "percentOfRowTotal" }, { totals: { rows: [] } }),
    ).toThrow(/row count/);
    expect(() =>
      run(
        [[1, 2]],
        { type: "percentOfColumnTotal" },
        { totals: { columns: { missing: 1 } } },
      ),
    ).toThrow(/unselected/);
    expect(() =>
      run(
        [[1, 2]],
        { type: "percentOfParentColumnTotal" },
        { totals: { parentColumns: [] } },
      ),
    ).toThrow(/row count/);
  });
  it("bounds selected cells, rows, columns, total key metadata and configured budgets", () => {
    expect(() =>
      run(
        [
          [1, 2],
          [3, 4],
        ],
        { type: "runningTotal", axis: "rows" },
        { limits: { maxCells: 3 } },
      ),
    ).toThrow(/cell budget/);
    const wideKeys = matrix([[1, 2]]);
    wideKeys.rows[0].keys = [1, 2, 3];
    expect(() =>
      transformValues(wideKeys, {
        columns: wideKeys.columns,
        transform: { type: "percentOfRowTotal" },
        limits: { maxCells: 2 },
      }),
    ).toThrow(/budget/);
    for (const maxCells of [0, -1, 1.5, Infinity, 1000001])
      expect(() =>
        run([[1, 2]], { type: "percentOfRowTotal" }, { limits: { maxCells } }),
      ).toThrow(RangeError);
    for (const maxIntegerBits of [0, -1, 1.5, 16385])
      expect(() =>
        run(
          [[1, 2]],
          { type: "percentOfRowTotal" },
          { limits: { maxIntegerBits } },
        ),
      ).toThrow(RangeError);
    expect(() =>
      run(
        [[1n, 2n]],
        { type: "percentOfRowTotal" },
        { limits: { maxCells: 2, maxIntegerBits: 2 } },
      ),
    ).not.toThrow();
  });
});
