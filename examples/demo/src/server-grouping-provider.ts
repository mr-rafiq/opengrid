import {
  aggregateValues,
  matchesFilter,
  type Column,
  type ServerNode,
  type ServerRequest,
  type ServerResponse,
} from "@opengrid/core";
export type ServerOrder = { name: string; team: string; amount: number };
const orders: ServerOrder[] = [
  { name: "Remote A 1", team: "A", amount: 1 },
  { name: "Remote A 2", team: "A", amount: 9 },
  { name: "Remote A 3", team: "A", amount: 5 },
  { name: "Remote B 1", team: "B", amount: 4 },
  { name: "Remote B 2", team: "B", amount: 4 },
  { name: "Remote B 3", team: "B", amount: 8 },
];
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const amount = (value: unknown) =>
  value == null ? "" : money.format(Number(value));
export function serverGroupingColumns(): Column<ServerOrder>[] {
  return [
    {
      id: "name",
      field: "name",
      header: "Order",
      width: 180,
      groupPath: ["Orders"],
    },
    {
      id: "team",
      field: "team",
      header: "Team",
      width: 110,
      hidden: true,
      groupPath: ["Orders"],
    },
    {
      id: "amount",
      field: "amount",
      header: "Amount",
      type: "number",
      groupable: false,
      width: 140,
      groupPath: ["Performance"],
      valueFormatter: amount,
      aggregateFormatter: (value, context) =>
        context.aggregate === "count" ? String(value ?? "") : amount(value),
    },
  ];
}
/** Synthetic provider really executes the requested grouping, conditions, math, sort and block window. */
export function serverGroupingResponse(
  request: ServerRequest,
): ServerResponse<ServerOrder> {
  const columns = serverGroupingColumns();
  const byId = new Map(columns.map((column) => [column.id, column]));
  const read = (row: ServerOrder, id: string) => {
    const column = byId.get(id);
    if (!column?.field) throw Error(`Unknown demo field: ${id}`);
    return row[column.field];
  };
  for (const id of [
    ...request.rowGroupColumns,
    ...request.valueColumns.map((value) => value.columnId),
    ...request.sorting.map((sort) => sort.columnId),
    ...Object.keys(request.filters),
  ])
    if (!byId.has(id)) throw Error(`Unknown demo field: ${id}`);
  for (const value of request.valueColumns)
    if (!["sum", "avg", "min", "max", "count"].includes(value.aggregate))
      throw Error(`Unsupported demo aggregation: ${value.aggregate}`);
  if (request.groupKeys.length > request.rowGroupColumns.length)
    throw Error("Group route is deeper than the configured fields");
  const filtered = orders.filter(
    (row) =>
      columns.every(
        (column) =>
          !Object.hasOwn(request.filters, column.id) ||
          matchesFilter(
            read(row, column.id),
            request.filters[column.id],
            column,
          ),
      ) &&
      request.groupKeys.every(
        (key, index) =>
          String(read(row, request.rowGroupColumns[index])) === key,
      ),
  );
  const field = request.rowGroupColumns[request.groupKeys.length];
  let nodes: ServerNode<ServerOrder>[];
  if (field) {
    const groups = new Map<string, ServerOrder[]>();
    for (const row of filtered) {
      const key = String(read(row, field));
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    nodes = [...groups].map(([key, members]) => {
      const aggregates: Record<string, unknown> = Object.create(null);
      for (const value of request.valueColumns)
        aggregates[value.columnId] = aggregateValues(
          members.map((row) => read(row, value.columnId)),
          value.aggregate as "sum" | "avg" | "min" | "max" | "count",
        );
      const next = request.rowGroupColumns[request.groupKeys.length + 1];
      return {
        kind: "group",
        id: key,
        key,
        label:
          field === "team"
            ? `Team ${key}`
            : `${byId.get(field)!.header}: ${key}`,
        childCount: next
          ? new Set(members.map((row) => String(read(row, next)))).size
          : members.length,
        aggregates,
      };
    });
  } else nodes = filtered.map((data) => ({ kind: "row", id: data.name, data }));
  nodes = nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      for (const sort of request.sorting) {
        const value = (node: ServerNode<ServerOrder>) =>
          node.kind === "row"
            ? read(node.data, sort.columnId)
            : Object.hasOwn(node.aggregates ?? {}, sort.columnId)
              ? node.aggregates![sort.columnId]
              : (node.label ?? node.key);
        const x = value(a.node) as string | number,
          y = value(b.node) as string | number;
        const order = x === y ? 0 : x < y ? -1 : 1;
        if (order) return (sort.direction === "asc" ? 1 : -1) * order;
      }
      return a.index - b.index;
    })
    .map((item) => item.node);
  return {
    nodes: nodes.slice(request.startRow, request.endRow),
    rowCount: nodes.length,
  };
}
