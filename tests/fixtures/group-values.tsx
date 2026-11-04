import "@vitejs/plugin-react/preamble";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid, useGridTheme } from "@opengrid/react";
import "@opengrid/react/styles.css";
class Category {
  #key: string;
  constructor(key: string) {
    this.#key = key;
  }
  key() {
    return this.#key;
  }
  label() {
    return `Category ${this.#key}`;
  }
  toString(): string {
    throw new Error("Unexpected category coercion");
  }
}
class Line {
  #tag = "original-line";
  constructor(
    public id: string,
    public category: Category,
    public amount: number,
  ) {}
  tag() {
    return this.#tag;
  }
}
const money = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
class Caption {
  #label: string;
  constructor(
    label: string,
    public total: number,
  ) {
    this.#label = label;
  }
  label() {
    return `${this.#label} · ${money.format(this.total)}`;
  }
  toString(): string {
    throw new Error("Unexpected caption coercion");
  }
}
const rows = Array.from(
  { length: 120 },
  (_, index) =>
    new Line(
      `line-${index + 1}`,
      new Category(["A", "B", "C"][index % 3]),
      index + 1,
    ),
);
const total = (node: {
  readonly children?: readonly { readonly data?: Line }[];
}) => node.children!.reduce((sum, child) => sum + child.data!.amount, 0);
function definitions(metadataOnly: boolean): Column<Line>[] {
  return [
    {
      id: "business",
      header: "Ledger",
      width: 280,
      valueGetter: (row) => row.amount,
      valueFormatter: (value) => money.format(Number(value)),
      groupValueGetter: (node) => {
        if (node.kind !== "group" || node.data !== undefined)
          throw new Error("Generated group callback received source data");
        return metadataOnly
          ? undefined
          : new Caption((node.groupValue as Category).label(), total(node));
      },
      aggregateFormatter: (value, context) =>
        value instanceof Caption ? value.label() : (context.groupLabel ?? ""),
      compareBlankValues: true,
      compare: (a, b, context) =>
        context.nodeA
          ? total(context.nodeA) - total(context.nodeB!)
          : Number(a) - Number(b),
    },
    {
      id: "category",
      header: "Category",
      valueGetter: (row) => row.category,
      groupKeyGetter: (value, row) => {
        if (value !== row.category)
          throw new Error("Grouping borrowed a different value");
        return row.category.key();
      },
      valueFormatter: (value) => (value as Category).label(),
      hidden: true,
    },
    {
      id: "amount",
      field: "amount",
      header: "Amount",
      type: "number",
      width: 160,
      valueFormatter: (value) => money.format(Number(value)),
    },
  ];
}
declare global {
  interface Window {
    __keyedGroups?: {
      runtime: string;
      read(): {
        source: number;
        instances: number;
        filtered: number;
        groups: number;
        keys: string[];
        originalRows: boolean;
      };
    };
  }
}
function App() {
  useGridTheme();
  const [metadataOnly, setMetadataOnly] = useState(false);
  const [model] = useState(() =>
    createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: definitions(false),
      readOnly: true,
      initialState: { groupBy: ["category"], pageSize: 1000 },
    }),
  );
  window.__keyedGroups = {
    runtime: React.version,
    read: () => ({
      source: model.getRows().length,
      instances: new Set(rows.map((row) => row.category)).size,
      filtered: model.getFilteredRows().length,
      groups: model.getRowHierarchy!("sorted").length,
      keys: model.getRowHierarchy!("sorted").map((node) =>
        String(node.groupKey),
      ),
      originalRows: model
        .getRows()
        .every(
          (row, index) => row === rows[index] && row.tag() === "original-line",
        ),
    }),
  };
  return (
    <main
      style={{
        width: "calc(100% - 24px)",
        maxWidth: 1100,
        margin: "12px auto",
        fontFamily: "sans-serif",
      }}
    >
      <h1>Keyed business groups</h1>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}
      >
        <button type="button" onClick={() => model.setSort("business", "desc")}>
          Sort totals descending
        </button>
        <button
          type="button"
          onClick={() => model.setFilter("amount", { op: "gt", value: 100 })}
        >
          Filter last 20
        </button>
        <button type="button" onClick={() => model.setFilter("amount")}>
          Clear filter
        </button>
        <button
          type="button"
          aria-pressed={metadataOnly}
          onClick={() => {
            model.setColumns(definitions(!metadataOnly));
            setMetadataOnly(!metadataOnly);
          }}
        >
          Metadata-only values
        </button>
      </div>
      <DataGrid
        model={model}
        selectionMode="none"
        ariaLabel="Keyed group fixture"
        height={400}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
