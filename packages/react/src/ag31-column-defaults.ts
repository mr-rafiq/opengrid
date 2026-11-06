import type { Column, GridState } from "@opengrid/core";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns.js";
/** Declared grouping is independent of the source tool-panel enable flag. */
export function ag31DeclaresRowGroup<T>(
  definition: Ag31ColumnDefinition<T>,
): boolean {
  const active =
    definition.rowGroup === undefined
      ? definition.initialRowGroup
      : definition.rowGroup;
  const index =
    definition.rowGroupIndex === undefined
      ? definition.initialRowGroupIndex
      : definition.rowGroupIndex;
  return active === true || index != null;
}
/** Compile original declared query defaults without changing source definitions or records. */
export function ag31DeclaredQuery<T>(
  columns: readonly Column<T>[],
  definitions: readonly Ag31ColumnDefinition<T>[],
  defaults?: Ag31ColumnDefinition<T>,
): Pick<GridState, "sorting" | "groupBy"> {
  if (columns.length !== definitions.length)
    throw new TypeError("Matching compiled source leaves are required");
  const sorts: {
      id: string;
      direction: "asc" | "desc";
      index: number | null;
      order: number;
    }[] = [],
    groups: { id: string; index: number | null; order: number }[] = [];
  definitions.forEach((provided, order) => {
    const definition: Ag31ColumnDefinition<T> = {};
    for (const source of [defaults ?? {}, provided])
      for (const [key, value] of Object.entries(source))
        if (value !== undefined)
          Object.defineProperty(definition, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
          });
    const get = (key: string, initial: string) =>
      definition[key] === undefined ? definition[initial] : definition[key];
    const sort = get("sort", "initialSort"),
      sortIndex = get("sortIndex", "initialSortIndex"),
      rowGroup = get("rowGroup", "initialRowGroup"),
      groupIndex = get("rowGroupIndex", "initialRowGroupIndex");
    if (sort != null && sort !== "asc" && sort !== "desc")
      throw new TypeError("Source sort defaults must be asc, desc or null");
    for (const [name, value] of [
      ["sortIndex", sortIndex],
      ["rowGroupIndex", groupIndex],
    ] as const)
      if (
        value != null &&
        (!Number.isSafeInteger(value) ||
          (name === "rowGroupIndex" && (value as number) < 0))
      )
        throw new TypeError("Source query indices must be bounded integers");
    if (rowGroup != null && typeof rowGroup !== "boolean")
      throw new TypeError("Source row-group defaults must be boolean or null");
    if (sort)
      sorts.push({
        id: columns[order].id,
        direction: sort,
        index: (sortIndex as number | undefined) ?? null,
        order,
      });
    if (groupIndex != null || rowGroup === true)
      groups.push({
        id: columns[order].id,
        index: (groupIndex as number | undefined) ?? null,
        order,
      });
  });
  const rank = <V extends { index: number | null; order: number }>(
    items: V[],
  ) =>
    items.sort((a, b) =>
      a.index === null
        ? b.index === null
          ? a.order - b.order
          : 1
        : b.index === null
          ? -1
          : a.index - b.index || a.order - b.order,
    );
  return {
    sorting: rank(sorts).map((item) => ({
      columnId: item.id,
      direction: item.direction,
    })),
    groupBy: rank(groups).map((item) => item.id),
  };
}
