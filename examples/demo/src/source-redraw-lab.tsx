import { useMemo, useRef, useState } from "react";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
  type Ag31RowNode,
} from "@opengrid/react";
class Line {
  constructor(
    public id: string,
    public phase: string,
    public amount: number,
  ) {}
  caption() {
    return `Line ${this.id}`;
  }
}
function Counter(p: { node: Ag31RowNode<Line> }) {
  const [count, setCount] = useState(0);
  const name = p.node.group ? p.node.key : p.node.data!.caption();
  return (
    <button
      type="button"
      className="source-redraw-counter"
      aria-label={`Increment ${name} (${count})`}
      onClick={() => setCount(count + 1)}
    >
      {name}: {count}
    </button>
  );
}
/** Stateful renderers make refresh versus row remount observable. */
export function SourceRedrawLab() {
  const ref = useRef<Ag31ClientGridHandle<Line>>(null);
  const rows = useMemo(
    () => [
      new Line("A", "Planning", 80),
      new Line("B", "Planning", 240),
      new Line("C", "Build", 1900),
    ],
    [],
  );
  const [summary, setSummary] = useState("No rows selected");
  const options = useMemo(
    () => ({
      getRowId: ({ data }: { data: Line }) => data.id,
      columnDefs: [
        { field: "phase", rowGroup: true, hide: true },
        {
          colId: "item",
          headerName: "Item",
          width: 190,
          pinned: "left" as const,
          showRowGroup: true,
          checkboxSelection: true,
          headerCheckboxSelection: true,
          cellRenderer: Counter,
        },
        {
          field: "amount",
          headerName: "Amount",
          width: 150,
          cellDataType: "number",
          cellEditor: "agNumberCellEditor",
          editable: (p: { node: Ag31RowNode<Line> }) => !p.node.group,
        },
      ],
    }),
    [],
  );
  const update = () => {
    const api = ref.current?.api;
    if (api && !api.isDestroyed())
      setSummary(
        `${api.getSelectedRows()?.length ?? 0} selected; A amount ${rows[0].amount}; original records ${rows.every((row) => api.getRowNode(row.id)?.data === row) ? "intact" : "changed"}`,
      );
  };
  return (
    <article
      aria-label="Source row redraw contracts"
      className="legacy-bridge-lab"
    >
      <h3>Row redraw and editor ownership</h3>
      <p>
        Increment a renderer counter, then refresh or redraw. Refresh retains
        local renderer state; redraw remounts only the requested rows. Redrawing
        an edited row commits its draft. Other rows keep their editors and
        state.
      </p>
      <div className="grouping-lab-controls">
        <button
          type="button"
          onClick={() => ref.current?.api.refreshCells({ force: true })}
        >
          Refresh row cells
        </button>
        <button
          type="button"
          onClick={() =>
            ref.current?.api.redrawRows({
              rowNodes: ref.current.api.getSelectedNodes(),
            })
          }
        >
          Redraw selected rows
        </button>
        <button
          type="button"
          onClick={() => {
            const api = ref.current?.api,
              group = api?.getRowNode("A")?.parent;
            if (api && group) api.redrawRows({ rowNodes: [group] });
          }}
        >
          Redraw Planning group
        </button>
        <button type="button" onClick={() => ref.current?.api.redrawRows()}>
          Redraw all rows
        </button>
      </div>
      <Ag31ClientGrid
        ref={ref}
        {...options}
        rowData={rows}
        height={340}
        rowSelection="multiple"
        groupDisplayType="custom"
        groupSelectsChildren
        groupSelectsFiltered
        suppressRowClickSelection
        onGridReady={({ api }) => {
          api.forEachNode((node) => {
            if (node.group) node.setExpanded(true);
          });
          update();
        }}
        onSelectionChanged={update}
        onCellValueChanged={update}
        ariaLabel="Redraw source grid"
      />
      <p role="status" aria-label="Source redraw summary">
        {summary}
      </p>
      <p>
        Resident body rows only. Full source state, flash animation and
        authenticated application acceptance remain separate contracts.
      </p>
    </article>
  );
}
