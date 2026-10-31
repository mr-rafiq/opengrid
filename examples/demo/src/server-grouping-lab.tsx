import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ServerSideRowModel,
  matchesFilter,
  type Column,
  type ServerNode,
} from "@opengrid/core";
import { ServerTreeDataGrid } from "@opengrid/react";
type Order = { name: string; team: string; amount: number };
const columns: Column<Order>[] = [
  { id: "name", field: "name", header: "Order", pinned: "left", width: 180 },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    width: 140,
  },
];
const orders: Order[] = [
  { name: "Remote A 1", team: "A", amount: 1 },
  { name: "Remote A 2", team: "A", amount: 9 },
  { name: "Remote A 3", team: "A", amount: 5 },
  { name: "Remote B 1", team: "B", amount: 4 },
  { name: "Remote B 2", team: "B", amount: 4 },
  { name: "Remote B 3", team: "B", amount: 8 },
];
export function ServerGroupingLab() {
  const failA = useRef(false);
  const [rtl, setRtl] = useState(false);
  const model = useMemo(
    () =>
      new ServerSideRowModel<Order>(
        {
          getRows: async (request) => {
            await new Promise((resolve) => setTimeout(resolve, 60));
            if (request.signal.aborted)
              throw new DOMException("Aborted", "AbortError");
            if (request.groupKeys[0] === "A" && failA.current) {
              failA.current = false;
              throw Error("Demo branch A is offline");
            }
            const filtered = orders.filter((row) =>
              columns.every(
                (column) =>
                  !Object.hasOwn(request.filters, column.id) ||
                  matchesFilter(
                    column.field ? row[column.field] : undefined,
                    request.filters[column.id],
                    column,
                  ),
              ),
            );
            let nodes: ServerNode<Order>[] = request.groupKeys.length
              ? filtered
                  .filter((row) => row.team === request.groupKeys[0])
                  .map((data, index) => ({
                    kind: "row",
                    id: String(index),
                    data,
                  }))
              : ["A", "B"].flatMap((key) => {
                  const members = filtered.filter((row) => row.team === key);
                  return members.length
                    ? [
                        {
                          kind: "group" as const,
                          id: key,
                          key,
                          label: `Team ${key}`,
                          childCount: members.length,
                          aggregates: {
                            amount: members.reduce(
                              (sum, row) => sum + row.amount,
                              0,
                            ),
                          },
                        },
                      ]
                    : [];
                });
            nodes = nodes
              .map((node, index) => ({ node, index }))
              .sort((a, b) => {
                for (const sort of request.sorting) {
                  const value = (node: ServerNode<Order>) =>
                    node.kind === "row"
                      ? sort.columnId === "amount"
                        ? node.data.amount
                        : node.data.name
                      : sort.columnId === "amount"
                        ? node.aggregates?.amount
                        : node.label;
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
          },
        },
        {
          blockSize: 2,
          maxBlocks: 6,
          query: {
            rowGroupColumns: ["team"],
            valueColumns: [{ columnId: "amount", aggregate: "sum" }],
          },
        },
      ),
    [],
  );
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  return (
    <section aria-label="Remote grouping example" className="grouping-lab">
      <p>
        Open both teams together, load more independently, and retry a failed
        branch while its sibling stays visible. Sorting and filtering execute in
        the demo provider.
      </p>
      <div className="grouping-lab-controls">
        <button
          onClick={() => {
            void model.refresh({ purge: false }).catch(() => {});
          }}
        >
          Refresh server groups
        </button>
        <button
          onClick={() => {
            failA.current = true;
            void model.refreshRoute(["A"], { purge: false }).catch(() => {});
          }}
        >
          Fail next Team A request
        </button>
        <label>
          <input
            type="checkbox"
            checked={rtl}
            onChange={(event) => setRtl(event.target.checked)}
          />
          Right-to-left server view
        </label>
        <span role="status">
          Cached blocks: {snapshot.blocks.length} / {model.maxBlocks}
        </span>
      </div>
      <ServerTreeDataGrid
        model={model}
        columns={columns}
        height={440}
        direction={rtl ? "rtl" : "ltr"}
        ariaLabel="Simultaneous server groups"
      />
    </section>
  );
}
