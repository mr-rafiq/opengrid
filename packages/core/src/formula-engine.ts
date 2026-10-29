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
export const isFormulaError = (value: unknown): value is FormulaError =>
  typeof value === "object" &&
  value !== null &&
  (value as FormulaError).kind === "error";
const error = (code: FormulaErrorCode, message: string): FormulaError =>
  Object.freeze({ kind: "error", code, message });
type Limits = Required<FormulaLimits>;
type Token = {
  kind: "number" | "string" | "ref" | "local" | "name" | "operator";
  value: string;
};
type Ast =
  | { type: "literal"; value: FormulaValue }
  | { type: "ref"; cell: FormulaCell | null }
  | { type: "range"; cells: FormulaCell[] }
  | { type: "unary"; op: string; child: Ast }
  | { type: "binary"; op: string; left: Ast; right: Ast }
  | { type: "call"; name: string; args: Ast[] };
interface Formula {
  expression: string;
  ast?: Ast;
  parseError?: FormulaError;
  dependencies: Set<string>;
}
class ParseFailure {
  constructor(readonly failure: FormulaError) {}
}

function tokenize(expression: string, limits: Limits): Token[] {
  if (expression.length > limits.maxFormulaLength)
    throw new ParseFailure(error("LIMIT", "Formula length limit exceeded"));
  const input = expression.startsWith("=") ? expression.slice(1) : expression;
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < input.length) {
    if (/\s/u.test(input[offset])) {
      offset++;
      continue;
    }
    const remaining = input.slice(offset);
    const rules: [Token["kind"], RegExp][] = [
      ["string", /^"(?:[^"\r\n]|"")*"/u],
      ["local", /^\[[^\]\r\n]+\]/u],
      ["number", /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu],
      ["ref", /^\$?[A-Za-z]+\$?\d+(?![A-Za-z0-9_])/u],
      ["name", /^[A-Za-z_][A-Za-z0-9_]*/u],
      ["operator", /^(?:<=|>=|<>|!=|==|[+*/(),:\-=<>])/u],
    ];
    let matched = false;
    for (const [kind, pattern] of rules) {
      const match = pattern.exec(remaining);
      if (!match) continue;
      tokens.push({ kind, value: match[0] });
      offset += match[0].length;
      matched = true;
      break;
    }
    if (!matched)
      throw new ParseFailure(
        error("PARSE", `Unexpected character at position ${offset}`),
      );
    if (tokens.length > limits.maxTokens)
      throw new ParseFailure(error("LIMIT", "Formula token limit exceeded"));
  }
  return tokens;
}

class Parser {
  private cursor = 0;
  private depth = 0;
  private rangeCells = 0;
  readonly dependencies = new Map<string, FormulaCell>();
  constructor(
    private tokens: Token[],
    private cell: FormulaCell,
    private rowIds: readonly string[],
    private columnIds: readonly string[],
    private limits: Limits,
  ) {}
  private fail(code: FormulaErrorCode, message: string): never {
    throw new ParseFailure(error(code, message));
  }
  private peek(value: string) {
    return this.tokens[this.cursor]?.value === value;
  }
  private consume(value: string) {
    if (!this.peek(value)) this.fail("PARSE", `Expected ${value}`);
    this.cursor++;
  }
  private resolve(address: string): {
    cell: FormulaCell | null;
    row: number;
    column: number;
  } {
    const match = /^\$?([A-Za-z]+)\$?(\d+)$/u.exec(address)!;
    let column = 0;
    for (const char of match[1].toUpperCase()) {
      column = column * 26 + char.charCodeAt(0) - 64;
      if (!Number.isSafeInteger(column)) break;
    }
    const row = Number(match[2]) - 1;
    column--;
    const cell =
      Number.isSafeInteger(row) &&
      row >= 0 &&
      row < this.rowIds.length &&
      Number.isSafeInteger(column) &&
      column < this.columnIds.length
        ? { rowId: this.rowIds[row], columnId: this.columnIds[column] }
        : null;
    return { cell, row, column };
  }
  private remember(cell: FormulaCell | null) {
    if (cell) this.dependencies.set(formulaCellKey(cell), cell);
  }
  parse(): Ast {
    if (!this.tokens.length) this.fail("PARSE", "Formula is empty");
    const ast = this.comparison();
    if (this.cursor !== this.tokens.length)
      this.fail("PARSE", "Unexpected trailing token");
    return ast;
  }
  private comparison(): Ast {
    let ast = this.add();
    while (
      ["=", "==", "!=", "<>", "<", ">", "<=", ">="].includes(
        this.tokens[this.cursor]?.value,
      )
    ) {
      const op = this.tokens[this.cursor++].value;
      ast = { type: "binary", op, left: ast, right: this.add() };
    }
    return ast;
  }
  private add(): Ast {
    let ast = this.multiply();
    while (this.peek("+") || this.peek("-")) {
      const op = this.tokens[this.cursor++].value;
      ast = { type: "binary", op, left: ast, right: this.multiply() };
    }
    return ast;
  }
  private multiply(): Ast {
    let ast = this.primary();
    while (this.peek("*") || this.peek("/")) {
      const op = this.tokens[this.cursor++].value;
      ast = { type: "binary", op, left: ast, right: this.primary() };
    }
    return ast;
  }
  private primary(): Ast {
    if (++this.depth > this.limits.maxDepth)
      this.fail("LIMIT", "Formula nesting limit exceeded");
    try {
      const token = this.tokens[this.cursor++];
      if (!token) this.fail("PARSE", "Expected a value");
      if (token.value === "+" || token.value === "-")
        return { type: "unary", op: token.value, child: this.primary() };
      if (token.value === "(") {
        const ast = this.comparison();
        this.consume(")");
        return ast;
      }
      if (token.kind === "number") {
        const value = Number(token.value);
        if (!Number.isFinite(value)) this.fail("VALUE", "Number is not finite");
        return { type: "literal", value };
      }
      if (token.kind === "string")
        return {
          type: "literal",
          value: token.value.slice(1, -1).replaceAll('""', '"'),
        };
      if (token.kind === "local") {
        const columnId = token.value.slice(1, -1),
          cell = this.columnIds.includes(columnId)
            ? { rowId: this.cell.rowId, columnId }
            : null;
        this.remember(cell);
        return { type: "ref", cell };
      }
      if (token.kind === "ref") {
        const first = this.resolve(token.value);
        if (!this.peek(":")) {
          this.remember(first.cell);
          return { type: "ref", cell: first.cell };
        }
        this.cursor++;
        const lastToken = this.tokens[this.cursor++];
        if (lastToken?.kind !== "ref")
          this.fail("PARSE", "Expected range end cell");
        const last = this.resolve(lastToken.value);
        if (!first.cell || !last.cell) return { type: "ref", cell: null };
        const startRow = Math.min(first.row, last.row),
          endRow = Math.max(first.row, last.row);
        const startColumn = Math.min(first.column, last.column),
          endColumn = Math.max(first.column, last.column);
        const count = (endRow - startRow + 1) * (endColumn - startColumn + 1);
        this.rangeCells += count;
        if (
          !Number.isSafeInteger(count) ||
          this.rangeCells > this.limits.maxRangeCells
        )
          this.fail("LIMIT", "Formula range cell limit exceeded");
        const cells: FormulaCell[] = [];
        for (let row = startRow; row <= endRow; row++)
          for (let column = startColumn; column <= endColumn; column++) {
            const cell = {
              rowId: this.rowIds[row],
              columnId: this.columnIds[column],
            };
            cells.push(cell);
            this.remember(cell);
          }
        return { type: "range", cells };
      }
      if (token.kind === "name") {
        const name = token.value.toUpperCase();
        if (!this.peek("(")) {
          if (name === "TRUE" || name === "FALSE")
            return { type: "literal", value: name === "TRUE" };
          this.fail("NAME", `Unknown name: ${token.value}`);
        }
        this.cursor++;
        const args: Ast[] = [];
        if (!this.peek(")")) {
          args.push(this.comparison());
          while (this.peek(",")) {
            this.cursor++;
            args.push(this.comparison());
          }
        }
        this.consume(")");
        return { type: "call", name, args };
      }
      return this.fail(
        "PARSE",
        "Expected a number, string, reference or function",
      );
    } finally {
      this.depth--;
    }
  }
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
    try {
      const parser = new Parser(
        tokenize(expression, this.limits),
        cell,
        this.rowIds,
        this.columnIds,
        this.limits,
      );
      formula.ast = parser.parse();
      for (const [dependencyKey, dependencyCell] of parser.dependencies) {
        this.remember(dependencyCell);
        formula.dependencies.add(dependencyKey);
        const dependents = this.dependents.get(dependencyKey) ?? new Set();
        dependents.add(key);
        this.dependents.set(dependencyKey, dependents);
      }
    } catch (failure) {
      formula.parseError =
        failure instanceof ParseFailure
          ? failure.failure
          : error("PARSE", "Invalid formula");
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
        formula.parseError ?? this.compute(formula.ast!, stack, budget, 0);
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
  private numeric(value: FormulaResult): number | FormulaError {
    if (isFormulaError(value)) return value;
    if (value === null) return 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    return typeof value === "number"
      ? value
      : error("VALUE", "Arithmetic requires numeric values");
  }
  private compute(
    ast: Ast,
    stack: Set<string>,
    budget: { steps: number },
    depth: number,
  ): FormulaResult {
    if (
      ++budget.steps > this.limits.maxEvaluationSteps ||
      depth > this.limits.maxDepth
    )
      return error("LIMIT", "Formula evaluation limit exceeded");
    const evaluate = (node: Ast) =>
      this.compute(node, stack, budget, depth + 1);
    if (ast.type === "literal") return ast.value;
    if (ast.type === "ref")
      return ast.cell
        ? this.resolve(ast.cell, stack, budget)
        : error("REF", "Cell reference is out of bounds");
    if (ast.type === "range")
      return error("VALUE", "Ranges are only supported as aggregate arguments");
    if (ast.type === "unary") {
      const value = this.numeric(evaluate(ast.child));
      return isFormulaError(value) ? value : ast.op === "-" ? -value : value;
    }
    if (ast.type === "binary") {
      const left = evaluate(ast.left);
      if (isFormulaError(left)) return left;
      const right = evaluate(ast.right);
      if (isFormulaError(right)) return right;
      if (["=", "==", "<>", "!="].includes(ast.op)) {
        const same = left === right;
        return ast.op === "=" || ast.op === "==" ? same : !same;
      }
      if (["<", ">", "<=", ">="].includes(ast.op)) {
        if (typeof left !== typeof right || left === null || right === null)
          return error(
            "VALUE",
            "Ordered comparisons require matching nonblank value types",
          );
        if (ast.op === "<") return left < right;
        if (ast.op === ">") return left > right;
        if (ast.op === "<=") return left <= right;
        return left >= right;
      }
      const a = this.numeric(left),
        b = this.numeric(right);
      if (isFormulaError(a)) return a;
      if (isFormulaError(b)) return b;
      if (ast.op === "/" && b === 0) return error("DIV0", "Division by zero");
      const result =
        ast.op === "+"
          ? a + b
          : ast.op === "-"
            ? a - b
            : ast.op === "*"
              ? a * b
              : a / b;
      return Number.isFinite(result)
        ? result
        : error("VALUE", "Arithmetic result is not finite");
    }
    if (ast.name === "IF") {
      if (ast.args.length !== 3)
        return error("VALUE", "IF requires exactly three arguments");
      const condition = evaluate(ast.args[0]);
      if (isFormulaError(condition)) return condition;
      return evaluate(ast.args[condition ? 1 : 2]);
    }
    if (!["SUM", "AVG", "AVERAGE", "MIN", "MAX", "COUNT"].includes(ast.name))
      return error("NAME", `Unknown function: ${ast.name}`);
    const values: number[] = [];
    for (const arg of ast.args) {
      if (arg.type === "range") {
        for (const cell of arg.cells) {
          const value = this.resolve(cell, stack, budget);
          if (isFormulaError(value)) return value;
          if (typeof value === "number") values.push(value);
        }
      } else {
        const value = evaluate(arg);
        if (isFormulaError(value)) return value;
        if (typeof value === "number") values.push(value);
      }
    }
    if (ast.name === "COUNT") return values.length;
    if (!values.length)
      return ast.name === "SUM"
        ? 0
        : error("VALUE", `${ast.name} requires at least one numeric value`);
    if (ast.name === "MIN") return values.reduce((a, b) => Math.min(a, b));
    if (ast.name === "MAX") return values.reduce((a, b) => Math.max(a, b));
    const sum = values.reduce((a, b) => a + b, 0),
      result = ast.name === "SUM" ? sum : sum / values.length;
    return Number.isFinite(result)
      ? result
      : error("VALUE", "Aggregate result is not finite");
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
