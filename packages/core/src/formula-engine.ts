import {
  compileFormulaProgram,
  evaluateFormulaAst,
  isFormulaError,
} from "./formula-language.js";
import type { FormulaAst as Ast } from "./formula-language.js";
export { isFormulaError } from "./formula-language.js";
/** Explicit formulas only. No eval, Function, JavaScript property access, I/O or global lookup. */
export interface FormulaCell {
  rowId: string;
  columnId: string;
}
export type FormulaValue = number | string | boolean | null;
export type FormulaErrorCode =
  "CYCLE" | "REF" | "DIV0" | "VALUE" | "NAME" | "LIMIT" | "PARSE";
export interface FormulaError {
  readonly kind: "error";
  readonly code: FormulaErrorCode;
  readonly message: string;
}
export type FormulaResult = FormulaValue | FormulaError;
export interface FormulaLimits {
  maxTokens?: number;
  maxRangeCells?: number;
  maxFormulaLength?: number;
  maxDepth?: number;
  maxEvaluationSteps?: number;
}
export interface FormulaEngineOptions {
  rowIds: readonly string[];
  columnIds: readonly string[];
  getRawValue: (rowId: string, columnId: string) => unknown;
  limits?: FormulaLimits;
}
export interface FormulaSnapshot {
  readonly version: number;
  readonly errors: Readonly<Record<string, FormulaError>>;
}
export const formulaCellKey = (cell: FormulaCell): string =>
  JSON.stringify([cell.rowId, cell.columnId]);
const error = (code: FormulaErrorCode, message: string): FormulaError =>
  Object.freeze({ kind: "error", code, message });
type Limits = Required<FormulaLimits>;
interface Formula {
  expression: string;
  ast?: Ast;
  parseError?: FormulaError;
  dependencies: Set<string>;
}
/** Ordered IDs are immutable bindings. Reconstruct the engine for structural changes. */
export class FormulaEngine {
  private readonly rowIds: string[];
  private readonly columnIds: string[];
  private readonly rowSet: Set<string>;
  private readonly columnSet: Set<string>;
  private readonly limits: Limits;
  private readonly formulas = new Map<string, Formula>();
  private readonly cells = new Map<string, FormulaCell>();
  private readonly dependents = new Map<string, Set<string>>();
  private readonly cache = new Map<string, FormulaResult>();
  private readonly diagnostics = new Map<string, FormulaError>();
  private readonly listeners = new Set<() => void>();
  private snapshot: FormulaSnapshot = Object.freeze({
    version: 0,
    errors: Object.freeze({}),
  });
  constructor(private readonly options: FormulaEngineOptions) {
    this.rowIds = [...options.rowIds];
    this.columnIds = [...options.columnIds];
    this.rowSet = new Set(this.rowIds);
    this.columnSet = new Set(this.columnIds);
    if (
      this.rowSet.size !== this.rowIds.length ||
      this.columnSet.size !== this.columnIds.length ||
      [...this.rowIds, ...this.columnIds].some(
        (id) => typeof id !== "string" || !id,
      )
    )
      throw new TypeError(
        "Formula row and column IDs must be unique nonempty strings",
      );
    this.limits = {
      maxTokens: 2048,
      maxRangeCells: 10000,
      maxFormulaLength: 16384,
      maxDepth: 64,
      maxEvaluationSteps: 100000,
      ...options.limits,
    };
    for (const value of Object.values(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new RangeError("Formula limits must be positive safe integers");
  }
  private valid(cell: FormulaCell) {
    return this.rowSet.has(cell.rowId) && this.columnSet.has(cell.columnId);
  }
  private remember(cell: FormulaCell) {
    const key = formulaCellKey(cell);
    this.cells.set(key, { ...cell });
    return key;
  }
  private publish() {
    const errors = Object.freeze(Object.fromEntries(this.diagnostics));
    this.snapshot = Object.freeze({
      version: this.snapshot.version + 1,
      errors,
    });
    for (const listener of [...this.listeners]) listener();
  }
  private clearDependents(keys: Iterable<string>) {
    const queue = [...keys],
      seen = new Set(queue);
    for (let index = 0; index < queue.length; index++) {
      const key = queue[index];
      this.cache.delete(key);
      this.diagnostics.delete(key);
      for (const dependent of this.dependents.get(key) ?? [])
        if (!seen.has(dependent)) {
          seen.add(dependent);
          queue.push(dependent);
        }
    }
  }
  private detach(key: string) {
    const formula = this.formulas.get(key);
    for (const dependency of formula?.dependencies ?? []) {
      const dependents = this.dependents.get(dependency);
      dependents?.delete(key);
      if (!dependents?.size) this.dependents.delete(dependency);
    }
  }
  /** Invalid expressions remain explicit formulas and evaluate to typed parse/limit errors. */
  setFormula(cell: FormulaCell, expression: string): FormulaError | undefined {
    if (!this.valid(cell)) return error("REF", "Unknown formula cell");
    const key = this.remember(cell);
    this.detach(key);
    const formula: Formula = { expression, dependencies: new Set() };
    const program = compileFormulaProgram(
      expression,
      { cell, rowIds: this.rowIds, columnIds: this.columnIds },
      this.limits,
    );
    formula.ast = program.ast;
    formula.parseError = program.error;
    for (const dependencyCell of program.dependencies) {
      const dependencyKey = this.remember(dependencyCell);
      formula.dependencies.add(dependencyKey);
      const dependents = this.dependents.get(dependencyKey) ?? new Set();
      dependents.add(key);
      this.dependents.set(dependencyKey, dependents);
    }
    this.formulas.set(key, formula);
    this.clearDependents([key]);
    this.publish();
    return formula.parseError;
  }
  removeFormula(cell: FormulaCell): void {
    const key = formulaCellKey(cell);
    if (!this.formulas.has(key)) return;
    this.detach(key);
    this.formulas.delete(key);
    this.clearDependents([key]);
    this.publish();
  }
  getFormula(cell: FormulaCell): string | undefined {
    return this.formulas.get(formulaCellKey(cell))?.expression;
  }
  getDependencies(cell: FormulaCell): FormulaCell[] {
    return [
      ...(this.formulas.get(formulaCellKey(cell))?.dependencies ?? []),
    ].map((key) => ({ ...this.cells.get(key)! }));
  }
  getDependents(cell: FormulaCell, transitive = false): FormulaCell[] {
    const key = formulaCellKey(cell),
      queue = [...(this.dependents.get(key) ?? [])],
      seen = new Set(queue);
    if (transitive)
      for (let index = 0; index < queue.length; index++)
        for (const dependent of this.dependents.get(queue[index]) ?? [])
          if (!seen.has(dependent)) {
            seen.add(dependent);
            queue.push(dependent);
          }
    return queue.map((item) => ({ ...this.cells.get(item)! }));
  }
  /** Update provider data first, then invalidate the changed stable cell IDs. Omit cells for all. */
  invalidate(cells?: readonly FormulaCell[]): void {
    if (cells) this.clearDependents(cells.map(formulaCellKey));
    else {
      this.cache.clear();
      this.diagnostics.clear();
    }
    this.publish();
  }
  private resolve(
    cell: FormulaCell,
    stack: Set<string>,
    budget: { steps: number },
  ): FormulaResult {
    if (!this.valid(cell))
      return error("REF", "Cell reference is out of bounds");
    const key = this.remember(cell);
    if (stack.has(key)) return error("CYCLE", "Circular formula reference");
    if (stack.size >= this.limits.maxDepth)
      return error("LIMIT", "Formula dependency depth limit exceeded");
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (++budget.steps > this.limits.maxEvaluationSteps)
      return error("LIMIT", "Formula evaluation step limit exceeded");
    const formula = this.formulas.get(key);
    let result: FormulaResult;
    if (formula) {
      stack.add(key);
      result =
        formula.parseError ??
        evaluateFormulaAst(formula.ast!, {
          limits: this.limits,
          budget,
          resolveCell: (cell) => this.resolve(cell, stack, budget),
        });
      stack.delete(key);
    } else {
      try {
        const raw = this.options.getRawValue(cell.rowId, cell.columnId);
        result =
          raw === undefined || raw === null
            ? null
            : typeof raw === "string" ||
                typeof raw === "boolean" ||
                (typeof raw === "number" && Number.isFinite(raw))
              ? raw
              : error(
                  "VALUE",
                  "Raw cell must be finite number, string, boolean or blank",
                );
      } catch {
        result = error("VALUE", "Raw cell provider failed");
      }
    }
    // A limit depends on the evaluation budget/path, so do not poison an otherwise valid independent calculation.
    if (!isFormulaError(result) || result.code !== "LIMIT")
      this.cache.set(key, result);
    this.recordResult(key, result);
    return result;
  }
  evaluate(cell: FormulaCell): FormulaResult {
    const previousErrors = JSON.stringify(this.snapshot.errors);
    const result = this.resolve(cell, new Set(), { steps: 0 });
    this.recordResult(formulaCellKey(cell), result);
    const nextErrors = Object.fromEntries(this.diagnostics);
    if (JSON.stringify(nextErrors) !== previousErrors) this.publish();
    return result;
  }
  /** Recompute dirty formulas; already memoized results are retained until invalidated. */
  recalculate(): ReadonlyMap<string, FormulaResult> {
    const results = new Map<string, FormulaResult>();
    for (const key of this.formulas.keys()) {
      const result = this.resolve(this.cells.get(key)!, new Set(), {
        steps: 0,
      });
      results.set(key, result);
      this.recordResult(key, result);
    }
    this.publish();
    return results;
  }
  private recordResult(key: string, result: FormulaResult) {
    if (isFormulaError(result)) this.diagnostics.set(key, result);
    else this.diagnostics.delete(key);
  }
  getSnapshot = (): FormulaSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
