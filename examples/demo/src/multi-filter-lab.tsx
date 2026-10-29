import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { createGrid, type Column } from "@opengrid/core";
import {
  ColumnConditionFilter,
  SetListFilter,
  createMultiFilter,
  DataGrid,
  GridLocaleProvider,
  enUS,
  esES,
} from "@opengrid/react";
type RecordRow = { id: string; region: string; amount: number; lots: bigint };
const Combined = createMultiFilter<RecordRow>([
  { id: "conditions", label: "Conditions", component: ColumnConditionFilter },
  { id: "values", label: "Values", component: SetListFilter },
]);
const columns: Column<RecordRow>[] = [
  {
    id: "region",
    field: "region",
    header: "Region",
    type: "text",
    editable: true,
    width: 220,
    pinned: "left",
  },
  {
    id: "lots",
    field: "lots",
    header: "Exact lots",
    type: "bigint",
    editable: true,
    width: 250,
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    width: 130,
  },
  { id: "id", field: "id", header: "Record", width: 140, pinned: "right" },
];
const registry = { region: Combined, lots: Combined };
export function MultiFilterLab() {
  const model = useMemo(
    () =>
      createGrid<RecordRow>({
        rows: Array.from({ length: 100 }, (_, index) => ({
          id: `multi${index + 1}`,
          region: ["North", "South", "West", "Northwest"][index % 4],
          amount: index + 1,
          lots: 9007199254740993n + BigInt(index % 3),
        })),
        columns,
        getRowId: (row) => row.id,
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
    [unreadable, setUnreadable] = useState(false);
  const read = useCallback(
    (id: string) => {
      if (unreadable && id === "region")
        throw new Error("The example region query is temporarily unavailable.");
      return model.getState().filters[id];
    },
    [model, unreadable],
  );
  const external = () =>
    model.setFilter("region", { op: "equals", value: "West" });
  return (
    <section
      aria-label="Independent multi-filter example"
      onKeyDownCapture={(event) => {
        if (!event.ctrlKey || !event.shiftKey) return;
        if (event.code === "KeyL") {
          event.preventDefault();
          setSpanish((value) => !value);
        }
        if (event.code === "KeyD") {
          event.preventDefault();
          setDirection((value) => (value === "ltr" ? "rtl" : "ltr"));
        }
        if (event.code === "KeyE") {
          event.preventDefault();
          external();
        }
        if (event.code === "KeyR") {
          event.preventDefault();
          setUnreadable((value) => !value);
        }
        if (event.code === "KeyU") {
          event.preventDefault();
          model.editCell(
            "multi1",
            "region",
            model.getRow("multi1")!.region === "Incoming"
              ? "North"
              : "Incoming",
          );
        }
      }}
    >
      <h2>Independent filters on one column</h2>
      <p>
        Open Region or Exact lots, apply each child condition/value-list
        setting, then apply the combined filter. All active child filters must
        match. Cancel keeps the current grid query. Exact lots stay beyond
        JavaScript's safe-integer range without rounding.
      </p>
      <p>
        While a dialog is open, Ctrl+Shift+E installs an external Region filter,
        Ctrl+Shift+R toggles a source-read failure and Ctrl+Shift+U updates an
        incoming record. Ctrl+Shift+L changes language and Ctrl+Shift+D changes
        direction. Reload or explicitly keep staged work before applying an
        external change.
      </p>
      <div className="explorer-controls">
        <button type="button" onClick={() => model.setState({ filters: {} })}>
          Clear applied demo filters
        </button>
        <button type="button" onClick={external}>
          Install external region filter
        </button>
        <button
          type="button"
          onClick={() =>
            model.setFilter("region", {
              op: "multi",
              filters: [
                {
                  id: "conditions",
                  filter: {
                    op: "or",
                    conditions: [
                      { op: "contains", value: "North" },
                      { op: "contains", value: "South" },
                    ],
                  },
                },
                { id: "values", filter: { op: "in", value: ["South"] } },
              ],
            })
          }
        >
          Restore named region filter
        </button>
        <button type="button" onClick={() => setUnreadable(!unreadable)}>
          {unreadable
            ? "Restore region filter read"
            : "Fail region filter read"}
        </button>
        <button type="button" onClick={() => setSpanish(!spanish)}>
          {spanish ? "Use English multi-filters" : "Use Spanish multi-filters"}
        </button>
        <button
          type="button"
          onClick={() => setDirection(direction === "ltr" ? "rtl" : "ltr")}
        >
          Multi-filter direction {direction === "ltr" ? "RTL" : "LTR"}
        </button>
      </div>
      <p>
        <output aria-label="Multi-filter matching records">
          {model.getFilteredRows().length} matching records
        </output>
      </p>
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <div style={{ width: 860, maxWidth: "100%" }}>
          <DataGrid
            model={model}
            height={340}
            direction={direction}
            filterComponents={registry}
            getColumnFilter={read}
            ariaLabel="Independent filters inventory"
          />
        </div>
      </GridLocaleProvider>
      <details>
        <summary>Applied filter data</summary>
        <pre
          tabIndex={0}
          data-testid="multi-filter-source"
          style={{ maxHeight: 260, overflow: "auto" }}
        >
          {JSON.stringify(
            {
              matching: model.getFilteredRows().length,
              filters: state.filters,
              firstRegion: model.getRow("multi1")!.region,
            },
            (_key, value: unknown) =>
              typeof value === "bigint" ? `${value}n` : value,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
