# Advanced boolean filters and external predicates

OpenGrid's client-side row pipeline supports nested `AND`, `OR` and `NOT` conditions. Advanced conditions reuse `matchesFilter`, so the existing column data types, null handling, BigInt precision and date comparison behavior remain consistent with per-column filters. Application callbacks can provide additional external predicates.

## Filter tree

```ts
import {
  AdvancedFilterValidationError,
  createGrid,
  type FilterExpression,
} from "@opengrid/core";

const expression: FilterExpression = {
  kind: "and",
  children: [
    {
      kind: "or",
      children: [
        {
          kind: "condition",
          columnId: "region",
          filter: { op: "equals", value: "EU" },
        },
        {
          kind: "condition",
          columnId: "revenue",
          filter: { op: "gte", value: "1000" },
        },
      ],
    },
    {
      kind: "not",
      child: {
        kind: "condition",
        columnId: "name",
        filter: { op: "startsWith", value: "test" },
      },
    },
  ],
};

const model = createGrid({ rows, columns, getRowId: (row) => row.id });
model.setAdvancedFilter(expression);
model.getFilteredRows();
model.setAdvancedFilter(null); // clear the tree
```

The complete AST is:

```ts
type FilterExpression =
  | { kind: "condition"; columnId: string; filter: Filter }
  | { kind: "and" | "or"; children: FilterExpression[] }
  | { kind: "not"; child: FilterExpression };
```

Logical groups require at least one child. `NOT` takes exactly one child. Conditions require a configured column with filtering enabled. Hidden columns can still participate. Unknown column IDs and columns with `filterable: false` are rejected.

## Composition and derived models

Per-column conditions, the advanced tree, the external predicate and quick-search terms all apply with `AND`. The pipeline checks per-column filters, the advanced tree, the external predicate, then quick search, using short-circuit evaluation. A rejected row need not invoke later callbacks or getters. Logical `AND` and `OR` also short-circuit their children in supplied order.

Sorting, grouping, aggregation and pagination operate on the filtered rows. Applying or clearing an advanced filter resets the page to zero and invalidates derived row caches. Edits, undo/redo, transactions and row replacement also recompute results under the active tree. Existing tree-data behavior can retain actual ancestor rows needed to display matching descendants.

## Operators and operands

| Operators                            | Required operands                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `contains`, `startsWith`, `endsWith` | String `value`; comparisons use the same case-insensitive string matcher as column filters |
| `equals`, `notEqual`                 | Scalar `value`, including explicit `null` or empty string                                  |
| `gt`, `gte`, `lt`, `lte`             | Nonblank scalar `value`                                                                    |
| `between`                            | Nonblank lower `value` and upper `to`, inclusive                                           |
| `in`                                 | Array `value`; an empty array is valid and matches no rows                                 |
| `blank`, `notBlank`                  | No operands                                                                                |

Only `between` accepts `to`. Unknown operators, extra node/filter properties, missing operands, nested operand objects and invalid operand types are rejected. The existing matcher defines blank as `null`, `undefined` or empty string. Operand validation does not reinterpret blanks as zero for ordered comparisons.

Values are validated against the condition's configured column type:

- `number`: finite numbers or nonblank numeric strings.
- `bigint`: integer strings, BigInt values, or safe-integer numbers. Use decimal strings for integers outside JavaScript's safe number range. No conversion through `Number` occurs when matching BigInt data.
- `date`: valid date strings or valid `Date` values. Numeric timestamps are not accepted as date operands.
- `boolean`: `true`, `false`, `'true'`, `'false'`, `1` or `0`.
- `text` or unspecified: JSON scalar values; ordered comparisons accept strings or numbers. Text-search operators always require a string operand.

BigInt operands become decimal strings and Date operands become ISO strings when stored, preserving typed matching while making the state JSON-compatible. Nonfinite numbers, undefined scalar operands and unsupported objects reject. Date parsing follows JavaScript `Date.parse`; prefer ISO dates and explicit time zones for reproducibility. Dates compare instants, without automatic day-level truncation. Text search uses raw cell values, as the existing per-column matcher does, rather than a separate formatted-value search.

## Atomic validation and immutable state

Both `setAdvancedFilter(tree)` and `setState({ advancedFilter: tree })` validate the entire tree before applying it. Invalid initial-state trees also reject during grid construction. Failures throw `AdvancedFilterValidationError`, a `TypeError` with `code`, `path` and a readable `message`:

```ts
try {
  model.setAdvancedFilter(draft);
} catch (error) {
  if (error instanceof AdvancedFilterValidationError) {
    // For example: advancedFilter.children[0].filter.value
    showValidationMessage(error.path, error.message);
  } else throw error;
}
```

Error codes are `SHAPE`, `COLUMN`, `OPERATOR`, `VALUE`, `LIMIT` and `CYCLE`. Invalid input leaves the previous snapshot reference, page, filtered/model caches and subscription state unchanged; listeners are not notified.

Accepted input is detached and deeply frozen, including nested nodes, child arrays, conditions and membership arrays. Mutating the original caller-owned draft after applying it cannot change active behavior. `GridState.advancedFilter` is optional, so older persisted states without the field continue to work. Pass `null` to clear a saved tree.

```ts
const saved = JSON.stringify(model.getState());
const restored = createGrid({
  rows,
  columns,
  getRowId: (row) => row.id,
  initialState: JSON.parse(saved),
});
```

Column definitions must still contain the tree's referenced filterable columns when restoring. Stale unknown references reject explicitly; they are not silently discarded.

## External predicates

```ts
let permittedIds = new Set(["order-1", "order-3"]);
const allowed = (row) => permittedIds.has(row.id);
const model = createGrid({
  rows,
  columns,
  getRowId: (row) => row.id,
  externalFilter: allowed,
});

permittedIds = new Set(["order-2"]);
model.setExternalFilter(allowed); // refresh after closure data changes
model.setExternalFilter((row) => row.status === "active"); // replace
model.setExternalFilter(); // remove
```

The callback receives each candidate row and returns a boolean. It remains application code outside serialized grid state. Restoring a snapshot does not restore authorization/business-rule callbacks; supply them separately when creating or configuring the model.

Predicates are synchronous. Exceptions propagate unchanged when invoked; the engine does not convert them into match-all or match-none behavior. Replacing a predicate validates it and computes the prospective row state before notification. If that computation throws, the previous predicate, snapshot and caches are retained. Listener exceptions remain ordinary application subscription errors after a committed change.

Changing values captured by a callback is not observable automatically. Call `setExternalFilter` again with the same callback to refresh and reset pagination. Use deterministic, side-effect-free callbacks; filtering can run again after any row/model change. Because filtering short-circuits, do not depend on a callback being invoked for every source row.

## Budgets and helper APIs

The grid validates with these fixed defaults:

| Budget                                           | Default |
| ------------------------------------------------ | ------: |
| Tree depth, root counted as one                  |      32 |
| Total visited nodes, including repeated subtrees |     512 |
| Values in one membership condition               |  10,000 |

Cycles, sparse arrays, accessor properties, symbol properties on node/filter objects, class instances and malformed shapes reject. Membership values and AST nodes are cloned without evaluating accessor properties. Operands are scalars, so there is no nested executable expression language, regular-expression engine or JavaScript evaluation.

`prepareAdvancedFilter(expression, columns, limits?)` exposes the same validation and immutable clone for preflight checks, with optional custom `maxDepth`, `maxNodes` and `maxSetValues`. Limits must be positive safe integers. A grid will still enforce its default budgets when applying that tree.

`evaluateFilterExpression(preparedTree, matchCondition)` walks a validated tree, delegating leaf checks to the supplied `(columnId, filter) => boolean` callback. It has no runtime import from the grid model and does not duplicate typed matching. Pass prepared/validated trees to this helper. `null` or `undefined` means no advanced constraint.

## Verification and parity boundary

`advanced-filters.test.ts` verifies nested logic; blanks, precise BigInt and dates; each existing operator; quick/column/external composition; pagination/group aggregation; edits/transactions; immutable snapshots; JSON restoration; malformed input; unknown/disabled columns; cyclic, accessor and sparse input; resource budgets; and external callback failures.

The public AG Grid v36.2.0 [Advanced Filter](https://www.ag-grid.com/react-data-grid/filter-advanced/) and [External Filter](https://www.ag-grid.com/react-data-grid/filter-external/) documentation informed the feature inventory. This is an original AST and client-side implementation. It does not provide AG Grid's expression syntax/API compatibility, automatic server-query translation, asynchronous predicates, or parity with every advanced-filter editor customization. Server-side row-model integrations must explicitly translate a supported tree and must not assume a client callback executes remotely.
