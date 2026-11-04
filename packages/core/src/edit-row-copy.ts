/** Internal draft ownership; data accessors and native opaque objects are not editable snapshots. */
export function cloneEditRow<T>(row: T): T {
  const seen = new Map<object, unknown>();
  let remaining = 100000;
  function copy(value: unknown, depth: number): unknown {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (depth > 64 || --remaining < 0)
      throw new RangeError("Editable row exceeds the draft copy budget");
    const keys = Reflect.ownKeys(value);
    if (keys.length > remaining)
      throw new RangeError("Editable row exceeds the draft copy budget");
    for (const key of keys)
      if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
        throw new TypeError("Editable row data accessors are not supported");
    // Object#toString consults Symbol.toStringTag; inspect its descriptor before using it.
    let prototype: object | null = value;
    for (let levels = 0; prototype; levels++) {
      if (levels > 64)
        throw new RangeError(
          "Editable row prototype chain exceeds the draft copy budget",
        );
      const tag = Object.getOwnPropertyDescriptor(
        prototype,
        Symbol.toStringTag,
      );
      if (tag && !("value" in tag))
        throw new TypeError("Editable row data accessors are not supported");
      if (tag) break;
      prototype = Object.getPrototypeOf(prototype);
    }
    function copyProperties<R extends object>(result: R): R {
      for (const key of keys) {
        if (Array.isArray(value) && key === "length") continue;
        if (--remaining < 0)
          throw new RangeError("Editable row exceeds the draft copy budget");
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!("value" in descriptor))
          throw new TypeError("Editable row data accessors are not supported");
        Object.defineProperty(result, key, {
          value: copy(descriptor.value, depth + 1),
          enumerable: descriptor.enumerable,
          configurable: true,
          writable: true,
        });
      }
      if (Array.isArray(value) && Array.isArray(result))
        result.length = value.length;
      return result;
    }
    if (value instanceof Date) {
      const result = new Date(Date.prototype.getTime.call(value));
      seen.set(value, result);
      return copyProperties(result);
    }
    if (value instanceof Map) {
      const result = new Map();
      seen.set(value, result);
      for (const [key, item] of Map.prototype.entries.call(value)) {
        if (--remaining < 0)
          throw new RangeError("Editable row exceeds the draft copy budget");
        result.set(copy(key, depth + 1), copy(item, depth + 1));
      }
      return copyProperties(result);
    }
    if (value instanceof Set) {
      const result = new Set();
      seen.set(value, result);
      for (const item of Set.prototype.values.call(value)) {
        if (--remaining < 0)
          throw new RangeError("Editable row exceeds the draft copy budget");
        result.add(copy(item, depth + 1));
      }
      return copyProperties(result);
    }
    if (
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) !== "[object Object]"
    )
      throw new TypeError("Editable row contains an unsupported opaque object");
    const result = Array.isArray(value)
      ? []
      : Object.create(Object.getPrototypeOf(value));
    seen.set(value, result);
    return copyProperties(result);
  }
  return copy(row, 0) as T;
}
