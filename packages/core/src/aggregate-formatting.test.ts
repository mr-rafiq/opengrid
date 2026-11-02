import { describe, expect, it, vi } from "vitest";
import { createGrid, formatAggregateValue } from "./index.js";
import type { AggregateFormatContext, Column, RowNode } from "./types.js";
type Row = { id: string; team: string; amount: number; currency: string };
const rows: Row[] = [
  { id: "a", team: "North", amount: 1.25, currency: "USD" },
  { id: "b", team: "North", amount: 2.75, currency: "USD" },
  { id: "c", team: "South", amount: 100, currency: "USD" },
];
const group: RowNode<Row> = {
  id: "group-North",
  kind: "group",
  depth: 0,
  label: "North",
  leafCount: 2,
  aggregates: { amount: 4 },
};
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
describe("aggregate formatting", () => {
  it("supplies an immutable display context without fabricated source data", () => {
    const source = vi.fn((_value: unknown, row: Row) => row.currency);
    const formatter = vi.fn(
      (value: unknown, context: AggregateFormatContext) => {
        expect(Object.isFrozen(context)).toBe(true);
        expect(context).toEqual({
          columnId: "amount",
          rowId: "group-North",
          kind: "group",
          aggregate: "sum",
          groupLabel: "North",
          leafCount: 2,
        });
        expect("data" in context).toBe(false);
        return currency.format(Number(value));
      },
    );
    const column: Column<Row> = {
      id: "amount",
      aggregate: "sum",
      valueFormatter: source,
      aggregateFormatter: formatter,
    };
    expect(formatAggregateValue(column, 4, group)).toBe("$4.00");
    expect(source).not.toHaveBeenCalled();
    expect(group.aggregates!.amount).toBe(4);
  });
  it("preserves legacy raw display, blanks and exact BigInt digits without an opt-in formatter", () => {
    const column = { id: "amount" };
    for (const value of [null, undefined])
      expect(formatAggregateValue(column, value, group)).toBe("");
    expect(formatAggregateValue(column, 1.23456789, group)).toBe("1.23456789");
    expect(formatAggregateValue(column, 900719925474099312345n, group)).toBe(
      "900719925474099312345",
    );
  });
  it("rejects source-row use before invoking either callback", () => {
    const formatter = vi.fn(() => "bad");
    expect(() =>
      formatAggregateValue({ id: "amount", aggregateFormatter: formatter }, 1, {
        id: "a",
        kind: "row",
        data: rows[0],
        depth: 0,
      }),
    ).toThrow(/group or total/);
    expect(formatter).not.toHaveBeenCalled();
  });
  it("rejects invalid callback output explicitly", () => {
    const column: Column<Row> = {
      id: "amount",
      aggregateFormatter: (() => 123) as unknown as NonNullable<
        Column<Row>["aggregateFormatter"]
      >,
    };
    expect(() => formatAggregateValue(column, 4, group)).toThrow(
      /must return a string/,
    );
  });
  it("provides subtotal/grand-total metadata and the live aggregation operation", () => {
    const formatter = vi.fn(
      (value: unknown, context: AggregateFormatContext) =>
        context.aggregate === "count"
          ? String(value)
          : currency.format(Number(value)),
    );
    const column: Column<Row> = {
      id: "amount",
      aggregate: "count",
      aggregateFormatter: formatter,
    };
    expect(
      formatAggregateValue(column, 2, {
        ...group,
        kind: "total",
        total: "group",
      }),
    ).toBe("2");
    expect(formatter.mock.calls[0][1]).toMatchObject({
      kind: "total",
      total: "group",
      aggregate: "count",
    });
    column.aggregate = "avg";
    expect(
      formatAggregateValue(column, 2, {
        ...group,
        kind: "total",
        total: "grand",
      }),
    ).toBe("$2.00");
    expect(formatter.mock.calls[1][1]).toMatchObject({
      total: "grand",
      aggregate: "avg",
    });
  });
  it("retains custom aggregate identity and does not reinterpret its result", () => {
    const operation = () => ({ label: "custom" });
    const column: Column<Row> = {
      id: "amount",
      aggregate: operation,
      aggregateFormatter: (value, context) => {
        expect(context.aggregate).toBe(operation);
        return (value as { label: string }).label;
      },
    };
    expect(formatAggregateValue(column, operation(), group)).toBe("custom");
  });
  it("preserves formatter ownership through live definition changes and keeps numeric sorting", () => {
    const formatter = (value: unknown) => currency.format(Number(value));
    const grid = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        { id: "team", field: "team" },
        {
          id: "amount",
          field: "amount",
          aggregate: "sum",
          aggregateFormatter: formatter,
        },
      ],
      initialState: { groupBy: ["team"] },
    });
    grid.resizeColumn("amount", 220);
    grid.setSort("amount", "asc");
    expect(grid.getRowModel().map((node) => node.label)).toEqual([
      "North",
      "South",
    ]);
    expect(
      grid
        .getRowModel()
        .map((node) =>
          formatAggregateValue(
            grid.getColumns()[1],
            node.aggregates!.amount,
            node,
          ),
        ),
    ).toEqual(["$4.00", "$100.00"]);
    const definitions = grid.getColumnDefinitions();
    expect(definitions[1].aggregateFormatter).toBe(formatter);
    grid.setColumns(
      definitions.map((column) =>
        column.id === "amount" ? { ...column, aggregate: "avg" } : column,
      ),
    );
    expect(grid.getColumns()[1].width).toBe(220);
    expect(grid.getRowModel()[0].aggregates!.amount).toBe(2);
    expect(
      formatAggregateValue(grid.getColumns()[1], 2, grid.getRowModel()[0]),
    ).toBe("$2.00");
  });
  it("rejects malformed formatter definitions atomically", () => {
    const grid = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        {
          id: "amount",
          field: "amount",
          aggregateFormatter: (value) => String(value),
        },
      ],
    });
    const previous = grid.getColumnDefinitions();
    const changed = vi.fn();
    grid.subscribe(changed);
    expect(() =>
      grid.setColumns([
        {
          ...previous[0],
          aggregateFormatter: "invalid" as unknown as NonNullable<
            Column<Row>["aggregateFormatter"]
          >,
        },
      ]),
    ).toThrow(/must be a function/);
    expect(grid.getColumnDefinitions()).toEqual(previous);
    expect(changed).not.toHaveBeenCalled();
  });
});
