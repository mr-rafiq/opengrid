import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index";
import {
  createCellRangeModel,
  parseTsv,
  serializeTsv,
  type CellPosition,
  type CellRange,
} from "./ranges";
import type { Column } from "./types";

interface Row {
  id: string;
  name: string;
  group: string;
  x: number;
  y: number;
  z: number;
  big: bigint;
}
const p = (rowId: string, columnId: string): CellPosition => ({
  rowId,
  columnId,
});
const r = (a: string, x: string, b = a, y = x): CellRange => ({
  anchor: p(a, x),
  focus: p(b, y),
});
function fixture(
  options: { readonlyY?: boolean; pageSize?: number; maxCells?: number } = {},
) {
  const rows: Row[] = [
    {
      id: "a",
      name: "Alpha",
      group: "A",
      x: 1,
      y: 10,
      z: 100,
      big: 9007199254740993n,
    },
    {
      id: "b",
      name: "Beta",
      group: "B",
      x: 3,
      y: 20,
      z: 200,
      big: 9007199254740995n,
    },
    {
      id: "c",
      name: "Gamma",
      group: "A",
      x: 9,
      y: 30,
      z: 300,
      big: 9007199254740999n,
    },
    {
      id: "d",
      name: "Delta",
      group: "B",
      x: 12,
      y: 40,
      z: 400,
      big: 9007199254741001n,
    },
  ];
  const columns: Column<Row>[] = [
    { id: "name", field: "name", editable: true },
    {
      id: "x",
      field: "x",
      type: "number",
      editable: true,
      validate: (value) => (Number(value) < 0 ? "No negative x" : undefined),
    },
    { id: "y", field: "y", type: "number", editable: !options.readonlyY },
    { id: "z", field: "z", type: "number", editable: true },
    { id: "big", field: "big", type: "bigint", editable: true },
    { id: "computed", valueGetter: (row) => row.x + row.y, editable: true },
    { id: "group", field: "group", hidden: true },
  ];
  const grid = createGrid({
    rows,
    columns,
    getRowId: (row) => row.id,
    initialState: { pageSize: options.pageSize ?? 100 },
  });
  const ranges = createCellRangeModel(grid, { maxCells: options.maxCells });
  return { grid, ranges, rows };
}

describe("quoted TSV", () => {
  it("round-trips embedded delimiters, line breaks, quotes and blanks", () => {
    const values = [
      ["a\tb", "line\r\nnext", 'say "yes"', ""],
      ["plain", "", "end", "last"],
    ];
    expect(
      parseTsv(serializeTsv(values, { neutralizeFormulas: false })),
    ).toEqual(values);
  });
  it.each(["\n", "\r", "\r\n"])(
    "accepts row terminator %j without a phantom row",
    (separator) => {
      expect(parseTsv("a\tb" + separator + "c\td" + separator)).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    },
  );
  it("preserves internal empty rows, trailing cells and empty input", () => {
    expect(parseTsv("a\n\n")).toEqual([["a"], [""]]);
    expect(parseTsv("a\t")).toEqual([["a", ""]]);
    expect(parseTsv("")).toEqual([[""]]);
  });
  it.each(['"unterminated', 'a"b', '"a"junk', '"a" "b"'])(
    "rejects malformed quoted text %j",
    (input) => expect(() => parseTsv(input)).toThrow(),
  );
  it("bounds the cell count and validates limits", () => {
    expect(() => parseTsv("a\tb", { maxCells: 1 })).toThrow("cell limit");
    expect(() => parseTsv("", { maxCells: 0 })).toThrow();
  });
  it("neutralizes string formulas without converting numeric negatives to text", () => {
    expect(
      serializeTsv([["=SUM(A1)", "+x", "-x", "@x", " \t=1", -12, -5n]]),
    ).toBe("'=SUM(A1)\t'+x\t'-x\t'@x\t\"' \t=1\"\t-12\t-5");
    expect(serializeTsv([["=1"]], { neutralizeFormulas: false })).toBe("=1");
  });
});

describe("cell range identity and selection", () => {
  it("normalizes reversed rectangles and supports extension and clearing", () => {
    const { ranges } = fixture();
    ranges.setRange(p("c", "y"), p("a", "x"));
    expect(ranges.contains("b", "x")).toBe(true);
    expect(ranges.contains("b", "z")).toBe(false);
    expect(ranges.getCells()).toEqual(
      ["a", "b", "c"].flatMap((rowId) =>
        ["x", "y"].map((columnId) => p(rowId, columnId)),
      ),
    );
    ranges.extend(p("d", "z"));
    expect(ranges.contains("d", "z")).toBe(true);
    expect(ranges.contains("b", "x")).toBe(false);
    ranges.clear();
    expect(ranges.getSnapshot().range).toBeNull();
    expect(ranges.getCells()).toEqual([]);
  });
  it("publishes immutable stable snapshots and only notifies on meaningful changes", () => {
    const { grid, ranges } = fixture();
    const listener = vi.fn();
    ranges.subscribe(listener);
    const empty = ranges.getSnapshot();
    expect(ranges.getSnapshot()).toBe(empty);
    ranges.setRange(p("a", "x"), p("b", "y"));
    const chosen = ranges.getSnapshot();
    expect(Object.isFrozen(chosen.range!.anchor)).toBe(true);
    ranges.setRange(p("a", "x"), p("b", "y"));
    expect(ranges.getSnapshot()).toBe(chosen);
    expect(listener).toHaveBeenCalledTimes(1);
    grid.toggleSelection("a");
    expect(listener).toHaveBeenCalledTimes(1);
    grid.setSort("x", "desc");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(ranges.getSnapshot()).not.toBe(chosen);
    ranges.dispose();
    grid.hideColumn("y", true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("keeps endpoints by row ID when sorting and recomputes the visual rectangle", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("a", "x"), p("c", "y"));
    grid.setSort("x", "desc");
    expect(ranges.getSnapshot().range).toEqual(r("a", "x", "c", "y"));
    expect(ranges.copy()).toBe("9\t30\r\n3\t20\r\n1\t10");
  });
  it.each(["hide", "filter", "remove"] as const)(
    "clears a range after endpoint %s",
    (action) => {
      const { grid, ranges } = fixture();
      ranges.setRange(p("a", "x"), p("b", "y"));
      if (action === "hide") grid.hideColumn("x", true);
      else if (action === "filter") grid.setFilter("x", { op: "gt", value: 1 });
      else grid.applyTransaction({ remove: ["a"] });
      expect(ranges.getSnapshot().range).toBeNull();
      expect(ranges.contains("a", "x")).toBe(false);
    },
  );
  it("uses pinned/reordered visible column order and ignores hidden columns", () => {
    const { grid, ranges } = fixture();
    grid.pinColumn("z", "left");
    grid.hideColumn("y", true);
    ranges.setRange(p("a", "z"), p("a", "x"));
    expect(ranges.getCells().map((cell) => cell.columnId)).toEqual([
      "z",
      "name",
      "x",
    ]);
    expect(ranges.copy()).toBe("100\tAlpha\t1");
    grid.moveColumn("x", 0);
    expect(ranges.getCells().map((cell) => cell.columnId)).toEqual(["z", "x"]);
  });
  it("supports adapter-provided page bounds and explicit refresh", () => {
    const { grid } = fixture({ pageSize: 2 });
    let visible = ["a", "b"];
    const ranges = createCellRangeModel(grid, { getRowIds: () => visible });
    ranges.setRange(p("a", "x"), p("b", "x"));
    expect(ranges.copy()).toBe("1\r\n3");
    visible = ["c", "d"];
    ranges.refresh();
    expect(ranges.getSnapshot().range).toBeNull();
    ranges.setRange(p("c", "x"));
    expect(ranges.paste("5\n6")).toBeUndefined();
    expect(grid.getRows().map((row) => row.x)).toEqual([1, 3, 5, 6]);
  });
  it("excludes group headers and rows hidden by collapsed groups", () => {
    const { grid, ranges } = fixture();
    grid.setState({ groupBy: ["group"] });
    const group = grid.getRowModel()[0];
    ranges.setRange(p(group.id, "x"));
    expect(ranges.getSnapshot().range).toBeNull();
    grid.toggleExpanded(group.id);
    ranges.setRange(p("a", "x"), p("c", "y"));
    expect(ranges.copy()).toBe("1\t10\r\n9\t30");
    grid.toggleExpanded(group.id);
    expect(ranges.getSnapshot().range).toBeNull();
  });
  it("bounds materialized ranges and clipboard operations", () => {
    const { ranges } = fixture({ maxCells: 2 });
    ranges.setRange(p("a", "x"), p("b", "y"));
    expect(() => ranges.getCells()).toThrow("cell limit");
    expect(() => ranges.copy()).toThrow("cell limit");
  });
  it("does not scan rows during repeated cell membership queries", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("a", "x"), p("b", "y"));
    const spy = vi.spyOn(grid, "getRowModel");
    for (let index = 0; index < 100; index++) ranges.contains("b", "x");
    expect(spy).not.toHaveBeenCalled();
  });
  it("subscribes lazily and detaches the grid listener after the last observer", () => {
    const { grid } = fixture();
    const subscribe = vi.spyOn(grid, "subscribe");
    const ranges = createCellRangeModel(grid);
    expect(subscribe).not.toHaveBeenCalled();
    const first = ranges.subscribe(() => {}),
      second = ranges.subscribe(() => {});
    expect(subscribe).toHaveBeenCalledTimes(1);
    first();
    second();
    ranges.subscribe(() => {});
    expect(subscribe).toHaveBeenCalledTimes(2);
    ranges.dispose();
  });
  it("refreshes an unobserved controller by state identity before membership checks", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("a", "x"), p("b", "y"));
    grid.hideColumn("x", true);
    expect(ranges.contains("a", "x")).toBe(false);
    expect(ranges.getSnapshot().range).toBeNull();
  });
});

describe("atomic clipboard edits", () => {
  it("pastes typed rectangular data as one undoable transaction", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("b", "x"));
    expect(ranges.paste("25\t26\r\n35\t36\r\n")).toBeUndefined();
    expect(grid.getRows().map((row) => [row.x, row.y])).toEqual([
      [1, 10],
      [25, 26],
      [35, 36],
      [12, 40],
    ]);
    expect(ranges.getSnapshot().range).toEqual(r("b", "x", "c", "y"));
    expect(grid.undo()).toBe(true);
    expect(grid.getRows().map((row) => row.x)).toEqual([1, 3, 9, 12]);
    expect(grid.undo()).toBe(false);
    expect(grid.redo()).toBe(true);
  });
  it("uses an explicit anchor over the selected top-left and parses quoted text", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("a", "x"), p("b", "y"));
    expect(ranges.paste('"hello\tworld"', p("c", "name"))).toBeUndefined();
    expect(grid.getRows()[2].name).toBe("hello\tworld");
  });
  it("uses normalized top-left when the range is selected backwards", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("b", "y"), p("a", "x"));
    expect(ranges.paste("7\t8")).toBeUndefined();
    expect(grid.getRows()[0]).toMatchObject({ x: 7, y: 8 });
  });
  it("does not partially write when any cell fails validation", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("a", "x"));
    expect(ranges.paste("7\t8\n-1\t9")).toBe("No negative x");
    expect(grid.getRows().map((row) => row.x)).toEqual([1, 3, 9, 12]);
    expect(grid.undo()).toBe(false);
  });
  it.each(["readonly", "computed", "overflow", "ragged", "malformed"] as const)(
    "rejects %s paste atomically",
    (kind) => {
      const { grid, ranges } = fixture({ readonlyY: kind === "readonly" });
      ranges.setRange(p("a", kind === "computed" ? "computed" : "x"));
      const input =
        kind === "overflow"
          ? "1\n2\n3\n4\n5"
          : kind === "ragged"
            ? "1\t2\n3"
            : kind === "malformed"
              ? '"bad'
              : "7\t8";
      expect(ranges.paste(input)).toEqual(expect.any(String));
      expect(grid.getRows().map((row) => row.x)).toEqual([1, 3, 9, 12]);
      expect(grid.undo()).toBe(false);
    },
  );
  it("rejects stale or absent destinations", () => {
    const { ranges } = fixture();
    expect(ranges.paste("1")).toContain("Select");
    expect(ranges.paste("1", p("missing", "x"))).toContain("visible");
  });
  it("pastes formula-like strings as literal data without evaluating code", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("a", "name"));
    expect(ranges.paste("=SUM(1,2)")).toBeUndefined();
    expect(grid.getRows()[0].name).toBe("=SUM(1,2)");
    expect(ranges.copy()).toBe("'=SUM(1,2)");
  });
  it("retains destination identities even if the edit re-sorts rows", () => {
    const { grid, ranges } = fixture();
    grid.setSort("x", "asc");
    ranges.setRange(p("a", "x"));
    expect(ranges.paste("50\n60")).toBeUndefined();
    expect(ranges.getSnapshot().range).toEqual(r("a", "x", "b", "x"));
    expect(grid.getRows().map((row) => row.x)).toEqual([50, 60, 9, 12]);
  });
});

describe("fill transactions", () => {
  it("fills down from the first selected row with a single undo step", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("c", "y"), p("a", "x"));
    expect(ranges.fill("down")).toBeUndefined();
    expect(grid.getRows().map((row) => [row.x, row.y])).toEqual([
      [1, 10],
      [1, 10],
      [1, 10],
      [12, 40],
    ]);
    expect(grid.undo()).toBe(true);
    expect(grid.getRows()[2].x).toBe(9);
    expect(grid.undo()).toBe(false);
  });
  it("fills right from the first selected column", () => {
    const { grid, ranges } = fixture();
    ranges.setRange(p("a", "x"), p("b", "z"));
    expect(ranges.fill("right")).toBeUndefined();
    expect(
      grid
        .getRows()
        .slice(0, 2)
        .map((row) => [row.x, row.y, row.z]),
    ).toEqual([
      [1, 1, 1],
      [3, 3, 3],
    ]);
  });
  it("tiles multi-cell source patterns during a downward drag extension", () => {
    const { grid, ranges } = fixture();
    const source = r("a", "x", "b", "y"),
      target = r("a", "x", "d", "y");
    expect(ranges.fillRange(source, target)).toBeUndefined();
    expect(grid.getRows().map((row) => [row.x, row.y])).toEqual([
      [1, 10],
      [3, 20],
      [1, 10],
      [3, 20],
    ]);
    expect(ranges.getSnapshot().range).toEqual(target);
  });
  it("extends numeric and exact BigInt arithmetic progressions", () => {
    const { grid, ranges } = fixture();
    expect(
      ranges.fillRange(r("a", "x", "b", "x"), r("a", "x", "d", "x"), "series"),
    ).toBeUndefined();
    expect(grid.getRows().map((row) => row.x)).toEqual([1, 3, 5, 7]);
    expect(
      ranges.fillRange(
        r("a", "big", "b", "big"),
        r("a", "big", "d", "big"),
        "series",
      ),
    ).toBeUndefined();
    expect(grid.getRows().map((row) => row.big)).toEqual([
      9007199254740993n,
      9007199254740995n,
      9007199254740997n,
      9007199254740999n,
    ]);
  });
  it("supports single numeric seeds and string pattern repetition", () => {
    const { grid, ranges } = fixture();
    expect(
      ranges.fillRange(r("a", "x"), r("a", "x", "d", "x"), "series"),
    ).toBeUndefined();
    expect(grid.getRows().map((row) => row.x)).toEqual([1, 2, 3, 4]);
    expect(
      ranges.fillRange(
        r("a", "name", "b", "name"),
        r("a", "name", "d", "name"),
        "series",
      ),
    ).toBeUndefined();
    expect(grid.getRows().map((row) => row.name)).toEqual([
      "Alpha",
      "Beta",
      "Alpha",
      "Beta",
    ]);
  });
  it("extends a numeric series to the right", () => {
    const { grid, ranges } = fixture();
    expect(
      ranges.fillRange(r("a", "x", "a", "y"), r("a", "x", "a", "z"), "series"),
    ).toBeUndefined();
    expect(grid.getRows()[0]).toMatchObject({ x: 1, y: 10, z: 19 });
  });
  it("reads long seed patterns once rather than once per destination cell", () => {
    const rows = Array.from({ length: 2000 }, (_, index) => ({
      id: String(index),
      x: index,
    }));
    const grid = createGrid({
      rows,
      columns: [{ id: "x", field: "x", editable: true, type: "number" }],
      getRowId: (row) => row.id,
    });
    const ranges = createCellRangeModel(grid);
    const values = vi.spyOn(grid, "getValue");
    expect(
      ranges.fillRange(
        r("0", "x", "999", "x"),
        r("0", "x", "1999", "x"),
        "series",
      ),
    ).toBeUndefined();
    expect(values).toHaveBeenCalledTimes(1000);
    expect(grid.getRows()[1999].x).toBe(1999);
  });
  it("rejects non-linear seeds and unsupported axes without changes", () => {
    const { grid, ranges } = fixture();
    expect(
      ranges.fillRange(r("a", "x", "c", "x"), r("a", "x", "d", "x"), "series"),
    ).toContain("progression");
    expect(ranges.fillRange(r("a", "x"), r("a", "x", "b", "y"))).toContain(
      "one axis",
    );
    expect(ranges.fillRange(r("b", "x"), r("a", "x", "b", "x"))).toContain(
      "one axis",
    );
    expect(grid.undo()).toBe(false);
  });
  it("rejects read-only fill destinations and rolls back invalid series", () => {
    const { grid, ranges } = fixture({ readonlyY: true });
    expect(ranges.fillRange(r("a", "x"), r("a", "x", "a", "y"))).toContain(
      "read only",
    );
    expect(grid.undo()).toBe(false);
    grid.editCell("a", "x", 3);
    grid.editCell("b", "x", 1);
    const before = grid.getRows().map((row) => row.x);
    expect(
      ranges.fillRange(r("a", "x", "b", "x"), r("a", "x", "d", "x"), "series"),
    ).toBe("No negative x");
    expect(grid.getRows().map((row) => row.x)).toEqual(before);
  });
  it("treats a no-op extension as no history entry", () => {
    const { grid, ranges } = fixture();
    expect(ranges.fillRange(r("a", "x"), r("a", "x"))).toBeUndefined();
    expect(
      ranges.fillRange(r("a", "x", "c", "x"), r("a", "x", "c", "x"), "series"),
    ).toBeUndefined();
    expect(grid.undo()).toBe(false);
  });
});
