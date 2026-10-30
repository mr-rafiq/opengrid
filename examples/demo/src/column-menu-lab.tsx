import { useMemo, useState, useSyncExternalStore } from "react";
import { createGrid, type Column } from "@opengrid/core";
import {
  DataGrid,
  ColumnConditionFilter,
  GridLocaleProvider,
  enUS,
  esES,
  type GridColumnMenuOptions,
} from "@opengrid/react";

type RecordRow = { id: string; name: string; team: string; amount: number };
const columns: Column<RecordRow>[] = [
  { id: "id", field: "id", header: "Record", width: 120, pinned: "left" },
  { id: "name", field: "name", header: "Customer", width: 240, editable: true },
  { id: "team", field: "team", header: "Team", width: 150 },
  ...Array.from({ length: 30 }, (_, index): Column<RecordRow> => ({
    id: `metric${index + 1}`,
    header: `Metric ${index + 1}`,
    width: 130,
    valueGetter: (row) => row.amount + index,
  })),
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    width: 150,
    pinned: "right",
  },
];
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 900);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export function ColumnMenuLab() {
  const model = useMemo(
    () =>
      createGrid<RecordRow>({
        rows: Array.from({ length: 180 }, (_, index) => ({
          id: `head${index + 1}`,
          name:
            index === 0
              ? "A very long customer label for sizing"
              : `Customer ${index + 1}`,
          team: ["Blue", "Green", "Red"][index % 3],
          amount: 180 - index,
        })),
        columns,
        getRowId: (row) => row.id,
        initialState: { pageSize: 60 },
      }),
    [],
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [spanish, setSpanish] = useState(false),
    [rtl, setRtl] = useState(false),
    [dark, setDark] = useState(false),
    [lastAction, setLastAction] = useState("No application command has run.");
  const options = useMemo<GridColumnMenuOptions<RecordRow>>(
    () => ({
      getItems: (_context, defaults) => [
        ...defaults,
        { kind: "separator", id: "application" },
        {
          kind: "action",
          id: "inspect",
          label: "Inspect column",
          action: (context) =>
            setLastAction(
              `Inspected ${context.column.id} from ${context.origin}`,
            ),
        },
        {
          kind: "action",
          id: "delayedSort",
          label: "Delayed amount sort",
          action: async (context, signal) => {
            await delay(signal);
            if (signal.aborted) return;
            context.model.setSort("amount", "asc");
            setLastAction("Delayed amount sort completed");
          },
        },
      ],
    }),
    [],
  );
  return (
    <section
      aria-label="Column commands example"
      onKeyDownCapture={(event) => {
        if (!event.ctrlKey || !event.shiftKey) return;
        if (event.code === "KeyL") {
          event.preventDefault();
          setSpanish((value) => !value);
        }
        if (event.code === "KeyD") {
          event.preventDefault();
          setRtl((value) => !value);
        }
        if (event.code === "KeyT") {
          event.preventDefault();
          setDark((value) => !value);
        }
      }}
    >
      <h2>Column commands, in place</h2>
      <p>
        Use a header’s three-dot button, Shift+F10, or right-click. Sort, pin,
        group, size and hide real columns. The filter command opens Customer’s
        condition dialog; the chooser restores hidden columns.
      </p>
      <div className="lab-controls">
        <button onClick={() => setSpanish((value) => !value)}>
          {spanish ? "Use English headers" : "Use Spanish headers"}
        </button>
        <button onClick={() => setRtl((value) => !value)}>
          Header direction: {rtl ? "RTL" : "LTR"}
        </button>
        <button onClick={() => setDark((value) => !value)}>
          {dark ? "Use light header theme" : "Use dark header theme"}
        </button>
        <button
          onClick={() =>
            model.setState({
              sorting: [],
              filters: {},
              groupBy: [],
              expanded: [],
              columnVisibility: {},
              columnPinning: {},
              columnWidths: {},
              page: 0,
            })
          }
        >
          Restore header example
        </button>
      </div>
      <p>
        Scroll through 34 columns to check windowing and pinned headers.
        Ctrl+Shift+L, D and T change language, direction and theme while a menu
        is open. Escape cancels Delayed amount sort before it changes the model.
        Sizing measures only rendered default text; it does not scan the data
        source.
      </p>
      <div style={{ maxWidth: 900 }}>
        <GridLocaleProvider locale={spanish ? esES : enUS}>
          <DataGrid
            model={model}
            ariaLabel="Column command inventory"
            height={320}
            direction={rtl ? "rtl" : "ltr"}
            className={dark ? "og-dark" : ""}
            columnMenu={options}
            filterComponents={{ name: ColumnConditionFilter }}
          />
        </GridLocaleProvider>
      </div>
      <output aria-label="Last column app action">{lastAction}</output>
      <details>
        <summary>Inspect column state</summary>
        <pre data-testid="column-command-data">
          {JSON.stringify(
            {
              sorting: state.sorting,
              groupBy: state.groupBy,
              expanded: state.expanded,
              widths: state.columnWidths,
              hidden: state.columnVisibility,
              pinned: state.columnPinning,
              rows: model
                .getPageRows()
                .map((node) => ({ id: node.id, kind: node.kind })),
              columns: model.getColumns().map((column) => ({
                id: column.id,
                hidden: column.hidden,
                pinned: column.pinned,
              })),
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
