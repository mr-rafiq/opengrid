import { useMemo, useState, useSyncExternalStore } from "react";
import { createGrid } from "@opengrid/core";
import {
  ColumnConditionFilter,
  DataGrid,
  GridLocaleProvider,
  enUS,
  esES,
} from "@opengrid/react";

interface RecordRow {
  id: string;
  name: string;
  amount: number;
  large: bigint;
  joined: string | Date | null;
  enabled: boolean;
  variance: number | null;
}
const makeRows = (): RecordRow[] =>
  Array.from({ length: 120 }, (_, index) => {
    const date = `2026-01-${String((index % 20) + 1).padStart(2, "0")}`;
    return {
      id: `condition${index + 1}`,
      name: ["Alpha", "Beta", "Gamma", "Delta", "Alpine", ""][index % 6],
      amount: index + 1,
      large: 9007199254740992n + BigInt(index),
      joined:
        index % 11 === 0
          ? null
          : index % 2 === 0
            ? new Date(`${date}T00:00:00.000Z`)
            : date,
      enabled: index % 2 === 0,
      variance: [-0, 0, 1, null][index % 4],
    };
  });
export function ConditionFilterLab() {
  const model = useMemo(
    () =>
      createGrid<RecordRow>({
        rows: makeRows(),
        getRowId: (row) => row.id,
        columns: [
          {
            id: "name",
            field: "name",
            header: "Name",
            type: "text",
            width: 180,
            pinned: "left",
          },
          {
            id: "amount",
            field: "amount",
            header: "Amount",
            type: "number",
            width: 160,
          },
          {
            id: "large",
            field: "large",
            header: "Large integer",
            type: "bigint",
            width: 210,
          },
          {
            id: "joined",
            field: "joined",
            header: "Joined",
            type: "date",
            width: 210,
            valueFormatter: (value) =>
              value instanceof Date
                ? value.toISOString()
                : value === null
                  ? ""
                  : String(value),
          },
          {
            id: "variance",
            field: "variance",
            header: "Signed zero",
            type: "number",
            width: 150,
            valueFormatter: (value) =>
              Object.is(value, -0) ? "-0" : value === null ? "" : String(value),
          },
          {
            id: "enabled",
            field: "enabled",
            header: "Enabled",
            type: "boolean",
            width: 130,
            pinned: "right",
          },
        ],
      }),
    [],
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [spanish, setSpanish] = useState(false),
    [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const updateFirst = () => {
    const row = model.getRow("condition1");
    if (row)
      model.applyTransaction({ update: [{ ...row, name: row.name + " *" }] });
  };
  const external = () => model.setFilter("amount", { op: "gte", value: 30 });
  const matched = model.getFilteredRows();
  return (
    <GridLocaleProvider locale={spanish ? esES : enUS}>
      <section
        aria-label="Column condition example"
        onKeyDownCapture={(event) => {
          if (
            !(event.ctrlKey || event.metaKey) ||
            !event.shiftKey ||
            event.altKey
          )
            return;
          const key = event.key.toLowerCase();
          if (!["l", "d", "e", "u"].includes(key)) return;
          event.preventDefault();
          event.stopPropagation();
          if (key === "l") setSpanish((value) => !value);
          if (key === "d")
            setDirection((value) => (value === "ltr" ? "rtl" : "ltr"));
          if (key === "e") external();
          if (key === "u") updateFirst();
        }}
      >
        <h2>Typed column conditions</h2>
        <p>
          Choose operators and combine conditions with AND or OR. Drafts apply
          together; Cancel keeps the current filter. Large integers remain
          exact, and date comparisons use UTC instants.
        </p>
        <p>
          Inside an open dialog, Ctrl/⌘+Shift+L changes language, D changes
          direction, E simulates an external Amount filter, and U updates a
          source row.
        </p>
        <div className="explorer-controls">
          <button type="button" onClick={() => setSpanish((value) => !value)}>
            Switch filter language
          </button>
          <button
            type="button"
            onClick={() =>
              setDirection((value) => (value === "ltr" ? "rtl" : "ltr"))
            }
          >
            Direction {direction === "ltr" ? "RTL" : "LTR"}
          </button>
          <button type="button" onClick={external}>
            External amount filter
          </button>
          <button type="button" onClick={updateFirst}>
            Update first source row
          </button>
          <button
            type="button"
            onClick={() => {
              model.setRows(makeRows());
              model.setState({ filters: {}, quickFilter: "", page: 0 });
            }}
          >
            Reset condition example
          </button>
        </div>
        <p data-testid="condition-count" role="status">
          Matched {matched.length} of 120 rows
        </p>
        <DataGrid
          model={model}
          direction={direction}
          ariaLabel="Condition inventory"
          height={350}
          toolbar={false}
          pagination={false}
          selectionMode="none"
          columnOverscan={0}
          filterComponents={{
            name: ColumnConditionFilter,
            amount: ColumnConditionFilter,
            large: ColumnConditionFilter,
            joined: ColumnConditionFilter,
            variance: ColumnConditionFilter,
            enabled: ColumnConditionFilter,
          }}
        />
        <pre
          tabIndex={0}
          aria-label="Applied condition filters"
          data-testid="condition-state"
          style={{ maxHeight: 240, overflow: "auto" }}
        >
          {JSON.stringify(
            {
              filters: state.filters,
              firstMatchedIds: matched.slice(0, 12).map((row) => row.id),
            },
            (_key, value) =>
              typeof value === "bigint"
                ? `${value}n`
                : typeof value === "number" && Object.is(value, -0)
                  ? "-0 (number)"
                  : value,
            2,
          )}
        </pre>
      </section>
    </GridLocaleProvider>
  );
}
