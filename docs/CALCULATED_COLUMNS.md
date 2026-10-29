# Compiled calculated columns

`createCalculatedGrid` adds read-only derived columns to a real client-side grid. Expressions compile once per column, bind same-row references by stable column ID, and reuse a bounded calculation cache across rows. Calculated results participate in actual model sorting, filtering, grouping, aggregation and export without writing derived properties into raw row data.

```tsx
import { useEffect, useMemo } from "react";
import { createCalculatedGrid } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

type Sale = { id: string; price: number; quantity: number; region: string };

export function Sales() {
  const grid = useMemo(
    () =>
      createCalculatedGrid<Sale>({
        rows: [
          { id: "order-1", price: 12, quantity: 3, region: "EU" },
          { id: "order-2", price: 8, quantity: 2, region: "US" },
        ],
        columns: [
          { id: "price", field: "price", type: "number", editable: true },
          { id: "quantity", field: "quantity", type: "number", editable: true },
          { id: "region", field: "region" },
        ],
        calculatedColumns: [
          {
            id: "total",
            expression: "[price] * [quantity]",
            type: "number",
            aggregate: "sum",
          },
          { id: "large", expression: "[total] >= 30", type: "boolean" },
          {
            id: "label",
            expression: 'IF([large],"Large order","Small order")',
            type: "text",
          },
        ],
        getRowId: (row) => row.id,
      }),
    [],
  );
  useEffect(() => () => grid.calculations.dispose(), [grid]);
  return <DataGrid model={grid.model} height={420} />;
}
```

Keep the factory result stable, as with an ordinary grid model. The adapter stylesheet is still required once in the application. Package names refer to source/local workspace packages until an npm release is explicitly published.

## API

```ts
type CalculatedColumn<T> = Omit<
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

interface CalculatedGridOptions<T> extends GridOptions<T> {
  calculatedColumns: readonly CalculatedColumn<T>[];
  calculationCacheMaxEntries?: number;
  calculationLimits?: Omit<FormulaLimits, "maxRangeCells">;
}

interface CalculatedGrid<T> {
  readonly model: GridModel<T>;
  readonly calculations: {
    getResult(rowId: string, columnId: string): FormulaResult;
    evaluate(row: T, columnId: string): FormulaResult;
    getDependencies(columnId: string): readonly string[];
    getDefinitions(): readonly CalculatedColumn<T>[];
    getStats(): Readonly<{ compiledPrograms: number; cacheEntries: number }>;
    expire(): void;
    dispose(): void;
  };
}
```

Calculated IDs must be unique nonempty strings and cannot replace a base column. Prototype-like IDs are supported safely. Metadata such as headers, widths, group paths, sorting/filtering flags, formatters and aggregate functions can be configured. Definitions are detached/frozen; group-path arrays are copied. Calculated fields cannot define a raw `field`, `valueGetter`, parser or validator, and cannot opt into editing or the generic getter cache. Their result type is checked after evaluation.

The returned `model` is produced by `createGrid`; it is not an independent display-only table. Existing grid APIs operate on those generated columns. Attempts to edit them reject through the normal read-only guard, including paste/fill and whole-row sessions.

## One shared language, two reference modes

The internal `formula-language.ts` module owns the tokenizer, parser and evaluator shared with `FormulaEngine`. The standalone engine retains its positional A1/range behavior and existing public API. Calculated columns compile into reusable programs with symbolic same-row bracket references instead of registering or parsing a formula for every row/cell.

Supported calculated expressions include:

- `[price] * [quantity]`, unary `+`/`-`, parentheses and arithmetic precedence.
- Chained calculated references such as `[subtotal] - [discount]`.
- `SUM`, `AVG`/`AVERAGE`, `MIN`, `MAX`, `COUNT` over scalar arguments.
- Comparisons, `TRUE`/`FALSE`, string literals and lazy `IF`.

Column IDs in brackets are exact and case-sensitive. Names such as `__proto__` remain plain IDs; expressions do not access object properties or globals. Positional references (`A1`, `$A$1`) and ranges reject in this mode, including references in an unused branch. A quoted string such as `"A1"` is ordinary text.

Every referenced column must exist in the fixed combined schema. Syntax, unknown bracket IDs and expression-budget failures throw `CalculatedColumnDefinitionError` at creation, exposing `columnId` and a typed `formulaError`. Other malformed schema/configuration errors throw `TypeError`/`RangeError`. Runtime conditions such as division by zero, type mismatches or an invoked unknown function return error data instead of throwing.

Static dependency lists include both `IF` branches. Runtime evaluation follows only the chosen branch, so `IF(FALSE,[self],7)` succeeds while an active circular reference returns `CYCLE`. An evaluation-local memo shares diamond inputs even when the bounded global cache evicts their entries. Reentrant base-getter cycles also terminate with a typed error.

No expression evaluates JavaScript. Raw strings beginning with `=` remain text unless they are explicitly configured as a calculated expression. There is no dynamic function registration, arbitrary property access, assignment, networking or filesystem language feature.

## Types and errors in the grid pipeline

Results are finite numbers, strings, booleans or blank (`null`). The declared calculated type must match a nonblank result; numeric strings do not silently become numeric results. The shared formula arithmetic treats booleans as `1`/`0` and blanks as zero, as documented in [Formulas](FORMULAS.md). BigInt, Date and compound-object formula inputs currently produce `VALUE` rather than lossy conversion. Base columns can still store/use those values normally outside a calculated expression.

`getResult(rowId, columnId)` resolves a resident row by stable ID and returns the typed value or `FormulaError`. Missing rows/columns return `REF`. `evaluate(row, columnId)` also supports nonresident objects, including separately supplied pinned rows, but does not reuse or populate canonical cached entries. A foreign object with the same ID cannot borrow a resident row's result.

Generated getters project calculation errors to `null`. This keeps typed sorting/filtering and numeric aggregation from receiving opaque error objects. Blank filters therefore include failed calculations. Numeric aggregates skip the projected null values; count retains its existing row-count semantics. Configured aggregation computes derived **leaf** values; a formula is not re-evaluated over synthetic group rows.

Generated formatters display errors as `#DIV/0!`, `#CYCLE!`, `#REF!`, `#VALUE!`, `#NAME?`, `#LIMIT!` or `#PARSE!`; `calculatedErrorLabel(error)` exposes the same labels. Successful values use the configured formatter, with the actual row context. CSV export includes those readable labels and existing formula-prefix safeguards. Other exporters reading `model.getValue` receive computed scalar values or nulls, with formatted output following their existing options. No Excel formula descriptors or automatic formula serialization are generated.

Base getter/provider exceptions become a generic `VALUE` error without exposing their exception text. These transient failures and their dependent results are not stored in the calculation LRU, allowing retries. Application formatter and subscription exceptions retain their ordinary grid behavior and may propagate; they are not swallowed as calculation errors.

## Bounded caching and lifecycle

The controller stores at most `calculationCacheMaxEntries` entries, default **100,000**, configurable from `1` to **1,000,000**. Entries include referenced base values and derived results across rows. Successful blank values and deterministic errors are cacheable; path/budget-dependent `LIMIT` results and provider failures are not. Keys use collision-safe stable row/column tuples and verify the canonical row object.

Each read checks the model's stable snapshot identity before consulting the LRU. Any model state change conservatively clears calculation entries. That includes edits/batches, undo/redo, transactions, row replacement, sorting/filtering and layout changes. Canonical row-reference checks additionally prevent stale-object reuse. Programs remain compiled throughout these changes.

The generic getter cache remains available for base columns through `valueCache` and `valueCacheMaxEntries`. `Column.valueCache: false` bypasses it for a particular getter; `true`/omission still follows the global opt-in. Generated calculated getters always opt out because a projected transient error is a successful null return that must not become stuck in the generic cache. The controller owns their bounded result cache instead. Normal base getters can retain their generic cache through state-only changes while the calculation layer invalidates conservatively.

For application/closure dependencies, update the dependency then expire explicitly:

```ts
exchangeRate = 1.25;
grid.calculations.expire();
// Clears calculation entries first, then expires the model cache and notifies once.
```

Calling `grid.model.expireValueCache()` directly also invalidates calculations through the changed model snapshot. Getters themselves never publish model or diagnostic state, avoiding synchronous subscription updates during React rendering. Errors are returned through `getResult` rather than an automatically published diagnostic store.

There are **no model subscriptions**, timers, workers or global resources owned by the controller. `dispose()` idempotently clears its cache; later reads remain valid and repopulate it. This deliberately supports React Strict Mode's setup/cleanup/setup sequence. Programs/definitions remain usable until the factory result is released. `getStats()` returns a frozen diagnostic record of compiled-program and current-cache counts; it is not a reactive store.

Getters and callbacks must remain pure. Mutating model-owned row objects or closure data in place is not observable automatically. Use model mutations or explicit expiry. Opaque callback dependencies cannot be inferred from a formula's static bracket-reference graph.

## Resource limits

The factory supports at most **64 calculated columns** and **1,024 total columns**. It does not allocate a formula graph for every row. Limits apply per compiled expression/root evaluation:

| Limit                | Default and maximum allowed by the factory |
| -------------------- | -----------------------------------------: |
| `maxFormulaLength`   |                          16,384 characters |
| `maxTokens`          |                                      2,048 |
| `maxDepth`           |                64 syntax/dependency levels |
| `maxEvaluationSteps` |                                    100,000 |

`calculationLimits` can lower these positive safe-integer bounds. Ranges are disabled, so no range-size option is accepted. Size limits bound parser/evaluator work; the synchronous application callbacks themselves remain trusted code with their own execution cost.

## Recreating a schema and persisting definitions

The schema is fixed for each factory instance. There is no fake in-place add/edit/remove API. An authoring UI should validate a candidate definition set by constructing a new instance, then explicitly swap models:

```ts
const replacement = createCalculatedGrid({
  ...originalOptions,
  rows: current.model.getRows(),
  initialState: current.model.getState(),
  calculatedColumns: nextDefinitions,
});
// Swap only after construction succeeds. The old instance remains untouched.
```

Recreation starts a new history; undo/redo cannot transfer through the current model API. Compatible layout/filter/selection state can be supplied explicitly. Removed columns follow the core's normalization rules; an advanced-filter expression still referencing a removed column rejects until the caller deliberately migrates or clears it. A runtime error column can be previewed through `getResult` before the UI chooses to keep it.

Persist calculated definitions separately from `GridState`. IDs, expressions, types and serializable metadata can round-trip as data. Formatter/aggregate callback functions are application code and need an application-owned registry/serialization policy. The factory does not serialize executable functions or silently restore schema from grid state.

## Verification and parity boundary

`calculated-grid.test.ts` covers compiled-once reuse; chained/diamond dependencies; actual sort/filter/quick-search/group/aggregate/CSV behavior; initial queries before model assignment; raw-data preservation; readonly protection; lazy/circular errors; type and provider failures; cache interoperability/invalidation/eviction; foreign/stale rows; publication-free getters; cleanup reuse; schema recreation; injection rejection and budgets. Existing FormulaEngine regression tests verify the shared parser/evaluator retains positional/range behavior. Core tests verify per-column getter-cache opt-out.

AG Grid v36.2.0 documents read-only same-row expressions and aggregation of calculated leaf results in [Calculated Columns](https://www.ag-grid.com/react-data-grid/calculated-columns/). This implementation and API are original. General Excel/AG Grid compatibility, cross-row calculated expressions, user schema/state restoration, reference rewriting, automatic remote calculation and asynchronous inputs remain separate work. The standalone raw-field `pivot` helper does not automatically consume these derived columns; an application projection or future integrated pivot model must explicitly supply their values.
