import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createGrid, type Column } from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  SetListFilter,
  enUS,
  esES,
} from "@opengrid/react";

interface RecordRow {
  id: string;
  record: string;
  category: string | null;
  tag: string;
  budget: bigint;
  when: Date | string | null;
}
const columns: Column<RecordRow>[] = [
  {
    id: "record",
    field: "record",
    header: "Record",
    width: 160,
    pinned: "left",
  },
  {
    id: "category",
    field: "category",
    header: "Category",
    width: 180,
    editable: true,
  },
  { id: "tag", field: "tag", header: "Tag", width: 180, editable: true },
  {
    id: "budget",
    field: "budget",
    header: "Budget",
    type: "bigint",
    width: 190,
    valueFormatter: () => "Same display label",
  },
  { id: "when", field: "when", header: "Date", type: "date", width: 220 },
  ...Array.from({ length: 12 }, (_, index): Column<RecordRow> => ({
    id: `extra${index}`,
    header: `Extra ${index + 1}`,
    width: 120,
    filterable: false,
    valueGetter: (row) => `${row.id} / ${index + 1}`,
  })),
];
const filters = {
  category: SetListFilter,
  tag: SetListFilter,
  budget: SetListFilter,
  when: SetListFilter,
};
function rows(): RecordRow[] {
  return Array.from({ length: 240 }, (_, index) => ({
    id: `set${index + 1}`,
    record: `Record ${index + 1}`,
    category: ["Office", "office", "Field", "Home", null][index % 5],
    tag: `Tag ${String((index % 120) + 1).padStart(3, "0")}`,
    budget: index % 2 ? 9007199254740995n : 9007199254740993n,
    when: [
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-02-01T00:00:00Z"),
      "invalid",
      null,
    ][index % 4],
  }));
}

export function SetFilterLab() {
  const [model] = useState(() =>
    createGrid({ rows: rows(), columns, getRowId: (row) => row.id }),
  );
  const [spanish, setSpanish] = useState(false),
    [rtl, setRtl] = useState(false);
  const [pending, setPending] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useSyncExternalStore(model.subscribe, model.getState, model.getState);
  function queue(kind: "source" | "filter") {
    clearTimeout(timer.current);
    setPending(kind);
    timer.current = setTimeout(() => {
      if (kind === "source")
        model.setRows(
          model
            .getRows()
            .map((row, index) =>
              index
                ? row
                : { ...row, category: "New category", tag: "New tag" },
            ),
        );
      else model.setFilter("category", { op: "in", value: ["Field"] });
      setPending("");
    }, 2500);
  }
  return (
    <div className="set-filter-lab">
      <h2>Resident set-list filters</h2>
      <p>
        Open a column's Values panel. Search and select a draft, then Apply.
        Office and office share a text key; identical Budget labels still
        represent two exact integers. Date blanks and invalid dates share the
        existing comparison bucket.
      </p>
      <div className="explorer-controls">
        <button type="button" onClick={() => setSpanish(!spanish)}>
          {spanish ? "Use English filters" : "Use Spanish filters"}
        </button>
        <button type="button" onClick={() => setRtl(!rtl)}>
          {rtl ? "Use LTR filters" : "Use RTL filters"}
        </button>
        <button
          type="button"
          disabled={!!pending}
          onClick={() => queue("source")}
        >
          Queue source update
        </button>
        <button
          type="button"
          disabled={!!pending}
          onClick={() => queue("filter")}
        >
          Queue filter conflict
        </button>
        <button
          type="button"
          onClick={() => {
            clearTimeout(timer.current);
            setPending("");
            model.setRows(rows());
            model.setState({ filters: {}, quickFilter: "", page: 0 });
          }}
        >
          Reset set-filter example
        </button>
      </div>
      <p role="status">
        {model.getFilteredRows().length} matching records.{" "}
        {pending
          ? `${pending === "source" ? "Source update" : "Category filter change"} in 2.5 seconds: open Category and change a draft before it arrives.`
          : "No queued update."}
      </p>
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <DataGrid
          model={model}
          filterComponents={filters}
          direction={rtl ? "rtl" : "ltr"}
          height={320}
          ariaLabel="Set-filter records"
          advancedFiltering={false}
        />
      </GridLocaleProvider>
    </div>
  );
}
