import { describe, expect, it } from "vitest";
import {
  allocateAutoRowHeights,
  AUTO_ROW_HEIGHT_LIMITS,
  type AutoRowHeightConstraint,
} from "./auto-row-heights.js";

function exhaustiveOracle(
  base: readonly number[],
  constraints: readonly AutoRowHeightConstraint[],
) {
  let best: number[] | undefined,
    bestTotal = Infinity;
  const candidate = [...base];
  const search = (index: number) => {
    if (index < base.length) {
      for (let height = base[index]; height <= 10; height++) {
        candidate[index] = height;
        search(index + 1);
      }
      return;
    }
    if (
      constraints.some(
        (rule) =>
          candidate
            .slice(rule.startRow, rule.endRow)
            .reduce((sum, value) => sum + value, 0) < rule.height,
      )
    )
      return;
    const total = candidate.reduce((sum, value) => sum + value, 0);
    const earlier =
      best && candidate.findIndex((value, i) => value !== best![i]);
    if (
      total < bestTotal ||
      (total === bestTotal &&
        earlier !== undefined &&
        earlier >= 0 &&
        candidate[earlier] < best![earlier])
    ) {
      best = [...candidate];
      bestTotal = total;
    }
  };
  search(0);
  return best!;
}

describe("natural-content row height allocation", () => {
  it("assigns a spanning cell's excess only to the final row", () => {
    expect(
      allocateAutoRowHeights(
        [36, 36, 36],
        [{ startRow: 0, endRow: 3, height: 160 }],
      ),
    ).toEqual([36, 36, 88]);
  });
  it("keeps taller base rows and shares height already supplied by another column", () => {
    expect(
      allocateAutoRowHeights(
        [36, 90, 36],
        [
          { startRow: 0, endRow: 3, height: 150 },
          { startRow: 1, endRow: 2, height: 100 },
        ],
      ),
    ).toEqual([36, 100, 36]);
  });
  it("orders crossing intervals by their ending row to avoid redundant growth", () => {
    expect(
      allocateAutoRowHeights(
        [1, 1, 1],
        [
          { startRow: 0, endRow: 3, height: 6 },
          { startRow: 1, endRow: 2, height: 5 },
        ],
      ),
    ).toEqual([1, 5, 1]);
    expect(
      allocateAutoRowHeights(
        [1, 1, 1],
        [
          { startRow: 0, endRow: 2, height: 5 },
          { startRow: 1, endRow: 3, height: 6 },
        ],
      ),
    ).toEqual([1, 4, 2]);
  });
  it("matches an exhaustive minimal-height oracle across 80 independent small layouts", () => {
    let seed = 7;
    const random = (maximum: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % maximum;
    };
    for (let trial = 0; trial < 80; trial++) {
      const base = Array.from({ length: 3 }, () => 1 + random(3));
      const rules = Array.from({ length: 1 + random(5) }, () => {
        const startRow = random(3);
        return {
          startRow,
          endRow: startRow + 1 + random(3 - startRow),
          height: random(8),
        };
      });
      expect(allocateAutoRowHeights(base, rules)).toEqual(
        exhaustiveOracle(base, rules),
      );
    }
  });
  it("does not mutate or freeze borrowed arrays/constraints and returns owned frozen heights", () => {
    const base = [24, 24],
      rule = { startRow: 0, endRow: 2, height: 60 },
      rules = [rule];
    const result = allocateAutoRowHeights(base, rules);
    expect(result).toEqual([24, 36]);
    expect(base).toEqual([24, 24]);
    expect(rules).toEqual([rule]);
    expect(Object.isFrozen(base)).toBe(false);
    expect(Object.isFrozen(rule)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    base[0] = 99;
    rule.height = 100;
    expect(result).toEqual([24, 36]);
  });
  it("is independent of input order, handles duplicate/zero requirements and fractional pixels", () => {
    const rules = [
      { startRow: 0, endRow: 2, height: 8.25 },
      { startRow: 0, endRow: 1, height: 4 },
      { startRow: 1, endRow: 2, height: 0 },
    ];
    expect(allocateAutoRowHeights([2.5, 3.5], rules)).toEqual([4, 4.25]);
    expect(allocateAutoRowHeights([2.5, 3.5], [...rules].reverse())).toEqual([
      4, 4.25,
    ]);
    expect(allocateAutoRowHeights([2.5, 3.5], [...rules, ...rules])).toEqual([
      4, 4.25,
    ]);
  });
  it("returns an empty owned layout and preserves base heights when no growth is required", () => {
    expect(allocateAutoRowHeights([], [])).toEqual([]);
    const base = [30, 50];
    expect(
      allocateAutoRowHeights(base, [{ startRow: 0, endRow: 2, height: 50 }]),
    ).toEqual(base);
    expect(allocateAutoRowHeights(base, [])).not.toBe(base);
  });
  it.each([NaN, Infinity, -1, 0, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe base height %s without touching input",
    (height) => {
      const base = [24, height];
      expect(() => allocateAutoRowHeights(base, [])).toThrow(RangeError);
      expect(base[0]).toBe(24);
    },
  );
  it.each([
    { startRow: -1, endRow: 1, height: 1 },
    { startRow: 0, endRow: 0, height: 1 },
    { startRow: 0, endRow: 4, height: 1 },
    { startRow: 0.5, endRow: 1, height: 1 },
    { startRow: 0, endRow: 1, height: Infinity },
    { startRow: 0, endRow: 1, height: -1 },
    {
      startRow: 0,
      endRow: 1,
      height: AUTO_ROW_HEIGHT_LIMITS.maxMeasuredHeight + 1,
    },
  ])("rejects invalid content constraint %j", (rule) =>
    expect(() => allocateAutoRowHeights([24, 24], [rule])).toThrow(RangeError),
  );
  it("rejects a numerically collapsed base interval and unsafe accumulated heights", () => {
    expect(() =>
      allocateAutoRowHeights([Number.MAX_SAFE_INTEGER, 1], []),
    ).toThrow(/unsafe/);
    expect(() => allocateAutoRowHeights([1e15, 0.001], [])).toThrow(/unsafe/);
  });
  it("bounds row and constraint counts before traversing large inputs", () => {
    expect(() =>
      allocateAutoRowHeights(new Array(AUTO_ROW_HEIGHT_LIMITS.maxRows + 1), []),
    ).toThrow(/row limit/);
    expect(() =>
      allocateAutoRowHeights(
        [24],
        new Array(AUTO_ROW_HEIGHT_LIMITS.maxConstraints + 1),
      ),
    ).toThrow(/constraint limit/);
  });
});
