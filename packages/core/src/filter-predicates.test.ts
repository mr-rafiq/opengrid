import { describe, expect, it, vi } from "vitest";
import type { Column, Filter } from "./types.js";
import { createGrid, matchesFilter } from "./index.js";
import { compileFilterPredicate } from "./filter-predicates.js";

describe("calculation-owned filter predicates", () => {
  it("matches legacy comparisons across every operator and typed source domain", () => {
    const values: unknown[] = [
      null,
      undefined,
      "",
      " ",
      "ALPHA",
      "alpha",
      "Beta",
      0,
      -0,
      1,
      -2,
      1.5,
      NaN,
      Infinity,
      true,
      false,
      "true",
      "false",
      0n,
      1n,
      9007199254740993n,
      "9007199254740993",
      "2026-01-02",
      new Date("2026-01-02"),
      new Date(NaN),
      "invalid",
    ];
    const types: Column<unknown>["type"][] = [
      undefined,
      "text",
      "number",
      "bigint",
      "date",
      "boolean",
    ];
    const filters: Filter[] = [
      { op: "blank" },
      { op: "notBlank" },
      { op: "contains", value: "AL" },
      { op: "startsWith", value: "a" },
      { op: "endsWith", value: "a" },
      { op: "equals", value: 1 },
      { op: "equals", value: null },
      { op: "notEqual", value: "alpha" },
      { op: "gt", value: 0 },
      { op: "gte", value: 1 },
      { op: "lt", value: 2 },
      { op: "lte", value: "2026-01-02" },
      { op: "between", value: -2, to: 1 },
      { op: "between", value: null, to: 3 },
      {
        op: "in",
        value: [null, -0, "ALPHA", 9007199254740993n, "2026-01-02", NaN],
      },
      { op: "in", value: [] },
      { op: "in", value: "not an array" },
    ];
    for (const type of types)
      for (const filter of filters) {
        const column: Column<unknown> = { id: "v", type };
        const compiled = compileFilterPredicate(filter, column);
        for (const value of values) {
          const expected = matchesFilter(value, filter, column);
          expect(compiled(value)).toBe(expected);
        }
      }
  });

  it("preserves Object.is negative zero, NaN, primitive types and object identity", () => {
    const object = {},
      other = {};
    const zero = compileFilterPredicate({ op: "in", value: [-0] });
    expect(zero(-0)).toBe(true);
    expect(zero(0)).toBe(false);
    const mixed = compileFilterPredicate({
      op: "in",
      value: [NaN, 1n, object],
    });
    expect(mixed(NaN)).toBe(true);
    expect(mixed(1n)).toBe(true);
    expect(mixed(1)).toBe(false);
    expect(mixed(object)).toBe(true);
    expect(mixed(other)).toBe(false);
  });

  it("keeps public matcher live while compiled date membership is a fresh per-calculation snapshot", () => {
    const date = new Date("2026-01-02"),
      selected: unknown[] = [date];
    const filter: Filter = { op: "in", value: selected },
      column: Column<unknown> = { id: "v", type: "date" };
    const first = compileFilterPredicate(filter, column);
    date.setUTCDate(3);
    selected.push("2026-01-04");
    expect(matchesFilter("2026-01-03", filter, column)).toBe(true);
    expect(matchesFilter("2026-01-04", filter, column)).toBe(true);
    expect(first("2026-01-02")).toBe(true);
    expect(first("2026-01-03")).toBe(false);
    const next = compileFilterPredicate(filter, column);
    expect(next("2026-01-02")).toBe(false);
    expect(next("2026-01-03")).toBe(true);
    expect(next("2026-01-04")).toBe(true);
  });

  it("normalizes K selected date operands once rather than on each of N row checks", () => {
    const dates = Array.from(
      { length: 100 },
      (_, index) => new Date(Date.UTC(2026, 0, index + 1)),
    );
    const reads = dates.map((date) => vi.spyOn(date, "getTime"));
    const predicate = compileFilterPredicate(
      { op: "in", value: dates },
      { id: "v", type: "date" },
    );
    expect(
      reads.reduce((count, read) => count + read.mock.calls.length, 0),
    ).toBe(100);
    for (let index = 0; index < 1000; index++) predicate("2020-01-01");
    expect(
      reads.reduce((count, read) => count + read.mock.calls.length, 0),
    ).toBe(100);
  });

  it("reads accessor operands once and treats sparse arrays consistently", () => {
    const selected = new Array<unknown>(3),
      read = vi.fn(() => "A");
    Object.defineProperty(selected, "1", { get: read, configurable: true });
    const filter: Filter = { op: "in", value: selected };
    const compiled = compileFilterPredicate(filter);
    expect(read).toHaveBeenCalledTimes(1);
    expect(compiled("a")).toBe(true);
    expect(compiled(null)).toBe(false);
    expect(matchesFilter("A", filter)).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("snapshots nonmembership operands too without caching mutable public filters globally", () => {
    const column: Column<unknown> = { id: "v", type: "number" };
    const filter: Filter = { op: "between", value: "1", to: "3" };
    const first = compileFilterPredicate(filter, column);
    filter.value = "10";
    filter.to = "30";
    expect(first(2)).toBe(true);
    expect(matchesFilter(2, filter, column)).toBe(false);
    expect(compileFilterPredicate(filter, column)(20)).toBe(true);
  });

  it("compiles selected operands once per actual grid calculation and rebuilds on expiry", () => {
    const first = new Date("2026-01-01"),
      second = new Date("2026-01-02");
    const selected = [first, second],
      reads = selected.map((date) => vi.spyOn(date, "getTime"));
    const rows = Array.from({ length: 80 }, (_, index) => ({
      id: String(index),
      value: new Date(index % 2 ? "2026-01-02" : "2026-01-01"),
    }));
    const model = createGrid({
      rows,
      columns: [{ id: "value", field: "value", type: "date" }],
      getRowId: (row) => row.id,
    });
    model.setFilter("value", { op: "in", value: selected });
    reads.forEach((read) => read.mockClear());
    expect(model.getFilteredRows()).toHaveLength(80);
    expect(reads.map((read) => read.mock.calls.length)).toEqual([1, 1]);
    model.getFilteredRows();
    expect(reads.map((read) => read.mock.calls.length)).toEqual([1, 1]);
    first.setUTCFullYear(2020);
    expect(model.getFilteredRows()).toHaveLength(80);
    model.expireValueCache();
    expect(model.getFilteredRows()).toHaveLength(40);
    expect(reads.map((read) => read.mock.calls.length)).toEqual([2, 2]);
    reads.forEach((read) => read.mockRestore());
  });

  it("uses compiled membership inside advanced expressions and retains AND/view composition", () => {
    const model = createGrid({
      rows: Array.from({ length: 60 }, (_, index) => ({
        id: String(index),
        date: new Date(index % 2 ? "2026-01-02" : "2026-01-01"),
        group: index < 40 ? "A" : "B",
      })),
      columns: [
        { id: "date", field: "date", type: "date" },
        { id: "group", field: "group" },
      ],
      getRowId: (row) => row.id,
    });
    model.setFilter("group", { op: "in", value: ["A"] });
    model.setAdvancedFilter({
      kind: "and",
      children: [
        {
          kind: "condition",
          columnId: "date",
          filter: {
            op: "in",
            value: ["2026-01-02", "2026-01-03", "2026-01-04"],
          },
        },
        {
          kind: "not",
          child: {
            kind: "condition",
            columnId: "group",
            filter: { op: "in", value: ["B"] },
          },
        },
      ],
    });
    model.setState({ groupBy: ["group"], pageSize: 1 });
    const parse = vi.spyOn(Date, "parse");
    try {
      expect(model.getFilteredRows()).toHaveLength(20);
      expect(parse).toHaveBeenCalledTimes(3);
      expect(model.getPageRows()[0]!.leafCount).toBe(20);
      expect(parse).toHaveBeenCalledTimes(3);
      model.expireValueCache();
      expect(model.getFilteredRows()).toHaveLength(20);
      expect(parse).toHaveBeenCalledTimes(6);
    } finally {
      parse.mockRestore();
    }
  });

  it("does not evaluate unused membership operands for no rows or short-circuited conditions", () => {
    const parse = vi.spyOn(Date, "parse");
    try {
      const model = createGrid<{ id: string; date: Date; amount: number }>({
        rows: [],
        columns: [
          { id: "date", field: "date", type: "date" },
          { id: "amount", field: "amount", type: "number" },
        ],
        getRowId: (row) => row.id,
      });
      model.setFilter("date", { op: "in", value: ["2026-01-02"] });
      expect(model.getFilteredRows()).toEqual([]);
      expect(parse).not.toHaveBeenCalled();
      model.setFilter("date");
      model.setRows([{ id: "a", date: new Date("2026-01-02"), amount: 1 }]);
      model.setAdvancedFilter({
        kind: "and",
        children: [
          {
            kind: "condition",
            columnId: "amount",
            filter: { op: "in", value: [] },
          },
          {
            kind: "condition",
            columnId: "date",
            filter: { op: "in", value: ["2026-01-02"] },
          },
        ],
      });
      parse.mockClear();
      expect(model.getFilteredRows()).toEqual([]);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });
});
