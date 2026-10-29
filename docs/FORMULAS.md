# Formula dependency engine

`FormulaEngine` is an original, framework-neutral, synchronous spreadsheet expression engine. It parses formulas into an AST, records cell dependencies, memoizes calculations, invalidates affected dependents, and reports typed errors. It never evaluates JavaScript.

This engine expands the older row-local `evaluateFormula(expression, resolve)` helper. The helper remains a separate small arithmetic utility; it does not provide dependency tracking.

## Quick start

```ts
import { FormulaEngine, isFormulaError } from "@opengrid/core";

const rows = [
  { id: "apple", price: 2, quantity: 4, total: null },
  { id: "pear", price: 3, quantity: 5, total: null },
];
const engine = new FormulaEngine({
  rowIds: rows.map((row) => row.id),
  columnIds: ["price", "quantity", "total"],
  getRawValue: (rowId, columnId) => {
    const row = rows.find((row) => row.id === rowId)!;
    return row[columnId as keyof typeof row];
  },
});

const appleTotal = { rowId: "apple", columnId: "total" };
engine.setFormula(appleTotal, "=[price] * [quantity]");
engine.setFormula({ rowId: "pear", columnId: "total" }, "=A2 * B2");
engine.evaluate(appleTotal); // 8

rows[0].price = 7;
engine.invalidate([{ rowId: "apple", columnId: "price" }]);
engine.evaluate(appleTotal); // 28; affected dependents recomputed

const result = engine.evaluate(appleTotal);
if (isFormulaError(result)) console.error(result.code, result.message);
```

The application owns the raw row store. Update it before calling `invalidate(changedCells)`. There is no `setValue` method or automatic observation of external object mutations. Calling `invalidate()` without arguments clears all calculation caches. `recalculate()` evaluates all registered formulas, retaining unaffected memoized values.

## Explicit opt-in

Only expressions registered with `setFormula` execute. A raw provider value such as `'=1+2'` remains a string. Grid editing, clipboard input, CSV imports and arbitrary user text do not automatically become formulas. The grid adapter may add an explicit formula-enabled column or editor, but this standalone engine does not silently change editing or export behavior.

## Language

| Syntax                                         | Meaning                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `1`, `.5`, `1.2e3`                             | Finite JavaScript numbers                                                   |
| `+ - * /`, unary `+ -`, `(...)`                | Arithmetic with usual precedence; same-precedence operations associate left |
| `A1`, `$A$1`, `a1`                             | Case-insensitive positional cell references                                 |
| `[price]`                                      | Current-row reference to exact stable column ID `price`                     |
| `A1:B5`, `$B$5:$A$1`                           | Inclusive rectangular ranges; reversed bounds are normalized                |
| `SUM`, `AVG`, `AVERAGE`, `MIN`, `MAX`, `COUNT` | Case-insensitive built-in aggregate functions                               |
| `IF(condition, then, otherwise)`               | Exactly three arguments; only the chosen result branch evaluates            |
| `=`, `==`, `<>`, `!=`, `<`, `>`, `<=`, `>=`    | Comparisons, with lower precedence than arithmetic                          |
| `TRUE`, `FALSE`                                | Boolean constants                                                           |
| `"text"`, `"say ""hello"""`                    | String constants with doubled-quote escaping                                |

An initial `=` is optional. Ranges are supported as aggregate arguments, not as standalone scalar expressions. Arguments can combine scalar expressions and ranges: `SUM(A1:B2, [tax], 3)`. Dependencies include both `IF` branches so later changes invalidate correctly; runtime errors or self references in the unused branch do not execute. Parse and resource-budget errors still reject the whole expression.

Arithmetic accepts finite numbers, converts booleans to `1`/`0`, and treats blank (`null`/`undefined`) as zero. Numeric strings are not coerced. Aggregate functions include only numeric values; text, booleans and blanks are ignored, while referenced formula errors propagate. `COUNT` counts numeric values, unlike the grid's row-count aggregation. `SUM()` returns `0`; empty numeric input for `AVG`, `MIN` or `MAX` returns `VALUE`. All computations use JavaScript number precision. BigInt, dates, objects, NaN and infinities are unsupported raw calculation values.

Equality compares exact types and values. Ordered comparisons require matching nonblank types. String ordering is JavaScript lexical ordering. `IF` conditions use truthiness: zero, blank, empty string and `FALSE` choose the third argument; nonempty strings, other numbers and `TRUE` choose the second. Displaying returned strings is the application's responsibility; render them as text.

## Stable identity and reference positions

Every API cell is `{ rowId, columnId }`, using stable IDs. `formulaCellKey(cell)` produces an unambiguous JSON tuple suitable for maps, diagnostics and persistence records.

The constructor copies the ordered `rowIds` and `columnIds`. `A1` binds to their first row and column; `$A$1` binds to the same cell. Sorting, filtering or changing a display viewport outside the engine does not retarget existing references. Row-local references use the target formula row ID and exact column ID.

The `$` marker is accepted syntax; this engine has no relative-reference copy/fill rewriting. There is no insert/delete/move API. Reconstruct an engine for structural changes, and explicitly migrate formulas and references in the application. Reinstalling `A1` against a newly ordered constructor list can point to a different stable cell. The engine does not implicitly rewrite expressions to preserve identity across that reconstruction.

## API

| Method                                    | Result and behavior                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `new FormulaEngine(options)`              | Requires unique nonempty row IDs, column IDs and a synchronous raw-value provider                                               |
| `setFormula(cell, expression)`            | Replaces the formula, updates graph edges, invalidates dependents, publishes a snapshot; returns a parse/limit error if present |
| `removeFormula(cell)`                     | Removes the formula and graph edges, invalidates dependents; the cell then reads from the raw provider                          |
| `getFormula(cell)`                        | Original registered expression or `undefined`                                                                                   |
| `evaluate(cell)`                          | `number \| string \| boolean \| null \| FormulaError`; memoized until invalidation                                              |
| `invalidate(cells?)`                      | Invalidates changed cells and transitive dependents, or all cached calculations if omitted                                      |
| `recalculate()`                           | Returns `ReadonlyMap<cellKey, FormulaResult>` for all registered formulas                                                       |
| `getDependencies(cell)`                   | Detached cell objects for direct static references; ranges expand into cells                                                    |
| `getDependents(cell, transitive = false)` | Detached dependent cells; transitive traversal terminates safely across cycles                                                  |
| `getSnapshot()`                           | Stable frozen `{ version, errors }` snapshot until a mutation or diagnostic change                                              |
| `subscribe(listener)`                     | Registers a listener and returns an unsubscribe callback                                                                        |

Parse failures remain registered formulas and evaluate to typed errors. Invalid target cells return `REF` without registering. Raw provider failures become a generic `VALUE` diagnostic; provider exception text is not exposed. Formula changes detach old dependency edges, and targeted invalidation retains unrelated caches.

`getSnapshot` and `subscribe` are bound callbacks compatible with external-store subscription APIs. `errors` maps `formulaCellKey` to errors from evaluated cells. Evaluation publishes only when diagnostics change; a repeated cached evaluation preserves snapshot identity. Limit failures are reported but not memoized as permanent cell results, since a shorter independent dependency path can succeed. Invalidation clears affected diagnostics.

```ts
type FormulaError = {
  readonly kind: "error";
  readonly code:
    "CYCLE" | "REF" | "DIV0" | "VALUE" | "NAME" | "LIMIT" | "PARSE";
  readonly message: string;
};
```

These errors are data, not thrown evaluation exceptions. Constructor misconfiguration throws `TypeError` or `RangeError` because it is an application configuration mistake.

## Resource boundaries

Defaults, configurable through `options.limits`:

| Option               |                                                                Default |
| -------------------- | ---------------------------------------------------------------------: |
| `maxFormulaLength`   |                                                      16,384 characters |
| `maxTokens`          |                                                           2,048 tokens |
| `maxRangeCells`      | 10,000 referenced range cells per expression, counting repeated ranges |
| `maxDepth`           |                                 64 parser/evaluation/dependency levels |
| `maxEvaluationSteps` |                                      100,000 steps per root evaluation |

Limits must be positive safe integers. The raw-value provider is trusted application code and runs synchronously; its own execution duration cannot be bounded by this parser. Workbook size and formula count remain application-managed. The engine has no network, filesystem, property-access, assignment, template-literal, dynamic-function or custom-function language features.

## Validation and parity boundary

`formula-engine.test.ts` covers arithmetic and precedence; scalar and range references; absolute/local references; lazy conditions; cross-row dependency chains; diamond-graph memoization; selective invalidation; replaced/removed edges; cycle detection and recovery; immutable subscription snapshots; invalid inputs; injection attempts; and parser, range and evaluation budgets.

AG Grid v36.2.0 documents spreadsheet-style formulas and its formula editor as Enterprise features. Those public descriptions informed the feature inventory; this implementation and syntax are original. See [AG Grid Formulas](https://www.ag-grid.com/react-data-grid/formulas/).

This module supplies a working standalone dependency engine. It does not establish full AG Grid or Excel compatibility. The separate [editable formula-grid adapter](FORMULA_GRID.md) supplies raw-expression cell editing, computed pipeline values and shared atomic history with fixed sheet identities. Rich autocomplete/reference highlighting, fill/copy adjustment, structural rewrites, named ranges, sheet-qualified references, custom functions, locale-specific syntax, date functions and Excel expression serialization remain open.
