import { describe, expect, it, vi } from "vitest";
import { createGrid, type Column } from "./index";
type Row = { id: string; team: string; rank: number };
const rows: Row[] = [
  { id: "a", team: "A", rank: 1 },
  { id: "b", team: "A", rank: 10 },
  { id: "c", team: "B", rank: 5 },
];
const base: Column<Row> = { id: "team", field: "team" };

describe("generated group values", () => {
  it("sorts groups by a nongroup column without inventing a source row or an aggregate", () => {
    const values = vi.fn(
      (node: Parameters<NonNullable<Column<Row>["groupValueGetter"]>>[0]) => {
        expect(node.kind).toBe("group");
        expect(node.data).toBeUndefined();
        return Math.min(...node.children!.map((child) => child.data!.rank));
      },
    );
    const model = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        base,
        {
          id: "business",
          type: "number",
          valueGetter: (row) => row.rank,
          groupValueGetter: values,
        },
        { id: "rank", field: "rank", type: "number" },
      ],
      initialState: { groupBy: ["team"] },
    });
    model.setSort("business", "desc");
    expect(model.getRowModel().map((node) => node.groupValue)).toEqual([
      "B",
      "A",
    ]);
    expect(
      model
        .getRowModel()
        .every((node) => !Object.hasOwn(node.aggregates ?? {}, "business")),
    ).toBe(true);
    model.setSort("business", "asc");
    expect(model.getRowModel().map((node) => node.groupValue)).toEqual([
      "A",
      "B",
    ]);
    model.setFilter("rank", { op: "gt", value: 1 });
    expect(model.getRowModel().map((node) => node.groupValue)).toEqual([
      "B",
      "A",
    ]);
    expect(values).toHaveBeenCalled();
    expect(model.getRows()[0]).toBe(rows[0]);
  });

  it("lets an explicit comparator sort undefined group/leaf values using real node and row metadata", () => {
    const input = [
      { id: "a", team: "A", rank: 2 },
      { id: "b", team: "B", rank: 1 },
    ];
    const compare: NonNullable<Column<Row>["compare"]> = (a, b, context) => {
      expect(a).toBeUndefined();
      expect(b).toBeUndefined();
      return (
        (context.nodeA?.children?.[0].data?.rank ?? context.rowA!.rank) -
        (context.nodeB?.children?.[0].data?.rank ?? context.rowB!.rank)
      );
    };
    const business: Column<Row> = {
      id: "business",
      valueGetter: () => undefined,
      groupValueGetter: () => undefined,
      compare,
    };
    const model = createGrid({
      rows: input,
      getRowId: (row) => row.id,
      columns: [base, business],
      initialState: { groupBy: ["team"] },
    });
    model.setSort("business", "asc");
    expect(model.getRowModel().map((node) => node.groupValue)).toEqual([
      "A",
      "B",
    ]);
    model.setColumns([base, { ...business, compareBlankValues: true }]);
    expect(model.getRowModel().map((node) => node.groupValue)).toEqual([
      "B",
      "A",
    ]);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b", "a"]);
    model.setSort("business", "desc");
    expect(model.getRowModel().map((node) => node.groupValue)).toEqual([
      "A",
      "B",
    ]);
  });

  it("retains default blank-last sorting and permits explicit custom blank ordering", () => {
    const input = [
      { id: "blank", value: null },
      { id: "value", value: 2 },
    ];
    const compare = vi.fn((a: unknown, b: unknown) =>
      a == null ? (b == null ? 0 : -1) : b == null ? 1 : Number(a) - Number(b),
    );
    const definition = {
      id: "value",
      field: "value" as const,
      type: "number" as const,
      compare,
    };
    const model = createGrid({
      rows: input,
      getRowId: (row) => row.id,
      columns: [definition],
    });
    model.setSort("value", "asc");
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "value",
      "blank",
    ]);
    expect(compare).not.toHaveBeenCalled();
    model.setColumns([{ ...definition, compareBlankValues: true }]);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "blank",
      "value",
    ]);
    expect(compare).toHaveBeenCalled();
    model.setSort("value", "desc");
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "value",
      "blank",
    ]);
  });

  it("does not invoke generated-value callbacks during source hierarchy/filter projection", () => {
    const getter = vi.fn(() => 1),
      model = createGrid({
        rows,
        getRowId: (row) => row.id,
        columns: [
          base,
          {
            id: "business",
            valueGetter: (row) => row.rank,
            groupValueGetter: getter,
          },
        ],
        initialState: { groupBy: ["team"] },
      });
    model.getRowHierarchy!("source");
    model.getRowHierarchy!("filtered");
    model.getFilteredRows();
    model.getRowModel();
    expect(getter).not.toHaveBeenCalled();
    model.setSort("business", "asc");
    expect(getter).toHaveBeenCalled();
  });

  it("rolls back a sort when a generated-value callback fails", () => {
    const model = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        base,
        {
          id: "business",
          valueGetter: (row) => row.rank,
          groupValueGetter: () => {
            throw new Error("Business value unavailable");
          },
        },
      ],
      initialState: { groupBy: ["team"] },
    });
    const state = model.getState(),
      before = model.getRowModel(),
      listener = vi.fn();
    model.subscribe(listener);
    expect(() => model.setSort("business", "asc")).toThrow(
      "Business value unavailable",
    );
    expect(model.getState()).toEqual(state);
    expect(model.getRowModel()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects invalid callback and blank-order policies before a schema change", () => {
    const model = createGrid({
        rows,
        getRowId: (row) => row.id,
        columns: [base],
      }),
      revision = model.getColumnRevision();
    expect(() =>
      model.setColumns([{ ...base, groupValueGetter: false as never }]),
    ).toThrow("groupValueGetter must be a function");
    expect(() =>
      model.setColumns([{ ...base, compareBlankValues: "yes" as never }]),
    ).toThrow("compareBlankValues must be a boolean");
    expect(model.getColumnRevision()).toBe(revision);
  });
});
