import { describe, expect, it, vi } from "vitest";
import {
  createGrid,
  matchesFilter,
  prepareColumnFilter,
  prepareMultiFilter,
  MULTI_FILTER_LIMITS,
  ColumnFilterValidationError,
  type Filter,
  type MultiColumnFilter,
} from "./index.js";
import { compileFilterPredicate } from "./filter-predicates.js";
const multi = (filters: MultiColumnFilter["filters"]): MultiColumnFilter => ({
  op: "multi",
  filters,
});
const example = () =>
  multi([
    {
      id: "conditions",
      filter: {
        op: "or",
        conditions: [
          { op: "contains", value: "north" },
          { op: "contains", value: "south" },
        ],
      },
    },
    { id: "values", filter: { op: "in", value: ["south", "west"] } },
    { id: "inactive" },
  ]);

describe("independent named column filters", () => {
  it("ANDs active child models while preserving each child's OR semantics", () => {
    const filter = example(),
      compiled = compileFilterPredicate(filter, { id: "region", type: "text" });
    for (const value of ["north", "south", "west", "SOUTH", null, ""]) {
      expect(matchesFilter(value, filter, { id: "region", type: "text" })).toBe(
        value === "south" || value === "SOUTH",
      );
      expect(compiled(value)).toBe(
        matchesFilter(value, filter, { id: "region", type: "text" }),
      );
    }
  });
  it("treats inactive children as absent and active empty membership as no matches", () => {
    const inactive = multi([{ id: "one" }, { id: "two", filter: undefined }]);
    for (const value of [null, undefined, 1, "", 0n]) {
      expect(matchesFilter(value, inactive)).toBe(true);
      expect(compileFilterPredicate(inactive)(value)).toBe(true);
    }
    const none = multi([{ id: "one", filter: { op: "in", value: [] } }]);
    expect(matchesFilter("anything", none)).toBe(false);
    expect(compileFilterPredicate(none)(null)).toBe(false);
  });
  it("owns and freezes the full snapshot without freezing borrowed models", () => {
    const values = ["north", "south"],
      input = multi([{ id: "values", filter: { op: "in", value: values } }]);
    const result = prepareMultiFilter(input),
      compiled = compileFilterPredicate(input);
    values.splice(0, 2, "west");
    expect(result.filters[0].filter).toEqual({
      op: "in",
      value: ["north", "south"],
    });
    expect(compiled("south")).toBe(true);
    expect(compiled("west")).toBe(false);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(values)).toBe(false);
    for (const value of [
      result,
      result.filters,
      result.filters[0],
      result.filters[0].filter,
      result.filters[0].filter?.value,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });
  it("preserves exact BigInts, negative zero and special child IDs", () => {
    const big = multi([
      { id: "__proto__", filter: { op: "gte", value: "9007199254740993" } },
      { id: "constructor", filter: { op: "lt", value: 9007199254740995n } },
    ]);
    const predicate = compileFilterPredicate(big, { id: "n", type: "bigint" });
    expect(predicate("9007199254740992")).toBe(false);
    expect(predicate(9007199254740993n)).toBe(true);
    expect(predicate("9007199254740994")).toBe(true);
    expect(predicate("9007199254740995")).toBe(false);
    const zeros = multi([{ id: "zero", filter: { op: "in", value: [-0] } }]);
    expect(compileFilterPredicate(zeros, { id: "n", type: "number" })(-0)).toBe(
      true,
    );
    expect(compileFilterPredicate(zeros, { id: "n", type: "number" })(0)).toBe(
      false,
    );
  });
  it("keeps legacy mutable Date operands outside the new strict child boundary", () => {
    const date = new Date("2026-01-01T00:00:00Z"),
      legacy = { op: "equals" as const, value: date };
    expect(prepareColumnFilter(legacy).value).toBe(date);
    expect(() =>
      prepareMultiFilter(multi([{ id: "date", filter: legacy }])),
    ).toThrow(ColumnFilterValidationError);
    expect(
      prepareMultiFilter(
        multi([
          { id: "date", filter: { op: "equals", value: date.toISOString() } },
        ]),
      ).filters[0].filter?.value,
    ).toBe(date.toISOString());
  });
  it.each([
    null,
    {},
    { op: "and", filters: [] },
    { op: "multi", filters: [] },
    { op: "multi", filters: [{}] },
    multi([{ id: "" }]),
    multi([{ id: "same" }, { id: "same" }]),
    { op: "multi", filters: [{ id: "nested", filter: multi([{ id: "x" }]) }] },
    { op: "multi", filters: [{ id: "extra", other: true }] },
  ])("rejects malformed named models: %j", (input) => {
    expect(() => prepareMultiFilter(input)).toThrow(
      ColumnFilterValidationError,
    );
  });
  it("rejects metadata/operand getters without invoking them or coercing value objects", () => {
    const getter = vi.fn(() => []),
      value = vi.fn(() => "north"),
      operand = { toString: value };
    const input = { op: "multi" };
    Object.defineProperty(input, "filters", { get: getter });
    expect(() => prepareMultiFilter(input)).toThrow(
      ColumnFilterValidationError,
    );
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      matchesFilter(
        operand,
        multi([{ id: "bad", filter: { op: "contains", value: operand } }]),
      ),
    ).toThrow(ColumnFilterValidationError);
    expect(value).not.toHaveBeenCalled();
    const child = { id: "child" };
    Object.defineProperty(child, "filter", { get: getter });
    expect(() => prepareMultiFilter({ op: "multi", filters: [child] })).toThrow(
      ColumnFilterValidationError,
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it("enforces shared membership and operand text budgets across children", () => {
    const membership = multi([
      {
        id: "a",
        filter: {
          op: "in",
          value: Array.from({ length: 5000 }, (_, index) => index),
        },
      },
      {
        id: "b",
        filter: {
          op: "in",
          value: Array.from({ length: 5001 }, (_, index) => index),
        },
      },
    ]);
    expect(() => prepareMultiFilter(membership)).toThrow(
      /Shared multi-filter operand budget/,
    );
    const text = multi([
      { id: "a", filter: { op: "contains", value: "a".repeat(128000) } },
      { id: "b", filter: { op: "contains", value: "b".repeat(128001) } },
    ]);
    expect(() => prepareMultiFilter(text)).toThrow(
      /Shared multi-filter operand budget/,
    );
    expect(() =>
      prepareMultiFilter(
        multi(
          Array.from(
            { length: MULTI_FILTER_LIMITS.maxFilters + 1 },
            (_, index) => ({ id: String(index) }),
          ),
        ),
      ),
    ).toThrow(/child budget/);
    expect(() =>
      prepareMultiFilter(
        multi([{ id: "x".repeat(MULTI_FILTER_LIMITS.maxIdLength + 1) }]),
      ),
    ).toThrow(/ID length/);
  });
  it("composes independent 16-condition children without flattening their identity", () => {
    const filter = multi(
      Array.from({ length: 4 }, (_, index) => ({
        id: `child${index}`,
        filter: {
          op: "and" as const,
          conditions: Array.from({ length: 16 }, () => ({
            op: "notBlank" as const,
          })),
        },
      })),
    );
    const result = prepareMultiFilter(filter);
    expect(result.filters).toHaveLength(4);
    expect(matchesFilter("value", result)).toBe(true);
    expect(matchesFilter("", result)).toBe(false);
  });
  it("applies a prepared model atomically and preserves previous state on invalid updates", () => {
    const model = createGrid({
      rows: [
        { id: "n", region: "north" },
        { id: "s", region: "south" },
        { id: "w", region: "west" },
      ],
      columns: [{ id: "region", field: "region", type: "text" }],
      getRowId: (row) => row.id,
    });
    model.setFilter("region", example());
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["s"]);
    const before = model.getState(),
      changed = vi.fn(),
      stop = model.subscribe(changed);
    expect(() =>
      model.setFilter("region", {
        op: "multi",
        filters: [{ id: "x", filter: example() }],
      } as unknown as Filter),
    ).toThrow(ColumnFilterValidationError);
    expect(model.getState()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    stop();
    const snapshot = model.getState().filters.region;
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.op).toBe("multi");
  });
  it("agrees with independently evaluated intersections across generated values", () => {
    for (let seed = 0; seed < 20; seed++) {
      const low = seed - 10,
        high = seed + 5,
        members = Array.from({ length: 30 }, (_, index) => index - 15).filter(
          (value) => (value + seed) % 3 === 0,
        );
      const filter = multi([
          {
            id: "bounds",
            filter: {
              op: "and",
              conditions: [
                { op: "gte", value: low },
                { op: "lt", value: high },
              ],
            },
          },
          { id: "members", filter: { op: "in", value: members } },
        ]),
        compiled = compileFilterPredicate(filter, { id: "n", type: "number" });
      for (let value = -20; value < 30; value++) {
        const expected =
          value >= low && value < high && members.includes(value);
        expect(compiled(value)).toBe(expected);
        expect(matchesFilter(value, filter, { id: "n", type: "number" })).toBe(
          expected,
        );
      }
    }
  });
});
