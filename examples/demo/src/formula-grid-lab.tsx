import { useState, useSyncExternalStore } from "react";
import {
  createFormulaGrid,
  formulaInput,
  isFormulaInput,
  isFormulaError,
  type Column,
  type FormulaGridInput,
} from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  SetListFilter,
  enUS,
  esES,
} from "@opengrid/react";

interface SheetRow {
  id: string;
  record: string;
  units: number;
  price: number;
  total: FormulaGridInput;
  analysis: FormulaGridInput;
  note: FormulaGridInput;
  region: string;
}
type SheetColumn = Exclude<keyof SheetRow, "id">;
const bindings: readonly SheetColumn[] = [
  "record",
  "units",
  "price",
  "total",
  "analysis",
  "note",
  "region",
];
const columns: Column<SheetRow>[] = [
  {
    id: "record",
    field: "record",
    header: "Record",
    type: "text",
    pinned: "left",
    width: 155,
  },
  {
    id: "units",
    field: "units",
    header: "Units",
    type: "number",
    editable: true,
    width: 125,
  },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    editable: true,
    width: 125,
  },
  {
    id: "total",
    field: "total",
    header: "Total",
    type: "number",
    editable: true,
    width: 225,
    aggregate: "sum",
  },
  {
    id: "analysis",
    field: "analysis",
    header: "Analysis",
    editable: true,
    width: 240,
  },
  { id: "note", field: "note", header: "Note", editable: true, width: 240 },
  { id: "region", field: "region", header: "Region", type: "text", width: 145 },
];
const filterComponents = { total: SetListFilter };
function initialRows(): SheetRow[] {
  return Array.from({ length: 12 }, (_, index) => {
    const row = index + 1;
    return {
      id: `formula${row}`,
      record: `Record ${row}`,
      units: 2 + index,
      price: 3 + index,
      total: formulaInput(`=B${row}*C${row}`),
      analysis: formulaInput(
        index === 0 ? "=SUM(D1:D3)" : `=IF(B${row}>0,D${row}/B${row},0)`,
      ),
      note:
        index === 0 ? "=1+2" : formulaInput(`=IF(B${row}>0,"Ready","Check")`),
      region: ["North", "South", "West"][index % 3],
    };
  });
}
function scalarText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "unavailable";
  if (typeof value === "string") return JSON.stringify(value);
  return Object.is(value, -0) ? "-0" : String(value);
}

export function FormulaGridLab() {
  const [sheet] = useState(() =>
    createFormulaGrid<SheetRow>({
      rows: initialRows(),
      columns,
      getRowId: (row) => row.id,
      formulaColumns: ["total", "analysis", "note"],
      validateFormulaResult: (result, context) => {
        if (context.cell.columnId !== "total" || isFormulaError(result)) return;
        if (
          typeof result !== "number" ||
          !Number.isFinite(result) ||
          result < 0 ||
          result > 1000000
        )
          return "Total must be a finite number from 0 to 1,000,000.";
        return;
      },
    }),
  );
  const { model, formulas } = sheet;
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [spanish, setSpanish] = useState(false),
    [rtl, setRtl] = useState(false);
  const [inspectRow, setInspectRow] = useState("formula1"),
    [inspectColumn, setInspectColumn] = useState<SheetColumn>("total");
  const [notice, setNotice] = useState("");
  const source = model.getRow(inspectRow);
  const position = { rowId: inspectRow, columnId: inspectColumn };
  const raw = formulas.supportsColumn(inspectColumn)
    ? formulas.getInput(position)
    : source?.[inspectColumn];
  const result = formulas.supportsColumn(inspectColumn)
    ? formulas.getResult(position)
    : source
      ? model.getValue(source, inspectColumn)
      : undefined;
  const expression = isFormulaInput(raw) ? raw.expression : undefined;
  const resultText = isFormulaError(result)
    ? `Error ${result.code}: ${result.message}`
    : scalarText(result);
  const switchLanguage = () => setSpanish((value) => !value);
  const switchDirection = () => setRtl((value) => !value);
  function groupRows(enabled: boolean) {
    model.setState({ groupBy: enabled ? ["region"] : [], expanded: [] });
    if (enabled)
      model.setState({
        expanded: model
          .getRowModel()
          .filter((node) => node.kind === "group")
          .map((node) => node.id),
      });
  }
  function introduceCycle() {
    const failure = formulas.setFormula(
      { rowId: "formula1", columnId: "total" },
      "=D1",
    );
    setInspectRow("formula1");
    setInspectColumn("total");
    setNotice(
      failure ??
        "D1 now references itself. Its cycle error remains visible and propagates to dependent formulas; Undo restores the previous expression.",
    );
  }
  function restore() {
    try {
      model.setRows(initialRows());
      model.setState({
        filters: {},
        quickFilter: "",
        advancedFilter: null,
        sorting: [],
        groupBy: [],
        expanded: [],
        page: 0,
      });
      setInspectRow("formula1");
      setInspectColumn("total");
      setNotice(
        "The 12 fixed source rows were restored. Initial totals are 6, 12 and 20; E1 is 38.",
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Unable to restore the formula sheet.",
      );
    }
  }
  return (
    <section
      aria-label="Formula sheet example"
      onKeyDownCapture={(event) => {
        if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
        if (event.key.toLowerCase() === "l") {
          event.preventDefault();
          event.stopPropagation();
          switchLanguage();
        }
        if (event.key.toLowerCase() === "d") {
          event.preventDefault();
          event.stopPropagation();
          switchDirection();
        }
      }}
    >
      <h2>Formula sheet</h2>
      <p>
        Edit Units or Price to recalculate the sheet. Total, Analysis and Note
        offer an explicit Formula / Literal mode; F2, double-click, double-tap
        or Edit cell opens the editor. Alt+M reaches its mode selector. Invalid
        drafts stay open; Enter or Tab commits, Escape cancels, and Undo
        restores raw expressions and literals together.
      </p>
      <div className="explorer-controls">
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={switchLanguage}
        >
          Switch formula language
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={switchDirection}
        >
          Switch formula direction
        </button>
        <span role="status">
          Formula language: {spanish ? "Spanish" : "English"}; direction:{" "}
          {rtl ? "RTL" : "LTR"}.
        </span>
        <label>
          <input
            type="checkbox"
            checked={state.groupBy.includes("region")}
            onChange={(event) => groupRows(event.target.checked)}
          />{" "}
          Group formula rows by region
        </label>
        <button type="button" onClick={introduceCycle}>
          Introduce cycle
        </button>
        <button type="button" onClick={restore}>
          Restore formula sheet
        </button>
      </div>
      <p>
        Ctrl/Cmd+Shift+L changes the built-in language and Ctrl/Cmd+Shift+D
        changes direction without leaving a live editor. Headers and source data
        remain application-owned. Total accepts finite values from 0 to
        1,000,000; typed formula errors remain inspectable. The Total Values
        filter reads computed results from all 12 resident rows.
      </p>
      {notice && <p role="status">{notice}</p>}
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <DataGrid
          model={model}
          direction={rtl ? "rtl" : "ltr"}
          ariaLabel="Formula sheet"
          height={410}
          pagination={false}
          rowDragging
          filterComponents={filterComponents}
          onCellRangeChange={(range) => {
            if (
              !range ||
              !bindings.includes(range.focus.columnId as SheetColumn)
            )
              return;
            setInspectRow(range.focus.rowId);
            setInspectColumn(range.focus.columnId as SheetColumn);
          }}
        />
      </GridLocaleProvider>
      <section className="pivot-panel" aria-label="Formula cell inspector">
        <h3>Raw input and computed result</h3>
        <div className="explorer-controls">
          <label>
            Inspect formula row{" "}
            <select
              aria-label="Inspect formula row"
              value={inspectRow}
              onChange={(event) => setInspectRow(event.target.value)}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={`formula${index + 1}`}>
                  Record {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Inspect formula column{" "}
            <select
              aria-label="Inspect formula column"
              value={inspectColumn}
              onChange={(event) =>
                setInspectColumn(event.target.value as SheetColumn)
              }
            >
              {columns.map((column, index) => (
                <option key={column.id} value={column.id}>
                  {String.fromCharCode(65 + index)} — {column.header}
                </option>
              ))}
            </select>
          </label>
        </div>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(95px, 140px) minmax(0, 1fr)",
            gap: "8px 16px",
            margin: 0,
            overflowWrap: "anywhere",
          }}
        >
          <dt>Source binding</dt>
          <dd style={{ margin: 0 }}>
            <code>
              {String.fromCharCode(65 + bindings.indexOf(inspectColumn))}
              {Number(inspectRow.slice(7))}
            </code>{" "}
            · {inspectRow}
          </dd>
          <dt>Input mode</dt>
          <dd style={{ margin: 0 }}>
            {expression === undefined ? "Literal" : "Formula"}
          </dd>
          <dt>Raw input</dt>
          <dd style={{ margin: 0 }}>
            <code>{expression ?? scalarText(raw)}</code>
          </dd>
          <dt>Computed result</dt>
          <dd style={{ margin: 0 }}>
            <span role="status">
              <code>{resultText}</code>
            </span>
          </dd>
        </dl>
        <p>
          A–G are fixed source bindings: Record, Units, Price, Total, Analysis,
          Note and Region. Sorting, grouping, pinning and RTL change
          presentation without rewriting these bindings. D1 starts as B1*C1; E1
          is SUM(D1:D3). F1 is the plain literal string &quot;=1+2&quot;, which
          is never executed automatically.
        </p>
        <p>
          Copy and existing exports use computed values. Ordinary paste and fill
          write literals; formula copying and reference rewriting are not
          implemented. This fixed sheet does not support structural row/column
          edits or full-row formula editing. All data and calculations stay in
          this page; no service is contacted.
        </p>
      </section>
    </section>
  );
}
