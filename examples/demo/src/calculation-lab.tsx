import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createGrid, type Column, type GridState } from "@opengrid/core";
import { DataGrid, GridSidePanel, GridWorkspace } from "@opengrid/react";
interface EstimateRow {
  id: string;
  section: string;
  category: string;
  description: string;
  item: { quantity: number; rate: number };
  locked: boolean;
}
const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
});
const amount = (row: EstimateRow) => row.item.quantity * row.item.rate;
const data = (): EstimateRow[] => [
  {
    id: "est-1",
    section: "Preparation",
    category: "Labour",
    description: "Site survey",
    item: { quantity: 8, rate: 54 },
    locked: false,
  },
  {
    id: "est-2",
    section: "Preparation",
    category: "Equipment",
    description: "Survey equipment",
    item: { quantity: 2, rate: 120 },
    locked: true,
  },
  {
    id: "est-3",
    section: "Groundworks",
    category: "Materials",
    description: "Gravel",
    item: { quantity: 32, rate: 38.5 },
    locked: false,
  },
  {
    id: "est-4",
    section: "Groundworks",
    category: "Labour",
    description: "Installation crew",
    item: { quantity: 24, rate: 54 },
    locked: false,
  },
  {
    id: "est-5",
    section: "Groundworks",
    category: "Equipment",
    description: "Excavator hire",
    item: { quantity: 3, rate: 380 },
    locked: false,
  },
  {
    id: "est-6",
    section: "Finishing",
    category: "Materials",
    description: "Surface treatment",
    item: { quantity: 75, rate: 12.8 },
    locked: false,
  },
];
export function CalculationLab() {
  const model = useMemo(() => {
    const columns: Column<EstimateRow>[] = [
      {
        id: "description",
        field: "description",
        header: "Item / section",
        width: 255,
        minWidth: 180,
        pinned: "left",
        lockPosition: "left",
        lockPinned: true,
        lockVisible: true,
        movable: false,
        columnsPanel: false,
        editable: (row) => !row.locked,
        groupable: false,
      },
      {
        id: "section",
        field: "section",
        header: "Section",
        hidden: true,
        groupPath: ["Classification"],
      },
      {
        id: "category",
        field: "category",
        header: "Category",
        width: 140,
        groupPath: ["Classification"],
      },
      {
        id: "quantity",
        field: "item",
        header: "Quantity",
        width: 115,
        type: "number",
        editable: (row) => !row.locked,
        valueGetter: (row) => row.item.quantity,
        valueSetter: (value, row) => {
          row.item.quantity = Number(value);
          return row;
        },
        validate: (value) =>
          Number(value) < 0 ? "Use a nonnegative quantity" : undefined,
        groupPath: ["Estimate"],
      },
      {
        id: "rate",
        field: "item",
        header: "Unit rate",
        width: 125,
        type: "number",
        editable: (row) => !row.locked,
        valueGetter: (row) => row.item.rate,
        valueSetter: (value, row) => {
          row.item.rate = Number(value);
          return row;
        },
        validate: (value) =>
          Number(value) < 0 ? "Use a nonnegative rate" : undefined,
        valueFormatter: (value) => money.format(Number(value)),
        groupPath: ["Estimate"],
      },
      {
        id: "amount",
        valueGetter: amount,
        header: "Amount",
        type: "number",
        width: 155,
        pinned: "right",
        valueFormatter: (value) => money.format(Number(value)),
        aggregate: "sum",
        aggregateFormatter: (value) => money.format(Number(value)),
        groupPath: ["Estimate"],
      },
    ];
    const grid = createGrid({
      rows: data(),
      columns,
      getRowId: (row) => row.id,
      valueCache: true,
      initialState: {
        groupBy: ["section"],
        pageSize: 100,
        groupTotalRow: "bottom",
        grandTotalRow: "bottom",
      },
    });
    grid.setState({
      expanded: grid
        .getRowModel()
        .filter((node) => node.kind === "group")
        .map((node) => node.id),
    });
    return grid;
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const update = () => {
      model.setColumns(
        model
          .getColumnDefinitions()
          .map((column) =>
            column.id === "description"
              ? { ...column, pinned: media.matches ? null : "left" }
              : column,
          ),
      );
      model.pinColumn("amount", media.matches ? null : "right");
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [model]);
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [view, saveView] = useState<{ grid: GridState; search: string } | null>(
      null,
    ),
    [note, setNote] = useState(""),
    [query, setQuery] = useState(""),
    [activeSearch, setActiveSearch] = useState(""),
    [searchError, setSearchError] = useState("");
  const total = model
    .getFilteredRows()
    .reduce((sum, row) => sum + amount(row), 0);
  function search(value: string) {
    setQuery(value);
    const comparison = /^amount\s*>\s*(\d+(?:\.\d+)?)$/i.exec(value.trim());
    if (
      value.trim().toLowerCase().startsWith("amount") &&
      !comparison &&
      value.includes(">")
    ) {
      setSearchError(
        "Use amount > 100, or search item text. The last valid filter is retained.",
      );
      return;
    }
    setSearchError("");
    setActiveSearch(value);
    model.setQuickFilter(comparison ? "" : value);
    model.setExternalFilter(
      comparison ? (row) => amount(row) > Number(comparison[1]) : undefined,
    );
  }
  return (
    <article
      className="calculation-example"
      aria-label="Calculation workspace example"
    >
      <div className="calculation-heading">
        <div>
          <h2>Calculation workspace</h2>
          <p>
            Original synthetic estimate. Application services and data are
            supplied by the host.
          </p>
        </div>
        <label className="calculation-readonly">
          <input
            type="checkbox"
            checked={model.isReadOnly()}
            onChange={(event) => model.setReadOnly(event.target.checked)}
          />
          Read only
        </label>
      </div>
      <label className="calculation-search">
        Search estimate
        <input
          type="search"
          value={query}
          onChange={(event) => search(event.target.value)}
          placeholder="Item text or amount > 100"
        />
      </label>
      {searchError && <p role="alert">{searchError}</p>}
      <GridWorkspace
        panels={[
          {
            id: "columns",
            label: "Columns & filters",
            icon: "columns",
            content: <GridSidePanel model={model} />,
          },
          {
            id: "views",
            label: "Saved view",
            icon: "grid",
            content: (
              <>
                <h3>Saved view</h3>
                <p>
                  Session-only column, filter, grouping and selection state.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    saveView({ grid: model.getState(), search: activeSearch })
                  }
                >
                  Save current view
                </button>
                <button
                  type="button"
                  disabled={!view}
                  onClick={() => {
                    if (view) {
                      search(view.search);
                      model.setState(view.grid);
                    }
                  }}
                >
                  Restore saved view
                </button>
                {view && <p role="status">View saved for this session.</p>}
              </>
            ),
          },
          {
            id: "notes",
            label: "Project note",
            icon: "note",
            content: (
              <>
                <h3>Project note</h3>
                <label>
                  Estimate note
                  <textarea
                    value={note}
                    readOnly={model.isReadOnly()}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <p>Session-only host content. No database is connected.</p>
              </>
            ),
          },
          {
            id: "help",
            label: "Help",
            icon: "help",
            content: (
              <>
                <h3>Estimate help</h3>
                <p>
                  Edit quantities or rates to update amounts and filtered
                  totals. Survey equipment is individually protected. Use Read
                  only to revoke all grid editing and history commands.
                </p>
                <p>
                  The leading item column is locked. Group selection uses
                  filtered descendants. Saved views and notes are working
                  session examples, not backend integrations.
                </p>
              </>
            ),
          },
        ]}
      >
        <DataGrid
          model={model}
          height={510}
          rowHeight={32}
          className="calculation-grid"
          ariaLabel="Synthetic estimate"
          columnGroups
          rowGroupPanel="always"
          hierarchySelection="filteredSubtree"
          cellSelection
          notes={false}
          pagination={false}
          columnMenu
          renderHeader={({ column }) =>
            column.id === "amount" ? (
              <span>
                Amount{" "}
                <small className="calculation-header-total">
                  {money.format(total)}
                </small>
              </span>
            ) : (
              (column.header ?? column.id)
            )
          }
          renderGroupCell={({ node, column, displayValue }) =>
            column.id === "description" ? (
              <span className="calculation-section">
                {node.total === "grand"
                  ? "Grand total"
                  : node.total === "group"
                    ? `Subtotal ${node.label}`
                    : node.label}
              </span>
            ) : (
              displayValue
            )
          }
          getRowClassName={(node) =>
            node.data?.locked ? "calculation-protected" : ""
          }
          getCellTooltip={({ node, displayValue }) =>
            node.data?.locked ? `Protected item: ${displayValue}` : displayValue
          }
          statusContent={
            <span aria-label="Filtered estimate total">
              Filtered estimate: <strong>{money.format(total)}</strong>
            </span>
          }
        />
      </GridWorkspace>
      <output
        className="calculation-output"
        aria-label="Estimate source values"
      >
        {model
          .getRows()
          .map((row) => `${row.id}:${row.item.quantity}:${row.item.rate}`)
          .join(" | ")}
      </output>
      <p className="calculation-caption">
        {state.selected.length} source records selected. Generated group rows
        have no source object; custom group editing requires a host batch
        command.
      </p>
    </article>
  );
}
