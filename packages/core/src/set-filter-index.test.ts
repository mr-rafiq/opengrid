import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index.js";
import type { Column, GridModel } from "./types.js";
import {
  createSetFilterIndex,
  SetFilterIndexError,
} from "./set-filter-index.js";

type Row = { id: string; value: unknown; category?: string };
function grid(
  values: unknown[],
  column: Partial<Column<Row>> = {},
  options: { valueCache?: boolean } = {},
) {
  return createGrid<Row>({
    rows: values.map((value, index) => ({
      id: String(index),
      value,
      category: index % 2 ? "B" : "A",
    })),
    columns: [
      { id: "value", field: "value", editable: true, ...column },
      { id: "category", field: "category" },
    ],
    getRowId: (row) => row.id,
    ...options,
  });
}
function errorCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error("Expected a SetFilterIndexError");
  } catch (error) {
    expect(error).toBeInstanceOf(SetFilterIndexError);
    expect((error as SetFilterIndexError).code).toBe(code);
  }
}

describe("resident set-list index", () => {
  it("indexes every resident row independently of page, grouping, quick and column filters", () => {
    const model = grid(["A", "B", "A", "C"]);
    model.setFilter("value", { op: "equals", value: "A" });
    model.setQuickFilter("A");
    model.setState({ pageSize: 1, groupBy: ["category"] });
    const index = createSetFilterIndex(model, "value");
    expect(index.rowCount).toBe(4);
    expect(index.entries.map((entry) => [entry.value, entry.count])).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 1],
    ]);
    expect(model.getState().filters.value).toEqual({
      op: "equals",
      value: "A",
    });
  });

  it("uses comparator identities, never formatter labels, and formats the first representative once", () => {
    const formatter = vi.fn((value: unknown, row: Row) => `${row.id}:same`);
    const index = createSetFilterIndex(
      grid(["ALPHA", "alpha", "BETA"], { valueFormatter: formatter }),
      "value",
    );
    expect(
      index.entries.map((entry) => [entry.value, entry.label, entry.count]),
    ).toEqual([
      ["alpha", "0:same", 2],
      ["beta", "2:same", 1],
    ]);
    expect(formatter).toHaveBeenCalledTimes(2);
    const collisions = createSetFilterIndex(
      grid([1, 2], { valueFormatter: () => "same" }),
      "value",
    );
    expect(collisions.entries).toHaveLength(2);
    expect(collisions.entries[0]!.key).not.toBe(collisions.entries[1]!.key);
  });

  it("groups typed invalid values with blanks while retaining explicit invalid counts", () => {
    const model = grid(
      [null, undefined, "", "bad", NaN, Infinity, "0", 0, -0],
      { type: "number" },
    );
    const index = createSetFilterIndex(model, "value");
    const blank = index.entries.find((entry) => entry.blank)!;
    expect(blank.value).toBe(null);
    expect(blank.count).toBe(6);
    expect(blank.invalidCount).toBe(3);
    expect(index.keyOf("bad")).toBe(index.keyOf(null));
    expect(index.keyOf(0)).not.toBe(index.keyOf(-0));
    model.setFilter("value", {
      op: "in",
      value: [...index.values([blank.key])],
    });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("preserves exact BigInts and canonical date instants without exposing mutable Dates", () => {
    const big = grid(
      [9007199254740993n, "9007199254740993", "9007199254740994", "bad"],
      { type: "bigint" },
    );
    const bigIndex = createSetFilterIndex(big, "value");
    expect(bigIndex.entries.map((entry) => [entry.value, entry.count])).toEqual(
      [
        [9007199254740993n, 2],
        [9007199254740994n, 1],
        [null, 1],
      ],
    );
    const date = new Date("2026-01-02T00:00:00Z");
    const dateModel = grid(
      [date, "2026-01-01T19:00:00-05:00", "invalid", new Date(NaN)],
      { type: "date" },
    );
    const dateIndex = createSetFilterIndex(dateModel, "value");
    expect(
      dateIndex.entries.map((entry) => [entry.value, entry.count]),
    ).toEqual([
      ["2026-01-02T00:00:00.000Z", 2],
      [null, 2],
    ]);
    date.setUTCDate(3);
    expect(dateIndex.entries[0]!.value).toBe("2026-01-02T00:00:00.000Z");
    expect(dateIndex.keyOf("2026-01-02")).toBe(dateIndex.entries[0]!.key);
  });

  it("retains boolean comparison rules and distinguishes untyped primitive domains", () => {
    const booleanIndex = createSetFilterIndex(
      grid([true, "true", 1, false, "false", 0, "other", null], {
        type: "boolean",
      }),
      "value",
    );
    expect(
      booleanIndex.entries.map((entry) => [entry.value, entry.count]),
    ).toEqual([
      [true, 3],
      [false, 4],
      [null, 1],
    ]);
    const index = createSetFilterIndex(
      grid([1, "1", 1n, true, -0, 0, NaN, Infinity]),
      "value",
    );
    expect(index.entries).toHaveLength(8);
    expect(index.keyOf(NaN)).not.toBe(index.keyOf(null));
    expect(index.keyOf("absent")).toBe("s:absent");
  });

  it("returns frozen owned scalar snapshots and validates selected keys atomically", () => {
    const row = { id: "a", value: "A" },
      model = createGrid({
        rows: [row],
        columns: [{ id: "value", field: "value" }],
        getRowId: (row) => row.id,
      });
    const index = createSetFilterIndex(model, "value"),
      key = index.entries[0]!.key;
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.entries)).toBe(true);
    expect(Object.isFrozen(index.entries[0])).toBe(true);
    expect(Object.isFrozen(row)).toBe(false);
    const values = index.values([key, key]);
    expect(values).toEqual(["a"]);
    expect(Object.isFrozen(values)).toBe(true);
    expect(index.values([])).toEqual([]);
    errorCode(() => index.values([key, "missing"]), "KEY");
    errorCode(() => index.values(new Array<string>(1)), "KEY");
    const read = vi.fn(() => key),
      accessor: string[] = [];
    Object.defineProperty(accessor, "0", { get: read });
    errorCode(() => index.values(accessor), "KEY");
    expect(read).not.toHaveBeenCalled();
  });

  it("round trips canonical selections through actual filtering and state restoration", () => {
    for (const [type, source] of [
      ["text", ["ALPHA", "alpha", "Beta"]],
      ["number", [0, -0, "bad", 2]],
      ["bigint", ["9007199254740993", 9007199254740994n, "bad"]],
      ["date", [new Date("2026-01-02"), "2026-01-03", "bad"]],
    ] as const) {
      const model = grid([...source], { type });
      const index = createSetFilterIndex(model, "value"),
        first = index.entries[0]!;
      model.setFilter("value", {
        op: "in",
        value: [...index.values([first.key])],
      });
      const expected = model.getFilteredRows().map((row) => row.id),
        saved = model.getState();
      model.setFilter("value");
      model.setState(saved);
      expect(model.getFilteredRows().map((row) => row.id)).toEqual(expected);
      expect(expected).toHaveLength(first.count);
      model.setFilter("value", { op: "in", value: [] });
      expect(model.getFilteredRows()).toHaveLength(0);
    }
  });

  it("rebuilds against edits, undo, transactions, getter cache expiry and unchanged raw rows", () => {
    let factor = 1;
    const getter = vi.fn((row: Row) => Number(row.value) * factor);
    const model = grid([2, 3], { valueGetter: getter }, { valueCache: true });
    expect(
      createSetFilterIndex(model, "value").entries.map((entry) => entry.value),
    ).toEqual([2, 3]);
    factor = 10;
    expect(
      createSetFilterIndex(model, "value").entries.map((entry) => entry.value),
    ).toEqual([2, 3]);
    expect(getter).toHaveBeenCalledTimes(2);
    model.expireValueCache();
    expect(
      createSetFilterIndex(model, "value").entries.map((entry) => entry.value),
    ).toEqual([20, 30]);
    const editable = grid([1, 2], { type: "number" });
    expect(editable.editCell("0", "value", 5)).toBeUndefined();
    expect(createSetFilterIndex(editable, "value").entries[0]!.value).toBe(5);
    editable.undo();
    expect(createSetFilterIndex(editable, "value").entries[0]!.value).toBe(1);
    editable.applyTransaction({ add: [{ id: "new", value: 7 }] });
    expect(createSetFilterIndex(editable, "value").rowCount).toBe(3);
    editable.setRows([{ id: "replacement", value: 9 }]);
    expect(
      createSetFilterIndex(editable, "value").entries.map(
        (entry) => entry.value,
      ),
    ).toEqual([9]);
  });

  it("handles prototype-like IDs and labels without object-map collisions", () => {
    const model = createGrid({
      rows: [
        { id: "a", value: "__proto__" },
        { id: "b", value: "constructor" },
      ],
      columns: [{ id: "__proto__", field: "value" }],
      getRowId: (row) => row.id,
    });
    const index = createSetFilterIndex(model, "__proto__");
    expect(index.values(index.entries.map((entry) => entry.key))).toEqual([
      "__proto__",
      "constructor",
    ]);
    model.setFilter("__proto__", {
      op: "in",
      value: [...index.values([index.entries[0]!.key])],
    });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["a"]);
  });

  it("validates hard limits and row count before invoking source getters", () => {
    const getter = vi.fn(() => 1),
      model = grid([1, 2], { valueGetter: getter });
    for (const limits of [
      { maxRows: 0 },
      { maxRows: 100001 },
      { maxValues: 10001 },
      { maxValueLength: NaN },
      { maxTextLength: 0 },
      { maxLabelLength: 1.5 },
    ])
      errorCode(() => createSetFilterIndex(model, "value", limits), "LIMIT");
    errorCode(
      () => createSetFilterIndex(model, "value", { maxRows: 1 }),
      "LIMIT",
    );
    expect(getter).not.toHaveBeenCalled();
    errorCode(
      () => createSetFilterIndex(grid([1, 2]), "value", { maxValues: 1 }),
      "LIMIT",
    );
    errorCode(
      () =>
        createSetFilterIndex(grid(["long"]), "value", { maxValueLength: 2 }),
      "LIMIT",
    );
    errorCode(
      () =>
        createSetFilterIndex(
          grid([1], { valueFormatter: () => "long" }),
          "value",
          { maxLabelLength: 2 },
        ),
      "LIMIT",
    );
    errorCode(
      () => createSetFilterIndex(grid(["abc"]), "value", { maxTextLength: 4 }),
      "LIMIT",
    );
    expect(
      createSetFilterIndex(grid([null]), "value", { maxValueLength: 1 })
        .entries[0]!.blank,
    ).toBe(true);
  });

  it("rejects unsupported sources and columns without publishing a partial index", () => {
    for (const value of [{}, [], Symbol("x"), () => 1, new Date()])
      errorCode(
        () => createSetFilterIndex(grid([1, value]), "value"),
        "UNSUPPORTED",
      );
    errorCode(() => createSetFilterIndex(grid([1]), "missing"), "COLUMN");
    errorCode(
      () => createSetFilterIndex(grid([1], { filterable: false }), "value"),
      "COLUMN",
    );
    errorCode(
      () =>
        createSetFilterIndex(
          grid([1], {
            valueFormatter: (() => 42) as unknown as (
              value: unknown,
              row: Row,
            ) => string,
          }),
          "value",
        ),
      "FORMAT",
    );
  });

  it("preserves application callback errors and rejects a reentrant state-changing snapshot", () => {
    const failure = new Error("application getter failed");
    expect(() =>
      createSetFilterIndex(
        grid([1], {
          valueGetter: () => {
            throw failure;
          },
        }),
        "value",
      ),
    ).toThrow(failure);
    expect(() =>
      createSetFilterIndex(
        grid([1], {
          valueFormatter: () => {
            throw failure;
          },
        }),
        "value",
      ),
    ).toThrow(failure);
    let model: GridModel<Row>;
    model = grid([1], {
      valueFormatter: () => {
        model.selectRows(["0"]);
        return "one";
      },
    });
    errorCode(() => createSetFilterIndex(model, "value"), "STALE");
  });
});
