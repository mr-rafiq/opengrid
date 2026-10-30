import { useMemo, useState, useSyncExternalStore } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid, GridLocaleProvider, enUS, esES } from "@opengrid/react";
type RecordRow = {
  id: string;
  current: string;
  alternate: string;
  desk: string;
  amount: number;
};
const source: RecordRow[] = Array.from({ length: 240 }, (_, i) => ({
  id: `schema-${i + 1}`,
  current: i < 2 ? "Shared current" : `Current ${i + 1}`,
  alternate: `Alternate ${i + 1}`,
  desk: i % 2 ? "North" : "South",
  amount: i + 1,
}));
const definitions = (
  alternate: boolean,
  extra: boolean,
  spans: boolean,
): Column<RecordRow>[] => [
  {
    id: "name",
    field: alternate ? "alternate" : "current",
    header: alternate ? "Alternate record" : "Current record",
    width: 210,
    editable: true,
    spanRows: spans,
    groupPath: ["Identity"],
  },
  {
    id: "desk",
    field: "desk",
    header: "Desk",
    width: 140,
    groupPath: ["Identity"],
  },
  ...(extra
    ? [
        {
          id: "amount",
          field: "amount",
          header: "Amount",
          type: "number",
          width: 120,
          editable: true,
          groupPath: ["Measures"],
        } satisfies Column<RecordRow>,
      ]
    : []),
];
export function ColumnDefinitionsLab() {
  const model = useMemo(
    () =>
      createGrid({
        rows: source,
        columns: definitions(false, true, false),
        getRowId: (row: RecordRow) => row.id,
      }),
    [],
  );
  useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const [alternate, setAlternate] = useState(false),
    [extra, setExtra] = useState(true),
    [spans, setSpans] = useState(false),
    [rtl, setRtl] = useState(false),
    [spanish, setSpanish] = useState(false),
    [error, setError] = useState(""),
    [empty, setEmpty] = useState(false);
  function replace(a: boolean, e: boolean, s: boolean) {
    model.setColumns(definitions(a, e, s));
    setEmpty(false);
    setAlternate(a);
    setExtra(e);
    setSpans(s);
    setError("");
  }
  return (
    <article aria-label="Runtime column definitions example">
      <h2>Update definitions while the grid stays mounted</h2>
      <p>
        Stable IDs retain resized, pinned, ordered and hidden state. Replacing a
        field cancels pending drafts and ranges. Data, selected rows and undo
        history remain in the same model.
      </p>
      <div className="lab-controls">
        <button onClick={() => replace(!alternate, extra, spans)}>
          Replace record field
        </button>
        <button onClick={() => replace(alternate, !extra, spans)}>
          {extra ? "Remove amount column" : "Add amount column"}
        </button>
        <button
          onClick={() =>
            model.pinColumn(
              "name",
              model.getColumns().find((c) => c.id === "name")?.pinned
                ? null
                : "left",
            )
          }
        >
          Pin record column
        </button>
        <button onClick={() => model.resizeColumn("name", 280)}>
          Widen record column
        </button>
        <button onClick={() => replace(alternate, extra, !spans)}>
          Toggle record row spans
        </button>
        <button
          onClick={() => {
            try {
              model.setColumns([{ id: "name", width: NaN }]);
            } catch (reason) {
              setError((reason as Error).message);
            }
          }}
        >
          Try invalid definitions
        </button>
        <label>
          <input
            type="checkbox"
            checked={rtl}
            onChange={(e) => setRtl(e.target.checked)}
          />
          RTL column definitions
        </label>
        <label>
          <input
            type="checkbox"
            checked={spanish}
            onChange={(e) => setSpanish(e.target.checked)}
          />
          Spanish column definitions
        </label>
        <button
          onClick={() => {
            if (empty) replace(alternate, extra, spans);
            else {
              model.setColumns([]);
              setEmpty(true);
              setError("");
            }
          }}
        >
          Toggle empty column view
        </button>
        <button>Outside column definitions</button>
      </div>
      <p>
        Definition revision:{" "}
        <output aria-label="Column definition revision">
          {model.getColumnRevision()}
        </output>
        ; first source fields:{" "}
        <output aria-label="Column source values">
          {model.getRow("schema-1")!.current} |{" "}
          {model.getRow("schema-1")!.alternate}
        </output>
      </p>
      {error && <p role="alert">{error}</p>}
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <DataGrid
          model={model}
          ariaLabel="Runtime columns"
          direction={rtl ? "rtl" : "ltr"}
          height={360}
          pagination={false}
          selectionMode={empty ? "none" : "multiple"}
          cellSelection={!spans && !empty}
          columnMenu
        />
      </GridLocaleProvider>
    </article>
  );
}
