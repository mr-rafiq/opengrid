import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import {
  compileAg31ColumnFilter,
  normalizeAg31ColumnFilterModel,
} from "./ag31-filter-models.js";
type Datum = { id: string; value: unknown };
function node(value: unknown) {
  const owner = createAg31ClientController({
    rows: [{ id: "a", value }],
    getRowId: (r) => r.id,
    definitions: [{ field: "value" }],
  });
  return owner.api.getRowNode("a")!;
}
it("owns normalized operands and compiles a detached model snapshot", () => {
  const input = {
    filterType: "number" as const,
    type: "greaterThan",
    filter: 4,
  };
  const normalized = normalizeAg31ColumnFilterModel(input);
  const matches = compileAg31ColumnFilter<Datum>(normalized, {
    read: (n) => n.data!.value,
    key: (v) => v,
    params: {},
  });
  input.filter = 100;
  if ("filter" in normalized) normalized.filter = 200;
  expect(matches(node(5))).toBe(true);
  expect(matches(node(3))).toBe(false);
});
it("normalizes both documented compound representations without borrowed arrays", () => {
  const a = { filterType: "number", type: "greaterThan", filter: 1 },
    b = { filterType: "number", type: "lessThan", filter: 4 };
  const legacy = normalizeAg31ColumnFilterModel({
    filterType: "number",
    operator: "AND",
    condition1: a,
    condition2: b,
  });
  expect(legacy).toEqual({
    filterType: "number",
    operator: "AND",
    conditions: [a, b],
    condition1: a,
    condition2: b,
  });
  const array = normalizeAg31ColumnFilterModel({
    filterType: "number",
    operator: "AND",
    conditions: [a, b],
  });
  expect(array).toEqual(legacy);
  expect("conditions" in array && array.conditions[0]).not.toBe(a);
});
it.each([
  { filterType: "date", type: "equals", filter: "2026-01-01" },
  { filterType: "number", type: "unsupported", filter: 1 },
  { filterType: "number", type: "equals", filter: NaN },
  { filterType: "number", type: "inRange", filter: 1 },
  { filterType: "text", type: "equals", filter: 1 },
  { filterType: "text", type: "contains", filter: "x", ignored: true },
  { filterType: "set", values: [1] },
  { filterType: "set", values: new Array(1) },
  { filterType: "set", values: new Array(10001).fill("x") },
  {
    filterType: "text",
    operator: "OR",
    conditions: [
      { filterType: "number", type: "equals", filter: 1 },
      { filterType: "text", type: "equals", filter: "x" },
    ],
  },
  { filterType: "text", operator: "AND", conditions: [] },
  {
    filterType: "number",
    operator: "AND",
    conditions: [
      { filterType: "number", type: "blank" },
      { filterType: "number", type: "notBlank" },
    ],
    condition1: { filterType: "number", type: "blank" },
  },
])("rejects unsupported or ambiguous source model %#", (model) =>
  expect(() => normalizeAg31ColumnFilterModel(model)).toThrow(),
);
it("never executes JSON operand accessors", () => {
  const getter = vi.fn(() => "text");
  expect(() =>
    normalizeAg31ColumnFilterModel(
      Object.defineProperty({}, "filterType", {
        get: getter,
        enumerable: true,
      }),
    ),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
  const values = ["x"];
  Object.defineProperty(values, 0, { get: getter });
  expect(() =>
    normalizeAg31ColumnFilterModel({ filterType: "set", values }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it("retains exact set keys, array alternatives and null-key clearing", () => {
  const matches = compileAg31ColumnFilter<Datum>(
    normalizeAg31ColumnFilterModel({ filterType: "set", values: ["01", null] }),
    { read: (n) => n.data!.value, key: (v) => v, params: {} },
  );
  expect(matches(node("01"))).toBe(true);
  expect(matches(node("1"))).toBe(false);
  expect(matches(node(null))).toBe(true);
  expect(matches(node([]))).toBe(true);
  expect(matches(node(["other", "01"]))).toBe(true);
});
it("uses explicit key creators without changing class instances", () => {
  class Choice {
    constructor(public key: string) {}
  }
  const choice = new Choice("alpha"),
    key = vi.fn((v: unknown) => (v as Choice).key);
  const matches = compileAg31ColumnFilter<Datum>(
    normalizeAg31ColumnFilterModel({ filterType: "set", values: ["ALPHA"] }),
    { read: (n) => n.data!.value, key, params: {} },
  );
  const source = node(choice);
  expect(matches(source)).toBe(true);
  expect(source.data!.value).toBe(choice);
  expect(key.mock.calls[0][0]).toBe(choice);
});
it("rejects unimplemented custom text matching before reading source rows", () => {
  const read = vi.fn();
  expect(() =>
    compileAg31ColumnFilter<Datum>(
      { filterType: "text", type: "contains", filter: "x" },
      { read, key: (v) => v, params: { textFormatter: () => "x" } },
    ),
  ).toThrow(/separate source adapter/);
  expect(read).not.toHaveBeenCalled();
});
