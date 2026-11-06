import React, { useMemo, useRef, useState } from "react";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
  type Ag31ColumnDefinition,
} from "@opengrid/react";

class Line {
  constructor(
    public id: string,
    public phase: string,
    public label: string,
    public amount: number,
  ) {}
  describe() {
    return `${this.id}: ${this.label}`;
  }
}
class LabelChange {
  constructor(public text: string) {}
}
function LabelEditor(props: any) {
  const [text, setText] = useState(String(props.value ?? ""));
  return (
    <input
      autoFocus
      aria-label="Source label editor"
      className="og-editor"
      value={text}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onValueChange(new LabelChange(text));
          props.stopEditing(true);
        }
      }}
    />
  );
}
export function SourceEditingLab() {
  const grid = useRef<Ag31ClientGridHandle<Line>>(null);
  const rows = useMemo(
    () => [
      new Line("A", "Planning", "Survey", 120),
      new Line("B", "Planning", "Design", 240),
      new Line("C", "Build", "Install", 900),
    ],
    [],
  );
  const [requests, setRequests] = useState(false),
    [guarded, setGuarded] = useState(false),
    [grouped, setGrouped] = useState(false);
  const [report, setReport] = useState("No edit yet");
  const definitions = useMemo<Ag31ColumnDefinition<Line>[]>(
    () => [
      {
        field: "phase",
        headerName: "Phase",
        enableRowGroup: true,
        width: 160,
        valueGetter: (p: any) => (p.node.group ? p.node.key : p.data.phase),
      },
      {
        field: "label",
        headerName: "Label",
        width: 240,
        editable: true,
        valueGetter: (p: any) =>
          (p.data ?? p.node.allLeafChildren?.[0]?.data)?.label,
        cellEditor: LabelEditor,
        suppressKeyboardEvent: (p: any) =>
          p.editing && ["Enter", "Tab"].includes(p.event.key),
        valueSetter: (p: any) => {
          if (!(p.newValue instanceof LabelChange)) return false;
          const targets = p.node.group ? p.node.allLeafChildren : [p.node];
          for (const node of targets) node.data.label = p.newValue.text;
          return true;
        },
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 160,
        editable: (p: any) => !p.node.group,
        cellEditor: "agNumberCellEditor",
        cellDataType: "number",
      },
    ],
    [],
  );
  return (
    <article
      aria-label="Source editing contracts"
      className="legacy-bridge-lab"
    >
      <h3>Source-owned cell editing</h3>
      <p>
        Double-click or press F2 to edit. The label editor submits a typed value
        on Enter; the application setter updates the original class records.
        This example makes no backend request.
      </p>
      <div className="grouping-lab-controls">
        <label>
          <input
            type="checkbox"
            checked={requests}
            onChange={(event) => setRequests(event.target.checked)}
          />{" "}
          Request changes without mutation
        </label>
        <label>
          <input
            type="checkbox"
            checked={guarded}
            onChange={(event) => setGuarded(event.target.checked)}
          />{" "}
          Cancel on editing start
        </label>
        <button
          type="button"
          aria-pressed={grouped}
          onClick={() => {
            grid.current?.api.applyColumnState({
              state: [{ colId: "phase", rowGroup: !grouped }],
            });
            setGrouped(!grouped);
          }}
        >
          Group by phase
        </button>
        <button
          type="button"
          onClick={() =>
            grid.current?.api.startEditingCell({ rowIndex: 0, colKey: "label" })
          }
        >
          Edit first displayed label
        </button>
        <button
          type="button"
          onClick={() => grid.current?.api.stopEditing(true)}
        >
          Cancel active edit
        </button>
      </div>
      <Ag31ClientGrid
        ref={grid}
        rowData={rows}
        columnDefs={definitions}
        getRowId={({ data }) => data.id}
        enableGroupEdit
        readOnlyEdit={requests}
        height={230}
        ariaLabel="Source editing sample"
        onCellEditingStarted={(event) => {
          if (guarded) event.api.stopEditing(true);
        }}
        onCellValueChanged={(event) =>
          setReport(
            `Committed ${event.column.getColId()}; original classes: ${rows.every((row) => row instanceof Line && typeof row.describe === "function")}`,
          )
        }
        onCellEditRequest={(event) =>
          setReport(
            `Requested ${event.column.getColId()}: ${event.newValue instanceof LabelChange ? event.newValue.text : String(event.newValue)}; data unchanged`,
          )
        }
      />
      <output aria-label="Source edit outcome">{report}</output>
      <p>
        Supported here: inline reactive editors, body/group cells, text/number
        editors, typed setters and cancellation. Popup editor lifecycle, source
        clipboard transactions, business undo and complete application
        acceptance remain unfinished.
      </p>
    </article>
  );
}
