import type { Ag31RowNode } from "./ag31-row-nodes.js";

export interface Ag31SimpleFilterModel {
  filterType: "text" | "number";
  type: string;
  filter?: string | number | null;
  filterTo?: number | null;
}
export interface Ag31CombinedFilterModel {
  filterType: "text" | "number";
  operator: "AND" | "OR";
  conditions: readonly Ag31SimpleFilterModel[];
  condition1?: Ag31SimpleFilterModel;
  condition2?: Ag31SimpleFilterModel;
}
export interface Ag31SetFilterModel {
  filterType: "set";
  values: readonly (string | null)[];
}
export type Ag31ColumnFilterModel =
  Ag31SimpleFilterModel | Ag31CombinedFilterModel | Ag31SetFilterModel;
export type Ag31FilterModel = Record<string, Ag31ColumnFilterModel>;
export interface Ag31FilterColumn<T> {
  read(node: Ag31RowNode<T>): unknown;
  key(value: unknown, node: Ag31RowNode<T>): unknown;
  params: Readonly<Record<string, unknown>>;
}
const textTypes = new Set([
  "contains",
  "notContains",
  "equals",
  "notEqual",
  "startsWith",
  "endsWith",
  "blank",
  "notBlank",
]);
const numberTypes = new Set([
  "equals",
  "notEqual",
  "lessThan",
  "lessThanOrEqual",
  "greaterThan",
  "greaterThanOrEqual",
  "inRange",
  "blank",
  "notBlank",
]);
function record(value: unknown, allowed: readonly string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError("Source filters require plain records");
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key))
      throw new TypeError("Unsupported source filter property");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError("Source filter accessors are unsupported");
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
    });
  }
  return result;
}
function dense(value: unknown, limit: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > limit ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw new TypeError("Source filter arrays must be bounded and dense");
  return Array.from({ length: value.length }, (_, i) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Source filter array accessors are unsupported");
    return descriptor.value;
  });
}
function simple(
  value: unknown,
  expected?: "text" | "number",
): Ag31SimpleFilterModel {
  const model = record(value, ["filterType", "type", "filter", "filterTo"]),
    type = model.filterType;
  if ((type !== "text" && type !== "number") || (expected && type !== expected))
    throw new TypeError(
      "Source conditions require a consistent text or number type",
    );
  if (
    typeof model.type !== "string" ||
    !(type === "text" ? textTypes : numberTypes).has(model.type)
  )
    throw new TypeError("Unsupported source filter operator");
  const result: Ag31SimpleFilterModel = { filterType: type, type: model.type };
  if (model.type === "blank" || model.type === "notBlank") return result;
  if (type === "text") {
    if (typeof model.filter !== "string" || model.filter.length > 256000)
      throw new TypeError("Source text filters require bounded text");
    result.filter = model.filter;
  } else {
    if (typeof model.filter !== "number" || !Number.isFinite(model.filter))
      throw new TypeError("Source number filters require finite operands");
    result.filter = model.filter;
    if (model.type === "inRange") {
      if (
        typeof model.filterTo !== "number" ||
        !Number.isFinite(model.filterTo)
      )
        throw new TypeError("Source numeric ranges require a finite end");
      result.filterTo = model.filterTo;
    }
  }
  return result;
}
export function normalizeAg31ColumnFilterModel(
  value: unknown,
): Ag31ColumnFilterModel {
  const model = record(value, [
    "filterType",
    "type",
    "filter",
    "filterTo",
    "operator",
    "conditions",
    "condition1",
    "condition2",
    "values",
  ]);
  if (model.filterType === "set") {
    if (Object.keys(model).some((k) => k !== "filterType" && k !== "values"))
      throw new TypeError("Set filters accept only a values array");
    const values = dense(model.values, 10000).map((v) => {
      if (v !== null && (typeof v !== "string" || v.length > 4096))
        throw new TypeError("Source set keys must be bounded strings or null");
      return v as string | null;
    });
    return { filterType: "set", values: [...new Set(values)] };
  }
  if (model.operator !== undefined) {
    if (
      (model.operator !== "AND" && model.operator !== "OR") ||
      (model.filterType !== "text" && model.filterType !== "number")
    )
      throw new TypeError("Source combined filters require AND or OR");
    if (
      Object.keys(model).some(
        (k) =>
          ![
            "filterType",
            "operator",
            "conditions",
            "condition1",
            "condition2",
          ].includes(k),
      )
    )
      throw new TypeError("Unexpected combined filter property");
    const children =
      model.conditions !== undefined
        ? dense(model.conditions, 16)
        : [model.condition1, model.condition2];
    if (children.length < 2)
      throw new TypeError(
        "Source combined filters require at least two conditions",
      );
    const conditions = children.map((child) =>
      simple(child, model.filterType as "text" | "number"),
    );
    if (
      model.conditions !== undefined &&
      (model.condition1 !== undefined || model.condition2 !== undefined)
    ) {
      if (
        conditions.length !== 2 ||
        JSON.stringify(simple(model.condition1, model.filterType)) !==
          JSON.stringify(conditions[0]) ||
        JSON.stringify(simple(model.condition2, model.filterType)) !==
          JSON.stringify(conditions[1])
      )
        throw new TypeError(
          "Source legacy condition fields must match their condition array",
        );
    }
    return {
      filterType: model.filterType,
      operator: model.operator,
      conditions,
      ...(conditions.length === 2
        ? { condition1: conditions[0], condition2: conditions[1] }
        : {}),
    };
  }
  return simple(value);
}
/** A provided filter determines its model type. In particular, Set filters
 * accept the values-only phase action and ignore scalar-filter metadata. */
export function normalizeAg31ProvidedFilterModel(
  kind: "set" | "text" | "number",
  input: unknown,
): Ag31ColumnFilterModel | null {
  if (input == null) return null;
  const allowed = [
    "filterType",
    "type",
    "filter",
    "filterTo",
    "operator",
    "conditions",
    "condition1",
    "condition2",
    "values",
  ];
  const model = record(input, allowed);
  if (kind === "set")
    return normalizeAg31ColumnFilterModel({
      filterType: "set",
      values: model.values,
    });
  const typed = (value: unknown) => ({
    ...record(value, allowed),
    filterType: kind,
  });
  const result: Record<string, unknown> = { ...model, filterType: kind };
  if (model.conditions !== undefined)
    result.conditions = dense(model.conditions, 16).map(typed);
  for (const name of ["condition1", "condition2"] as const)
    if (model[name] !== undefined) result[name] = typed(model[name]);
  return normalizeAg31ColumnFilterModel(result);
}
function blank(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "");
}
function evaluateSimple(
  model: Ag31SimpleFilterModel,
  value: unknown,
  params: Readonly<Record<string, unknown>>,
): boolean {
  if (model.type === "blank") return blank(value);
  if (model.type === "notBlank") return !blank(value);
  if (model.filterType === "text") {
    if (params.textFormatter != null || params.textMatcher != null)
      throw new TypeError(
        "Custom text matching requires a separate source adapter",
      );
    const normalize = (v: unknown) =>
      params.caseSensitive === true ? String(v) : String(v).toLowerCase();
    const needle = normalize(model.filter),
      haystack = normalize(value ?? "");
    switch (model.type) {
      case "equals":
        return haystack === needle;
      case "notEqual":
        return haystack !== needle;
      case "contains":
        return haystack.includes(needle);
      case "notContains":
        return !haystack.includes(needle);
      case "startsWith":
        return haystack.startsWith(needle);
      case "endsWith":
        return haystack.endsWith(needle);
    }
  }
  if (value == null) {
    const option =
      model.type === "equals" || model.type === "notEqual"
        ? "includeBlanksInEquals"
        : model.type === "inRange"
          ? "includeBlanksInRange"
          : model.type.startsWith("less")
            ? "includeBlanksInLessThan"
            : "includeBlanksInGreaterThan";
    return params[option] === true;
  }
  const operand = model.filter as number;
  // Scalar comparisons retain source types; do not silently parse stored text.
  const order = (bound: number) =>
    value === bound ? 0 : bound < (value as number) ? 1 : -1;
  const comparison = order(operand);
  switch (model.type) {
    case "equals":
      return comparison === 0;
    case "notEqual":
      return comparison !== 0;
    case "lessThan":
      return comparison < 0;
    case "lessThanOrEqual":
      return comparison <= 0;
    case "greaterThan":
      return comparison > 0;
    case "greaterThanOrEqual":
      return comparison >= 0;
    case "inRange": {
      const upper = order(model.filterTo!);
      return params.inRangeInclusive === true
        ? comparison >= 0 && upper <= 0
        : comparison > 0 && upper < 0;
    }
  }
  return false;
}
/** Compiles borrowed source reads against an owned, detached JSON model. No source record is rewritten. */
export function compileAg31ColumnFilter<T>(
  model: Ag31ColumnFilterModel,
  column: Ag31FilterColumn<T>,
): (node: Ag31RowNode<T>) => boolean {
  model = normalizeAg31ColumnFilterModel(model);
  if (
    model.filterType === "text" &&
    (column.params.textFormatter != null || column.params.textMatcher != null)
  )
    throw new TypeError(
      "Custom text matching requires a separate source adapter",
    );
  if (model.filterType === "set") {
    const normalize = (value: unknown) => {
      const key = value == null || value === "" ? null : String(value);
      return column.params.caseSensitive === true
        ? key
        : (key?.toUpperCase() ?? null);
    };
    const selected = new Set(model.values.map(normalize));
    return (node) => {
      const value = column.read(node),
        values = Array.isArray(value) ? value : [value];
      return values.length
        ? values.some((item) => selected.has(normalize(column.key(item, node))))
        : selected.has(null);
    };
  }
  const passes = (condition: Ag31SimpleFilterModel, node: Ag31RowNode<T>) =>
    evaluateSimple(condition, column.read(node), column.params);
  return "conditions" in model
    ? (node) =>
        model.operator === "AND"
          ? model.conditions.every((c) => passes(c, node))
          : model.conditions.some((c) => passes(c, node))
    : (node) => passes(model, node);
}

/** Resident set keys follow source insertion order; supplied/remote value services are separate contracts. */
export function canonicalizeAg31SetFilter<T>(
  model: Ag31SetFilterModel,
  column: Ag31FilterColumn<T>,
  nodes: readonly Ag31RowNode<T>[],
): Ag31SetFilterModel | null {
  if (nodes.length > 100000)
    throw new RangeError("Source set row budget exceeded");
  if (
    column.params.values != null ||
    column.params.treeList === true ||
    column.params.convertValuesToStrings === true ||
    column.params.suppressClearModelOnRefreshValues === true
  )
    throw new TypeError(
      "Supplied/tree source set values require a separate value-service adapter",
    );
  const canonical = new Map<string | null, string | null>();
  const fold = (value: string | null) =>
    column.params.caseSensitive === true
      ? value
      : (value?.toUpperCase() ?? null);
  let work = 0,
    characters = 0;
  for (const node of nodes) {
    const value = column.read(node);
    const values = Array.isArray(value)
      ? value.length
        ? value
        : [undefined]
      : [value];
    for (const item of values) {
      if (++work > 500000)
        throw new RangeError("Source set key work budget exceeded");
      const raw = column.key(item, node);
      const key = raw == null || raw === "" ? null : String(raw);
      if (
        key != null &&
        (key.length > 4096 || (characters += key.length) > 4000000)
      )
        throw new RangeError("Source set key text budget exceeded");
      const normalized = fold(key);
      if (!canonical.has(normalized)) canonical.set(normalized, key);
    }
  }
  const selected = new Set<string | null>();
  for (const value of model.values) {
    const key = fold(value === "" ? null : value);
    if (canonical.has(key)) selected.add(canonical.get(key)!);
  }
  return selected.size === canonical.size
    ? null
    : { filterType: "set", values: [...selected] };
}
