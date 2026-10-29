import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index";
import { createFindModel } from "./find";
import type { Column } from "./types";
interface Row {
  id: string;
  name: string;
  amount: number;
  secret: string;
  group: string;
}
const p = (rowId: string, columnId: string) => ({ rowId, columnId });
function fixture() {
  const columns: Column<Row>[] = [
    { id: "name", field: "name", editable: true },
    {
      id: "amount",
      field: "amount",
      type: "number",
      editable: true,
      valueFormatter: (value) => `USD ${value}`,
    },
    { id: "secret", field: "secret", hidden: true },
    { id: "group", field: "group", hidden: true },
  ];
  const grid = createGrid({
    rows: [
      {
        id: "a",
        name: "Alpha alpha",
        amount: 12,
        secret: "Hidden Alpha",
        group: "A",
      },
      { id: "b", name: "Beta", amount: 20, secret: "Other", group: "B" },
      { id: "c", name: "ALPHA", amount: 30, secret: "Last", group: "A" },
    ],
    columns,
    getRowId: (row) => row.id,
  });
  return { grid, find: createFindModel(grid) };
}
describe("formatted-cell Find", () => {
  it("finds once per cell with case-insensitive literal matching without filtering", () => {
    const { grid, find } = fixture();
    find.setQuery("alpha");
    expect(find.getSnapshot()).toEqual({
      query: "alpha",
      matches: [p("a", "name"), p("c", "name")],
      activeIndex: 0,
    });
    expect(grid.getFilteredRows()).toHaveLength(3);
    expect(grid.getState().quickFilter).toBe("");
  });
  it("searches formatted strings and computed columns", () => {
    const { grid, find } = fixture();
    find.setQuery("USD 20");
    expect(find.getSnapshot().matches).toEqual([p("b", "amount")]);
    const computed = createGrid({
      rows: [{ id: "a", x: 2 }],
      columns: [
        {
          id: "computed",
          valueGetter: (row) => row.x * 5,
          valueFormatter: (value) => `Total ${value}`,
        },
      ],
      getRowId: (row) => row.id,
    });
    const search = createFindModel(computed);
    search.setQuery("Total 10");
    expect(search.getSnapshot().matches).toEqual([p("a", "computed")]);
  });
  it("does not interpret regular expressions or executable query text", () => {
    const { find } = fixture();
    find.setQuery(".*");
    expect(find.getSnapshot().matches).toEqual([]);
    find.setQuery("globalThis.alert(1)");
    expect(find.getSnapshot().activeIndex).toBe(-1);
  });
  it("supports case-sensitive and include-hidden options explicitly", () => {
    const { grid } = fixture();
    const find = createFindModel(grid, {
      caseSensitive: true,
      includeHidden: true,
    });
    find.setQuery("Alpha");
    expect(find.getSnapshot().matches).toEqual([
      p("a", "name"),
      p("a", "secret"),
    ]);
    find.setQuery("ALPHA");
    expect(find.getSnapshot().matches).toEqual([p("c", "name")]);
  });
  it("wraps next/previous and selects an explicit match", () => {
    const { find } = fixture();
    find.setQuery("alpha");
    const matches = find.getSnapshot().matches;
    expect(find.next()).toEqual(p("c", "name"));
    expect(find.getSnapshot().matches).toBe(matches);
    expect(find.next()).toEqual(p("a", "name"));
    expect(find.previous()).toEqual(p("c", "name"));
    expect(find.select(0)).toEqual(p("a", "name"));
    expect(() => find.select(2)).toThrow(RangeError);
    expect(() => find.select(-1)).toThrow(RangeError);
    expect(() => find.select(0.5)).toThrow(RangeError);
  });
  it("returns no active match for empty queries and empty results", () => {
    const { find } = fixture();
    expect(find.next()).toBeUndefined();
    expect(find.previous()).toBeUndefined();
    find.setQuery("no match");
    expect(find.getSnapshot().activeIndex).toBe(-1);
    find.setQuery("alpha");
    find.setQuery("");
    expect(find.getSnapshot()).toEqual({
      query: "",
      matches: [],
      activeIndex: -1,
    });
  });
  it("freezes stable snapshots and does not rescan for every snapshot access", () => {
    const { grid, find } = fixture();
    find.setQuery("alpha");
    const snapshot = find.getSnapshot();
    const spy = vi.spyOn(grid, "getRowModel");
    for (let i = 0; i < 100; i++) expect(find.getSnapshot()).toBe(snapshot);
    expect(spy).not.toHaveBeenCalled();
    expect(Object.isFrozen(snapshot.matches)).toBe(true);
    expect(Object.isFrozen(snapshot.matches[0])).toBe(true);
    expect(() => {
      (snapshot.matches as { rowId: string; columnId: string }[]).push(
        p("x", "y"),
      );
    }).toThrow();
  });
  it("preserves active cell identity across sorting and column pinning", () => {
    const { grid, find } = fixture();
    find.setQuery("alpha");
    find.select(1);
    grid.setSort("name", "desc");
    expect(find.getSnapshot().matches[find.getSnapshot().activeIndex]).toEqual(
      p("c", "name"),
    );
    grid.pinColumn("amount", "left");
    expect(find.getSnapshot().matches[find.getSnapshot().activeIndex]).toEqual(
      p("c", "name"),
    );
  });
  it("falls back to the first result if the active match disappears after an edit", () => {
    const { grid, find } = fixture();
    find.setQuery("alpha");
    find.select(1);
    grid.editCell("c", "name", "Gamma");
    expect(find.getSnapshot()).toEqual({
      query: "alpha",
      matches: [p("a", "name")],
      activeIndex: 0,
    });
    grid.editCell("a", "name", "Delta");
    expect(find.getSnapshot().activeIndex).toBe(-1);
    grid.undo();
    expect(find.getSnapshot().matches).toEqual([p("a", "name")]);
  });
  it("responds to filters, hidden columns and row transactions", () => {
    const { grid, find } = fixture();
    find.setQuery("USD");
    grid.setFilter("amount", { op: "gt", value: 12 });
    expect(find.getSnapshot().matches).toEqual([
      p("b", "amount"),
      p("c", "amount"),
    ]);
    grid.hideColumn("amount", true);
    expect(find.getSnapshot().matches).toEqual([]);
    grid.hideColumn("amount", false);
    grid.applyTransaction({ remove: ["b"] });
    expect(find.getSnapshot().matches).toEqual([p("c", "amount")]);
  });
  it("supports current-view callbacks and explicit refresh without model changes", () => {
    const { grid } = fixture();
    let ids = ["b"];
    const find = createFindModel(grid, { getRowIds: () => ids });
    find.setQuery("USD");
    expect(find.getSnapshot().matches).toEqual([p("b", "amount")]);
    ids = ["c", "a", "c", "missing"];
    find.refresh();
    expect(find.getSnapshot().matches).toEqual([
      p("c", "amount"),
      p("a", "amount"),
    ]);
  });
  it("excludes synthetic groups and currently collapsed data rows", () => {
    const { grid, find } = fixture();
    grid.setState({ groupBy: ["group"] });
    find.setQuery("alpha");
    expect(find.getSnapshot().matches).toEqual([]);
    const root = grid.getRowModel()[0];
    grid.toggleExpanded(root.id);
    expect(find.getSnapshot().matches).toEqual([
      p("a", "name"),
      p("c", "name"),
    ]);
    grid.toggleExpanded(root.id);
    expect(find.getSnapshot().matches).toEqual([]);
  });
  it("starts a changed query at its first match but keeps the active match for a refresh", () => {
    const { find } = fixture();
    find.setQuery("alpha");
    find.select(1);
    find.setQuery("alpha");
    expect(find.getSnapshot().activeIndex).toBe(1);
    find.setQuery("ALPHA");
    expect(find.getSnapshot().activeIndex).toBe(0);
  });
  it("attaches lazily, shares a subscription and detaches when observers leave", () => {
    const { grid } = fixture();
    const subscribe = vi.spyOn(grid, "subscribe");
    const find = createFindModel(grid);
    expect(subscribe).not.toHaveBeenCalled();
    const listener = vi.fn();
    const first = find.subscribe(listener),
      second = find.subscribe(() => {});
    expect(subscribe).toHaveBeenCalledTimes(1);
    find.setQuery("alpha");
    expect(listener).toHaveBeenCalledTimes(1);
    grid.toggleSelection("a");
    expect(listener).toHaveBeenCalledTimes(1);
    first();
    second();
    find.subscribe(listener);
    expect(subscribe).toHaveBeenCalledTimes(2);
    find.dispose();
    grid.editCell("a", "name", "Gamma");
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("does not scan grid rows for an empty query", () => {
    const { grid } = fixture();
    const spy = vi.spyOn(grid, "getRowModel");
    const find = createFindModel(grid);
    find.getSnapshot();
    find.refresh();
    grid.toggleSelection("a");
    find.getSnapshot();
    expect(spy).not.toHaveBeenCalled();
  });
  it("bounds queries and rejects non-string input before changing state", () => {
    const { find } = fixture();
    find.setQuery("alpha");
    const snapshot = find.getSnapshot();
    expect(() => find.setQuery("a".repeat(10001))).toThrow();
    expect(() => find.setQuery(12 as unknown as string)).toThrow(TypeError);
    expect(find.getSnapshot()).toBe(snapshot);
  });
});

describe("Find presentation eligibility", () => {
  it("skips covered cell getters before evaluation while retaining formatted owner matches", () => {
    const hidden = vi.fn(() => {
      throw new Error("covered getter must not run");
    });
    const grid = createGrid({
      rows: [{ id: "a", name: "visible alpha" }],
      columns: [
        {
          id: "name",
          field: "name",
          valueFormatter: (value) => `Owner ${value}`,
        },
        { id: "covered", valueGetter: hidden },
      ],
      getRowId: (row) => row.id,
    });
    const find = createFindModel(grid, {
      isCellSearchable: (position) => position.columnId !== "covered",
    });
    const state = grid.getState();
    find.setQuery("Owner visible alpha");
    expect(find.getSnapshot().matches).toEqual([p("a", "name")]);
    expect(hidden).not.toHaveBeenCalled();
    expect(grid.getState()).toBe(state);
  });
  it("refreshes dynamic eligibility, wraps only searchable matches and preserves stable snapshots when unchanged", () => {
    const { grid } = fixture();
    let excluded = "";
    const eligible = vi.fn(
      (position: { rowId: string }) => position.rowId !== excluded,
    );
    const find = createFindModel(grid, { isCellSearchable: eligible });
    find.setQuery("alpha");
    find.select(1);
    excluded = "c";
    find.refresh();
    expect(find.getSnapshot()).toMatchObject({
      matches: [p("a", "name")],
      activeIndex: 0,
    });
    expect(find.next()).toEqual(p("a", "name"));
    expect(find.previous()).toEqual(p("a", "name"));
    excluded = "a";
    find.refresh();
    expect(find.getSnapshot().matches).toEqual([p("c", "name")]);
    const state = find.getSnapshot(),
      listener = vi.fn(),
      unsubscribe = find.subscribe(listener);
    find.refresh();
    expect(find.getSnapshot()).toBe(state);
    expect(listener).not.toHaveBeenCalled();
    expect(
      eligible.mock.calls.every(([position]) => Object.isFrozen(position)),
    ).toBe(true);
    unsubscribe();
  });
  it("composes eligibility with page order and hidden-column policy", () => {
    const { grid } = fixture();
    const find = createFindModel(grid, {
      getRowIds: () => ["c", "a"],
      includeHidden: true,
      isCellSearchable: (position) => position.columnId !== "secret",
    });
    find.setQuery("alpha");
    expect(find.getSnapshot().matches).toEqual([
      p("c", "name"),
      p("a", "name"),
    ]);
    grid.setFilter("name", { op: "contains", value: "Beta" });
    expect(find.getSnapshot().matches).toEqual([]);
  });
  it("propagates eligibility errors without publishing a partial result and permits recovery", () => {
    const { grid } = fixture();
    const failure = new Error("predicate failed");
    let fail = false;
    const find = createFindModel(grid, {
      isCellSearchable: () => {
        if (fail) throw failure;
        return true;
      },
    });
    find.setQuery("alpha");
    const state = find.getSnapshot(),
      listener = vi.fn();
    find.subscribe(listener);
    fail = true;
    expect(() => find.setQuery("Beta")).toThrow(failure);
    expect(find.getSnapshot()).toBe(state);
    expect(listener).not.toHaveBeenCalled();
    fail = false;
    find.setQuery("Beta");
    expect(find.getSnapshot().matches).toEqual([p("b", "name")]);
    expect(listener).toHaveBeenCalledTimes(1);
    find.dispose();
  });
  it("validates the optional callback and performs no eligibility work for empty queries", () => {
    const { grid } = fixture();
    expect(() =>
      createFindModel(grid, { isCellSearchable: true } as never),
    ).toThrow("isCellSearchable");
    const callback = vi.fn(() => true),
      find = createFindModel(grid, { isCellSearchable: callback });
    find.refresh();
    find.setQuery("");
    expect(callback).not.toHaveBeenCalled();
  });
});
