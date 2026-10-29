import { describe, expect, it } from "vitest";
import { getColumnWindow } from "./column-window";
const dimensions = { scrollLeft: 0, viewportWidth: 300, overscan: 0 };
describe("fixed-width column window", () => {
  it("renders only overlapping center columns with exact spacer widths", () => {
    expect(
      getColumnWindow(
        Array.from({ length: 10 }, () => ({ width: 100 })),
        dimensions,
      ),
    ).toEqual([
      { kind: "column", index: 0 },
      { kind: "column", index: 1 },
      { kind: "column", index: 2 },
      { kind: "spacer", key: "gap-3", width: 700 },
    ]);
  });
  it("keeps both pinned regions and compensates for their width plus selection gutter", () => {
    const columns = [
      { width: 100, pinned: "left" as const },
      ...Array.from({ length: 8 }, () => ({ width: 100 })),
      { width: 100, pinned: "right" as const },
    ];
    expect(
      getColumnWindow(columns, {
        ...dimensions,
        viewportWidth: 344,
        scrollLeft: 300,
        leadingWidth: 44,
      }),
    ).toEqual([
      { kind: "column", index: 0 },
      { kind: "spacer", key: "gap-1", width: 300 },
      { kind: "column", index: 4 },
      { kind: "spacer", key: "gap-5", width: 400 },
      { kind: "column", index: 9 },
    ]);
  });
  it("retains offscreen focus without mounting intervening columns", () => {
    const result = getColumnWindow(
      Array.from({ length: 100 }, () => ({ width: 100 })),
      { ...dimensions, retainIndices: [99] },
    );
    expect(result.filter((entry) => entry.kind === "column")).toHaveLength(4);
    expect(result.at(-1)).toEqual({ kind: "column", index: 99 });
  });
  it("expands overscan, clamps scrolling and supports disabling", () => {
    const columns = Array.from({ length: 10 }, () => ({ width: 100 }));
    expect(
      getColumnWindow(columns, { ...dimensions, overscan: 100 }).filter(
        (e) => e.kind === "column",
      ),
    ).toHaveLength(4);
    expect(
      getColumnWindow(columns, { ...dimensions, scrollLeft: 9999 }).filter(
        (e) => e.kind === "column",
      ),
    ).toEqual([
      { kind: "column", index: 7 },
      { kind: "column", index: 8 },
      { kind: "column", index: 9 },
    ]);
    expect(
      getColumnWindow(columns, { ...dimensions, enabled: false }),
    ).toHaveLength(10);
  });
  it("handles empty, zero width, and pinned-only layouts and rejects unsafe dimensions", () => {
    expect(getColumnWindow([], dimensions)).toEqual([]);
    expect(
      getColumnWindow([{ width: 0 }, { width: 10, pinned: "right" }], {
        ...dimensions,
        viewportWidth: 0,
      }),
    ).toEqual([{ kind: "column", index: 1 }]);
    expect(() => getColumnWindow([{ width: NaN }], dimensions)).toThrow();
    expect(() =>
      getColumnWindow([], { ...dimensions, overscan: -1 }),
    ).toThrow();
  });
});
