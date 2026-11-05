import "@vitejs/plugin-react/preamble";
import { createRoot } from "react-dom/client";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";
import "@opengrid/react/styles.css";
type Row = { id: string; label: string; amount: number; units: number };
const query = new URLSearchParams(location.search);
const direction = query.get("direction") === "rtl" ? "rtl" : "ltr",
  merged = query.has("merged"),
  utility = query.has("utility");
document.documentElement.dataset.ogTheme =
  query.get("theme") === "dark" ? "dark" : "light";
document.body.style.margin = "0";
const columns: Column<Row>[] = [
  {
    id: "id",
    field: "id",
    header: "Code",
    pinned: "left",
    width: 100,
    groupPath: ["Identity"],
  },
  {
    id: "label",
    field: "label",
    header: "Label",
    width: 120,
    groupPath: ["Details"],
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    pinned: "right",
    width: 100,
    groupPath: ["Totals"],
    colSpan: merged ? 2 : undefined,
  },
  {
    id: "units",
    field: "units",
    header: "Units",
    type: "number",
    pinned: "right",
    width: 90,
    groupPath: ["Totals"],
  },
];
const model = createGrid({
  rows: [
    { id: "r1", label: "First", amount: 12, units: 3 },
    { id: "r2", label: "Second", amount: 24, units: 6 },
  ],
  columns,
  getRowId: (row) => row.id,
});
createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 1000, margin: "auto", padding: 16 }}>
    <h1>Pinned column layout</h1>
    <button
      onClick={() =>
        model.setState({
          columnVisibility: {
            ...model.getState().columnVisibility,
            label: model.getState().columnVisibility.label === false,
          },
        })
      }
    >
      Toggle middle column
    </button>
    <DataGrid
      model={model}
      direction={direction}
      ariaLabel="Short pinned schema"
      height={280}
      toolbar={false}
      pagination={false}
      selectionMode={utility ? "multiple" : "none"}
    />
  </main>,
);
