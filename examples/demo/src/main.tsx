import React, { useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createGrid, pivot, type Column, type CellRange } from "@opengrid/core";
import { DataGrid, GridChart } from "@opengrid/react";
import "@opengrid/react/styles.css";
import "./page.css";
import { FormulaLab } from "./formula-lab";
interface Holding {
  id: string;
  company: string;
  symbol: string;
  sector: string;
  region: string;
  price: number;
  shares: number;
  change: number;
  active: boolean;
  path: string[];
}
const companies = [
  ["Northstar Labs", "NRTH", "Technology"],
  ["Evergreen Energy", "EVRG", "Energy"],
  ["Arc Health", "ARCH", "Healthcare"],
  ["Meridian Systems", "MRDN", "Technology"],
  ["Atlas Financial", "ATLS", "Finance"],
  ["Cobalt Industries", "CBLT", "Industrials"],
  ["Solstice Foods", "SLST", "Consumer"],
  ["Lumen Networks", "LUMN", "Technology"],
];
function makeRows(count: number): Holding[] {
  return Array.from({ length: count }, (_, i) => {
    const c = companies[i % companies.length];
    const region = ["Americas", "Europe", "Asia Pacific"][i % 3];
    return {
      id: String(i + 1),
      company: c[0] + (i >= 8 ? ` ${Math.floor(i / 8) + 1}` : ""),
      symbol: c[1],
      sector: c[2],
      region,
      price: Math.round((42 + ((i * 17.13) % 390)) * 100) / 100,
      shares: 50 + ((i * 37) % 950),
      change: Math.round(Math.sin(i * 3.1) * 4.5 * 100) / 100,
      active: i % 4 !== 0,
      path: [region, c[2], String(i + 1)],
    };
  });
}
const money = (v: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v),
  );
const columns: Column<Holding>[] = [
  {
    id: "company",
    field: "company",
    header: "Company",
    width: 235,
    pinned: "left",
    editable: true,
  },
  { id: "symbol", field: "symbol", header: "Ticker", width: 110 },
  {
    id: "sector",
    field: "sector",
    header: "Sector",
    width: 150,
    editable: true,
  },
  { id: "region", field: "region", header: "Region", width: 150 },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    width: 125,
    editable: true,
    valueFormatter: money,
    validate: (v) => (Number(v) > 0 ? undefined : "Price must be positive"),
    aggregate: "avg",
  },
  {
    id: "shares",
    field: "shares",
    header: "Shares",
    type: "number",
    width: 110,
    editable: true,
    validate: (v) =>
      Number.isInteger(v) && Number(v) >= 0
        ? undefined
        : "Use a whole positive number",
    aggregate: "sum",
  },
  {
    id: "value",
    header: "Market value",
    width: 155,
    type: "number",
    valueGetter: (row) => row.price * row.shares,
    valueFormatter: money,
    aggregate: "sum",
  },
  {
    id: "change",
    field: "change",
    header: "Day change",
    type: "number",
    width: 130,
    valueFormatter: (v) => `${Number(v) > 0 ? "+" : ""}${v}%`,
  },
  {
    id: "active",
    field: "active",
    header: "Active",
    type: "boolean",
    width: 100,
    editable: true,
  },
  {
    id: "trend",
    header: "7-day trend",
    width: 145,
    pinned: "right",
    valueGetter: (r) => r.price,
  },
];
function App() {
  const [size, setSize] = useState(1000);
  const [mode, setMode] = useState<"flat" | "group" | "tree">("flat");
  const [dark, setDark] = useState(false);
  const [pivotOpen, setPivotOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [chartRange, setChartRange] = useState<CellRange | null>(null);
  const [wide, setWide] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");
  const activeColumns = useMemo(
    () =>
      wide
        ? [
            ...columns,
            ...Array.from({ length: 120 }, (_, i): Column<Holding> => ({
              id: `metric${i + 1}`,
              header: `Metric ${i + 1}`,
              width: 120,
              type: "number",
              valueGetter: (r) => Math.round(r.price * (i + 1) * 100) / 100,
            })),
          ]
        : columns,
    [wide],
  );
  const model = useMemo(
    () =>
      createGrid({
        rows: makeRows(size),
        columns: activeColumns,
        getRowId: (r) => r.id,
        getTreePath: mode === "tree" ? (r) => r.path : undefined,
        initialState: {
          pageSize: 100,
          groupBy: mode === "group" ? ["sector"] : [],
        },
      }),
    [size, mode, activeColumns],
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const totals = pivot({
    rows: model.getFilteredRows(),
    rowKeys: ["sector"],
    pivotKey: "region",
    values: [{ field: "shares", aggregate: "sum" }],
  });
  function download() {
    const blob = new Blob([model.exportCsv()], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opengrid-holdings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function downloadDocument(format: "xlsx" | "pdf") {
    setExporting(format);
    setExportError("");
    try {
      const { exportXlsx, exportPdf } = await import("@opengrid/export");
      const options = {
        selectedOnly: state.selected.length > 0,
        getRowId: (row: Holding) => row.id,
      };
      const bytes =
        format === "xlsx"
          ? await exportXlsx(model, {
              ...options,
              sheetName: "Portfolio",
              table: true,
              freezeColumns: 1,
            })
          : await exportPdf(model, {
              ...options,
              columnIds: ["company", "sector", "price", "shares", "value"],
              orientation: "landscape",
            });
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type:
            format === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `opengrid-portfolio.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Document export failed",
      );
    } finally {
      setExporting(null);
    }
  }
  return (
    <div className={dark ? "workspace dark" : "workspace"}>
      <aside className="rail">
        <a className="brand" href="#">
          ▦
        </a>
        <span className="rail-active" title="Data explorer">
          ▤
        </span>
        <span title="Analytics">◴</span>
        <span title="Source">⌘</span>
        <span className="rail-bottom">OG</span>
      </aside>
      <main>
        <nav>
          <a href="https://github.com/mr-rafiq/opengrid" className="wordmark">
            OpenGrid <span>LAB</span>
          </a>
          <div className="nav-actions">
            <a href="https://github.com/mr-rafiq/opengrid/blob/main/docs/FEATURE_PARITY.md">
              Feature roadmap ↗
            </a>
            <a href="https://github.com/mr-rafiq/opengrid">GitHub ↗</a>
            <button
              onClick={() => setDark(!dark)}
              aria-label="Toggle dark theme"
            >
              {dark ? "☀" : "☾"}
            </button>
          </div>
        </nav>
        <header className="page-heading">
          <div>
            <div className="eyebrow">
              <span /> ORIGINAL · MIT LICENSED · REACT + TYPESCRIPT
            </div>
            <h1>Your data. Your possibilities.</h1>
            <p>
              A flexible, open-source grid engine. Explore a working portfolio
              with {size.toLocaleString()} rows.
            </p>
          </div>
          <div className="export-actions">
            <button className="primary" onClick={download}>
              ↓ Export CSV
            </button>
            <button
              disabled={exporting !== null}
              onClick={() => downloadDocument("xlsx")}
            >
              {exporting === "xlsx" ? "Preparing XLSX..." : "Export XLSX"}
            </button>
            <button
              disabled={exporting !== null}
              onClick={() => downloadDocument("pdf")}
            >
              {exporting === "pdf" ? "Preparing PDF..." : "Export PDF"}
            </button>
          </div>
        </header>
        {exportError && <div role="alert">{exportError}</div>}
        <section className="summary">
          <article>
            <span>PORTFOLIO UNIVERSE</span>
            <strong>
              {size.toLocaleString()}
              <small> holdings</small>
            </strong>
            <p>Deterministic sample data</p>
          </article>
          <article>
            <span>DATA ENGINE</span>
            <strong>Framework neutral</strong>
            <p>Typed state · composable models</p>
          </article>
          <article>
            <span>LICENSE</span>
            <strong>
              Open by design <i>MIT</i>
            </strong>
            <p>No runtime grid dependencies</p>
          </article>
        </section>
        <section className="explorer">
          <div className="explorer-top">
            <div>
              <span className="live-dot" />
              <h2>Portfolio explorer</h2>
              <span className="tag">v0.1 preview</span>
            </div>
            <div className="view-controls">
              <button aria-pressed={wide} onClick={() => setWide(!wide)}>
                Wide schema
              </button>
              <label>
                Rows{" "}
                <select
                  aria-label="Dataset size"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                >
                  {[100, 1000, 10000, 100000].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => model.undo()}>↶ Undo</button>
              <button onClick={() => model.redo()}>↷ Redo</button>
            </div>
          </div>
          <div className="view-tabs">
            <div role="group" aria-label="Data view">
              {(["flat", "group", "tree"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m === "flat"
                    ? "All holdings"
                    : m === "group"
                      ? "Group by sector"
                      : "Region tree"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPivotOpen(!pivotOpen)}
              aria-expanded={pivotOpen}
            >
              Σ Pivot summary
            </button>
          </div>
          <DataGrid
            model={model}
            onCellRangeChange={setChartRange}
            editorOptions={{
              sector: {
                type: "select",
                options: [...new Set(companies.map((c) => c[2]))].map(
                  (value) => ({ value, label: value }),
                ),
              },
              company: { type: "largeText" },
            }}
            height={480}
            className={dark ? "og-dark" : ""}
            pagination={mode === "flat"}
            ariaLabel="Portfolio holdings"
            renderCell={({ value, column, row }) =>
              column.id === "change" ? (
                <span className={Number(value) >= 0 ? "positive" : "negative"}>
                  {Number(value) >= 0 ? "↗" : "↘"}{" "}
                  {Number(value) > 0 ? "+" : ""}
                  {String(value)}%
                </span>
              ) : column.id === "symbol" ? (
                <span className="ticker">{String(value)}</span>
              ) : column.id === "active" ? (
                <span className={value ? "active-pill" : "inactive-pill"}>
                  {value ? "Active" : "Paused"}
                </span>
              ) : column.id === "trend" ? (
                <svg
                  role="img"
                  aria-label={`${row.symbol} illustrative trend`}
                  width="112"
                  height="26"
                  viewBox="0 0 112 26"
                >
                  <polyline
                    points={Array.from(
                      { length: 10 },
                      (_, i) =>
                        `${i * 12},${13 + Math.sin(i + Number(row.id)) * 9}`,
                    ).join(" ")}
                    fill="none"
                    stroke={row.change >= 0 ? "#16825d" : "#d64c64"}
                    strokeWidth="1.8"
                  />
                </svg>
              ) : column.valueFormatter ? (
                column.valueFormatter(value, row)
              ) : (
                String(value ?? "")
              )
            }
          />
          <div className="explorer-bottom">
            <span>
              <span className="live-dot" /> Client-side model
            </span>
            <span>
              {state.selected.length} selected · Double-click or Enter to edit ·
              Shift-click headers for multi-sort
            </span>
          </div>
        </section>
        {pivotOpen && (
          <section className="pivot-panel">
            <h2>Shares by sector and region</h2>
            <p>Computed by the standalone pivot utility from filtered rows.</p>
            <table>
              <thead>
                <tr>
                  <th>Sector</th>
                  {totals.columns.map((c) => (
                    <th key={c}>{String(JSON.parse(c)[0])}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {totals.rows.map((r) => (
                  <tr key={String(r.keys[0])}>
                    <th>{String(r.keys[0])}</th>
                    {totals.columns.map((c) => (
                      <td key={c}>{Number(r.cells[c]).toLocaleString()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <section className="pivot-panel">
          <button
            onClick={() => setChartOpen(!chartOpen)}
            aria-expanded={chartOpen}
          >
            Chart data
          </button>
          {chartOpen && (
            <GridChart
              model={model}
              range={chartRange}
              xColumnId="sector"
              yColumnIds={["value"]}
              ariaLabel="Portfolio analysis"
            />
          )}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setFormulaOpen(!formulaOpen)}
            aria-expanded={formulaOpen}
          >
            Formula lab
          </button>
          {formulaOpen && (
            <FormulaLab model={model} getRowId={(row) => row.id} />
          )}
        </section>
        <footer>
          <span>Built for developers who want control.</span>
          <span>
            Early preview ·{" "}
            <a href="https://github.com/mr-rafiq/opengrid/blob/main/docs/FEATURE_PARITY.md">
              See implemented features and remaining work
            </a>
          </span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
