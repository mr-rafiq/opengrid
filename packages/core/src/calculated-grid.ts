import { createGrid } from "./index.js";
import type { Column, GridModel, GridOptions } from "./types.js";
import type {
  FormulaError,
  FormulaLimits,
  FormulaResult,
} from "./formula-engine.js";
import {
  compileFormulaProgram,
  createFormulaError,
  evaluateFormulaAst,
  isFormulaError,
} from "./formula-language.js";
import type { FormulaProgram } from "./formula-language.js";

export type CalculatedColumn<T> = Omit<
  Column<T>,
  | "field"
  | "valueGetter"
  | "valueCache"
  | "editable"
  | "valueParser"
  | "validate"
  | "type"
> & {
  expression: string;
  type: "number" | "text" | "boolean";
  editable?: false;
  valueCache?: false;
};
export interface CalculatedGridOptions<T> extends GridOptions<T> {
  calculatedColumns: readonly CalculatedColumn<T>[];
  calculationCacheMaxEntries?: number;
  calculationLimits?: Omit<FormulaLimits, "maxRangeCells">;
}
export interface CalculatedColumnsController<T> {
  getResult(rowId: string, columnId: string): FormulaResult;
  evaluate(row: T, columnId: string): FormulaResult;
  getDependencies(columnId: string): readonly string[];
  getDefinitions(): readonly CalculatedColumn<T>[];
  getStats(): Readonly<{ compiledPrograms: number; cacheEntries: number }>;
  expire(): void;
  dispose(): void;
}
export interface CalculatedGrid<T> {
  readonly model: GridModel<T>;
  readonly calculations: CalculatedColumnsController<T>;
}
export class CalculatedColumnDefinitionError extends TypeError {
  readonly name = "CalculatedColumnDefinitionError";
  constructor(
    readonly columnId: string,
    readonly formulaError: FormulaError,
  ) {
    super(`Calculated column ${columnId}: ${formulaError.message}`);
  }
}
export function calculatedErrorLabel(error: FormulaError): string {
  return {
    DIV0: "#DIV/0!",
    CYCLE: "#CYCLE!",
    REF: "#REF!",
    VALUE: "#VALUE!",
    NAME: "#NAME?",
    LIMIT: "#LIMIT!",
    PARSE: "#PARSE!",
  }[error.code];
}

/** Compile one reusable program per derived column and bind it to a real client grid. */
export function createCalculatedGrid<T>(
  options: CalculatedGridOptions<T>,
): CalculatedGrid<T> {
  const maximum =
    options.calculationCacheMaxEntries === undefined
      ? 100000
      : options.calculationCacheMaxEntries;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1000000)
    throw new RangeError(
      "calculationCacheMaxEntries must be an integer from 1 to 1000000",
    );
  if (
    !Array.isArray(options.calculatedColumns) ||
    options.calculatedColumns.length > 64
  )
    throw new RangeError("At most 64 calculated columns are supported");
  if (
    !Array.isArray(options.columns) ||
    options.columns.length + options.calculatedColumns.length > 1024
  )
    throw new RangeError("Calculated grids support at most 1024 total columns");
  const limits: Required<FormulaLimits> = {
    maxTokens: 2048,
    maxRangeCells: 10000,
    maxFormulaLength: 16384,
    maxDepth: 64,
    maxEvaluationSteps: 100000,
  };
  if (
    options.calculationLimits !== undefined &&
    (options.calculationLimits === null ||
      typeof options.calculationLimits !== "object" ||
      Array.isArray(options.calculationLimits))
  )
    throw new TypeError("calculationLimits must be an object");
  for (const [key, value] of Object.entries(options.calculationLimits ?? {})) {
    if (
      ![
        "maxTokens",
        "maxFormulaLength",
        "maxDepth",
        "maxEvaluationSteps",
      ].includes(key)
    )
      throw new TypeError(`Unknown calculation limit: ${key}`);
    const name = key as keyof typeof limits;
    if (!Number.isSafeInteger(value) || value < 1 || value > limits[name])
      throw new RangeError(
        `Calculation ${name} must be a positive integer no greater than ${limits[name]}`,
      );
    limits[name] = value;
  }
  const baseColumns = options.columns.map((column) => {
    if (
      column.groupPath !== undefined &&
      (!Array.isArray(column.groupPath) ||
        Array.from(column.groupPath).some((part) => typeof part !== "string"))
    )
      throw new TypeError("Base groupPath must contain strings");
    return {
      ...column,
      ...(column.groupPath === undefined
        ? {}
        : { groupPath: [...column.groupPath] }),
    };
  });
  const base = new Map<string, Column<T>>();
  for (const column of baseColumns) {
    if (typeof column.id !== "string" || !column.id || base.has(column.id))
      throw new TypeError("Base column IDs must be unique nonempty strings");
    base.set(column.id, column);
  }
  const definitions = options.calculatedColumns.map((definition) => {
    if (
      definition === null ||
      typeof definition !== "object" ||
      typeof definition.id !== "string" ||
      !definition.id ||
      typeof definition.expression !== "string" ||
      !["number", "text", "boolean"].includes(definition.type)
    )
      throw new TypeError(
        "Calculated columns require an ID, expression and number/text/boolean type",
      );
    const unsafe = definition as unknown as Record<string, unknown>;
    if (
      ["field", "valueGetter", "valueParser", "validate"].some(
        (key) => unsafe[key] !== undefined,
      ) ||
      (unsafe.editable !== undefined && unsafe.editable !== false) ||
      (unsafe.valueCache !== undefined && unsafe.valueCache !== false)
    )
      throw new TypeError(
        `Calculated column ${definition.id} must be read only without a raw field/getter/parser/validator or generic value cache`,
      );
    if (
      definition.groupPath !== undefined &&
      (!Array.isArray(definition.groupPath) ||
        Array.from(definition.groupPath).some(
          (part) => typeof part !== "string",
        ))
    )
      throw new TypeError("Calculated groupPath must contain strings");
    return Object.freeze({
      ...definition,
      ...(definition.groupPath === undefined
        ? {}
        : { groupPath: Object.freeze([...definition.groupPath]) }),
      editable: false as const,
    });
  });
  const byDefinition = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  if (
    byDefinition.size !== definitions.length ||
    definitions.some((definition) => base.has(definition.id))
  )
    throw new TypeError(
      "Calculated column IDs must be unique and cannot replace base columns",
    );
  const columnIds = [...base.keys(), ...byDefinition.keys()],
    programs = new Map<string, FormulaProgram>();
  for (const definition of definitions) {
    const program = compileFormulaProgram(
      definition.expression,
      {
        cell: { rowId: "", columnId: definition.id },
        rowIds: [],
        columnIds,
        localOnly: true,
      },
      limits,
    );
    if (program.error)
      throw new CalculatedColumnDefinitionError(definition.id, program.error);
    programs.set(definition.id, program);
  }
  let model: GridModel<T> | undefined;
  let initialIndex: Map<string, T> | undefined;
  const getRowId = options.getRowId,
    initialRows = options.rows;
  const cache = new Map<string, { row: T; result: FormulaResult }>();
  let token: unknown = {},
    generation = 0;
  const clear = () => {
    cache.clear();
    generation++;
  };
  function sync() {
    const next = model?.getState() ?? initialRows;
    if (next !== token) {
      clear();
      token = next;
    }
  }
  interface Context {
    memo: Map<string, FormulaResult>;
    stack: Set<string>;
    budget: { steps: number };
    transient: boolean;
    generation: number;
    canonical: boolean;
    rowId: string;
    reentrantError?: FormulaError;
  }
  const active = new Map<T, Context>();
  function canonical(row: T, rowId: string): boolean {
    if (model) return model.getRow(rowId) === row;
    initialIndex ??= new Map(initialRows.map((row) => [getRowId(row), row]));
    return initialIndex.get(rowId) === row;
  }
  function evaluate(row: T, columnId: string): FormulaResult {
    sync();
    let rowId: string;
    try {
      rowId = getRowId(row);
    } catch {
      return createFormulaError("VALUE", "Row ID provider failed");
    }
    if (typeof rowId !== "string" || !rowId)
      return createFormulaError(
        "REF",
        "Calculated rows require a stable nonempty ID",
      );
    let context = active.get(row),
      root = false;
    if (!context) {
      let resident: boolean;
      try {
        resident = canonical(row, rowId);
      } catch {
        return createFormulaError("VALUE", "Row lookup failed");
      }
      context = {
        memo: new Map(),
        stack: new Set(),
        budget: { steps: 0 },
        transient: false,
        generation,
        canonical: resident,
        rowId,
      };
      active.set(row, context);
      root = true;
    }
    const current = context;
    function resolve(id: string): FormulaResult {
      if (!base.has(id) && !programs.has(id))
        return createFormulaError("REF", `Unknown column: ${id}`);
      if (current.stack.has(id))
        return createFormulaError(
          "CYCLE",
          "Circular calculated column reference",
        );
      if (current.stack.size >= limits.maxDepth)
        return createFormulaError(
          "LIMIT",
          "Calculated dependency depth limit exceeded",
        );
      if (current.memo.has(id)) return current.memo.get(id)!;
      const key = JSON.stringify([current.rowId, id]);
      if (current.canonical && cache.has(key)) {
        const entry = cache.get(key)!;
        if (entry.row === row) {
          cache.delete(key);
          cache.set(key, entry);
          current.memo.set(id, entry.result);
          return entry.result;
        }
        cache.delete(key);
      }
      if (++current.budget.steps > limits.maxEvaluationSteps)
        return createFormulaError(
          "LIMIT",
          "Calculated evaluation step limit exceeded",
        );
      let result: FormulaResult;
      const program = programs.get(id);
      current.stack.add(id);
      try {
        if (program) {
          result = evaluateFormulaAst(program.ast!, {
            limits,
            budget: current.budget,
            resolveCell: () =>
              createFormulaError("REF", "Cross-row references are unavailable"),
            resolveColumn: resolve,
          });
          const definition = byDefinition.get(id)!;
          if (
            !isFormulaError(result) &&
            result !== null &&
            typeof result !==
              (definition.type === "text" ? "string" : definition.type)
          )
            result = createFormulaError(
              "VALUE",
              `Calculated ${definition.type} result has the wrong type`,
            );
        } else {
          const column = base.get(id)!;
          const raw = model
            ? model.getValue(row, id)
            : column.valueGetter
              ? column.valueGetter(row)
              : column.field
                ? row[column.field]
                : (row as Record<string, unknown>)[id];
          result =
            raw == null
              ? null
              : typeof raw === "string" ||
                  typeof raw === "boolean" ||
                  (typeof raw === "number" && Number.isFinite(raw))
                ? raw
                : createFormulaError(
                    "VALUE",
                    "Formula inputs must be finite number, string, boolean or blank",
                  );
        }
      } catch {
        current.transient = true;
        result = createFormulaError(
          "VALUE",
          "Calculated input provider failed",
        );
      } finally {
        current.stack.delete(id);
      }
      if (current.reentrantError) result = current.reentrantError;
      if (!isFormulaError(result) || result.code !== "LIMIT") {
        current.memo.set(id, result);
        if (
          current.canonical &&
          !current.transient &&
          current.generation === generation &&
          canonical(row, current.rowId)
        ) {
          cache.set(key, { row, result });
          while (cache.size > maximum) cache.delete(cache.keys().next().value!);
        }
      }
      return result;
    }
    try {
      const result = resolve(columnId);
      if (
        !root &&
        isFormulaError(result) &&
        (result.code === "CYCLE" || result.code === "LIMIT")
      )
        current.reentrantError = result;
      return current.reentrantError ?? result;
    } finally {
      if (root) active.delete(row);
    }
  }
  const generated: Column<T>[] = definitions.map((definition) => {
    const { expression: _expression, ...metadata } = definition;
    return {
      ...metadata,
      editable: false,
      valueCache: false,
      valueGetter: (row) => {
        const result = evaluate(row, definition.id);
        return isFormulaError(result) ? null : result;
      },
      valueFormatter: (_value, row) => {
        const result = evaluate(row, definition.id);
        return isFormulaError(result)
          ? calculatedErrorLabel(result)
          : definition.valueFormatter
            ? definition.valueFormatter(result, row)
            : String(result ?? "");
      },
    };
  });
  const {
    calculatedColumns: _definitions,
    calculationCacheMaxEntries: _maximum,
    calculationLimits: _limits,
    ...gridOptions
  } = options;
  model = createGrid({
    ...gridOptions,
    columns: [...baseColumns, ...generated],
  });
  model.setColumns = () => {
    throw new TypeError(
      "Calculated grids require a new model for structural column changes",
    );
  };
  initialIndex = undefined;
  const controller: CalculatedColumnsController<T> = Object.freeze({
    evaluate,
    getResult(rowId: string, columnId: string) {
      let row: T | undefined;
      try {
        row = model!.getRow(rowId);
      } catch {
        return createFormulaError("VALUE", "Row lookup failed");
      }
      return row === undefined
        ? createFormulaError("REF", `Unknown row: ${rowId}`)
        : evaluate(row, columnId);
    },
    getDependencies(columnId: string) {
      const program = programs.get(columnId);
      if (!program)
        throw new TypeError(`Unknown calculated column: ${columnId}`);
      return program.columnDependencies;
    },
    getDefinitions: () => Object.freeze([...definitions]),
    getStats() {
      sync();
      return Object.freeze({
        compiledPrograms: programs.size,
        cacheEntries: cache.size,
      });
    },
    expire() {
      clear();
      model!.expireValueCache();
    },
    dispose() {
      clear();
    },
  });
  return Object.freeze({ model, calculations: controller });
}
