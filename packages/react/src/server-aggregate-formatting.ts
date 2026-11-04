import {
  formatAggregateValue,
  type Aggregate,
  type Column,
  type ServerNode,
  type ServerQuery,
} from "@opengrid/core";
const operations = ["sum", "avg", "min", "max", "count"];
/** Provider records do not expose a complete resident client hierarchy. */
export function prepareProviderColumn<T>(
  column: Column<T>,
): Omit<Column<T>, "groupKeyGetter" | "groupValueGetter"> {
  if (
    column.groupKeyGetter !== undefined ||
    column.groupValueGetter !== undefined
  )
    throw new TypeError(
      "Client grouping callbacks are unsupported in provider grids; use provider grouping and aggregate values",
    );
  const {
    groupKeyGetter: _key,
    groupValueGetter: _value,
    ...definition
  } = column;
  return definition;
}
/** Only actual provider-owned aggregate cells enter the row-free formatter. */
export function formatServerAggregate<T>(
  column: Column<T>,
  value: unknown,
  node: Extract<ServerNode<T>, { kind: "group" }>,
  query: Pick<ServerQuery, "valueColumns">,
  rowId = node.id,
  depth = 0,
): string {
  if (!node.aggregates || !Object.hasOwn(node.aggregates, column.id))
    return value == null ? "" : String(value);
  const requested = query.valueColumns.find(
    (item) => item.columnId === column.id,
  )?.aggregate;
  const aggregate =
    requested === undefined
      ? column.aggregate
      : operations.includes(requested)
        ? (requested as Aggregate)
        : undefined;
  return formatAggregateValue({ ...column, aggregate }, value, {
    id: rowId,
    kind: "group",
    depth,
    label: node.label ?? node.key,
    aggregates: node.aggregates,
  });
}
