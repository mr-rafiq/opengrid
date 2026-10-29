import { describe, expect, it, vi } from "vitest";
import { createCombinedRowSpanPlan } from "./combined-spans";
import type { CombinedSpanColumn } from "./combined-spans";
import type { RowSpanRow } from "./row-spans";

type Row = { id: string; a: unknown; b: unknown; width: number };
type MutableColumn = {
  -readonly [K in keyof CombinedSpanColumn<Row>]: CombinedSpanColumn<Row>[K];
};
const rows = (values: unknown[], widths: number[] = []): RowSpanRow<Row>[] =>
  values.map((a, index) => ({
    id: String(index),
    kind: "row",
    data: { id: String(index), a, b: "same", width: widths[index] ?? 2 },
    region: "body",
    top: index * 38,
    height: 38,
  }));
const columns = (): MutableColumn[] => [
  { id: "a", colSpan: (row) => row.width, spanRows: true },
  { id: "b", spanRows: true },
  { id: "c" },
];
const getValue = (row: Row, id: string) => (id === "a" ? row.a : row.b);

describe("combined horizontal footprints and vertical ownership", () => {
  it("merges identical owner rectangles while suppressing covered predicates/getters", () => {
    const input = columns(),
      covered = vi.fn(() => true),
      read = vi.fn(getValue),
      coveredSpan = vi.fn(() => 2);
    input[1] = { ...input[1], spanRows: covered, colSpan: coveredSpan };
    const plan = createCombinedRowSpanPlan(rows(["g", "g", "h", "h"]), input, {
      getValue: read,
    });
    expect(plan.mergedRunCount).toBe(2);
    expect(plan.ownerAt(1, "a")).toMatchObject({
      ownerIndex: 0,
      end: 2,
      span: 2,
      height: 76,
    });
    expect(plan.ownerAt(3, "a")).toMatchObject({
      ownerIndex: 2,
      end: 4,
      span: 2,
    });
    expect(plan.ownerAt(1, "b")).toBeUndefined();
    expect(covered).not.toHaveBeenCalled();
    expect(coveredSpan).not.toHaveBeenCalled();
    expect(read.mock.calls.every(([, id]) => id === "a")).toBe(true);
    expect(read).toHaveBeenCalledTimes(4);
  });
  it("splits changing horizontal footprints before a later independent rectangle", () => {
    const plan = createCombinedRowSpanPlan(
      rows(["g", "g", "g", "g"], [2, 1, 1, 1]),
      columns(),
      { getValue },
    );
    expect(plan.ownerAt(0, "a")).toBeUndefined();
    expect(plan.ownerAt(1, "a")).toMatchObject({ ownerIndex: 1, end: 4 });
    expect(plan.ownerAt(3, "b")).toMatchObject({ ownerIndex: 1, end: 4 });
    expect(plan.ownerAt(0, "b")).toBeUndefined();
  });
  it("breaks an existing rectangle before a following horizontal owner covers its anchor", () => {
    const input: CombinedSpanColumn<Row>[] = [
      { id: "b", colSpan: (row) => row.width },
      { id: "a", spanRows: true },
      { id: "c" },
    ];
    const read = vi.fn(getValue),
      plan = createCombinedRowSpanPlan(
        rows(["g", "g", "g", "g"], [1, 1, 2, 2]),
        input,
        { getValue: read },
      );
    expect(plan.ownerAt(1, "a")).toMatchObject({ ownerIndex: 0, end: 2 });
    expect(plan.ownerAt(2, "a")).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it.each(["ltr", "rtl"] as const)(
    "clips rectangular footprints at physical pin regions in %s",
    (direction) => {
      const input: CombinedSpanColumn<Row>[] = [
        {
          id: "a",
          pinned: direction === "ltr" ? "left" : "right",
          colSpan: 999,
          spanRows: true,
        },
        { id: "b", colSpan: 2, spanRows: true },
        { id: "c" },
        {
          id: "d",
          pinned: direction === "ltr" ? "right" : "left",
          spanRows: true,
        },
      ];
      const plan = createCombinedRowSpanPlan(rows([1, 1]), input, {
        getValue,
        direction,
      });
      expect(plan.ownerAt(1, "a")?.ownerIndex).toBe(0);
      expect(plan.ownerAt(1, "b")?.ownerIndex).toBe(0);
      expect(plan.ownerAt(1, "d")?.ownerIndex).toBe(0);
    },
  );
  it("supports hidden columns without counting them in horizontal footprints", () => {
    const input = columns();
    input[1].hidden = true;
    const plan = createCombinedRowSpanPlan(rows([1, 1]), input, { getValue });
    expect(plan.columnIds).toEqual(["a"]);
    expect(plan.ownerAt(1, "a")?.span).toBe(2);
    expect(plan.ownerAt(1, "b")).toBeUndefined();
  });
  it.each([
    { name: "NaN", values: [NaN, NaN], merged: true },
    {
      name: "BigInt",
      values: [9007199254740993n, 9007199254740993n],
      merged: true,
    },
    { name: "signed zero", values: [0, -0], merged: false },
    {
      name: "distinct dates",
      values: [new Date(0), new Date(0)],
      merged: false,
    },
    { name: "mixed primitives", values: [1, "1"], merged: false },
  ])("retains raw Object.is semantics for $name", ({ values, merged }) => {
    const plan = createCombinedRowSpanPlan(rows(values), columns(), {
      getValue,
    });
    expect(Boolean(plan.ownerAt(1, "a"))).toBe(merged);
  });
  it("uses custom adjacent predicates only on matching footprints and bypasses value reads", () => {
    const predicate = vi.fn(
      (left: Row, right: Row) =>
        typeof left.a === "string" &&
        typeof right.a === "string" &&
        left.a.toLowerCase() === right.a.toLowerCase(),
    );
    const input = columns();
    input[0].spanRows = predicate;
    const read = vi.fn(() => {
      throw new Error("custom must bypass getter");
    });
    const plan = createCombinedRowSpanPlan(
      rows(["ALPHA", "alpha", "alpha"], [2, 2, 1]),
      input,
      { getValue: read },
    );
    expect(plan.ownerAt(1, "a")?.span).toBe(2);
    expect(plan.ownerAt(2, "a")).toBeUndefined();
    expect(predicate).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    "group",
    "nonleaf",
    "detail",
    "fullWidth",
    "depth",
    "gap",
    "region",
  ] as const)("keeps %s row boundaries intact", (boundary) => {
    const input = rows([1, 1, 1]);
    if (boundary === "group") input[1] = { ...input[1], kind: "group" };
    if (boundary === "nonleaf") input[1] = { ...input[1], leaf: false };
    if (boundary === "detail") {
      input[1] = { ...input[1], detailHeight: 10 };
      input[2] = { ...input[2], top: 86 };
    }
    if (boundary === "fullWidth") input[1] = { ...input[1], fullWidth: true };
    if (boundary === "depth") input[1] = { ...input[1], depth: 1 };
    if (boundary === "gap") {
      input[1] = { ...input[1], top: 48 };
      input[2] = { ...input[2], top: 96 };
    }
    if (boundary === "region") {
      input[0] = { ...input[0], region: "top" };
      input[1] = { ...input[1], top: 0 };
      input[2] = { ...input[2], top: 48 };
    }
    const plan = createCombinedRowSpanPlan(input, columns(), { getValue });
    expect(plan.ownerAt(0, "a")).toBeUndefined();
    expect(plan.ownerAt(1, "a")).toBeUndefined();
    expect(plan.ownerAt(2, "a")).toBeUndefined();
  });
  it("retains offscreen owners and frozen compact runs after borrowed data changes", () => {
    const input = rows([1, 1, 1]),
      plan = createCombinedRowSpanPlan(input, columns(), { getValue });
    const runs = plan.intersecting(2, 3, ["a"]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      ownerIndex: 0,
      end: 3,
      ownerId: "0",
      height: 114,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(runs)).toBe(true);
    expect(Object.isFrozen(runs[0])).toBe(true);
    expect(Object.isFrozen(input[0])).toBe(false);
    expect(Object.isFrozen(input[0].data)).toBe(false);
    input[1].data!.a = 2;
    expect(plan.ownerAt(2, "a")?.span).toBe(3);
    expect(
      createCombinedRowSpanPlan(input, columns(), { getValue }).mergedRunCount,
    ).toBe(0);
  });
  it("applies forced row-run caps without comparing across the split", () => {
    const predicate = vi.fn(() => true),
      input = columns();
    input[0].spanRows = predicate;
    const plan = createCombinedRowSpanPlan(rows([1, 1, 1, 1, 1]), input, {
      getValue,
      maxRunRows: 2,
    });
    expect(plan.ownerAt(1, "a")).toMatchObject({ ownerIndex: 0, end: 2 });
    expect(plan.ownerAt(3, "a")).toMatchObject({ ownerIndex: 2, end: 4 });
    expect(plan.ownerAt(4, "a")).toBeUndefined();
    expect(predicate).toHaveBeenCalledTimes(2);
  });
  it("validates all geometry and budgets before any application callback", () => {
    const horizontal = vi.fn(() => 2),
      vertical = vi.fn(() => true),
      read = vi.fn(getValue);
    const input = columns();
    input[0] = { ...input[0], colSpan: horizontal, spanRows: vertical };
    const invalidRows = rows([1, 1]);
    invalidRows[1] = { ...invalidRows[1], height: 0 };
    expect(() =>
      createCombinedRowSpanPlan(invalidRows, input, { getValue: read }),
    ).toThrow();
    expect(() =>
      createCombinedRowSpanPlan(rows([1, 1]), input, {
        getValue: read,
        maxCells: 5,
      }),
    ).toThrow();
    expect(() =>
      createCombinedRowSpanPlan(rows([1, 1]), input, {
        getValue: read,
        maxWork: 1,
      }),
    ).toThrow();
    expect(horizontal).not.toHaveBeenCalled();
    expect(vertical).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it("propagates callback failures unchanged and recovers on a fresh construction", () => {
    const failure = new Error("application span failed"),
      input = columns();
    input[0].colSpan = () => {
      throw failure;
    };
    expect(() =>
      createCombinedRowSpanPlan(rows([1, 1]), input, { getValue }),
    ).toThrow(failure);
    input[0].colSpan = 2;
    expect(
      createCombinedRowSpanPlan(rows([1, 1]), input, { getValue })
        .mergedRunCount,
    ).toBe(1);
  });
  it("keeps getter and horizontal callback work linear in the projected cell budget", () => {
    const horizontal = vi.fn(() => 2),
      read = vi.fn(getValue),
      input = columns();
    input[0].colSpan = horizontal;
    const plan = createCombinedRowSpanPlan(rows(Array(1000).fill(1)), input, {
      getValue: read,
    });
    expect(plan.ownerAt(999, "a")?.span).toBe(1000);
    expect(horizontal).toHaveBeenCalledTimes(1000);
    expect(read).toHaveBeenCalledTimes(1000);
  });
});
