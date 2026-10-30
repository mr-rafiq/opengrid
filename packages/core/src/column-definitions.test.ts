import { describe, expect, it, vi } from "vitest";
import {
  createGrid,
  createAlignedColumns,
  createCellRangeModel,
  createRowEditSession,
  createFormulaGrid,
  createCalculatedGrid,
} from "./index.js";
import type { Column } from "./types.js";
type Row = { id: string; a: number; b: number; label: string };
const rows: Row[] = [
  { id: "one", a: 1, b: 20, label: "B" },
  { id: "two", a: 2, b: 10, label: "A" },
];
const columns: Column<Row>[] = [
  { id: "value", field: "a", header: "Value", editable: true },
  { id: "label", field: "label" },
];
const make = () =>
  createGrid({
    rows,
    columns,
    getRowId: (row: Row) => row.id,
    valueCache: true,
  });

describe("atomic runtime column definitions", () => {
  it("owns definitions, changes fields, and publishes one coherent epoch", () => {
    const grid = make(),
      listener = vi.fn(() => {
        expect(grid.getColumnRevision()).toBe(1);
        expect(grid.getValue(rows[0], "value")).toBe(20);
        expect(grid.getColumns().map((c) => c.header)).toEqual([
          "Replacement",
          undefined,
        ]);
      });
    grid.subscribe(listener);
    const next: Column<Row>[] = [
      { id: "value", field: "b", header: "Replacement", groupPath: ["Group"] },
      columns[1],
    ];
    grid.setColumns(next);
    next[0].field = "a";
    (next[0].groupPath as string[]).push("Mutated");
    expect(grid.getValue(rows[0], "value")).toBe(20);
    expect(grid.getColumns()[0].groupPath).toEqual(["Group"]);
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockImplementation(() => {});
    grid.resizeColumn("value", 240);
    expect(grid.getColumnRevision()).toBe(1);
  });
  it("retains ID-based state, clamps widths, prunes deleted state and appends new IDs", () => {
    const grid = make();
    grid.setState({
      columnOrder: ["label", "value"],
      columnWidths: { value: 300, label: 190 },
      columnPinning: { value: "right", label: "left" },
      columnVisibility: { value: false, label: true },
      selected: ["one"],
      page: 1,
      pageSize: 1,
      sorting: [{ columnId: "label", direction: "asc" }],
      filters: { label: { op: "contains", value: "A" } },
      groupBy: ["label"],
    });
    grid.setColumns([
      { id: "value", field: "b", maxWidth: 200, width: 175 },
      { id: "new", field: "a", width: 90 },
    ]);
    expect(grid.getState()).toMatchObject({
      columnOrder: ["value", "new"],
      columnWidths: { value: 200 },
      columnPinning: { value: "right" },
      columnVisibility: { value: false },
      selected: ["one"],
      sorting: [],
      filters: {},
      groupBy: [],
      page: 0,
    });
    expect(grid.getColumnWidthDefaults()).toEqual({ value: 175, new: 90 });
    expect(Object.isFrozen(grid.getColumnWidthDefaults())).toBe(true);
    expect(Object.getPrototypeOf(grid.getColumnWidthDefaults())).toBeNull();
    grid.setColumns([
      { id: "label", field: "label" },
      { id: "new", field: "a" },
    ]);
    expect(grid.getState().columnOrder).toEqual(["new", "label"]);
    expect(grid.getState().columnWidths).toEqual({});
  });
  it("recomputes cached getters, filters, sorting and aggregates for the new definition", () => {
    const grid = make(),
      a = vi.fn((row: Row) => row.a),
      b = vi.fn((row: Row) => row.b);
    grid.setColumns([{ id: "value", valueGetter: a }, columns[1]]);
    grid.setSort("value", "asc");
    expect(grid.getRowModel().map((n) => n.id)).toEqual(["one", "two"]);
    grid.setColumns([{ id: "value", valueGetter: b }, columns[1]]);
    expect(grid.getRowModel().map((n) => n.id)).toEqual(["two", "one"]);
    expect(b).toHaveBeenCalled();
    grid.setFilter("value", { op: "gt", value: 15 });
    expect(grid.getFilteredRows().map((r) => r.id)).toEqual(["one"]);
  });
  it("preserves data, selection and edit history across definition replacement", () => {
    const grid = make();
    grid.selectRows(["one"]);
    grid.editCell("one", "value", "9");
    const edited = grid.getRows();
    grid.setColumns([{ id: "value", field: "b", editable: true }]);
    expect(grid.getRows()).toEqual(edited);
    expect(grid.getState().selected).toEqual(["one"]);
    expect(grid.undo()).toBe(true);
    expect(grid.getRow("one")).toEqual(rows[0]);
    expect(grid.redo()).toBe(true);
    expect(grid.getRow("one")!.a).toBe("9");
  });
  it("rejects incompatible advanced filters atomically instead of weakening their expression", () => {
    const grid = make();
    grid.setAdvancedFilter({
      kind: "condition",
      columnId: "label",
      filter: { op: "contains", value: "A" },
    });
    const before = grid.getState(),
      defaults = grid.getColumnWidthDefaults(),
      listener = vi.fn();
    grid.subscribe(listener);
    expect(() => grid.setColumns([columns[0]])).toThrow();
    expect(grid.getState()).toBe(before);
    expect(grid.getColumnWidthDefaults()).toBe(defaults);
    expect(grid.getColumnRevision()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    grid.setAdvancedFilter(null);
    grid.setColumns([columns[0]]);
    expect(grid.getColumns()).toHaveLength(1);
  });
  it.each([
    { input: [{ id: "value" }, { id: "value" }], message: "Column IDs" },
    { input: [{ id: "" }], message: "Column IDs" },
    { input: [{ id: "a", width: NaN }], message: "Column width" },
    { input: [{ id: "a", flex: 0 }], message: "Column flex" },
    { input: [{ id: "a", spanRows: 4 }], message: "Column spanRows" },
    { input: [{ id: "a", colSpan: 0 }], message: "Column colSpan" },
    { input: [{ id: "a", groupPath: [1] }], message: "Column groupPath" },
    { input: [{ id: "a", valueCache: "yes" }], message: "Column valueCache" },
  ])(
    "leaves snapshots and subscribers untouched after malformed input %#",
    ({ input, message }) => {
      const grid = make(),
        before = grid.getState(),
        listener = vi.fn();
      grid.subscribe(listener);
      expect(() => grid.setColumns(input as unknown as Column<Row>[])).toThrow(
        message,
      );
      expect(grid.getState()).toBe(before);
      expect(grid.getColumnRevision()).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    },
  );
  it("supports zero definitions and literal hostile property IDs without inherited overrides", () => {
    const grid = make();
    grid.setColumns([
      { id: "__proto__", field: "a", width: 120 },
      { id: "constructor", field: "b" },
    ]);
    expect(grid.getValue(rows[0], "__proto__")).toBe(1);
    expect(Object.hasOwn(grid.getColumnWidthDefaults(), "__proto__")).toBe(
      true,
    );
    grid.setColumns([]);
    expect(grid.getColumns()).toEqual([]);
    expect(grid.getRowModel()).toHaveLength(2);
    expect(grid.getState().columnOrder).toEqual([]);
  });
  it("does not overwrite a reentrant layout update while preparing caller-owned definitions", () => {
    const grid = make();
    const input: Column<Row> = {
      id: "value",
      get width() {
        grid.selectRows(["two"]);
        return 120;
      },
    };
    expect(() => grid.setColumns([input])).toThrow("Grid changed");
    expect(grid.getColumnRevision()).toBe(0);
    expect(grid.getState().selected).toEqual(["two"]);
    expect(grid.getValue(rows[0], "value")).toBe(1);
  });
  it("rejects an old batch if its parser replaces the schema", () => {
    const grid = make();
    grid.setColumns([
      {
        id: "value",
        field: "a",
        editable: true,
        valueParser(value) {
          grid.setColumns([{ id: "value", field: "b", editable: true }]);
          return Number(value);
        },
      },
    ]);
    expect(grid.editCell("one", "value", "99")).toBe(
      "Column definitions changed during editing",
    );
    expect(grid.getRow("one")).toBe(rows[0]);
    expect(grid.undo()).toBe(false);
  });
  it("invalidates ranges even when replacement IDs and dimensions are identical", () => {
    const grid = make(),
      range = createCellRangeModel(grid);
    range.setRange({ rowId: "one", columnId: "value" });
    grid.setColumns([{ id: "value", field: "b", editable: true }, columns[1]]);
    expect(range.getSnapshot().range).toBeNull();
    expect(range.paste("99")).toMatch(/Select a destination/);
    expect(grid.getRow("one")).toBe(rows[0]);
    range.dispose();
  });
  it.each(["reject", "overwrite"] as const)(
    "rejects stale full-row drafts with %s conflict policy",
    (conflictPolicy) => {
      const grid = make(),
        draft = createRowEditSession(grid, "one", { conflictPolicy });
      draft.setValue("value", "99");
      grid.setColumns([{ id: "value", field: "b", editable: true }]);
      expect(draft.commit()).toMatch(/Column definitions changed/);
      expect(grid.getRow("one")).toBe(rows[0]);
    },
  );
  it("keeps formula and calculated schemas explicit until a structural migration exists", () => {
    const formula = createFormulaGrid({
      rows,
      columns,
      formulaColumns: ["value"],
      getRowId: (r) => r.id,
    });
    const calculated = createCalculatedGrid({
      rows,
      columns,
      getRowId: (r) => r.id,
      calculatedColumns: [
        { id: "derived", type: "number", expression: "[value] * 2" },
      ],
    });
    for (const grid of [formula.model, calculated.model]) {
      const before = grid.getState();
      expect(() => grid.setColumns(columns)).toThrow(/new model/);
      expect(grid.getState()).toBe(before);
      expect(grid.getColumnRevision()).toBe(0);
    }
  });
  it("detaches a fixed-schema alignment link before reading removed or redefined IDs", () => {
    const left = make(),
      right = make();
    const link = createAlignedColumns([left, right]);
    expect(() =>
      left.setColumns([{ id: "value", field: "b", maxWidth: 100 }]),
    ).not.toThrow();
    expect(right.getState().columnWidths).toEqual({});
    right.resizeColumn("value", 290);
    expect(left.getColumns()[0].width).toBe(100);
    link.dispose();
    const next = createAlignedColumns([left, right]);
    right.resizeColumn("value", 90);
    expect(left.getColumns()[0].width).toBe(90);
    next.dispose();
  });
});
