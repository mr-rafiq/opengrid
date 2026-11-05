export interface Ag31PinnedWidth {
  colId: string;
  pinned: "left" | "right" | null;
  width: number;
}

/** Internal resident source policy: retain a 50px center, alternate right and left candidates. */
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
  const right = columns.filter((column) => column.pinned === "right"),
    left = columns.filter((column) => column.pinned === "left");
  for (let index = 0; index < Math.max(right.length, left.length); index++) {
    for (const column of [right[index], left[index]]) {
      if (pinnedWidth <= available) return release;
      if (!column) continue;
      release.push(column.colId);
      pinnedWidth -= column.width;
    }
  }
  return release;
}
