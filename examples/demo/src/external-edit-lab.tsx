import { useRef, useState } from "react";
import { createGrid, type GridEditRequest } from "@opengrid/core";
import {
  DataGrid,
  CellEditor,
  type DataGridViewController,
} from "@opengrid/react";

class ReviewStage {
  #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  value() {
    return this.#value;
  }
  toString() {
    return this.#value;
  }
}

class LedgerRow {
  constructor(
    public id: string,
    public amount: number,
    public note: string,
    public stage = new ReviewStage("Draft"),
  ) {}
}
/** Original synthetic host: no network, credentials or business application code. */
export function ExternalEditLab() {
  const [pending, setPending] = useState<GridEditRequest<LedgerRow>[]>([]);
  const [result, setResult] = useState("No requests yet.");
  const [readOnly, setReadOnly] = useState(false);
  const [editMode, setEditMode] = useState<"cell" | "row">("cell");
  const view = useRef<DataGridViewController>(null);
  const [model] = useState(() =>
    createGrid({
      rows: [
        new LedgerRow("ledger-1", 20, "Design"),
        new LedgerRow("ledger-2", 35, "Review"),
      ],
      getRowId: (row) => row.id,
      columns: [
        {
          id: "id",
          field: "id",
          header: "Record",
          pinned: "left" as const,
          width: 150,
        },
        {
          id: "amount",
          header: "Amount",
          type: "number" as const,
          editable: true,
          valueGetter: (row) => row.amount,
          validate: (value) =>
            Number(value) < 0 ? "Amount must be non-negative" : undefined,
        },
        {
          id: "note",
          field: "note",
          header: "Note",
          editable: true,
          width: 200,
        },
        {
          id: "stage",
          header: "Review stage",
          editable: true,
          width: 180,
          valueGetter: (row) => row.stage,
          filterValueGetter: (row) => row.stage.value(),
          valueFormatter: (value) => (value as ReviewStage).value(),
          validate: (value) =>
            value instanceof ReviewStage
              ? undefined
              : "Choose a review stage with its custom editor",
        },
      ],
      onEditRequest: (request) => {
        setPending((queue) => [...queue, request]);
        setResult(`Request ${request.id} awaits a host decision.`);
      },
    }),
  );
  function decide(accept: boolean) {
    const request = pending[0];
    if (!request) return;
    if (accept) {
      const updates = new Map<string, LedgerRow>();
      for (const edit of request.edits) {
        const source = updates.get(edit.rowId) ?? model.getRow(edit.rowId)!;
        const row = new LedgerRow(
          source.id,
          source.amount,
          source.note,
          source.stage,
        );
        if (edit.columnId === "amount") row.amount = Number(edit.value);
        if (edit.columnId === "note") row.note = String(edit.value);
        if (edit.columnId === "stage" && edit.value instanceof ReviewStage)
          row.stage = edit.value;
        updates.set(row.id, row);
      }
      model.applyTransaction({ update: [...updates.values()] });
    }
    setPending((queue) => queue.filter((item) => item.id !== request.id));
    setResult(
      `Request ${request.id} ${accept ? "applied by the host" : "rejected; source unchanged"}.`,
    );
  }
  return (
    <article aria-label="External edit requests example">
      <h3>Host-owned edits</h3>
      <p>
        Edits create requests. Apply or reject them below to simulate an
        application response. This example makes no network requests.
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          marginBlock: 16,
        }}
      >
        <label>
          Edit mode{" "}
          <select
            value={editMode}
            onChange={(event) =>
              setEditMode(event.target.value as "cell" | "row")
            }
          >
            <option value="cell">Cell</option>
            <option value="row">Row</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(event) => {
              setReadOnly(event.target.checked);
              model.setReadOnly(event.target.checked);
            }}
          />{" "}
          Read only
        </label>
        <button
          type="button"
          disabled={!pending.length}
          onClick={() => decide(true)}
        >
          Apply next request
        </button>
        <button
          type="button"
          disabled={!pending.length}
          onClick={() => decide(false)}
        >
          Reject next request
        </button>
      </div>
      <p aria-label="Pending edit requests">
        Pending requests: {pending.length}
      </p>
      <p role="status">{result}</p>
      <details style={{ marginBlock: 12 }}>
        <summary>Focus and editing commands</summary>
        <p>
          The view API can reveal virtual cells and open an editor. The review
          editor submits a class instance. Press Escape to cancel.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBlock: 12,
          }}
        >
          <button
            type="button"
            onClick={() =>
              view.current?.focusCell({ rowId: "ledger-2", columnId: "amount" })
            }
          >
            Focus next amount
          </button>
          <button
            type="button"
            disabled={readOnly || editMode !== "cell"}
            onClick={() =>
              view.current?.startEditingCell({
                rowId: "ledger-1",
                columnId: "stage",
              })
            }
          >
            Edit review stage
          </button>
        </div>
      </details>
      <DataGrid
        model={model}
        viewRef={view}
        height={180}
        selectionMode="none"
        editMode={editMode}
        ariaLabel="Host-owned ledger"
        renderEditor={(props) =>
          props.column.id !== "stage" ? (
            <CellEditor {...props} />
          ) : (
            <select
              aria-label={props.label}
              autoFocus
              value={(props.rawValue as ReviewStage).value()}
              onKeyDown={props.onKeyDown}
              onBlur={props.onBlur}
              onChange={(event) => {
                props.onRawChange?.(new ReviewStage(event.target.value));
                if (props.editingContext === "cell")
                  view.current?.stopEditing();
              }}
            >
              <option value="Draft">Draft</option>
              <option value="Review">Review</option>
              <option value="Approved">Approved</option>
            </select>
          )
        }
      />
      <p>
        Application persistence, conflict handling and undo remain the host’s
        responsibility. Changes appear only after a host transaction.
      </p>
    </article>
  );
}
