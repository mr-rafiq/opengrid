import { useMemo, useState, useSyncExternalStore } from "react";
import { createGrid, type Column } from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  enUS,
  esES,
  type GridContextMenuOptions,
  type GridColumnMenuOptions,
} from "@opengrid/react";
type Row = { id: string; name: string; amount: number; reviewed: boolean };
const columns: Column<Row>[] = [
  { id: "id", field: "id", header: "Record", width: 120, pinned: "left" },
  { id: "name", field: "name", header: "Customer", width: 230, editable: true },
  {
    id: "reviewed",
    field: "reviewed",
    header: "Reviewed",
    type: "boolean",
    width: 150,
    editable: true,
  },
  ...Array.from({ length: 24 }, (_, index): Column<Row> => ({
    id: `metric${index}`,
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
    editable: true,
    validate: (value) =>
      Number(value) < 0 ? "Amount must be nonnegative" : undefined,
  },
];
const pick = <Item extends { readonly id: string }>(
  items: readonly Item[],
  ids: readonly string[],
) => items.filter((item) => ids.includes(item.id));
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 800);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export function NestedMenuLab() {
  const model = useMemo(
    () =>
      createGrid<Row>({
        rows: Array.from({ length: 180 }, (_, index) => ({
          id: `nested${index + 1}`,
          name: index === 0 ? "=UNTRUSTED()" : `Customer ${index + 1}`,
          amount: index + 10,
          reviewed: false,
        })),
        columns,
        getRowId: (row) => row.id,
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
    [rtl, setRtl] = useState(false),
    [dark, setDark] = useState(false),
    [lastAction, setLastAction] = useState(
      "No nested application command has run.",
    );
  const rowMenu = useMemo<GridContextMenuOptions<Row>>(
    () => ({
      getItems: (_context, defaults) => [
        {
          kind: "submenu",
          id: "recordActions",
          label: "Record actions",
          items: pick(defaults, ["edit", "note", "selectRow"]),
        },
        {
          kind: "submenu",
          id: "clipboardExports",
          label: "Clipboard and exports",
          items: [
            {
              kind: "submenu",
              id: "clipboardCommands",
              label: "Clipboard",
              items: pick(defaults, ["copyCell", "copyRange", "paste"]),
            },
            {
              kind: "submenu",
              id: "documentCommands",
              label: "Documents",
              items: pick(defaults, ["exportCsv"]),
            },
          ],
        },
        {
          kind: "submenu",
          id: "historyActions",
          label: "History",
          items: pick(defaults, ["undo", "redo"]),
        },
        {
          kind: "submenu",
          id: "applicationCommands",
          label: "Application",
          items: [
            {
              kind: "action",
              id: "inspectRecord",
              label: "Inspect record",
              action: (context) =>
                setLastAction(
                  `Inspected ${context.position.rowId}: ${context.row.name}`,
                ),
            },
            {
              kind: "submenu",
              id: "reviewActions",
              label: "Review",
              items: [
                {
                  kind: "action",
                  id: "reviewRecord",
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
                  id: "deferredReview",
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
                      `Reviewed ${context.position.rowId} after delay`,
                    );
                  },
                },
                {
                  kind: "submenu",
                  id: "moreReviewActions",
                  label: "More review commands",
                  items: [
                    {
                      kind: "action",
                      id: "unreviewRecord",
                      label: "Unreview record",
                      action: (context) => {
                        const error = context.model.editCell(
                          context.position.rowId,
                          "reviewed",
                          false,
                        );
                        if (error) throw new Error(error);
                        setLastAction(`Unreviewed ${context.position.rowId}`);
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: "submenu",
          id: "thresholds",
          label: "Saved amount views",
          items: Array.from({ length: 24 }, (_, index) => ({
            kind: "action" as const,
            id: `threshold${index}`,
            label: `Amount \u2265 ${10 + index * 5}`,
            action: (context) => {
              context.model.setFilter("amount", {
                op: "gte",
                value: 10 + index * 5,
              });
              setLastAction(
                `Amount threshold ${10 + index * 5} from ${context.position.rowId}`,
              );
            },
          })),
        },
      ],
    }),
    [],
  );
  const columnMenu = useMemo<GridColumnMenuOptions<Row>>(
    () => ({
      getItems: (_context, defaults) => [
        {
          kind: "submenu",
          id: "columnSorts",
          label: "Sorting",
          items: pick(defaults, ["sortAsc", "sortDesc", "sortClear"]),
        },
        {
          kind: "submenu",
          id: "columnLayout",
          label: "Layout",
          items: [
            {
              kind: "submenu",
              id: "columnPins",
              label: "Pin column",
              items: pick(defaults, ["pinLeft", "pinRight", "unpin"]),
            },
            {
              kind: "submenu",
              id: "columnSizes",
              label: "Column sizes",
              items: pick(defaults, [
                "autoSize",
                "autoSizeRendered",
                "fit",
                "resetWidth",
              ]),
            },
            ...pick(defaults, ["filter", "chooser", "hide"]),
          ],
        },
        {
          kind: "submenu",
          id: "columnGrouping",
          label: "Grouping",
          items: pick(defaults, ["group", "ungroup", "expand", "collapse"]),
        },
      ],
    }),
    [],
  );
  const incoming = () =>
    model.applyTransaction({
      update: [{ ...model.getRow("nested1")!, name: "Incoming customer" }],
    });
  return (
    <section
      aria-label="Nested commands example"
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
        if (event.code === "KeyU") {
          event.preventDefault();
          incoming();
        }
      }}
    >
      <h2>Commands with room to grow</h2>
      <p>
        Cell and header menus use owned nested actions. Open a branch with a
        click, tap, Enter or the forward arrow. Escape or the reverse arrow
        returns one level; Escape cancels the whole stack while an action is
        running. Tab closes the stack before normal navigation.
      </p>
      <div className="lab-controls">
        <button onClick={() => setSpanish((value) => !value)}>
          {spanish
            ? "Use English nested commands"
            : "Use Spanish nested commands"}
        </button>
        <button onClick={() => setRtl((value) => !value)}>
          Nested direction: {rtl ? "RTL" : "LTR"}
        </button>
        <button onClick={() => setDark((value) => !value)}>
          {dark ? "Use light nested theme" : "Use dark nested theme"}
        </button>
        <button onClick={incoming}>Incoming nested record</button>
        <button
          onClick={() =>
            model.setState({
              sorting: [],
              filters: {},
              groupBy: [],
              expanded: [],
              columnPinning: {},
              columnVisibility: {},
              columnWidths: {},
              page: 0,
            })
          }
        >
          Clear nested query
        </button>
      </div>
      <p>
        Try Clipboard and exports → Clipboard, Application → Review, header
        Layout → Pin column, and the long Saved amount views branch.
        Ctrl+Shift+L/D/T changes language/direction/theme without rebuilding the
        menu; U changes the source. Group names are application labels; built-in
        actions follow the selected language.
      </p>
      <div style={{ maxWidth: 860 }}>
        <GridLocaleProvider locale={spanish ? esES : enUS}>
          <DataGrid
            model={model}
            ariaLabel="Nested command inventory"
            height={300}
            direction={rtl ? "rtl" : "ltr"}
            className={dark ? "og-dark" : ""}
            contextMenu={rowMenu}
            columnMenu={columnMenu}
          />
        </GridLocaleProvider>
      </div>
      <output aria-label="Last nested app action">{lastAction}</output>
      <details>
        <summary>Inspect nested state</summary>
        <pre data-testid="nested-command-data">
          {JSON.stringify(
            {
              first: model.getRow("nested1"),
              second: model.getRow("nested2"),
              selected: state.selected,
              sorting: state.sorting,
              filters: state.filters,
              pins: state.columnPinning,
              matching: model.getFilteredRows().length,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
