import { useEffect, useMemo } from "react";
import { createGrid, createAlignedColumns, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

interface Order {
  id: string;
  company: string;
  region: string;
  amount: number;
}
const schema: Column<Order>[] = [
  {
    id: "company",
    field: "company",
    header: "Company",
    width: 180,
    pinned: "left",
  },
  { id: "region", field: "region", header: "Region", width: 140 },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    width: 130,
  },
];
export function AlignedLab() {
  const models = useMemo(
    () => [
      createGrid({
        columns: schema,
        rows: [
          { id: "a1", company: "Northstar", region: "Europe", amount: 240 },
          { id: "a2", company: "Meridian", region: "Americas", amount: 180 },
        ],
        getRowId: (r) => r.id,
      }),
      createGrid({
        columns: schema,
        rows: [
          {
            id: "b1",
            company: "Evergreen",
            region: "Asia Pacific",
            amount: 320,
          },
          { id: "b2", company: "Atlas", region: "Europe", amount: 90 },
        ],
        getRowId: (r) => r.id,
      }),
    ],
    [],
  );
  useEffect(() => {
    const link = createAlignedColumns(models);
    return () => link.dispose();
  }, [models]);
  return (
    <div>
      <h2>Aligned column models</h2>
      <p>
        Resize, hide, move or pin a shared column in either grid. Row data,
        sorting, filtering and selection remain independent. Horizontal scroll
        is independent.
      </p>
      {models.map((model, index) => (
        <DataGrid
          key={index}
          model={model}
          ariaLabel={`Aligned ${index === 0 ? "left" : "right"}`}
          height={260}
          pagination={false}
          selectionMode="none"
          cellSelection={false}
          notes={false}
          advancedFiltering={false}
        />
      ))}
    </div>
  );
}
