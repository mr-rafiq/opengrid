import { describe, expect, it, vi } from "vitest";
import {
  aggregateValues,
  createGrid,
  csvCell,
  getVirtualWindow,
  matchesFilter,
} from "./index";
import type { Column, GridOptions } from "./types";

interface RecordRow {
  id: string;
  name: string;
  country: string;
  amount: number;
  active: boolean;
  date: string;
  large: bigint;
  path: string[];
}
const rows: RecordRow[] = [
  {
    id: "a",
    name: "Alice",
    country: "UK",
    amount: 30,
    active: true,
    date: "2026-01-03",
    large: 9007199254740993n,
    path: ["Europe", "UK", "Alice"],
  },
  {
    id: "b",
    name: "Bob",
    country: "US",
    amount: 10,
    active: false,
    date: "2026-01-01",
    large: 9007199254740995n,
    path: ["America", "US", "Bob"],
  },
  {
    id: "c",
    name: "Cara",
    country: "UK",
    amount: 10,
    active: true,
    date: "2026-01-02",
    large: 9007199254740994n,
    path: ["Europe", "UK", "Cara"],
  },
  {
    id: "d",
    name: "Dave",
    country: "US",
    amount: 20,
    active: true,
    date: "2026-01-04",
    large: 9007199254740996n,
    path: ["America", "US", "Dave"],
  },
];
const columns: Column<RecordRow>[] = [
  {
    id: "name",
    field: "name",
    header: "Name",
    editable: true,
    minWidth: 80,
    maxWidth: 300,
  },
  { id: "country", field: "country" },
  {
    id: "amount",
    field: "amount",
    type: "number",
    editable: true,
    aggregate: "sum",
    validate: (value) => (Number(value) < 0 ? "Must be positive" : undefined),
  },
  { id: "active", field: "active", type: "boolean", editable: true },
  { id: "date", field: "date", type: "date", editable: true },
  { id: "large", field: "large", type: "bigint", editable: true },
  { id: "double", valueGetter: (row) => row.amount * 2 },
];
function grid(patch: Partial<GridOptions<RecordRow>> = {}) {
  return createGrid({ rows, columns, getRowId: (row) => row.id, ...patch });
}
const ids = (model: ReturnType<typeof grid>) =>
  model.getFilteredRows().map((row) => row.id);

describe("stable row operations", () => {
  it("sorts ties stably and supports prioritized multi sort", () => {
    const model = grid();
    model.setSort("amount", "asc");
    expect(ids(model)).toEqual(["b", "c", "d", "a"]);
    model.setSort("country", "asc");
    model.setSort("amount", "desc", true);
    expect(ids(model)).toEqual(["a", "c", "d", "b"]);
    model.setSort("country", null, true);
    expect(ids(model)).toEqual(["a", "d", "b", "c"]);
  });
  it("sorts precise bigint values without converting to number", () => {
    const model = grid();
    model.setSort("large", "desc");
    expect(ids(model)).toEqual(["d", "b", "c", "a"]);
  });
  it("keeps blanks last in both sort directions", () => {
    const model = createGrid({
      rows: [
        { id: "a", x: null },
        { id: "b", x: 2 },
        { id: "c", x: 1 },
      ],
      columns: [{ id: "x", field: "x", type: "number" }],
      getRowId: (row) => row.id,
    });
    model.setSort("x", "desc");
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    model.setSort("x", "asc");
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
  it("supports custom comparators and computed values", () => {
    const model = grid({
      columns: [
        {
          id: "name",
          field: "name",
          compare: (a, b) => String(a).length - String(b).length,
        },
        columns[6],
      ],
    });
    model.setSort("name", "asc");
    expect(ids(model)).toEqual(["b", "c", "d", "a"]);
    expect(model.getValue(rows[0], "double")).toBe(60);
  });
  it("combines filters with AND, quick filter terms with AND, and formatted values", () => {
    const model = grid({
      columns: [
        ...columns,
        {
          id: "display",
          valueGetter: (row) => row.amount,
          valueFormatter: (value) => `USD ${value}`,
        },
      ],
    });
    model.setFilter("active", { op: "equals", value: true });
    model.setQuickFilter("UK USD");
    expect(ids(model)).toEqual(["a", "c"]);
    model.setFilter("amount", { op: "between", value: 20, to: 40 });
    expect(ids(model)).toEqual(["a"]);
    model.setFilter("amount");
    expect(ids(model)).toEqual(["a", "c"]);
  });
  it("uses precise bigint and date filters", () => {
    const model = grid();
    model.setFilter("large", { op: "gt", value: "9007199254740994" });
    expect(ids(model)).toEqual(["b", "d"]);
    model.setFilter("large");
    model.setFilter("date", {
      op: "between",
      value: "2026-01-02",
      to: "2026-01-03",
    });
    expect(ids(model)).toEqual(["a", "c"]);
  });
  it("rejects duplicate IDs and invalid page sizes", () => {
    expect(() => grid({ rows: [rows[0], rows[0]] })).toThrow(/unique/);
    expect(() => grid({ columns: [columns[0], columns[0]] })).toThrow(/unique/);
    expect(() => grid({ initialState: { pageSize: 0 } })).toThrow(/positive/);
  });
  it("does not mutate input arrays or row objects when editing", () => {
    const model = grid();
    model.editCell("a", "name", "Changed");
    expect(rows[0].name).toBe("Alice");
    expect(model.getRows()[0].name).toBe("Changed");
  });
});

describe("filter predicates", () => {
  it.each([
    ["contains", "Alpha", "PH", true],
    ["startsWith", "Alpha", "al", true],
    ["endsWith", "Alpha", "HA", true],
    ["equals", "Alpha", "alpha", true],
    ["notEqual", "Alpha", "alpha", false],
    ["gt", 3, 2, true],
    ["gte", 2, 2, true],
    ["lt", 1, 2, true],
    ["lte", 2, 2, true],
    ["blank", "", undefined, true],
    ["notBlank", 0, undefined, true],
    ["in", "a", ["A", "B"], true],
  ] as const)("%s works with %s", (op, value, expectedValue, expected) => {
    expect(matchesFilter(value, { op, value: expectedValue })).toBe(expected);
  });
  it("does not match invalid numeric/date comparisons", () => {
    expect(
      matchesFilter(4, { op: "gt", value: "bad" }, { id: "x", type: "number" }),
    ).toBe(false);
    expect(
      matchesFilter(
        "2026-01-02",
        { op: "lt", value: "bad" },
        { id: "x", type: "date" },
      ),
    ).toBe(false);
  });
});

describe("columns, state, selection, notifications", () => {
  it("moves, clamps widths, pins and hides columns with state restoration", () => {
    const model = grid();
    model.resizeColumn("name", 1);
    expect(model.getColumns()[0].width).toBe(80);
    model.resizeColumn("name", 999);
    expect(model.getColumns()[0].width).toBe(300);
    model.moveColumn("amount", 0);
    model.pinColumn("name", "left");
    model.pinColumn("country", "right");
    model.hideColumn("large", true);
    expect(model.getColumns().map((column) => column.id)).toEqual([
      "name",
      "amount",
      "active",
      "date",
      "large",
      "double",
      "country",
    ]);
    expect(
      model.getColumns().find((column) => column.id === "large")?.hidden,
    ).toBe(true);
    const restored = grid({
      initialState: JSON.parse(JSON.stringify(model.getState())),
    });
    expect(restored.getColumns()).toEqual(model.getColumns());
  });
  it("selects only known rows, supports single/multi selection and clears removed IDs", () => {
    const model = grid();
    model.toggleSelection("a");
    model.toggleSelection("b");
    expect(model.getState().selected).toEqual(["b"]);
    model.toggleSelection("c", true);
    model.toggleSelection("missing", true);
    expect(model.getState().selected).toEqual(["b", "c"]);
    model.toggleSelection("b", true);
    model.selectRows(["a", "a", "missing"]);
    expect(model.getState().selected).toEqual(["a"]);
    model.applyTransaction({ remove: ["a"] });
    expect(model.getState().selected).toEqual([]);
  });
  it("notifies once per mutation and unsubscribe works", () => {
    const model = grid(),
      listener = vi.fn(),
      unsubscribe = model.subscribe(listener);
    model.batchEdit([
      { rowId: "a", columnId: "name", value: "New" },
      { rowId: "b", columnId: "name", value: "Other" },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    model.setQuickFilter("New");
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("provides immutable stable snapshots and changes identity on row edits for React subscriptions", () => {
    const model = grid(),
      before = model.getState();
    expect(model.getState()).toBe(before);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.selected)).toBe(true);
    model.editCell("a", "name", "New");
    expect(model.getState()).not.toBe(before);
    const edited = model.getState();
    model.undo();
    expect(model.getState()).not.toBe(edited);
    const filter = { op: "in" as const, value: ["UK"] };
    model.setFilter("country", filter);
    filter.value.push("US");
    expect(ids(model)).toEqual(["a", "c"]);
    expect(Object.isFrozen(model.getState().filters.country)).toBe(true);
  });
  it("normalizes a multiple selection on the next single-selection interaction", () => {
    const model = grid();
    model.selectRows(["a", "b", "c"]);
    model.toggleSelection("b", false);
    expect(model.getState().selected).toEqual(["b"]);
    model.toggleSelection("b", false);
    expect(model.getState().selected).toEqual([]);
  });
  it("normalizes stale state IDs and preserves all columns", () => {
    const model = grid({
      initialState: {
        columnOrder: ["missing", "amount", "amount"],
        selected: ["missing"],
        sorting: [{ columnId: "missing", direction: "asc" }],
      },
    });
    expect(model.getState().columnOrder).toEqual([
      "amount",
      "name",
      "country",
      "active",
      "date",
      "large",
      "double",
    ]);
    expect(model.getState().selected).toEqual([]);
    expect(model.getState().sorting).toEqual([]);
  });
  it("paginates flattened data and clamps requested pages", () => {
    const model = grid({ initialState: { pageSize: 2 } });
    expect(model.getPageCount()).toBe(2);
    model.setState({ page: 999 });
    expect(model.getState().page).toBe(1);
    expect(model.getPageRows().map((row) => row.id)).toEqual(["c", "d"]);
    model.setQuickFilter("Alice");
    expect(model.getState().page).toBe(0);
    expect(model.getPageCount()).toBe(1);
  });
});

describe("grouping, tree data and aggregates", () => {
  it("builds multi-level groups, aggregates filtered descendants, expands and collapses", () => {
    const model = grid({ initialState: { groupBy: ["country", "active"] } });
    const root = model.getRowModel()[0];
    expect(root.kind).toBe("group");
    expect(root.label).toBe("UK");
    expect(root.aggregates?.amount).toBe(40);
    expect(root.leafCount).toBe(2);
    model.toggleExpanded(root.id);
    const nested = model.getRowModel()[1];
    expect(nested.depth).toBe(1);
    model.toggleExpanded(nested.id);
    expect(
      model
        .getRowModel()
        .filter((node) => node.kind === "row")
        .map((node) => node.id),
    ).toEqual(["a", "c"]);
    model.toggleExpanded(root.id);
    expect(model.getRowModel()).toHaveLength(2);
    model.setFilter("amount", { op: "gt", value: 20 });
    expect(model.getRowModel()[0].aggregates?.amount).toBe(30);
  });
  it("distinguishes group keys with different scalar types", () => {
    const model = createGrid({
      rows: [
        { id: "a", x: undefined },
        { id: "b", x: null },
        { id: "c", x: "null" },
      ],
      columns: [{ id: "x", field: "x" }],
      getRowId: (row) => row.id,
      initialState: { groupBy: ["x"] },
    });
    expect(new Set(model.getRowModel().map((node) => node.id)).size).toBe(3);
  });
  it("avoids group ID collisions with caller-assigned row IDs", () => {
    const collision = 'group:[["string","UK"]]';
    const model = grid({
      rows: [{ ...rows[0], id: collision }],
      initialState: { groupBy: ["country"] },
    });
    const groupNode = model.getRowModel()[0];
    expect(groupNode.id).not.toBe(collision);
    model.toggleExpanded(groupNode.id);
    expect(new Set(model.getRowModel().map((node) => node.id)).size).toBe(2);
  });
  it("supports sums, averages, bounds, counts, custom and precise bigint aggregation", () => {
    expect(aggregateValues([1, 2, 3, null, NaN], "sum")).toBe(6);
    expect(aggregateValues([1, 2, 3], "avg")).toBe(2);
    expect(aggregateValues([1, 2, 3], "min")).toBe(1);
    expect(aggregateValues([1, 2, 3], "max")).toBe(3);
    expect(aggregateValues([1, null, "", 0], "count")).toBe(4);
    expect(aggregateValues([], "sum")).toBe(0);
    expect(aggregateValues([9007199254740993n, 2n], "sum")).toBe(
      9007199254740995n,
    );
    expect(aggregateValues([3n, 4n], "avg")).toBe(3n);
    expect(aggregateValues(["x", "y"], (values) => values.join("|"))).toBe(
      "x|y",
    );
    expect(() => aggregateValues([1, 2n], "sum")).toThrow(/mixed/);
  });
  it("builds synthetic tree branches and retains real ancestors while filtering", () => {
    const model = grid({ getTreePath: (row) => row.path });
    let nodes = model.getRowModel();
    expect(nodes.map((node) => node.label)).toEqual(["Europe", "America"]);
    model.toggleExpanded(nodes[0].id);
    nodes = model.getRowModel();
    model.toggleExpanded(nodes[1].id);
    expect(
      model
        .getRowModel()
        .filter((node) => node.kind === "row")
        .map((node) => node.id),
    ).toEqual(["a", "c"]);
    model.setQuickFilter("Cara");
    expect(model.getRowModel().at(-1)?.id).toBe("c");
  });
  it("supports actual data rows as tree parents", () => {
    const parent = { ...rows[0], path: ["Root"] },
      child = { ...rows[1], path: ["Root", "Child"] };
    const model = grid({
      rows: [parent, child],
      getTreePath: (row) => row.path,
    });
    expect(model.getRowModel()[0].id).toBe("a");
    model.toggleExpanded("a");
    expect(model.getRowModel().map((node) => node.id)).toEqual(["a", "b"]);
    model.setQuickFilter("Bob");
    expect(model.getRowModel().map((node) => node.id)).toEqual(["a", "b"]);
  });
  it("rejects ambiguous duplicate paths", () => {
    const model = grid({
      rows: [rows[0], { ...rows[1], path: rows[0].path }],
      getTreePath: (row) => row.path,
    });
    expect(() => model.getRowModel()).toThrow(/Duplicate tree path/);
  });
});

describe("editing and transactions", () => {
  it("parses typed edits, validates, and commits atomically", () => {
    const model = grid();
    expect(
      model.batchEdit([
        { rowId: "a", columnId: "amount", value: "42" },
        { rowId: "b", columnId: "amount", value: "-1" },
      ]),
    ).toBe("Must be positive");
    expect(model.getRows()[0].amount).toBe(30);
    expect(model.undo()).toBe(false);
    expect(
      model.batchEdit([
        { rowId: "a", columnId: "amount", value: "42" },
        { rowId: "a", columnId: "active", value: "false" },
      ]),
    ).toBeUndefined();
    expect(model.getRows()[0]).toMatchObject({ amount: 42, active: false });
    expect(model.undo()).toBe(true);
    expect(model.getRows()[0]).toMatchObject({ amount: 30, active: true });
    expect(model.redo()).toBe(true);
    expect(model.getRows()[0].amount).toBe(42);
  });
  it("rejects invalid types and read-only computed columns", () => {
    const model = grid();
    expect(model.editCell("a", "amount", "NaN")).toMatch(/finite/);
    expect(model.editCell("a", "date", "nonsense")).toMatch(/valid date/);
    expect(model.editCell("a", "active", "perhaps")).toMatch(/true or false/);
    expect(model.editCell("a", "large", "x")).toBeTruthy();
    expect(model.editCell("a", "double", 2)).toMatch(/read only/);
    expect(model.editCell("a", "large", "9007199254740999")).toBeUndefined();
    expect(model.getRows()[0].large).toBe(9007199254740999n);
  });
  it("preserves immutable IDs and handles custom parsers", () => {
    const model = grid({
      columns: [
        { id: "id", field: "id", editable: true },
        {
          id: "name",
          field: "name",
          editable: true,
          valueParser: (value) => String(value).trim(),
        },
      ],
    });
    expect(model.editCell("a", "id", "new")).toMatch(/row ID/);
    model.editCell("a", "name", " trimmed ");
    expect(model.getRows()[0].name).toBe("trimmed");
  });
  it("limits history and drops redo after a new edit", () => {
    const model = grid({ historyLimit: 1 });
    model.editCell("a", "amount", 40);
    model.editCell("a", "amount", 50);
    expect(model.undo()).toBe(true);
    expect(model.undo()).toBe(false);
    model.editCell("a", "amount", 60);
    expect(model.redo()).toBe(false);
  });
  it("applies atomic add/update/remove and rejects conflicting IDs", () => {
    const model = grid();
    model.applyTransaction({
      remove: ["b"],
      update: [{ ...rows[0], amount: 99 }],
      add: [{ ...rows[1], id: "e" }],
    });
    expect(model.getRows().map((row) => row.id)).toEqual(["a", "c", "d", "e"]);
    expect(model.getRows()[0].amount).toBe(99);
    const before = model.getRows();
    expect(() =>
      model.applyTransaction({ remove: ["d"], add: [rows[0]] }),
    ).toThrow(/unique/);
    expect(model.getRows()).toEqual(before);
    expect(() =>
      model.applyTransaction({ update: [{ ...rows[0], id: "missing" }] }),
    ).toThrow(/missing/);
  });
  it("invalidates cached sort/filter/aggregate results after edits", () => {
    const model = grid();
    model.setSort("amount", "asc");
    expect(ids(model)[0]).toBe("b");
    model.editCell("a", "amount", 1);
    expect(ids(model)[0]).toBe("a");
    model.undo();
    expect(ids(model)[0]).toBe("b");
  });
});

describe("safe CSV and virtualization", () => {
  it.each([
    "=SUM(A1:A2)",
    "+CMD",
    "-CMD",
    "@SUM(A1)",
    "  =formula",
    "\tformula",
    "\rformula",
    "\nformula",
  ])("neutralizes spreadsheet formulas %s", (value) =>
    expect(csvCell(value)).toBe("\"'" + value + '"'),
  );
  it("quotes delimiters, quotes and newlines according to RFC 4180", () => {
    expect(csvCell('hello,"world"\nnext')).toBe('"hello,""world""\nnext"');
    expect(csvCell(null)).toBe('""');
  });
  it("exports filtered/sorted visible columns and selected rows; works when detached", () => {
    const model = grid();
    model.hideColumn("large", true);
    model.setSort("amount", "asc");
    model.setFilter("country", { op: "equals", value: "UK" });
    model.selectRows(["a"]);
    const { exportCsv } = model;
    const output = exportCsv({ selectedOnly: true });
    expect(output.split("\r\n")).toHaveLength(2);
    expect(output).toContain('"Alice"');
    expect(output).not.toContain('"large"');
    expect(exportCsv({ allRows: true }).split("\r\n")).toHaveLength(5);
  });
  it("computes bounded windows at start, middle, end and empty datasets", () => {
    expect(getVirtualWindow(1000, 0, 400, 40, 5)).toEqual({
      start: 0,
      end: 15,
      offset: 0,
      totalHeight: 40000,
    });
    expect(getVirtualWindow(1000, 20000, 400, 40, 5)).toEqual({
      start: 495,
      end: 515,
      offset: 19800,
      totalHeight: 40000,
    });
    expect(getVirtualWindow(10, 99999, 400, 40).end).toBe(10);
    expect(getVirtualWindow(0, 0, 400, 40).end).toBe(0);
    expect(() => getVirtualWindow(10, 0, 40, 0)).toThrow(RangeError);
  });
});
