import { useMemo, useState, type CSSProperties } from "react";
import { Ag31ClientGrid, type Ag31ColumnDefinition } from "@opengrid/react";
type Record = { id: string; item: string; amount: number };
const columns: Ag31ColumnDefinition<Record>[] = [
  {
    headerName: "Estimate",
    children: [
      {
        field: "item",
        headerName: "Item",
        width: 160,
        pinned: "left",
        checkboxSelection: true,
        headerCheckboxSelection: true,
      },
    ],
  },
  {
    headerName: "Values",
    children: [
      {
        field: "amount",
        headerName: "Amount",
        width: 140,
        cellDataType: "number",
      },
    ],
  },
];
const getRowId = ({ data }: { data: Record }) => data.id;
export function LegacyHostLab() {
  const [palette, setPalette] = useState("native");
  const hostTokens =
    palette === "native"
      ? {}
      : {
          "--ag-background-color": palette === "light" ? "#fcfcfd" : "#20252d",
          "--ag-foreground-color": palette === "light" ? "#263342" : "#e4eaf1",
          "--ag-header-background-color":
            palette === "light" ? "#edf2f7" : "#29323f",
          "--ag-secondary-foreground-color":
            palette === "light" ? "#536477" : "#b8c6d6",
          "--ag-border-color": palette === "light" ? "#c7d2df" : "#506176",
          "--ag-alpine-active-color":
            palette === "light" ? "#245db4" : "#9dbff2",
          "--ag-browser-color-scheme": palette,
          "--ag-font-size": "12px",
          "--ag-font-family": "system-ui, sans-serif",
        };
  const [height, setHeight] = useState(420),
    rows = useMemo(
      () =>
        Array.from({ length: 50 }, (_, index) => ({
          id: String(index + 1),
          item: `Line ${index + 1}`,
          amount: (index + 1) * 12,
        })),
      [],
    );
  return (
    <section aria-label="Source host layout example">
      <h3>Resident host layout</h3>
      <p>
        Original synthetic records. The grid fills the space left by the
        workspace header; the parent owns its height.
      </p>
      <div className="grouping-lab-controls">
        <label>
          Host grid palette{" "}
          <select
            aria-label="Host grid palette"
            value={palette}
            onChange={(event) => setPalette(event.target.value)}
          >
            <option value="native">OpenGrid theme</option>
            <option value="light">Host light</option>
            <option value="dark">Host dark</option>
          </select>
        </label>
        <button type="button" onClick={() => setHeight(220)}>
          Shorter workspace
        </button>
        <button type="button" onClick={() => setHeight(520)}>
          Taller workspace
        </button>
      </div>
      <div
        className="source-host-shell"
        style={{
          ...(hostTokens as CSSProperties),
          display: "flex",
          flexDirection: "column",
          height,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
          border: "1px solid var(--og-border)",
        }}
      >
        <header
          style={{
            flex: "0 0 48px",
            boxSizing: "border-box",
            padding: 12,
            background: "var(--og-surface)",
          }}
        >
          Resident workspace
        </header>
        <Ag31ClientGrid
          className="source-host-grid"
          rowData={rows}
          columnDefs={columns}
          getRowId={getRowId}
          rowSelection="multiple"
          ariaLabel="Source host records"
        />
      </div>
    </section>
  );
}
