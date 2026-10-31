import { useMemo, useSyncExternalStore } from "react";
import { createGrid, type RowNode } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";
export function GroupingLab() {
  const model = useMemo(
    () =>
      createGrid({
        rows: [
          { id: "1", name: "Northstar", team: "A", area: "West", amount: 1 },
          { id: "2", name: "Evergreen", team: "B", area: "East", amount: 4 },
          { id: "3", name: "Arc", team: "A", area: "East", amount: 9 },
          { id: "4", name: "Meridian", team: "B", area: "East", amount: 4 },
        ],
        columns: [
          {
            id: "name",
            field: "name",
            header: "Customer",
            width: 180,
            pinned:
              typeof window !== "undefined" && window.innerWidth <= 600
                ? null
                : "left",
            groupable: false,
          },
          { id: "team", field: "team", header: "Team", width: 130 },
          { id: "area", field: "area", header: "Area", width: 140 },
          {
            id: "amount",
            field: "amount",
            header: "Amount",
            type: "number",
            aggregate: "sum",
            width: 130,
            editable: true,
            groupable: false,
          },
        ],
        getRowId: (row) => row.id,
        initialState: { groupTotalRow: "bottom", grandTotalRow: "bottom" },
      }),
    [],
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  function expandAll() {
    const ids: string[] = [];
    const visit = (nodes: RowNode<unknown>[]) => {
      for (const node of nodes)
        if (node.kind === "group") {
          ids.push(node.id);
          if (node.children) visit(node.children);
        }
    };
    visit(
      model
        .getRowModel()
        .filter((node) => node.depth === 0 && node.kind !== "total"),
    );
    model.setState({ expanded: ids });
  }
  return (
    <section aria-label="Resident grouping example" className="grouping-lab">
      <p>
        Drag Team or Area headers into Row groups, or use Add group. Reorder
        chips by dragging or their arrow buttons. Sort Amount to order groups by
        their filtered sum.
      </p>
      <div className="grouping-lab-controls">
        <label>
          Subtotals{" "}
          <select
            aria-label="Subtotal position"
            value={state.groupTotalRow || "none"}
            onChange={(event) =>
              model.setState({
                groupTotalRow:
                  event.target.value === "none"
                    ? false
                    : (event.target.value as "top" | "bottom"),
              })
            }
          >
            <option value="none">None</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label>
          Grand total{" "}
          <select
            aria-label="Grand total position"
            value={state.grandTotalRow || "none"}
            onChange={(event) =>
              model.setState({
                grandTotalRow:
                  event.target.value === "none"
                    ? false
                    : (event.target.value as "top" | "bottom"),
              })
            }
          >
            <option value="none">None</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <button onClick={expandAll}>Expand all groups</button>
        <button onClick={() => model.setState({ expanded: [] })}>
          Collapse all groups
        </button>
      </div>
      <DataGrid
        model={model}
        toolbar={false}
        rowGroupPanel="always"
        height={390}
        ariaLabel="Grouped orders"
        hierarchySelection="filteredSubtree"
        pagination={false}
      />
    </section>
  );
}
