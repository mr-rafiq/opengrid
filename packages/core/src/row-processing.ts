import type { Column, GridState, RowNode } from "./types.js";
import {
  isFilterBlank as blank,
  comparableFilterValue as comparable,
} from "./filter-predicates.js";

function compareValue<T>(
  column: Column<T>,
  left: unknown,
  right: unknown,
  context: Parameters<NonNullable<Column<T>["compare"]>>[2],
  direction: "asc" | "desc",
) {
  const sign = direction === "asc" ? 1 : -1;
  if (column.compare && column.compareBlankValues)
    return sign * column.compare(left, right, context);
  if (blank(left) || blank(right))
    return blank(left) ? (blank(right) ? 0 : 1) : -1;
  if (column.compare) return sign * column.compare(left, right, context);
  const a = comparable(left, column.type) as string | number | bigint,
    b = comparable(right, column.type) as string | number | bigint;
  return sign * (a === b ? 0 : a < b ? -1 : 1);
}

export function compareDataRows<T>(
  left: T,
  right: T,
  sorting: GridState["sorting"],
  column: (id: string) => Column<T>,
  value: (row: T, id: string) => unknown,
) {
  for (const sort of sorting) {
    const definition = column(sort.columnId),
      order = compareValue(
        definition,
        value(left, definition.id),
        value(right, definition.id),
        { rowA: left, rowB: right },
        sort.direction,
      );
    if (order) return order;
  }
  return 0;
}

export function compareGroupRows<T>(
  left: RowNode<T>,
  right: RowNode<T>,
  groupedColumn: Column<T>,
  sorting: GridState["sorting"],
  column: (id: string) => Column<T>,
  presentation = true,
) {
  for (const sort of presentation ? sorting : []) {
    const definition = column(sort.columnId);
    if (
      definition.id !== groupedColumn.id &&
      !definition.aggregate &&
      !definition.groupValueGetter
    )
      continue;
    const read = (node: RowNode<T>) =>
      definition.groupValueGetter
        ? definition.groupValueGetter(node)
        : definition.id === groupedColumn.id
          ? node.groupValue
          : node.aggregates?.[definition.id];
    const order = compareValue(
      definition,
      read(left),
      read(right),
      { nodeA: left, nodeB: right },
      sort.direction,
    );
    if (order) return order;
  }
  if (
    groupedColumn.groupBlanksLast &&
    blank(left.groupKey) !== blank(right.groupKey)
  )
    return blank(left.groupKey) ? 1 : -1;
  return 0;
}

/** Recompute and sort the retained graph without evaluating filter predicates or group keys. */
export function refreshGroupedAggregates<T>(options: {
  roots: readonly RowNode<T>[];
  eligibleRows: readonly T[];
  sourceRows: readonly T[];
  sorting: GridState["sorting"];
  column(id: string): Column<T>;
  value(row: T, id: string): unknown;
  id(row: T): string;
  aggregate(rows: T[]): Record<string, unknown>;
  rank(node: RowNode<T>): number | undefined;
}) {
  const sourceIndex = new Map(
      options.sourceRows.map((row, index) => [options.id(row), index]),
    ),
    rowsById = new Map(
      options.eligibleRows.map((row) => [options.id(row), row]),
    ),
    parents = new Map<string, readonly string[]>(),
    groupRows = new Map<string, T[]>(),
    ranks = new Map<RowNode<T>, number>();
  function remember(nodes: readonly RowNode<T>[], path: readonly string[]) {
    for (const node of nodes) {
      if (node.kind === "group") {
        groupRows.set(node.id, []);
        remember(node.children ?? [], [...path, node.id]);
      } else if (node.kind === "row") parents.set(node.id, path);
      else
        throw new TypeError("Aggregate refresh requires resident row groups");
    }
  }
  remember(options.roots, []);
  const rows = [...options.eligibleRows].sort(
    (a, b) =>
      compareDataRows(a, b, options.sorting, options.column, options.value) ||
      sourceIndex.get(options.id(a))! - sourceIndex.get(options.id(b))!,
  );
  for (const row of rows) {
    const path = parents.get(options.id(row));
    if (!path)
      throw new Error("The retained aggregate projection lost an eligible row");
    for (const id of path) groupRows.get(id)!.push(row);
  }
  const aggregates = new Map(
    [...groupRows].map(([id, members]) => [id, options.aggregate(members)]),
  );
  function rebuild(input: readonly RowNode<T>[]): RowNode<T>[] {
    return input
      .map((node, ordinal) => {
        if (node.kind !== "group") return node;
        const next = {
          ...node,
          children: rebuild(node.children ?? []),
          aggregates: aggregates.get(node.id),
        };
        ranks.set(next, options.rank(node) ?? ordinal);
        return next;
      })
      .sort((a, b) => {
        if (a.kind === "group" && b.kind === "group")
          return (
            compareGroupRows(
              a,
              b,
              options.column(a.groupColumnId!),
              options.sorting,
              options.column,
            ) || ranks.get(a)! - ranks.get(b)!
          );
        return (
          compareDataRows(
            rowsById.get(a.id)!,
            rowsById.get(b.id)!,
            options.sorting,
            options.column,
            options.value,
          ) || sourceIndex.get(a.id)! - sourceIndex.get(b.id)!
        );
      });
  }
  return { rows, roots: rebuild(options.roots), ranks };
}
