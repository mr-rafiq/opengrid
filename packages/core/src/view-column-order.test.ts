import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index";
import { createCellRangeModel } from "./ranges";
import { createFindModel } from "./find";
import type { CellPosition } from "./ranges";
const p = (rowId: string, columnId: string): CellPosition => ({
  rowId,
  columnId,
});
function make() {
  return createGrid({
    rows: [
      { id: "a", x: 1, y: 2, z: 3, hidden: 10 },
      { id: "b", x: 4, y: 5, z: 6, hidden: 11 },
    ],
    columns: [
      {
        id: "x",
        field: "x",
        type: "number",
        editable: true,
        pinned: "left",
        valueFormatter: (value) => `match ${value}`,
      },
      {
        id: "y",
        field: "y",
        type: "number",
        editable: true,
        valueFormatter: (value) => `match ${value}`,
      },
      {
        id: "z",
        field: "z",
        type: "number",
        editable: true,
        pinned: "right",
        valueFormatter: (value) => `match ${value}`,
      },
      {
        id: "hidden",
        field: "hidden",
        hidden: true,
        valueFormatter: (value) => `match ${value}`,
      },
    ],
    getRowId: (row) => row.id,
  });
}
describe("per-view range column order", () => {
  it("preserves the default model order when no view callback is supplied", () => {
    const range = createCellRangeModel(make());
    range.setRange(p("a", "x"), p("b", "z"));
    expect(range.copy()).toBe("1\t2\t3\r\n4\t5\t6");
  });
  it("uses supplied pinned/view order for membership, materialization and clipboard output", () => {
    const order = Object.freeze(["z", "y", "x"]);
    const range = createCellRangeModel(make(), { getColumnIds: () => order });
    range.setRange(p("a", "z"), p("b", "x"));
    expect(range.copy()).toBe("3\t2\t1\r\n6\t5\t4");
    expect(range.getCells()).toEqual(
      ["a", "b"].flatMap((rowId) =>
        order.map((columnId) => p(rowId, columnId)),
      ),
    );
    expect(order).toEqual(["z", "y", "x"]);
  });
  it("maps paste and forward-column fill into the supplied order with atomic undo", () => {
    const model = make(),
      range = createCellRangeModel(model, {
        getColumnIds: () => ["z", "y", "x"],
      });
    range.setRange(p("a", "z"));
    expect(range.paste("30\t20\t10")).toBeUndefined();
    expect(model.getRows()[0]).toMatchObject({ x: 10, y: 20, z: 30 });
    expect(model.undo()).toBe(true);
    expect(model.getRows()[0]).toMatchObject({ x: 1, y: 2, z: 3 });
    range.setRange(p("a", "z"), p("a", "x"));
    expect(range.fill("right")).toBeUndefined();
    expect(model.getRows()[0]).toMatchObject({ x: 3, y: 3, z: 3 });
    expect(model.undo()).toBe(true);
    expect(model.getRows()[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });
  it("keeps stable endpoints when order changes and recomputes the rectangle without disposal", () => {
    const model = make();
    let order = ["x", "y", "z"];
    const range = createCellRangeModel(model, { getColumnIds: () => order });
    range.setRange(p("a", "x"), p("b", "y"));
    const listener = vi.fn();
    range.subscribe(listener);
    order = ["x", "z", "y"];
    range.refresh();
    expect(range.getSnapshot().range).toEqual({
      anchor: p("a", "x"),
      focus: p("b", "y"),
    });
    expect(range.contains("a", "z")).toBe(true);
    expect(range.copy()).toBe("1\t3\t2\r\n4\t6\t5");
    order = ["z", "y", "x"];
    range.refresh();
    expect(range.getSnapshot().range).toEqual({
      anchor: p("a", "x"),
      focus: p("b", "y"),
    });
    expect(range.copy()).toBe("2\t1\r\n5\t4");
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("supports subsets and clears endpoints that leave the view", () => {
    let order = ["z", "x"];
    const range = createCellRangeModel(make(), { getColumnIds: () => order });
    range.setRange(p("a", "z"), p("b", "x"));
    expect(range.copy()).toBe("3\t1\r\n6\t4");
    order = ["z"];
    range.refresh();
    expect(range.getSnapshot().range).toBeNull();
    order = [];
    range.refresh();
    expect(range.getCells()).toEqual([]);
  });
  it("leaves the committed view and range unchanged after failed view validation", () => {
    let order = ["x", "y", "z"];
    const range = createCellRangeModel(make(), { getColumnIds: () => order });
    range.setRange(p("a", "x"), p("b", "z"));
    const snapshot = range.getSnapshot();
    order = ["x", "x"];
    expect(() => range.refresh()).toThrow("unique");
    expect(range.getSnapshot()).toBe(snapshot);
    expect(range.contains("b", "z")).toBe(true);
    order = ["z", "y", "x"];
    range.refresh();
    expect(range.copy()).toBe("3\t2\t1\r\n6\t5\t4");
  });
});
describe("per-view Find column order", () => {
  it("orders matches by view and preserves the active stable ID across a runtime reversal", () => {
    let order = ["x", "y", "z"];
    const find = createFindModel(make(), { getColumnIds: () => order });
    find.setQuery("match");
    find.select(0);
    order = ["z", "y", "x"];
    find.refresh();
    expect(find.getSnapshot().matches).toEqual(
      ["a", "b"].flatMap((rowId) =>
        order.map((columnId) => p(rowId, columnId)),
      ),
    );
    expect(find.getSnapshot().activeIndex).toBe(2);
    expect(find.getSnapshot().matches[2]).toEqual(p("a", "x"));
    expect(find.next()).toEqual(p("b", "z"));
  });
  it("composes row/column subsets with the covered-cell predicate", () => {
    const find = createFindModel(make(), {
      getRowIds: () => ["b", "a"],
      getColumnIds: () => ["z", "y", "x"],
      isCellSearchable: (position) => position.columnId !== "y",
    });
    find.setQuery("match");
    expect(find.getSnapshot().matches).toEqual([
      p("b", "z"),
      p("b", "x"),
      p("a", "z"),
      p("a", "x"),
    ]);
  });
  it("preserves includeHidden defaults without a callback and uses visible-only callback scope", () => {
    const find = createFindModel(make(), { includeHidden: true });
    find.setQuery("match");
    expect(find.getSnapshot().matches).toHaveLength(8);
    expect(() =>
      createFindModel(make(), {
        includeHidden: true,
        getColumnIds: () => ["hidden"],
      }),
    ).toThrow("visible");
  });
  it("keeps a previous query and active match if a new callback result is invalid", () => {
    let order = ["x", "y", "z"];
    const find = createFindModel(make(), { getColumnIds: () => order });
    find.setQuery("match");
    find.select(4);
    const snapshot = find.getSnapshot();
    order = ["missing"];
    expect(() => find.refresh()).toThrow("existing");
    expect(find.getSnapshot()).toBe(snapshot);
    order = ["z", "y", "x"];
    find.refresh();
    expect(find.getSnapshot().matches[find.getSnapshot().activeIndex]).toEqual(
      p("b", "y"),
    );
  });
});
describe.each(["range", "find"] as const)("%s view validation", (kind) => {
  const create = (
    model: ReturnType<typeof make>,
    getColumnIds: () => readonly string[],
  ) =>
    kind === "range"
      ? createCellRangeModel(model, { getColumnIds })
      : createFindModel(model, { getColumnIds });
  it.each(
    (
      [["x", "x"], ["missing"], ["hidden"], [""], [1], "x", null] as unknown[]
    ).map((value) => ({ value })),
  )("rejects invalid supplied IDs $value before subscriptions", ({ value }) => {
    const model = make(),
      subscribe = vi.spyOn(model, "subscribe");
    expect(() => create(model, () => value as readonly string[])).toThrow();
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("rejects non-function callbacks", () => {
    expect(() =>
      kind === "range"
        ? createCellRangeModel(make(), {
            getColumnIds: 1 as unknown as () => string[],
          })
        : createFindModel(make(), {
            getColumnIds: 1 as unknown as () => string[],
          }),
    ).toThrow("function");
  });
});
