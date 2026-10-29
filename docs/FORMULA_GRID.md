# Editable formula grids

`createFormulaGrid` connects explicit per-cell expressions to the real client model. Computed results drive sorting, filters, grouping, aggregation, Find, charts and exports. Raw literals and expressions remain in field-backed rows and share the model's atomic edit history. This is a bounded fixed-sheet adapter, separate from the standalone [formula engine](FORMULAS.md) and same-row [calculated columns](CALCULATED_COLUMNS.md).

The public [AG Grid formula documentation](https://www.ag-grid.com/react-data-grid/formulas/) is a feature reference. OpenGrid has its own input representation, reference bindings, editor and supported language; no drop-in syntax or API compatibility is promised.

```tsx
import {
  createFormulaGrid,
  formulaInput,
  type FormulaGridInput,
} from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

interface Product {
  id: string;
  price: number;
  quantity: number;
  total: FormulaGridInput;
}
const { model, formulas } = createFormulaGrid<Product>({
  rows: [
    { id: "apple", price: 2, quantity: 4, total: formulaInput("=A1*B1") },
    { id: "pear", price: 3, quantity: 5, total: formulaInput("=A2*B2") },
  ],
  columns: [
    { id: "price", field: "price", type: "number", editable: true },
    { id: "quantity", field: "quantity", type: "number", editable: true },
    { id: "total", field: "total", type: "number", editable: true },
  ],
  formulaColumns: ["total"],
  getRowId: (row) => row.id,
});

// The registered model is recognized automatically; no renderer callback is needed.
<DataGrid model={model} />;
formulas.getFormula({ rowId: "apple", columnId: "total" }); // =A1*B1
formulas.getResult({ rowId: "apple", columnId: "total" }); // 8
```

Keep the factory result stable, for example with a component state initializer or memo. `DataGrid.formulas` may explicitly supply the same model's controller; a controller belonging to another model is rejected. Omitting that prop does not downgrade a registered model to ordinary editing or replace expressions with their calculated displays.

## Explicit inputs and result types

`formulaInput(expression)` creates a frozen `{ kind: "formula", expression }` atom. `FormulaGridInput` is that atom or a finite number, string, boolean or null. Ordinary strings beginning with `=` remain literal data. Opening a cell does not execute them, and paste/import does not infer expressions from prefixes. Applications importing tagged expressions deliberately opt in to this representation; valid unfrozen atoms are detached and frozen without freezing borrowed row objects. Malformed objects, accessor atoms, extra properties and unsupported prototypes are rejected.

Formula columns require ordinary raw fields, without `valueGetter`; at most 64 columns may be enabled. Declared `number`, `text` and `boolean` result types are enforced: incompatible formula results become typed `VALUE` errors. Leave the column type unspecified when it intentionally permits mixed formula result types. BigInt/date formula columns and non-scalar calculation values are unsupported. Non-formula columns retain their existing parsers/getters/formatters.

The adapter uses the existing safe parser/evaluator without calling public FormulaEngine diagnostic publication from a getter. Supported arithmetic, local `[columnId]` references, A1/range references, lazy IF, aggregate functions and resource limits are described in the language guide. No JavaScript evaluation, global lookup, property access or I/O is available.

## Cell editing and history

F2/Enter, double-click, guarded double-tap or the Edit cell action opens a raw draft. Existing atoms seed Formula mode with their original expression; literals seed Literal mode. Typing to replace a cell starts a literal draft. The mode selector is explicit: changing it preserves draft text and does not commit or add/remove an equals prefix. Alt+M focuses the selector; Enter there returns to the text input, and Escape cancels. Enter/Tab in the input follow normal grid commit/navigation policy. Moving focus between the mode selector and input does not blur-commit.

Invalid syntax, resource failures and validation rejection leave the raw draft visible with the old model value/history intact. Entering the same exact expression is a no-op. A batch whose final expression returns to its original text is also a no-op. Accepted literal/formula edits use the same chronological Undo/Redo history as ordinary fields. Source edits update dependent computed cells; undo restores both raw input and dependent results.

The built-in formula editor owns enabled columns even when a normal `renderEditor` or rich editor configuration is supplied. It uses plain text in both modes; the model parses committed literals. Full-row sessions/dialogs explicitly reject registered formula models until their UI can represent raw atoms safely. Cell editing remains supported. Language and direction changes preserve the active editor's DOM, mode, raw draft and focus.

## Controller and atomic validation

The returned object contains `model` and `formulas: FormulaGridController<T>`. `getFormulaGridController(model)` is a read-only identity registry lookup. The controller provides:

| Method                         | Contract                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `supportsColumn(id)`           | Whether that column accepts explicit formula atoms.                                           |
| `getInput(cell)`               | Raw normalized literal/atom for an enabled cell; undefined for a missing or unsupported cell. |
| `getFormula(cell)`             | Original expression text, or undefined for a literal.                                         |
| `getResult(cell)`              | Computed scalar or typed error; source cells can also be read.                                |
| `setFormula(cell, expression)` | Validated formula edit; returns an error string or undefined.                                 |
| `setLiteral(cell, value)`      | Validated literal edit through the existing column parser.                                    |
| `batchInputs(edits)`           | One atomic batch of literal/formula field edits and one Undo unit.                            |
| `expire()`                     | Clears both formula/base value caches and emits one model update.                             |
| `dispose()`                    | Clears owned caches; registration and later reads/writes remain valid for Strict Mode reuse.  |

```ts
const error = formulas.batchInputs([
  { rowId: "apple", columnId: "price", value: 5 },
  { rowId: "apple", columnId: "total", value: formulaInput("=A1*B1+1") },
]);
// Both inputs commit, or neither commits. The resulting total is 21.
```

Existing `column.validate(value, row)` retains its **raw** field contract: an explicit expression is an atom, not its calculated value. Use `validateFormulaResult(result, context)` for computed constraints. The context contains the cell, raw input, final staged row and a `getResult(cell)` reader over the same complete candidate sheet. Validation checks candidate formulas, plus explicitly edited enabled-column literals; replacement checks the enabled sheet. A source edit cannot bypass a dependent formula's result constraint. Construction checks input syntax/shape/budgets; initial result constraints remain application-owned, as with initial raw column validation.

```ts
validateFormulaResult: (result, context) => {
  if (
    context.cell.columnId === "total" &&
    typeof result === "number" &&
    result < 0
  ) {
    return "Total cannot be negative";
  }
};
```

Syntax, sheet-construction budgets and exceeded candidate-validation work reject a write. Runtime errors such as division by zero, cycles, evaluation `LIMIT`, invalid references or result-type mismatches may remain stored and inspectable; the result callback can explicitly reject them. Rejection leaves source rows, applied state, history and model notifications unchanged. Pure validation/getter callbacks must not mutate the model. Candidate compilation may update bounded internal program caches without changing the committed sheet.

## Errors, caches and references

`getResult` preserves typed errors (`CYCLE`, `REF`, `DIV0`, `VALUE`, `NAME`, `LIMIT`, `PARSE`). `model.getValue` projects errors to null, following calculated-column behavior, so existing sort/filter/aggregate/Set List pipelines keep scalar contracts. Generated formatters display the error code; grid cells expose a description, error marker and tooltip. Null projection means an errored result can share a blank filter bucket; consult the controller/inspector for its diagnostic. Original application formatter output is retained for successful results.

Evaluation is silent with respect to model subscriptions. Snapshot changes conservatively refresh the sheet; unchanged compiled programs may be reused. Explicit expiry refreshes pure getter closure dependencies. Provider failures are not retained as durable computed results; transient reads can recover. Result/program/dependency caches and evaluation-local memoization are bounded. Foreign-row reads use their explicit overlay and share reentrant cycle/work guards, without replacing committed source rows.

A1 references bind to the constructor's ordered stable row and column IDs. Sorting, filtering, hiding, pinning and managed row reordering do not retarget them. `setRows` and value-only transactions require the same identity set; structural additions/removals reject before mutation. Reconstruct the factory for a new sheet. Inserting/deleting rows or columns with reference rewriting is not implemented.

## Bounds and integration limits

`formulaGridLimits` can lower the hard caps below. Unknown/non-integer/out-of-range limits reject; language limits may only lower their defaults.

| Resource                                  | Default/hard maximum |
| ----------------------------------------- | -------------------: |
| Sheet cells; resident rows                |         100,000 each |
| Schema columns; enabled formula columns   |            1,024; 64 |
| Active formulas; compiled program entries |          10,000 each |
| Dependency edges                          |              100,000 |
| Total expression text                     | 1,000,000 characters |
| Batch edits                               |              100,000 |
| Aggregate candidate validation work       |      1,000,000 steps |
| Cached results                            |              100,000 |

Per-expression limits are 16,384 characters, 2,048 tokens, 10,000 range cells, depth 64 and 100,000 evaluation steps. Aggregate validation also enforces its remaining budget during an individual read. These are functional bounds, not published latency/memory benchmarks.

Copy, Find, charts and ordinary exports consume computed/formatted values. Ordinary paste and fill write literals through destination column parsers; fill leaves its source region intact. They do not copy formula atoms or rewrite relative references. CSV still neutralizes literal formula prefixes. Workbook expression export/import, reference-aware clipboard/fill, formula completion/highlighting and cell-range authoring tools, named/sheet references, custom function registration, backend calculation, structural migration and full-row formula editing remain open.

Open **Formula grid lab** in the [interactive demo](https://mr-rafiq.github.io/opengrid/demo/) for the fixed 12-row sheet, source/raw/result inspector, computed Total set list, grouping, typed cycle recovery and English/Spanish/RTL switches. A–G are Record, Units, Price, Total, Analysis, Note and Region; initial totals are 6, 12 and 20, and E1 is 38. F1 is deliberately the literal string `=1+2`. See the [parity ledger](FEATURE_PARITY.md), [remaining gaps](GAP_INVENTORY.md) and [executed verification](VERIFICATION.md).
