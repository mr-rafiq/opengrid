import { describe, expect, it, vi } from "vitest";
import {
  createColumnSpanPlan,
  getColumnSpanOwner,
  getColumnSpanWindow,
} from "./column-spans.js";
import type { SpanColumn } from "./column-spans.js";

type Item = { section: boolean };
const row = { section: true };
const context = { kind: "row" as const, row };
const columns = (count = 6): SpanColumn<Item>[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index),
    width: 100,
  }));
const windowWidth = (entries: ReturnType<typeof getColumnSpanWindow>) =>
  entries.reduce(
    (total, entry) =>
      total + (entry.kind === "spacer" ? entry.width : entry.cell.width),
    0,
  );

describe("row-specific column span geometry", () => {
  it("covers each leaf exactly once and sums widths without changing the input", () => {
    const input = columns();
    input[0] = { ...input[0], colSpan: 3 };
    input[3] = { ...input[3], colSpan: 2 };
    const plan = createColumnSpanPlan(input, context);
    expect(plan.ownerIndices).toEqual([0, 0, 0, 1, 1, 2]);
    expect(
      plan.cells.map((cell) => [cell.start, cell.end, cell.width, cell.offset]),
    ).toEqual([
      [0, 3, 300, 0],
      [3, 5, 200, 300],
      [5, 6, 100, 500],
    ]);
    expect(plan.totalWidth).toBe(600);
    expect(input).toHaveLength(6);
    expect(input[1].colSpan).toBeUndefined();
    expect(getColumnSpanOwner(plan, 2)).toBe(plan.cells[0]);
    expect(getColumnSpanOwner(plan, 4)).toBe(plan.cells[1]);
    for (const invalid of [-1, 6, 0.5, NaN, Infinity])
      expect(getColumnSpanOwner(plan, invalid)).toBeUndefined();
  });
  it("computes conditional spans once per uncovered owner and never calls covered callbacks", () => {
    const first = vi.fn((item: Item) => (item.section ? 3 : 1)),
      covered = vi.fn(() => {
        throw new Error("covered");
      });
    const input = columns(4);
    input[0] = { ...input[0], colSpan: first };
    input[1] = { ...input[1], colSpan: covered };
    expect(
      createColumnSpanPlan(input, context).cells.map((cell) => cell.span),
    ).toEqual([3, 1]);
    expect(first).toHaveBeenCalledExactlyOnceWith(row);
    expect(covered).not.toHaveBeenCalled();
  });
  it("clips spans at every pin boundary and computes sticky offsets after the complete merged cell", () => {
    const input: SpanColumn<Item>[] = [
      { id: "l0", width: 20, pinned: "left", colSpan: 99 },
      { id: "l1", width: 30, pinned: "left" },
      { id: "c0", width: 40, colSpan: 99 },
      { id: "c1", width: 50 },
      { id: "r0", width: 60, pinned: "right", colSpan: 2 },
      { id: "r1", width: 70, pinned: "right" },
      { id: "r2", width: 80, pinned: "right" },
    ];
    const plan = createColumnSpanPlan(input, context);
    expect(
      plan.cells.map((cell) => [cell.columnId, cell.span, cell.width]),
    ).toEqual([
      ["l0", 2, 50],
      ["c0", 2, 90],
      ["r0", 2, 130],
      ["r2", 1, 80],
    ]);
    expect(plan.cells[0].leftOffset).toBe(0);
    expect(plan.cells[2].rightOffset).toBe(80);
    expect(plan.cells[3].rightOffset).toBe(0);
    expect(plan.cells[1].leftOffset).toBeUndefined();
    expect(plan.cells[1].rightOffset).toBeUndefined();
  });
  it("preserves offsets after a previous left-pinned owner", () => {
    const plan = createColumnSpanPlan(
      [
        { id: "a", width: 20, pinned: "left" },
        { id: "b", width: 30, pinned: "left", colSpan: 2 },
        { id: "c", width: 40, pinned: "left" },
      ],
      context,
    );
    expect(plan.cells[1]).toMatchObject({
      leftOffset: 20,
      offset: 20,
      width: 70,
      span: 2,
    });
  });
  it("counts visible leaves after hiding and respects the supplied reordered leaf order", () => {
    const hidden = vi.fn(() => {
      throw new Error("hidden");
    });
    const input: SpanColumn<Item>[] = [
      { id: "e", width: 50, colSpan: 2 },
      { id: "hidden", width: 800, hidden: true, colSpan: hidden },
      { id: "c", width: 30 },
      { id: "b", width: 20 },
    ];
    const plan = createColumnSpanPlan(input, context);
    expect(plan.columnIds).toEqual(["e", "c", "b"]);
    expect(plan.sourceIndices).toEqual([0, 2, 3]);
    expect(plan.cells[0]).toMatchObject({
      columnId: "e",
      sourceIndex: 0,
      span: 2,
      width: 80,
    });
    expect(plan.totalWidth).toBe(100);
    expect(hidden).not.toHaveBeenCalled();
    const reordered = createColumnSpanPlan(
      [input[3], input[0], input[2]],
      context,
    );
    expect(reordered.cells.map((cell) => cell.columnId)).toEqual(["b", "e"]);
  });
  it("leaves group rows and explicitly disabled data rows unmerged without evaluating callbacks", () => {
    const callback = vi.fn(() => {
      throw new Error("not invoked");
    });
    const input = columns(3);
    input[0] = { ...input[0], colSpan: callback };
    expect(
      createColumnSpanPlan(input, { kind: "group" }).cells.map(
        (cell) => cell.span,
      ),
    ).toEqual([1, 1, 1]);
    expect(
      createColumnSpanPlan(input, context, { enabled: false }).cells.map(
        (cell) => cell.span,
      ),
    ).toEqual([1, 1, 1]);
    expect(callback).not.toHaveBeenCalled();
  });
  it("uses native fractional geometry without integer rounding", () => {
    const plan = createColumnSpanPlan(
      [
        { id: "a", width: 12.125, colSpan: 2 },
        { id: "b", width: 24.25 },
        { id: "c", width: 0.5 },
      ],
      context,
    );
    expect(plan.cells[0].width).toBe(36.375);
    expect(plan.cells[1].offset).toBe(36.375);
    expect(plan.totalWidth).toBe(36.875);
  });
  it("freezes owned outputs while leaving rows and input columns mutable", () => {
    const input = columns(3),
      item = { section: true };
    const plan = createColumnSpanPlan(input, { kind: "row", row: item });
    for (const value of [
      plan,
      plan.cells,
      plan.cells[0],
      plan.columnIds,
      plan.ownerIndices,
      plan.sourceIndices,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(item)).toBe(false);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input[0])).toBe(false);
    expect(() => {
      (plan.cells as unknown[]).push({});
    }).toThrow();
    input[0] = { id: "changed", width: 900 };
    item.section = false;
    expect(plan.cells[0].columnId).toBe("0");
    expect(plan.totalWidth).toBe(300);
  });
  it("supports empty/hidden-only inputs and prototype-like IDs", () => {
    expect(createColumnSpanPlan([], context)).toMatchObject({
      columnIds: [],
      cells: [],
      ownerIndices: [],
      totalWidth: 0,
    });
    expect(
      createColumnSpanPlan([{ id: "hidden", width: 20, hidden: true }], context)
        .cells,
    ).toEqual([]);
    expect(
      createColumnSpanPlan(
        ["__proto__", "constructor", "toString"].map((id) => ({
          id,
          width: 10,
          colSpan: 1,
        })),
        context,
      ).columnIds,
    ).toEqual(["__proto__", "constructor", "toString"]);
  });
});

describe("span-aware horizontal windows", () => {
  it("renders an anchor left of the ordinary window while its covered tail intersects", () => {
    const input = columns(12);
    input[0] = { ...input[0], colSpan: 8 };
    const plan = createColumnSpanPlan(input, context);
    const window = getColumnSpanWindow(plan, {
      scrollLeft: 550,
      viewportWidth: 100,
      overscan: 0,
    });
    expect(window[0]).toMatchObject({
      kind: "cell",
      cell: { columnId: "0", start: 0, end: 8, width: 800 },
    });
    expect(windowWidth(window)).toBe(1200);
    expect(window.filter((entry) => entry.kind === "cell")).toHaveLength(1);
  });
  it("culls a span after the whole merged cell leaves the window and preserves its full spacer width", () => {
    const input = columns(12);
    input[0] = { ...input[0], colSpan: 8 };
    const plan = createColumnSpanPlan(input, context),
      window = getColumnSpanWindow(plan, {
        scrollLeft: 850,
        viewportWidth: 100,
        overscan: 0,
      });
    expect(window[0]).toEqual({ kind: "spacer", key: "gap-0", width: 800 });
    expect(
      window
        .filter((entry) => entry.kind === "cell")
        .map((entry) => entry.cell.columnId),
    ).toEqual(["8", "9"]);
    expect(windowWidth(window)).toBe(plan.totalWidth);
  });
  it("retains the owner of a covered focus/editor leaf and always renders pinned spans", () => {
    const input = columns(20);
    input[0] = { ...input[0], pinned: "left", colSpan: 2 };
    input[1] = { ...input[1], pinned: "left" };
    input[2] = { ...input[2], colSpan: 3 };
    input[18] = { ...input[18], pinned: "right", colSpan: 2 };
    input[19] = { ...input[19], pinned: "right" };
    const plan = createColumnSpanPlan(input, context),
      window = getColumnSpanWindow(plan, {
        scrollLeft: 1000,
        viewportWidth: 700,
        leadingWidth: 76,
        overscan: 0,
        retainIndices: [4, 4, -1, 900],
      });
    const ids = window
      .filter((entry) => entry.kind === "cell")
      .map((entry) => entry.cell.columnId);
    expect(ids).toContain("0");
    expect(ids).toContain("2");
    expect(ids).toContain("18");
    expect(ids.filter((id) => id === "2")).toHaveLength(1);
    expect(windowWidth(window)).toBe(2000);
    expect(Object.isFrozen(window)).toBe(true);
    expect(window.every(Object.isFrozen)).toBe(true);
  });
  it("renders all owners when column virtualization is disabled", () => {
    const input = columns(10);
    input[0] = { ...input[0], colSpan: 5 };
    const plan = createColumnSpanPlan(input, context),
      window = getColumnSpanWindow(plan, {
        scrollLeft: 0,
        viewportWidth: 100,
        enabled: false,
      });
    expect(window.map((entry) => entry.kind)).toEqual(Array(6).fill("cell"));
    expect(windowWidth(window)).toBe(1000);
  });
  it("handles exact window boundaries without duplicate cells or geometry loss", () => {
    const input = columns(10);
    input[0] = { ...input[0], colSpan: 3 };
    input[5] = { ...input[5], colSpan: 4 };
    const plan = createColumnSpanPlan(input, context);
    for (let scrollLeft = 0; scrollLeft <= 1000; scrollLeft += 25) {
      const window = getColumnSpanWindow(plan, {
        scrollLeft,
        viewportWidth: 200,
        overscan: 0,
      });
      const indices = window
        .filter((entry) => entry.kind === "cell")
        .map((entry) => entry.cellIndex);
      expect(new Set(indices).size).toBe(indices.length);
      expect(windowWidth(window)).toBe(plan.totalWidth);
    }
  });
});

describe("span validation and bounded work", () => {
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "2",
    2n,
    null,
    undefined,
  ])(
    "normalizes malformed callback result %s to one without coercion",
    (value) => {
      expect(
        createColumnSpanPlan(
          [
            { id: "a", width: 20, colSpan: (() => value) as () => number },
            { id: "b", width: 30 },
          ],
          context,
        ).cells.map((cell) => cell.span),
      ).toEqual([1, 1]);
    },
  );
  it("propagates callback failures unchanged and can recover on a later pure call", () => {
    const failure = new Error("application callback failed");
    let fail = true;
    const input = [
      {
        id: "a",
        width: 20,
        colSpan: () => {
          if (fail) throw failure;
          return 2;
        },
      },
      { id: "b", width: 30 },
    ];
    expect(() => createColumnSpanPlan(input, context)).toThrow(failure);
    fail = false;
    expect(createColumnSpanPlan(input, context).cells[0].width).toBe(50);
  });
  it("validates static definitions, identity, geometry, contexts and rendered pin order", () => {
    for (const colSpan of [0, -2, 2.5, NaN, Infinity, null, "3", true])
      expect(() =>
        createColumnSpanPlan(
          [{ id: "a", width: 20, colSpan } as SpanColumn<Item>],
          context,
        ),
      ).toThrow();
    for (const width of [-1, NaN, Infinity])
      expect(() => createColumnSpanPlan([{ id: "a", width }], context)).toThrow(
        "width",
      );
    expect(() =>
      createColumnSpanPlan(
        [
          { id: "a", width: Number.MAX_SAFE_INTEGER },
          { id: "b", width: 1 },
        ],
        context,
      ),
    ).toThrow("safe numeric");
    expect(() =>
      createColumnSpanPlan(
        [
          { id: "a", width: 1 },
          { id: "a", width: 2 },
        ],
        context,
      ),
    ).toThrow("unique");
    expect(() => createColumnSpanPlan([{ id: "", width: 1 }], context)).toThrow(
      "unique",
    );
    expect(() =>
      createColumnSpanPlan(
        [
          { id: "a", width: 1 },
          { id: "b", width: 2, pinned: "left" },
        ],
        context,
      ),
    ).toThrow("pin order");
    expect(() =>
      createColumnSpanPlan(
        [
          {
            id: "a",
            width: 1,
            pinned: "middle",
          } as unknown as SpanColumn<Item>,
        ],
        context,
      ),
    ).toThrow("pinned");
    expect(() =>
      createColumnSpanPlan(columns(), { kind: "unknown" } as never),
    ).toThrow("context");
    expect(() =>
      createColumnSpanPlan(columns(), context, { enabled: 1 } as never),
    ).toThrow("boolean");
    const sparse = new Array<SpanColumn<Item>>(1);
    expect(() => createColumnSpanPlan(sparse, context)).toThrow("holes");
    const getter = vi.fn(),
      array = columns(1);
    Object.defineProperty(array, "0", { get: getter });
    expect(() => createColumnSpanPlan(array, context)).toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
  });
  it("bounds input columns before invoking callbacks, including hidden input", () => {
    const callback = vi.fn(() => 1);
    const input = columns(5).map((column) => ({
      ...column,
      hidden: true,
      colSpan: callback,
    }));
    expect(() =>
      createColumnSpanPlan(input, context, { maxColumns: 4 }),
    ).toThrow("column limit");
    expect(callback).not.toHaveBeenCalled();
    for (const maxColumns of [0, -1, 1.5, 100_001, NaN, Infinity])
      expect(() => createColumnSpanPlan([], context, { maxColumns })).toThrow(
        "maxColumns",
      );
    expect(() => createColumnSpanPlan(columns(10_001), context)).toThrow(
      "column limit",
    );
  });
  it("clamps huge safe spans before allocation and scales linearly at the hard input bound", () => {
    const callback = vi.fn(() => Number.MAX_SAFE_INTEGER),
      input = columns(100_000);
    input[0] = { ...input[0], colSpan: callback };
    const plan = createColumnSpanPlan(input, context, { maxColumns: 100_000 });
    expect(plan.cells).toHaveLength(1);
    expect(plan.ownerIndices).toHaveLength(100_000);
    expect(plan.cells[0].span).toBe(100_000);
    expect(plan.cells[0].width).toBe(10_000_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("preserves window dimension validation and bounds retained leaf inputs", () => {
    const plan = createColumnSpanPlan(columns(), context);
    expect(() =>
      getColumnSpanWindow(plan, { scrollLeft: NaN, viewportWidth: 100 }),
    ).toThrow("dimensions");
    expect(() =>
      getColumnSpanWindow(plan, {
        scrollLeft: 0,
        viewportWidth: 100,
        retainIndices: new Array(100_001).fill(0),
      }),
    ).toThrow("entry limit");
  });
});
