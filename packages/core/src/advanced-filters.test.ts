import { describe, expect, it, vi } from "vitest";
import {
  AdvancedFilterValidationError,
  createGrid,
  evaluateFilterExpression,
  matchesFilter,
  prepareAdvancedFilter,
} from "./index";
import type {
  Column,
  Filter,
  FilterExpression,
  GridOptions,
  GridState,
} from "./types";

interface Row {
  id: string;
  name: string;
  region: string;
  amount: number;
  date: string;
  large: bigint;
  note: string | null;
  enabled: boolean;
}
const rows: Row[] = [
  {
    id: "a",
    name: "Alice",
    region: "EU",
    amount: 10,
    date: "2026-01-01",
    large: 9007199254740993n,
    note: "",
    enabled: true,
  },
  {
    id: "b",
    name: "Bob",
    region: "US",
    amount: 20,
    date: "2026-01-02",
    large: 9007199254740994n,
    note: "ready",
    enabled: false,
  },
  {
    id: "c",
    name: "Cara",
    region: "EU",
    amount: 30,
    date: "2026-01-03",
    large: 9007199254740995n,
    note: null,
    enabled: true,
  },
  {
    id: "d",
    name: "Dave",
    region: "US",
    amount: 40,
    date: "2026-01-04",
    large: 9007199254740996n,
    note: "done",
    enabled: true,
  },
];
const columns: Column<Row>[] = [
  { id: "name", field: "name", type: "text" },
  { id: "region", field: "region" },
  {
    id: "amount",
    field: "amount",
    type: "number",
    aggregate: "sum",
    editable: true,
  },
  { id: "date", field: "date", type: "date" },
  { id: "large", field: "large", type: "bigint" },
  { id: "note", field: "note" },
  { id: "enabled", field: "enabled", type: "boolean" },
  { id: "locked", valueGetter: (row) => row.name, filterable: false },
];
const condition = (columnId: string, filter: Filter): FilterExpression => ({
  kind: "condition",
  columnId,
  filter,
});
const and = (...children: FilterExpression[]): FilterExpression => ({
  kind: "and",
  children,
});
const or = (...children: FilterExpression[]): FilterExpression => ({
  kind: "or",
  children,
});
const not = (child: FilterExpression): FilterExpression => ({
  kind: "not",
  child,
});
function grid(patch: Partial<GridOptions<Row>> = {}) {
  return createGrid({ rows, columns, getRowId: (row) => row.id, ...patch });
}
const ids = (model: ReturnType<typeof grid>) =>
  model.getFilteredRows().map((row) => row.id);

describe("boolean filter pipeline", () => {
  it("evaluates nested AND, OR and NOT using existing typed predicates", () => {
    const model = grid();
    model.setAdvancedFilter(
      and(
        or(
          condition("region", { op: "equals", value: "EU" }),
          condition("amount", { op: "gte", value: "40" }),
        ),
        not(condition("name", { op: "startsWith", value: "ali" })),
      ),
    );
    expect(ids(model)).toEqual(["c", "d"]);
    model.setAdvancedFilter(null);
    expect(ids(model)).toEqual(["a", "b", "c", "d"]);
  });
  it("combines blanks, BigInt, dates and booleans without precision loss", () => {
    const model = grid();
    model.setAdvancedFilter(
      and(
        condition("note", { op: "blank" }),
        condition("large", { op: "gt", value: "9007199254740993" }),
        condition("date", {
          op: "between",
          value: "2026-01-02",
          to: "2026-01-04",
        }),
        condition("enabled", { op: "equals", value: "true" }),
      ),
    );
    expect(ids(model)).toEqual(["c"]);
    model.setAdvancedFilter(not(condition("note", { op: "notBlank" })));
    expect(ids(model)).toEqual(["a", "c"]);
  });
  it("composes advanced, per-column, quick and external filters with AND", () => {
    const model = grid({ externalFilter: (row) => row.enabled });
    model.setAdvancedFilter(
      or(
        condition("amount", { op: "gte", value: 20 }),
        condition("name", { op: "contains", value: "ali" }),
      ),
    );
    model.setFilter("region", { op: "equals", value: "EU" });
    model.setQuickFilter("cara");
    expect(ids(model)).toEqual(["c"]);
    model.setQuickFilter("");
    expect(ids(model)).toEqual(["a", "c"]);
  });
  it("uses identical condition semantics to matchesFilter for every operator", () => {
    const cases: [string, Filter][] = [
      ["name", { op: "contains", value: "a" }],
      ["name", { op: "startsWith", value: "a" }],
      ["name", { op: "endsWith", value: "e" }],
      ["region", { op: "equals", value: "eu" }],
      ["region", { op: "notEqual", value: "eu" }],
      ["amount", { op: "gt", value: 20 }],
      ["amount", { op: "gte", value: 20 }],
      ["amount", { op: "lt", value: 30 }],
      ["amount", { op: "lte", value: 30 }],
      ["amount", { op: "between", value: 20, to: 30 }],
      ["region", { op: "in", value: ["EU"] }],
      ["note", { op: "blank" }],
      ["note", { op: "notBlank" }],
    ];
    for (const [columnId, filter] of cases) {
      const model = grid(),
        column = columns.find((column) => column.id === columnId)!;
      model.setAdvancedFilter(condition(columnId, filter));
      const expected = rows
        .filter((row) =>
          matchesFilter(model.getValue(row, columnId), filter, column),
        )
        .map((row) => row.id);
      expect(ids(model), filter.op).toEqual(expected);
    }
  });
  it("applies sort, pagination and grouping after filtering and resets the page on changes", () => {
    const model = grid({ initialState: { pageSize: 1, page: 2 } });
    model.setSort("amount", "desc");
    model.setState({ page: 2 });
    model.setAdvancedFilter(condition("region", { op: "equals", value: "EU" }));
    expect(model.getState().page).toBe(0);
    expect(model.getPageCount()).toBe(2);
    expect(model.getPageRows()[0].id).toBe("c");
    model.setState({ groupBy: ["region"] });
    const group = model.getRowModel()[0];
    expect(group.label).toBe("EU");
    expect(group.aggregates?.amount).toBe(40);
    expect(group.leafCount).toBe(2);
    model.toggleExpanded(group.id);
    expect(model.getRowModel().map((node) => node.id)).toEqual([
      group.id,
      "c",
      "a",
    ]);
  });
  it("recomputes after edits and transactions under an active advanced filter", () => {
    const model = grid();
    model.setAdvancedFilter(condition("amount", { op: "gt", value: 30 }));
    expect(ids(model)).toEqual(["d"]);
    model.editCell("a", "amount", 50);
    expect(ids(model)).toEqual(["a", "d"]);
    model.undo();
    expect(ids(model)).toEqual(["d"]);
    model.applyTransaction({ update: [{ ...rows[1], amount: 60 }] });
    expect(ids(model)).toEqual(["b", "d"]);
  });
  it("supports empty membership as a valid match-none condition", () => {
    const model = grid();
    model.setAdvancedFilter(condition("region", { op: "in", value: [] }));
    expect(ids(model)).toEqual([]);
  });
  it("short-circuits logical branches", () => {
    const match = vi.fn(() => true);
    expect(
      evaluateFilterExpression(
        or(
          condition("name", { op: "blank" }),
          condition("amount", { op: "blank" }),
        ),
        match,
      ),
    ).toBe(true);
    expect(match).toHaveBeenCalledTimes(1);
  });
});

describe("atomic validation, snapshots and persistence", () => {
  it("rejects unknown/disabled columns without changing state, caches or listeners", () => {
    const valueGetter = vi.fn((row: Row) => row.amount),
      model = grid({
        columns: [
          ...columns.filter((column) => column.id !== "amount"),
          { id: "amount", type: "number", valueGetter },
        ],
      });
    model.setAdvancedFilter(condition("amount", { op: "gt", value: 10 }));
    expect(ids(model)).toEqual(["b", "c", "d"]);
    const calls = valueGetter.mock.calls.length;
    const before = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    for (const id of ["missing", "locked"])
      expect(() =>
        model.setAdvancedFilter(condition(id, { op: "equals", value: 1 })),
      ).toThrow(AdvancedFilterValidationError);
    expect(model.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(ids(model)).toEqual(["b", "c", "d"]);
    expect(valueGetter).toHaveBeenCalledTimes(calls);
  });
  it("validates direct state restoration atomically and rejects invalid initial state", () => {
    const model = grid();
    model.setState({ page: 1, pageSize: 2 });
    const before = model.getState();
    const invalid = condition("missing", { op: "blank" });
    expect(() =>
      model.setState({ advancedFilter: invalid, quickFilter: "new", page: 0 }),
    ).toThrow();
    expect(model.getState()).toBe(before);
    expect(() => grid({ initialState: { advancedFilter: invalid } })).toThrow(
      AdvancedFilterValidationError,
    );
  });
  it("clones and deeply freezes input ASTs, membership arrays and snapshot trees", () => {
    const membership = ["EU"],
      expression = and(
        condition("region", { op: "in", value: membership }),
        not(condition("amount", { op: "lt", value: 10 })),
      );
    const model = grid();
    model.setAdvancedFilter(expression);
    const snapshot = model.getState();
    membership.push("US");
    if (expression.kind === "and") expression.children.length = 0;
    expect(ids(model)).toEqual(["a", "c"]);
    expect(Object.isFrozen(snapshot.advancedFilter)).toBe(true);
    const prepared = snapshot.advancedFilter!;
    if (prepared.kind !== "and") throw new Error("Expected AND");
    expect(Object.isFrozen(prepared.children)).toBe(true);
    const node = prepared.children[0];
    if (node.kind !== "condition") throw new Error("Expected condition");
    expect(Object.isFrozen(node.filter)).toBe(true);
    expect(Object.isFrozen(node.filter.value)).toBe(true);
  });
  it("round-trips JSON state including precise BigInt and date operands", () => {
    const model = grid();
    model.setAdvancedFilter(
      and(
        condition("large", { op: "gte", value: 9007199254740995n }),
        condition("date", {
          op: "lte",
          value: new Date("2026-01-03T00:00:00Z"),
        }),
      ),
    );
    const stored = JSON.stringify(model.getState());
    expect(stored).toContain("9007199254740995");
    const restored = grid({ initialState: JSON.parse(stored) as GridState });
    expect(ids(restored)).toEqual(["c"]);
    expect(restored.getState().advancedFilter).toEqual(
      model.getState().advancedFilter,
    );
  });
  it.each([
    { kind: "unknown" },
    { kind: "and", children: [] },
    { kind: "or", children: "bad" },
    { kind: "not" },
    {
      kind: "condition",
      columnId: "name",
      filter: { op: "regex", value: ".*" },
    },
    {
      kind: "condition",
      columnId: "name",
      filter: { op: "contains", value: 1 },
    },
    {
      kind: "condition",
      columnId: "amount",
      filter: { op: "gt", value: "bad" },
    },
    {
      kind: "condition",
      columnId: "amount",
      filter: { op: "between", value: 1 },
    },
    {
      kind: "condition",
      columnId: "amount",
      filter: { op: "between", value: null, to: 2 },
    },
    {
      kind: "condition",
      columnId: "date",
      filter: { op: "equals", value: "not-a-date" },
    },
    {
      kind: "condition",
      columnId: "large",
      filter: { op: "equals", value: 9007199254740994 },
    },
    {
      kind: "condition",
      columnId: "enabled",
      filter: { op: "equals", value: "maybe" },
    },
    {
      kind: "condition",
      columnId: "region",
      filter: { op: "in", value: "EU" },
    },
    {
      kind: "condition",
      columnId: "region",
      filter: { op: "equals", value: {} },
    },
    {
      kind: "condition",
      columnId: "region",
      filter: { op: "equals", value: "EU", to: "US" },
    },
    {
      kind: "condition",
      columnId: "note",
      filter: { op: "blank", value: "extra" },
    },
    {
      kind: "condition",
      columnId: "name",
      filter: { op: "equals", value: undefined },
    },
    {
      kind: "condition",
      columnId: "name",
      filter: { op: "equals", value: "A" },
      children: [],
    },
    { kind: "not", child: condition("note", { op: "blank" }), extra: true },
  ])("rejects malformed AST %#", (invalid) => {
    expect(() => prepareAdvancedFilter(invalid, columns)).toThrow(
      AdvancedFilterValidationError,
    );
  });
  it("rejects cyclic trees, sparse arrays, and accessors without invoking getters", () => {
    const cycle: { kind: "not"; child?: unknown } = { kind: "not" };
    cycle.child = cycle;
    try {
      prepareAdvancedFilter(cycle, columns);
      throw new Error("Expected cycle failure");
    } catch (failure) {
      expect(failure).toBeInstanceOf(AdvancedFilterValidationError);
      expect((failure as AdvancedFilterValidationError).code).toBe("CYCLE");
    }
    expect(() =>
      prepareAdvancedFilter({ kind: "and", children: Array(1) }, columns),
    ).toThrow();
    expect(() =>
      prepareAdvancedFilter(
        condition("region", { op: "in", value: Array(2) }),
        columns,
      ),
    ).toThrow();
    const getter = vi.fn(() => "condition"),
      input = Object.defineProperty({}, "kind", { get: getter });
    expect(() => prepareAdvancedFilter(input, columns)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const accessorArray = Object.defineProperty([], "0", { get: getter });
    expect(() =>
      prepareAdvancedFilter({ kind: "and", children: accessorArray }, columns),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it("enforces node, depth and membership budgets with useful paths", () => {
    let expression = condition("note", { op: "blank" });
    for (let index = 0; index < 32; index++) expression = not(expression);
    const model = grid(),
      before = model.getState();
    expect(() => model.setAdvancedFilter(expression)).toThrow(/budget/);
    expect(model.getState()).toBe(before);
    expect(() =>
      prepareAdvancedFilter(
        and(
          ...Array.from({ length: 512 }, () =>
            condition("note", { op: "blank" }),
          ),
        ),
        columns,
      ),
    ).toThrow(/budget/);
    expect(() =>
      prepareAdvancedFilter(
        condition("region", {
          op: "in",
          value: Array.from({ length: 10001 }, () => "EU"),
        }),
        columns,
      ),
    ).toThrow(/budget/);
    expect(() =>
      prepareAdvancedFilter(
        condition("name", { op: "equals", value: "x" }),
        columns,
        { maxNodes: 0 },
      ),
    ).toThrow(RangeError);
    try {
      prepareAdvancedFilter(
        and(condition("amount", { op: "gt", value: "bad" })),
        columns,
      );
    } catch (failure) {
      expect((failure as AdvancedFilterValidationError).path).toBe(
        "advancedFilter.children[0].filter.value",
      );
    }
  });
  it("accepts trees and membership lists exactly at the configured limits", () => {
    let expression = condition("note", { op: "blank" });
    for (let index = 0; index < 31; index++) expression = not(expression);
    expect(prepareAdvancedFilter(expression, columns)).toBeTruthy();
    expect(
      prepareAdvancedFilter(
        and(
          ...Array.from({ length: 511 }, () =>
            condition("note", { op: "blank" }),
          ),
        ),
        columns,
      ),
    ).toBeTruthy();
    expect(
      prepareAdvancedFilter(
        condition("region", {
          op: "in",
          value: Array.from({ length: 10000 }, () => "EU"),
        }),
        columns,
      ),
    ).toBeTruthy();
  });
});

describe("external predicates", () => {
  it("does not persist application callbacks and supports replacement/removal", () => {
    const model = grid({ externalFilter: (row) => row.amount > 20 });
    expect(ids(model)).toEqual(["c", "d"]);
    expect(JSON.stringify(model.getState())).not.toContain("externalFilter");
    model.setExternalFilter((row) => row.region === "EU");
    expect(ids(model)).toEqual(["a", "c"]);
    model.setExternalFilter();
    expect(ids(model)).toEqual(["a", "b", "c", "d"]);
    const restored = grid({
      initialState: JSON.parse(JSON.stringify(model.getState())),
    });
    expect(ids(restored)).toEqual(["a", "b", "c", "d"]);
  });
  it("surfaces callback exceptions and atomically preserves prior predicate/state/cache on setter failure", () => {
    const expected = new Error("application predicate failed"),
      model = grid({ externalFilter: (row) => row.enabled });
    expect(ids(model)).toEqual(["a", "c", "d"]);
    const before = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    expect(() =>
      model.setExternalFilter(() => {
        throw expected;
      }),
    ).toThrow(expected);
    expect(model.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(ids(model)).toEqual(["a", "c", "d"]);
    const broken = grid({
      externalFilter: () => {
        throw expected;
      },
    });
    expect(() => broken.getFilteredRows()).toThrow(expected);
  });
  it("requires explicit refresh for changed closure data and resets pagination", () => {
    let minimum = 10;
    const predicate = (row: Row) => row.amount >= minimum,
      model = grid({
        externalFilter: predicate,
        initialState: { pageSize: 1 },
      });
    expect(ids(model)).toHaveLength(4);
    model.setState({ page: 2 });
    minimum = 40;
    model.setExternalFilter(predicate);
    expect(model.getState().page).toBe(0);
    expect(ids(model)).toEqual(["d"]);
  });
  it("rejects nonfunction callbacks", () => {
    expect(() =>
      grid({ externalFilter: true as unknown as (row: Row) => boolean }),
    ).toThrow(TypeError);
    const model = grid();
    expect(() =>
      model.setExternalFilter(true as unknown as (row: Row) => boolean),
    ).toThrow(TypeError);
  });
});
