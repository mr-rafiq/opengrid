import { useState } from "react";
import { createGrid, type Column, type RowNode } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

interface Allocation {
  id: string;
  region: string;
  record: string;
  category: string;
  amount: number;
  team: string;
}
const columns: Column<Allocation>[] = [
  {
    id: "region",
    field: "region",
    header: "Region",
    width: 170,
    pinned: "left",
    spanRows: true,
    editable: true,
  },
  { id: "record", field: "record", header: "Record", width: 145 },
  {
    id: "category",
    field: "category",
    header: "Allocation",
    width: 160,
    spanRows: (previous, next) =>
      previous.category === next.category && previous.category !== "Individual",
    editable: true,
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    width: 125,
    editable: true,
  },
  ...Array.from({ length: 16 }, (_, index): Column<Allocation> => ({
    id: `measure${index + 1}`,
    header: `Measure ${index + 1}`,
    width: 120,
    valueGetter: (row) => `${row.id} / ${index + 1}`,
  })),
  {
    id: "team",
    field: "team",
    header: "Team",
    width: 160,
    pinned: "right",
    spanRows: true,
    editable: true,
  },
];
const topPins = ["rowspan1", "rowspan2"] as const,
  bottomPins = ["rowspan320"] as const;
const isSummary = (node: RowNode<Allocation>) => node.id === "rowspan4";
export function RowSpanLab() {
  const [model] = useState(() =>
    createGrid<Allocation>({
      columns,
      rows: Array.from({ length: 320 }, (_, index) => ({
        id: `rowspan${index + 1}`,
        record: `Record ${index + 1}`,
        region:
          index < 120
            ? "Northern desk"
            : index < 240
              ? "Southern desk"
              : "Western desk",
        category:
          index === 30 || index === 31
            ? "Individual"
            : `Allocation ${Math.floor(index / 8) + 1}`,
        amount: 100 + index,
        team: `Team ${Math.floor(index / 60) + 1}`,
      })),
      getRowId: (row) => row.id,
    }),
  );
  const [pins, setPins] = useState(false),
    [detailRows, setDetailRows] = useState<string[]>([]),
    [summary, setSummary] = useState(false);
  const details = detailRows.includes("rowspan3");
  return (
    <>
      <p>
        Adjacent equal regions and teams merge independently. Allocation uses a
        custom predicate that keeps Individual rows separate. Scroll into a long
        run to retain its original owner without rendering all covered rows.
        Editing an owner changes that source row only.
      </p>
      <div className="explorer-controls">
        <button aria-pressed={pins} onClick={() => setPins(!pins)}>
          Row span pin boundaries
        </button>
        <button
          aria-pressed={details}
          onClick={() =>
            setDetailRows((current) =>
              details
                ? current.filter((id) => id !== "rowspan3")
                : [...current, "rowspan3"],
            )
          }
        >
          Row span detail boundary
        </button>
        <button aria-pressed={summary} onClick={() => setSummary(!summary)}>
          Row span full-width boundary
        </button>
      </div>
      <DataGrid
        model={model}
        ariaLabel="Merged allocations"
        height={480}
        pagination={false}
        cellSelection
        pinnedTopRowIds={pins ? topPins : undefined}
        pinnedBottomRowIds={pins ? bottomPins : undefined}
        expandedDetailRows={detailRows}
        onExpandedDetailRowsChange={setDetailRows}
        renderDetail={({ row }) => (
          <div>
            <strong>Detail for {row.record}</strong>
            <p>This row breaks vertical merging on both sides.</p>
            <button>Allocation detail action</button>
          </div>
        )}
        detailHeight={96}
        isFullWidthRow={summary ? isSummary : undefined}
        renderFullWidthRow={({ rowId }) => (
          <div>Summary boundary for {rowId}</div>
        )}
      />
      <p>
        Row selection remains per source row. Rectangle copy/paste/fill and
        combined row-plus-column spans are outside this first vertical-span
        contract. The separate column span example demonstrates horizontal
        merging.
      </p>
    </>
  );
}
