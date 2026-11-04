import { describe, it, expect, vi } from "vitest";
import { createGrid } from "@opengrid/core";
import {
  planAg31ColumnState,
  applyAg31ColumnState,
} from "./ag31-column-state.js";
const make = () =>
  createGrid({
    rows: [
      { id: "one", name: "A", team: "East", amount: 3 },
      { id: "two", name: "B", team: "West", amount: 9 },
    ],
    getRowId: (r) => r.id,
    columns: [
      { id: "name", field: "name", width: 180, editable: true },
      { id: "team", field: "team", width: 120 },
      { id: "amount", field: "amount", type: "number", width: 160, flex: 1 },
    ],
  });
describe("AG 31 persisted-column-state boundary", () => {
  it("plans column order, widths, visibility, physical pins, priority sorts and grouping without publishing", () => {
    const model = make(),
      before = model.getState(),
      rows = model.getRows(),
      notify = vi.fn();
    model.subscribe(notify);
    const plan = planAg31ColumnState(model, {
      applyOrder: true,
      state: [
        {
          colId: "amount",
          width: 220,
          pinned: "right",
          sort: "desc",
          sortIndex: 1,
          aggFunc: "sum",
          flex: null,
          pivot: false,
          pivotIndex: null,
        },
        {
          colId: "team",
          hide: true,
          rowGroup: true,
          rowGroupIndex: 0,
          sort: "asc",
          sortIndex: 0,
        },
      ],
    });
    expect(plan.layout).toMatchObject({
      columnOrder: ["amount", "team", "name"],
      columnWidths: { amount: 220 },
      columnVisibility: { team: false },
      columnPinning: { amount: "right" },
      sorting: [
        { columnId: "team", direction: "asc" },
        { columnId: "amount", direction: "desc" },
      ],
      groupBy: ["team"],
    });
    expect(plan.definitions.find((c) => c.id === "amount")).toMatchObject({
      aggregate: "sum",
    });
    expect(
      plan.definitions.find((c) => c.id === "amount")?.flex,
    ).toBeUndefined();
    expect(model.getState()).toBe(before);
    expect(model.getRows()).toEqual(rows);
    expect(notify).not.toHaveBeenCalled();
  });
  it("applies known saved columns and reports removed schema IDs without losing unspecified columns", () => {
    const model = make(),
      rows = model.getRows();
    model.selectRows(["two"]);
    expect(
      applyAg31ColumnState(model, {
        applyOrder: true,
        state: [
          { colId: "removed", hide: true },
          { colId: "amount", width: 240, pinned: "right" },
          { colId: "name", hide: true },
        ],
      }),
    ).toBe(false);
    expect(model.getState().columnOrder).toEqual(["amount", "name", "team"]);
    expect(model.getColumns().map((c) => c.id)).toEqual([
      "name",
      "team",
      "amount",
    ]);
    expect(model.getColumns().find((c) => c.id === "amount")).toMatchObject({
      width: 240,
      pinned: "right",
    });
    expect(model.getColumns().find((c) => c.id === "name")?.hidden).toBe(true);
    expect(model.getState().selected).toEqual(["two"]);
    expect(model.getRows()).toEqual(rows);
  });
  it("distinguishes undefined retention, null clear and defaults for omitted columns", () => {
    const model = make();
    model.setSort("name", "asc");
    model.setSort("amount", "desc", true);
    model.setState({ groupBy: ["team"] });
    model.pinColumn("name", "left");
    model.hideColumn("team", true);
    model.resizeColumn("team", 200);
    applyAg31ColumnState(model, {
      state: [
        { colId: "name", pinned: undefined, sort: null },
        { colId: "team", hide: null, width: null, rowGroupIndex: null },
      ],
      defaultState: { sort: null },
    });
    expect(model.getColumns().find((c) => c.id === "name")?.pinned).toBe(
      "left",
    );
    expect(model.getColumns().find((c) => c.id === "team")).toMatchObject({
      hidden: false,
      width: 200,
    });
    expect(model.getState().sorting).toEqual([]);
    expect(model.getState().groupBy).toEqual([]);
  });
  it("lets explicit grouping indexes override boolean flags and keeps unindexed groups last", () => {
    const model = make();
    applyAg31ColumnState(model, {
      state: [
        { colId: "name", rowGroup: true },
        { colId: "amount", rowGroup: false, rowGroupIndex: 0 },
        { colId: "team", rowGroup: true, rowGroupIndex: 1 },
      ],
    });
    expect(model.getState().groupBy).toEqual(["amount", "team", "name"]);
  });
  it("matches the installed 31.3.4 null-index and explicit-group flag precedence", () => {
    const model = make();
    applyAg31ColumnState(model, {
      state: [
        { colId: "name", rowGroup: true, rowGroupIndex: null },
        { colId: "team", rowGroup: false, rowGroupIndex: 0 },
      ],
    });
    expect(model.getState().groupBy).toEqual(["team", "name"]);
  });
  it("matches the installed 31.3.4 input order for newly grouped unindexed fields", () => {
    const model = make();
    applyAg31ColumnState(model, {
      state: [
        { colId: "amount", rowGroup: true },
        { colId: "team", rowGroup: true },
      ],
    });
    expect(model.getState().groupBy).toEqual(["amount", "team"]);
  });
  it("matches installed unindexed sorting independently of input grouping order", () => {
    const model = make();
    model.applyTransaction({
      add: [{ id: "three", name: "C", team: "East", amount: 6 }],
    });
    applyAg31ColumnState(model, {
      state: [
        { colId: "amount", sort: "desc" },
        { colId: "team", sort: "asc" },
      ],
    });
    expect(model.getRowModel().map((node) => node.id)).toEqual([
      "three",
      "one",
      "two",
    ]);
  });
  it("uses native bounds and locks, and does not make layout read-only with the data", () => {
    const model = make();
    model.setColumns(
      model.getColumnDefinitions().map((c) =>
        c.id === "name"
          ? {
              ...c,
              pinned: "left",
              lockPinned: true,
              lockVisible: true,
              lockPosition: "left",
            }
          : c,
      ),
    );
    model.setReadOnly(true);
    expect(
      applyAg31ColumnState(model, {
        applyOrder: true,
        state: [
          { colId: "amount", width: 1 },
          { colId: "name", hide: true, pinned: "right" },
        ],
      }),
    ).toBe(true);
    expect(model.getColumns()[0]).toMatchObject({
      id: "name",
      hidden: false,
      pinned: "left",
    });
    expect(
      model.getColumns().find((c) => c.id === "amount")!.width,
    ).toBeGreaterThanOrEqual(40);
  });
  it("keeps data history when only layout changes", () => {
    const model = make();
    model.editCell("one", "name", "Changed");
    applyAg31ColumnState(model, { state: [{ colId: "team", width: 250 }] });
    expect(model.undo()).toBe(true);
    expect(model.getRow("one")?.name).toBe("A");
  });
  it("clears default aggregations and flex without inventing a callback adapter", () => {
    const model = make();
    applyAg31ColumnState(model, {
      state: [{ colId: "amount", aggFunc: "avg", flex: 2 }],
    });
    expect(
      model.getColumnDefinitions().find((c) => c.id === "amount"),
    ).toMatchObject({ aggregate: "avg", flex: 2 });
    applyAg31ColumnState(model, { defaultState: { aggFunc: null, flex: 0 } });
    expect(
      model.getColumnDefinitions().find((c) => c.id === "amount")?.aggregate,
    ).toBeUndefined();
    expect(
      model.getColumnDefinitions().find((c) => c.id === "amount")?.flex,
    ).toBeUndefined();
    expect(() =>
      planAg31ColumnState(model, {
        state: [{ colId: "amount", aggFunc: "hostFunction" as never }],
      }),
    ).toThrow(/aggregation adapter/);
  });
  it("rejects unsupported active pivot and malformed states before changing the model", () => {
    const model = make(),
      state = model.getState();
    for (const input of [
      { state: [{ colId: "name", pivot: true }] },
      { state: [{ colId: "name", width: NaN }] },
      { state: [{ colId: "name", sortIndex: -1 }] },
      { state: [{ colId: "name" }, { colId: "name" }] },
    ])
      expect(() => applyAg31ColumnState(model, input as never)).toThrow();
    expect(model.getState()).toBe(state);
  });
  it("rejects top-level, entry and array accessors without executing them", () => {
    const model = make(),
      read = vi.fn(() => []),
      options = Object.defineProperty({}, "state", {
        enumerable: true,
        get: read,
      }),
      entry = Object.defineProperty({ colId: "name" }, "hide", {
        enumerable: true,
        get: read,
      }),
      array = Object.defineProperty(new Array(1), "0", {
        enumerable: true,
        get: read,
      });
    for (const input of [options, { state: [entry] }, { state: array }])
      expect(() => planAg31ColumnState(model, input as never)).toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps special IDs as ordinary own state keys", () => {
    const model = createGrid({
      rows: [{ id: "one", value: "x" }],
      getRowId: (r) => r.id,
      columns: [
        { id: "__proto__", field: "value" },
        { id: "constructor", field: "value" },
      ],
    });
    applyAg31ColumnState(model, {
      state: [
        { colId: "__proto__", width: 230, hide: true },
        { colId: "constructor", pinned: "right" },
      ],
    });
    expect(Object.hasOwn(model.getState().columnWidths, "__proto__")).toBe(
      true,
    );
    expect(model.getColumns().find((c) => c.id === "__proto__")?.hidden).toBe(
      true,
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
