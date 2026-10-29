# Analytical value transforms

`transformValues` computes a display matrix from an existing pivot or aggregate-result matrix. It leaves raw cells, row order and grid state unchanged. Explicitly select columns belonging to **one measure**; the engine cannot infer whether revenue, counts and weights have compatible units.

```ts
import { pivot, transformValues, formatValueRatio } from "@opengrid/core";

const raw = pivot({
  rows,
  rowKeys: ["region"],
  pivotKey: "year",
  values: [{ field: "sales", aggregate: "sum" }],
});
const shown = transformValues(raw, {
  columns: raw.columns,
  transform: { type: "percentOfRowTotal" },
});
```

The transform treats column IDs as opaque strings. It does not parse pivot-generated IDs or silently select every measure. `columns` determines output membership and order. Empty matrices/selections are valid and produce empty analytical cells.

## API

```ts
type ValueTransform =
  | { type:
      | 'percentOfRowTotal'
      | 'percentOfColumnTotal'
      | 'percentOfGrandTotal'
      | 'percentOfParentRowTotal'
      | 'percentOfParentColumnTotal' }
  | { type:
      | 'runningTotal'
      | 'differenceFromPrevious'
      | 'percentDifferenceFromPrevious';
      axis: 'rows' | 'columns' };

transformValues(matrix: PivotResult, options: {
  columns: readonly string[];
  transform: ValueTransform;
  totals?: ValueTransformTotals;
  limits?: { maxCells?: number; maxIntegerBits?: number };
}): TransformedMatrix;
```

The output contains frozen `columns`, `rows` and `diagnostics`. Each row retains a detached frozen `keys` array and a frozen `cells` record. Cells are `number | bigint | ValueRatio | null`. Inputs are never changed or frozen. Object-valued row keys remain borrowed application-owned references; their nested contents follow the existing immutable ownership contract and are not deep-cloned or frozen by the transform.

## Percentage modes and supplied totals

Number percentages return fractional values, such as `0.25` for 25%; formatting is separate.

| Mode                         | Default denominator                                   |
| ---------------------------- | ----------------------------------------------------- |
| `percentOfRowTotal`          | Sum of selected numeric cells in that row             |
| `percentOfColumnTotal`       | Sum of numeric cells in that selected column          |
| `percentOfGrandTotal`        | Sum of all selected numeric cells                     |
| `percentOfParentRowTotal`    | Explicit per-cell parent-row total; never inferred    |
| `percentOfParentColumnTotal` | Explicit per-cell parent-column total; never inferred |

Negative proportions and values greater than one remain signed and unclamped. A zero denominator returns `null` with `ZERO_DENOMINATOR`; an explicitly missing denominator returns `null` with `MISSING_TOTAL`.

Totals can be supplied when the desired aggregate is not the sum of displayed cells, including averages or matrices containing subtotal/grand-total rows:

```ts
type ValueTransformTotals = {
  rows?: readonly (number | bigint | null)[];
  columns?: Readonly<Record<string, number | bigint | null>>;
  grand?: number | bigint | null;
  parentRows?: readonly (Readonly<
    Record<string, number | bigint | null>
  > | null)[];
  parentColumns?: readonly (Readonly<
    Record<string, number | bigint | null>
  > | null)[];
};
```

Row arrays align with **input matrix row indices**, not a sorted result or row-key lookup, and must match the input row count. Column maps use selected column IDs. Supplied row totals replace all default row denominators; missing column-map entries retain their computed column totals. An explicitly supplied `null` means unavailable rather than fallback. Unknown/unselected column IDs reject.

Parent tables provide the actual denominator separately for each row/column pair. For example:

```ts
const shown = transformValues(raw, {
  columns: ["sales2025", "sales2026"],
  transform: { type: "percentOfParentRowTotal" },
  totals: {
    parentRows: [
      { sales2025: 100, sales2026: 120 },
      { sales2025: 100, sales2026: 120 },
      null, // this row has no parent
    ],
  },
});
```

Parent modes require the corresponding table. Missing parent cells return `null` and diagnostics. The engine does not infer tree parents, pivot-column ancestry, filtered totals, subtotal inclusion or non-additive aggregation from opaque keys. Supply denominators from the application's actual aggregation/hierarchy model. Without overrides, every selected matrix cell participates in its numeric total; including both subtotal rows and their children would count both.

## Running totals and differences

`axis: 'rows'` walks supplied row order independently for each selected column. `axis: 'columns'` walks the requested `columns` order independently within each row. There is no hidden sorting, group partitioning or chronological inference.

- `runningTotal` accumulates numeric raw cells through the current position. Blank/invalid cells output `null`; the numeric prefix continues across them. Invalid cells also produce diagnostics.
- `differenceFromPrevious` computes `current - previous` using the adjacent **raw** position, not an earlier transformed value.
- `percentDifferenceFromPrevious` computes `(current - previous) / previous`, retaining the previous value's sign.

A numeric first position produces `NO_PREVIOUS`. A blank or invalid adjacent position produces `NO_PREVIOUS_VALUE` or `INVALID_PREVIOUS`; difference modes do not silently skip it. Zero previous values produce `ZERO_DENOMINATOR` for percent differences, including `0` to `0`. For grouped/partitioned analysis, invoke the transform separately on each desired partition. If a running prefix itself overflows or exceeds the integer budget, its later numeric positions keep that diagnostic rather than attempting recovery from an unavailable prefix.

## Number and exact BigInt behavior

Finite Number and BigInt values are supported. Strings, booleans, dates, objects, NaN and infinities do not coerce into numeric cells. Blank/missing source values (`null`/`undefined`) stay `null`. Invalid source values produce `INVALID_VALUE` and are excluded from computed numeric totals. Consumers should surface diagnostics rather than interpret partial valid-data totals as proof of complete input quality.

One selected measure uses one numeric domain. Any nonzero Number/BigInt mixture across selected cells or supplied totals rejects with `TypeError`, avoiding precision loss. Exact numeric zero is the sole neutral exception: if the measure otherwise uses BigInt, Number `0` (including `-0`) lifts to `0n`. This supports the existing pivot helper's sparse empty buckets, which use numeric zero for empty sums. Unselected measures are not inspected or combined.

BigInt running totals and differences remain exact. Ratios return a reduced fraction with positive denominator:

```ts
interface ValueRatio {
  readonly kind: "ratio";
  readonly numerator: bigint;
  readonly denominator: bigint;
}
// 1n divided by 3n returns { kind: 'ratio', numerator: 1n, denominator: 3n }
```

Ratios never pass through Number and never truncate through integer division. Number results retain ordinary IEEE-754 behavior. Nonfinite derived sums, differences or divisions return `OVERFLOW`; no NaN/Infinity result is emitted. Derived BigInt values outside the configured magnitude budget return `LIMIT`.

## Exact ratio formatting

```ts
formatValueRatio({ kind: "ratio", numerator: 1n, denominator: 3n });
// '33.33%'
formatValueRatio(
  { kind: "ratio", numerator: 1n, denominator: 8n },
  {
    style: "decimal",
    fractionDigits: 3,
  },
);
// '0.125'
```

Options are `style?: 'decimal' | 'percent'` (default `percent`), `fractionDigits?: number` (default `2`, integer `0..12`) and `maxIntegerBits?: number` (default `4096`, maximum `16384`). Formatting uses bounded BigInt arithmetic and rounds halfway away from zero, including negatives. It suppresses a negative sign when the rounded result is zero. Output is a locale-independent decimal string with an optional `%` suffix.

Malformed ratios, zero denominators, invalid precision/style or excessive integer magnitude reject. This formatter does not add currency, locale grouping or HTML. BigInt results and ratios are not directly JSON-serializable; provide an explicit string/tagged-number serialization policy when persisting analytical results.

## Diagnostics and resource validation

Each diagnostic is a frozen `{ rowIndex, columnId, code, message }`. Codes are:

`INVALID_VALUE`, `MISSING_TOTAL`, `INVALID_TOTAL`, `ZERO_DENOMINATOR`, `NO_PREVIOUS`, `NO_PREVIOUS_VALUE`, `INVALID_PREVIOUS`, `OVERFLOW`, `LIMIT`.

Ordinary data problems produce null cells and diagnostics. Invalid configuration/matrix shape, mixed numeric domains or excessive input size/magnitude throw before returning a result; input remains unchanged.

| Limit            | Default | Maximum configurable |
| ---------------- | ------: | -------------------: |
| `maxCells`       | 100,000 |            1,000,000 |
| `maxIntegerBits` |   4,096 |               16,384 |

Limits are positive safe integers. The cell budget also bounds row/column counts and total row-key array entries, including empty selections. Supplied parent tables match the same bounded matrix dimensions. Integer bounds apply to absolute magnitude: a value must be strictly between `-2^bits` and `2^bits`. Oversized input integers reject before calculation; derived over-budget integers produce cell diagnostics.

Matrix rows/cell maps and supplied total maps must be plain records. Only own selected-cell properties are read. Sparse arrays and accessor properties reject without invoking their getters. Prototype-like IDs such as `__proto__` and `constructor` remain valid, collision-safe own keys. The implementation does not evaluate formulas, invoke callbacks or perform network/filesystem work.

## Verification and parity boundary

`value-transforms.test.ts` verifies known percentage matrices; supplied/parent denominators; measure isolation; both ordered axes; adjacent/blank/invalid behavior; signed and zero totals; numeric overflow; exact large BigInts; sparse zero lifting and mixed-domain rejection; rational reduction and exact rounding; immutable output containers; prototype-like keys; accessors; empty inputs; and resource budgets.

AG Grid v36.2.0 documents percentage modes in [Aggregation — Show Values As](https://www.ag-grid.com/react-data-grid/aggregation-show-values-as/). These original matrix transforms additionally provide running totals and prior differences. This standalone API does not supply automatic group/pivot denominator discovery, grid column-menu/state integration, display-based sorting/filtering, server-side calculation, or full AG Grid compatibility. Raw grid values remain separate from transformed display results.
