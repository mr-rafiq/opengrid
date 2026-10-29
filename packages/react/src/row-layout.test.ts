import { describe, expect, it } from "vitest";
import { createRowLayout } from "./row-layout";

describe("variable-height row layout", () => {
  it("builds immutable offsets/heights and maps boundaries to the next row", () => {
    const heights = [10, 20, 30];
    const layout = createRowLayout(heights);
    expect(layout.count).toBe(3);
    expect(layout.totalHeight).toBe(60);
    expect([0, 1, 2, 3].map((index) => layout.offset(index))).toEqual([
      0, 10, 30, 60,
    ]);
    expect([0, 1, 2].map((index) => layout.height(index))).toEqual(heights);
    expect(
      [-20, 0, 9.999, 10, 29.999, 30, 59.999, 60, 100].map((pixel) =>
        layout.indexAt(pixel),
      ),
    ).toEqual([0, 0, 0, 1, 1, 2, 2, 2, 2]);
    heights[0] = 999;
    expect(layout.height(0)).toBe(10);
    expect(layout.offset(1)).toBe(10);
    expect(Object.isFrozen(layout)).toBe(true);
  });
  it("returns end-exclusive windows for exact and partial intersections", () => {
    const layout = createRowLayout([10, 20, 30, 40]);
    expect(layout.window(0, 10, 0)).toEqual({
      start: 0,
      end: 1,
      offset: 0,
      totalHeight: 100,
    });
    expect(layout.window(10, 20, 0)).toEqual({
      start: 1,
      end: 2,
      offset: 10,
      totalHeight: 100,
    });
    expect(layout.window(15, 20, 0)).toEqual({
      start: 1,
      end: 3,
      offset: 10,
      totalHeight: 100,
    });
    expect(layout.window(30, 30, 0)).toEqual({
      start: 2,
      end: 3,
      offset: 30,
      totalHeight: 100,
    });
    expect(layout.window(15, 20, 1)).toEqual({
      start: 0,
      end: 4,
      offset: 0,
      totalHeight: 100,
    });
  });
  it("clamps negative and past-end scrolling to complete legal viewport windows", () => {
    const layout = createRowLayout([10, 20, 30, 40]);
    expect(layout.window(-10, 30, 0)).toEqual({
      start: 0,
      end: 2,
      offset: 0,
      totalHeight: 100,
    });
    expect(layout.window(999, 30, 0)).toEqual({
      start: 3,
      end: 4,
      offset: 60,
      totalHeight: 100,
    });
    expect(layout.window(999, 60, 0)).toEqual({
      start: 2,
      end: 4,
      offset: 30,
      totalHeight: 100,
    });
    expect(layout.window(999, 999, 0)).toEqual({
      start: 0,
      end: 4,
      offset: 0,
      totalHeight: 100,
    });
    expect(layout.window(10, 20, Number.MAX_SAFE_INTEGER)).toEqual({
      start: 0,
      end: 4,
      offset: 0,
      totalHeight: 100,
    });
  });
  it("defines zero-height viewports as empty insertion windows before overscan", () => {
    const layout = createRowLayout([10, 20, 30]);
    expect(layout.window(0, 0, 0)).toEqual({
      start: 0,
      end: 0,
      offset: 0,
      totalHeight: 60,
    });
    expect(layout.window(15, 0, 0)).toEqual({
      start: 1,
      end: 1,
      offset: 10,
      totalHeight: 60,
    });
    expect(layout.window(15, 0, 1)).toEqual({
      start: 0,
      end: 2,
      offset: 0,
      totalHeight: 60,
    });
    expect(layout.window(60, 0, 0)).toEqual({
      start: 3,
      end: 3,
      offset: 60,
      totalHeight: 60,
    });
    expect(layout.window(999, 0, 1)).toEqual({
      start: 2,
      end: 3,
      offset: 30,
      totalHeight: 60,
    });
  });
  it("supports empty and fractional layouts without integer truncation", () => {
    const empty = createRowLayout([]);
    expect(empty.offset(0)).toBe(0);
    expect(empty.indexAt(0)).toBe(-1);
    expect(empty.window(900, 10)).toEqual({
      start: 0,
      end: 0,
      offset: 0,
      totalHeight: 0,
    });
    expect(() => empty.height(0)).toThrow();
    const fractional = createRowLayout([0.25, 0.5, 1.25]);
    expect(fractional.totalHeight).toBe(2);
    expect(fractional.offset(2)).toBe(0.75);
    expect(fractional.height(2)).toBe(1.25);
    expect(fractional.indexAt(0.75)).toBe(2);
    expect(fractional.window(0.25, 0.5, 0)).toEqual({
      start: 1,
      end: 2,
      offset: 0.25,
      totalHeight: 2,
    });
  });
  it.each([0, -1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe row height %s",
    (height) => expect(() => createRowLayout([height])).toThrow(RangeError),
  );
  it("rejects overflowing sums and floating-point intervals that collapse", () => {
    expect(() => createRowLayout([Number.MAX_SAFE_INTEGER, 1])).toThrow(
      RangeError,
    );
    expect(() => createRowLayout([Number.MAX_SAFE_INTEGER - 1, 0.1])).toThrow(
      /collapsed/,
    );
    expect(createRowLayout([Number.MAX_SAFE_INTEGER]).totalHeight).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
  it("rejects invalid indices and query dimensions consistently", () => {
    const layout = createRowLayout([10, 20]);
    for (const index of [-1, 0.5, 3, NaN, Infinity])
      expect(() => layout.offset(index)).toThrow(RangeError);
    for (const index of [-1, 0.5, 2, NaN, Infinity])
      expect(() => layout.height(index)).toThrow(RangeError);
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => layout.indexAt(value)).toThrow(RangeError);
      expect(() => layout.window(value, 10)).toThrow(RangeError);
      expect(() => layout.window(0, value)).toThrow(RangeError);
    }
    expect(() => layout.window(0, -1)).toThrow(RangeError);
    for (const overscan of [
      -1,
      0.1,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(() => layout.window(0, 10, overscan)).toThrow(RangeError);
  });
  it("matches a deterministic linear oracle across mixed-size round trips", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const heights = Array.from(
      { length: 200 },
      () => 0.25 + Math.floor(random() * 100) / 4,
    );
    const offsets = [0];
    heights.forEach((height) => offsets.push(offsets.at(-1)! + height));
    const layout = createRowLayout(heights);
    for (let index = 0; index < heights.length; index++) {
      expect(layout.indexAt(layout.offset(index))).toBe(index);
      expect(
        layout.indexAt(layout.offset(index) + layout.height(index) / 2),
      ).toBe(index);
    }
    for (let query = 0; query < 300; query++) {
      const top = (random() * 1.4 - 0.2) * layout.totalHeight,
        viewport = (random() * layout.totalHeight) / 3;
      const scroll = Math.max(0, Math.min(layout.totalHeight - viewport, top));
      let start = 0;
      while (start < heights.length - 1 && offsets[start + 1] <= scroll)
        start++;
      let end = start;
      while (
        end < heights.length &&
        offsets[end] < Math.min(layout.totalHeight, scroll + viewport)
      )
        end++;
      const overscan = Math.floor(random() * 7);
      expect(layout.window(top, viewport, overscan)).toEqual({
        start: Math.max(0, start - overscan),
        end: Math.min(heights.length, end + overscan),
        offset: offsets[Math.max(0, start - overscan)],
        totalHeight: layout.totalHeight,
      });
    }
  });
  it("queries a 100,000-row layout without rereading the caller array", () => {
    const source = Array.from({ length: 100000 }, (_, index) =>
      index % 2 ? 48 : 24,
    );
    let reads = 0;
    const input = new Proxy(source, {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const layout = createRowLayout(input);
    expect(reads).toBe(100000);
    for (let index = 0; index < 100000; index += 997) {
      expect(layout.indexAt(layout.offset(index) + 1)).toBe(index);
      const window = layout.window(layout.offset(index), 480, 3);
      expect(window.start).toBeLessThanOrEqual(index);
      expect(window.end).toBeGreaterThan(index);
    }
    expect(reads).toBe(100000);
    expect(layout.totalHeight).toBe(3600000);
  });
});
