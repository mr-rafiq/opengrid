import type { AggregateFormatContext, Column, RowNode } from "./types.js";

/** Format an aggregate for display; raw values and source-row callbacks remain untouched. */
export function formatAggregateValue<T>(
  column: Column<T>,
  value: unknown,
  node: RowNode<T>,
): string {
  if (node.kind !== "group" && node.kind !== "total")
    throw new TypeError("Aggregate formatting requires a group or total row");
  if (!column.aggregateFormatter) return value == null ? "" : String(value);
  const context: AggregateFormatContext = Object.freeze({
    columnId: column.id,
    rowId: node.id,
    kind: node.kind,
    aggregate: column.aggregate,
    ...(node.total === undefined ? {} : { total: node.total }),
    ...(node.label === undefined ? {} : { groupLabel: node.label }),
    ...(node.leafCount === undefined ? {} : { leafCount: node.leafCount }),
  });
  const formatted = column.aggregateFormatter(value, context);
  if (typeof formatted !== "string")
    throw new TypeError("Column aggregateFormatter must return a string");
  return formatted;
}
