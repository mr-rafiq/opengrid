import {
  formatAggregateValue,
  type Aggregate,
  type Column,
  type ServerNode,
  type ServerQuery,
} from "@opengrid/core";
const operations = ["sum", "avg", "min", "max", "count"];
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
