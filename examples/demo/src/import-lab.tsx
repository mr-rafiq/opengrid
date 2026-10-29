import { useMemo, useState } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";
interface ImportedHolding {
  id: string;
  company: string;
  symbol: string;
  sector: string;
  region: string;
  price: number;
  shares: number;
  change: number;
  active: boolean;
  marketValue?: number;
  trend?: number;
}
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const columns: Column<ImportedHolding>[] = [
  { id: "company", field: "company", header: "Company", width: 230 },
  { id: "symbol", field: "symbol", header: "Ticker", width: 100 },
  { id: "sector", field: "sector", header: "Sector", width: 140 },
  { id: "region", field: "region", header: "Region", width: 140 },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    valueFormatter: (value) => money.format(Number(value)),
    validate: (value) =>
      typeof value === "number" && value > 0
        ? undefined
        : "Price must be positive",
  },
  {
    id: "shares",
    field: "shares",
    header: "Shares",
    type: "number",
    validate: (value) =>
      Number.isSafeInteger(value) && Number(value) >= 0
        ? undefined
        : "Shares must be a whole number",
  },
  {
    id: "value",
    field: "marketValue",
    header: "Market value",
    type: "number",
    valueFormatter: (value) =>
      value == null ? "" : money.format(Number(value)),
  },
  { id: "change", field: "change", header: "Day change", type: "number" },
  { id: "active", field: "active", header: "Active", type: "boolean" },
  { id: "trend", field: "trend", header: "7-day trend", type: "number" },
];
interface Result {
  name: string;
  rows: ImportedHolding[];
  warnings: number;
  key: number;
}
export function ImportLab() {
  const [result, setResult] = useState<Result | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const model = useMemo(
    () =>
      result
        ? createGrid({ rows: result.rows, columns, getRowId: (row) => row.id })
        : null,
    [result],
  );
  async function read(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a workbook smaller than 10 MB");
      const { importXlsx } = await import("@opengrid/export");
      const parsed = await importXlsx<ImportedHolding>(
        new Uint8Array(await file.arrayBuffer()),
        {
          columns,
          mapRow: (values, rowNumber) => ({
            id: `import:${rowNumber}`,
            company: String(values.company ?? ""),
            symbol: String(values.symbol ?? ""),
            sector: String(values.sector ?? ""),
            region: String(values.region ?? ""),
            price: Number(values.price),
            shares: Number(values.shares),
            change: Number(values.change ?? 0),
            active: values.active === true,
            ...(values.value === undefined
              ? {}
              : { marketValue: Number(values.value) }),
            ...(values.trend === undefined
              ? {}
              : { trend: Number(values.trend) }),
          }),
        },
      );
      setResult({
        name: file.name,
        rows: parsed.rows,
        warnings: parsed.warnings.length,
        key: Date.now(),
      });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Workbook import failed",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="pivot-panel" aria-label="Workbook import">
      <h2>Import workbook preview</h2>
      <p>
        Choose an OpenGrid portfolio XLSX to preview it locally. The sample
        portfolio stays in place. Formula cells, merged ranges and named ranges
        are rejected by this bounded importer.
      </p>
      <label>
        Import XLSX workbook{" "}
        <input
          aria-label="Import XLSX workbook"
          type="file"
          accept=".xlsx"
          disabled={loading}
          onChange={(event) => {
            void read(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {loading && <p role="status">Reading workbook...</p>}
      {error && <p role="alert">{error}</p>}
      {result && model && (
        <div>
          <h3>{result.name}</h3>
          <p>
            {result.rows.length.toLocaleString()} imported rows ·{" "}
            {result.warnings} warnings
          </p>
          <DataGrid
            key={result.key}
            model={model}
            height={320}
            ariaLabel="Imported workbook"
          />
        </div>
      )}
    </section>
  );
}
