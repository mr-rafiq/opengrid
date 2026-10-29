import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index";
import {
  createAlignedColumns,
  type AlignedColumnModel,
  type AlignedColumnsOptions,
} from "./aligned-columns";
import type { Column, GridModel, GridState } from "./types";
interface Row {
  id: string;
  a: number;
  b: number;
  c: number;
}
const make = (
  columns: Column<Row>[] = [{ id: "a" }, { id: "b" }, { id: "c" }],
  initialState: Partial<GridState> = {},
) =>
  createGrid({
    rows: [
      { id: "one", a: 1, b: 2, c: 3 },
      { id: "two", a: 4, b: 5, c: 6 },
      { id: "three", a: 7, b: 8, c: 9 },
    ],
    columns,
    getRowId: (row) => row.id,
    initialState,
  });
const width = (grid: AlignedColumnModel, id = "a") =>
  grid.getColumns().find((column) => column.id === id)!.width ?? 160;
const pin = (grid: AlignedColumnModel, id = "a") =>
  grid.getColumns().find((column) => column.id === id)!.pinned ?? null;
const hidden = (grid: AlignedColumnModel, id = "a") =>
  grid.getColumns().find((column) => column.id === id)!.hidden ?? false;
function tracked(grid: GridModel<Row>) {
  let active = 0;
  const target = {
    ...grid,
    subscribe(listener: () => void) {
      active++;
      const stop = grid.subscribe(listener);
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        active--;
        stop();
      };
    },
  };
  return {
    target,
    get active() {
      return active;
    },
  };
}

describe("aligned column models", () => {
  it("initially synchronizes all selected column properties from the requested source", () => {
    const a = make([{ id: "a", width: 100 }, { id: "b" }, { id: "c" }]);
    const b = make(
      [
        { id: "a", width: 210, hidden: true, pinned: "right" },
        { id: "b", width: 190 },
        { id: "c" },
      ],
      { columnOrder: ["c", "b", "a"] },
    );
    const link = createAlignedColumns([a, b], { initialSourceIndex: 1 });
    expect(a.getState().columnOrder).toEqual(["c", "b", "a"]);
    expect(width(a)).toBe(210);
    expect(hidden(a)).toBe(true);
    expect(pin(a)).toBe("right");
    expect(width(a, "b")).toBe(190);
    expect(link.sharedColumnIds).toEqual(["c", "b", "a"]);
    expect(Object.isFrozen(link.sharedColumnIds)).toBe(true);
    link.dispose();
  });
  it("synchronizes changes in either direction without echo notifications", () => {
    const a = make(),
      b = make(),
      c = make();
    const targets = [a, b, c];
    const link = createAlignedColumns(targets);
    const writes = targets.map((grid) => vi.spyOn(grid, "setState"));
    a.resizeColumn("a", 205);
    expect(targets.map((grid) => width(grid))).toEqual([205, 205, 205]);
    expect(writes.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(2);
    b.hideColumn("b", true);
    expect(targets.map((grid) => hidden(grid, "b"))).toEqual([
      true,
      true,
      true,
    ]);
    c.pinColumn("c", "left");
    expect(targets.map((grid) => pin(grid, "c"))).toEqual([
      "left",
      "left",
      "left",
    ]);
    c.moveColumn("b", 0);
    expect(targets.map((grid) => grid.getState().columnOrder)).toEqual([
      ["b", "a", "c"],
      ["b", "a", "c"],
      ["b", "a", "c"],
    ]);
    link.dispose();
  });
  it("keeps nonshared columns in their existing order slots and preserves their settings", () => {
    const a = make([
      { id: "a" },
      { id: "source", width: 301, hidden: true, pinned: "right" },
      { id: "b" },
      { id: "c" },
    ]);
    const b = make(
      [
        { id: "x", width: 110 },
        { id: "c" },
        { id: "y", hidden: true },
        { id: "a" },
        { id: "b" },
        { id: "z", pinned: "left" },
      ],
      {
        columnWidths: { x: 123, ghost: 456 },
        columnVisibility: { y: false },
        columnPinning: { z: "left" },
      },
    );
    const link = createAlignedColumns([a, b]);
    expect(link.sharedColumnIds).toEqual(["a", "b", "c"]);
    expect(b.getState().columnOrder).toEqual(["x", "a", "y", "b", "c", "z"]);
    expect(b.getState().columnWidths).toMatchObject({ x: 123, ghost: 456 });
    expect(hidden(b, "y")).toBe(true);
    expect(pin(b, "z")).toBe("left");
    b.moveColumn("c", 0);
    expect(a.getState().columnOrder).toEqual(["c", "source", "a", "b"]);
    expect(width(a, "source")).toBe(301);
    expect(hidden(a, "source")).toBe(true);
    expect(pin(a, "source")).toBe("right");
    link.dispose();
  });
  it("aligns the common intersection across every model, leaving pairwise-only overlaps independent", () => {
    const a = make([{ id: "a" }, { id: "pair", width: 100 }]),
      b = make([{ id: "a" }, { id: "pair", width: 200 }]),
      c = make([{ id: "a" }, { id: "other" }]);
    const link = createAlignedColumns([a, b, c]);
    expect(link.sharedColumnIds).toEqual(["a"]);
    a.resizeColumn("pair", 175);
    expect(width(b, "pair")).toBe(200);
    c.resizeColumn("a", 215);
    expect(width(a)).toBe(215);
    expect(width(b)).toBe(215);
    link.dispose();
  });
  it("derives effective defaults including hidden columns and explicit null unpinning", () => {
    const a = make([
      { id: "a", hidden: true, pinned: "left" },
      { id: "b", width: 120 },
    ]);
    const b = make([
      { id: "a", width: 90 },
      { id: "b", width: 280 },
    ]);
    const link = createAlignedColumns([a, b]);
    expect(width(b)).toBe(160);
    expect(hidden(b)).toBe(true);
    expect(pin(b)).toBe("left");
    b.pinColumn("a", null);
    b.hideColumn("a", false);
    expect(pin(a)).toBeNull();
    expect(hidden(a)).toBe(false);
    expect(a.getState().columnPinning.a).toBeNull();
    expect(a.getState().columnVisibility.a).toBe(true);
    b.setState({ columnWidths: {} });
    expect(width(a)).toBe(90);
    expect(width(b)).toBe(90);
    link.dispose();
  });
  it("uses logical column order rather than the pinned visual partition when only order is selected", () => {
    const a = make([{ id: "a" }, { id: "b", pinned: "left" }, { id: "c" }]),
      b = make([{ id: "a", pinned: "right" }, { id: "b" }, { id: "c" }], {
        columnOrder: ["c", "b", "a"],
      });
    const link = createAlignedColumns([a, b], { properties: ["order"] });
    expect(b.getState().columnOrder).toEqual(["a", "b", "c"]);
    expect(pin(b)).toBe("right");
    expect(pin(a, "b")).toBe("left");
    link.dispose();
  });
  it.each(["order", "width", "visibility", "pinning"] as const)(
    "only synchronizes the explicitly selected %s property",
    (property) => {
      const a = make(
        [{ id: "a", width: 110, hidden: true, pinned: "left" }, { id: "b" }],
        { columnOrder: ["b", "a"] },
      );
      const b = make([{ id: "a", width: 220 }, { id: "b" }]);
      const link = createAlignedColumns([a, b], { properties: [property] });
      expect(b.getState().columnOrder).toEqual(
        property === "order" ? ["b", "a"] : ["a", "b"],
      );
      expect(width(b)).toBe(property === "width" ? 110 : 220);
      expect(hidden(b)).toBe(property === "visibility");
      expect(pin(b)).toBe(property === "pinning" ? "left" : null);
      b.resizeColumn("a", 240);
      expect(width(a)).toBe(property === "width" ? 240 : 110);
      link.dispose();
    },
  );
  it("converges widths within the intersection of all min/max constraints", () => {
    const a = make([{ id: "a", width: 230, minWidth: 40, maxWidth: 400 }]);
    const b = make([{ id: "a", width: 120, minWidth: 100, maxWidth: 150 }]);
    const c = make([{ id: "a", width: 130, minWidth: 80, maxWidth: 200 }]);
    const link = createAlignedColumns([a, b, c], { properties: ["width"] });
    expect([a, b, c].map((grid) => width(grid))).toEqual([150, 150, 150]);
    a.resizeColumn("a", 50);
    expect([a, b, c].map((grid) => width(grid))).toEqual([100, 100, 100]);
    c.resizeColumn("a", 140);
    expect([a, b, c].map((grid) => width(grid))).toEqual([140, 140, 140]);
    link.dispose();
  });
  it("keeps each grid data, sorting, filters, selection and pagination independent", () => {
    const a = make(),
      b = make(undefined, {
        pageSize: 1,
        page: 1,
        sorting: [{ columnId: "b", direction: "desc" }],
        filters: { a: { op: "gt", value: 0 } },
        quickFilter: "",
        selected: ["two"],
        expanded: ["custom"],
      });
    const before = b.getState(),
      rows = b.getRows();
    const link = createAlignedColumns([a, b]);
    a.resizeColumn("a", 220);
    expect(b.getRows()).toEqual(rows);
    for (const property of [
      "sorting",
      "filters",
      "selected",
      "page",
      "pageSize",
      "groupBy",
      "expanded",
      "quickFilter",
    ] as const)
      expect(b.getState()[property]).toEqual(before[property]);
    const writes = vi.spyOn(b, "setState");
    a.toggleSelection("one");
    a.setSort("a", "desc");
    expect(writes).not.toHaveBeenCalled();
    link.dispose();
  });
  it("preserves inputs, copies the model list and accepts heterogeneous row models", () => {
    const columns = Object.freeze([Object.freeze({ id: "a", width: 120 })]);
    const a = createGrid({
      rows: Object.freeze([{ key: "a", value: "Text" }]) as unknown as {
        key: string;
        value: string;
      }[],
      columns: columns as unknown as Column<{ key: string; value: string }>[],
      getRowId: (row) => row.key,
    });
    const b = make([{ id: "a", width: 220 }]),
      c = make([{ id: "a", width: 300 }]);
    const targets: AlignedColumnModel[] = [a, b];
    const options = Object.freeze({
      properties: Object.freeze(["width"] as const),
    });
    const link = createAlignedColumns(targets, options);
    targets[1] = c;
    a.resizeColumn("a", 180);
    expect(width(b)).toBe(180);
    expect(width(c)).toBe(300);
    expect(columns[0].width).toBe(120);
    expect(options.properties).toEqual(["width"]);
    link.dispose();
  });
  it("handles prototype-like column IDs without mutating object prototypes", () => {
    const a = make([{ id: "__proto__", width: 100 }, { id: "constructor" }]),
      b = make([{ id: "__proto__", width: 200 }, { id: "constructor" }]);
    const link = createAlignedColumns([a, b]);
    a.resizeColumn("__proto__", 175);
    a.pinColumn("constructor", "right");
    expect(width(b, "__proto__")).toBe(175);
    expect(pin(b, "constructor")).toBe("right");
    expect(Object.getPrototypeOf(b.getState().columnWidths)).toBe(
      Object.prototype,
    );
    link.dispose();
  });
  it("queues reentrant observer changes rather than discarding them or recursing", () => {
    const a = make(),
      b = make(),
      c = make();
    const link = createAlignedColumns([a, b, c], { properties: ["width"] });
    let once = false;
    const stop = b.subscribe(() => {
      if (!once && width(b) === 200) {
        once = true;
        c.resizeColumn("a", 275);
      }
    });
    a.resizeColumn("a", 200);
    expect([a, b, c].map((grid) => width(grid))).toEqual([275, 275, 275]);
    stop();
    link.dispose();
  });
  it("also retains observer changes registered before the alignment subscription", () => {
    const a = make(),
      b = make();
    let once = false;
    const stop = b.subscribe(() => {
      if (!once && width(b) === 200) {
        once = true;
        b.resizeColumn("a", 250);
      }
    });
    const link = createAlignedColumns([a, b], { properties: ["width"] });
    a.resizeColumn("a", 200);
    expect([a, b].map((grid) => width(grid))).toEqual([250, 250]);
    stop();
    link.dispose();
  });
  it("allows overlapping independent links to converge and dispose independently", () => {
    const a = make(),
      b = make(),
      c = make();
    const first = createAlignedColumns([a, b], { properties: ["width"] }),
      second = createAlignedColumns([b, c], { properties: ["width"] });
    a.resizeColumn("a", 225);
    expect([a, b, c].map((grid) => width(grid))).toEqual([225, 225, 225]);
    first.dispose();
    b.resizeColumn("a", 175);
    expect([a, b, c].map((grid) => width(grid))).toEqual([225, 175, 175]);
    second.dispose();
  });
  it("detaches all subscriptions on idempotent disposal", () => {
    const a = tracked(make()),
      b = tracked(make());
    const link = createAlignedColumns([a.target, b.target]);
    expect([a.active, b.active]).toEqual([1, 1]);
    link.dispose();
    link.dispose();
    expect([a.active, b.active]).toEqual([0, 0]);
    a.target.resizeColumn("a", 250);
    expect(width(b.target)).toBe(160);
  });
  it("stops safely if disposed by another observer during propagation", () => {
    const a = make(),
      b = make(),
      c = make();
    const link = createAlignedColumns([a, b, c], { properties: ["width"] });
    const stop = b.subscribe(() => {
      if (width(b) === 210) link.dispose();
    });
    a.resizeColumn("a", 210);
    expect(width(b)).toBe(210);
    expect(width(c)).toBe(160);
    stop();
  });
  it("bounds nonconvergent external observers and disposes the link", () => {
    const a = tracked(make()),
      b = tracked(make());
    const link = createAlignedColumns([a.target, b.target], {
      properties: ["width"],
    });
    let changes = 0;
    const stop = b.target.subscribe(() => {
      changes++;
      a.target.resizeColumn("a", width(b.target) === 100 ? 200 : 100);
    });
    expect(() => a.target.resizeColumn("a", 100)).toThrow("converge");
    expect(changes).toBeLessThanOrEqual(100);
    expect([a.active, b.active]).toEqual([0, 1]);
    stop();
    expect(b.active).toBe(0);
    link.dispose();
  });
  it("does not leak earlier subscriptions if a later subscribe fails", () => {
    const a = tracked(make([{ id: "a", width: 200 }])),
      b = make([{ id: "a", width: 100 }]);
    const bad = {
      ...b,
      subscribe() {
        throw new Error("Cannot subscribe");
      },
    };
    expect(() => createAlignedColumns([a.target, bad])).toThrow(
      "Cannot subscribe",
    );
    expect(a.active).toBe(0);
    expect(width(a.target)).toBe(200);
    expect(width(b)).toBe(100);
    a.target.resizeColumn("a", 250);
    expect(width(b)).toBe(100);
  });
  it("rolls back shared setup writes and cleans listeners if an initial target write fails", () => {
    const a = tracked(make([{ id: "a", width: 200 }])),
      b = tracked(make([{ id: "a", width: 100 }])),
      c = tracked(make([{ id: "a", width: 100 }]));
    let fail = true;
    const bad = {
      ...c.target,
      setState(patch: Partial<GridState>) {
        if (fail) {
          fail = false;
          throw new Error("Write failed");
        }
        c.target.setState(patch);
      },
    };
    expect(() =>
      createAlignedColumns([a.target, b.target, bad], {
        properties: ["width"],
      }),
    ).toThrow("Write failed");
    expect([a.active, b.active, c.active]).toEqual([0, 0, 0]);
    expect([a.target, b.target, c.target].map((grid) => width(grid))).toEqual([
      200, 100, 100,
    ]);
    expect(b.target.getState().columnWidths).toEqual({});
  });
  it("disposes after runtime write failures rather than leaving a recursive partial link", () => {
    const a = tracked(make()),
      b = tracked(make());
    let fail = false;
    const bad = {
      ...b.target,
      setState(patch: Partial<GridState>) {
        if (fail) throw new Error("Runtime failure");
        b.target.setState(patch);
      },
    };
    createAlignedColumns([a.target, bad], { properties: ["width"] });
    fail = true;
    expect(() => a.target.resizeColumn("a", 205)).toThrow("Runtime failure");
    expect([a.active, b.active]).toEqual([0, 0]);
    a.target.resizeColumn("a", 220);
    expect(width(b.target)).toBe(160);
  });
  it("rejects incompatible width constraints before any subscriptions or writes", () => {
    const a = make([{ id: "a", minWidth: 200 }]),
      b = make([{ id: "a", maxWidth: 100 }]);
    const subscribe = vi.spyOn(a, "subscribe"),
      write = vi.spyOn(a, "setState");
    expect(() => createAlignedColumns([a, b])).toThrow("do not overlap");
    expect(subscribe).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    const link = createAlignedColumns([a, b], { properties: ["order"] });
    link.dispose();
  });
  it("rejects disjoint or malformed schemas before registering observers", () => {
    const a = make([{ id: "a" }]),
      b = make([{ id: "b" }]);
    const subscribe = vi.spyOn(a, "subscribe");
    expect(() => createAlignedColumns([a, b])).toThrow("every aligned model");
    expect(() =>
      createAlignedColumns([
        a,
        { ...a, getColumns: () => [{ id: "a" }, { id: "a" }] },
      ]),
    ).toThrow("unique");
    expect(() =>
      createAlignedColumns([
        a,
        { ...a, getState: () => ({ ...a.getState(), columnOrder: [] }) },
      ]),
    ).toThrow("exactly once");
    expect(subscribe).not.toHaveBeenCalled();
  });
  it.each([
    { properties: [] },
    { properties: ["width", "width"] },
    { properties: ["unknown"] },
    { properties: "width" },
    { properties: null },
    { initialSourceIndex: -1 },
    { initialSourceIndex: 2 },
    { initialSourceIndex: 0.5 },
    { initialSourceIndex: null },
    { extra: true },
    null,
  ] as unknown[])(
    "rejects invalid options %j before side effects",
    (options) => {
      const a = make(),
        b = make();
      const subscribe = vi.spyOn(a, "subscribe");
      expect(() =>
        createAlignedColumns([a, b], options as AlignedColumnsOptions),
      ).toThrow();
      expect(subscribe).not.toHaveBeenCalled();
    },
  );
  it("requires distinct valid models and a bounded model count", () => {
    const a = make();
    expect(() => createAlignedColumns([a])).toThrow();
    expect(() => createAlignedColumns([a, a])).toThrow("distinct");
    expect(() => createAlignedColumns(Array(33).fill(a))).toThrow();
    expect(() => createAlignedColumns([a, {} as AlignedColumnModel])).toThrow(
      "Each aligned model",
    );
    expect(() =>
      createAlignedColumns(null as unknown as AlignedColumnModel[]),
    ).toThrow();
  });
});
