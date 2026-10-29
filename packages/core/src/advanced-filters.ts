import type { Column, ScalarFilter, FilterExpression } from "./types.js";

export interface AdvancedFilterLimits {
  maxDepth?: number;
  maxNodes?: number;
  maxSetValues?: number;
}
export type AdvancedFilterErrorCode =
  "SHAPE" | "COLUMN" | "OPERATOR" | "VALUE" | "LIMIT" | "CYCLE";
export class AdvancedFilterValidationError extends TypeError {
  readonly name = "AdvancedFilterValidationError";
  constructor(
    readonly code: AdvancedFilterErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}
const fail = (
  code: AdvancedFilterErrorCode,
  path: string,
  message: string,
): never => {
  throw new AdvancedFilterValidationError(code, path, message);
};

function record(
  value: unknown,
  path: string,
  allowed: string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fail("SHAPE", path, "Expected a plain object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return fail("SHAPE", path, "Expected a plain object");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.getOwnPropertySymbols(value).length ||
    Object.values(descriptors).some((descriptor) => !("value" in descriptor))
  )
    return fail(
      "SHAPE",
      path,
      "Accessors and symbol properties are not supported",
    );
  const keys = Object.keys(descriptors);
  if (keys.some((key) => !allowed.includes(key)))
    return fail(
      "SHAPE",
      path,
      `Unexpected property: ${keys.find((key) => !allowed.includes(key))}`,
    );
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

const textOperators = new Set([
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
]);
const comparisonOperators = new Set([
  "equals",
  "notEqual",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "in",
]);
function arrayValues(value: unknown, path: string, limit: number): unknown[] {
  if (!Array.isArray(value)) return fail("SHAPE", path, "Expected an array");
  if (value.length > limit)
    return fail("LIMIT", path, "Array value budget exceeded");
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor))
      return fail(
        "SHAPE",
        `${path}[${index}]`,
        "Sparse arrays and accessors are not supported",
      );
    result.push(descriptor.value);
  }
  return result;
}

/** Validate, detach and freeze a serializable boolean filter tree before application. */
export function prepareAdvancedFilter<T>(
  expression: unknown,
  columns: readonly Column<T>[],
  limits: AdvancedFilterLimits = {},
): FilterExpression | null {
  const budget = {
    maxDepth: 32,
    maxNodes: 512,
    maxSetValues: 10000,
    ...limits,
  };
  for (const value of Object.values(budget))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new RangeError(
        "Advanced filter budgets must be positive safe integers",
      );
  if (expression === null) return null;
  const byColumn = new Map(columns.map((column) => [column.id, column]));
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  function scalar(
    value: unknown,
    column: Column<T>,
    path: string,
    ordered: boolean,
  ): unknown {
    if (value === null || value === "") {
      if (ordered)
        return fail(
          "VALUE",
          path,
          "Ordered comparisons require nonblank operands",
        );
      return value;
    }
    if (value === undefined)
      return fail("VALUE", path, "An operand is required");
    if (column.type === "bigint") {
      if (typeof value === "number" && !Number.isSafeInteger(value))
        return fail(
          "VALUE",
          path,
          "BigInt number operands must be safe integers; use a decimal string for larger values",
        );
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "bigint"
      )
        return fail("VALUE", path, "Expected an integer operand");
      if (typeof value === "string" && !value.trim())
        return fail("VALUE", path, "Expected an integer operand");
      try {
        const converted = BigInt(value);
        return typeof value === "bigint" ? converted.toString() : value;
      } catch {
        return fail("VALUE", path, "Expected an integer operand");
      }
    }
    if (column.type === "date") {
      if (!(value instanceof Date) && typeof value !== "string")
        return fail("VALUE", path, "Expected a date string");
      const time =
        value instanceof Date
          ? Date.prototype.getTime.call(value)
          : Date.parse(value);
      if (!Number.isFinite(time))
        return fail("VALUE", path, "Expected a valid date");
      return value instanceof Date ? new Date(time).toISOString() : value;
    }
    if (column.type === "number") {
      if (
        (typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && !value.trim()) ||
        !Number.isFinite(Number(value))
      )
        return fail("VALUE", path, "Expected a finite numeric operand");
      return value;
    }
    if (column.type === "boolean") {
      if (![true, false, "true", "false", 1, 0].includes(value as boolean))
        return fail("VALUE", path, "Expected a boolean operand");
      return value;
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    )
      return fail("VALUE", path, "Expected a JSON scalar operand");
    if (typeof value === "number" && !Number.isFinite(value))
      return fail("VALUE", path, "Expected a finite number");
    if (ordered && typeof value === "boolean")
      return fail("VALUE", path, "Ordered operands must be strings or numbers");
    return value;
  }
  function filter(
    value: unknown,
    column: Column<T>,
    path: string,
  ): ScalarFilter {
    const input = record(value, path, ["op", "value", "to"]),
      op = input.op;
    if (
      typeof op !== "string" ||
      (!textOperators.has(op) &&
        !comparisonOperators.has(op) &&
        op !== "blank" &&
        op !== "notBlank")
    )
      return fail("OPERATOR", `${path}.op`, "Unknown filter operator");
    if (op === "blank" || op === "notBlank") {
      if (input.value !== undefined || input.to !== undefined)
        return fail("VALUE", path, "Blank operators do not accept operands");
      return Object.freeze({ op });
    }
    if (textOperators.has(op)) {
      if (typeof input.value !== "string")
        return fail(
          "VALUE",
          `${path}.value`,
          "Text operators require a string operand",
        );
      if (input.to !== undefined)
        return fail(
          "VALUE",
          `${path}.to`,
          "This operator does not accept an upper operand",
        );
      return Object.freeze({
        op: op as ScalarFilter["op"],
        value: input.value,
      });
    }
    if (op === "in") {
      if (!Array.isArray(input.value))
        return fail("VALUE", `${path}.value`, "Membership requires an array");
      const inputValues = arrayValues(
        input.value,
        `${path}.value`,
        budget.maxSetValues,
      );
      if (input.to !== undefined)
        return fail(
          "VALUE",
          `${path}.to`,
          "Membership does not accept an upper operand",
        );
      const values = inputValues.map((item, index) =>
        scalar(item, column, `${path}.value[${index}]`, false),
      );
      return Object.freeze({ op: "in", value: Object.freeze(values) });
    }
    const ordered = !["equals", "notEqual"].includes(op);
    const first = scalar(input.value, column, `${path}.value`, ordered);
    if (op === "between")
      return Object.freeze({
        op,
        value: first,
        to: scalar(input.to, column, `${path}.to`, true),
      });
    if (input.to !== undefined)
      return fail(
        "VALUE",
        `${path}.to`,
        "This operator does not accept an upper operand",
      );
    return Object.freeze({ op: op as ScalarFilter["op"], value: first });
  }
  function visit(
    value: unknown,
    depth: number,
    path: string,
  ): FilterExpression {
    if (++nodes > budget.maxNodes || depth > budget.maxDepth)
      return fail("LIMIT", path, "Advanced filter tree budget exceeded");
    if (value && typeof value === "object") {
      if (ancestors.has(value))
        return fail("CYCLE", path, "Advanced filter tree contains a cycle");
      ancestors.add(value);
    }
    try {
      const input = record(value, path, [
        "kind",
        "columnId",
        "filter",
        "children",
        "child",
      ]);
      if (input.kind === "condition") {
        if ("children" in input || "child" in input)
          return fail("SHAPE", path, "Conditions contain a column and filter");
        if (typeof input.columnId !== "string" || !byColumn.has(input.columnId))
          return fail("COLUMN", `${path}.columnId`, "Unknown filter column");
        const column = byColumn.get(input.columnId)!;
        if (column.filterable === false)
          return fail(
            "COLUMN",
            `${path}.columnId`,
            "Filtering is disabled for this column",
          );
        return Object.freeze({
          kind: "condition",
          columnId: input.columnId,
          filter: filter(input.filter, column, `${path}.filter`),
        });
      }
      if (input.kind === "and" || input.kind === "or") {
        if (
          "columnId" in input ||
          "filter" in input ||
          "child" in input ||
          !Array.isArray(input.children) ||
          !input.children.length
        )
          return fail(
            "SHAPE",
            path,
            "Logical groups require a nonempty children array",
          );
        const children = arrayValues(
          input.children,
          `${path}.children`,
          budget.maxNodes - nodes,
        ).map((child, index) =>
          visit(child, depth + 1, `${path}.children[${index}]`),
        );
        return Object.freeze({
          kind: input.kind,
          children: Object.freeze(children) as unknown as FilterExpression[],
        });
      }
      if (input.kind === "not") {
        if ("columnId" in input || "filter" in input || "children" in input)
          return fail("SHAPE", path, "NOT requires one child");
        return Object.freeze({
          kind: "not",
          child: visit(input.child, depth + 1, `${path}.child`),
        });
      }
      return fail("SHAPE", `${path}.kind`, "Unknown advanced filter node kind");
    } finally {
      if (value && typeof value === "object") ancestors.delete(value);
    }
  }
  return visit(expression, 1, "advancedFilter");
}

/** Evaluate a prepared tree using the grid's existing typed condition matcher. */
export function evaluateFilterExpression(
  expression: FilterExpression | null | undefined,
  matchCondition: (columnId: string, filter: ScalarFilter) => boolean,
): boolean {
  if (!expression) return true;
  if (expression.kind === "condition")
    return matchCondition(expression.columnId, expression.filter);
  if (expression.kind === "and")
    return expression.children.every((child) =>
      evaluateFilterExpression(child, matchCondition),
    );
  if (expression.kind === "or")
    return expression.children.some((child) =>
      evaluateFilterExpression(child, matchCondition),
    );
  if (expression.kind === "not")
    return !evaluateFilterExpression(expression.child, matchCondition);
  return fail(
    "SHAPE",
    "advancedFilter.kind",
    "Unknown advanced filter node kind",
  );
}
