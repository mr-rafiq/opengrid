import { describe, expect, it, vi } from "vitest";
import { createGrid } from "@opengrid/core";
import { createRowSpanPlan } from "./row-spans.js";
import type { RowSpanRow, RowSpanOptions } from "./row-spans.js";

type Item = { id: string; value: unknown };
const valueOf = (row: Item) => row.value;
const column = [{ id: "value", spanRows: true }];
function rows(values: unknown[]): RowSpanRow<Item>[] {
  return values.map((value, index) => ({
    id: String(index),
    kind: "row",
    data: { id: String(index), value },
    region: "body",
    top: index * 10,
    height: 10,
  }));
}
const plan = (values: unknown[], options: Partial<RowSpanOptions<Item>> = {}) =>
  createRowSpanPlan(rows(values), column, { getValue: valueOf, ...options });
const exclusions: Partial<RowSpanRow<Item>>[] = [
  { kind: "group" },
  { leaf: false },
  { fullWidth: true },
  { detailHeight: 5 },
  { data: undefined },
];

describe("compact adjacent row spans", () => {
  it("resolves owners and covered rows while leaving singletons implicit", () => {
    const result = plan(["A", "A", "B", "C", "C"]);
    expect(result.rowCount).toBe(5);
    expect(result.mergedRunCount).toBe(2);
    expect(result.columnIds).toEqual(["value"]);
    expect(result.ownerAt(0, "value")).toEqual({
      columnId: "value",
      ownerIndex: 0,
      end: 2,
      span: 2,
      ownerId: "0",
      region: "body",
      top: 0,
      height: 20,
    });
    expect(result.ownerAt(1, "value")).toEqual(result.ownerAt(0, "value"));
    expect(result.ownerAt(2, "value")).toBeUndefined();
    expect(result.ownerAt(4, "value")).toMatchObject({
      ownerIndex: 3,
      end: 5,
      top: 30,
    });
    for (const index of [-1, 5, 0.5, NaN, Infinity])
      expect(result.ownerAt(index, "value")).toBeUndefined();
    expect(result.ownerAt(1, "other")).toBeUndefined();
  });
  it.each([
    [0, -0, false],
    [NaN, NaN, true],
    [1, "1", false],
    [null, undefined, false],
    [undefined, undefined, true],
    [9007199254740993n, 9007199254740993n, true],
    [9007199254740993n, 9007199254740992n, false],
    [new Date("2026-01-01"), new Date("2026-01-01"), false],
  ])("uses raw Object.is equality for %s and %s", (a, b, merged) => {
    expect(Boolean(plan([a, b]).ownerAt(1, "value"))).toBe(merged);
  });
  it("preserves object identity semantics without deep comparison", () => {
    const shared = { nested: [1] };
    expect(plan([shared, shared]).mergedRunCount).toBe(1);
    expect(plan([{ nested: [1] }, { nested: [1] }]).mergedRunCount).toBe(0);
  });
  it("uses custom adjacent predicates without invoking the value getter", () => {
    const getValue = vi.fn(() => {
      throw new Error("unneeded getter");
    });
    const compare = vi.fn(
      (previous: Item, next: Item) =>
        Math.abs(Number(previous.value) - Number(next.value)) <= 1,
    );
    const result = createRowSpanPlan(
      rows([1, 2, 3, 9, 10]),
      [{ id: "value", spanRows: compare }],
      { getValue },
    );
    expect(result.ownerAt(2, "value")).toMatchObject({ ownerIndex: 0, end: 3 });
    expect(result.ownerAt(4, "value")).toMatchObject({ ownerIndex: 3, end: 5 });
    expect(compare.mock.calls.map(([a, b]) => [a.value, b.value])).toEqual([
      [1, 2],
      [2, 3],
      [3, 9],
      [9, 10],
    ]);
    expect(getValue).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "true", 1, {}, [], NaN])(
    "joins only strict true, rejecting nonboolean predicate result %s as a split",
    (value) => {
      const result = createRowSpanPlan(
        rows([1, 1]),
        [{ id: "value", spanRows: (() => value) as () => boolean }],
        { getValue: valueOf },
      );
      expect(result.mergedRunCount).toBe(0);
    },
  );
  it("propagates application failures unchanged and retains no failed plan/cache", () => {
    const failure = new Error("application failed");
    let fail = true;
    const getValue = () => {
      if (fail) throw failure;
      return "A";
    };
    expect(() => createRowSpanPlan(rows([1, 1]), column, { getValue })).toThrow(
      failure,
    );
    fail = false;
    expect(
      createRowSpanPlan(rows([1, 1]), column, { getValue }).mergedRunCount,
    ).toBe(1);
    expect(() =>
      createRowSpanPlan(
        rows([1, 1]),
        [
          {
            id: "x",
            spanRows: () => {
              throw failure;
            },
          },
        ],
        { getValue },
      ),
    ).toThrow(failure);
  });
  it("sums variable/fractional base heights and keeps the owner's original top", () => {
    const input = rows([1, 1, 1]);
    input[0] = { ...input[0], top: 12.125, height: 20.25 };
    input[1] = { ...input[1], top: 32.375, height: 30.5 };
    input[2] = { ...input[2], top: 62.875, height: 40.125 };
    expect(
      createRowSpanPlan(input, column, { getValue: valueOf }).ownerAt(
        2,
        "value",
      ),
    ).toMatchObject({ top: 12.125, height: 90.875, span: 3 });
  });
  it("splits long runs at the configured cap without comparing across forced boundaries", () => {
    const compare = vi.fn(() => true);
    const result = createRowSpanPlan(
      rows([1, 1, 1, 1, 1]),
      [{ id: "value", spanRows: compare }],
      { getValue: valueOf, maxRunRows: 2 },
    );
    expect(
      result.intersecting(0, 5).map((run) => [run.ownerIndex, run.end]),
    ).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(result.ownerAt(4, "value")).toBeUndefined();
    expect(compare).toHaveBeenCalledTimes(2);
    expect(plan(Array(1001).fill(1)).ownerAt(999, "value")).toMatchObject({
      ownerIndex: 0,
      end: 1000,
    });
    expect(plan(Array(1001).fill(1)).ownerAt(1000, "value")).toBeUndefined();
  });
  it("freezes only owned public metadata and remains stable after input metadata changes", () => {
    const input = rows([1, 1]),
      columns = [{ id: "value", spanRows: true }],
      result = createRowSpanPlan(input, columns, { getValue: valueOf });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.columnIds)).toBe(true);
    expect(Object.isFrozen(result.ownerAt(1, "value"))).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input[0])).toBe(false);
    expect(Object.isFrozen(input[0].data)).toBe(false);
    input[0] = { ...input[0], id: "changed", height: 99 };
    columns[0].id = "changed";
    expect(result.ownerAt(1, "value")).toMatchObject({
      ownerId: "0",
      height: 20,
    });
    expect(Object.keys(result).sort()).toEqual([
      "columnIds",
      "intersecting",
      "mergedRunCount",
      "ownerAt",
      "rowCount",
    ]);
  });
});

describe("row span boundaries and windows", () => {
  it.each(exclusions)(
    "isolates excluded row %j on both edges and skips its value getter",
    (patch) => {
      const input = rows([1, 1, 1]);
      input[1] = { ...input[1], ...patch };
      input[2] = { ...input[2], top: 20 + (patch.detailHeight ?? 0) };
      const getValue = vi.fn(valueOf),
        result = createRowSpanPlan(input, column, { getValue });
      expect(result.mergedRunCount).toBe(0);
      expect(getValue.mock.calls.map(([row]) => row.id)).toEqual(["0", "2"]);
    },
  );
  it("splits at depth changes, geometry gaps and top/body/bottom boundaries", () => {
    const depth = rows([1, 1, 1]);
    depth[1] = { ...depth[1], depth: 1 };
    depth[2] = { ...depth[2], depth: 1 };
    expect(
      createRowSpanPlan(depth, column, { getValue: valueOf }).ownerAt(
        2,
        "value",
      ),
    ).toMatchObject({ ownerIndex: 1, end: 3 });
    const gap = rows([1, 1, 1]);
    gap[1] = { ...gap[1], top: 20 };
    gap[2] = { ...gap[2], top: 30 };
    expect(
      createRowSpanPlan(gap, column, { getValue: valueOf }).ownerAt(2, "value"),
    ).toMatchObject({ ownerIndex: 1, top: 20 });
    const bands = rows(Array(6).fill(1)).map((row, index) => ({
      ...row,
      region: (["top", "body", "bottom"] as const)[Math.floor(index / 2)],
      top: (index % 2) * 10,
    }));
    expect(
      createRowSpanPlan(bands, column, { getValue: valueOf })
        .intersecting(0, 6)
        .map((run) => [run.ownerIndex, run.end, run.region, run.top]),
    ).toEqual([
      [0, 2, "top", 0],
      [2, 4, "body", 0],
      [4, 6, "bottom", 0],
    ]);
  });
  it("returns offscreen origins touching the window without duplicating covered cells", () => {
    const result = plan(["A", "A", "A", "A", "A", "B", "B"]);
    expect(result.intersecting(3, 4)).toEqual([result.ownerAt(3, "value")]);
    expect(result.intersecting(3, 4)[0]).toMatchObject({
      ownerIndex: 0,
      end: 5,
    });
    expect(result.intersecting(5, 6).map((run) => run.ownerIndex)).toEqual([5]);
    expect(result.intersecting(5, 5)).toEqual([]);
    expect(result.intersecting(0, 7, ["other"])).toEqual([]);
    expect(Object.isFrozen(result.intersecting(0, 7))).toBe(true);
  });
  it("filters binary window lookup by horizontally rendered columns in configured order", () => {
    const result = createRowSpanPlan(
      rows([1, 1, 2, 2]),
      [
        { id: "__proto__", spanRows: true },
        { id: "constructor", spanRows: true },
      ],
      { getValue: valueOf },
    );
    expect(
      result
        .intersecting(1, 3, ["constructor", "ordinary", "constructor"])
        .map((run) => [run.columnId, run.ownerIndex]),
    ).toEqual([
      ["constructor", 0],
      ["constructor", 2],
    ]);
    expect(result.intersecting(1, 2).map((run) => run.columnId)).toEqual([
      "__proto__",
      "constructor",
    ]);
  });
  it("agrees with a reference coverage scan across every half-open window", () => {
    const result = plan([1, 1, 2, 3, 3, 3, 4, 5, 5, 6, 6]);
    const all = result.intersecting(0, 11);
    for (let start = 0; start <= 11; start++)
      for (let end = start; end <= 11; end++)
        expect(result.intersecting(start, end)).toEqual(
          start === end
            ? []
            : all.filter((run) => run.ownerIndex < end && run.end > start),
        );
  });
  it("rebuilds from actual current model sort/filter/page/edit/undo order without mutating rows", () => {
    const model = createGrid({
      rows: [
        { id: "a", value: "A" },
        { id: "b", value: "B" },
        { id: "c", value: "A" },
      ],
      columns: [
        { id: "value", field: "value", editable: true, spanRows: true },
      ],
      getRowId: (row) => row.id,
    });
    const build = () =>
      createRowSpanPlan(
        model.getPageRows().map((node, index) => ({
          id: node.id,
          kind: node.kind,
          data: node.data,
          region: "body" as const,
          top: index * 10,
          height: 10,
        })),
        model.getColumns(),
        { getValue: model.getValue },
      );
    expect(build().mergedRunCount).toBe(0);
    model.setSort("value", "asc");
    expect(build().ownerAt(1, "value")?.ownerId).toBe("a");
    model.setFilter("value", { op: "equals", value: "A" });
    expect(build().ownerAt(1, "value")?.span).toBe(2);
    model.setFilter("value");
    model.setSort("value", null);
    model.editCell("b", "value", "A");
    expect(build().ownerAt(2, "value")?.span).toBe(3);
    model.undo();
    expect(build().mergedRunCount).toBe(0);
    model.setState({ pageSize: 1 });
    expect(build().mergedRunCount).toBe(0);
    expect(model.getRows().map((row) => row.value)).toEqual(["A", "B", "A"]);
  });
});

describe("row span validation and resource limits", () => {
  it("validates every row and work budget before any application callback", () => {
    const getValue = vi.fn(valueOf),
      compare = vi.fn(() => true),
      input = rows([1, 1, 1]);
    input[2] = { ...input[2], height: -1 };
    expect(() =>
      createRowSpanPlan(input, [{ id: "value", spanRows: compare }], {
        getValue,
      }),
    ).toThrow("geometry");
    expect(getValue).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    expect(() => plan([1, 1, 1], { getValue, maxWork: 2 })).toThrow("work");
    expect(getValue).not.toHaveBeenCalled();
    expect(() =>
      createRowSpanPlan(
        rows([1]),
        Array.from({ length: 9 }, (_, index) => ({
          id: String(index),
          spanRows: true,
        })),
        { getValue },
      ),
    ).toThrow("active columns");
  });
  it("rejects duplicate identities, overlaps, invalid regions/depth/flags and unsafe geometry", () => {
    const badPatches: Partial<RowSpanRow<Item>>[] = [
      { id: "0" },
      { id: "" },
      { top: 9 },
      { top: NaN },
      { top: Infinity },
      { top: -1 },
      { height: 0 },
      { detailHeight: -1 },
      { depth: 0.5 },
      { depth: -1 },
      { leaf: 1 as never },
      { fullWidth: "true" as never },
      { region: "invalid" as never },
      { kind: "invalid" as never },
    ];
    for (const patch of badPatches) {
      const input = rows([1, 1]);
      input[1] = { ...input[1], ...patch };
      expect(() =>
        createRowSpanPlan(input, column, { getValue: valueOf }),
      ).toThrow();
    }
    expect(() =>
      createRowSpanPlan(
        [{ ...rows([1])[0], top: Number.MAX_SAFE_INTEGER, height: 1 }],
        column,
        { getValue: valueOf },
      ),
    ).toThrow("interval");
    const regions = rows([1, 1]);
    regions[1] = { ...regions[1], region: "top" };
    expect(() =>
      createRowSpanPlan(regions, column, { getValue: valueOf }),
    ).toThrow("regions");
    expect(() =>
      createRowSpanPlan(rows([1]), [{ id: "x" }, { id: "x" }], {
        getValue: valueOf,
      }),
    ).toThrow("unique");
    expect(() =>
      createRowSpanPlan(rows([1]), [{ id: "x", spanRows: 2 as never }], {
        getValue: valueOf,
      }),
    ).toThrow("boolean");
  });
  it("rejects sparse/accessor arrays without invoking their getters", () => {
    expect(() =>
      createRowSpanPlan(new Array(1), column, { getValue: valueOf }),
    ).toThrow("holes");
    const accessor = vi.fn(),
      input = rows([1]);
    Object.defineProperty(input, "0", { get: accessor });
    expect(() =>
      createRowSpanPlan(input, column, { getValue: valueOf }),
    ).toThrow("accessors");
    expect(accessor).not.toHaveBeenCalled();
    expect(() =>
      createRowSpanPlan([], new Array(1), { getValue: valueOf }),
    ).toThrow("holes");
  });
  it("bounds option limits, input rows/columns and window requests", () => {
    for (const key of [
      "maxRows",
      "maxColumns",
      "maxWork",
      "maxRunRows",
    ] as const)
      for (const invalid of [
        0,
        -1,
        1.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER,
      ])
        expect(() => plan([], { [key]: invalid })).toThrow(key);
    expect(() =>
      createRowSpanPlan(new Array(100_001), [], { getValue: valueOf }),
    ).toThrow("row limit");
    expect(() =>
      createRowSpanPlan([], new Array(100_001), { getValue: valueOf }),
    ).toThrow("column limit");
    expect(() =>
      createRowSpanPlan([], [], { getValue: false as never }),
    ).toThrow("getValue");
    const result = plan([1, 1]);
    for (const [start, end] of [
      [-1, 1],
      [0, 3],
      [2, 1],
      [0.5, 1],
      [NaN, 1],
    ])
      expect(() => result.intersecting(start, end)).toThrow("interval");
    expect(() => result.intersecting(0, 1, new Array(100_001))).toThrow(
      "column request",
    );
  });
  it("keeps a 100,000-row equal column to 100 merged runs, and singleton columns to zero runs", () => {
    const input = rows(Array(100_000).fill("A")),
      getValue = vi.fn(valueOf),
      result = createRowSpanPlan(input, column, { getValue });
    expect(result.mergedRunCount).toBe(100);
    expect(getValue).toHaveBeenCalledTimes(100_000);
    expect(result.ownerAt(99_999, "value")).toMatchObject({
      ownerIndex: 99_000,
      end: 100_000,
      span: 1000,
    });
    expect(result.intersecting(54_321, 54_322)).toHaveLength(1);
    const singletons = createRowSpanPlan(
      rows(Array.from({ length: 10_000 }, (_, index) => index)),
      column,
      { getValue: valueOf },
    );
    expect(singletons.mergedRunCount).toBe(0);
    expect(singletons.ownerAt(9999, "value")).toBeUndefined();
  });
  it("supports empty plans and disabled columns without value or predicate evaluation", () => {
    const getValue = vi.fn(valueOf),
      result = createRowSpanPlan(
        rows([1, 1]),
        [{ id: "x", spanRows: false }, { id: "y" }],
        { getValue },
      );
    expect(result.columnIds).toEqual([]);
    expect(result.mergedRunCount).toBe(0);
    expect(result.intersecting(0, 2)).toEqual([]);
    expect(getValue).not.toHaveBeenCalled();
    expect(
      createRowSpanPlan([], column, { getValue }).ownerAt(0, "value"),
    ).toBeUndefined();
  });
});
