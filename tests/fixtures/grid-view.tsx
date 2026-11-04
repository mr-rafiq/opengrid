import "@vitejs/plugin-react/preamble";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createGrid, type Column, type GridEditRequest } from "@opengrid/core";
import {
  DataGrid,
  CellEditor,
  useGridTheme,
  type DataGridViewController,
} from "@opengrid/react";
import "@opengrid/react/styles.css";
class Choice {
  #key: string;
  constructor(key: string) {
    this.#key = key;
  }
  key() {
    return this.#key;
  }
  toString(): string {
    throw new Error("Unexpected typed-value coercion");
  }
}
interface Row {
  id: string;
  choice: Choice;
  values: number[];
}
function createFixture(onRequest: (request: GridEditRequest<Row>) => void) {
  const columns: Column<Row>[] = [
    {
      id: "choice",
      header: "Choice",
      valueGetter: (row) => row.choice,
      valueFormatter: (value) => (value as Choice).key(),
      editable: true,
      pinned: "left",
      width: 150,
      validate: (value) =>
        value instanceof Choice ? undefined : "Choose a domain object",
    },
    ...Array.from({ length: 40 }, (_, i): Column<Row> => ({
      id: `c${i}`,
      header: `Metric ${i + 1}`,
      valueGetter: (row) => row.values[i],
      editable: true,
      type: "number",
      width: 150,
    })),
  ];
  const model = createGrid<Row>({
    rows: Array.from({ length: 1000 }, (_, i) => ({
      id: `row-${i}`,
      choice: new Choice("Plan"),
      values: Array.from({ length: 40 }, (_, j) => i + j),
    })),
    columns,
    getRowId: (row) => row.id,
    initialState: { pageSize: 1000 },
    onEditRequest: (request) => {
      const updates = new Map<string, Row>();
      for (const edit of request.edits) {
        const source = updates.get(edit.rowId) ?? model.getRow(edit.rowId)!;
        const row = { ...source, values: [...source.values] };
        if (edit.columnId === "choice") row.choice = edit.value as Choice;
        else row.values[Number(edit.columnId.slice(1))] = Number(edit.value);
        updates.set(row.id, row);
      }
      model.applyTransaction({ update: [...updates.values()] });
      onRequest(request);
    },
  });
  return model;
}
function App() {
  useGridTheme();
  const [request, setRequest] = useState("No request"),
    [status, setStatus] = useState("Idle"),
    [mounted, setMounted] = useState(true);
  const [model, setModel] = useState(() =>
    createFixture((value) =>
      setRequest(
        value.edits
          .map(
            (edit) =>
              `${edit.rowId}:${edit.columnId}:${edit.value instanceof Choice ? `class:${edit.value.key()}` : typeof edit.value}`,
          )
          .join(";"),
      ),
    ),
  );
  const ref = useRef<DataGridViewController>(null),
    old = useRef<DataGridViewController | null>(null);
  function command(
    label: string,
    apply: (api: DataGridViewController) => boolean,
  ) {
    const api = ref.current;
    const accepted = !!api && apply(api);
    const focus = api?.getFocusedCell();
    setStatus(
      `${label}:${accepted}:${focus?.rowId ?? "none"}:${focus?.columnId ?? "none"}`,
    );
  }
  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "auto",
        padding: 12,
        color: "var(--og-text)",
        background: "var(--og-bg)",
      }}
    >
      <h1>Grid view contract fixture</h1>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}
      >
        <button
          onClick={() =>
            command("focus", (api) =>
              api.focusCell({ rowId: "row-700", columnId: "c35" }),
            )
          }
        >
          Focus distant
        </button>
        <button
          onClick={() => command("reveal", (api) => api.revealRow("row-0"))}
        >
          Reveal origin
        </button>
        <button
          onClick={() =>
            command("edit", (api) =>
              api.startEditingCell({ rowId: "row-700", columnId: "c35" }),
            )
          }
        >
          Edit distant
        </button>
        <button
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => command("commit", (api) => api.stopEditing())}
        >
          Commit
        </button>
        <button
          onPointerDown={(event) => event.preventDefault()}
          onClick={() =>
            command("cancel", (api) => api.stopEditing({ cancel: true }))
          }
        >
          Cancel
        </button>
        <button
          onClick={() =>
            command("object", (api) =>
              api.startEditingCell({ rowId: "row-1", columnId: "choice" }),
            )
          }
        >
          Edit choice
        </button>
        <button
          onClick={() => {
            old.current = ref.current;
            setModel(createFixture((value) => setRequest(String(value.id))));
          }}
        >
          Replace model
        </button>
        <button
          onClick={() =>
            setStatus(
              `retired:${old.current?.isActive() ?? false}:${old.current?.focusCell({ rowId: "row-0", columnId: "c0" }) ?? false}`,
            )
          }
        >
          Try old handle
        </button>
        <button
          onClick={() => {
            old.current = ref.current;
            setMounted(false);
          }}
        >
          Unmount grid
        </button>
      </div>
      <p aria-label="Command result">{status}</p>
      <p aria-label="Request result">{request}</p>
      {mounted && (
        <DataGrid
          model={model}
          viewRef={ref}
          height={260}
          selectionMode="none"
          ariaLabel="View controller fixture"
          renderEditor={(props) =>
            props.column.id === "choice" ? (
              <select
                aria-label={props.label}
                autoFocus
                value={(props.rawValue as Choice).key()}
                onChange={(event) => {
                  props.onRawChange?.(new Choice(event.target.value));
                  ref.current?.stopEditing();
                }}
              >
                <option value="Plan">Plan</option>
                <option value="Review">Review</option>
              </select>
            ) : (
              <CellEditor {...props} />
            )
          }
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
