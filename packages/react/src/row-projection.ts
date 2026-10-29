import type { RowNode } from "@opengrid/core";

export type RowRegion = "top" | "body" | "bottom";
export type RowPinLocation = "top" | "bottom" | null;
export interface FullWidthRowContext<T> {
  node: RowNode<T>;
  rowId: string;
  rowPinned: RowPinLocation;
  viewportWidth: number;
}
export interface RowProjectionEntry<T> {
  readonly node: RowNode<T>;
  readonly sourceIndex: number;
  readonly visualIndex: number;
  readonly region: RowRegion;
  readonly regionIndex: number;
  readonly fullWidth: boolean;
}
export interface IgnoredRowPin {
  readonly rowId: string;
  readonly region: "top" | "bottom";
  readonly reason: "not-visible" | "not-data-row" | "non-leaf";
}
export interface RowProjectionOptions<T> {
  pinnedTopRowIds?: readonly string[];
  pinnedBottomRowIds?: readonly string[];
  isFullWidthRow?: (node: RowNode<T>) => boolean;
}
export interface RowProjection<T> {
  readonly top: readonly RowProjectionEntry<T>[];
  readonly body: readonly RowProjectionEntry<T>[];
  readonly bottom: readonly RowProjectionEntry<T>[];
  readonly rows: readonly RowProjectionEntry<T>[];
  /** Actual normal model cells, in visual order. Full-width and group rows are absent. */
  readonly rangeRowIds: readonly string[];
  readonly ignoredPins: readonly IgnoredRowPin[];
  /** These lookups retain a private map; consumers cannot mutate the projection index. */
  getById(rowId: string): RowProjectionEntry<T> | undefined;
  indexOf(rowId: string): number;
}
export const MAX_PINNED_ROW_REQUESTS = 1000;
const noPins: readonly string[] = Object.freeze([]);

/** A current-view move projection. The supplied page/filter/expansion order is authoritative. */
export function createRowProjection<T>(
  source: readonly RowNode<T>[],
  options: RowProjectionOptions<T> = {},
): RowProjection<T> {
  const topIds = options.pinnedTopRowIds ?? noPins;
  const bottomIds = options.pinnedBottomRowIds ?? noPins;
  if (!Array.isArray(topIds) || !Array.isArray(bottomIds))
    throw new TypeError("Pinned row IDs must be arrays");
  if (topIds.length + bottomIds.length > MAX_PINNED_ROW_REQUESTS)
    throw new RangeError(
      `At most ${MAX_PINNED_ROW_REQUESTS} pinned row IDs may be requested`,
    );
  for (const id of [...topIds, ...bottomIds])
    if (typeof id !== "string" || !id.length)
      throw new TypeError("Pinned row IDs must be nonempty strings");
  const sources = new Map<
    string,
    { node: RowNode<T>; sourceIndex: number; fullWidth: boolean }
  >();
  source.forEach((node, sourceIndex) => {
    if (typeof node.id !== "string" || !node.id.length)
      throw new TypeError("Projected row IDs must be nonempty strings");
    if (sources.has(node.id))
      throw new Error(`Duplicate projected row ID: ${node.id}`);
    sources.set(node.id, {
      node,
      sourceIndex,
      fullWidth: Boolean(options.isFullWidthRow?.(node)),
    });
  });
  const claimed = new Set<string>();
  const ignoredPins: IgnoredRowPin[] = [];
  type Resolved = NonNullable<ReturnType<typeof sources.get>>;
  function resolve(
    ids: readonly string[],
    region: "top" | "bottom",
  ): Resolved[] {
    const resolved: Resolved[] = [];
    const visited = new Set<string>();
    for (const rowId of ids) {
      if (claimed.has(rowId) || visited.has(rowId)) continue;
      visited.add(rowId);
      const row = sources.get(rowId);
      const reason = !row
        ? "not-visible"
        : row.node.kind !== "row" || row.node.data === undefined
          ? "not-data-row"
          : row.node.children?.length
            ? "non-leaf"
            : undefined;
      if (reason) {
        ignoredPins.push(Object.freeze({ rowId, region, reason }));
        continue;
      }
      claimed.add(rowId);
      resolved.push(row!);
    }
    return resolved;
  }
  const topResolved = resolve(topIds, "top");
  const bottomResolved = resolve(bottomIds, "bottom");
  const bodyResolved = [...sources.values()].filter(
    (row) => !claimed.has(row.node.id),
  );
  const byId = new Map<string, RowProjectionEntry<T>>();
  const rows: RowProjectionEntry<T>[] = [];
  function band(
    resolved: Resolved[],
    region: RowRegion,
  ): readonly RowProjectionEntry<T>[] {
    return Object.freeze(
      resolved.map((row, regionIndex) => {
        const entry = Object.freeze({
          ...row,
          region,
          regionIndex,
          visualIndex: rows.length,
        });
        rows.push(entry);
        byId.set(row.node.id, entry);
        return entry;
      }),
    );
  }
  const top = band(topResolved, "top");
  const body = band(bodyResolved, "body");
  const bottom = band(bottomResolved, "bottom");
  return Object.freeze({
    top,
    body,
    bottom,
    rows: Object.freeze(rows),
    rangeRowIds: Object.freeze(
      rows
        .filter(
          (row) =>
            row.node.kind === "row" &&
            row.node.data !== undefined &&
            !row.fullWidth,
        )
        .map((row) => row.node.id),
    ),
    ignoredPins: Object.freeze(ignoredPins),
    getById: (rowId: string) => byId.get(rowId),
    indexOf: (rowId: string) => byId.get(rowId)?.visualIndex ?? -1,
  });
}
