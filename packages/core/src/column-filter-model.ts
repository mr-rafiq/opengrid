import type {
  CompoundFilter,
  Filter,
  ScalarFilter,
  MultiColumnFilter,
  ColumnFilterSlot,
} from "./types.js";

export const COLUMN_FILTER_LIMITS = Object.freeze({
  maxConditions: 16,
  maxMembershipValues: 10000,
  maxTextLength: 256000,
});
export const MULTI_FILTER_LIMITS = Object.freeze({
  maxFilters: 4,
  maxConditions: 64,
  maxMembershipValues: 10000,
  maxTextLength: 256000,
  maxIdLength: 128,
});
export type ColumnFilterErrorCode = "SHAPE" | "OPERATOR" | "VALUE" | "LIMIT";
export class ColumnFilterValidationError extends TypeError {
  readonly name = "ColumnFilterValidationError";
  constructor(
    readonly code: ColumnFilterErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}
const fail = (
  code: ColumnFilterErrorCode,
  path: string,
  message: string,
): never => {
  throw new ColumnFilterValidationError(code, path, message);
};
const operators = new Set<ScalarFilter["op"]>([
  "contains",
  "notContains",
  "equals",
  "notEqual",
  "startsWith",
  "endsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "between",
  "blank",
  "notBlank",
]);
function record(
  value: unknown,
  allowed: readonly string[],
  path: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fail("SHAPE", path, "Expected a plain filter record");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return fail("SHAPE", path, "Expected a plain filter record");
  const keys = Reflect.ownKeys(value);
  if (
    keys.length > allowed.length ||
    keys.some((key) => typeof key !== "string" || !allowed.includes(key))
  )
    return fail("SHAPE", path, "Unexpected filter properties");
  const entries: [string, unknown][] = [];
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      return fail(
        "SHAPE",
        `${path}.${key}`,
        "Filter accessors are not supported",
      );
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}
function arrayValue(
  value: readonly unknown[],
  index: number,
  path: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  if (!descriptor || !("value" in descriptor))
    return fail(
      "SHAPE",
      `${path}[${index}]`,
      "Sparse arrays and accessors are not supported",
    );
  return descriptor.value;
}
function arrayShape(value: readonly unknown[], path: string): void {
  if (Object.getPrototypeOf(value) !== Array.prototype)
    return fail("SHAPE", path, "Custom array prototypes are not supported");
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    keys.some(
      (key) =>
        key !== "length" &&
        (typeof key !== "string" ||
          !/^(0|[1-9]\d*)$/.test(key) ||
          Number(key) >= value.length),
    )
  )
    return fail(
      "SHAPE",
      path,
      "Filter arrays require only dense indexed entries",
    );
}
/** Internal guard shared by live and compiled matching; never executes operator getters. */
export function assertColumnFilterOperator(filter: Filter): void {
  if (filter === null || typeof filter !== "object")
    return fail("SHAPE", "filter", "Expected a filter record");
  let current: object | null = filter;
  for (let depth = 0; current !== null && depth <= 32; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "op");
    if (descriptor) {
      if (!("value" in descriptor))
        return fail(
          "SHAPE",
          "filter.op",
          "Filter operator accessors are not supported",
        );
      if (
        Object.hasOwn(filter, "conditions") &&
        descriptor.value !== "and" &&
        descriptor.value !== "or"
      )
        return fail(
          "SHAPE",
          "filter.op",
          "Conditions require an AND or OR group",
        );
      if (Object.hasOwn(filter, "filters") && descriptor.value !== "multi")
        return fail(
          "SHAPE",
          "filter.op",
          "Named child filters require a multi filter",
        );
      return;
    }
    current = Object.getPrototypeOf(current);
  }
  if (current !== null)
    return fail("SHAPE", "filter.op", "Filter prototype depth exceeded");
  if (Object.hasOwn(filter, "conditions"))
    return fail("SHAPE", "filter.op", "Conditions require an AND or OR group");
  if (Object.hasOwn(filter, "filters"))
    return fail(
      "SHAPE",
      "filter.op",
      "Named child filters require a multi filter",
    );
}

/** New flat groups own only primitives; callers use ISO strings, never Date objects. */
export function prepareCompoundFilter(value: unknown): CompoundFilter {
  const group = record(value, ["op", "conditions"], "filter");
  if (group.op !== "and" && group.op !== "or")
    return fail("OPERATOR", "filter.op", "Expected AND or OR");
  if (!Array.isArray(group.conditions) || !group.conditions.length)
    return fail(
      "SHAPE",
      "filter.conditions",
      "A group requires at least one scalar condition",
    );
  if (group.conditions.length > COLUMN_FILTER_LIMITS.maxConditions)
    return fail(
      "LIMIT",
      "filter.conditions",
      "Column condition budget exceeded",
    );
  arrayShape(group.conditions, "filter.conditions");
  let membership = 0,
    text = 0;
  function primitive(operand: unknown, path: string): unknown {
    if (
      operand !== null &&
      operand !== undefined &&
      !["string", "number", "boolean", "bigint"].includes(typeof operand)
    )
      return fail(
        "VALUE",
        path,
        "Group operands must be primitives; use ISO strings instead of Dates",
      );
    if (typeof operand === "string") text += operand.length;
    else if (typeof operand === "bigint") text += String(operand).length;
    if (text > COLUMN_FILTER_LIMITS.maxTextLength)
      return fail("LIMIT", path, "Column operand text budget exceeded");
    return operand;
  }
  const conditions: ScalarFilter[] = [];
  for (let index = 0; index < group.conditions.length; index++) {
    const path = `filter.conditions[${index}]`,
      input = record(
        arrayValue(group.conditions, index, "filter.conditions"),
        ["op", "value", "to"],
        path,
      );
    if (
      typeof input.op !== "string" ||
      !operators.has(input.op as ScalarFilter["op"])
    )
      return fail(
        "OPERATOR",
        `${path}.op`,
        "Expected a scalar filter operator; nested groups are unsupported",
      );
    const op = input.op as ScalarFilter["op"];
    if (op === "blank" || op === "notBlank") {
      if (Object.hasOwn(input, "value") || Object.hasOwn(input, "to"))
        return fail("SHAPE", path, "Blank conditions do not accept operands");
      conditions.push(Object.freeze({ op }));
      continue;
    }
    if (!Object.hasOwn(input, "value"))
      return fail("VALUE", `${path}.value`, "An operand is required");
    if (op === "in") {
      if (Object.hasOwn(input, "to") || !Array.isArray(input.value))
        return fail("VALUE", path, "Membership requires one array operand");
      membership += input.value.length;
      if (membership > COLUMN_FILTER_LIMITS.maxMembershipValues)
        return fail(
          "LIMIT",
          `${path}.value`,
          "Column membership operand budget exceeded",
        );
      arrayShape(input.value, `${path}.value`);
      const values: unknown[] = [];
      for (let item = 0; item < input.value.length; item++)
        values.push(
          primitive(
            arrayValue(input.value, item, `${path}.value`),
            `${path}.value[${item}]`,
          ),
        );
      conditions.push(Object.freeze({ op, value: Object.freeze(values) }));
      continue;
    }
    const first = primitive(input.value, `${path}.value`);
    if (op === "between") {
      if (!Object.hasOwn(input, "to"))
        return fail("VALUE", `${path}.to`, "An upper operand is required");
      conditions.push(
        Object.freeze({
          op,
          value: first,
          to: primitive(input.to, `${path}.to`),
        }),
      );
    } else {
      if (Object.hasOwn(input, "to"))
        return fail(
          "SHAPE",
          `${path}.to`,
          "This condition does not accept an upper operand",
        );
      conditions.push(Object.freeze({ op, value: first }));
    }
  }
  return Object.freeze({ op: group.op, conditions: Object.freeze(conditions) });
}

/** Independent named children are ANDed; each child owns a scalar or flat group. */
export function prepareMultiFilter(value: unknown): MultiColumnFilter {
  const input = record(value, ["op", "filters"], "filter");
  if (input.op !== "multi")
    return fail("OPERATOR", "filter.op", "Expected a multi filter");
  if (!Array.isArray(input.filters) || !input.filters.length)
    return fail(
      "SHAPE",
      "filter.filters",
      "A multi filter requires named children",
    );
  if (input.filters.length > MULTI_FILTER_LIMITS.maxFilters)
    return fail(
      "LIMIT",
      "filter.filters",
      "Multi-filter child budget exceeded",
    );
  arrayShape(input.filters, "filter.filters");
  const ids = new Set<string>(),
    filters: ColumnFilterSlot[] = [];
  let conditions = 0,
    membership = 0,
    text = 0;
  const addText = (operand: unknown) => {
    if (typeof operand === "string") text += operand.length;
    else if (typeof operand === "bigint") text += String(operand).length;
  };
  for (let index = 0; index < input.filters.length; index++) {
    const path = `filter.filters[${index}]`,
      child = record(
        arrayValue(input.filters, index, "filter.filters"),
        ["id", "filter"],
        path,
      );
    if (typeof child.id !== "string" || !child.id)
      return fail(
        "SHAPE",
        `${path}.id`,
        "A child requires a nonempty string ID",
      );
    if (child.id.length > MULTI_FILTER_LIMITS.maxIdLength)
      return fail(
        "LIMIT",
        `${path}.id`,
        "Multi-filter ID length budget exceeded",
      );
    if (ids.has(child.id))
      return fail("SHAPE", `${path}.id`, "Child filter IDs must be unique");
    ids.add(child.id);
    if (child.filter === undefined) {
      filters.push(Object.freeze({ id: child.id }));
      continue;
    }
    let prepared: ScalarFilter | CompoundFilter;
    try {
      const leaf = record(
        child.filter,
        ["op", "value", "to", "conditions"],
        `${path}.filter`,
      );
      prepared =
        leaf.op === "and" || leaf.op === "or"
          ? prepareCompoundFilter(child.filter)
          : prepareCompoundFilter({ op: "and", conditions: [child.filter] })
              .conditions[0];
    } catch (error: unknown) {
      if (error instanceof ColumnFilterValidationError)
        return fail(error.code, `${path}.filter`, error.message);
      throw error;
    }
    const leaves =
      prepared.op === "and" || prepared.op === "or"
        ? prepared.conditions
        : [prepared];
    conditions += leaves.length;
    for (const leaf of leaves) {
      if (leaf.op === "in") {
        const values = leaf.value as readonly unknown[];
        membership += values.length;
        values.forEach(addText);
      } else {
        addText(leaf.value);
        addText(leaf.to);
      }
    }
    if (
      conditions > MULTI_FILTER_LIMITS.maxConditions ||
      membership > MULTI_FILTER_LIMITS.maxMembershipValues ||
      text > MULTI_FILTER_LIMITS.maxTextLength
    )
      return fail("LIMIT", path, "Shared multi-filter operand budget exceeded");
    filters.push(Object.freeze({ id: child.id, filter: prepared }));
  }
  return Object.freeze({ op: "multi", filters: Object.freeze(filters) });
}

function isGroupInput(filter: Filter): boolean {
  assertColumnFilterOperator(filter);
  return (
    filter.op === "and" ||
    filter.op === "or" ||
    Object.hasOwn(filter, "conditions")
  );
}
/** Retain historical scalar operand permissiveness, including shared mutable Dates. */
export function prepareColumnFilter(filter: Filter): Filter {
  assertColumnFilterOperator(filter);
  if (filter.op === "multi") return prepareMultiFilter(filter);
  if (isGroupInput(filter)) return prepareCompoundFilter(filter);
  const scalar = filter as ScalarFilter;
  return {
    ...scalar,
    value: Array.isArray(scalar.value) ? [...scalar.value] : scalar.value,
  };
}
/** Prepare before transport cloning, query replacement, cache invalidation or abort. */
export function prepareColumnFilters(
  filters: Record<string, Filter>,
): Record<string, Filter> {
  if (filters === null || typeof filters !== "object" || Array.isArray(filters))
    return fail("SHAPE", "filters", "Expected a filter record");
  return Object.fromEntries(
    Object.keys(filters).map((id) => {
      const descriptor = Object.getOwnPropertyDescriptor(filters, id)!;
      if (!("value" in descriptor))
        return fail(
          "SHAPE",
          `filters[${JSON.stringify(id)}]`,
          "Filter accessors are not supported",
        );
      const filter = descriptor.value as Filter;
      assertColumnFilterOperator(filter);
      if (filter.op === "multi") return [id, prepareMultiFilter(filter)];
      if (isGroupInput(filter)) return [id, prepareCompoundFilter(filter)];
      // Transport queries historically preserve absent operand properties. Clone legacy
      // leaves without adding value:undefined; structuredClone owns arrays/Dates/objects
      // without executing a caller's custom membership-array iterator.
      const scalar = { ...filter } as ScalarFilter;
      return [id, scalar];
    }),
  );
}
