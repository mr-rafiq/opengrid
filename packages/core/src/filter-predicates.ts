import type { Column, Filter } from "./types.js";
import {
  assertColumnFilterOperator,
  prepareCompoundFilter,
} from "./column-filter-model.js";

export const isFilterBlank = (value: unknown) =>
  value === null || value === undefined || value === "";
export const filterText = (value: unknown) =>
  value == null ? "" : String(value).toLocaleLowerCase();

/** Kept deliberately identical to the current core comparable semantics. */
export function comparableFilterValue(
  value: unknown,
  type?: Column<unknown>["type"],
): unknown {
  if (isFilterBlank(value)) return null;
  if (type === "bigint") {
    try {
      return BigInt(String(value));
    } catch {
      return null;
    }
  }
  if (type === "number") {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  if (type === "date") {
    const result =
      value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isFinite(result) ? result : null;
  }
  if (type === "boolean")
    return value === true || value === "true" || value === 1;
  return typeof value === "string" ? filterText(value) : value;
}

/** Public legacy behavior remains live: callers may mutate their arrays or Dates. */
export function matchesFilter<T>(
  value: unknown,
  filter: Filter,
  column?: Column<T>,
): boolean {
  assertColumnFilterOperator(filter);
  if (filter.op === "and" || filter.op === "or") {
    const group = prepareCompoundFilter(filter);
    return group.op === "and"
      ? group.conditions.every((condition) =>
          matchesFilter(value, condition, column),
        )
      : group.conditions.some((condition) =>
          matchesFilter(value, condition, column),
        );
  }
  if (filter.op === "blank") return isFilterBlank(value);
  if (filter.op === "notBlank") return !isFilterBlank(value);
  if (filter.op === "contains")
    return filterText(value).includes(filterText(filter.value));
  if (filter.op === "notContains")
    return !filterText(value).includes(filterText(filter.value));
  if (filter.op === "startsWith")
    return filterText(value).startsWith(filterText(filter.value));
  if (filter.op === "endsWith")
    return filterText(value).endsWith(filterText(filter.value));
  const left = comparableFilterValue(value, column?.type),
    right = comparableFilterValue(filter.value, column?.type);
  if (filter.op === "in")
    return (
      Array.isArray(filter.value) &&
      filter.value.some((item) =>
        Object.is(left, comparableFilterValue(item, column?.type)),
      )
    );
  if (filter.op === "equals") return Object.is(left, right);
  if (filter.op === "notEqual") return !Object.is(left, right);
  if (left == null || right == null) return false;
  const a = left as string | number | bigint,
    b = right as string | number | bigint;
  if (filter.op === "gt") return a > b;
  if (filter.op === "gte") return a >= b;
  if (filter.op === "lt") return a < b;
  if (filter.op === "lte") return a <= b;
  const end = comparableFilterValue(filter.to, column?.type) as
    string | number | bigint | null;
  return filter.op === "between" && end != null && a >= b && a <= end;
}

const negativeZero = Symbol("OpenGrid negative-zero membership key");
const membershipKey = (value: unknown): unknown =>
  typeof value === "number" && Object.is(value, -0) ? negativeZero : value;
export type FilterPredicate = (value: unknown) => boolean;

/**
 * Calculation-owned snapshot, never a global cache. In particular, date operands are
 * normalized now; later mutations cannot change the selected membership of this run.
 * Object/array operands on untyped columns retain reference identity, as Object.is does.
 */
export function compileFilterPredicate<T>(
  filter: Filter,
  column?: Column<T>,
): FilterPredicate {
  assertColumnFilterOperator(filter);
  if (filter.op === "and" || filter.op === "or") {
    const group = prepareCompoundFilter(filter),
      children = group.conditions.map((condition) =>
        compileFilterPredicate(condition, column),
      );
    return group.op === "and"
      ? (value) => children.every((child) => child(value))
      : (value) => children.some((child) => child(value));
  }
  const op = filter.op,
    type = column?.type;
  if (op === "blank") return isFilterBlank;
  if (op === "notBlank") return (value) => !isFilterBlank(value);
  if (
    op === "contains" ||
    op === "notContains" ||
    op === "startsWith" ||
    op === "endsWith"
  ) {
    const needle = filterText(filter.value);
    return (value) =>
      op === "contains"
        ? filterText(value).includes(needle)
        : op === "notContains"
          ? !filterText(value).includes(needle)
          : op === "startsWith"
            ? filterText(value).startsWith(needle)
            : filterText(value).endsWith(needle);
  }
  if (op === "in") {
    if (!Array.isArray(filter.value)) return () => false;
    const selected = new Set<unknown>();
    // forEach, like some, skips holes and observes present inherited array entries.
    Array.prototype.forEach.call(filter.value, (item: unknown) =>
      selected.add(membershipKey(comparableFilterValue(item, type))),
    );
    return (value) =>
      selected.has(membershipKey(comparableFilterValue(value, type)));
  }
  const right = comparableFilterValue(filter.value, type);
  const end =
    op === "between"
      ? (comparableFilterValue(filter.to, type) as
          string | number | bigint | null)
      : null;
  return (value) => {
    const left = comparableFilterValue(value, type);
    if (op === "equals") return Object.is(left, right);
    if (op === "notEqual") return !Object.is(left, right);
    if (left == null || right == null) return false;
    const a = left as string | number | bigint,
      b = right as string | number | bigint;
    if (op === "gt") return a > b;
    if (op === "gte") return a >= b;
    if (op === "lt") return a < b;
    if (op === "lte") return a <= b;
    return op === "between" && end != null && a >= b && a <= end;
  };
}
