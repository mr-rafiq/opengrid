import { describe, expect, it } from "vitest";
import { fitColumnWidths, type WidthColumn } from "./column-widths";
import { createGrid } from "./index";

describe("explicit proportional size-to-fit", () => {
  it("retains immutable configured defaults before restored state and after layout changes", () => {
    const input = [
      { id: "__proto__", width: 100 },
      { id: "b", flex: 2 },
    ];
    const model = createGrid({
      columns: input,
      rows: [{ id: "row" }],
      getRowId: (row) => row.id,
      initialState: { columnWidths: { b: 800 } },
    });
    const defaults = model.getColumnWidthDefaults();
    expect(defaults).toEqual({ ["__proto__"]: 100, b: 160 });
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(Object.getPrototypeOf(defaults)).toBeNull();
    input[0].width = 999;
    model.resizeColumn("b", 500);
    model.moveColumn("b", 0);
    model.hideColumn("b", true);
    expect(model.getColumnWidthDefaults()).toBe(defaults);
    expect(defaults.b).toBe(160);
    expect(defaults.__proto__).toBe(100);
    expect(model.getColumns().find((column) => column.id === "b")!.width).toBe(
      500,
    );
  });
  const columns: WidthColumn[] = [
    { id: "a", width: 100, pinned: "left" },
    { id: "b", width: 200, flex: 9 },
    { id: "c", width: 300, pinned: "right" },
  ];
  it("uses configured ratios, not manual overrides or flex weights", () => {
    const result = fitColumnWidths(columns, {
      availableWidth: 1200,
      columnWidths: { a: 900, b: 45 },
    });
    expect(result.widths).toEqual({ a: 200, b: 400, c: 600 });
    expect(result.totalWidth).toBe(1200);
    expect(result.fittedColumnIds).toEqual(["a", "b", "c"]);
    expect(result.overflow).toBe(0);
    expect(result.unusedWidth).toBe(0);
    expect(
      fitColumnWidths(columns, {
        availableWidth: 1200,
        columnWidths: result.widths,
      }),
    ).toEqual(result);
  });
  it("retains excluded overrides, deducts controls and skips hidden columns", () => {
    const result = fitColumnWidths(
      [...columns, { id: "hidden", hidden: true, width: 800 }],
      {
        availableWidth: 1044,
        leadingWidth: 44,
        columnWidths: { a: 250, hidden: 900 },
        excludeColumnIds: ["a", "hidden"],
      },
    );
    expect(result.widths.a).toBe(250);
    expect(result.widths.b).toBeCloseTo(300, 10);
    expect(result.widths.c).toBeCloseTo(450, 10);
    expect(result.totalWidth).toBe(1044);
    expect(result.fittedColumnIds).toEqual(["b", "c"]);
    expect(result.excludedColumnIds).toEqual(["a"]);
    expect(result.columnIds).toEqual(["a", "b", "c"]);
  });
  it("redistributes max caps without locking a formerly violated minimum", () => {
    const result = fitColumnWidths(
      [
        { id: "small", width: 1, minWidth: 0, maxWidth: 80 },
        { id: "large", width: 100, minWidth: 0, maxWidth: 100 },
        { id: "floor", width: 2, minWidth: 2 },
      ],
      { availableWidth: 300 },
    );
    expect(result.widths.small).toBeCloseTo(200 / 3, 10);
    expect(result.widths.large).toBe(100);
    expect(result.widths.floor).toBeCloseTo(400 / 3, 10);
    expect(result.totalWidth).toBe(300);
  });
  it("reports insufficient minima, including fixed exclusions and leading controls", () => {
    const result = fitColumnWidths(columns, {
      availableWidth: 50,
      leadingWidth: 44,
      excludeColumnIds: ["a"],
    });
    expect(result.widths).toEqual({ a: 100, b: 40, c: 40 });
    expect(result.totalWidth).toBe(224);
    expect(result.overflow).toBe(174);
    expect(result.unusedWidth).toBe(0);
  });
  it("reports exhausted maxima and zero baselines without inventing ratios", () => {
    const result = fitColumnWidths(
      [
        { id: "zero", width: 0, minWidth: 0 },
        { id: "capped", width: 50, minWidth: 0, maxWidth: 70 },
      ],
      { availableWidth: 200 },
    );
    expect(result.widths).toEqual({ zero: 0, capped: 70 });
    expect(result.unusedWidth).toBe(130);
    expect(
      fitColumnWidths([{ id: "zero", width: 0, minWidth: 0 }], {
        availableWidth: 99,
      }).unusedWidth,
    ).toBe(99);
  });
  it("keeps fractional bounds and canonical residuals across physical pins", () => {
    const input = [
      { id: "a", width: 1, minWidth: 0.1 },
      { id: "b", width: 1, minWidth: 0.1 },
      { id: "c", width: 1, minWidth: 0.1 },
    ];
    const first = fitColumnWidths(input, { availableWidth: 100.1 });
    const second = fitColumnWidths(
      input.map((c, i) => ({
        ...c,
        pinned: i === 0 ? ("right" as const) : ("left" as const),
      })),
      { availableWidth: 100.1 },
    );
    expect(first).toEqual(second);
    expect(first.totalWidth).toBeCloseTo(100.1, 12);
  });
  it("returns detached frozen records, safe special IDs and no source mutations", () => {
    const input = Object.freeze([
      Object.freeze({ id: "__proto__", width: 100 }),
      Object.freeze({ id: "constructor", width: 100 }),
    ]);
    const overrides = Object.freeze({ constructor: 200 });
    const result = fitColumnWidths(input, {
      availableWidth: 600,
      columnWidths: overrides,
    });
    expect(Object.getPrototypeOf(result.widths)).toBeNull();
    expect(result.widths.__proto__).toBe(300);
    for (const value of [
      result,
      result.widths,
      result.columnIds,
      result.fittedColumnIds,
      result.excludedColumnIds,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(input[0].width).toBe(100);
    expect(overrides.constructor).toBe(200);
  });
  it("handles all-excluded, empty and zero-space allocations explicitly", () => {
    const result = fitColumnWidths(columns, {
      availableWidth: 800,
      excludeColumnIds: ["a", "b", "c"],
    });
    expect(result.fittedColumnIds).toEqual([]);
    expect(result.unusedWidth).toBe(200);
    expect(
      fitColumnWidths([], { availableWidth: 200, leadingWidth: 44 })
        .unusedWidth,
    ).toBe(156);
    expect(fitColumnWidths(columns, { availableWidth: 0 }).overflow).toBe(120);
  });
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, undefined])(
    "rejects invalid available width %s",
    (availableWidth) => {
      expect(() =>
        fitColumnWidths(columns, { availableWidth: availableWidth as number }),
      ).toThrow();
    },
  );
  it.each([
    { ids: ["missing"] },
    { ids: ["a", "a"] },
    { ids: new Array<string>(1) },
  ])("rejects invalid exclusions %j", ({ ids: excludeColumnIds }) => {
    expect(() =>
      fitColumnWidths(columns, { availableWidth: 500, excludeColumnIds }),
    ).toThrow();
  });
  it("rejects accessor exclusions and override entries without invoking them", () => {
    let reads = 0;
    const ids: string[] = [];
    Object.defineProperty(ids, "0", {
      get: () => {
        reads++;
        return "a";
      },
    });
    expect(() =>
      fitColumnWidths(columns, { availableWidth: 500, excludeColumnIds: ids }),
    ).toThrow();
    const columnWidths = Object.defineProperty({}, "a", {
      get: () => {
        reads++;
        return 100;
      },
    });
    expect(() =>
      fitColumnWidths(columns, { availableWidth: 500, columnWidths }),
    ).toThrow();
    expect(reads).toBe(0);
  });
  it("preserves shared schema and bounded solver validation", () => {
    expect(() =>
      fitColumnWidths([{ id: "a", flex: -1 }], { availableWidth: 500 }),
    ).toThrow();
    expect(() =>
      fitColumnWidths([{ id: "a" }, { id: "a" }], { availableWidth: 500 }),
    ).toThrow();
    expect(() =>
      fitColumnWidths(columns, { availableWidth: 500, maxColumns: 2 }),
    ).toThrow();
    expect(() =>
      fitColumnWidths(columns, { availableWidth: 500, maxWork: 1 }),
    ).toThrow();
    expect(() =>
      fitColumnWidths(columns, { availableWidth: 500, leadingWidth: -1 }),
    ).toThrow();
  });
  it("satisfies bounds, ratios and conservation across generated constrained inputs", () => {
    let seed = 23;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let trial = 0; trial < 100; trial++) {
      const input = Array.from(
        { length: 2 + Math.floor(random() * 15) },
        (_, i) => {
          const minWidth = random() * 80,
            maxWidth = minWidth + random() * 500;
          return {
            id: String(i),
            width: minWidth + random() * (maxWidth - minWidth),
            minWidth,
            maxWidth,
          };
        },
      );
      const availableWidth = random() * 4000;
      const result = fitColumnWidths(input, { availableWidth });
      const free: number[] = [];
      for (const column of input) {
        const width = result.widths[column.id];
        expect(width).toBeGreaterThanOrEqual(column.minWidth - 1e-9);
        expect(width).toBeLessThanOrEqual(column.maxWidth + 1e-9);
        if (width > column.minWidth + 1e-8 && width < column.maxWidth - 1e-8)
          free.push(width / column.width);
      }
      for (const ratio of free) expect(ratio).toBeCloseTo(free[0], 8);
      expect(
        result.totalWidth + result.unusedWidth - result.overflow,
      ).toBeCloseTo(availableWidth, 8);
    }
  });
});
