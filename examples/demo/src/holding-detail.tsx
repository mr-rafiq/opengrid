import { useMemo } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";
interface HoldingLike {
  id: string;
  company: string;
  symbol: string;
  price: number;
  shares: number;
}
interface Execution {
  id: string;
  date: string;
  venue: string;
  quantity: number;
  price: number;
}
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const columns: Column<Execution>[] = [
  {
    id: "date",
    field: "date",
    header: "Execution date",
    type: "date",
    width: 160,
  },
  { id: "venue", field: "venue", header: "Venue", width: 140 },
  {
    id: "quantity",
    field: "quantity",
    header: "Quantity",
    type: "number",
    width: 130,
    editable: true,
    validate: (value) =>
      Number(value) >= 0 ? undefined : "Quantity must be positive",
  },
  {
    id: "price",
    field: "price",
    header: "Execution price",
    type: "number",
    width: 160,
    editable: true,
    valueFormatter: (value) => currency.format(Number(value)),
  },
  {
    id: "notional",
    header: "Notional",
    type: "number",
    width: 160,
    valueGetter: (row) => row.quantity * row.price,
    valueFormatter: (value) => currency.format(Number(value)),
  },
];
export function HoldingDetail({
  holding,
  dark = false,
}: {
  holding: HoldingLike;
  dark?: boolean;
}) {
  const model = useMemo(() => {
    const first = Math.floor(holding.shares * 0.5),
      second = Math.floor(holding.shares * 0.3);
    return createGrid<Execution>({
      rows: [first, second, holding.shares - first - second].map(
        (quantity, index) => ({
          id: `${holding.id}:execution:${index}`,
          date: `2026-10-${27 + index}`,
          venue: ["Primary", "Secondary", "Closing"][index],
          quantity,
          price: holding.price,
        }),
      ),
      columns,
      getRowId: (row) => row.id,
    });
  }, [holding.id, holding.price, holding.shares]);
  return (
    <section>
      <h3>{holding.company} position details</h3>
      <p>
        Illustrative execution data for {holding.symbol}. The nested grid has
        independent editing, selection and history.
      </p>
      <DataGrid
        model={model}
        height={180}
        rowHeight={30}
        toolbar={false}
        pagination={false}
        selectionMode="none"
        notes={false}
        className={dark ? "og-dark" : ""}
        ariaLabel={`Executions for ${holding.symbol}`}
      />
    </section>
  );
}
