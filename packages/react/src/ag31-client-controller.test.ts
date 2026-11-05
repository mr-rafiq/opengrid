import { afterEach, expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns";
import type { Ag31ValueParams } from "./ag31-value-columns";
import type { Ag31Event } from "./ag31-events";
import type { Ag31RowNode } from "./ag31-row-nodes";
class Row {
  constructor(
    public id: string,
    public team: string,
    public amount: number,
  ) {}
  label() {
    return `Line ${this.id}`;
  }
}
function setup(definitions?: readonly Ag31ColumnDefinition<Row>[]) {
  const rows = [
      new Row("one", "East", 3),
      new Row("two", "West", 9),
      new Row("three", "East", 6),
    ],
    context = { factor: 2 };
  const controller = createAg31ClientController({
    rows,
    getRowId: (row: Row) => row.id,
    context,
    defaultColDef: { enableRowGroup: true },
    definitions: definitions ?? [
      { field: "team" },
      { field: "amount", cellDataType: "number" },
      {
        colId: "label",
        valueGetter: (p: Ag31ValueParams<Row>) => p.data!.label(),
      },
      {
        colId: "scaled",
        valueGetter: (p: Ag31ValueParams<Row>) =>
          p.data!.amount * (p.context as { factor: number }).factor,
      },
    ],
    initialState: { groupBy: ["team"] },
  });
  return { ...controller, rows, context };
}
afterEach(() => vi.useRealTimers());
it("applies measured external-filter option changes immediately, excludes leaves with missing predicates and skips unchanged callbacks", () => {
  vi.useFakeTimers();
  const c = createAg31ClientController({
    rows: [new Row("a", "All", 1), new Row("b", "All", 8)],
    definitions: [{ field: "amount" }],
    getRowId: (row) => row.id,
  });
  const changed = vi.fn(),
    present = () => true;
  c.api.addEventListener("filterChanged", changed);
  c.api.setGridOption("isExternalFilterPresent", present);
  expect(c.api.getDisplayedRowCount()).toBe(0);
  const pass = (node: Ag31RowNode<Row>) => node.data!.amount > 5;
  c.api.setGridOption("doesExternalFilterPass", pass);
  expect(c.api.getDisplayedRowCount()).toBe(1);
  expect(c.api.getDisplayedRowAtIndex(0)!.data!.id).toBe("b");
  c.api.setGridOption("doesExternalFilterPass", pass);
  vi.runOnlyPendingTimers();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(changed.mock.calls[0][0]).toMatchObject({
    type: "filterChanged",
    source: "api",
    columns: [],
  });
  c.api.setGridOption("isExternalFilterPresent", null);
  expect(c.api.getDisplayedRowCount()).toBe(2);
  expect(c.api.getGridOption("isExternalFilterPresent")).toBeUndefined();
  c.api.destroy();
});
it("filters initial resident class instances using constructor callbacks and the same owned API", () => {
  let api: unknown;
  const row = new Row("a", "All", 8);
  const c = createAg31ClientController({
    rows: [row],
    definitions: [{ field: "amount" }],
    getRowId: (r) => r.id,
    isExternalFilterPresent: () => true,
    doesExternalFilterPass: (node) => {
      api = node.data;
      return node.data!.label() === "Line a";
    },
  });
  expect(c.api.getDisplayedRowCount()).toBe(1);
  expect(api).toBe(row);
  c.api.destroy();
});
it("matches measured live grid-option callback lookup after API listeners and clears nullable handlers", () => {
  vi.useFakeTimers();
  const owner = setup(),
    calls: string[] = [];
  const old = () => calls.push("old"),
    next = () => calls.push("next");
  owner.api.setGridOption("onSelectionChanged", old);
  expect(owner.api.getGridOption("onSelectionChanged")).toBe(old);
  owner.api.addEventListener("selectionChanged", () => calls.push("api"));
  owner.api.getRowNode("one")!.setSelected(true);
  calls.push("after-call");
  owner.api.setGridOption("onSelectionChanged", next);
  vi.runOnlyPendingTimers();
  expect(calls).toEqual(["after-call", "api", "next"]);
  calls.length = 0;
  owner.api.setGridOption("onSelectionChanged", undefined);
  owner.api.getRowNode("one")!.setSelected(false);
  owner.api.setGridOption("onSelectionChanged", next);
  vi.runOnlyPendingTimers();
  expect(calls).toEqual(["api", "next"]);
  owner.api.setGridOption("onSelectionChanged", null);
  expect(owner.api.getGridOption("onSelectionChanged")).toBeUndefined();
  expect(() => owner.api.setGridOption("onSelectionChanged", true)).toThrow(
    /must be a function/,
  );
  owner.api.destroy();
});
it("keeps group mixed state over all descendants, applies filtered group actions and selects all source rows from the header API", async () => {
  const owner = createAg31ClientController({
    rows: [
      new Row("a", "East", 1),
      new Row("b", "East", 2),
      new Row("c", "West", 2),
    ],
    definitions: [
      { field: "team", enableRowGroup: true },
      { field: "amount", cellDataType: "number" },
    ],
    getRowId: (row) => row.id,
    initialState: { groupBy: ["team"] },
    groupSelectsFiltered: true,
  });
  const group = owner.api.getDisplayedRowAtIndex(0)!;
  const events: string[] = [];
  owner.api.addEventListener("selectionChanged", (e) =>
    events.push(String(e.source)),
  );
  group.setSelected(true, false, "checkboxSelected");
  expect(owner.api.getSelectedNodes()!.map((n) => n.id)).toEqual(["a", "b"]);
  owner.api.setGridOption("isExternalFilterPresent", () => true);
  owner.api.setGridOption(
    "doesExternalFilterPass",
    (n: Ag31RowNode<Row>) => n.data!.amount === 2,
  );
  owner.api.onFilterChanged();
  group.setSelected(false, false, "checkboxSelected");
  expect(owner.api.getSelectedNodes()!.map((n) => n.id)).toEqual(["a"]);
  expect(group.isSelected()).toBeUndefined();
  owner.api.deselectAll();
  owner.api.selectAll("uiSelectAll");
  expect(owner.api.getSelectedRows()!.map((n) => n.id)).toEqual([
    "a",
    "b",
    "c",
  ]);
  expect(group.isSelected()).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(events).toEqual([
    "checkboxSelected",
    "checkboxSelected",
    "apiSelectAll",
    "uiSelectAll",
  ]);
  owner.api.deselectAll();
  owner.api.getRowNode("c")!.setSelected(true);
  owner.api.selectAll();
  expect(owner.api.getSelectedNodes()!.map((node) => node.id)).toEqual([
    "c",
    "a",
    "b",
  ]);
  owner.api.destroy();
  expect(() => owner.api.selectAll()).not.toThrow();
});
it("snapshots real column order/layout with detached legacy state records and can restore them", () => {
  const owner = setup();
  owner.api.applyColumnState({
    applyOrder: true,
    defaultState: { sort: null, hide: false, pinned: null },
    state: [
      {
        colId: "scaled",
        width: 144,
        pinned: "right",
      },
      { colId: "amount", width: 99, hide: true, sort: "desc", sortIndex: 0 },
      { colId: "team", rowGroup: true, rowGroupIndex: 0 },
      { colId: "label" },
    ],
  });
  const snapshot = owner.api.getColumnState()!;
  expect(snapshot.map((c) => c.colId)).toEqual([
    "scaled",
    "amount",
    "team",
    "label",
  ]);
  expect(snapshot[0]).toEqual({
    colId: "scaled",
    width: 144,
    pinned: "right",
    hide: false,
    sort: null,
    sortIndex: null,
    aggFunc: null,
    rowGroup: false,
    rowGroupIndex: null,
    pivot: false,
    pivotIndex: null,
    flex: null,
  });
  expect(snapshot[1].hide).toBe(true);
  expect(snapshot[1].sort).toBe("desc");
  expect(snapshot[2].rowGroupIndex).toBe(0);
  expect(owner.columnApi.getColumnState()).toEqual(snapshot);
  snapshot[0].width = 999;
  expect(owner.api.getColumnState()![0].width).toBe(144);
  const saved = owner.api.getColumnState()!;
  owner.api.applyColumnState({
    state: [
      { colId: "scaled", width: 188, pinned: null },
      { colId: "amount", sort: null },
    ],
  });
  owner.api.applyColumnState({ state: saved, applyOrder: true });
  expect(owner.api.getColumnState()).toEqual(saved);
  owner.api.destroy();
  expect(owner.api.getColumnState()).toBeUndefined();
});
it("matches measured nullish, case-sensitive and mixed scalar ordering without changing native defaults", () => {
  const rows = [
    { id: "n12", amount: 12 },
    { id: "n3", amount: 3 },
    { id: "null", amount: null },
    { id: "none" },
    { id: "empty", amount: "" },
    { id: "upper", amount: "Alpha" },
    { id: "lower", amount: "alpha" },
    { id: "z", amount: "Zebra" },
  ];
  const owner = createAg31ClientController({
    rows,
    definitions: [{ field: "amount", cellDataType: false }],
    getRowId: (r) => r.id,
  });
  const ids = () => {
    const result: string[] = [];
    owner.api.forEachNodeAfterFilterAndSort((n) => result.push(n.id));
    return result;
  };
  owner.api.applyColumnState({ state: [{ colId: "amount", sort: "asc" }] });
  expect(ids()).toEqual([
    "null",
    "none",
    "empty",
    "n3",
    "n12",
    "upper",
    "z",
    "lower",
  ]);
  owner.api.applyColumnState({ state: [{ colId: "amount", sort: "desc" }] });
  expect(ids()).toEqual([
    "n12",
    "n3",
    "lower",
    "z",
    "upper",
    "empty",
    "null",
    "none",
  ]);
  owner.api.destroy();
});
it("constructs one owned API graph before first callbacks and retains class references", () => {
  let seen: unknown;
  const c = setup([
    {
      colId: "label",
      valueGetter: (p: Ag31ValueParams<Row>) => {
        seen = p.api;
        return p.data!.label();
      },
    },
    { field: "team" },
  ]);
  const node = c.api.getRowNode("one")!;
  expect(c.api.getCellValue({ rowNode: node, colKey: "label" })).toBe(
    "Line one",
  );
  expect(seen).toBe(c.api);
  expect(node.data).toBe(c.rows[0]);
  expect(c.api.getColumn("unknown")).toBeNull();
  expect(c.api.getValue("unknown", node)).toBeNull();
  expect(c.api.getCellValue({ rowNode: node, colKey: "unknown" })).toBeNull();
  expect(c.columnApi).not.toBe(c.api);
  expect(c.columnApi.getColumn("team")).toBe(c.api.getColumn("team"));
  c.api.destroy();
});
it("reports selected nodes and rows in actual selection order rather than source order", () => {
  const c = setup();
  c.api.getRowNode("three")!.setSelected(true);
  c.api.getRowNode("one")!.setSelected(true);
  expect(c.api.getSelectedNodes()!.map((n) => n.id)).toEqual(["three", "one"]);
  expect(c.api.getSelectedRows()).toEqual([c.rows[2], c.rows[0]]);
  c.api.getRowNode("two")!.parent!.setSelected(true);
  expect(c.api.getSelectedNodes()!.map((n) => n.id)).toEqual([
    "three",
    "one",
    "two",
  ]);
  c.api.destroy();
});
it("returns real transaction nodes without replacing the original rowData option", () => {
  const c = setup(),
    one = c.api.getRowNode("one")!,
    two = c.api.getRowNode("two")!,
    replacement = new Row("two", "West", 22),
    added = new Row("four", "East", 4);
  const result = c.api.applyTransaction({
    update: [replacement],
    add: [added],
    remove: [one.data!],
  })!;
  expect(result.remove).toEqual([one]);
  expect(c.api.getRowNode("one")).toBeUndefined();
  expect(c.model.getRows().map((row) => row.id)).toEqual([
    "two",
    "three",
    "four",
  ]);
  expect(result.update).toEqual([two]);
  expect(result.add[0]).toBe(c.api.getRowNode("four"));
  expect(two.data).toBe(replacement);
  expect(c.api.getGridOption("rowData")).toBe(c.rows);
  expect(c.rows).toHaveLength(3);
  expect(c.rows[1].amount).toBe(9);
  c.api.setGridOption("rowData", [replacement]);
  expect(c.api.getRowNode("two")).toBe(two);
  expect(c.api.getGridOption("rowData")).toEqual([replacement]);
  c.api.destroy();
});
it("does not dispatch logical model/state events for context updates or force refreshes", async () => {
  vi.useFakeTimers();
  const c = setup(),
    calls: Ag31Event[] = [];
  for (const type of [
    "modelUpdated",
    "stateUpdated",
    "sortChanged",
    "filterChanged",
  ])
    c.api.addEventListener(type, (e) => calls.push(e));
  const next = { factor: 4 };
  c.api.setGridOption("context", next);
  expect(c.api.getRowNode("one")!.beans.gos.context).toBe(next);
  c.api.refreshCells({ force: true });
  expect(
    c.api.getCellValue({ rowNode: c.api.getRowNode("one")!, colKey: "scaled" }),
  ).toBe(12);
  await vi.runAllTimersAsync();
  expect(calls).toEqual([]);
  c.api.destroy();
});
it("evaluates external filters using current real nodes and retains the full source graph", async () => {
  vi.useFakeTimers();
  const c = setup(),
    seen: unknown[] = [];
  c.api.setGridOption("isExternalFilterPresent", () => true);
  c.api.setGridOption(
    "doesExternalFilterPass",
    (
      node: typeof c.nodes extends never
        ? never
        : NonNullable<ReturnType<typeof c.api.getRowNode>>,
    ) => {
      seen.push(node);
      return node.data!.amount > 3;
    },
  );
  c.api.onFilterChanged();
  const filtered: string[] = [];
  c.api.forEachNodeAfterFilter((n) => {
    if (!n.group) filtered.push(n.id);
  });
  expect(filtered).toEqual(["three", "two"]);
  expect(
    seen.every(
      (node) => c.api.getRowNode((node as { id: string }).id) === node,
    ),
  ).toBe(true);
  expect(
    c.api.getRowNode("one")!.parent!.allLeafChildren!.map((n) => n.id),
  ).toEqual(["one", "three"]);
  c.api.setGridOption("isExternalFilterPresent", () => false);
  c.api.onFilterChanged();
  const leaves: string[] = [];
  c.api.forEachLeafNode((n) => leaves.push(n.id));
  expect(leaves).toEqual(["one", "two", "three"]);
  c.api.destroy();
});
it("dispatches sort before model update asynchronously with real columns and captured context", async () => {
  vi.useFakeTimers();
  const c = setup(),
    calls: Ag31Event[] = [];
  for (const type of ["sortChanged", "modelUpdated"])
    c.api.addEventListener(type, (e) => calls.push(e));
  expect(
    c.api.applyColumnState({ state: [{ colId: "amount", sort: "desc" }] }),
  ).toBe(true);
  expect(calls).toEqual([]);
  await vi.runAllTimersAsync();
  expect(calls.map((e) => e.type)).toEqual(["sortChanged", "modelUpdated"]);
  expect(calls[0].columns).toEqual([c.api.getColumn("amount")]);
  expect(calls.every((e) => e.api === c.api && e.context === c.context)).toBe(
    true,
  );
  c.api.destroy();
});
it("includes all resident displayed rows beyond the native default page and ignores collapsed descendants", () => {
  const rows = Array.from(
    { length: 300 },
    (_, i) => new Row(String(i), "All", i),
  );
  const c = createAg31ClientController({
    rows,
    definitions: [{ field: "amount" }, { field: "team" }],
    defaultColDef: { enableRowGroup: true },
    getRowId: (r) => r.id,
  });
  expect(c.api.getDisplayedRowCount()).toBe(300);
  expect(c.api.getDisplayedRowAtIndex(299)!.data).toBe(rows[299]);
  expect(c.api.getDisplayedRowAtIndex(300)).toBeUndefined();
  c.model.setState({ groupBy: ["team"] });
  expect(c.api.getDisplayedRowCount()).toBe(1);
  const group = c.api.getDisplayedRowAtIndex(0)!;
  c.api.setRowNodeExpanded(group, true);
  expect(c.api.getDisplayedRowCount()).toBe(301);
  c.api.destroy();
});
it("revokes stale API/node callbacks and cancels queued notifications on destroy", async () => {
  vi.useFakeTimers();
  const write = vi.fn(() => true),
    c = createAg31ClientController({
      rows: [new Row("a", "All", 1)],
      definitions: [{ field: "team" }],
      getRowId: (r) => r.id,
      writeCell: write,
    }),
    node = c.api.getRowNode("a")!,
    event = vi.fn(),
    lifecycle = vi.fn();
  c.api.addEventListener("custom", event);
  c.subscribeLifecycle(lifecycle);
  c.api.dispatchEvent({ type: "custom" });
  c.api.destroy();
  c.api.destroy();
  node.setDataValue("team", "Changed");
  c.api.setGridOption("rowData", []);
  c.api.refreshCells();
  await vi.runAllTimersAsync();
  expect(c.api.isDestroyed()).toBe(true);
  expect(c.api.getRowNode("a")).toBeUndefined();
  expect(c.api.getSelectedRows()).toBeUndefined();
  expect(c.api.getGridOption("context")).toBeUndefined();
  expect(event).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(lifecycle).toHaveBeenCalledTimes(1);
  expect(c.getLifecycleSnapshot()).toBe(true);
});
it("fails explicitly for options or structural column contracts that are not compiled", () => {
  const c = setup();
  expect(() =>
    c.api.applyTransaction({ add: [c.rows[0]], remove: [c.rows[0]] }),
  ).toThrow(/Overlapping transaction IDs/);
  expect(() =>
    c.api.applyTransaction({ add: [], addIndex: 0 } as never),
  ).toThrow(/Only add/);
  expect(() => c.api.setGridOption("columnDefs", [])).toThrow(
    /implemented compatibility contract/,
  );
  expect(() =>
    c.api.applyColumnState({ state: [{ colId: "amount", flex: 1 }] }),
  ).toThrow(/registry contract/);
  c.api.destroy();
});

it("refreshes the view without rerunning sort/filter model stages", () => {
  const c = setup();
  c.api.applyColumnState({ state: [{ colId: "amount", sort: "asc" }] });
  const order = () => {
    const ids: string[] = [];
    c.api.forEachNodeAfterFilterAndSort((node) => {
      if (!node.group) ids.push(node.id);
    });
    return ids;
  };
  const before = order();
  const refreshed = vi.fn();
  c.subscribeViewRefresh(refreshed);
  c.rows[0].amount = 99;
  c.api.refreshCells({ force: true });
  expect(
    c.api.getCellValue({ rowNode: c.api.getRowNode("one")!, colKey: "amount" }),
  ).toBe(99);
  expect(order()).toEqual(before);
  expect(refreshed).toHaveBeenCalledTimes(1);
  expect(c.getViewSnapshot()).toBe(1);
  c.api.destroy();
});

it("publishes the new rowData option before evaluating replacement grouping callbacks", () => {
  const c = setup([
    {
      colId: "team",
      valueGetter: (p: Ag31ValueParams<Row>) =>
        (p.api as { getGridOption(key: string): unknown }).getGridOption(
          "rowData",
        ) instanceof Array
          ? (p.api as { getGridOption(key: string): Row[] })
              .getGridOption("rowData")
              .find((row) => row.id === p.data!.id)?.team
          : undefined,
    },
  ]);
  const replacement = new Row("one", "New group", 7);
  c.api.setGridOption("rowData", [replacement]);
  expect(c.api.getRowNode("one")!.parent!.key).toBe("New group");
  expect(() =>
    c.api.setGridOption("rowData", [replacement, replacement]),
  ).toThrow();
  expect(c.api.getGridOption("rowData")).toEqual([replacement]);
  c.api.destroy();
});
