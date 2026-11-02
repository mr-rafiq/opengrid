// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "./data-grid";
import { buildGridPrintSnapshot } from "./print-view";
afterEach(cleanup);
type Row = { id: string; team: string; amount: number; currency: string };
const rows: Row[] = [
  { id: "a", team: "North", amount: 1.25, currency: "USD" },
  { id: "b", team: "North", amount: 2.75, currency: "USD" },
  { id: "c", team: "South", amount: 100, currency: "USD" },
];
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const source = vi.fn((value: unknown, row: Row) => {
  expect(rows.some((item) => item.id === row.id)).toBe(true);
  return `${row.currency} ${value}`;
});
function make(firstValue = false) {
  const value: Column<Row> = {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    aggregate: "sum",
    valueFormatter: source,
    aggregateFormatter: (value, context) =>
      context.aggregate === "count"
        ? `Count ${value}`
        : money.format(Number(value)),
  };
  const team: Column<Row> = { id: "team", field: "team", header: "Team" };
  return createGrid({
    rows,
    columns: firstValue ? [value, team] : [team, value],
    getRowId: (row) => row.id,
    initialState: {
      groupBy: ["team"],
      groupTotalRow: "bottom",
      grandTotalRow: "bottom",
    },
  });
}
const values = (container: HTMLElement) =>
  [...container.querySelectorAll('.og-cell[data-column-id="amount"]')].map(
    (cell) => cell.textContent,
  );
describe("aggregate display in grids and print snapshots", () => {
  it("formats groups, subtotals and grand totals while source callbacks receive real rows", () => {
    source.mockClear();
    const model = make();
    const view = render(<DataGrid model={model} height={600} />);
    expect(values(view.container)).toEqual(["$4.00", "$100.00", "$104.00"]);
    expect(source).not.toHaveBeenCalled();
    act(() => model.toggleExpanded(model.getRowModel()[0].id));
    expect(values(view.container)).toEqual([
      "$4.00",
      "USD 1.25",
      "USD 2.75",
      "$4.00",
      "$100.00",
      "$104.00",
    ]);
    expect(source).toHaveBeenCalled();
    expect(model.getRowModel()[0].aggregates!.amount).toBe(4);
    act(() => model.editCell("a", "amount", 5));
    expect(values(view.container)).toContain("$7.75");
    expect(values(view.container)).toContain("$107.75");
    act(() => model.undo());
    expect(values(view.container)).toContain("$104.00");
  });
  it("replaces live aggregate/formatter definitions without leaking currency into counts", () => {
    const model = make();
    const view = render(<DataGrid model={model} height={600} />);
    act(() =>
      model.setColumns(
        model
          .getColumnDefinitions()
          .map((column) =>
            column.id === "amount" ? { ...column, aggregate: "count" } : column,
          ),
      ),
    );
    expect(values(view.container)).toEqual(["Count 2", "Count 1", "Count 3"]);
    act(() =>
      model.setColumns(
        model.getColumnDefinitions().map((column) =>
          column.id === "amount"
            ? {
                ...column,
                aggregate: "avg",
                aggregateFormatter: (value) =>
                  `Average ${Number(value).toFixed(2)}`,
              }
            : column,
        ),
      ),
    );
    expect(values(view.container)).toEqual([
      "Average 2.00",
      "Average 100.00",
      "Average 34.67",
    ]);
    expect(model.getRowModel().at(-1)!.aggregates!.amount).toBeCloseTo(104 / 3);
  });
  it("keeps BigInt aggregates exact through locale display", () => {
    const model = createGrid({
      rows: [
        { id: "a", team: "A", value: 9007199254740993n },
        { id: "b", team: "A", value: 9007199254740994n },
      ],
      getRowId: (row) => row.id,
      columns: [
        { id: "team", field: "team" },
        {
          id: "value",
          field: "value",
          type: "bigint",
          aggregate: "sum",
          aggregateFormatter: (value) =>
            new Intl.NumberFormat("de-DE").format(value as bigint),
        },
      ],
      initialState: { groupBy: ["team"] },
    });
    render(<DataGrid model={model} />);
    expect(screen.getByText("18.014.398.509.481.987")).toBeTruthy();
    expect(model.getRowModel()[0].aggregates!.value).toBe(18014398509481987n);
  });
  it("captures formatted first-column totals once and freezes the displayed snapshot", () => {
    source.mockClear();
    const model = make(true);
    const formatted = vi.fn((value: unknown) => money.format(Number(value)));
    model.setColumns(
      model
        .getColumnDefinitions()
        .map((column) =>
          column.id === "amount"
            ? { ...column, aggregateFormatter: formatted }
            : column,
        ),
    );
    model.setState({
      expanded: model
        .getRowModel()
        .filter((node) => node.kind === "group")
        .map((node) => node.id),
    });
    const snapshot = buildGridPrintSnapshot(model, { scope: "view" });
    expect(
      snapshot.rows
        .filter((row) => row.total === "group")
        .map((row) => row.totalValue),
    ).toEqual(["$4.00", "$100.00"]);
    expect(snapshot.rows.at(-1)!.totalValue).toBe("$104.00");
    expect(snapshot.rows.at(-1)!.cells[0]).toBe("Grand total: $104.00");
    expect(formatted).toHaveBeenCalledTimes(3);
    expect(source).toHaveBeenCalledTimes(3);
    model.editCell("a", "amount", 5);
    expect(snapshot.rows.at(-1)!.totalValue).toBe("$104.00");
    expect(
      buildGridPrintSnapshot(model, { scope: "view" }).rows.at(-1)!.totalValue,
    ).toBe("$107.75");
  });
  it("uses the same aggregate display for non-leading print cells without calling source formatters", () => {
    source.mockClear();
    const snapshot = buildGridPrintSnapshot(make(), { scope: "view" });
    expect(snapshot.rows.map((row) => row.cells[1])).toEqual([
      "$4.00",
      "$100.00",
      "$104.00",
    ]);
    expect(source).not.toHaveBeenCalled();
  });
});
