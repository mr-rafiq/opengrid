/** Deliberately small arithmetic language: numbers, [column] refs, + - * /, (), SUM/MIN/MAX/AVG.
 * No JavaScript evaluation. Row references, ranges, strings and spreadsheet compatibility are unsupported.
 */
export function evaluateFormula(
  expression: string,
  resolve: (columnId: string) => number,
): number {
  const input = expression.startsWith("=") ? expression.slice(1) : expression;
  if (input.length > 4096) throw new Error("Formula too long");
  const tokens: string[] = [];
  let offset = 0;
  while (offset < input.length) {
    const match =
      /^(?:\s+|\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|\[[^\]\r\n]+\]|[A-Za-z]+|[+*/(),-])/i.exec(
        input.slice(offset),
      );
    if (!match) throw new Error(`Invalid formula token at ${offset}`);
    offset += match[0].length;
    if (match[0].trim()) tokens.push(match[0]);
  }
  let cursor = 0,
    depth = 0;
  function primary(): number {
    if (++depth > 64) throw new Error("Formula nesting limit exceeded");
    const token = tokens[cursor++];
    let result: number;
    if (token === "-" || token === "+")
      result = (token === "-" ? -1 : 1) * primary();
    else if (token === "(") {
      result = add();
      if (tokens[cursor++] !== ")")
        throw new Error("Expected closing parenthesis");
    } else if (token?.startsWith("[")) result = resolve(token.slice(1, -1));
    else if (token && /^\d|^\./.test(token)) result = Number(token);
    else if (
      token &&
      ["SUM", "MIN", "MAX", "AVG"].includes(token.toUpperCase())
    ) {
      if (tokens[cursor++] !== "(")
        throw new Error("Expected function arguments");
      const args = [add()];
      while (tokens[cursor] === ",") {
        cursor++;
        args.push(add());
      }
      if (tokens[cursor++] !== ")")
        throw new Error("Expected closing parenthesis");
      const sum = args.reduce((a, b) => a + b, 0);
      result =
        token.toUpperCase() === "MIN"
          ? Math.min(...args)
          : token.toUpperCase() === "MAX"
            ? Math.max(...args)
            : token.toUpperCase() === "AVG"
              ? sum / args.length
              : sum;
    } else throw new Error("Expected number, reference or supported function");
    depth--;
    if (!Number.isFinite(result))
      throw new Error("Formula result is not finite");
    return result;
  }
  function multiply(): number {
    let value = primary();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const op = tokens[cursor++];
      const right = primary();
      if (op === "/" && right === 0) throw new Error("Division by zero");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function add(): number {
    let value = multiply();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const op = tokens[cursor++];
      const right = multiply();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = add();
  if (cursor !== tokens.length) throw new Error("Unexpected trailing token");
  if (!Number.isFinite(value)) throw new Error("Formula result is not finite");
  return value;
}
