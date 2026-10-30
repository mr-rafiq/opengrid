import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ServerSideRowModel,
  type Column,
  type ServerRequest,
  type ServerResponse,
} from "@opengrid/core";
import { ServerDataGrid, type GridDirection } from "@opengrid/react";

type Record = { name: string };
type Pending = {
  id: number;
  request: ServerRequest;
  resolve: (value: ServerResponse<Record>) => void;
  reject: (error: Error) => void;
};
const columns: Column<Record>[] = [
  { id: "name", field: "name", header: "Provider record", width: 360, flex: 1 },
];

export function ServerRequestLab({ direction }: { direction: GridDirection }) {
  const [history, setHistory] = useState<string[]>([]),
    [, render] = useState(0);
  const outstanding = useRef(new Map<number, Pending>()),
    call = useRef(0),
    batch = useRef(0),
    query = useRef(0),
    alive = useRef(true),
    lifecycle = useRef(0);
  const log = (message: string) => {
    if (alive.current)
      setHistory((previous) => [...previous, message].slice(-12));
  };
  const model = useMemo(
    () =>
      new ServerSideRowModel<Record>(
        {
          getRows: (request) =>
            new Promise<ServerResponse<Record>>((resolve, reject) => {
              const id = ++call.current;
              outstanding.current.set(id, { id, request, resolve, reject });
              // Deliberately hold canceled providers until an explicit response: this
              // makes retained concurrency slots observable without network traffic.
              log(`Started ${id}: ${request.groupKeys.join(" / ") || "root"}`);
              render((value) => value + 1);
            }),
        },
        {
          blockSize: 1,
          maxBlocks: 8,
          maxConcurrentRequests: 2,
          maxPendingRequests: 8,
        },
      ),
    [],
  );
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  useEffect(() => {
    const ticket = ++lifecycle.current;
    alive.current = true;
    return () =>
      queueMicrotask(() => {
        if (lifecycle.current !== ticket) return;
        alive.current = false;
        model.dispose();
        for (const item of outstanding.current.values())
          item.resolve({ nodes: [], rowCount: 0 });
        outstanding.current.clear();
      });
  }, [model]);
  const active = [...outstanding.current.values()];
  function queueRoutes() {
    const current = ++batch.current;
    for (let index = 0; index < 6; index++) {
      const route = [`batch${current}`, `route${index}`];
      void model
        .loadBlock(route, 0)
        .catch((error: unknown) =>
          log(
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : "Request failed",
          ),
        );
    }
  }
  function settle(fail: boolean) {
    const item = outstanding.current.values().next().value;
    if (!item) return;
    outstanding.current.delete(item.id);
    if (fail) item.reject(new Error(""));
    else
      item.resolve({
        nodes: [
          {
            kind: "row",
            id: `row-${item.id}`,
            data: { name: item.request.groupKeys.join(" / ") || "Root record" },
          },
        ],
        rowCount: 1,
      });
    log(
      `${fail ? "Rejected" : "Settled"} ${item.id}${item.request.signal.aborted ? " (canceled provider)" : ""}`,
    );
    render((value) => value + 1);
  }
  return (
    <article
      aria-label="Bounded server requests example"
      style={{ marginTop: 24 }}
    >
      <h3>Server requests share a bounded queue</h3>
      <p>
        This local provider waits for your response buttons and intentionally
        ignores cancellation. Changing the query cancels callers immediately;
        its provider slots remain occupied until you settle them. Each queued
        route is an independent request. The grid below displays the root route.
      </p>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}
      >
        <button type="button" onClick={queueRoutes}>
          Queue six server routes
        </button>
        <button
          type="button"
          onClick={() => {
            query.current++;
            model.setQuery({
              sorting: [
                {
                  columnId: "name",
                  direction: query.current % 2 ? "asc" : "desc",
                },
              ],
            });
            log(`Query ${query.current}: canceled previous callers`);
          }}
        >
          Cancel server query
        </button>
        <button
          type="button"
          onClick={() => {
            void model
              .refreshBlock([], 0)
              .catch((error: unknown) =>
                log(error instanceof Error ? error.message : "Refresh failed"),
              );
          }}
        >
          Refresh server root
        </button>
        <button
          type="button"
          disabled={!active.length}
          onClick={() => settle(false)}
        >
          Settle next server response
        </button>
        <button
          type="button"
          disabled={!active.length}
          onClick={() => settle(true)}
        >
          Reject next server response
        </button>
      </div>
      <p>
        Active provider calls:{" "}
        <output aria-label="Active server provider calls">
          {active.length}
        </output>
        {" · "}
        Canceled providers still occupying slots:{" "}
        <output aria-label="Canceled server provider calls">
          {active.filter((item) => item.request.signal.aborted).length}
        </output>
        {" · "}
        Current-query pending requests:{" "}
        <output aria-label="Pending server requests">
          {snapshot.loading.length}
        </output>
        {" · "}
        Limits: {model.maxConcurrentRequests} active, {model.maxPendingRequests}{" "}
        pending.
      </p>
      <details>
        <summary>Recent provider events</summary>
        <ol aria-label="Server provider events">
          {history.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ol>
      </details>
      <ServerDataGrid
        model={model}
        columns={columns}
        direction={direction}
        height={240}
        ariaLabel="Bounded server root"
      />
    </article>
  );
}
