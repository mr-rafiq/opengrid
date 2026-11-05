export interface Ag31PinnedWidth {
  colId: string;
  pinned: "left" | "right" | null;
  width: number;
}

/** Internal resident source policy: retain a 50px center, release right columns before left. */
export function planAg31PinPressure(
  columns: readonly Ag31PinnedWidth[],
  viewportWidth: number,
): string[] {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return [];
  if (columns.length > 10000)
    throw new RangeError("Pinned layout exceeds the source column budget");
  let pinnedWidth = 0;
  for (const column of columns) {
    if (!Number.isFinite(column.width) || column.width < 0)
      throw new TypeError("Pinned widths must be finite and nonnegative");
    if (column.pinned) pinnedWidth += column.width;
  }
  const available = Math.max(0, viewportWidth - 50),
    release: string[] = [];
  for (const side of ["right", "left"] as const) {
    for (const column of columns) {
      if (pinnedWidth <= available) return release;
      if (column.pinned === side) {
        release.push(column.colId);
        pinnedWidth -= column.width;
      }
    }
  }
  return release;
}
