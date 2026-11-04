import { useState, useSyncExternalStore } from "react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

class Department {
  #label: string;
  constructor(public code: string) {
    this.#label = `Team ${code}`;
  }
  label() {
    return this.#label;
  }
  toString(): string {
    throw new Error("Use the explicit domain formatter");
  }
}
class GroupCaption {
  #text: string;
  constructor(text: string) {
    this.#text = text;
  }
  text() {
    return this.#text;
  }
}
class WorkItem {
  #caption: string;
  constructor(
    public id: string,
    public department: Department,
    public amount: number,
  ) {
    this.#caption = `Work item ${id}`;
  }
  caption() {
    return this.#caption;
  }
}
const currency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/** Original synthetic domain classes; no consumer source, business services or network. */
export function KeyedGroupsLab() {
  const [model] = useState(() =>
    createGrid({
      rows: Array.from(
        { length: 24 },
        (_, index) =>
          new WorkItem(
            String(index + 1),
            new Department(["A", "B", "C"][index % 3]),
            (index + 1) * 25,
          ),
      ),
      getRowId: (row) => row.id,
      readOnly: true,
      columns: [
        {
          id: "work",
          header: "Work items",
          width: 210,
          minWidth: 130,
          flex: 1,
          valueGetter: (row) => row.caption(),
          groupable: false,
          groupValueGetter: (node) =>
            new GroupCaption((node.groupValue as Department).label()),
          aggregateFormatter: (value) => (value as GroupCaption).text(),
        },
        {
          id: "department",
          header: "Department",
          hidden: true,
          valueGetter: (row) => row.department,
          groupKeyGetter: (value) => (value as Department).code,
          valueFormatter: (value) => (value as Department).label(),
        },
        {
          id: "amount",
          field: "amount",
          header: "Budget",
          width: 155,
          minWidth: 115,
          flex: 1,
          type: "number",
          aggregate: "sum",
          groupable: false,
          valueFormatter: (value) => currency.format(Number(value)),
          aggregateFormatter: (value) => currency.format(Number(value)),
        },
      ],
      initialState: { groupBy: ["department"], pageSize: 100 },
    }),
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  return (
    <section
      className="grouping-lab keyed-groups-lab"
      aria-label="Keyed grouping example"
    >
      <p>
        Each work item owns a distinct Department instance. Stable keys form
        three groups; original class methods supply labels. Budget totals follow
        the current filter.
      </p>
      <div className="grouping-lab-controls">
        <button
          type="button"
          onClick={() => model.setFilter("amount", { op: "gt", value: 450 })}
        >
          Show final six items
        </button>
        <button
          type="button"
          disabled={!state.filters.amount}
          onClick={() => model.setFilter("amount")}
        >
          Show all items
        </button>
        <button type="button" onClick={() => model.setSort("amount", "desc")}>
          Sort group totals
        </button>
        <output aria-label="Matching work items">
          {model.getFilteredRows().length} matching work items
        </output>
      </div>
      <DataGrid
        model={model}
        height={240}
        ariaLabel="Keyed class grouping"
        selectionMode="none"
        toolbar={false}
      />
    </section>
  );
}
