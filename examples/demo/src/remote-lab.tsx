import { useEffect, useMemo, useRef, useState } from "react";
import {
  LiveViewportRowModel,
  ServerSideRowModel,
  matchesFilter,
  type Column,
  type ServerNode,
  type ServerRequest,
  type ServerResponse,
} from "@opengrid/core";
import { ServerDataGrid, LiveViewportDataGrid } from "@opengrid/react";
import { ServerNotesLab } from "./server-notes-lab.js";
import { InfiniteLab } from "./infinite-lab.js";

interface RemoteOrder {
  id: string;
  name: string;
  region: string;
  price: number;
  year: number;
}
const remoteColumns: Column<RemoteOrder>[] = [
  { id: "name", field: "name", header: "Order", pinned: "left", width: 220 },
  { id: "region", field: "region", header: "Region", width: 140 },
  {
    id: "price",
    field: "price",
    header: "Revenue",
    type: "number",
    width: 150,
    valueFormatter: (value) => `$${Number(value).toFixed(2)}`,
  },
  { id: "year", field: "year", header: "Year", type: "number", width: 110 },
];
const regions = ["Europe", "Americas", "Asia Pacific"];
const sampleOrders: RemoteOrder[] = Array.from({ length: 72 }, (_, index) => ({
  id: `order-${index}`,
  name: `Order ${String(index + 1).padStart(3, "0")}`,
  region: regions[index % 3],
  price: Math.round((120 + ((index * 17.3) % 500)) * 100) / 100,
  year: 2024 + (index % 3),
}));
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 120);
    signal.addEventListener("abort", abort, { once: true });
  });
}
async function mockServer(
  request: ServerRequest,
): Promise<ServerResponse<RemoteOrder>> {
  await delay(request.signal);
  const rows = sampleOrders.filter((row) =>
    Object.entries(request.filters).every(([id, filter]) => {
      const column = remoteColumns.find((column) => column.id === id);
      return column
        ? matchesFilter(row[id as keyof RemoteOrder], filter, column)
        : true;
    }),
  );
  let nodes: ServerNode<RemoteOrder>[];
  if (!request.groupKeys.length && request.rowGroupColumns.length) {
    nodes = regions.flatMap((region) => {
      const members = rows.filter((row) => row.region === region);
      return members.length
        ? [
            {
              kind: "group" as const,
              id: `region:${region}`,
              key: region,
              label: region,
              childCount: members.length,
              aggregates: {
                price: members.reduce((sum, row) => sum + row.price, 0),
              },
            },
          ]
        : [];
    });
  } else
    nodes = rows
      .filter(
        (row) =>
          !request.groupKeys.length || row.region === request.groupKeys[0],
      )
      .map((data) => ({ kind: "row", id: data.id, data }));
  nodes = nodes
    .map((node, original) => ({ node, original }))
    .sort((a, b) => {
      for (const sort of request.sorting) {
        const value = (node: ServerNode<RemoteOrder>) =>
          node.kind === "row"
            ? node.data[sort.columnId as keyof RemoteOrder]
            : sort.columnId === "name"
              ? (node.label ?? node.key)
              : node.aggregates?.[sort.columnId];
        const left = value(a.node),
          right = value(b.node);
        const order =
          left === right
            ? 0
            : left == null
              ? 1
              : right == null
                ? -1
                : left < right
                  ? -1
                  : 1;
        if (order) return order * (sort.direction === "desc" ? -1 : 1);
      }
      return a.original - b.original;
    })
    .map((item) => item.node);
  return {
    nodes: nodes.slice(request.startRow, request.endRow),
    rowCount: nodes.length,
  };
}

/** Both providers are explicitly simulated in this browser; no backend or market data is used. */
export function RemoteLab() {
  const [rtl, setRtl] = useState(false);
  const model = useMemo(
    () =>
      new ServerSideRowModel<RemoteOrder>(
        { getRows: mockServer },
        {
          blockSize: 8,
          maxBlocks: 8,
          query: {
            rowGroupColumns: ["region"],
            valueColumns: [{ columnId: "price", aggregate: "sum" }],
          },
        },
      ),
    [],
  );
  const live = useMemo(
    () =>
      new LiveViewportRowModel<RemoteOrder>(
        {
          subscribe(request) {
            let tick = 0;
            const push = () => {
              request.onRowCount(1_000_000);
              request.onRows(
                Array.from(
                  { length: request.endRow - request.startRow },
                  (_, offset) => {
                    const index = request.startRow + offset;
                    return {
                      index,
                      id: `live-${index}`,
                      data: {
                        id: `live-${index}`,
                        name: `Live order ${(index + 1).toLocaleString()}`,
                        region: regions[index % 3],
                        price: 100 + index * 0.01 + Math.sin(index + tick) * 3,
                        year: 2024 + (index % 3),
                      },
                    };
                  },
                ),
                true,
              );
              tick++;
            };
            push();
            const timer = setInterval(push, 1000);
            return () => clearInterval(timer);
          },
        },
        { buffer: 6, maxWindowSize: 1000 },
      ),
    [],
  );
  const lifecycle = useRef(0);
  useEffect(() => {
    const ticket = ++lifecycle.current;
    return () =>
      queueMicrotask(() => {
        if (lifecycle.current === ticket) {
          model.dispose();
          live.dispose();
        }
      });
  }, [model, live]);
  return (
    <section className="pivot-panel" aria-label="Remote data model laboratory">
      <label>
        <input
          type="checkbox"
          checked={rtl}
          onChange={(event) => setRtl(event.target.checked)}
        />{" "}
        Right-to-left remote grids
      </label>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2>Remote data model laboratory</h2>
          <p>
            Simulated providers: delayed in-memory server queries and one-second
            live ticks. No external server or real financial data.
          </p>
        </div>
        <a
          href="https://github.com/mr-rafiq/opengrid/blob/main/docs/REMOTE_GRIDS.md"
          style={{ fontSize: 12, textDecoration: "underline" }}
        >
          Binding API and limits
        </a>
      </div>
      <article
        style={{
          marginTop: 16,
          border: "1px solid var(--line)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 16px 0" }}>
          <h3 style={{ margin: 0, fontSize: 13 }}>
            Server-owned grouping, sorting and filtering
          </h3>
          <p>
            Open a region, page through its children, or filter and sort
            headers. The provider returns each complete block in authoritative
            order.
          </p>
        </div>
        <ServerDataGrid
          direction={rtl ? "rtl" : "ltr"}
          model={model}
          columns={remoteColumns}
          height={270}
          ariaLabel="Mock server orders"
        />
      </article>
      <ServerNotesLab direction={rtl ? "rtl" : "ltr"} />
      <InfiniteLab direction={rtl ? "rtl" : "ltr"} />
      <article style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
          Live sparse viewport: 1,000,000 logical rows
        </h3>
        <p>
          Only the visible buffered window is generated and pushed. Focus a cell
          and use Control/Cmd+End to reach the final row; prices update every
          second.
        </p>
        <LiveViewportDataGrid
          direction={rtl ? "rtl" : "ltr"}
          model={live}
          columns={remoteColumns}
          height={270}
          ariaLabel="Simulated live orders"
        />
      </article>
    </section>
  );
}
