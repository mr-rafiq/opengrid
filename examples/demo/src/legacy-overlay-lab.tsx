import { useMemo, useRef, useState } from "react";
import { Ag31ClientGrid, type Ag31ClientGridHandle } from "@opengrid/react";
type Line = { id: string; item: string; amount: number };
const columns = [
  { field: "item", headerName: "Item", width: 180, pinned: "left" as const },
  {
    field: "amount",
    headerName: "Amount",
    width: 140,
    cellDataType: "number" as const,
  },
];
const identify = ({ data }: { data: Line }) => data.id;
function LoadingCard({ message }: { message: string }) {
  return (
    <div className="legacy-overlay-card" role="status" aria-live="polite">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="30 20"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}
export function LegacyOverlayLab() {
  const ref = useRef<Ag31ClientGridHandle<Line>>(null);
  const source = useMemo(
    () => [
      { id: "a", item: "Planning", amount: 80 },
      { id: "b", item: "Construction", amount: 240 },
    ],
    [],
  );
  const [rows, setRows] = useState<Line[] | null>(null),
    [language, setLanguage] = useState("en"),
    [custom, setCustom] = useState(false),
    [compact, setCompact] = useState(false),
    [summary, setSummary] = useState("Waiting for records");
  const german = language === "de";
  const locale = useMemo(
    () =>
      german
        ? {
            loadingOoo: "Daten werden geladen...",
            noRowsToShow: "Keine Datensätze",
          }
        : {
            loadingOoo: "Loading estimate...",
            noRowsToShow: "No estimate lines",
          },
    [german],
  );
  const update = () => {
    const api = ref.current?.api;
    if (api && !api.isDestroyed())
      setSummary(`${api.getDisplayedRowCount()} resident rows`);
  };
  return (
    <section aria-label="Source loading overlay example">
      <h3>Loading and empty states</h3>
      <p>
        Original local records. Loading blocks pointer input without moving
        keyboard focus. A null row option retains loaded records; an empty array
        clears them. No network request is made.
      </p>
      <div className="grouping-lab-controls">
        <label>
          Overlay language{" "}
          <select
            aria-label="Overlay language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => setCustom(e.target.checked)}
          />{" "}
          Custom loading component
        </label>
        <button type="button" onClick={() => setRows([...source])}>
          Load overlay records
        </button>
        <button type="button" onClick={() => setRows([])}>
          Clear overlay records
        </button>
        <button
          type="button"
          onClick={() => ref.current?.api.showLoadingOverlay()}
        >
          Show loading overlay
        </button>
        <button type="button" onClick={() => ref.current?.api.hideOverlay()}>
          Hide source overlay
        </button>
        <button
          type="button"
          onClick={() => {
            ref.current?.api.setGridOption("rowData", null);
            update();
          }}
        >
          Set null row option
        </button>
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => setCompact(!compact)}
        >
          Compact overlay host
        </button>
      </div>
      <p role="status" aria-label="Overlay record summary">
        {summary}
      </p>
      <div
        style={{
          height: compact ? 200 : 300,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <Ag31ClientGrid
          ref={ref}
          rowData={rows}
          columnDefs={columns}
          getRowId={identify}
          localeText={locale}
          loadingOverlayComponent={custom ? LoadingCard : undefined}
          loadingOverlayComponentParams={{
            message: german
              ? "Lokale Daten werden vorbereitet..."
              : "Preparing local records...",
          }}
          ariaLabel="Source overlay estimate"
          onGridReady={update}
          onRowDataUpdated={update}
        />
      </div>
    </section>
  );
}
