import { useMemo, useRef, useState } from "react";
import { createGrid } from "@opengrid/core";
import { DataGrid, denormalizeScrollLeft } from "@opengrid/react";

type Item = {
  id: string;
  region: string;
  team: string;
  amount: number;
  detail: string;
  span: number;
  extra: string;
};
export function CombinedSpanLab() {
  const model = useMemo(
    () =>
      createGrid<Item>({
        rows: Array.from({ length: 360 }, (_, index) => ({
          id: `merge${index + 1}`,
          region: `Cluster ${Math.floor(index / 30) + 1}`,
          team: `Member group ${Math.floor(index / 10) + 1}`,
          amount: index + 1,
          detail: `Record ${index + 1}`,
          span: 2,
          extra: `Extra ${index + 1}`,
        })),
        getRowId: (row) => row.id,
        columns: [
          {
            id: "region",
            field: "region",
            header: "Region",
            width: 160,
            colSpan: (row) => row.span,
            spanRows: true,
            editable: true,
          },
          {
            id: "team",
            field: "team",
            header: "Team",
            width: 180,
            spanRows: true,
            editable: true,
          },
          { id: "detail", field: "detail", header: "Detail", width: 220 },
          { id: "extra", field: "extra", header: "Extra", width: 180 },
          {
            id: "amount",
            field: "amount",
            header: "Amount",
            width: 120,
            type: "number",
            pinned: "right",
            editable: true,
          },
        ],
      }),
    [],
  );
  const shell = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [pinned, setPinned] = useState(false),
    [changing, setChanging] = useState(false);
  return (
    <section aria-label="Combined span example">
      <h2>Rectangular merged cells</h2>
      <p>
        One owner spans adjacent rows only while its horizontal footprint stays
        the same. Edit an owner to split its region, then Undo to restore it.
        Find searches displayed owners. Row selection stays independent; grid
        range, clipboard and fill operations remain unavailable.
      </p>
      <div className="explorer-controls">
        <button
          type="button"
          onClick={() => setDirection(direction === "ltr" ? "rtl" : "ltr")}
        >
          Merged direction {direction === "ltr" ? "RTL" : "LTR"}
        </button>
        <button
          type="button"
          onClick={() => {
            model.setState({
              columnPinning: {
                region: pinned ? null : "left",
                team: pinned ? null : "left",
                amount: "right",
              },
            });
            setPinned(!pinned);
          }}
        >
          {pinned ? "Unpin merged columns" : "Pin merged columns"}
        </button>
        <button
          type="button"
          onClick={() => {
            model.setRows(
              model.getRows().map((row, index) => ({
                ...row,
                span: !changing && index % 30 >= 15 ? 1 : 2,
              })),
            );
            setChanging(!changing);
          }}
        >
          {changing ? "Use uniform footprints" : "Use changing footprints"}
        </button>
        <button
          type="button"
          onClick={() => {
            const grid = shell.current?.querySelector<HTMLElement>(
              '[role="grid"],[role="treegrid"]',
            );
            if (!grid) return;
            grid.scrollTop = 20 * 38;
            grid.scrollLeft = denormalizeScrollLeft(
              200,
              Math.max(0, grid.scrollWidth - grid.clientWidth),
              direction,
            );
            grid.dispatchEvent(new Event("scroll"));
          }}
        >
          Scroll inside first rectangle
        </button>
        <button
          type="button"
          onClick={() => model.editCell("merge1", "region", "Changed owner")}
        >
          Split first region
        </button>
      </div>
      <div
        ref={shell}
        style={{ width: 620, maxWidth: "100%" }}
        data-testid="combined-container"
      >
        <DataGrid
          model={model}
          direction={direction}
          ariaLabel="Merged inventory"
          height={350}
          pagination={false}
          columnOverscan={0}
          overscan={0}
        />
      </div>
    </section>
  );
}
