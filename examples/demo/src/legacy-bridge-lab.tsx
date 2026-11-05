import { LegacyOverlayLab } from "./legacy-overlay-lab.js";
import { LegacyHostLab } from "./legacy-host-lab.js";
import { useMemo, useRef, useState } from "react";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
  type Ag31ColumnDefinition,
  type Ag31RowNode,
  type Ag31ValueParams,
  type Ag31RowStyleParams,
} from "@opengrid/react";

class EstimateLine {
  constructor(
    public id: string,
    public phase: string,
    public amount: number,
  ) {}
  caption() {
    return `Line ${this.id}`;
  }
}
const money = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
const definitions: Ag31ColumnDefinition<EstimateLine>[] = [
  {
    groupId: "estimate",
    headerName: "Estimate",
    children: [
      {
        field: "phase",
        headerName: "Phase",
        rowGroup: true,
        enableRowGroup: true,
        hide: true,
        filter: "agSetColumnFilter",
      },
      {
        colId: "item",
        headerName: "Item",
        showRowGroup: true,
        pinned: "left",
        width: 130,
        checkboxSelection: true,
        headerCheckboxSelection: true,
        valueGetter: (p: Ag31ValueParams<EstimateLine>) =>
          p.node.group ? p.node.key : p.data!.caption(),
      },
    ],
  },
  {
    groupId: "values",
    headerName: "Values",
    children: [
      {
        field: "amount",
        headerName: "Amount",
        width: 136,
        cellDataType: "number",
        filter: "agNumberColumnFilter",
        cellStyle: { paddingRight: 10 },
        cellClassRules: {
          "legacy-source-change": (p: Ag31ValueParams<EstimateLine>) =>
            Boolean(
              (p.context as { highlight: boolean }).highlight &&
              p.data?.id === "B",
            ),
        },
        tooltipValueGetter: (p: Ag31ValueParams<EstimateLine>) =>
          p.data
            ? `${p.data.caption()}: ${money.format(p.data.amount)}`
            : undefined,
        valueFormatter: (p: Ag31ValueParams<EstimateLine>) =>
          p.value == null ? "" : money.format(Number(p.value)),
      },
      {
        colId: "amountRaw",
        field: "amount",
        headerName: "Raw amount",
        width: 120,
        cellDataType: "number",
        columnGroupShow: "open",
      },
    ],
  },
];
const active = () => true;
const expensive = (node: Ag31RowNode<EstimateLine>) => node.data!.amount >= 100;
const rowStyle = (p: Ag31RowStyleParams<EstimateLine>) =>
  (p.context as { highlight: boolean }).highlight && p.data?.id === "B"
    ? { fontWeight: 600 }
    : undefined;

export function LegacyBridgeLab() {
  const grid = useRef<Ag31ClientGridHandle<EstimateLine>>(null);
  const source = useMemo(
    () => [
      new EstimateLine("A", "Planning", 80),
      new EstimateLine("B", "Planning", 240),
      new EstimateLine("C", "Build", 1900),
    ],
    [],
  );
  const options = useMemo(
    () => ({
      getRowId: ({ data }: { data: EstimateLine }) => data.id,
      rowSelection: "multiple" as const,
      groupSelectsChildren: true,
      suppressRowClickSelection: true,
    }),
    [],
  );
  const [rows, setRows] = useState<EstimateLine[] | null>(null);
  const [hostOpen, setHostOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [filtered, setFiltered] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const context = useMemo(() => ({ highlight }), [highlight]);
  const [summary, setSummary] = useState("Waiting for rows");
  const update = () => {
    const api = grid.current?.api;
    if (api && !api.isDestroyed())
      setSummary(
        `${api.getDisplayedRowCount()} displayed rows | ${api.getSelectedRows()?.length ?? 0} selected`,
      );
  };
  return (
    <article
      aria-label="Experimental legacy React bridge"
      className="legacy-bridge-lab"
    >
      <h2>Resident React bridge</h2>
      <p>
        Experimental, read-only API/ref compatibility for resident rows. This is
        not a complete AG Grid replacement. Original class records retain their
        methods.
      </p>
      <div className="grouping-lab-controls">
        <button type="button" onClick={() => setRows([...source])}>
          Load source records
        </button>
        <button type="button" onClick={() => setRows([])}>
          Clear records
        </button>
        <button
          type="button"
          aria-pressed={filtered}
          onClick={() => setFiltered(!filtered)}
        >
          Amounts at least EUR 100
        </button>
        <button type="button" onClick={() => grid.current?.api.deselectAll()}>
          Clear selection
        </button>
        <button
          type="button"
          aria-pressed={highlight}
          onClick={() => setHighlight(!highlight)}
        >
          Highlight sample changes
        </button>
      </div>
      <details>
        <summary>Source filter model example</summary>
        <p>
          Apply a built-in source model using the public ref. These filters
          combine with the external amount rule above. The source filter UI
          adapter is still a separate contract.
        </p>
        <div className="grouping-lab-controls">
          <button
            type="button"
            disabled={!rows?.length}
            onClick={() =>
              grid.current?.api.setFilterModel({
                amount: {
                  filterType: "number",
                  type: "greaterThanOrEqual",
                  filter: 100,
                },
              })
            }
          >
            Apply source amount filter
          </button>
          <button
            type="button"
            disabled={!rows?.length}
            onClick={() =>
              grid.current?.api.setFilterModel({
                phase: { filterType: "set", values: ["Planning"] },
              })
            }
          >
            Apply Planning source filter
          </button>
          <button
            type="button"
            disabled={!rows?.length}
            onClick={() => grid.current?.api.setFilterModel(null)}
          >
            Clear source filter model
          </button>
        </div>
      </details>
      <details>
        <summary>Source header group example</summary>
        <p>
          Open Values to show its optional raw-value column. Header group
          display and a column's own hidden flag remain independent.
        </p>
        <div className="grouping-lab-controls">
          <button
            type="button"
            onClick={() =>
              grid.current?.api.setColumnGroupOpened("values", true)
            }
          >
            Show value details
          </button>
          <button
            type="button"
            onClick={() => grid.current?.api.resetColumnGroupState()}
          >
            Reset source headers
          </button>
        </div>
      </details>
      <details>
        <summary>Retained-record refresh example</summary>
        <p>
          Local synthetic records only. Set Line A to EUR 300, then select Line
          B. Selection keeps the existing order; refresh the model to move Line
          A.
        </p>
        <div className="grouping-lab-controls">
          <button
            type="button"
            disabled={!rows?.length}
            onClick={() => {
              const api = grid.current?.api;
              if (!api) return;
              api.applyColumnState({
                state: [{ colId: "amount", sort: "asc" }],
              });
              api.forEachNode((node) => {
                if (node.group && node.key === "Planning")
                  node.setExpanded(true);
              });
              source[0].amount = 300;
              api.refreshCells({ force: true });
            }}
          >
            Set sample A to EUR 300
          </button>
          <button
            type="button"
            disabled={!rows?.length}
            onClick={() => grid.current?.api.refreshClientSideRowModel()}
          >
            Refresh source model
          </button>
        </div>
      </details>
      <details>
        <summary>Source column reset example</summary>
        <p>
          Apply an alternate local layout, then restore the declared columns and
          grouping. Source filters, selection and header-group state remain
          independent.
        </p>
        <div className="grouping-lab-controls">
          <button
            type="button"
            disabled={!rows?.length}
            onClick={() =>
              grid.current?.api.applyColumnState({
                applyOrder: true,
                state: [
                  {
                    colId: "amount",
                    width: 180,
                    pinned: "left",
                    sort: "desc",
                    sortIndex: -1,
                  },
                  { colId: "item", width: 180, pinned: null },
                  { colId: "phase", hide: false, rowGroup: false },
                  { colId: "amountRaw", hide: true },
                ],
              })
            }
          >
            Apply sample layout
          </button>
          <button
            type="button"
            disabled={!rows?.length}
            onClick={() => grid.current?.api.resetColumnState()}
          >
            Reset source columns
          </button>
        </div>
      </details>
      <details onToggle={(event) => setOverlayOpen(event.currentTarget.open)}>
        <summary>Source loading overlay example</summary>
        {overlayOpen && <LegacyOverlayLab />}
      </details>
      <details onToggle={(event) => setHostOpen(event.currentTarget.open)}>
        <summary>Source host layout example</summary>
        {hostOpen && <LegacyHostLab />}
      </details>
      <p role="status" aria-label="Source summary">
        {summary}
      </p>
      <Ag31ClientGrid
        ref={grid}
        gridOptions={options}
        rowData={rows}
        columnDefs={definitions}
        context={context}
        getRowStyle={rowStyle}
        height={300}
        ariaLabel="Legacy source estimate"
        onGridReady={update}
        onModelUpdated={update}
        onSelectionChanged={update}
        isExternalFilterPresent={filtered ? active : null}
        doesExternalFilterPass={expensive}
      />
      <p>
        <a href="../docs/legacy-react-bridge/">
          Supported options and remaining contracts
        </a>
      </p>
    </article>
  );
}
