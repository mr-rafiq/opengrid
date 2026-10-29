import type {
  FormulaCell,
  FormulaError,
  FormulaErrorCode,
  FormulaLimits,
  FormulaResult,
  FormulaValue,
} from "./formula-engine.js";

export const isFormulaError = (value: unknown): value is FormulaError =>
  typeof value === "object" &&
  value !== null &&
  (value as FormulaError).kind === "error";
export const createFormulaError = (
  code: FormulaErrorCode,
  message: string,
): FormulaError => Object.freeze({ kind: "error", code, message });
const error = createFormulaError;
const formulaCellKey = (cell: FormulaCell) =>
  JSON.stringify([cell.rowId, cell.columnId]);
type Limits = Required<FormulaLimits>;
type Token = {
  kind: "number" | "string" | "ref" | "local" | "name" | "operator";
  value: string;
};
export type FormulaAst =
  | { type: "literal"; value: FormulaValue }
  | { type: "ref"; cell: FormulaCell | null }
  | { type: "column"; columnId: string }
  | { type: "range"; cells: FormulaCell[] }
  | { type: "unary"; op: string; child: FormulaAst }
  | { type: "binary"; op: string; left: FormulaAst; right: FormulaAst }
  | { type: "call"; name: string; args: FormulaAst[] };
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
  readonly columnDependencies = new Set<string>();
  constructor(
    private tokens: Token[],
    private cell: FormulaCell,
    private rowIds: readonly string[],
    private columnIds: readonly string[],
    private limits: Limits,
    private localOnly = false,
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
  parse(): FormulaAst {
    if (!this.tokens.length) this.fail("PARSE", "Formula is empty");
    const ast = this.comparison();
    if (this.cursor !== this.tokens.length)
      this.fail("PARSE", "Unexpected trailing token");
    return ast;
  }
  private comparison(): FormulaAst {
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
  private add(): FormulaAst {
    let ast = this.multiply();
    while (this.peek("+") || this.peek("-")) {
      const op = this.tokens[this.cursor++].value;
      ast = { type: "binary", op, left: ast, right: this.multiply() };
    }
    return ast;
  }
  private multiply(): FormulaAst {
    let ast = this.primary();
    while (this.peek("*") || this.peek("/")) {
      const op = this.tokens[this.cursor++].value;
      ast = { type: "binary", op, left: ast, right: this.primary() };
    }
    return ast;
  }
  private primary(): FormulaAst {
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
        if (this.localOnly) {
          const columnId = token.value.slice(1, -1);
          if (!this.columnIds.includes(columnId))
            this.fail("REF", `Unknown column: ${columnId}`);
          this.columnDependencies.add(columnId);
          return { type: "column", columnId };
        }
        const columnId = token.value.slice(1, -1),
          cell = this.columnIds.includes(columnId)
            ? { rowId: this.cell.rowId, columnId }
            : null;
        this.remember(cell);
        return { type: "ref", cell };
      }
      if (token.kind === "ref") {
        if (this.localOnly)
          this.fail(
            "PARSE",
            "Calculated columns accept same-row bracket references only",
          );
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
        const args: FormulaAst[] = [];
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

function numeric(value: FormulaResult): number | FormulaError {
  if (isFormulaError(value)) return value;
  if (value === null) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  return typeof value === "number"
    ? value
    : error("VALUE", "Arithmetic requires numeric values");
}

export interface FormulaProgram {
  readonly ast?: FormulaAst;
  readonly error?: FormulaError;
  readonly dependencies: readonly FormulaCell[];
  readonly columnDependencies: readonly string[];
}
export interface FormulaCompileContext {
  cell: FormulaCell;
  rowIds: readonly string[];
  columnIds: readonly string[];
  localOnly?: boolean;
}
/** One parser for positional cell formulas and reusable symbolic same-row programs. */
export function compileFormulaProgram(
  expression: string,
  context: FormulaCompileContext,
  limits: Limits,
): FormulaProgram {
  try {
    const parser = new Parser(
      tokenize(expression, limits),
      context.cell,
      context.rowIds,
      context.columnIds,
      limits,
      context.localOnly,
    );
    const ast = parser.parse();
    const queue: FormulaAst[] = [ast];
    for (let index = 0; index < queue.length; index++) {
      const node = queue[index];
      if (node.type === "binary") queue.push(node.left, node.right);
      if (node.type === "unary") queue.push(node.child);
      if (node.type === "call") {
        for (const argument of node.args) queue.push(argument);
        Object.freeze(node.args);
      }
      if (node.type === "range") {
        node.cells.forEach(Object.freeze);
        Object.freeze(node.cells);
      }
      if (node.type === "ref" && node.cell) Object.freeze(node.cell);
      Object.freeze(node);
    }
    return Object.freeze({
      ast,
      dependencies: Object.freeze(
        [...parser.dependencies.values()].map((cell) =>
          Object.freeze({ ...cell }),
        ),
      ),
      columnDependencies: Object.freeze([...parser.columnDependencies]),
    });
  } catch (failure) {
    return Object.freeze({
      error:
        failure instanceof ParseFailure
          ? failure.failure
          : error("PARSE", "Invalid formula"),
      dependencies: Object.freeze([]),
      columnDependencies: Object.freeze([]),
    });
  }
}
export interface FormulaEvaluationContext {
  limits: Limits;
  budget: { steps: number };
  resolveCell(cell: FormulaCell): FormulaResult;
  resolveColumn?(columnId: string): FormulaResult;
}
export function evaluateFormulaAst(
  ast: FormulaAst,
  context: FormulaEvaluationContext,
): FormulaResult {
  const budget = context.budget;
  function compute(ast: FormulaAst, depth: number): FormulaResult {
    if (
      ++budget.steps > context.limits.maxEvaluationSteps ||
      depth > context.limits.maxDepth
    )
      return error("LIMIT", "Formula evaluation limit exceeded");
    const evaluate = (node: FormulaAst) => compute(node, depth + 1);
    if (ast.type === "literal") return ast.value;
    if (ast.type === "column")
      return context.resolveColumn
        ? context.resolveColumn(ast.columnId)
        : error("REF", "No row-local resolver available");
    if (ast.type === "ref")
      return ast.cell
        ? context.resolveCell(ast.cell)
        : error("REF", "Cell reference is out of bounds");
    if (ast.type === "range")
      return error("VALUE", "Ranges are only supported as aggregate arguments");
    if (ast.type === "unary") {
      const value = numeric(evaluate(ast.child));
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
      const a = numeric(left),
        b = numeric(right);
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
          const value = context.resolveCell(cell);
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
  return compute(ast, 0);
}
