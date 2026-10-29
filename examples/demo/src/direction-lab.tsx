import { useMemo, useState } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

interface RecordRow {
  id: string;
  name: string;
  region: string;
  amount: number;
  team: string;
}
type Mode = "ordinary" | "columns" | "rows";
function makeModel(mode: Mode) {
  const columns: Column<RecordRow>[] = [
    {
      id: "name",
      field: "name",
      header: "Record",
      width: 155,
      pinned: "left",
      editable: true,
    },
    {
      id: "region",
      field: "region",
      header: "Region",
      width: 135,
      pinned: "left",
      editable: true,
      ...(mode === "rows" ? { spanRows: true } : {}),
    },
    {
      id: "amount",
      field: "amount",
      header: "Amount",
      width: 130,
      type: "number",
      editable: true,
      groupPath: ["Measures"],
    },
    ...Array.from({ length: 24 }, (_, index): Column<RecordRow> => ({
      id: `metric${index + 1}`,
      header: `Metric ${index + 1}`,
      width: 120,
      groupPath: ["Measures"],
      valueGetter: (row) => `${row.id}:${index + 1}`,
      ...(mode === "columns" && index === 0 ? { colSpan: 6 } : {}),
    })),
    {
      id: "team",
      field: "team",
      header: "Team",
      width: 125,
      pinned: "right",
      editable: true,
      ...(mode === "columns" ? { colSpan: 2 } : {}),
      ...(mode === "rows" ? { spanRows: true } : {}),
    },
    {
      id: "status",
      header: "Status",
      width: 100,
      pinned: "right",
      valueGetter: () => "Ready",
    },
  ];
  return createGrid<RecordRow>({
    columns,
    rows: Array.from({ length: 320 }, (_, index) => ({
      id: `rtl${index + 1}`,
      name: `Record ${index + 1}`,
      region: index < 120 ? "North" : "South",
      amount: index + 10,
      team: index < 60 ? "Atlas" : "Orion",
    })),
    getRowId: (row) => row.id,
  });
}
export function DirectionLab() {
  const [direction, setDirection] = useState<"ltr" | "rtl">("rtl"),
    [mode, setMode] = useState<Mode>("ordinary");
  const model = useMemo(() => makeModel(mode), [mode]);
  const toggle = () =>
    setDirection((current) => (current === "rtl" ? "ltr" : "rtl"));
  return (
    <section
      aria-label="Direction switching example"
      onKeyDownCapture={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === "d"
        ) {
          event.preventDefault();
          event.stopPropagation();
          toggle();
        }
      }}
    >
      <p>
        Switch direction while editing with Ctrl/Cmd+Shift+D. Left and right
        pins keep their physical sides; keyboard navigation and rectangular
        clipboard follow the displayed inline order. Changing the layout example
        creates fresh data. This example does not change the UI language.
      </p>
      <div className="explorer-controls">
        <button
          onPointerDown={(event) => event.preventDefault()}
          onClick={toggle}
        >
          Switch direction
        </button>
        <span role="status">Grid direction: {direction.toUpperCase()}</span>
        <label>
          Direction layout{" "}
          <select
            aria-label="Direction layout"
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
          >
            <option value="ordinary">Ordinary cells</option>
            <option value="columns">Column spans</option>
            <option value="rows">Row spans</option>
          </select>
        </label>
      </div>
      <DataGrid
        model={model}
        direction={direction}
        ariaLabel="Direction records"
        height={400}
        pagination={false}
        columnOverscan={0}
      />
    </section>
  );
}
