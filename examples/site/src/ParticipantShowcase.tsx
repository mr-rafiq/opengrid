import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createGrid,
  exportClientPivotCsv,
  type PivotConfiguration,
} from "@opengrid/core";
import {
  DataGrid,
  GridIcon,
  GridSidePanel,
  GridThemeSelect,
  PivotPanel,
  useClientPivot,
} from "@opengrid/react";
import { NavigationDrawer } from "../../shared/navigation-drawer";
import {
  createParticipants,
  participantColumns,
  type Participant,
} from "./participant-data";
import "./showcase.css";

const subscribeViewport = (listener: () => void) => {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
};
const readViewportHeight = () => window.innerHeight;
const serverViewportHeight = () => 900;

function CountryFlag({ country }: { country: string }) {
  // Original geometric flags; decorative because the adjacent label names the country.
  return (
    <svg
      width="24"
      height="16"
      viewBox="0 0 24 16"
      aria-hidden="true"
      className="participant-flag"
    >
      {country === "Japan" ? (
        <>
          <path fill="#fff" d="M0 0h24v16H0z" />
          <circle cx="12" cy="8" r="4.5" fill="#bb1735" />
        </>
      ) : country === "France" ? (
        <>
          <path fill="#fff" d="M0 0h24v16H0z" />
          <path fill="#183f8c" d="M0 0h8v16H0z" />
          <path fill="#ce2942" d="M16 0h8v16h-8z" />
        </>
      ) : country === "Germany" ? (
        <>
          <path fill="#171717" d="M0 0h24v6H0z" />
          <path fill="#cb2734" d="M0 5.33h24v5.34H0z" />
          <path fill="#efc440" d="M0 10.67h24V16H0z" />
        </>
      ) : country === "India" ? (
        <>
          <path fill="#ec9340" d="M0 0h24v6H0z" />
          <path fill="#fff" d="M0 5.33h24v5.34H0z" />
          <path fill="#23834b" d="M0 10.67h24V16H0z" />
          <circle cx="12" cy="8" r="1.8" fill="none" stroke="#254c8e" />
        </>
      ) : country === "Brazil" ? (
        <>
          <path fill="#247d4b" d="M0 0h24v16H0z" />
          <path fill="#efd04b" d="m12 2 10 6-10 6L2 8z" />
          <circle cx="12" cy="8" r="3.3" fill="#234880" />
        </>
      ) : (
        <>
          <path fill="#24417d" d="M0 0h24v16H0z" />
          <path
            stroke="#fff"
            strokeWidth="4"
            d="m0 0 24 16M24 0 0 16M12 0v16M0 8h24"
          />
          <path stroke="#c62b40" strokeWidth="2" d="M12 0v16M0 8h24" />
        </>
      )}
    </svg>
  );
}
function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="participant-stars"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          width="17"
          height="17"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill={index < rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8L6.6 20l1-6-4.4-4.6 6.1-.9z" />
        </svg>
      ))}
    </span>
  );
}
export function ParticipantShowcase() {
  const viewportHeight = useSyncExternalStore(
    subscribeViewport,
    readViewportHeight,
    serverViewportHeight,
  );
  const model = useMemo(
    () =>
      createGrid({
        rows: createParticipants(1000),
        columns: participantColumns(),
        getRowId: (row) => row.id,
        initialState: { pageSize: 100000 },
      }),
    [],
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [preset, setPreset] = useState("minimal");
  const [size, setSize] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"rows" | "pivot">("rows");
  const [pivotConfiguration, setPivotConfiguration] =
    useState<PivotConfiguration>({
      rows: ["country"],
      columns: ["game"],
      values: [
        { columnId: "balance", aggregate: "sum" },
        { columnId: "wins", aggregate: "sum" },
      ],
      rowTotals: true,
      grandTotal: true,
    });
  const pivot = useClientPivot(model, pivotConfiguration, {
    enabled: view === "pivot",
  });
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recordGroupWidth = useRef<number | null>(null);
  const grouped = state.groupBy.length > 0;
  const rowHeight = preset === "material" ? 48 : 40;
  // Include the grouped/leaf/filter header bands and native horizontal scrollbar.
  const gridHeight = Math.max(
    240,
    Math.min(
      590,
      Math.floor(viewportHeight * 0.65),
      model.getRowModel().length * rowHeight + 120,
    ),
  );
  useEffect(() => {
    const record = model.getColumns().find((column) => column.id === "record");
    if (!record) return;
    if (
      grouped &&
      recordGroupWidth.current === null &&
      !record.hidden &&
      (record.width ?? 95) < 220
    ) {
      recordGroupWidth.current = record.width ?? 95;
      model.resizeColumn("record", 220);
    } else if (!grouped && recordGroupWidth.current !== null) {
      const previous = recordGroupWidth.current;
      recordGroupWidth.current = null;
      // Keep an intentional resize made while the grouped view was open.
      if (record.width === 220) model.resizeColumn("record", previous);
    }
  }, [grouped, model]);
  useEffect(() => {
    try {
      if (localStorage.getItem("opengrid-showcase-preset") === "material")
        setPreset("material");
    } catch {
      /* Persistence is optional in private storage contexts. */
    }
    return () => clearTimeout(pending.current);
  }, []);
  function changeSize(count: number) {
    setBusy(true);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      model.setRows(createParticipants(count));
      model.setState({ selected: [], expanded: [], page: 0 });
      setSize(count);
      setBusy(false);
      setMessage(
        `Loaded ${count.toLocaleString("en-US")} fictional participants.`,
      );
    }, 30);
  }
  function renderCell({
    value,
    row,
    column,
  }: {
    value: unknown;
    row: Participant;
    column: ReturnType<typeof participantColumns>[number];
  }) {
    if (column.id === "country")
      return (
        <span className="participant-country">
          <CountryFlag country={row.country} />
          {row.country}
        </span>
      );
    if (column.id === "rating") return <Stars rating={Number(value)} />;
    if (column.id === "bought")
      return (
        <input
          type="checkbox"
          aria-label={`Bought game for ${row.name} (record ${row.record})`}
          checked={Boolean(value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === " ") event.stopPropagation();
          }}
          onChange={(event) => {
            const error = model.editCell(
              row.id,
              "bought",
              event.target.checked,
            );
            if (error) setMessage(error);
          }}
        />
      );
    if (column.id === "online") return value ? "Online" : "Away";
    return column.valueFormatter
      ? column.valueFormatter(value, row)
      : String(value ?? "");
  }
  return (
    <main id="main-content" className="showcase-page">
      <div className="showcase-intro">
        <div>
          <span className="section-kicker">INTERACTIVE SHOWCASE</span>
          <h1>Room to explore.</h1>
          <p>
            Choose a column and Add group, or drag a header into Row groups.
            Swipe inside the grid for more columns.
          </p>
        </div>
        <a href="../docs/showcase/">
          How this demo works <GridIcon name="arrowRight" size={16} />
        </a>
      </div>
      <div
        className={`showcase-workbench ${preset === "material" ? "og-preset-material" : ""}`}
        data-showcase-preset={preset}
      >
        <div className="showcase-controls">
          <label>
            Data size
            <select
              aria-label="Data size"
              value={size}
              disabled={busy}
              onChange={(event) => changeSize(Number(event.target.value))}
            >
              {[1000, 10000, 100000].map((count) => (
                <option key={count} value={count}>
                  {count.toLocaleString("en-US")} rows
                </option>
              ))}
            </select>
          </label>
          <label>
            Grid style
            <select
              aria-label="Grid style"
              value={preset}
              onChange={(event) => {
                const next = event.target.value;
                setPreset(next);
                try {
                  localStorage.setItem("opengrid-showcase-preset", next);
                } catch {
                  /* Current choice still applies. */
                }
              }}
            >
              <option value="minimal">Minimal</option>
              <option value="material">Material</option>
            </select>
          </label>
          <div className="showcase-appearance">
            <span>Appearance</span>
            <GridThemeSelect ariaLabel="Demo appearance" />
          </div>
          <label className="showcase-quick">
            Quick filter
            <input
              type="search"
              aria-label="Search participants"
              placeholder="Search any column…"
              value={state.quickFilter}
              onChange={(event) => model.setQuickFilter(event.target.value)}
            />
          </label>
          <button
            className="showcase-tools-toggle"
            onClick={() => setTools(true)}
            aria-haspopup="dialog"
            aria-controls="showcase-tools"
            aria-expanded={tools}
          >
            <GridIcon name="columns" size={18} />
            {view === "pivot" ? "Pivot fields" : "Columns & filters"}
          </button>
        </div>
        <div className="showcase-view-bar" role="group" aria-label="Data view">
          <div className="showcase-view-switch">
            <button
              type="button"
              aria-pressed={view === "rows"}
              onClick={() => setView("rows")}
            >
              Records
            </button>
            <button
              type="button"
              aria-pressed={view === "pivot"}
              onClick={() => setView("pivot")}
            >
              Pivot table
            </button>
          </div>
          <span>
            {view === "pivot"
              ? "Totals use filtered source records."
              : "Explore, edit and group individual records."}
          </span>
          {view === "pivot" && (
            <button
              type="button"
              disabled={!pivot.report || pivot.status !== "ready"}
              onClick={() => {
                if (!pivot.report) return;
                const url = URL.createObjectURL(
                  new Blob([exportClientPivotCsv(pivot.report)], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "opengrid-pivot.csv";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <GridIcon name="download" size={16} />
              Pivot CSV
            </button>
          )}
        </div>
        <div className="showcase-grid-layout" aria-busy={busy}>
          <div className="showcase-grid">
            <DataGrid
              model={model}
              className={view === "pivot" ? "showcase-source-hidden" : ""}
              ariaLabel="Participant showcase"
              toolbar={false}
              pagination={false}
              height={gridHeight}
              rowHeight={rowHeight}
              rowGroupPanel="always"
              rowDragging
              selectionMode="multiple"
              columnMenu={{}}
              renderCell={renderCell}
            />
            {view === "pivot" && (
              <div className="showcase-pivot-result">
                {pivot.status === "error" && (
                  <div className="showcase-pivot-notice" role="alert">
                    <h2>Could not build this pivot</h2>
                    <p>{pivot.error?.message}</p>
                    <p>
                      Choose fewer fields or use the quick filter to reduce
                      source records.
                    </p>
                  </div>
                )}
                {pivot.status === "empty" && (
                  <div className="showcase-pivot-notice">
                    <h2>Choose a value to summarize</h2>
                    <p>
                      Add a field to Values in Pivot fields. Records and edits
                      are kept.
                    </p>
                  </div>
                )}
                {pivot.status === "ready" && pivot.model && (
                  <DataGrid
                    model={pivot.model}
                    ariaLabel="Participant pivot table"
                    height={Math.max(
                      280,
                      Math.min(590, Math.floor(viewportHeight * 0.65)),
                    )}
                    rowHeight={rowHeight}
                    toolbar={false}
                    pagination={false}
                    selectionMode="none"
                    notes={false}
                    pinnedBottomRowIds={pivot.pinnedBottomRowIds}
                    columnMenu={{
                      getItems: (_context, items) => {
                        const supported = items.filter(
                          (item) => item.kind !== "separator" && !item.disabled,
                        );
                        return supported;
                      },
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <aside className="showcase-desktop-tools" aria-label="Grid tools">
            {view === "pivot" ? (
              <PivotPanel
                model={model}
                configuration={pivotConfiguration}
                onConfigurationChange={setPivotConfiguration}
              />
            ) : (
              <GridSidePanel model={model} />
            )}
          </aside>
        </div>
        <div className="showcase-status">
          <span>
            {busy
              ? "Loading participants…"
              : `${size.toLocaleString("en-US")} records · 22 columns`}
          </span>
          <span>
            {view === "pivot"
              ? `${pivot.report?.rows.length ?? 0} result rows · ${pivot.report?.sourceRowCount.toLocaleString("en-US") ?? 0} filtered records`
              : `${state.selected.length.toLocaleString("en-US")} selected`}
          </span>
          <button
            onClick={() => {
              model.setState({
                sorting: [],
                filters: {},
                quickFilter: "",
                groupBy: [],
                expanded: [],
                selected: [],
                columnVisibility: {},
                columnOrder: [],
                columnPinning: {},
                page: 0,
              });
              setMessage("View reset. Cell edits are kept.");
            }}
          >
            Reset view
          </button>
        </div>
        <NavigationDrawer
          id="showcase-tools"
          desktopWidth={1000}
          label="Grid tools"
          open={tools}
          onClose={() => setTools(false)}
        >
          {view === "pivot" ? (
            <PivotPanel
              model={model}
              configuration={pivotConfiguration}
              onConfigurationChange={setPivotConfiguration}
            />
          ) : (
            <GridSidePanel model={model} />
          )}
        </NavigationDrawer>
      </div>
      <p className="showcase-help">
        Pivot table offers Rows, Columns and Values, with sum, average, minimum,
        maximum and count. Totals reaggregate source records. This bounded
        client matrix has no hierarchical pivot drill-down; its limit is 256
        result columns and 200,000 cells. Switch back to Records to edit data.
      </p>
      <p className="showcase-help">
        Drag a column header into Row groups, or choose a column and Add. Use
        the sidebar for visibility, conditions and aggregate functions. Record
        numbers identify source records and stay stable after sorting. Changing
        data size resets edits; changing style keeps them.
      </p>
      <p className="showcase-help">
        This client-side example uses row and column virtualization. The
        100,000-row option runs in your browser; responsiveness depends on your
        device. Group amounts use currency formatting; counts stay whole
        numbers. Explore all features in the{" "}
        <a href="../demo/">component playground</a>.
      </p>
      <p className="og-visually-hidden" role="status" aria-live="polite">
        {message}
      </p>
    </main>
  );
}
