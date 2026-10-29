import { describe, expect, it, vi } from "vitest";
import {
  COLUMN_FILTER_LIMITS,
  ColumnFilterValidationError,
  createGrid,
  matchesFilter,
  prepareColumnFilter,
  prepareColumnFilters,
  prepareCompoundFilter,
  prepareAdvancedFilter,
} from "./index.js";
import type {
  Column,
  CompoundFilter,
  Filter,
  FilterExpression,
  ScalarFilter,
} from "./types.js";
import { compileFilterPredicate } from "./filter-predicates.js";

const and = (...conditions: ScalarFilter[]): CompoundFilter => ({
  op: "and",
  conditions,
});
const or = (...conditions: ScalarFilter[]): CompoundFilter => ({
  op: "or",
  conditions,
});
const asFilter = (value: unknown) => value as Filter;

describe("new owned flat column condition groups", () => {
  it("detaches and freezes every group, condition and membership array without freezing the source", () => {
    const membership = ["Alpha", null, 9007199254740993n],
      first: ScalarFilter = { op: "in", value: membership };
    const input = and(first, { op: "notContains", value: "beta" });
    const result = prepareCompoundFilter(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.conditions).not.toBe(input.conditions);
    expect(result.conditions[0]).not.toBe(first);
    expect(result.conditions[0]!.value).not.toBe(membership);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.conditions)).toBe(true);
    expect(Object.isFrozen(result.conditions[0])).toBe(true);
    expect(Object.isFrozen(result.conditions[0]!.value)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(membership)).toBe(false);
    membership.push("later");
    first.op = "equals";
    expect(result.conditions[0]!.op).toBe("in");
    expect(result.conditions[0]!.value).toEqual([
      "Alpha",
      null,
      9007199254740993n,
    ]);
    expect(Object.hasOwn(result, "value")).toBe(false);
    expect(Object.hasOwn(result, "to")).toBe(false);
  });

  it("keeps primitive types, signed zero, nonfinite values and explicitly supplied undefined intact", () => {
    const values = [
      undefined,
      null,
      "",
      -0,
      0,
      NaN,
      Infinity,
      false,
      9007199254740993n,
    ];
    const result = prepareCompoundFilter(
      or({ op: "in", value: values }, { op: "equals", value: undefined }),
    );
    const copied = result.conditions[0]!.value as unknown[];
    expect(Object.is(copied[3], -0)).toBe(true);
    expect(Object.is(copied[4], 0)).toBe(true);
    expect(Number.isNaN(copied[5])).toBe(true);
    expect(copied[8]).toBe(9007199254740993n);
    expect(Object.hasOwn(result.conditions[1]!, "value")).toBe(true);
  });

  it("requires primitive operands and ISO string dates without invoking object coercion", () => {
    const coerce = vi.fn(() => "2026-01-01"),
      object = { toString: coerce };
    for (const value of [
      new Date("2026-01-01"),
      new Date(NaN),
      object,
      {},
      [],
      () => 1,
      Symbol("x"),
    ]) {
      expect(() => prepareCompoundFilter(and({ op: "equals", value }))).toThrow(
        ColumnFilterValidationError,
      );
      expect(() =>
        prepareCompoundFilter(and({ op: "in", value: [value] })),
      ).toThrow(ColumnFilterValidationError);
    }
    expect(coerce).not.toHaveBeenCalled();
    const filter = and(
      { op: "gte", value: "2026-01-01T00:00:00.000Z" },
      { op: "lt", value: "2026-01-03" },
    );
    expect(
      matchesFilter(new Date("2026-01-02"), filter, {
        id: "date",
        type: "date",
      }),
    ).toBe(true);
  });

  it("rejects empty, nested, recursive, unexpected and incomplete condition models", () => {
    const recursive: { op: string; conditions: unknown[] } = {
      op: "and",
      conditions: [],
    };
    recursive.conditions.push(recursive);
    const malformed = [
      { op: "and", conditions: [] },
      { op: "and", conditions: "not an array" },
      { op: "and", conditions: [{ op: "or", conditions: [{ op: "blank" }] }] },
      recursive,
      { op: "and", conditions: [{ op: "missing", value: 1 }] },
      { op: "and", conditions: [{ op: "equals" }] },
      { op: "and", conditions: [{ op: "between", value: 1 }] },
      { op: "and", conditions: [{ op: "equals", value: 1, to: undefined }] },
      { op: "and", conditions: [{ op: "blank", value: undefined }] },
      { op: "and", conditions: [{ op: "notBlank", to: null }] },
      { op: "and", conditions: [{ op: "in", value: "A" }] },
      { op: "and", conditions: [{ op: "equals", value: 1, extra: true }] },
      { op: "and", conditions: [{ op: "blank" }], value: undefined },
      { op: "and", conditions: [{ op: "blank" }], to: undefined },
      { op: "and", conditions: [{ op: "blank" }], extra: true },
      Object.assign(Object.create({ inherited: true }), and({ op: "blank" })),
    ];
    for (const input of malformed)
      expect(() => prepareCompoundFilter(input)).toThrow(
        ColumnFilterValidationError,
      );
  });

  it("rejects sparse/accessor models and arrays without calling getters", () => {
    const read = vi.fn(() => "equals");
    const root = { conditions: [{ op: "blank" }] };
    Object.defineProperty(root, "op", { get: read });
    const leaf = { op: "equals" };
    Object.defineProperty(leaf, "value", { get: read });
    const members: unknown[] = [];
    Object.defineProperty(members, "0", { get: read });
    const conditions: unknown[] = [];
    Object.defineProperty(conditions, "0", { get: read });
    for (const input of [
      root,
      { op: "and", conditions: [leaf] },
      { op: "and", conditions: members },
      { op: "and", conditions },
      and({ op: "in", value: members }),
      { op: "or", conditions: new Array(2) },
      and({ op: "in", value: new Array(2) }),
    ])
      expect(() => prepareCompoundFilter(input)).toThrow(
        ColumnFilterValidationError,
      );
    expect(read).not.toHaveBeenCalled();
    const missingOperator = asFilter({ conditions: [{ op: "blank" }] });
    const wrongOperator = asFilter({
      op: "equals",
      value: 1,
      conditions: [{ op: "blank" }],
    });
    for (const filter of [missingOperator, wrongOperator]) {
      expect(() => matchesFilter("x", filter)).toThrow(
        ColumnFilterValidationError,
      );
      expect(() => compileFilterPredicate(filter)).toThrow(
        ColumnFilterValidationError,
      );
    }
  });

  it("rejects operator getters at live, compiled and preparation entries without invoking them", () => {
    const read = vi.fn(() => "and"),
      value = { conditions: [{ op: "blank" }] };
    Object.defineProperty(value, "op", { get: read, enumerable: true });
    for (const filter of [value, Object.create(value)]) {
      expect(() => prepareColumnFilter(asFilter(filter))).toThrow(
        ColumnFilterValidationError,
      );
      expect(() => prepareCompoundFilter(filter)).toThrow(
        ColumnFilterValidationError,
      );
      expect(() => matchesFilter("x", asFilter(filter))).toThrow(
        ColumnFilterValidationError,
      );
      expect(() => compileFilterPredicate(asFilter(filter))).toThrow(
        ColumnFilterValidationError,
      );
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects extra own array fields, symbols and custom prototypes without invoking custom iteration", () => {
    const iterate = vi.fn(function* () {
      yield "unexpected";
    });
    const corrupt = (values: unknown[], kind: string) => {
      if (kind === "extra")
        Object.defineProperty(values, "extra", { value: true });
      if (kind === "symbol")
        Object.defineProperty(values, Symbol.iterator, { value: iterate });
      if (kind === "prototype")
        Object.setPrototypeOf(values, Object.create(Array.prototype));
      return values;
    };
    for (const kind of ["extra", "symbol", "prototype"]) {
      const values = corrupt([1], kind);
      expect(() =>
        prepareCompoundFilter(and({ op: "in", value: values })),
      ).toThrow(ColumnFilterValidationError);
      const conditions = corrupt([{ op: "blank" }], kind);
      expect(() => prepareCompoundFilter({ op: "and", conditions })).toThrow(
        ColumnFilterValidationError,
      );
    }
    expect(iterate).not.toHaveBeenCalled();
  });

  it("enforces aggregate condition, membership and operand-text budgets at exact boundaries", () => {
    expect(COLUMN_FILTER_LIMITS).toEqual({
      maxConditions: 16,
      maxMembershipValues: 10000,
      maxTextLength: 256000,
    });
    expect(Object.isFrozen(COLUMN_FILTER_LIMITS)).toBe(true);
    expect(
      prepareCompoundFilter(
        and(...Array.from({ length: 16 }, () => ({ op: "blank" as const }))),
      ).conditions,
    ).toHaveLength(16);
    expect(() =>
      prepareCompoundFilter(
        and(...Array.from({ length: 17 }, () => ({ op: "blank" as const }))),
      ),
    ).toThrow("condition budget");
    expect(
      prepareCompoundFilter(
        and(
          { op: "in", value: Array(5000).fill(0) },
          { op: "in", value: Array(5000).fill(1) },
        ),
      ).conditions,
    ).toHaveLength(2);
    expect(() =>
      prepareCompoundFilter(
        and(
          { op: "in", value: Array(5000).fill(0) },
          { op: "in", value: Array(5001).fill(1) },
        ),
      ),
    ).toThrow("membership operand budget");
    expect(
      prepareCompoundFilter(
        and(
          { op: "contains", value: "a".repeat(128000) },
          { op: "between", value: "b".repeat(64000), to: "c".repeat(64000) },
        ),
      ).conditions,
    ).toHaveLength(2);
    expect(() =>
      prepareCompoundFilter(
        and(
          { op: "contains", value: "a".repeat(128000) },
          { op: "in", value: ["b".repeat(128001)] },
        ),
      ),
    ).toThrow("text budget");
    expect(() =>
      prepareCompoundFilter(
        and(
          { op: "equals", value: "a".repeat(255999) },
          { op: "equals", value: 12n },
        ),
      ),
    ).toThrow("text budget");
  });

  it("supports null-prototype records and prototype-like filter IDs", () => {
    const group = Object.assign(Object.create(null), {
      op: "and",
      conditions: [{ op: "in", value: ["__proto__", "constructor"] }],
    });
    const filters = Object.fromEntries([
      ["__proto__", group],
      ["constructor", { op: "contains", value: "A" }],
    ]);
    const copied = prepareColumnFilters(filters);
    expect(Object.hasOwn(copied, "__proto__")).toBe(true);
    expect(copied.__proto__).toEqual(group);
    expect(copied.constructor).toEqual({ op: "contains", value: "A" });
  });
});

describe("live and calculation-owned typed matching", () => {
  it("defines notContains as case-folded negation, including blanks and empty needles", () => {
    for (const value of [null, undefined, "", "Alpha", "BETA", 42, false]) {
      expect(matchesFilter(value, { op: "notContains", value: "AL" })).toBe(
        !matchesFilter(value, { op: "contains", value: "AL" }),
      );
      expect(
        compileFilterPredicate({ op: "notContains", value: "AL" })(value),
      ).toBe(matchesFilter(value, { op: "notContains", value: "AL" }));
      expect(matchesFilter(value, { op: "notContains", value: "" })).toBe(
        false,
      );
    }
    expect(matchesFilter(null, { op: "notContains", value: "x" })).toBe(true);
    expect(
      matchesFilter(
        null,
        and({ op: "notContains", value: "x" }, { op: "notBlank" }),
      ),
    ).toBe(false);
  });

  it("compares compiled AND/OR groups with live matching across existing typed domains", () => {
    const values = [
      null,
      undefined,
      "",
      "bad",
      "Alpha",
      "alpha",
      "2026-01-02",
      new Date("2026-01-02"),
      0,
      -0,
      1,
      NaN,
      Infinity,
      false,
      true,
      9007199254740993n,
      "9007199254740993",
    ];
    const groups = [
      and({ op: "notContains", value: "beta" }, { op: "notBlank" }),
      or(
        { op: "in", value: [null, -0, NaN, "ALPHA", 9007199254740993n] },
        { op: "between", value: 1, to: 5 },
      ),
      and(
        { op: "gte", value: "2026-01-01" },
        { op: "lte", value: "2026-01-03" },
      ),
      or({ op: "equals", value: "bad" }, { op: "blank" }),
    ];
    for (const type of [
      undefined,
      "text",
      "number",
      "bigint",
      "date",
      "boolean",
    ] as const)
      for (const group of groups) {
        const column: Column<unknown> = { id: "value", type },
          compiled = compileFilterPredicate(group, column);
        for (const value of values)
          expect(compiled(value)).toBe(matchesFilter(value, group, column));
      }
  });

  it("retains exact BigInt and signed-zero membership, plus existing invalid-typed null comparisons", () => {
    const exact = or(
      { op: "in", value: [9007199254740993n] },
      { op: "equals", value: "9007199254740995" },
    );
    expect(
      matchesFilter("9007199254740993", exact, { id: "x", type: "bigint" }),
    ).toBe(true);
    expect(
      matchesFilter(9007199254740994n, exact, { id: "x", type: "bigint" }),
    ).toBe(false);
    const zero = and({ op: "in", value: [-0] }, { op: "notEqual", value: 0 });
    expect(matchesFilter(-0, zero)).toBe(true);
    expect(compileFilterPredicate(zero)(0)).toBe(false);
    const invalid = or(
      { op: "equals", value: "invalid" },
      { op: "in", value: [] },
    );
    expect(matchesFilter(null, invalid, { id: "x", type: "number" })).toBe(
      true,
    );
    expect(
      matchesFilter("also invalid", invalid, { id: "x", type: "number" }),
    ).toBe(true);
  });

  it("keeps public scalar arrays and Dates live while compilation captures its own operands", () => {
    const date = new Date("2026-01-01"),
      values: unknown[] = [date];
    const filter: ScalarFilter = { op: "in", value: values },
      column: Column<unknown> = { id: "value", type: "date" };
    const compiled = compileFilterPredicate(filter, column),
      copied = prepareColumnFilter(filter);
    expect((copied.value as unknown[])[0]).toBe(date);
    expect(copied.value).not.toBe(values);
    date.setUTCDate(2);
    values.push("2026-01-03");
    expect(matchesFilter("2026-01-02", filter, column)).toBe(true);
    expect(matchesFilter("2026-01-03", filter, column)).toBe(true);
    expect(compiled("2026-01-01")).toBe(true);
    expect(compiled("2026-01-02")).toBe(false);
    const object = {},
      permissive: ScalarFilter = { op: "equals", value: object };
    expect(prepareColumnFilter(permissive).value).toBe(object);
    expect(matchesFilter(object, permissive)).toBe(true);
  });

  it("observes between-call group-array edits publicly while compiled group membership remains owned", () => {
    const values = ["A"],
      condition: ScalarFilter = { op: "in", value: values },
      group = and(condition);
    const compiled = compileFilterPredicate(group);
    values.push("B");
    expect(matchesFilter("b", group)).toBe(true);
    expect(compiled("b")).toBe(false);
    expect(compileFilterPredicate(group)("b")).toBe(true);
  });
});

describe("atomic client state and advanced-filter boundaries", () => {
  const rows = [
    { id: "1", amount: 10, name: "Alpha", region: "A" },
    { id: "2", amount: 20, name: "Beta", region: "A" },
    { id: "3", amount: 30, name: "Gamma", region: "B" },
    { id: "4", amount: 40, name: "Alpine", region: "A" },
  ];
  function grid() {
    return createGrid({
      rows,
      columns: [
        {
          id: "amount",
          field: "amount",
          type: "number",
          editable: true,
          aggregate: "sum",
        },
        { id: "name", field: "name", type: "text" },
        { id: "region", field: "region" },
      ],
      getRowId: (row) => row.id,
    });
  }

  it("composes per-column groups with quick/advanced filters, pagination and aggregation", () => {
    const model = grid();
    model.setFilter(
      "amount",
      or({ op: "lte", value: 10 }, { op: "gte", value: 30 }),
    );
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "1",
      "3",
      "4",
    ]);
    model.setFilter("region", { op: "equals", value: "A" });
    model.setQuickFilter("al");
    model.setAdvancedFilter({
      kind: "condition",
      columnId: "name",
      filter: { op: "notContains", value: "ph" },
    });
    model.setState({ groupBy: ["region"], pageSize: 1 });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["4"]);
    expect(model.getPageRows()[0]!.aggregates!.amount).toBe(40);
    expect(model.getPageRows()[0]!.leafCount).toBe(1);
    expect(model.exportCsv()).toContain('"40","Alpine","A"');
  });

  it("restores an immutable group repeatedly without introducing scalar operand properties", () => {
    const model = grid(),
      group = or({ op: "equals", value: 10 }, { op: "equals", value: 40 });
    model.setFilter("amount", group);
    const saved = model.getState(),
      stored = saved.filters.amount as CompoundFilter;
    expect(Object.isFrozen(stored.conditions)).toBe(true);
    group.conditions[0]!.value = 999;
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["1", "4"]);
    model.setFilter("amount");
    model.setState(saved);
    model.setState(model.getState());
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["1", "4"]);
    expect(Object.hasOwn(model.getState().filters.amount, "value")).toBe(false);
    expect(
      () => ((stored.conditions[0] as ScalarFilter).value = 1000),
    ).toThrow();
  });

  it("rejects invalid groups/restoration before invoking getters, replacing caches or notifying", () => {
    const read = vi.fn((row: { value: number }) => row.value),
      model = createGrid({
        rows: [{ id: "r", value: 1 }],
        columns: [{ id: "value", valueGetter: read }],
        getRowId: (row) => row.id,
      });
    model.getFilteredRows();
    model.setFilter("value", and({ op: "gte", value: 0 }));
    model.getFilteredRows();
    const state = model.getState(),
      notify = vi.fn();
    model.subscribe(notify);
    read.mockClear();
    const malformed = asFilter({
      op: "and",
      conditions: [{ op: "equals", value: new Date() }],
    });
    expect(() => model.setFilter("value", malformed)).toThrow(
      ColumnFilterValidationError,
    );
    expect(() =>
      model.setState({
        filters: { value: malformed },
        page: 7,
        quickFilter: "new",
      }),
    ).toThrow(ColumnFilterValidationError);
    expect(model.getState()).toBe(state);
    expect(model.getFilteredRows()).toHaveLength(1);
    expect(read).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    const access = vi.fn(() => malformed),
      record: Record<string, Filter> = {};
    Object.defineProperty(record, "value", { get: access, enumerable: true });
    expect(() => model.setState({ filters: record })).toThrow(
      ColumnFilterValidationError,
    );
    expect(access).not.toHaveBeenCalled();
    expect(model.getState()).toBe(state);
  });

  it("rejects malformed initial groups and preserves edit undo/redo on rejected filters", () => {
    const invalid = asFilter({ op: "and", conditions: [] });
    expect(() =>
      createGrid({
        rows,
        columns: [{ id: "amount", field: "amount" }],
        getRowId: (row) => row.id,
        initialState: { filters: { amount: invalid } },
      }),
    ).toThrow(ColumnFilterValidationError);
    const model = grid();
    model.editCell("1", "amount", 100);
    model.undo();
    expect(() => model.setFilter("amount", invalid)).toThrow(
      ColumnFilterValidationError,
    );
    expect(model.redo()).toBe(true);
    expect(model.getRow("1")!.amount).toBe(100);
  });

  it("keeps advanced AST leaves scalar and adds notContains there without accepting hidden compound trees", () => {
    const columns: Column<unknown>[] = [{ id: "name", type: "text" }];
    expect(
      prepareAdvancedFilter(
        {
          kind: "condition",
          columnId: "name",
          filter: { op: "notContains", value: "beta" },
        },
        columns,
      ),
    ).toEqual({
      kind: "condition",
      columnId: "name",
      filter: { op: "notContains", value: "beta" },
    });
    const invalid = {
      kind: "condition",
      columnId: "name",
      filter: and({ op: "contains", value: "A" }),
    } as unknown as FilterExpression;
    expect(() => prepareAdvancedFilter(invalid, columns)).toThrow();
  });

  it("normalizes membership once per grid calculation, including grouped date predicates", () => {
    const model = createGrid({
      rows: Array.from({ length: 100 }, (_, index) => ({
        id: String(index),
        value: new Date(index % 2 ? "2026-01-02" : "2026-01-03"),
      })),
      columns: [{ id: "value", field: "value", type: "date" }],
      getRowId: (row) => row.id,
    });
    model.setFilter(
      "value",
      and(
        { op: "in", value: ["2026-01-01", "2026-01-02", "2026-01-03"] },
        { op: "gte", value: "2026-01-02" },
      ),
    );
    const parse = vi.spyOn(Date, "parse");
    try {
      expect(model.getFilteredRows()).toHaveLength(100);
      expect(parse).toHaveBeenCalledTimes(4);
      model.getFilteredRows();
      expect(parse).toHaveBeenCalledTimes(4);
      model.expireValueCache();
      expect(model.getFilteredRows()).toHaveLength(100);
      expect(parse).toHaveBeenCalledTimes(8);
    } finally {
      parse.mockRestore();
    }
  });
});
