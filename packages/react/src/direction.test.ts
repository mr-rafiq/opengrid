import { describe, expect, it, vi } from "vitest";
import {
  assertGridDirection,
  createDirectionLayout,
  denormalizeScrollLeft,
  getInlineArrowDelta,
  getInlineColumnOrder,
  inlineToPhysicalDelta,
  normalizeScrollLeft,
  physicalToInlineDelta,
} from "./direction.js";
import type {
  DirectionPinnedColumn,
  GridDirection,
  RtlScrollModel,
} from "./direction.js";

describe("positive inline scrolling", () => {
  it("uses ordinary native LTR offsets and modern negative native RTL offsets", () => {
    expect(normalizeScrollLeft(125.125, 500, "ltr")).toBe(125.125);
    expect(normalizeScrollLeft(-125.125, 500, "rtl")).toBe(125.125);
    expect(denormalizeScrollLeft(125.125, 500, "rtl")).toBe(-125.125);
    expect(denormalizeScrollLeft(125.125, 500)).toBe(125.125);
  });
  it.each([
    ["negative", 0, -500],
    ["positive-from-start", 0, 500],
    ["positive-from-end", 500, 0],
  ] as const)(
    "defines explicit %s native RTL endpoints",
    (model, start, end) => {
      expect(normalizeScrollLeft(start, 500, "rtl", model)).toBe(0);
      expect(normalizeScrollLeft(end, 500, "rtl", model)).toBe(500);
      expect(denormalizeScrollLeft(0, 500, "rtl", model)).toBe(start);
      expect(denormalizeScrollLeft(500, 500, "rtl", model)).toBe(end);
    },
  );
  it("round-trips fractional offsets across every explicit model without direction-dependent state order", () => {
    for (const direction of ["ltr", "rtl"] as const)
      for (const model of [
        "negative",
        "positive-from-start",
        "positive-from-end",
      ] as const)
        for (const maximum of [0, 1, 64, 1000])
          for (const requested of [0, 0.125, 0.5, 37.5, 999.875, 2000]) {
            const native = denormalizeScrollLeft(
              requested,
              maximum,
              direction,
              model,
            );
            expect(normalizeScrollLeft(native, maximum, direction, model)).toBe(
              Math.min(requested, maximum),
            );
          }
  });
  it("clamps rubber-band overscroll on both edges and never leaks negative zero", () => {
    expect(normalizeScrollLeft(20, 500, "rtl")).toBe(0);
    expect(normalizeScrollLeft(-700, 500, "rtl")).toBe(500);
    expect(normalizeScrollLeft(-20, 500)).toBe(0);
    expect(normalizeScrollLeft(700, 500)).toBe(500);
    expect(normalizeScrollLeft(700, 500, "rtl", "positive-from-end")).toBe(0);
    expect(normalizeScrollLeft(-20, 500, "rtl", "positive-from-end")).toBe(500);
    expect(denormalizeScrollLeft(-50, 500, "rtl")).toBe(0);
    expect(denormalizeScrollLeft(900, 500, "rtl")).toBe(-500);
    for (const model of [
      "negative",
      "positive-from-start",
      "positive-from-end",
    ] as const) {
      expect(Object.is(normalizeScrollLeft(-0, 0, "rtl", model), -0)).toBe(
        false,
      );
      expect(Object.is(denormalizeScrollLeft(-0, 0, "rtl", model), -0)).toBe(
        false,
      );
    }
  });
  it("rejects invalid numeric inputs and ambiguous or invalid direction/model values", () => {
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => normalizeScrollLeft(value, 500)).toThrow(RangeError);
      expect(() => denormalizeScrollLeft(value, 500)).toThrow(RangeError);
      expect(() => normalizeScrollLeft(0, value)).toThrow(RangeError);
    }
    expect(() => normalizeScrollLeft(0, -1)).toThrow(RangeError);
    expect(() => normalizeScrollLeft(0, 1, "auto" as GridDirection)).toThrow(
      "direction",
    );
    expect(() =>
      normalizeScrollLeft(0, 1, "rtl", "reverse" as RtlScrollModel),
    ).toThrow("model");
  });
});

describe("physical pins and stable original column indices", () => {
  it("partitions pin regions into inline order without reversing columns inside each region", () => {
    const columns: DirectionPinnedColumn[] = [
      { pinned: "left" },
      { pinned: "right" },
      {},
      { pinned: "right" },
      { pinned: "left" },
      { pinned: null },
    ];
    expect(getInlineColumnOrder(columns)).toEqual([0, 4, 2, 5, 1, 3]);
    expect(getInlineColumnOrder(columns, "rtl")).toEqual([1, 3, 2, 5, 0, 4]);
    expect(columns.map((column) => column.pinned)).toEqual([
      "left",
      "right",
      undefined,
      "right",
      "left",
      null,
    ]);
    expect(Object.isFrozen(columns)).toBe(false);
    expect(Object.isFrozen(columns[0])).toBe(false);
    expect(Object.isFrozen(getInlineColumnOrder(columns, "rtl"))).toBe(true);
  });
  it("omits hidden leaves while retaining their original input index gaps", () => {
    const columns: DirectionPinnedColumn[] = [
      { pinned: "left", hidden: true },
      {},
      { pinned: "right" },
      { hidden: true },
      { pinned: "left" },
    ];
    expect(getInlineColumnOrder(columns, "rtl")).toEqual([2, 1, 4]);
    expect(getInlineColumnOrder(columns, "ltr")).toEqual([4, 1, 2]);
    expect(getInlineColumnOrder([])).toEqual([]);
    expect(getInlineColumnOrder([{ hidden: true }])).toEqual([]);
  });
  it("validates metadata and the hard input limit before producing an order", () => {
    expect(() => getInlineColumnOrder(new Array(100_001))).toThrow("limit");
    expect(() => getInlineColumnOrder(new Array(1))).toThrow("holes");
    const getter = vi.fn(),
      input = [{}];
    Object.defineProperty(input, "0", { get: getter });
    expect(() => getInlineColumnOrder(input)).toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
    expect(() => getInlineColumnOrder([{ pinned: "start" } as never])).toThrow(
      "Physical pin",
    );
    expect(() => getInlineColumnOrder([{ hidden: "false" } as never])).toThrow(
      "hidden",
    );
  });
});

describe("direction-independent inline viewport geometry", () => {
  const base = {
    viewportWidth: 300,
    contentWidth: 1000,
    scrollOffset: 100,
    leadingWidth: 26,
    leftPinnedWidth: 80,
    rightPinnedWidth: 60,
  };
  it("maps asymmetric pins and the leading gutter to their actual physical sides", () => {
    const ltr = createDirectionLayout(base),
      rtl = createDirectionLayout({ ...base, direction: "rtl" });
    expect(ltr).toMatchObject({
      startSide: "left",
      endSide: "right",
      startOcclusion: 106,
      endOcclusion: 60,
      centerStart: 206,
      centerEnd: 340,
      centerWidth: 134,
    });
    expect(rtl).toMatchObject({
      startSide: "right",
      endSide: "left",
      startOcclusion: 86,
      endOcclusion: 80,
      centerStart: 186,
      centerEnd: 320,
      centerWidth: 134,
    });
    expect(ltr.toPhysicalInterval(ltr.centerStart, ltr.centerWidth)).toEqual({
      left: 106,
      right: 240,
      width: 134,
    });
    expect(rtl.toPhysicalInterval(rtl.centerStart, rtl.centerWidth)).toEqual({
      left: 80,
      right: 214,
      width: 134,
    });
    expect(rtl.pinnedInterval("right", 26, 60)).toEqual({
      left: 214,
      right: 274,
      width: 60,
    });
    expect(rtl.pinnedInterval("left", 0, 80)).toEqual({
      left: 0,
      right: 80,
      width: 80,
    });
  });
  it("mirrors logical intervals while preserving widths and supporting offscreen span origins", () => {
    const ltr = createDirectionLayout(base),
      rtl = createDirectionLayout({ ...base, direction: "rtl" });
    for (const start of [0, 12.125, 150, 800])
      for (const width of [0, 5.5, 100, 900]) {
        const a = ltr.toPhysicalInterval(start, width),
          b = rtl.toPhysicalInterval(start, width);
        expect(a.left + b.right).toBe(300);
        expect(a.right + b.left).toBe(300);
        expect(a.width).toBe(b.width);
        expect(ltr.toInlinePoint(a.left)).toBe(start);
        expect(rtl.toInlinePoint(b.right)).toBe(start);
      }
    expect(rtl.toPhysicalInterval(0, 250)).toEqual({
      left: 150,
      right: 400,
      width: 250,
    });
  });
  it("keeps pinned intervals physically fixed regardless of direction or scroll", () => {
    for (const direction of ["ltr", "rtl"] as const)
      for (const scrollOffset of [0, 100, 700]) {
        const layout = createDirectionLayout({
          ...base,
          direction,
          scrollOffset,
        });
        expect(layout.pinnedInterval("left", 10, 30)).toEqual({
          left: 10,
          right: 40,
          width: 30,
        });
        expect(layout.pinnedInterval("right", 10, 30)).toEqual({
          left: 260,
          right: 290,
          width: 30,
        });
      }
  });
  it("reveals regular cells minimally, aligns oversized spans at inline start and clamps edges", () => {
    const ltr = createDirectionLayout({
      ...base,
      leadingWidth: 20,
      rightPinnedWidth: 40,
      scrollOffset: 200,
    });
    expect(ltr.scrollToReveal(350, 50)).toBe(200);
    expect(ltr.scrollToReveal(250, 50)).toBe(150);
    expect(ltr.scrollToReveal(500, 50)).toBe(290);
    expect(ltr.scrollToReveal(500, 200)).toBe(400);
    expect(ltr.scrollToReveal(0, 50)).toBe(0);
    expect(ltr.scrollToReveal(900, 20)).toBe(660);
    const rtl = createDirectionLayout({
      ...base,
      leadingWidth: 20,
      rightPinnedWidth: 40,
      scrollOffset: 200,
      direction: "rtl",
    });
    expect(rtl.scrollToReveal(500, 50)).toBe(330);
    expect(rtl.scrollToReveal(500, 200)).toBe(440);
    expect(
      denormalizeScrollLeft(rtl.scrollToReveal(500, 50), rtl.maxScroll, "rtl"),
    ).toBe(-330);
  });
  it("uses an empty center when pinned content covers a narrow viewport", () => {
    for (const direction of ["ltr", "rtl"] as const) {
      const layout = createDirectionLayout({
        viewportWidth: 100,
        contentWidth: 500,
        scrollOffset: 40,
        leadingWidth: 30,
        leftPinnedWidth: 80,
        rightPinnedWidth: 90,
        direction,
      });
      expect(layout.centerWidth).toBe(0);
      expect(layout.centerEnd).toBe(layout.centerStart);
      expect(layout.scrollToReveal(250, 20)).toBe(40);
    }
    expect(
      createDirectionLayout({
        viewportWidth: 0,
        contentWidth: 0,
        scrollOffset: 10,
      }).maxScroll,
    ).toBe(0);
  });
  it("snapshots numeric options and freezes only owned results", () => {
    const input = { ...base },
      layout = createDirectionLayout(input);
    input.viewportWidth = 999;
    expect(layout.viewportWidth).toBe(300);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.toPhysicalInterval(100, 20))).toBe(true);
    expect(
      createDirectionLayout({ ...base, scrollOffset: 2000 }).scrollOffset,
    ).toBe(700);
    expect(
      createDirectionLayout({ ...base, scrollOffset: -10 }).scrollOffset,
    ).toBe(0);
  });
  it("preserves fractional geometry and tolerates native regrouping roundoff in width sums", () => {
    const layout = createDirectionLayout({
      viewportWidth: 40.5,
      contentWidth: 100.75,
      scrollOffset: 12.125,
      leadingWidth: 1.25,
      leftPinnedWidth: 2.5,
      rightPinnedWidth: 3.125,
      direction: "rtl",
    });
    expect(layout).toMatchObject({
      centerStart: 16.5,
      centerEnd: 50.125,
      centerWidth: 33.625,
    });
    expect(layout.toPhysicalInterval(20.5, 4.125)).toEqual({
      left: 28,
      right: 32.125,
      width: 4.125,
    });
    expect(() =>
      createDirectionLayout({
        viewportWidth: 0.1,
        contentWidth: 0.3,
        scrollOffset: 0,
        leftPinnedWidth: 0.1,
        rightPinnedWidth: 0.2,
      }),
    ).not.toThrow();
  });
  it("rejects unsafe dimensions, overlapping declarations and malformed interval/pin requests", () => {
    for (const key of [
      "viewportWidth",
      "contentWidth",
      "leadingWidth",
      "leftPinnedWidth",
      "rightPinnedWidth",
    ] as const)
      for (const value of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        expect(() => createDirectionLayout({ ...base, [key]: value })).toThrow(
          RangeError,
        );
    expect(() => createDirectionLayout({ ...base, contentWidth: 100 })).toThrow(
      "include",
    );
    expect(() =>
      createDirectionLayout({ ...base, direction: "auto" as GridDirection }),
    ).toThrow(TypeError);
    const layout = createDirectionLayout(base);
    expect(() => layout.toPhysicalInterval(-1, 10)).toThrow();
    expect(() => layout.toPhysicalInterval(1, -1)).toThrow();
    expect(() =>
      layout.toPhysicalInterval(Number.MAX_SAFE_INTEGER, 1),
    ).toThrow();
    expect(() => layout.toInlinePoint(NaN)).toThrow();
    expect(() => layout.pinnedInterval("center" as never, 0, 1)).toThrow();
    expect(() =>
      layout.pinnedInterval("right", Number.MAX_SAFE_INTEGER, 1),
    ).toThrow();
  });
});

describe("physical pointer and arrow deltas", () => {
  it("converts pointer/resize deltas with an exact inverse", () => {
    for (const direction of ["ltr", "rtl"] as const)
      for (const delta of [-900, -0.125, 0, 0.125, 900])
        expect(
          inlineToPhysicalDelta(
            physicalToInlineDelta(delta, direction),
            direction,
          ),
        ).toBe(delta);
    expect(physicalToInlineDelta(24, "rtl")).toBe(-24);
    expect(physicalToInlineDelta(-24, "rtl")).toBe(24);
    expect(Object.is(physicalToInlineDelta(-0, "rtl"), -0)).toBe(false);
  });
  it("makes Left inline-forward in RTL and Right inline-forward in LTR", () => {
    expect(getInlineArrowDelta("ArrowLeft", "rtl")).toBe(1);
    expect(getInlineArrowDelta("ArrowRight", "rtl")).toBe(-1);
    expect(getInlineArrowDelta("ArrowLeft")).toBe(-1);
    expect(getInlineArrowDelta("ArrowRight")).toBe(1);
    expect(() => getInlineArrowDelta("ArrowUp" as never)).toThrow("Horizontal");
    expect(() => physicalToInlineDelta(NaN)).toThrow(RangeError);
  });
  it("validates direction without consulting global language or DOM state", () => {
    expect(() => assertGridDirection("rtl")).not.toThrow();
    expect(() => assertGridDirection("ltr")).not.toThrow();
    for (const value of [undefined, null, "RTL", "auto", 1])
      expect(() => assertGridDirection(value)).toThrow(TypeError);
  });
});
