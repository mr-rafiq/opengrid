import { expect, it, vi } from "vitest";
import { normalizeAg31CustomFilterModel as normalize } from "./ag31-custom-filter-model.js";
it("clones opaque hierarchical models without requiring a built-in filterType or borrowing their arrays", () => {
  const input = {
      values: ["Root", "Child"],
      options: { includeParents: true, level: 2, empty: null },
    },
    result = normalize(input) as typeof input;
  expect(result).toEqual(input);
  expect(result).not.toBe(input);
  expect(result.values).not.toBe(input.values);
  result.values.push("Other");
  expect(input.values).toEqual(["Root", "Child"]);
  for (const value of [false, 0, "", [], null])
    expect(normalize(value)).toEqual(value);
  expect(normalize(undefined)).toBeNull();
});
it("preserves inert own JSON property names without changing prototypes", () => {
  const input = JSON.parse(
      '{"__proto__":{"visible":true},"constructor":"field"}',
    ),
    result = normalize(input);
  expect(result).toEqual(input);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.hasOwn(result as object, "__proto__")).toBe(true);
  expect(({} as any).visible).toBeUndefined();
});
it("does not invoke accessors or accept hidden state, resource/class objects or non-JSON payloads", () => {
  const getter = vi.fn(() => "secret"),
    accessor = Object.defineProperty({}, "value", {
      get: getter,
      enumerable: true,
    });
  expect(() => normalize(accessor)).toThrow(TypeError);
  expect(getter).not.toHaveBeenCalled();
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  const cyclic: any = {};
  cyclic.self = cyclic;
  for (const value of [
    hidden,
    cyclic,
    new Date(),
    new Map(),
    new (class Model {})(),
    NaN,
    Infinity,
    1n,
    () => 1,
    { value: undefined },
    { [Symbol()]: 1 },
  ])
    expect(() => normalize(value)).toThrow(TypeError);
});
it("rejects sparse and extended arrays and enforces shared depth/node/text budgets", () => {
  for (const value of [
    new Array(2),
    Object.assign([1], { extra: 2 }),
    Object.defineProperty([1], "0", { get: () => 1 }),
  ])
    expect(() => normalize(value)).toThrow(TypeError);
  let nested: any = null;
  for (let n = 0; n < 34; n++) nested = { nested };
  expect(() => normalize(nested)).toThrow(RangeError);
  const budget = { nodes: 4, characters: 20 };
  expect(() => normalize(false, { nodes: 4, characters: -1 })).toThrow(
    RangeError,
  );
  expect(normalize([1, 2], budget)).toEqual([1, 2]);
  expect(() => normalize([3], budget)).toThrow(RangeError);
  expect(() =>
    normalize({ value: "too long" }, { nodes: 10, characters: 5 }),
  ).toThrow(RangeError);
});
