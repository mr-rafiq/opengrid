import { createGrid } from "./index.js";
import type { Column, Edit, GridModel, GridOptions } from "./types.js";
import type {
  FormulaCell,
  FormulaError,
  FormulaLimits,
  FormulaResult,
  FormulaValue,
} from "./formula-engine.js";
import {
  compileFormulaProgram,
  createFormulaError,
  evaluateFormulaAst,
  isFormulaError,
} from "./formula-language.js";
import type { FormulaProgram } from "./formula-language.js";
import { attachGridExtension } from "./grid-extension.js";
import type { GridExtensionContext } from "./grid-extension.js";
import { registerFormulaGrid } from "./formula-grid-registry.js";
export { getFormulaGridController } from "./formula-grid-registry.js";
import { calculatedErrorLabel } from "./calculated-grid.js";

export interface FormulaExpression {
  readonly kind: "formula";
  readonly expression: string;
}
export type FormulaGridInput = FormulaValue | FormulaExpression;
/** Explicit data atom; ordinary strings beginning with '=' are never formulas. */
export function formulaInput(expression: string): FormulaExpression {
  if (typeof expression !== "string")
    throw new TypeError("Formula expression must be text");
  if (expression.length > 16384)
    throw new RangeError("Formula expression exceeds 16384 characters");
  return Object.freeze({ kind: "formula", expression });
}
export function isFormulaInput(value: unknown): value is FormulaExpression {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 2 ||
    !keys.includes("kind") ||
    !keys.includes("expression")
  )
    return false;
  const kind = Object.getOwnPropertyDescriptor(value, "kind"),
    expression = Object.getOwnPropertyDescriptor(value, "expression");
  return (
    !!kind &&
    "value" in kind &&
    kind.value === "formula" &&
    !!expression &&
    "value" in expression &&
    typeof expression.value === "string"
  );
}
export interface FormulaGridLimits {
  maxCells?: number;
  maxFormulas?: number;
  maxDependencies?: number;
  maxFormulaText?: number;
  maxBatchEdits?: number;
  maxValidationSteps?: number;
  cacheMaxEntries?: number;
}
export interface FormulaValidationContext<T> {
  readonly cell: Readonly<FormulaCell>;
  readonly input: FormulaGridInput;
  readonly row: T;
  /** Reads the same fully staged sheet, without publishing or committing it. */
  getResult(cell: FormulaCell): FormulaResult;
}
export interface FormulaGridOptions<T> extends GridOptions<T> {
  formulaColumns: readonly string[];
  formulaGridLimits?: FormulaGridLimits;
  formulaLimits?: FormulaLimits;
  validateFormulaResult?: (
    result: FormulaResult,
    context: FormulaValidationContext<T>,
  ) => string | undefined;
}
export interface FormulaGridController<T> {
  readonly model: GridModel<T>;
  supportsColumn(columnId: string): boolean;
  getInput(cell: FormulaCell): FormulaGridInput | undefined;
  getFormula(cell: FormulaCell): string | undefined;
  getResult(cell: FormulaCell): FormulaResult;
  setFormula(cell: FormulaCell, expression: string): string | undefined;
  setLiteral(cell: FormulaCell, value: FormulaValue): string | undefined;
  batchInputs(edits: readonly Edit<T>[]): string | undefined;
  expire(): void;
  /** Clears owned caches only; later reads/writes remain valid for Strict Mode reuse. */
  dispose(): void;
}
export interface FormulaGrid<T> {
  readonly model: GridModel<T>;
  readonly formulas: FormulaGridController<T>;
}
export class FormulaGridValidationError extends TypeError {
  readonly name = "FormulaGridValidationError";
  constructor(
    readonly formulaError: FormulaError,
    readonly cell?: Readonly<FormulaCell>,
  ) {
    super(formulaError.message);
  }
}
const GRID_CAPS = {
  maxCells: 100000,
  maxFormulas: 10000,
  maxDependencies: 100000,
  maxFormulaText: 1000000,
  maxBatchEdits: 100000,
  maxValidationSteps: 1000000,
  cacheMaxEntries: 100000,
} as const;
const LANGUAGE_CAPS: Required<FormulaLimits> = {
  maxTokens: 2048,
  maxRangeCells: 10000,
  maxFormulaLength: 16384,
  maxDepth: 64,
  maxEvaluationSteps: 100000,
};
type NumericBounds<T> = { -readonly [K in keyof T]: number };
function boundedOptions<T extends Record<string, number>>(
  input: object | undefined,
  caps: T,
): NumericBounds<T> {
  if (
    input !== undefined &&
    (input === null || typeof input !== "object" || Array.isArray(input))
  )
    throw new TypeError("Formula limits must be an object");
  const result = { ...caps } as NumericBounds<T>;
  for (const [key, value] of Object.entries(input ?? {})) {
    if (
      !Object.hasOwn(caps, key) ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > caps[key]
    )
      throw new RangeError(`Invalid formula limit: ${key}`);
    result[key as keyof T] = value;
  }
  return result;
}
const keyOf = (cell: FormulaCell) =>
  JSON.stringify([cell.rowId, cell.columnId]);
const scalar = (value: unknown): value is FormulaValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));
const fail = (
  code: FormulaError["code"],
  message: string,
  cell?: FormulaCell,
): never => {
  throw new FormulaGridValidationError(
    createFormulaError(code, message),
    cell && Object.freeze({ ...cell }),
  );
};

/** Original client-sheet adapter sharing the safe parser with FormulaEngine. */
export function createFormulaGrid<T>(
  options: FormulaGridOptions<T>,
): FormulaGrid<T> {
  const caps = boundedOptions(options.formulaGridLimits, { ...GRID_CAPS } as {
    [K in keyof typeof GRID_CAPS]: number;
  });
  const limits = boundedOptions(options.formulaLimits, LANGUAGE_CAPS);
  if (
    !Array.isArray(options.rows) ||
    options.rows.length > 100000 ||
    !Array.isArray(options.columns) ||
    options.columns.length > 1024 ||
    options.rows.length * options.columns.length > caps.maxCells
  )
    throw new RangeError("Formula sheet exceeds its cell/row/column limits");
  if (
    !Array.isArray(options.formulaColumns) ||
    options.formulaColumns.length > 64 ||
    options.formulaColumns.some((id) => typeof id !== "string" || !id) ||
    new Set(options.formulaColumns).size !== options.formulaColumns.length
  )
    throw new TypeError("Formula columns require at most 64 unique IDs");
  if (
    options.validateFormulaResult !== undefined &&
    typeof options.validateFormulaResult !== "function"
  )
    throw new TypeError("validateFormulaResult must be a function");
  const columns = options.columns.map((column) => ({ ...column })),
    byColumn = new Map(columns.map((column) => [column.id, column]));
  if (
    byColumn.size !== columns.length ||
    columns.some((column) => typeof column.id !== "string" || !column.id)
  )
    throw new TypeError("Formula column IDs must be unique nonempty strings");
  const enabled = new Set(options.formulaColumns),
    formulaFields = new Map<string, keyof T & string>();
  for (const id of enabled) {
    const column = byColumn.get(id);
    if (
      !column ||
      !column.field ||
      column.valueGetter ||
      column.type === "bigint" ||
      column.type === "date"
    )
      throw new TypeError(
        "Formula columns require a raw field without a getter and number/text/boolean type",
      );
    formulaFields.set(id, column.field);
  }
  const getRowId = options.getRowId,
    rowIds = options.rows.map(getRowId),
    columnIds = columns.map((column) => column.id),
    rowSet = new Set(rowIds);
  if (
    rowSet.size !== rowIds.length ||
    rowIds.some((id) => typeof id !== "string" || !id)
  )
    throw new TypeError("Formula rows require unique nonempty stable IDs");
  let context: GridExtensionContext<T> | undefined,
    model: GridModel<T> | undefined;
  const programs = new Map<string, { program: FormulaProgram; text: number }>();
  let programText = 0,
    programDependencies = 0;
  function program(cell: FormulaCell, expression: string): FormulaProgram {
    const key = JSON.stringify([cell.rowId, cell.columnId, expression]);
    const found = programs.get(key);
    if (found) {
      programs.delete(key);
      programs.set(key, found);
      return found.program;
    }
    const result = compileFormulaProgram(
      expression,
      { cell, rowIds, columnIds },
      limits,
    );
    if (result.error) fail(result.error.code, result.error.message, cell);
    programs.set(key, { program: result, text: expression.length });
    programText += expression.length;
    programDependencies += result.dependencies.length;
    while (
      programs.size > caps.maxFormulas ||
      programText > caps.maxFormulaText ||
      programDependencies > caps.maxDependencies
    ) {
      const oldest = programs.keys().next().value!;
      programText -= programs.get(oldest)!.text;
      programDependencies -= programs.get(oldest)!.program.dependencies.length;
      programs.delete(oldest);
    }
    return result;
  }
  function normalize(
    value: unknown,
    cell: FormulaCell,
    compile = true,
  ): FormulaGridInput {
    if (value === undefined) return null;
    if (isFormulaInput(value)) {
      if (compile) program(cell, value.expression);
      return Object.isFrozen(value) ? value : formulaInput(value.expression);
    }
    if (!scalar(value))
      return fail(
        "VALUE",
        "Formula fields require a scalar literal or an explicit formula atom",
        cell,
      );
    return value;
  }
  // Detach unfrozen imported atoms, without freezing/mutating borrowed rows.
  const detachRows = (rows: readonly T[]) =>
    rows.map((row) => {
      let next = row;
      const rowId = getRowId(row);
      for (const [columnId, field] of formulaFields) {
        const raw = row[field],
          normalized = normalize(raw, { rowId, columnId }, false);
        if (raw !== undefined && normalized !== raw)
          next = { ...next, [field]: normalized };
      }
      return next;
    });
  const initialRows = detachRows(options.rows);
  interface Sheet {
    rows: Map<string, T>;
    formulas: Map<
      string,
      { cell: FormulaCell; input: FormulaExpression; program: FormulaProgram }
    >;
    cache: Map<string, FormulaResult>;
    epoch: unknown;
  }
  function buildSheet(rows: readonly T[], epoch: unknown): Sheet {
    if (rows.length !== rowIds.length)
      return fail(
        "REF",
        "Structural formula-sheet row changes are unsupported; recreate the sheet explicitly",
      );
    const mapped = new Map<string, T>(),
      formulas: Sheet["formulas"] = new Map();
    let dependencies = 0,
      text = 0;
    for (const row of rows) {
      const rowId = getRowId(row);
      if (!rowSet.has(rowId) || mapped.has(rowId))
        return fail(
          "REF",
          "Structural formula-sheet row changes are unsupported; recreate the sheet explicitly",
        );
      mapped.set(rowId, row);
      for (const [columnId, field] of formulaFields) {
        const cell = { rowId, columnId },
          input = normalize(row[field], cell, false);
        if (!isFormulaInput(input)) continue;
        text += input.expression.length;
        if (text > caps.maxFormulaText)
          return fail(
            "LIMIT",
            "Formula sheet exceeds its expression text budget",
            cell,
          );
        if (formulas.size >= caps.maxFormulas)
          return fail(
            "LIMIT",
            "Formula sheet exceeds its formula count budget",
            cell,
          );
        const compiled = program(cell, input.expression);
        dependencies += compiled.dependencies.length;
        if (dependencies > caps.maxDependencies)
          return fail(
            "LIMIT",
            "Formula sheet exceeds its dependency budget",
            cell,
          );
        formulas.set(keyOf(cell), { cell, input, program: compiled });
      }
    }
    return { rows: mapped, formulas, cache: new Map(), epoch };
  }
  let sheet = buildSheet(initialRows, initialRows),
    token: unknown = initialRows;
  function sync(): Sheet {
    const next = context?.getState() ?? initialRows;
    if (token !== next) {
      const replacement = buildSheet(context!.getRows(), next);
      sheet = replacement;
      token = next;
    }
    return sheet;
  }
  interface Evaluation {
    sheet: Sheet;
    stack: Set<string>;
    memo: Map<string, FormulaResult>;
    budget: { steps: number; maximum?: number };
    limits: Required<FormulaLimits>;
    transient: boolean;
    foreign?: { rowId: string; row: T };
  }
  let active: Evaluation | undefined;
  function evaluate(
    target: Sheet,
    cell: FormulaCell,
    budget: Evaluation["budget"] = { steps: 0 },
    foreign?: Evaluation["foreign"],
  ): FormulaResult {
    const previous = active;
    const sameForeign =
      previous?.foreign === foreign ||
      (previous?.foreign &&
        foreign &&
        previous.foreign.rowId === foreign.rowId &&
        previous.foreign.row === foreign.row);
    const evaluation: Evaluation =
      previous?.sheet === target && sameForeign
        ? previous
        : {
            sheet: target,
            stack: new Set(),
            memo: new Map(),
            budget,
            limits:
              budget.maximum === undefined
                ? limits
                : {
                    ...limits,
                    maxEvaluationSteps: Math.min(
                      limits.maxEvaluationSteps,
                      budget.maximum,
                    ),
                  },
            transient: false,
            foreign,
          };
    active = evaluation;
    function resolve(reference: FormulaCell): FormulaResult {
      if (!rowSet.has(reference.rowId) || !byColumn.has(reference.columnId))
        return createFormulaError("REF", "Unknown formula cell");
      const row =
        evaluation.foreign?.rowId === reference.rowId
          ? evaluation.foreign.row
          : target.rows.get(reference.rowId);
      if (row == null) return createFormulaError("REF", "Unknown formula row");
      const key = keyOf(reference);
      if (evaluation.stack.has(key))
        return createFormulaError("CYCLE", "Circular formula reference");
      if (
        evaluation.stack.size >= limits.maxDepth ||
        ++evaluation.budget.steps > evaluation.limits.maxEvaluationSteps
      )
        return createFormulaError("LIMIT", "Formula evaluation limit exceeded");
      if (evaluation.memo.has(key)) return evaluation.memo.get(key)!;
      if (!evaluation.foreign && target.cache.has(key)) {
        const result = target.cache.get(key)!;
        target.cache.delete(key);
        target.cache.set(key, result);
        evaluation.memo.set(key, result);
        return result;
      }
      let result: FormulaResult;
      evaluation.stack.add(key);
      try {
        const field = formulaFields.get(reference.columnId),
          rawInput = field ? row[field] : undefined;
        const entry =
          evaluation.foreign?.rowId === reference.rowId && field
            ? isFormulaInput(rawInput)
              ? { program: program(reference, rawInput.expression) }
              : undefined
            : target.formulas.get(key);
        if (entry) {
          result = evaluateFormulaAst(entry.program.ast!, {
            limits: evaluation.limits,
            budget: evaluation.budget,
            resolveCell: resolve,
          });
          const type = byColumn.get(reference.columnId)!.type;
          if (
            !isFormulaError(result) &&
            result !== null &&
            type &&
            typeof result !== (type === "text" ? "string" : type)
          )
            result = createFormulaError(
              "VALUE",
              "Formula result has the wrong column type",
            );
        } else {
          const column = byColumn.get(reference.columnId)!;
          const raw = field
            ? rawInput
            : context
              ? context.getRawValue(row, reference.columnId)
              : column.valueGetter
                ? column.valueGetter(row)
                : column.field
                  ? row[column.field]
                  : (row as Record<string, unknown>)[reference.columnId];
          result =
            raw == null
              ? null
              : scalar(raw)
                ? raw
                : createFormulaError(
                    "VALUE",
                    "Formula inputs must be finite number, text, boolean or blank",
                  );
        }
      } catch (error) {
        evaluation.transient = true;
        result =
          error instanceof FormulaGridValidationError
            ? error.formulaError
            : createFormulaError("VALUE", "Formula input provider failed");
      } finally {
        evaluation.stack.delete(key);
      }
      if (context && context.getState() !== target.epoch && target === sheet) {
        evaluation.transient = true;
        result = createFormulaError(
          "VALUE",
          "Grid changed during formula evaluation",
        );
      }
      if (!isFormulaError(result) || result.code !== "LIMIT") {
        evaluation.memo.set(key, result);
        if (!evaluation.foreign && !evaluation.transient) {
          target.cache.set(key, result);
          while (target.cache.size > caps.cacheMaxEntries)
            target.cache.delete(target.cache.keys().next().value!);
        }
      }
      return result;
    }
    try {
      return resolve(cell);
    } finally {
      active = previous;
    }
  }
  function input(cell: FormulaCell): FormulaGridInput | undefined {
    const field = formulaFields.get(cell.columnId),
      row = sync().rows.get(cell.rowId);
    return field && row != null ? normalize(row[field], cell) : undefined;
  }
  function validateRows(
    rows: readonly T[],
    edits?: readonly Edit<T>[],
  ): string | undefined {
    const candidate = buildSheet(rows, {});
    if (!options.validateFormulaResult) return;
    const targets = new Map<string, FormulaCell>();
    // A changed literal may invalidate a validator on any dependent formula cell.
    // Validate the bounded candidate formula set, plus explicitly edited literals.
    for (const [key, entry] of candidate.formulas) targets.set(key, entry.cell);
    for (const edit of edits ?? [])
      if (enabled.has(edit.columnId))
        targets.set(keyOf(edit), {
          rowId: edit.rowId,
          columnId: edit.columnId,
        });
    if (!edits)
      for (const rowId of candidate.rows.keys())
        for (const columnId of enabled)
          targets.set(keyOf({ rowId, columnId }), { rowId, columnId });
    let steps = 0;
    const read = (cell: FormulaCell): FormulaResult => {
      const remaining = caps.maxValidationSteps - steps;
      if (remaining <= 0)
        return fail(
          "LIMIT",
          "Formula batch exceeds its validation work budget",
          cell,
        );
      const budget = { steps: 0, maximum: remaining };
      const result = evaluate(candidate, cell, budget);
      steps += budget.steps;
      if (steps > caps.maxValidationSteps)
        return fail(
          "LIMIT",
          "Formula batch exceeds its validation work budget",
          cell,
        );
      return result;
    };
    for (const cell of targets.values()) {
      const row = candidate.rows.get(cell.rowId)!,
        field = formulaFields.get(cell.columnId)!;
      const error = options.validateFormulaResult(read(cell), {
        cell: Object.freeze({ ...cell }),
        input: normalize(row[field], cell),
        row,
        getResult: read,
      });
      if (error) return error;
    }
  }
  const generated = columns.map((column) => {
    if (!enabled.has(column.id)) return column;
    const parser = column.valueParser,
      formatter = column.valueFormatter;
    return {
      ...column,
      valueParser(value: unknown, row: T) {
        const cell = { rowId: getRowId(row), columnId: column.id };
        if (isFormulaInput(value)) {
          const normalized = normalize(value, cell),
            previous = row[column.field!];
          return isFormulaInput(previous) &&
            previous.expression === value.expression
            ? previous
            : normalized;
        }
        if (value !== null && typeof value === "object")
          return fail("VALUE", "Malformed formula input", cell);
        if (parser) return normalize(parser(value, row), cell);
        if (column.type === "number" && value !== "") {
          const number = Number(value);
          if (!Number.isFinite(number))
            return fail("VALUE", "Enter a finite number", cell);
          return number;
        }
        if (column.type === "boolean") {
          if (![true, false, "true", "false"].includes(value as boolean))
            return fail("VALUE", "Enter true or false", cell);
          return value === true || value === "true";
        }
        return normalize(value, cell);
      },
      valueFormatter(value: unknown, row: T) {
        const current = sync(),
          cell = { rowId: getRowId(row), columnId: column.id };
        const result = evaluate(
          current,
          cell,
          undefined,
          current.rows.get(cell.rowId) === row
            ? undefined
            : { rowId: cell.rowId, row },
        );
        return isFormulaError(result)
          ? calculatedErrorLabel(result)
          : formatter
            ? formatter(value, row)
            : String(value ?? "");
      },
    };
  });
  const {
    formulaColumns: _formulaColumns,
    formulaGridLimits: _gridLimits,
    formulaLimits: _formulaLimits,
    validateFormulaResult: _validator,
    ...baseOptions
  } = options;
  const gridOptions: GridOptions<T> = {
    ...baseOptions,
    rows: initialRows,
    columns: generated,
  };
  attachGridExtension(gridOptions, {
    beforeColumns: () =>
      "Formula grids require a new model for structural column changes",
    initialize(next) {
      context = next;
    },
    resolveValue(row, column, raw) {
      if (!enabled.has(column.id)) return raw();
      const current = sync(),
        rowId = getRowId(row);
      const result = evaluate(
        current,
        { rowId, columnId: column.id },
        undefined,
        current.rows.get(rowId) === row ? undefined : { rowId, row },
      );
      return isFormulaError(result) ? null : result;
    },
    beforeBatch(edits) {
      if (!Array.isArray(edits) || edits.length > caps.maxBatchEdits)
        return "Formula batch exceeds its edit budget";
      let text = 0;
      for (const edit of edits) {
        if (isFormulaInput(edit.value)) {
          if (!enabled.has(edit.columnId))
            return "Column is not formula enabled";
          text += edit.value.expression.length;
        }
        if (text > caps.maxFormulaText)
          return "Formula batch exceeds its expression text budget";
      }
    },
    validateBatch: validateRows,
    equalValue(columnId, left, right) {
      return enabled.has(columnId) &&
        isFormulaInput(left) &&
        isFormulaInput(right)
        ? left.expression === right.expression
        : undefined;
    },
    validateRows(rows) {
      const prepared = detachRows(rows);
      const error = validateRows(prepared);
      if (error) throw new Error(error);
      return prepared;
    },
  });
  model = createGrid(gridOptions);
  const controller: FormulaGridController<T> = Object.freeze({
    model,
    supportsColumn: (columnId: string) => enabled.has(columnId),
    getInput: input,
    getFormula(cell: FormulaCell) {
      const value = input(cell);
      return isFormulaInput(value) ? value.expression : undefined;
    },
    getResult(cell: FormulaCell) {
      return evaluate(sync(), cell);
    },
    setFormula(cell: FormulaCell, expression: string) {
      if (!enabled.has(cell.columnId)) return "Column is not formula enabled";
      try {
        return model!.editCell(
          cell.rowId,
          cell.columnId,
          formulaInput(expression),
        );
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid formula";
      }
    },
    setLiteral(cell: FormulaCell, value: FormulaValue) {
      if (!enabled.has(cell.columnId)) return "Column is not formula enabled";
      if (!scalar(value))
        return "Literal formula input must be a finite scalar";
      return model!.editCell(cell.rowId, cell.columnId, value);
    },
    batchInputs(edits: readonly Edit<T>[]) {
      if (!Array.isArray(edits) || edits.length > caps.maxBatchEdits)
        return "Formula batch exceeds its edit budget";
      return model!.batchEdit([...edits]);
    },
    expire() {
      sheet.cache.clear();
      token = {};
      model!.expireValueCache();
    },
    dispose() {
      sheet.cache.clear();
      programs.clear();
      programText = programDependencies = 0;
      token = {};
    },
  });
  registerFormulaGrid(model, controller);
  return Object.freeze({ model, formulas: controller });
}
