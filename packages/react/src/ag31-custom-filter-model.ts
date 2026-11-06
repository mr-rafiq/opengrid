export type Ag31CustomFilterValue =
  | string
  | number
  | boolean
  | null
  | Ag31CustomFilterValue[]
  | { [key: string]: Ag31CustomFilterValue };
export interface Ag31CustomFilterBudget {
  nodes: number;
  characters: number;
}
/** Custom filters own their JSON model shape. Built-in filter models retain
 * their separate schema validation; no filterType is inferred here. */
export function normalizeAg31CustomFilterModel(
  input: unknown,
  budget: Ag31CustomFilterBudget = { nodes: 50_000, characters: 4_000_000 },
): Ag31CustomFilterValue {
  const ancestors = new Set<object>();
  function clone(value: unknown, depth: number): Ag31CustomFilterValue {
    if (--budget.nodes < 0 || depth > 32 || budget.characters < 0)
      throw new RangeError("Source custom filter model budget exceeded");
    if (value === null) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      budget.characters -= value.length;
      if (budget.characters < 0)
        throw new RangeError("Source custom filter text budget exceeded");
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object" || ancestors.has(value))
      throw new TypeError(
        "Source custom filter models require acyclic JSON values",
      );
    const array = Array.isArray(value);
    if (
      Object.getPrototypeOf(value) !==
        (array ? Array.prototype : Object.prototype) &&
      (array || Object.getPrototypeOf(value) !== null)
    )
      throw new TypeError(
        "Source custom filter models require plain JSON values",
      );
    ancestors.add(value);
    try {
      const result:
        Ag31CustomFilterValue[] | { [key: string]: Ag31CustomFilterValue } =
        array ? [] : {};
      const keys = Reflect.ownKeys(value);
      if (array && keys.length !== value.length + 1)
        throw new TypeError(
          "Source custom filter arrays must be dense without extra properties",
        );
      for (const key of keys) {
        if (array && key === "length") continue;
        if (typeof key !== "string")
          throw new TypeError(
            "Source custom filter symbol keys are unsupported",
          );
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!("value" in descriptor) || !descriptor.enumerable)
          throw new TypeError(
            "Source custom filter accessors and hidden properties are unsupported",
          );
        budget.characters -= key.length;
        if (budget.characters < 0)
          throw new RangeError("Source custom filter text budget exceeded");
        if (
          array &&
          (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
        )
          throw new TypeError(
            "Source custom filter array keys are unsupported",
          );
        Object.defineProperty(result, key, {
          value: clone(descriptor.value, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    } finally {
      ancestors.delete(value);
    }
  }
  return clone(input == null ? null : input, 0);
}
