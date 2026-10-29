import { useMemo, useState, useSyncExternalStore } from "react";
import {
  createGrid,
  type Column,
  type GridModel,
  type RowNode,
} from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  esES,
  enUS,
  type HierarchySelectionMode,
} from "@opengrid/react";
type RecordRow = {
  id: string;
  employee: string;
  region: string;
  team: string;
  amount: number;
  path: string[];
};
const columns: Column<RecordRow>[] = [
  {
    id: "employee",
    field: "employee",
    header: "Member",
    width: 260,
    pinned: "left",
  },
  { id: "region", field: "region", header: "Region", width: 130 },
  { id: "team", field: "team", header: "Team", width: 160 },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    width: 110,
  },
  { id: "id", field: "id", header: "Record", width: 130, pinned: "right" },
];
function expand(model: GridModel<RecordRow>) {
  const ids: string[] = [],
    stack: RowNode<RecordRow>[] = [...model.getRowModel()];
  const seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    if (node.children?.length) {
      ids.push(node.id);
      stack.push(...node.children);
    }
  }
  model.setState({ expanded: ids });
}
export function HierarchyLab() {
  const models = useMemo(() => {
    const rows: RecordRow[] = Array.from({ length: 600 }, (_, index) => ({
      id: `h${index + 1}`,
      employee: `Member ${String(index + 1).padStart(3, "0")}`,
      region: ["North", "South", "West"][Math.floor(index / 200)],
      team: ["Platform", "Research", "Support", "Design"][
        Math.floor((index % 200) / 50)
      ],
      amount: (index % 10) + 1,
      path: [],
    }));
    const source = (id: string, path: string[], amount: number): RecordRow => ({
      id,
      path,
      amount,
      employee: `${path.at(-1)} source`,
      region: "North",
      team: "Platform",
    });
    const treeRows = [
      source("root", ["Root"], 1),
      source("branch", ["Root", "Branch"], 2),
      ...Array.from({ length: 30 }, (_, index) =>
        source(
          `t${index + 1}`,
          ["Root", "Branch", `Leaf ${String(index + 1).padStart(2, "0")}`],
          (index % 10) + 1,
        ),
      ),
      source("other", ["Other"], 3),
      source("else", ["Other", "Else"], 9),
    ];
    return {
      grouped: createGrid({
        rows,
        columns,
        getRowId: (row) => row.id,
        initialState: { groupBy: ["region", "team"], pageSize: 25 },
      }),
      tree: createGrid({
        rows: treeRows,
        columns,
        getRowId: (row) => row.id,
        getTreePath: (row) => row.path,
        initialState: { pageSize: 25 },
      }),
    };
  }, []);
  const [tree, setTree] = useState(false),
    [scope, setScope] = useState<HierarchySelectionMode>("subtree"),
    [minimum, setMinimum] = useState("");
  const [spanish, setSpanish] = useState(false),
    [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const model = tree ? models.tree : models.grouped;
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  return (
    <section
      aria-label="Hierarchy selection example"
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
      }}
    >
      <h2>Select source subtrees</h2>
      <p>
        Choose collapsed groups and off-page descendants with one selection
        update. Filtered subtrees affect only matching records and keep hidden
        selections. Source-backed tree parents participate when eligible;
        generated group IDs never enter selected data.
      </p>
      <p>
        While a checkbox or grid cell is focused, Ctrl+Shift+L changes language
        and Ctrl+Shift+D changes direction. Group checkboxes and Space use the
        same action. Selection does not create data undo entries.
      </p>
      <div className="explorer-controls">
        <label>
          Selection scope{" "}
          <select
            aria-label="Hierarchy selection scope"
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as HierarchySelectionMode)
            }
          >
            <option value="self">Individual source rows</option>
            <option value="subtree">Complete source subtrees</option>
            <option value="filteredSubtree">Matching source subtrees</option>
          </select>
        </label>
        <label>
          Minimum amount{" "}
          <input
            aria-label="Hierarchy minimum amount"
            type="number"
            min={1}
            max={10}
            value={minimum}
            onChange={(event) => {
              const value = event.target.value;
              setMinimum(value);
              model.setFilter(
                "amount",
                value ? { op: "gte", value } : undefined,
              );
            }}
          />
        </label>
        <button type="button" onClick={() => expand(model)}>
          Expand hierarchy
        </button>
        <button
          type="button"
          onClick={() => model.setState({ expanded: [], page: 0 })}
        >
          Collapse hierarchy
        </button>
        <button
          type="button"
          onClick={() =>
            model.selectRows([
              ...new Set([...model.getState().selected, "h201"]),
            ])
          }
          disabled={tree}
        >
          Select South record
        </button>
        <button type="button" onClick={() => model.selectRows([])}>
          Clear hierarchy selection
        </button>
        <button
          type="button"
          onClick={() => {
            const next = tree ? models.grouped : models.tree;
            next.setFilter("amount", undefined);
            setMinimum("");
            setTree(!tree);
          }}
        >
          {tree ? "Use grouped hierarchy" : "Use tree hierarchy"}
        </button>
        <button type="button" onClick={() => setSpanish(!spanish)}>
          {spanish ? "Use English hierarchy" : "Use Spanish hierarchy"}
        </button>
        <button
          type="button"
          onClick={() => setDirection(direction === "ltr" ? "rtl" : "ltr")}
        >
          Hierarchy direction {direction === "ltr" ? "RTL" : "LTR"}
        </button>
      </div>
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <div style={{ width: 840, maxWidth: "100%" }}>
          <DataGrid
            model={model}
            hierarchySelection={scope}
            direction={direction}
            height={350}
            ariaLabel="Hierarchy selection inventory"
          />
        </div>
      </GridLocaleProvider>
      <pre
        data-testid="hierarchy-source"
        aria-label="Hierarchy selected source IDs"
        tabIndex={0}
        style={{ maxHeight: 220, overflow: "auto" }}
      >
        {JSON.stringify(
          {
            selected: state.selected,
            total: model.getRows().length,
            filtered: model.getFilteredRows().length,
          },
          null,
          2,
        )}
      </pre>
    </section>
  );
}
