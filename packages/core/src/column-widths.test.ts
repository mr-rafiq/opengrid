import { describe, expect, it, vi } from "vitest";
import {
  clampColumnWidth,
  createGrid,
  getColumnWidthConstraints,
  resolveColumnWidths,
} from "./index.js";
import type { WidthColumn } from "./column-widths.js";

describe("shared width constraints", () => {
  it("uses the established 160/40/Infinity defaults and supports explicit zero/fractional bounds", () => {
    expect(getColumnWidthConstraints({})).toEqual({
      width: 160,
      minWidth: 40,
      maxWidth: Infinity,
    });
    expect(
      getColumnWidthConstraints({ width: 0, minWidth: 0, maxWidth: 0 }),
    ).toEqual({ width: 0, minWidth: 0, maxWidth: 0 });
    expect(getColumnWidthConstraints({ minWidth: 200 })).toEqual({
      width: 200,
      minWidth: 200,
      maxWidth: Infinity,
    });
    expect(getColumnWidthConstraints({ maxWidth: 100 })).toEqual({
      width: 100,
      minWidth: 40,
      maxWidth: 100,
    });
    expect(
      getColumnWidthConstraints({
        width: 12.25,
        minWidth: 12.5,
        maxWidth: 12.75,
      }).width,
    ).toBe(12.5);
    expect(
      getColumnWidthConstraints({
        width: 12.9,
        minWidth: 12.5,
        maxWidth: 12.75,
      }).width,
    ).toBe(12.75);
    expect(Object.isFrozen(getColumnWidthConstraints({}))).toBe(true);
  });

  it("clamps finite resize attempts and retains the fallback for invalid/nonfinite state", () => {
    const column = { width: 123.5, minWidth: 80, maxWidth: 200 };
    expect(clampColumnWidth(column, -100)).toBe(80);
    expect(clampColumnWidth(column, 1000)).toBe(200);
    expect(clampColumnWidth(column, 151.25)).toBe(151.25);
    for (const value of [NaN, Infinity, -Infinity, undefined, null, "123", {}])
      expect(clampColumnWidth(column, value)).toBe(123.5);
  });

  it("rejects malformed schema bounds without imposing an arbitrary finite-width cap", () => {
    for (const source of [
      { width: NaN },
      { width: Infinity },
      { width: -1 },
      { minWidth: Infinity },
      { minWidth: -1 },
      { minWidth: NaN },
      { maxWidth: NaN },
      { maxWidth: -Infinity },
      { minWidth: 100, maxWidth: 99 },
    ])
      expect(() => getColumnWidthConstraints(source)).toThrow(RangeError);
    expect(getColumnWidthConstraints({ width: 1e12 }).width).toBe(1e12);
    expect(getColumnWidthConstraints({ width: Number.MAX_VALUE }).width).toBe(
      Number.MAX_VALUE,
    );
  });
});

describe("responsive column allocation", () => {
  it("divides the remaining viewport by flex weights after fixed columns and controls", () => {
    const result = resolveColumnWidths(
      [
        { id: "fixed", width: 150 },
        { id: "a", flex: 1 },
        { id: "b", flex: 2 },
      ],
      { availableWidth: 494, leadingWidth: 44 },
    );
    expect({ ...result.widths }).toEqual({ fixed: 150, a: 100, b: 200 });
    expect(result.totalWidth).toBe(494);
    expect(result.flexColumnIds).toEqual(["a", "b"]);
    expect(result.overflow).toBe(0);
    expect(result.unusedWidth).toBe(0);
  });

  it("resolves defaults before first measurement without pretending to know viewport width", () => {
    const result = resolveColumnWidths(
      [
        { id: "a", flex: 1, width: 90 },
        { id: "b", flex: 2, minWidth: 200 },
      ],
      { leadingWidth: 44 },
    );
    expect({ ...result.widths }).toEqual({ a: 90, b: 200 });
    expect(result.availableWidth).toBeUndefined();
    expect(result.flexColumnIds).toEqual([]);
    expect(result.totalWidth).toBe(334);
    expect(result.overflow).toBe(0);
    expect(result.unusedWidth).toBe(0);
  });

  it("redistributes after caps and does not freeze minima and maxima incorrectly together", () => {
    expect({
      ...resolveColumnWidths(
        [
          { id: "a", flex: 1, minWidth: 80 },
          { id: "b", flex: 1, minWidth: 0, maxWidth: 10 },
        ],
        { availableWidth: 100 },
      ).widths,
    }).toEqual({ a: 90, b: 10 });
    expect({
      ...resolveColumnWidths(
        [
          { id: "a", flex: 1, minWidth: 80, maxWidth: 100 },
          { id: "b", flex: 1, minWidth: 0, maxWidth: 10 },
        ],
        { availableWidth: 85 },
      ).widths,
    }).toEqual({ a: 80, b: 5 });
    expect({
      ...resolveColumnWidths(
        [
          { id: "a", flex: 1, maxWidth: 100 },
          { id: "b", flex: 2, maxWidth: 150 },
          { id: "c", flex: 1 },
        ],
        { availableWidth: 600 },
      ).widths,
    }).toEqual({ a: 100, b: 150, c: 350 });
  });

  it("preserves minimum overflow and leaves unused space when every maximum is reached", () => {
    const columns = [
      { id: "a", flex: 1, minWidth: 100, maxWidth: 150 },
      { id: "b", flex: 1, minWidth: 80, maxWidth: 90 },
    ];
    const narrow = resolveColumnWidths(columns, {
      availableWidth: 150,
      leadingWidth: 44,
    });
    expect({ ...narrow.widths }).toEqual({ a: 100, b: 80 });
    expect(narrow.totalWidth).toBe(224);
    expect(narrow.overflow).toBe(74);
    const wide = resolveColumnWidths(columns, {
      availableWidth: 400,
      leadingWidth: 44,
    });
    expect({ ...wide.widths }).toEqual({ a: 150, b: 90 });
    expect(wide.unusedWidth).toBe(116);
    expect(wide.overflow).toBe(0);
  });

  it("treats an explicitly measured zero viewport mathematically and permits zero-width columns", () => {
    const result = resolveColumnWidths(
      [
        { id: "zero", width: 0, minWidth: 0, maxWidth: 0 },
        { id: "flex", flex: 1 },
      ],
      { availableWidth: 0 },
    );
    expect({ ...result.widths }).toEqual({ zero: 0, flex: 40 });
    expect(result.overflow).toBe(40);
    expect(
      resolveColumnWidths([], { availableWidth: 500, leadingWidth: 44 })
        .unusedWidth,
    ).toBe(456);
  });

  it("keeps own manual overrides fixed and resumes flex after removing them", () => {
    const model = createGrid({
      rows: [],
      columns: [
        { id: "a", flex: 1 },
        { id: "b", flex: 1 },
      ],
      getRowId: () => "",
    });
    const read = () =>
      resolveColumnWidths(model.getColumns(), {
        availableWidth: 400,
        columnWidths: model.getState().columnWidths,
      });
    expect({ ...read().widths }).toEqual({ a: 200, b: 200 });
    model.resizeColumn("a", 120);
    expect({ ...read().widths }).toEqual({ a: 120, b: 280 });
    expect(read().flexColumnIds).toEqual(["b"]);
    model.setState({ columnWidths: {} });
    expect({ ...read().widths }).toEqual({ a: 200, b: 200 });
    expect(read().flexColumnIds).toEqual(["a", "b"]);
  });

  it("uses a temporary preview above manual state without mutating anything", () => {
    const columns = Object.freeze(
      [
        { id: "a", flex: 1 },
        { id: "b", flex: 1 },
      ].map((column) => Object.freeze(column)),
    );
    const manual = Object.freeze({ a: 120 });
    const preview = Object.freeze({ columnId: "a", width: 250 });
    expect({
      ...resolveColumnWidths(columns, {
        availableWidth: 400,
        columnWidths: manual,
        preview,
      }).widths,
    }).toEqual({ a: 250, b: 150 });
    expect({
      ...resolveColumnWidths(columns, {
        availableWidth: 400,
        columnWidths: manual,
      }).widths,
    }).toEqual({ a: 120, b: 280 });
    expect(manual.a).toBe(120);
    expect(columns[0]!.flex).toBe(1);
    expect(
      resolveColumnWidths(
        [
          { id: "a", flex: 1, minWidth: 50, maxWidth: 100 },
          { id: "b", flex: 1 },
        ],
        { availableWidth: 300, preview: { columnId: "a", width: -100 } },
      ).widths.a,
    ).toBe(50);
  });

  it("ignores inherited overrides but preserves own invalid entries as fixed fallbacks", () => {
    const columns = [
      { id: "a", flex: 1, width: 100 },
      { id: "b", flex: 1 },
    ];
    expect({
      ...resolveColumnWidths(columns, {
        availableWidth: 400,
        columnWidths: Object.create({ a: 80 }),
      }).widths,
    }).toEqual({ a: 200, b: 200 });
    expect({
      ...resolveColumnWidths(columns, {
        availableWidth: 400,
        columnWidths: { a: NaN },
      }).widths,
    }).toEqual({ a: 100, b: 300 });
    const undefinedWidth = { a: undefined } as unknown as Record<
      string,
      number
    >;
    expect(
      resolveColumnWidths(columns, {
        availableWidth: 400,
        columnWidths: undefinedWidth,
      }).flexColumnIds,
    ).toEqual(["b"]);
  });

  it("excludes hidden columns while physical pins participate in the same allocation", () => {
    const columns: WidthColumn[] = [
      { id: "left", pinned: "left", flex: 1 },
      { id: "hidden", hidden: true, width: 1e12 },
      { id: "center", flex: 2 },
      { id: "right", pinned: "right", flex: 1 },
    ];
    const result = resolveColumnWidths(columns, { availableWidth: 400 });
    expect({ ...result.widths }).toEqual({
      left: 100,
      center: 200,
      right: 100,
    });
    expect(result.columnIds).toEqual(["left", "center", "right"]);
    expect(result.flexColumnIds).toEqual(["left", "center", "right"]);
    expect(Object.hasOwn(result.widths, "hidden")).toBe(false);
    expect(
      resolveColumnWidths(
        columns.map((column) => ({
          ...column,
          pinned:
            column.pinned === "left"
              ? "right"
              : column.pinned === "right"
                ? "left"
                : null,
        })),
        { availableWidth: 400 },
      ).widths,
    ).toEqual(result.widths);
  });

  it("keeps fractional bounds and distributes residual deterministically in logical order", () => {
    const columns = [
      { id: "a", flex: 1, minWidth: 0 },
      { id: "b", flex: 1, minWidth: 0 },
      { id: "c", flex: 1, minWidth: 0 },
    ];
    const first = resolveColumnWidths(columns, { availableWidth: 100.1 });
    expect(first.totalWidth).toBeCloseTo(100.1, 12);
    expect(first.widths.a).toBeCloseTo(100.1 / 3, 12);
    expect(resolveColumnWidths(columns, { availableWidth: 100.1 })).toEqual(
      first,
    );
    const constrained = resolveColumnWidths(
      [
        { id: "a", flex: 1, minWidth: 12.5, maxWidth: 12.75 },
        { id: "b", flex: 1, minWidth: 0 },
      ],
      { availableWidth: 30.25 },
    );
    expect({ ...constrained.widths }).toEqual({ a: 12.75, b: 17.5 });
    expect(constrained.totalWidth).toBe(30.25);
  });

  it("normalizes very large weights without overflow and does not cap legitimate large widths", () => {
    const normalized = resolveColumnWidths(
      [
        { id: "a", flex: Number.MAX_VALUE },
        { id: "b", flex: Number.MAX_VALUE },
      ],
      { availableWidth: 400 },
    );
    expect({ ...normalized.widths }).toEqual({ a: 200, b: 200 });
    const tiny = resolveColumnWidths(
      [
        { id: "a", flex: Number.MAX_VALUE, minWidth: 0, maxWidth: 100 },
        { id: "b", flex: Number.MIN_VALUE, minWidth: 0 },
      ],
      { availableWidth: 300 },
    );
    expect({ ...tiny.widths }).toEqual({ a: 100, b: 200 });
    expect(
      resolveColumnWidths([{ id: "large", width: 1e12 }], {}).totalWidth,
    ).toBe(1e12);
  });

  it("returns frozen independent records and safely supports prototype-like column IDs", () => {
    const columns = [
      { id: "__proto__", flex: 1 },
      { id: "constructor", flex: 1 },
      { id: "toString", flex: 1 },
    ];
    const manual = JSON.parse('{"__proto__":80}');
    const result = resolveColumnWidths(columns, {
      availableWidth: 400,
      columnWidths: manual,
    });
    expect(Object.getPrototypeOf(result.widths)).toBe(null);
    expect(result.widths.__proto__).toBe(80);
    expect(result.widths.constructor).toBe(160);
    expect(result.widths.toString).toBe(160);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.widths)).toBe(true);
    expect(Object.isFrozen(result.columnIds)).toBe(true);
    expect(Object.isFrozen(result.flexColumnIds)).toBe(true);
    expect(Object.isFrozen(columns)).toBe(false);
  });

  it("solves a bounded family against an independent monotone constraint oracle", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const columns = Array.from({ length: 5 }, (_, index) => ({
        id: String(index),
        flex: ((seed * (index + 1)) % 7) + 1,
        minWidth: (seed + index * 3) % 30,
        maxWidth: 45 + ((seed * (index + 2)) % 80),
      }));
      const target = 70 + seed * 5,
        result = resolveColumnWidths(columns, { availableWidth: target });
      const minimum = columns.reduce((sum, column) => sum + column.minWidth, 0),
        maximum = columns.reduce((sum, column) => sum + column.maxWidth, 0);
      let low = 0,
        high = target + maximum;
      for (let iteration = 0; iteration < 80; iteration++) {
        const middle = (low + high) / 2;
        const width = columns.reduce(
          (sum, column) =>
            sum +
            Math.max(
              column.minWidth,
              Math.min(column.maxWidth, middle * column.flex),
            ),
          0,
        );
        if (width < target) low = middle;
        else high = middle;
      }
      for (const column of columns) {
        const expected =
          target <= minimum
            ? column.minWidth
            : target >= maximum
              ? column.maxWidth
              : Math.max(
                  column.minWidth,
                  Math.min(column.maxWidth, ((low + high) / 2) * column.flex),
                );
        expect(result.widths[column.id]).toBeCloseTo(expected, 9);
      }
      expect(result.totalWidth).toBeCloseTo(
        Math.max(minimum, Math.min(maximum, target)),
        9,
      );
    }
  });
});

describe("width allocation input and resource guards", () => {
  it("rejects invalid weights and malformed schema, previews, dimensions and limits", () => {
    for (const flex of [0, -1, Infinity, NaN])
      expect(() =>
        resolveColumnWidths([{ id: "a", flex }], { availableWidth: 400 }),
      ).toThrow();
    expect(() =>
      resolveColumnWidths([{ id: "a" }, { id: "a", hidden: true }]),
    ).toThrow("unique");
    expect(() => resolveColumnWidths([{ id: "" }])).toThrow("nonempty");
    for (const availableWidth of [
      -1,
      Infinity,
      NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(() => resolveColumnWidths([], { availableWidth })).toThrow();
    expect(() => resolveColumnWidths([], { leadingWidth: -1 })).toThrow();
    expect(() =>
      resolveColumnWidths([{ id: "a", hidden: true }], {
        preview: { columnId: "a", width: 100 },
      }),
    ).toThrow("visible");
    expect(() =>
      resolveColumnWidths([{ id: "a" }], {
        preview: { columnId: "missing", width: 100 },
      }),
    ).toThrow("visible");
    expect(() =>
      resolveColumnWidths([{ id: "a" }], {
        preview: { columnId: "a", width: Infinity },
      }),
    ).toThrow("preview");
    for (const options of [
      { maxColumns: 0 },
      { maxColumns: 10001 },
      { maxWork: 0 },
      { maxWork: 1000001 },
    ])
      expect(() => resolveColumnWidths([], options)).toThrow("limits");
  });

  it("rejects excessive work, sparse/accessor arrays and unsafe accumulated precision without partial output", () => {
    expect(() => resolveColumnWidths(new Array(10001))).toThrow(
      "column budget",
    );
    expect(() =>
      resolveColumnWidths([{ id: "a", flex: 1 }], {
        availableWidth: 100,
        maxWork: 1,
      }),
    ).toThrow("work budget");
    expect(() => resolveColumnWidths(new Array(1))).toThrow("dense");
    const read = vi.fn(() => ({ id: "a" })),
      array: WidthColumn[] = [];
    Object.defineProperty(array, "0", { get: read });
    expect(() => resolveColumnWidths(array)).toThrow("accessor");
    expect(read).not.toHaveBeenCalled();
    const overrides: Record<string, number> = {};
    Object.defineProperty(overrides, "a", {
      get: () => {
        throw new Error("must not read");
      },
    });
    expect(() =>
      resolveColumnWidths([{ id: "a" }], { columnWidths: overrides }),
    ).toThrow("accessors");
    expect(() =>
      resolveColumnWidths([{ id: "a", width: Number.MAX_VALUE }]),
    ).toThrow("precision");
    expect(() =>
      resolveColumnWidths([
        { id: "a", width: 1e15 },
        { id: "tiny", width: Number.MIN_VALUE, minWidth: 0 },
      ]),
    ).toThrow("precision");
  });
});

describe("core width metadata and persistent state", () => {
  it("validates flex at construction and shares clamped defaults/state with pure allocation", () => {
    for (const flex of [0, -1, Infinity, NaN])
      expect(() =>
        createGrid({
          rows: [],
          columns: [{ id: "a", flex }],
          getRowId: () => "",
        }),
      ).toThrow("positive finite");
    for (const width of [Infinity, NaN, -1])
      expect(() =>
        createGrid({
          rows: [],
          columns: [{ id: "a", width }],
          getRowId: () => "",
        }),
      ).toThrow("width");
    const model = createGrid({
      rows: [],
      columns: [
        { id: "a", flex: 1, minWidth: 200 },
        { id: "b", flex: 2, maxWidth: 100 },
        { id: "zero", width: 0, minWidth: 0 },
      ],
      getRowId: () => "",
    });
    expect(model.getColumns().map((column) => column.width)).toEqual([
      200, 100, 0,
    ]);
    const snapshot = model.getState(),
      notify = vi.fn();
    model.subscribe(notify);
    const resolved = resolveColumnWidths(model.getColumns(), {
      availableWidth: 600,
      columnWidths: snapshot.columnWidths,
    });
    expect({ ...resolved.widths }).toEqual({ a: 500, b: 100, zero: 0 });
    expect(model.getState()).toBe(snapshot);
    expect(notify).not.toHaveBeenCalled();
    model.resizeColumn("a", NaN);
    expect(model.getState().columnWidths.a).toBe(200);
    model.setState({
      columnWidths: { a: undefined } as unknown as Record<string, number>,
    });
    expect(model.getState().columnWidths.a).toBe(200);
    expect(
      resolveColumnWidths(model.getColumns(), {
        availableWidth: 600,
        columnWidths: model.getState().columnWidths,
      }).flexColumnIds,
    ).toEqual(["b"]);
  });

  it("preserves layout state, manual overrides and metadata through roundtrip/hide/pin/order", () => {
    const model = createGrid({
      rows: [],
      columns: [
        { id: "__proto__", flex: 1 },
        { id: "b", flex: 2 },
        { id: "c", width: 80 },
      ],
      getRowId: () => "",
    });
    model.resizeColumn("__proto__", 100);
    model.pinColumn("b", "right");
    model.moveColumn("b", 0);
    model.hideColumn("c", true);
    const saved = model.getState();
    const first = resolveColumnWidths(model.getColumns(), {
      availableWidth: 500,
      columnWidths: saved.columnWidths,
    });
    expect(first.columnIds).toEqual(["__proto__", "b"]);
    expect(first.widths.b).toBe(400);
    model.setState({ columnWidths: {} });
    model.setState(saved);
    expect(
      resolveColumnWidths(model.getColumns(), {
        availableWidth: 500,
        columnWidths: model.getState().columnWidths,
      }),
    ).toEqual(first);
    expect(model.getColumns().find((column) => column.id === "b")!.flex).toBe(
      2,
    );
  });
});
