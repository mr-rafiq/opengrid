import { useEffect, useRef, useState } from "react";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
  type Ag31ColumnDefinition,
} from "@opengrid/react";

type Record = { id: string; item: string; amount: number };
const rows: Record[] = [
  { id: "a", item: "Local assembly with a longer label", amount: 125.5 },
  { id: "b", item: "Inspection", amount: 42 },
];
function Item({ value }: { value: string }) {
  const [count, setCount] = useState(0);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span>{value}</span>
      <button
        type="button"
        onClick={() => setCount(count + 1)}
        aria-label={`Local action for ${value}`}
        style={{
          border: "1px solid var(--og-control-border)",
          borderRadius: 4,
          background: "var(--og-surface)",
          color: "inherit",
          padding: "2px 6px",
          font: "inherit",
          lineHeight: 1.4,
          cursor: "pointer",
        }}
      >
        Action {count}
      </button>
    </span>
  );
}
const columns: Ag31ColumnDefinition<Record>[] = [
  {
    field: "item",
    headerName:
      "An intentionally much longer item heading that only participates when headings are included",
    width: 180,
    cellRenderer: Item,
  },
  {
    field: "amount",
    headerName: "Amount",
    width: 140,
    valueFormatter: ({ value }: { value: unknown }) =>
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(Number(value)),
  },
];
const identify = ({ data }: { data: Record }) => data.id;
export function LegacySizingLab() {
  const ref = useRef<Ag31ClientGridHandle<Record>>(null),
    active = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false),
    [summary, setSummary] = useState("Waiting for the mounted viewport"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);
  async function size(skipHeader: boolean) {
    const api = ref.current?.api;
    if (!api || api.isDestroyed()) return;
    setBusy(true);
    try {
      const report = await api.autoSizeAllColumns(skipHeader);
      if (active.current)
        setSummary(
          report.cancelled
            ? `Sizing cancelled: ${report.cancelReason}`
            : `${[...report.measured, ...report.unchanged].map((c) => `${c.columnId}: ${c.width}px`).join("; ")}. ${report.skipped.length} skipped.`,
        );
    } catch (error) {
      if (active.current)
        setSummary(error instanceof Error ? error.message : "Sizing failed");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Source rendered sizing example">
      <h3>Size mounted renderer content</h3>
      <p>
        Original local records. Sizing measures the mounted text and passive
        layout with 20px padding. It preserves each renderer’s local state. Only
        currently rendered content participates; offscreen columns, merged cells
        and full-width rows are outside this example.
      </p>
      <div className="grouping-lab-controls">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void size(true)}
        >
          Size mounted values
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void size(false)}
        >
          Size with headings
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => {
            ref.current?.api.resetColumnState();
            setSummary("Declared widths restored");
          }}
        >
          Restore declared widths
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => {
            const api = ref.current?.api;
            if (!api) return;
            api.resetColumnState();
            timer.current = setTimeout(() => {
              timer.current = null;
              if (!api.isDestroyed()) void size(true);
            }, 0);
          }}
        >
          Deferred sizing reset
        </button>
      </div>
      <p role="status" aria-label="Source sizing result">
        {summary}
      </p>
      <Ag31ClientGrid
        ref={ref}
        rowData={rows}
        columnDefs={columns}
        getRowId={identify}
        height={200}
        onGridReady={() => setReady(true)}
        ariaLabel="Source sizing records"
      />
    </section>
  );
}
