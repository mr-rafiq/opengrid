export const AUTO_ROW_HEIGHT_LIMITS = Object.freeze({
  maxRows: 100_000,
  maxConstraints: 100_000,
  maxColumns: 8,
  maxCachedCells: 100_000,
  maxConnectedCells: 8_192,
  maxMeasuredHeight: 1_000_000,
});
export interface AutoRowHeightConstraint {
  /** Inclusive visual row index. */
  readonly startRow: number;
  /** Exclusive visual row index. */
  readonly endRow: number;
  readonly height: number;
}
export interface AutoRowHeightOptions {
  /** Tighten the cache cap; at most AUTO_ROW_HEIGHT_LIMITS.maxCachedCells. */
  maxCachedCells?: number;
  /** Tighten concurrently observed content cells; must fit the cache. */
  maxConnectedCells?: number;
}
export interface DataGridRowHeightController {
  /** Drop measured estimates and remeasure currently mounted cell owners. */
  reset(): void;
}

/**
 * Satisfy natural-content interval heights, putting each deficit into its last row.
 * Earlier ending intervals run first so overlapping columns share existing height.
 * Inputs remain borrowed; all returned row heights are owned.
 */
export function allocateAutoRowHeights(
  baseHeights: readonly number[],
  constraints: readonly AutoRowHeightConstraint[],
): readonly number[] {
  if (
    !Array.isArray(baseHeights) ||
    baseHeights.length > AUTO_ROW_HEIGHT_LIMITS.maxRows
  )
    throw new RangeError("Automatic row height exceeds the row limit");
  if (
    !Array.isArray(constraints) ||
    constraints.length > AUTO_ROW_HEIGHT_LIMITS.maxConstraints
  )
    throw new RangeError("Automatic row height exceeds the constraint limit");
  const sizes = new Float64Array(baseHeights.length);
  let total = 0;
  for (let index = 0; index < baseHeights.length; index++) {
    const height = baseHeights[index],
      next = total + height;
    if (
      !Number.isFinite(height) ||
      height <= 0 ||
      !Number.isFinite(next) ||
      next > Number.MAX_SAFE_INTEGER ||
      next <= total
    )
      throw new RangeError(
        "Automatic base height produces an unsafe pixel interval",
      );
    sizes[index] = height;
    total = next;
  }
  const owned = constraints
    .map((constraint) => {
      if (!constraint || typeof constraint !== "object")
        throw new TypeError("An automatic height constraint is required");
      const startRow = constraint.startRow,
        endRow = constraint.endRow,
        height = constraint.height;
      if (
        !Number.isSafeInteger(startRow) ||
        !Number.isSafeInteger(endRow) ||
        startRow < 0 ||
        endRow <= startRow ||
        endRow > sizes.length ||
        !Number.isFinite(height) ||
        height < 0 ||
        height > AUTO_ROW_HEIGHT_LIMITS.maxMeasuredHeight
      )
        throw new RangeError("Invalid automatic row height constraint");
      return { startRow, endRow, height };
    })
    .sort(
      (first, second) =>
        first.endRow - second.endRow || first.startRow - second.startRow,
    );

  const tree = new Float64Array(sizes.length + 1);
  for (let index = 1; index < tree.length; index++) {
    tree[index] += sizes[index - 1];
    const parent = index + (index & -index);
    if (parent < tree.length) tree[parent] += tree[index];
  }
  const prefix = (end: number) => {
    let sum = 0;
    for (let index = end; index > 0; index -= index & -index)
      sum += tree[index];
    return sum;
  };
  for (const constraint of owned) {
    const present = prefix(constraint.endRow) - prefix(constraint.startRow);
    const extra = Math.max(0, constraint.height - present);
    if (!extra) continue;
    const row = constraint.endRow - 1,
      next = sizes[row] + extra,
      nextTotal = total + extra;
    if (
      !Number.isFinite(next) ||
      next <= sizes[row] ||
      !Number.isFinite(nextTotal) ||
      nextTotal > Number.MAX_SAFE_INTEGER ||
      nextTotal <= total
    )
      throw new RangeError(
        "Automatic content height produces an unsafe pixel interval",
      );
    sizes[row] = next;
    total = nextTotal;
    for (let index = row + 1; index < tree.length; index += index & -index)
      tree[index] += extra;
  }
  return Object.freeze(Array.from(sizes));
}
