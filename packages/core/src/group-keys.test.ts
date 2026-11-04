import { describe, expect, it, vi } from "vitest";
import { createGrid, type Column } from "./index";

class Category {
  #key: string;
  #label: string;
  constructor(key: string, label: string) {
    this.#key = key;
    this.#label = label;
  }
  key() {
    return this.#key;
  }
  label() {
    return this.#label;
  }
  toString(): string {
    throw new Error("Unexpected category coercion");
  }
}
type Row = { id: string; category: Category; amount: number };
const column = (): Column<Row> => ({
  id: "category",
  field: "category",
  groupKeyGetter: (value, row) => {
    expect(value).toBe(row.category);
    return row.category.key();
  },
  valueFormatter: (value) => (value as Category).label(),
  compare: (a, b) => (a as Category).key().localeCompare((b as Category).key()),
});
const setup = () => {
  const first = new Category("x", "First"),
    second = new Category("x", "Second"),
    other = new Category("y", "Other");
  const rows = [
    { id: "a", category: first, amount: 1 },
    { id: "b", category: second, amount: 2 },
    { id: "c", category: other, amount: 3 },
  ];
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [column(), { id: "amount", field: "amount", type: "number" }],
    initialState: { groupBy: ["category"] },
  });
  return { model, rows, first, second, other };
};

describe("explicit grouping keys", () => {
  it("merges distinct class instances by key while preserving source values and a stable representative", () => {
    const { model, rows, first, second } = setup(),
      groups = model.getRowHierarchy!("source");
    expect(groups).toHaveLength(2);
    expect(groups[0].groupKey).toBe("x");
    expect(groups[0].groupValue).toBe(first);
    expect(groups[0].label).toBe("First");
    expect(groups[0].children!.map((node) => node.data)).toEqual(
      rows.slice(0, 2),
    );
    expect(groups[0].children![1].data).toBe(rows[1]);
    expect(model.getValue(rows[1], "category")).toBe(second);
    expect(Object.isFrozen(first)).toBe(false);
    model.setFilter("amount", { op: "gt", value: 1 });
    const filtered = model.getRowHierarchy!("sorted")[0];
    expect(filtered.id).toBe(groups[0].id);
    expect(filtered.groupValue).toBe(first);
    expect(filtered.label).toBe("First");
    expect(filtered.children!.map((node) => node.id)).toEqual(["b"]);
  });

  it("uses a key label without coercing an object when no formatter is provided", () => {
    const { rows } = setup(),
      definition = column();
    delete definition.valueFormatter;
    const model = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [definition],
      initialState: { groupBy: ["category"] },
    });
    expect(model.getRowModel().map((node) => node.label)).toEqual(["x", "y"]);
  });

  it("sorts leaf and group class values through the actual comparator without preliminary string conversion", () => {
    const { model, rows } = setup();
    model.setSort("category", "desc");
    expect(
      model.getRowHierarchy!("sorted").map((node) => node.groupKey),
    ).toEqual(["y", "x"]);
    expect(model.getFilteredRows()).toEqual([rows[2], rows[0], rows[1]]);
    model.setSort("category", "asc");
    expect(
      model.getRowHierarchy!("sorted").map((node) => node.groupKey),
    ).toEqual(["x", "y"]);
  });

  it("retains source grouping order and IDs through filtering, updates and row-history commands", () => {
    const { model, rows } = setup(),
      before = model.getRowHierarchy!("source");
    const replacement = { ...rows[0], category: new Category("x", "Updated") };
    model.applyTransaction({ update: [replacement] });
    const after = model.getRowHierarchy!("source");
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].groupValue).toBe(replacement.category);
    expect(before[0].groupValue).toBe(rows[0].category);
    model.setFilter("amount", { op: "gt", value: 1 });
    expect(
      model.getRowHierarchy!("sorted").map((node) => node.groupKey),
    ).toEqual(["x", "y"]);
    expect(model.undo()).toBe(false);
  });

  it("can normalize primitive types, blanks and special strings without changing raw values", () => {
    const rows = [
      { id: "a", value: 1 },
      { id: "b", value: "1" },
      { id: "c", value: null },
      { id: "d", value: "" },
      { id: "e", value: "__proto__" },
    ];
    const model = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        {
          id: "value",
          field: "value",
          groupKeyGetter: (value) => String(value ?? ""),
        },
      ],
      initialState: { groupBy: ["value"] },
    });
    const groups = model.getRowHierarchy!("source");
    expect(groups.map((node) => node.groupKey)).toEqual(["1", "", "__proto__"]);
    expect(groups[0].children!.map((node) => node.data!.value)).toEqual([
      1,
      "1",
    ]);
    expect(groups[1].children!.map((node) => node.data!.value)).toEqual([
      null,
      "",
    ]);
    expect(groups[1].label).toBe("(blank)");
    expect(groups[2].label).toBe("__proto__");
    expect(model.getValue(rows[0], "value")).toBe(1);
  });

  it("retains identity grouping by default when no key getter is configured", () => {
    const a = { name: "Same" },
      b = { name: "Same" };
    const model = createGrid({
      rows: [
        { id: "a", value: a },
        { id: "b", value: b },
      ],
      getRowId: (row) => row.id,
      columns: [{ id: "value", field: "value" }],
      initialState: { groupBy: ["value"] },
    });
    expect(model.getRowHierarchy!("source")).toHaveLength(2);
    expect(model.getValue(model.getRow("a")!, "value")).toBe(a);
  });

  it("rejects invalid callback definitions before replacing the schema", () => {
    const { model } = setup(),
      state = model.getState(),
      revision = model.getColumnRevision(),
      listener = vi.fn();
    model.subscribe(listener);
    expect(() =>
      model.setColumns([{ ...column(), groupKeyGetter: false as never }]),
    ).toThrow("groupKeyGetter must be a function");
    expect(() =>
      model.setColumns([{ ...column(), groupBlanksLast: "yes" as never }]),
    ).toThrow("groupBlanksLast must be a boolean");
    expect(model.getState()).toEqual(state);
    expect(model.getColumnRevision()).toBe(revision);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects nonstring or over-budget callback results explicitly", () => {
    for (const value of [1, null, {}, "x".repeat(4097)]) {
      const model = createGrid({
        rows: [{ id: "a", value: 1 }],
        getRowId: (row) => row.id,
        columns: [
          { id: "value", field: "value", groupKeyGetter: () => value as never },
        ],
        initialState: { groupBy: ["value"] },
      });
      expect(() => model.getRowHierarchy!()).toThrow(/Grouping key/);
    }
  });
});

it("can place blank group keys last as an explicit stable fallback without changing leaf order", () => {
  const rows = [
    { id: "a", outer: "", inner: "N" },
    { id: "b", outer: "X", inner: "" },
    { id: "c", outer: "X", inner: "N" },
    { id: "d", outer: "X", inner: "M" },
  ];
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: (["outer", "inner"] as const).map((id) => ({
      id,
      field: id,
      groupBlanksLast: true,
    })),
    initialState: { groupBy: ["outer", "inner"] },
  });
  for (const stage of ["source", "filtered", "sorted"] as const) {
    const forest = model.getRowHierarchy!(stage);
    expect(forest.map((n) => n.groupValue)).toEqual(["X", ""]);
    expect(forest[0].children!.map((n) => n.groupValue)).toEqual([
      "N",
      "M",
      "",
    ]);
  }
  expect(model.getRows()).toEqual(rows);
  model.setFilter("inner", { op: "notEqual", value: "N" });
  expect(
    model.getRowHierarchy!("sorted")[0].children!.map((n) => n.groupValue),
  ).toEqual(["M", ""]);
  model.setFilter("inner");
  model.setColumns(
    model.getColumns().map((c) => ({
      ...c,
      compareBlankValues: true,
      compare: (a, b) => (a === "" ? -1 : b === "" ? 1 : 0),
    })),
  );
  model.setSort("outer", "asc");
  expect(model.getRowHierarchy!("sorted").map((n) => n.groupValue)).toEqual([
    "",
    "X",
  ]);
  expect(model.getRowHierarchy!("source").map((n) => n.groupValue)).toEqual([
    "X",
    "",
  ]);
});
