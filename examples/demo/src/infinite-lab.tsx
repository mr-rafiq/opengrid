import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { InfiniteRowModel, type Column } from "@opengrid/core";
import { InfiniteDataGrid } from "@opengrid/react";

type Record = { id: string; name: string; amount: number };
const columns: Column<Record>[] = [
  { id: "name", field: "name", header: "Record", width: 210, pinned: "left" },
  ...Array.from({ length: 20 }, (_, index): Column<Record> => ({
    id: `metric-${index}`,
    header: `Metric ${index + 1}`,
    width: 130,
    valueGetter: (row) => row.amount + index,
  })),
  {
    id: "amount",
    field: "amount",
    header: "Value",
    type: "number",
    width: 130,
    pinned: "right",
  },
];
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

/** Real pull requests over a generated local dataset; no hosted service or subscription. */
export function InfiniteLab({ direction }: { direction: "ltr" | "rtl" }) {
  const [mode, setMode] = useState("unknown");
  const [minimum, setMinimum] = useState("0");
  const [notice, setNotice] = useState("");
  const [requests, setRequests] = useState<string[]>([]);
  const failNext = useRef(false);
  const model = useMemo(() => {
    const count = mode === "unknown" ? 137 : 1_000_000;
    return new InfiniteRowModel<Record>(
      {
        getRows: async (request) => {
          const filter = request.filters.amount;
          const minimum =
            filter?.op === "gte" && "value" in filter
              ? Number(filter.value)
              : 0;
          if (!Number.isSafeInteger(minimum) || minimum < 0)
            throw new Error("Invalid simulated minimum value");
          const lower = Math.min(count, minimum),
            filteredCount = count - lower;
          const descending = request.sorting[0]?.direction === "desc";
          setRequests((previous) =>
            [
              ...previous,
              `${request.startRow}–${request.endRow}, ${descending ? "descending" : "ascending"}, minimum ${lower}`,
            ].slice(-8),
          );
          await delay(request.signal);
          if (failNext.current) {
            failNext.current = false;
            throw new Error("Simulated infinite provider failure");
          }
          const rows = Array.from(
            {
              length: Math.max(
                0,
                Math.min(request.endRow, filteredCount) - request.startRow,
              ),
            },
            (_, offset) => {
              const index = request.startRow + offset,
                value = descending ? count - 1 - index : lower + index;
              return {
                id: `infinite-${value}`,
                name: `Record ${value}`,
                amount: value,
              };
            },
          );
          return {
            rows,
            ...(mode !== "unknown" || rows.length < 25
              ? { rowCount: filteredCount }
              : {}),
          };
        },
      },
      {
        getRowId: (row) => row.id,
        blockSize: 25,
        maxBlocks: 4,
        maxConcurrent: 2,
      },
    );
  }, [mode]);
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const query = model.getQuery();
  const owners = useRef(new WeakMap<InfiniteRowModel<Record>, object>());
  useEffect(() => {
    const ticket = {};
    owners.current.set(model, ticket);
    return () =>
      queueMicrotask(() => {
        if (owners.current.get(model) === ticket) {
          owners.current.delete(model);
          model.dispose();
        }
      });
  }, [model]);
  function apply() {
    const value = Number(minimum);
    if (!Number.isSafeInteger(value) || value < 0) {
      setNotice("Enter a nonnegative whole number");
      return;
    }
    setNotice("");
    model.setQuery({ filters: value ? { amount: { op: "gte", value } } : {} });
  }
  return (
    <article aria-label="Infinite pull example" style={{ marginTop: 24 }}>
      <h3>Infinite blocks: scroll to pull the next window</h3>
      <p>
        Generated local records arrive in delayed 25-row blocks. The unknown
        total extends until the final block; known mode exposes one million rows
        without allocating them. Sorting and filtering execute in the simulated
        provider. Query changes start at row zero; Refresh retains position.
        This grid is read-only.
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "end",
          marginBottom: 12,
        }}
      >
        <label>
          Infinite dataset{" "}
          <select
            aria-label="Infinite dataset"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setMinimum("0");
              setRequests([]);
              setNotice("");
              failNext.current = false;
            }}
          >
            <option value="unknown">Unknown total: 137 records</option>
            <option value="million">Known total: one million</option>
          </select>
        </label>
        <button
          type="button"
          disabled={snapshot.loading}
          onClick={() =>
            model.setQuery({
              sorting:
                query.sorting[0]?.direction === "desc"
                  ? []
                  : [{ columnId: "amount", direction: "desc" }],
            })
          }
        >
          Sort infinite{" "}
          {query.sorting[0]?.direction === "desc" ? "ascending" : "descending"}
        </button>
        <label>
          Minimum value{" "}
          <input
            type="number"
            min="0"
            step="1"
            aria-label="Minimum infinite value"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          />
        </label>
        <button type="button" disabled={snapshot.loading} onClick={apply}>
          Apply infinite filter
        </button>
        <button
          type="button"
          disabled={snapshot.loading}
          onClick={() => {
            setMinimum("0");
            model.setQuery({ sorting: [], filters: {} });
          }}
        >
          Reset infinite query
        </button>
        <button
          type="button"
          disabled={snapshot.loading}
          onClick={() => model.refresh()}
        >
          Refresh infinite rows
        </button>
        <button
          type="button"
          disabled={snapshot.loading}
          onClick={() => {
            failNext.current = true;
            model.refresh();
          }}
        >
          Simulate infinite failure
        </button>
      </div>
      {notice && <p role="alert">{notice}</p>}
      <p role="status" data-testid="infinite-cache">
        Total {snapshot.rowCount === null ? "unknown" : snapshot.rowCount};
        cached blocks {snapshot.cachedBlocks.join(", ") || "none"}; pending{" "}
        {snapshot.pendingBlocks.length}; queued {snapshot.queuedBlocks.length}.
      </p>
      <InfiniteDataGrid
        model={model}
        columns={columns}
        height={270}
        direction={direction}
        ariaLabel="Simulated infinite records"
      />
      <details>
        <summary>Last eight provider requests</summary>
        <ol data-testid="infinite-requests">
          {requests.map((request, index) => (
            <li key={index}>{request}</li>
          ))}
        </ol>
      </details>
    </article>
  );
}
