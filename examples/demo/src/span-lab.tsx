import { useState } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

interface RecordRow {
  id: string;
  name: string;
  expanded: boolean;
  caption: string;
  quantity: number;
}
const columns: Column<RecordRow>[] = [
  { id: "name", field: "name", header: "Record", width: 150, pinned: "left" },
  {
    id: "expanded",
    field: "expanded",
    header: "Merge detail",
    width: 120,
    type: "boolean",
    pinned: "left",
    editable: true,
    colSpan: 3,
  },
  {
    id: "caption",
    field: "caption",
    header: "Detail",
    width: 150,
    editable: true,
    colSpan: (row) => (row.expanded ? 8 : 1),
  },
  {
    id: "quantity",
    field: "quantity",
    header: "Quantity",
    width: 120,
    type: "number",
    editable: true,
  },
  ...Array.from({ length: 26 }, (_, index): Column<RecordRow> => ({
    id: `field${index + 1}`,
    header: `Field ${index + 1}`,
    width: 120,
    valueGetter: (row) =>
      row.id === "span1" && index === 0
        ? "Hidden field marker"
        : `${row.id} field ${index + 1}`,
  })),
  {
    id: "review",
    header: "Review",
    width: 120,
    pinned: "right",
    valueGetter: (row) =>
      row.expanded ? "Review across two columns" : "Review",
    colSpan: (row) => (row.expanded ? 2 : 1),
  },
  {
    id: "owner",
    header: "Owner",
    width: 120,
    pinned: "right",
    valueGetter: () => "Team",
  },
  {
    id: "status",
    header: "Status",
    width: 120,
    pinned: "right",
    valueGetter: () => "Ready",
  },
];
export function SpanLab() {
  const [model] = useState(() =>
    createGrid<RecordRow>({
      columns,
      rows: Array.from({ length: 8 }, (_, index) => ({
        id: `span${index + 1}`,
        name: `Record ${index + 1}`,
        expanded: index % 2 === 0,
        caption:
          index === 0
            ? "A wide editable detail across eight columns"
            : `Detail ${index + 1}`,
        quantity: index + 10,
      })),
      getRowId: (row) => row.id,
    }),
  );
  return (
    <>
      <p>
        Each row chooses its detail width. Left and right pin boundaries clip
        spans; scroll horizontally to keep a wide cell in view. Edit Merge
        detail to change ownership, or edit the wide Detail cell. Covered values
        remain in the source data and exports.
      </p>
      <DataGrid
        model={model}
        ariaLabel="Spanning records"
        height={450}
        pagination={false}
        cellSelection
      />
      <p>
        Column spans use one visible cell and retain logical column indices.
        Rectangle copy, paste and fill are disabled here; individual cells and
        the separate row-edit form retain their documented behavior. Row
        spanning is demonstrated separately; combining both axes in one grid
        remains unsupported.
      </p>
    </>
  );
}
