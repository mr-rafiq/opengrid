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

describe("final staged row validation and direct row lookup", () => {
  it.each([false, true])(
    "validates cross-field constraints against the final staged row regardless of edit order (%s)",
    (reverse) => {
      const model = createGrid({
        rows: [{ id: "row", minimum: 5, maximum: 10 }],
        getRowId: (row) => row.id,
        columns: [
          {
            id: "minimum",
            field: "minimum",
            type: "number",
            editable: true,
            validate: (value, row) =>
              Number(value) > row.maximum
                ? "Minimum exceeds maximum"
                : undefined,
          },
          {
            id: "maximum",
            field: "maximum",
            type: "number",
            editable: true,
            validate: (value, row) =>
              Number(value) < row.minimum ? "Maximum below minimum" : undefined,
          },
        ],
      });
      const listener = vi.fn();
      model.subscribe(listener);
      const edits = [
        { rowId: "row", columnId: "minimum", value: "20" },
        { rowId: "row", columnId: "maximum", value: "30" },
      ];
      expect(
        model.batchEdit(reverse ? edits.reverse() : edits),
      ).toBeUndefined();
      expect(model.getRow("row")).toEqual({
        id: "row",
        minimum: 20,
        maximum: 30,
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(model.undo()).toBe(true);
      expect(model.getRow("row")).toEqual({
        id: "row",
        minimum: 5,
        maximum: 10,
      });
      expect(model.undo()).toBe(false);
    },
  );
  it("rolls back every row, history and notifications when a final cross-field validator rejects", () => {
    const validate = vi.fn(
      (
        value: unknown,
        row: { id: string; minimum: number; maximum: number },
      ) => (Number(value) > row.maximum ? "Invalid final interval" : undefined),
    );
    const model = createGrid({
      rows: [
        { id: "a", minimum: 5, maximum: 10 },
        { id: "b", minimum: 1, maximum: 2 },
      ],
      getRowId: (row) => row.id,
      columns: [
        {
          id: "minimum",
          field: "minimum",
          editable: true,
          type: "number",
          validate,
        },
        { id: "maximum", field: "maximum", editable: true, type: "number" },
      ],
    });
    const before = model.getRows(),
      snapshot = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    expect(
      model.batchEdit([
        { rowId: "b", columnId: "maximum", value: 3 },
        { rowId: "a", columnId: "minimum", value: 40 },
        { rowId: "a", columnId: "maximum", value: 30 },
      ]),
    ).toBe("Invalid final interval");
    expect(model.getRows()).toEqual(before);
    expect(model.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    expect(model.undo()).toBe(false);
  });
  it("parses progressively but validates duplicate row/column targets only once against the final value", () => {
    const parser = vi.fn(
        (value: unknown, row: { id: string; a: number; b: number }) =>
          Number(value) + row.a,
      ),
      validate = vi.fn(() => undefined);
    const model = createGrid({
      rows: [{ id: "r", a: 1, b: 2 }],
      getRowId: (row) => row.id,
      columns: [
        { id: "a", field: "a", editable: true, type: "number", validate },
        { id: "b", field: "b", editable: true, valueParser: parser },
      ],
    });
    expect(
      model.batchEdit([
        { rowId: "r", columnId: "a", value: 3 },
        { rowId: "r", columnId: "a", value: 5 },
        { rowId: "r", columnId: "b", value: 10 },
      ]),
    ).toBeUndefined();
    expect(model.getRow("r")).toEqual({ id: "r", a: 5, b: 15 });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0]).toEqual([5, { id: "r", a: 5, b: 15 }]);
  });
  it("skips mutation/history/notification for normalized no-op edits and preserves redo", () => {
    const model = grid();
    model.editCell("a", "amount", 40);
    model.undo();
    const before = model.getRow("a"),
      snapshot = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    expect(
      model.batchEdit([{ rowId: "a", columnId: "amount", value: "30" }]),
    ).toBeUndefined();
    expect(model.getRow("a")).toBe(before);
    expect(model.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    expect(model.redo()).toBe(true);
    expect(model.getRow("a")?.amount).toBe(40);
  });
  it("keeps Date timestamps and BigInt exact during no-op detection", () => {
    const model = createGrid({
      rows: [
        {
          id: "r",
          date: new Date("2026-01-01T00:00:00.123Z"),
          count: 9007199254740993n,
        },
      ],
      getRowId: (row) => row.id,
      columns: [
        { id: "date", field: "date", editable: true },
        { id: "count", field: "count", type: "bigint", editable: true },
      ],
    });
    const before = model.getRow("r");
    expect(
      model.batchEdit([
        {
          rowId: "r",
          columnId: "date",
          value: new Date("2026-01-01T00:00:00.123Z"),
        },
        { rowId: "r", columnId: "count", value: "9007199254740993" },
      ]),
    ).toBeUndefined();
    expect(model.getRow("r")).toBe(before);
    expect(model.undo()).toBe(false);
  });
  it("catches validator exceptions without mutation and preserves row ID guards", () => {
    const model = grid({
      columns: [
        {
          id: "name",
          field: "name",
          editable: true,
          validate: () => {
            throw new Error("Validator failure");
          },
        },
        { id: "id", field: "id", editable: true },
      ],
    });
    expect(model.editCell("a", "name", "Changed")).toBe("Validator failure");
    expect(model.getRow("a")?.name).toBe("Alice");
    expect(model.editCell("a", "id", "new")).toContain("row ID");
    expect(model.undo()).toBe(false);
  });
  it("caches direct lookups by rows-array identity and refreshes after edits/undo/transactions/replacement", () => {
    const getRowId = vi.fn((row: RecordRow) => row.id),
      model = grid({ getRowId });
    getRowId.mockClear();
    expect(model.getRow("a")?.name).toBe("Alice");
    const indexedCalls = getRowId.mock.calls.length;
    expect(indexedCalls).toBe(4);
    expect(model.getRow("b")?.name).toBe("Bob");
    expect(model.getRow("missing")).toBeUndefined();
    expect(getRowId).toHaveBeenCalledTimes(indexedCalls);
    model.editCell("a", "amount", 99);
    expect(model.getRow("a")?.amount).toBe(99);
    model.undo();
    expect(model.getRow("a")?.amount).toBe(30);
    model.applyTransaction({ remove: ["a"] });
    expect(model.getRow("a")).toBeUndefined();
    model.setRows(rows);
    expect(model.getRow("a")?.name).toBe("Alice");
  });
});

describe("prototype-like column IDs", () => {
  it("does not read inherited width, visibility or pinning and supports filtering/state serialization", () => {
    const columns: Column<{ id: string; a: string; b: string; c: string }>[] = [
      { id: "__proto__", field: "a" },
      { id: "constructor", field: "b" },
      { id: "toString", field: "c" },
    ];
    const model = createGrid({
      rows: [{ id: "r", a: "A", b: "B", c: "C" }],
      columns,
      getRowId: (row) => row.id,
    });
    expect(model.getColumns().map((column) => column.id)).toEqual([
      "__proto__",
      "constructor",
      "toString",
    ]);
    expect(model.getColumns().map((column) => column.width)).toEqual([
      160, 160, 160,
    ]);
    model.resizeColumn("__proto__", 90);
    model.hideColumn("constructor", true);
    model.pinColumn("toString", "left");
    model.pinColumn("__proto__", "right");
    model.setFilter("__proto__", { op: "equals", value: "a" });
    expect(model.getFilteredRows()).toHaveLength(1);
    expect(Object.hasOwn(model.getState().filters, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(model.getState().filters)).toBe(
      Object.prototype,
    );
    const serialized = JSON.stringify(model.getState()),
      restored = createGrid({
        rows: model.getRows(),
        columns,
        getRowId: (row) => row.id,
        initialState: JSON.parse(serialized),
      });
    expect(restored.getColumns()).toEqual(model.getColumns());
    expect(restored.getFilteredRows()).toHaveLength(1);
    restored.setFilter("__proto__");
    expect(Object.hasOwn(restored.getState().filters, "__proto__")).toBe(false);
    expect(restored.getFilteredRows()).toHaveLength(1);
  });
  it("normalizes malformed own records safely and ignores inherited caller-map properties", () => {
    const inherited = Object.create({ constructor: 9, __proto__: 7 }) as Record<
      string,
      number
    >;
    const model = createGrid({
      rows: [{ id: "r", value: 1 }],
      columns: [
        { id: "__proto__", field: "value" },
        { id: "constructor", field: "value" },
      ],
      getRowId: (row) => row.id,
      initialState: {
        columnWidths: inherited,
        columnPinning: JSON.parse(
          '{"__proto__":"invalid","constructor":"left"}',
        ),
        columnVisibility: JSON.parse(
          '{"__proto__":"invalid","constructor":false}',
        ),
      },
    });
    expect(model.getColumns().map((column) => column.id)).toEqual([
      "constructor",
      "__proto__",
    ]);
    expect(model.getColumns().map((column) => column.width)).toEqual([
      160, 160,
    ]);
    expect(model.getColumns()[0].hidden).toBe(true);
    expect(model.getColumns()[1].hidden).not.toBe(true);
    expect(Object.hasOwn(model.getState().columnPinning, "__proto__")).toBe(
      false,
    );
    model.setState({
      columnWidths: JSON.parse('{"__proto__":12,"constructor":250}'),
    });
    expect(
      model.getColumns().find((column) => column.id === "__proto__")?.width,
    ).toBe(40);
    expect(
      model.getColumns().find((column) => column.id === "constructor")?.width,
    ).toBe(250);
  });
});

describe("bounded optional value-getter cache", () => {
  it("is disabled by default and enabled explicitly for canonical getter results", () => {
    const getter = vi.fn((row: RecordRow) => row.amount * 2),
      column: Column<RecordRow> = { id: "computed", valueGetter: getter };
    const uncached = grid({ columns: [column] });
    expect(uncached.getValue(rows[0], "computed")).toBe(60);
    expect(uncached.getValue(rows[0], "computed")).toBe(60);
    expect(getter).toHaveBeenCalledTimes(2);
    getter.mockClear();
    const cached = grid({ columns: [column], valueCache: true });
    expect(cached.getValue(rows[0], "computed")).toBe(60);
    expect(cached.getValue(rows[0], "computed")).toBe(60);
    expect(getter).toHaveBeenCalledTimes(1);
  });
  it("preserves values across sorting, filters, search, selection, pagination, grouping and layout changes", () => {
    const getter = vi.fn((row: RecordRow) => row.amount * 2),
      model = grid({
        columns: [
          ...columns,
          {
            id: "computed",
            valueGetter: getter,
            type: "number",
            aggregate: "sum",
          },
        ],
        valueCache: true,
      });
    rows.forEach((row) => model.getValue(row, "computed"));
    expect(getter).toHaveBeenCalledTimes(4);
    model.setSort("computed", "asc");
    model.getFilteredRows();
    model.setFilter("computed", { op: "gte", value: 20 });
    model.setAdvancedFilter({
      kind: "condition",
      columnId: "computed",
      filter: { op: "lte", value: 60 },
    });
    model.setQuickFilter("UK");
    model.getFilteredRows();
    model.setQuickFilter("");
    model.toggleSelection("a", true);
    model.resizeColumn("computed", 230);
    model.pinColumn("computed", "left");
    model.hideColumn("large", true);
    model.moveColumn("computed", 1);
    model.setState({ pageSize: 1, page: 2, groupBy: ["country"] });
    model.getRowModel();
    model.exportCsv();
    expect(getter).toHaveBeenCalledTimes(4);
  });
  it("clears all entries when rows change through edits, undo/redo, transactions and setRows", () => {
    const getter = vi.fn((row: RecordRow) => row.amount * 2),
      model = grid({
        columns: [...columns, { id: "computed", valueGetter: getter }],
        valueCache: true,
      });
    const read = () => model.getValue(model.getRow("a")!, "computed");
    expect(read()).toBe(60);
    expect(getter).toHaveBeenCalledTimes(1);
    model.editCell("a", "amount", 40);
    expect(read()).toBe(80);
    model.undo();
    expect(read()).toBe(60);
    model.redo();
    expect(read()).toBe(80);
    model.applyTransaction({ update: [{ ...rows[0], amount: 50 }] });
    expect(read()).toBe(100);
    model.setRows(rows);
    expect(read()).toBe(60);
    expect(getter).toHaveBeenCalledTimes(6);
  });
  it("expires on any rows-array replacement even when the queried row object is unchanged", () => {
    const getter = vi.fn((row: RecordRow) => row.amount),
      model = grid({
        columns: [...columns, { id: "computed", valueGetter: getter }],
        valueCache: true,
      });
    model.getValue(rows[0], "computed");
    model.editCell("b", "amount", 11);
    expect(model.getRow("a")).toBe(rows[0]);
    model.getValue(rows[0], "computed");
    expect(getter).toHaveBeenCalledTimes(2);
    model.setRows(model.getRows());
    model.getValue(rows[0], "computed");
    expect(getter).toHaveBeenCalledTimes(3);
  });
  it("retains caches on normalized no-op edits and failed edits", () => {
    const getter = vi.fn((row: RecordRow) => row.amount),
      model = grid({
        columns: [...columns, { id: "computed", valueGetter: getter }],
        valueCache: true,
      });
    model.getValue(rows[0], "computed");
    model.editCell("a", "amount", "30");
    expect(model.editCell("a", "amount", -1)).toBe("Must be positive");
    model.getValue(rows[0], "computed");
    expect(getter).toHaveBeenCalledTimes(1);
  });
  it("explicit expiry clears getter and derived caches and notifies for external closure dependencies", () => {
    let multiplier = 1;
    const getter = vi.fn((row: RecordRow) => row.amount * multiplier),
      model = grid({
        columns: [
          {
            id: "computed",
            valueGetter: getter,
            type: "number",
            aggregate: "sum",
          },
        ],
        valueCache: true,
      });
    model.setFilter("computed", { op: "gt", value: 25 });
    expect(ids(model)).toEqual(["a"]);
    model.getRowModel();
    const snapshot = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    multiplier = 3;
    expect(model.getValue(rows[1], "computed")).toBe(10);
    expect(ids(model)).toEqual(["a"]);
    const { expireValueCache } = model;
    expireValueCache();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(model.getState()).not.toBe(snapshot);
    expect(ids(model)).toEqual(["a", "b", "c", "d"]);
    expect(model.getValue(rows[1], "computed")).toBe(30);
  });
  it("explicit expiry refreshes derived queries when getter caching is disabled too", () => {
    let factor = 1;
    const model = grid({
      columns: [
        {
          id: "computed",
          valueGetter: (row) => row.amount * factor,
          type: "number",
        },
      ],
    });
    model.setFilter("computed", { op: "gt", value: 25 });
    expect(ids(model)).toEqual(["a"]);
    factor = 3;
    model.expireValueCache();
    expect(ids(model)).toEqual(["a", "b", "c", "d"]);
  });
  it("uses bounded LRU eviction and refreshes recency on hits", () => {
    const getter = vi.fn((row: RecordRow) => row.amount),
      model = grid({
        columns: [{ id: "computed", valueGetter: getter }],
        valueCache: true,
        valueCacheMaxEntries: 2,
      });
    model.getValue(rows[0], "computed");
    model.getValue(rows[1], "computed");
    model.getValue(rows[0], "computed");
    model.getValue(rows[2], "computed");
    expect(getter).toHaveBeenCalledTimes(3);
    model.getValue(rows[0], "computed");
    expect(getter).toHaveBeenCalledTimes(3);
    model.getValue(rows[1], "computed");
    expect(getter).toHaveBeenCalledTimes(4);
    model.getValue(rows[2], "computed");
    expect(getter).toHaveBeenCalledTimes(5);
  });
  it("shares the capacity across rows and columns", () => {
    const first = vi.fn((row: RecordRow) => row.amount),
      second = vi.fn((row: RecordRow) => row.amount * 2),
      model = grid({
        columns: [
          { id: "first", valueGetter: first },
          { id: "second", valueGetter: second },
        ],
        valueCache: true,
        valueCacheMaxEntries: 1,
      });
    model.getValue(rows[0], "first");
    model.getValue(rows[0], "second");
    model.getValue(rows[0], "first");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, false, 0, "", 0n])(
    "caches successful falsy result %s",
    (result) => {
      const getter = vi.fn(() => result),
        model = grid({
          columns: [{ id: "computed", valueGetter: getter }],
          valueCache: true,
        });
      expect(model.getValue(rows[0], "computed")).toBe(result);
      expect(model.getValue(rows[0], "computed")).toBe(result);
      expect(getter).toHaveBeenCalledTimes(1);
    },
  );
  it("never caches a thrown getter and permits a later successful retry", () => {
    let broken = true;
    const expected = new Error("Getter failed"),
      getter = vi.fn(() => {
        if (broken) throw expected;
        return 7;
      }),
      model = grid({
        columns: [{ id: "computed", valueGetter: getter }],
        valueCache: true,
      });
    expect(() => model.getValue(rows[0], "computed")).toThrow(expected);
    expect(() => model.getValue(rows[0], "computed")).toThrow(expected);
    broken = false;
    expect(model.getValue(rows[0], "computed")).toBe(7);
    expect(model.getValue(rows[0], "computed")).toBe(7);
    expect(getter).toHaveBeenCalledTimes(3);
  });
  it("does not share or populate entries for foreign rows with the same ID", () => {
    const getter = vi.fn((row: RecordRow) => row.amount),
      model = grid({
        columns: [{ id: "computed", valueGetter: getter }],
        valueCache: true,
        valueCacheMaxEntries: 1,
      }),
      foreign = { ...rows[0], amount: 999 };
    expect(model.getValue(rows[0], "computed")).toBe(30);
    expect(model.getValue(foreign, "computed")).toBe(999);
    expect(model.getValue(foreign, "computed")).toBe(999);
    expect(model.getValue(rows[0], "computed")).toBe(30);
    expect(getter).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 20; index++)
      model.getValue({ ...rows[0], id: "foreign-" + index }, "computed");
    expect(model.getValue(rows[0], "computed")).toBe(30);
    expect(getter).toHaveBeenCalledTimes(23);
  });
  it("does not reuse cached values for prior row objects after replacement", () => {
    const getter = vi.fn((row: RecordRow) => row.amount),
      model = grid({
        columns: [...columns, { id: "computed", valueGetter: getter }],
        valueCache: true,
      });
    model.getValue(rows[0], "computed");
    model.editCell("a", "amount", 99);
    expect(model.getValue(rows[0], "computed")).toBe(30);
    expect(model.getValue(model.getRow("a")!, "computed")).toBe(99);
    expect(model.getValue(model.getRow("a")!, "computed")).toBe(99);
    expect(getter).toHaveBeenCalledTimes(3);
  });
  it("never caches raw field access or value formatters", () => {
    let raw = 1;
    const rawGetter = vi.fn(() => raw),
      row = Object.defineProperty({ id: "r", raw: 0 }, "raw", {
        get: rawGetter,
      }),
      formatter = vi.fn((value: unknown) => String(value)),
      getter = vi.fn(() => 7);
    const model = createGrid({
      rows: [row],
      columns: [
        { id: "raw", field: "raw" },
        { id: "computed", valueGetter: getter, valueFormatter: formatter },
      ],
      getRowId: (row) => row.id,
      valueCache: true,
    });
    expect(model.getValue(row, "raw")).toBe(1);
    raw = 2;
    expect(model.getValue(row, "raw")).toBe(2);
    expect(rawGetter).toHaveBeenCalledTimes(2);
    model.exportCsv();
    model.exportCsv();
    expect(getter).toHaveBeenCalledTimes(1);
    expect(formatter).toHaveBeenCalledTimes(2);
  });
  it("uses collision-safe keys including prototype-like identifiers", () => {
    const getter = vi.fn((row: { id: string; value: number }) => row.value),
      first = { id: "__proto__", value: 1 },
      second = { id: "constructor", value: 2 },
      model = createGrid({
        rows: [first, second],
        columns: [
          { id: "__proto__", valueGetter: getter },
          { id: "constructor", valueGetter: getter },
        ],
        getRowId: (row) => row.id,
        valueCache: true,
      });
    expect(model.getValue(first, "__proto__")).toBe(1);
    expect(model.getValue(second, "__proto__")).toBe(2);
    expect(model.getValue(first, "constructor")).toBe(1);
    expect(model.getValue(first, "__proto__")).toBe(1);
    expect(getter).toHaveBeenCalledTimes(3);
    const left = { id: "a:b", value: 3 },
      right = { id: "a", value: 4 },
      collision = createGrid({
        rows: [left, right],
        columns: [
          { id: "c", valueGetter: getter },
          { id: "b:c", valueGetter: getter },
        ],
        getRowId: (row) => row.id,
        valueCache: true,
      });
    expect(collision.getValue(left, "c")).toBe(3);
    expect(collision.getValue(right, "b:c")).toBe(4);
  });
  it("does not install a result across reentrant expiry or row mutation", () => {
    let model: ReturnType<typeof grid>,
      expire = true,
      multiplier = 1;
    const getter = vi.fn((row: RecordRow) => {
      const result = row.amount * multiplier;
      if (expire) {
        expire = false;
        model.expireValueCache();
        multiplier = 2;
      }
      return result;
    });
    model = grid({
      columns: [...columns, { id: "computed", valueGetter: getter }],
      valueCache: true,
    });
    expect(model.getValue(rows[0], "computed")).toBe(30);
    expect(model.getValue(rows[0], "computed")).toBe(60);
    expect(getter).toHaveBeenCalledTimes(2);
    let mutate = true;
    const change = vi.fn((row: RecordRow) => {
      const result = row.amount;
      if (mutate) {
        mutate = false;
        model.editCell("a", "amount", 99);
      }
      return result;
    });
    model = grid({
      columns: [...columns, { id: "computed", valueGetter: change }],
      valueCache: true,
    });
    expect(model.getValue(rows[0], "computed")).toBe(30);
    expect(model.getValue(model.getRow("a")!, "computed")).toBe(99);
    expect(change).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1000001, null, "10"])(
    "rejects invalid capacity %s even when caching is disabled",
    (maximum) => {
      expect(() => grid({ valueCacheMaxEntries: maximum as number })).toThrow(
        RangeError,
      );
    },
  );
  it("accepts minimum and maximum capacities and rejects nonboolean enablement", () => {
    expect(() => grid({ valueCacheMaxEntries: 1 })).not.toThrow();
    expect(() => grid({ valueCacheMaxEntries: 1000000 })).not.toThrow();
    expect(() => grid({ valueCache: 1 as unknown as boolean })).toThrow(
      TypeError,
    );
    expect(() => grid({ valueCache: null as unknown as boolean })).toThrow(
      TypeError,
    );
  });
});

describe("column group path metadata", () => {
  it("detaches the caller's array and each returned column definition without a UI depth restriction", () => {
    const path = ["Finance", "Revenue"],
      model = grid({
        columns: [{ id: "amount", field: "amount", groupPath: path }],
      });
    path[0] = "Changed";
    path.push("Unexpected");
    expect(model.getColumns()[0].groupPath).toEqual(["Finance", "Revenue"]);
    const first = model.getColumns(),
      second = model.getColumns();
    expect(first[0].groupPath).not.toBe(second[0].groupPath);
    (first[0].groupPath as string[])[0] = "Mutated";
    expect(model.getColumns()[0].groupPath).toEqual(["Finance", "Revenue"]);
    const deep = Array.from({ length: 20 }, (_, index) => String(index));
    expect(
      grid({
        columns: [{ id: "amount", field: "amount", groupPath: deep }],
      }).getColumns()[0].groupPath,
    ).toEqual(deep);
  });
  it("preserves absent/empty paths and rejects malformed metadata", () => {
    expect(grid().getColumns()[0].groupPath).toBeUndefined();
    expect(
      grid({
        columns: [{ id: "name", field: "name", groupPath: [] }],
      }).getColumns()[0].groupPath,
    ).toEqual([]);
    for (const groupPath of ["group", [1], [null], Array(2)])
      expect(() =>
        grid({
          columns: [
            { id: "name", field: "name", groupPath: groupPath as string[] },
          ],
        }),
      ).toThrow(TypeError);
  });
});
