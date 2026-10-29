import { useMemo, useState, useSyncExternalStore } from "react";
import { createGrid, type Column } from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  enUS,
  esES,
  type GridContextMenuOptions,
} from "@opengrid/react";
type RecordRow = {
  id: string;
  name: string;
  amount: number;
  reviewed: boolean;
  lots: bigint;
};
const columns: Column<RecordRow>[] = [
  {
    id: "name",
    field: "name",
    header: "Customer",
    editable: true,
    width: 220,
    pinned: "left",
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    width: 140,
    validate: (value) =>
      Number(value) < 0 ? "Amount must be nonnegative" : undefined,
  },
  {
    id: "reviewed",
    field: "reviewed",
    header: "Reviewed",
    type: "boolean",
    editable: true,
    width: 140,
  },
  { id: "id", field: "id", header: "Record", width: 160 },
  {
    id: "lots",
    field: "lots",
    header: "Exact lots",
    type: "bigint",
    editable: true,
    width: 210,
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
    }, 600);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export function ContextMenuLab() {
  const model = useMemo(
    () =>
      createGrid({
        rows: Array.from({ length: 200 }, (_, index) => ({
          id: `cmd${index + 1}`,
          name: index === 0 ? "=UNTRUSTED()" : `Customer ${index + 1}`,
          amount: index + 10,
          reviewed: false,
          lots: 9007199254740993n + BigInt(index),
        })),
        columns,
        getRowId: (row: RecordRow) => row.id,
        initialState: { pageSize: 40 },
      }),
    [],
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [spanish, setSpanish] = useState(false),
    [direction, setDirection] = useState<"ltr" | "rtl">("ltr"),
    [dark, setDark] = useState(false),
    [lastAction, setLastAction] = useState("No application command has run.");
  const incoming = () => {
    const row = model.getRow("cmd1")!;
    model.applyTransaction({
      update: [{ ...row, name: "Incoming customer", amount: 99 }],
    });
  };
  const hideFirst = () =>
    model.setFilter("id", { op: "notEqual", value: "cmd1" });
  const options = useMemo<GridContextMenuOptions<RecordRow>>(
    () => ({
      getItems: (_context, defaults) => [
        ...defaults,
        { kind: "separator", id: "application" },
        {
          kind: "action",
          id: "inspect",
          label: "Inspect record",
          action: (context) => {
            setLastAction(
              `Inspected ${context.position.rowId}: ${context.row.name}`,
            );
          },
        },
        {
          kind: "action",
          id: "review",
          label: "Mark reviewed",
          action: (context) => {
            const error = context.model.editCell(
              context.position.rowId,
              "reviewed",
              true,
            );
            if (error) throw new Error(error);
            setLastAction(`Reviewed ${context.position.rowId}`);
          },
        },
        {
          kind: "action",
          id: "delayedReview",
          label: "Delayed review",
          action: async (context, signal) => {
            await delay(signal);
            if (signal.aborted) return;
            const error = context.model.editCell(
              context.position.rowId,
              "reviewed",
              true,
            );
            if (error) throw new Error(error);
            setLastAction(
              `Reviewed ${context.position.rowId} after a cancellable delay`,
            );
          },
        },
      ],
    }),
    [],
  );
  return (
    <section
      aria-label="Contextual commands example"
      onKeyDownCapture={(event) => {
        if (!event.ctrlKey || !event.shiftKey) return;
        switch (event.code) {
          case "KeyL":
            event.preventDefault();
            setSpanish((value) => !value);
            break;
          case "KeyD":
            event.preventDefault();
            setDirection((value) => (value === "ltr" ? "rtl" : "ltr"));
            break;
          case "KeyT":
            event.preventDefault();
            setDark((value) => !value);
            break;
          case "KeyU":
            event.preventDefault();
            incoming();
            break;
          case "KeyF":
            event.preventDefault();
            hideFirst();
            break;
        }
      }}
    >
      <h2>Commands where you work</h2>
      <p>
        Right-click a data cell, or focus it and press Shift+F10.
        Ctrl+right-click keeps the browser menu. Clipboard commands use your
        browser clipboard; validation, undo and notes use the real grid.
      </p>
      <div className="lab-controls">
        <button onClick={() => setSpanish((value) => !value)}>
          {spanish ? "Use English commands" : "Use Spanish commands"}
        </button>
        <button
          onClick={() =>
            setDirection((value) => (value === "ltr" ? "rtl" : "ltr"))
          }
        >
          Command direction: {direction.toUpperCase()}
        </button>
        <button onClick={() => setDark((value) => !value)}>
          {dark ? "Use light command theme" : "Use dark command theme"}
        </button>
        <button onClick={incoming}>Incoming first record</button>
        <button onClick={hideFirst}>Hide first record</button>
        <button onClick={() => model.setFilter("id", undefined)}>
          Restore command rows
        </button>
      </div>
      <p>
        While a menu is open: Ctrl+Shift+L changes language, D changes
        direction, T changes theme, U sends an incoming record and F hides the
        first row. Delayed review is a local cancellable example, not a server
        write.
      </p>
      <div style={{ maxWidth: 860 }}>
        <GridLocaleProvider locale={spanish ? esES : enUS}>
          <DataGrid
            model={model}
            ariaLabel="Context command inventory"
            height={300}
            direction={direction}
            className={dark ? "og-dark" : ""}
            contextMenu={options}
            renderCell={({ column, row, value }) =>
              column.id === "id" ? (
                <button onClick={() => setLastAction(`Inspected ${row.id}`)}>
                  Inspect {row.id}
                </button>
              ) : (
                String(value ?? "")
              )
            }
          />
        </GridLocaleProvider>
      </div>
      <output aria-label="Last contextual app action">{lastAction}</output>
      <details>
        <summary>Inspect sample records</summary>
        <pre data-testid="context-command-data">
          {JSON.stringify(
            {
              first: model.getRow("cmd1"),
              second: model.getRow("cmd2"),
              selected: state.selected,
              matching: model.getFilteredRows().length,
            },
            (_, value) => (typeof value === "bigint" ? String(value) : value),
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
