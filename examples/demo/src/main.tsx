import React, { useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  createGrid,
  pivot,
  transformValues,
  formatValueRatio,
  type ValueTransform,
  type Column,
  type CellRange,
  type RowNode,
} from "@opengrid/core";
import {
  DataGrid,
  GridChart,
  GridPrintView,
  NumberRangeFilter,
} from "@opengrid/react";
import "@opengrid/react/styles.css";
import "./page.css";
import { FormulaLab } from "./formula-lab";
import { RemoteLab } from "./remote-lab";
import { HoldingDetail } from "./holding-detail";
import { ImportLab } from "./import-lab";
import { AlignedLab } from "./aligned-lab";
import { HoldingSummary } from "./holding-summary";
import { CalculatedLab } from "./calculated-lab";
import { SpanLab } from "./span-lab";
import { RowSpanLab } from "./row-span-lab";
import { CombinedSpanLab } from "./combined-span-lab";
import { RichEditorLab } from "./rich-editor-lab";
import { LocaleLab } from "./locale-lab";
import { DirectionLab } from "./direction-lab";
import { SetFilterLab } from "./set-filter-lab";
import { FormulaGridLab } from "./formula-grid-lab";
import { SizingLab } from "./sizing-lab";
import { ConditionFilterLab } from "./condition-filter-lab";
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
const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (v: unknown) => moneyFormat.format(Number(v));
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
const topHoldingPins = ["1", "2"] as const;
const bottomHoldingPins = ["100"] as const;
const isSummaryRow = (node: RowNode<Holding>) =>
  node.kind === "row" && node.id === "3";
const summaryRowHeight = (node: RowNode<Holding>) =>
  isSummaryRow(node) ? 92 : 38;
const rangeFilterComponents = {
  price: NumberRangeFilter,
  shares: NumberRangeFilter,
};
function App() {
  const [size, setSize] = useState(1000);
  const [mode, setMode] = useState<"flat" | "group" | "tree">("flat");
  const [dark, setDark] = useState(false);
  const [pivotOpen, setPivotOpen] = useState(false);
  const [pivotMode, setPivotMode] = useState<
    | "raw"
    | "percentOfRowTotal"
    | "percentOfColumnTotal"
    | "percentOfGrandTotal"
    | "runningTotal"
    | "differenceFromPrevious"
    | "percentDifferenceFromPrevious"
  >("raw");
  const [alignedOpen, setAlignedOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chartRange, setChartRange] = useState<CellRange | null>(null);
  const [wide, setWide] = useState(false);
  const [groupHeaders, setGroupHeaders] = useState(false);
  const [rowEditing, setRowEditing] = useState(false);
  const [pinnedRows, setPinnedRows] = useState(false);
  const [fullWidthRows, setFullWidthRows] = useState(false);
  const [customFilters, setCustomFilters] = useState(false);
  const [rowDragging, setRowDragging] = useState(false);
  const [calculatedOpen, setCalculatedOpen] = useState(false);
  const [spansOpen, setSpansOpen] = useState(false);
  const [rowSpansOpen, setRowSpansOpen] = useState(false);
  const [combinedSpansOpen, setCombinedSpansOpen] = useState(false);
  const [richEditorOpen, setRichEditorOpen] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);
  const [directionOpen, setDirectionOpen] = useState(false);
  const [setFilterOpen, setSetFilterOpen] = useState(false);
  const [formulaGridOpen, setFormulaGridOpen] = useState(false);
  const [sizingOpen, setSizingOpen] = useState(false);
  const [conditionFilterOpen, setConditionFilterOpen] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");
  const activeColumns = useMemo(() => {
    const schema = wide
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
      : columns;
    return groupHeaders
      ? schema.map((column) => ({
          ...column,
          groupPath:
            column.id === "company"
              ? ["Identity"]
              : [
                  "Portfolio",
                  ["price", "shares", "value"].includes(column.id)
                    ? "Position"
                    : column.id.startsWith("metric")
                      ? "Metrics"
                      : "Profile",
                ],
        }))
      : schema;
  }, [wide, groupHeaders]);
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
  const transformed =
    pivotOpen && totals.columns.length > 0 && pivotMode !== "raw"
      ? transformValues(totals, {
          columns: totals.columns,
          transform: ([
            "runningTotal",
            "differenceFromPrevious",
            "percentDifferenceFromPrevious",
          ].includes(pivotMode)
            ? { type: pivotMode, axis: "columns" }
            : { type: pivotMode }) as ValueTransform,
        })
      : null;
  const displayTotals = transformed ?? totals;
  const percentMode = pivotMode.startsWith("percent");
  function pivotText(value: unknown) {
    if (value == null) return "—";
    if (typeof value === "object" && "kind" in value && value.kind === "ratio")
      return formatValueRatio(value as Parameters<typeof formatValueRatio>[0], {
        style: percentMode ? "percent" : "decimal",
        fractionDigits: 2,
      });
    if (typeof value === "number")
      return percentMode
        ? new Intl.NumberFormat("en-US", {
            style: "percent",
            maximumFractionDigits: 2,
          }).format(value)
        : value.toLocaleString();
    return String(value);
  }
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
        <a className="brand" href="#" aria-label="OpenGrid home">
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
          <a href="https://mr-rafiq.github.io/opengrid/" className="wordmark">
            OpenGrid <span>LAB</span>
          </a>
          <div className="nav-actions">
            <a href="https://mr-rafiq.github.io/opengrid/docs/feature-parity/">
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
            <div
              className="view-controls"
              style={{
                flex: "1 1 440px",
                minWidth: 0,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <button aria-pressed={wide} onClick={() => setWide(!wide)}>
                Wide schema
              </button>
              <button
                aria-pressed={groupHeaders}
                onClick={() => setGroupHeaders(!groupHeaders)}
              >
                Column groups
              </button>
              <button
                aria-pressed={rowEditing}
                onClick={() => setRowEditing(!rowEditing)}
              >
                Row editing
              </button>
              <button
                aria-pressed={detailsOpen}
                onClick={() => setDetailsOpen(!detailsOpen)}
              >
                Detail rows
              </button>
              <button
                aria-pressed={pinnedRows}
                onClick={() => setPinnedRows(!pinnedRows)}
              >
                Pinned rows
              </button>
              <button
                aria-pressed={fullWidthRows}
                onClick={() => setFullWidthRows(!fullWidthRows)}
              >
                Full-width rows
              </button>
              <button
                aria-pressed={customFilters}
                onClick={() => setCustomFilters(!customFilters)}
              >
                Custom filters
              </button>
              <button
                aria-pressed={rowDragging}
                onClick={() => setRowDragging(!rowDragging)}
              >
                Row dragging
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
            rowDragging={rowDragging}
            filterComponents={customFilters ? rangeFilterComponents : undefined}
            pinnedTopRowIds={pinnedRows ? topHoldingPins : undefined}
            pinnedBottomRowIds={pinnedRows ? bottomHoldingPins : undefined}
            isFullWidthRow={fullWidthRows ? isSummaryRow : undefined}
            renderFullWidthRow={
              fullWidthRows
                ? ({ node }) =>
                    node.data ? <HoldingSummary holding={node.data} /> : null
                : undefined
            }
            getRowHeight={fullWidthRows ? summaryRowHeight : undefined}
            editMode={rowEditing ? "row" : "cell"}
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
            detailHeight={360}
            renderDetail={
              detailsOpen
                ? ({ row }) => <HoldingDetail holding={row} dark={dark} />
                : undefined
            }
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
            <label>
              Show pivot values as{" "}
              <select
                aria-label="Show pivot values as"
                value={pivotMode}
                onChange={(event) =>
                  setPivotMode(event.target.value as typeof pivotMode)
                }
              >
                <option value="raw">Raw shares</option>
                <option value="percentOfRowTotal">Percent of row total</option>
                <option value="percentOfColumnTotal">
                  Percent of column total
                </option>
                <option value="percentOfGrandTotal">
                  Percent of grand total
                </option>
                <option value="runningTotal">
                  Running total across regions
                </option>
                <option value="differenceFromPrevious">
                  Difference from previous region
                </option>
                <option value="percentDifferenceFromPrevious">
                  Percent difference from previous region
                </option>
              </select>
            </label>
            {transformed && (
              <p>
                {transformed.diagnostics.length} diagnostic cells. Blank results
                preserve missing values or invalid denominators; raw model
                values remain unchanged.
              </p>
            )}
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
                {displayTotals.rows.map((r) => (
                  <tr key={String(r.keys[0])}>
                    <th>{String(r.keys[0])}</th>
                    {totals.columns.map((c) => (
                      <td key={c}>{pivotText(r.cells[c])}</td>
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
        <section className="pivot-panel">
          <button
            onClick={() => setRemoteOpen(!remoteOpen)}
            aria-expanded={remoteOpen}
          >
            Remote model lab
          </button>
          {remoteOpen && <RemoteLab />}
        </section>
        <ImportLab />
        <section className="pivot-panel">
          <button
            onClick={() => setCalculatedOpen(!calculatedOpen)}
            aria-expanded={calculatedOpen}
          >
            Calculated columns lab
          </button>
          {calculatedOpen && <CalculatedLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setSpansOpen(!spansOpen)}
            aria-expanded={spansOpen}
          >
            Column spans lab
          </button>
          {spansOpen && <SpanLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setRowSpansOpen(!rowSpansOpen)}
            aria-expanded={rowSpansOpen}
          >
            Row spans lab
          </button>
          {rowSpansOpen && <RowSpanLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setCombinedSpansOpen(!combinedSpansOpen)}
            aria-expanded={combinedSpansOpen}
          >
            Combined spans lab
          </button>
          {combinedSpansOpen && <CombinedSpanLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setRichEditorOpen(!richEditorOpen)}
            aria-expanded={richEditorOpen}
          >
            Rich choice editor lab
          </button>
          {richEditorOpen && <RichEditorLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setLocaleOpen(!localeOpen)}
            aria-expanded={localeOpen}
          >
            Localization lab
          </button>
          {localeOpen && <LocaleLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setSetFilterOpen(!setFilterOpen)}
            aria-expanded={setFilterOpen}
          >
            Set-filter lab
          </button>
          {setFilterOpen && <SetFilterLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setFormulaGridOpen(!formulaGridOpen)}
            aria-expanded={formulaGridOpen}
          >
            Formula grid lab
          </button>
          {formulaGridOpen && <FormulaGridLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setSizingOpen(!sizingOpen)}
            aria-expanded={sizingOpen}
          >
            Column sizing lab
          </button>
          {sizingOpen && <SizingLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setConditionFilterOpen(!conditionFilterOpen)}
            aria-expanded={conditionFilterOpen}
          >
            Column conditions lab
          </button>
          {conditionFilterOpen && <ConditionFilterLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setDirectionOpen(!directionOpen)}
            aria-expanded={directionOpen}
          >
            RTL direction lab
          </button>
          {directionOpen && <DirectionLab />}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setPrintOpen(!printOpen)}
            aria-expanded={printOpen}
          >
            Print view
          </button>
          {printOpen && (
            <GridPrintView
              model={model}
              scope={mode === "flat" ? "page" : "view"}
              title="Portfolio print snapshot"
              caption="Captured portfolio data; refresh explicitly after changing the grid."
              orientation="landscape"
              pageSize="A4"
            />
          )}
        </section>
        <section className="pivot-panel">
          <button
            onClick={() => setAlignedOpen(!alignedOpen)}
            aria-expanded={alignedOpen}
          >
            Aligned columns lab
          </button>
          {alignedOpen && <AlignedLab />}
        </section>
        <footer>
          <span>Built for developers who want control.</span>
          <span>
            Early preview ·{" "}
            <a href="https://mr-rafiq.github.io/opengrid/docs/feature-parity/">
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
