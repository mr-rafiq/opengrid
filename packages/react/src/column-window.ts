export interface WindowColumn {
  width: number;
  pinned?: "left" | "right" | null;
}
export type ColumnWindowEntry =
  | { kind: "column"; index: number }
  | { kind: "spacer"; key: string; width: number };
export interface ColumnWindowOptions {
  scrollLeft: number;
  viewportWidth: number;
  leadingWidth?: number;
  overscan?: number;
  retainIndices?: number[];
  enabled?: boolean;
}

/** Fixed-width horizontal window. Pinned and explicitly retained columns always render.
 * Spacer widths preserve all omitted columns' logical positions without adding ARIA cells.
 */
export function getColumnWindow(
  columns: readonly WindowColumn[],
  options: ColumnWindowOptions,
): ColumnWindowEntry[] {
  if (
    columns.some((column) => !Number.isFinite(column.width) || column.width < 0)
  )
    throw new RangeError("Column widths must be finite nonnegative numbers");
  const {
    scrollLeft,
    viewportWidth,
    leadingWidth = 0,
    overscan = 200,
  } = options;
  if (
    ![scrollLeft, viewportWidth, leadingWidth, overscan].every(
      Number.isFinite,
    ) ||
    viewportWidth < 0 ||
    leadingWidth < 0 ||
    overscan < 0
  )
    throw new RangeError(
      "Column window dimensions must be finite and nonnegative",
    );
  const leftPinned = columns
    .filter((column) => column.pinned === "left")
    .reduce((sum, column) => sum + column.width, leadingWidth);
  const rightPinned = columns
    .filter((column) => column.pinned === "right")
    .reduce((sum, column) => sum + column.width, 0);
  const totalWidth = columns.reduce(
    (sum, column) => sum + column.width,
    leadingWidth,
  );
  const scroll = Math.min(
    Math.max(0, scrollLeft),
    Math.max(0, totalWidth - viewportWidth),
  );
  const left = scroll + leftPinned;
  const right = Math.max(left + 1, scroll + viewportWidth - rightPinned);
  const retained = new Set(options.retainIndices ?? []);
  const result: ColumnWindowEntry[] = [];
  let position = leadingWidth,
    gap = 0,
    gapStart = 0;
  function flushGap() {
    if (gap > 0)
      result.push({ kind: "spacer", key: `gap-${gapStart}`, width: gap });
    gap = 0;
  }
  columns.forEach((column, index) => {
    const render =
      options.enabled === false ||
      column.pinned === "left" ||
      column.pinned === "right" ||
      retained.has(index) ||
      (position + column.width > left - overscan &&
        position < right + overscan);
    if (render) {
      flushGap();
      result.push({ kind: "column", index });
    } else {
      if (!gap) gapStart = index;
      gap += column.width;
    }
    position += column.width;
  });
  flushGap();
  return result;
}
