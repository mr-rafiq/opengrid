import { expect, it, vi } from "vitest";
import type { Column, ServerNode } from "@opengrid/core";
import { formatServerAggregate } from "./server-aggregate-formatting";
type Row = { amount: number };
const node: Extract<ServerNode<Row>, { kind: "group" }> = {
  kind: "group",
  id: "a",
  key: "A",
  label: "Team A",
  childCount: 8,
  aggregates: { amount: 1234.5 },
};
it("formats live provider operations with row-free route-qualified metadata", () => {
  const source = vi.fn(() => {
    throw Error("Source formatter must receive a real row");
  });
  const aggregate = vi.fn((value: unknown, context: { aggregate?: unknown }) =>
    context.aggregate === "count"
      ? String(value)
      : `USD ${Number(value).toFixed(2)}`,
  );
  const column: Column<Row> = {
    id: "amount",
    field: "amount",
    aggregate: "sum",
    valueFormatter: source,
    aggregateFormatter: aggregate,
  };
  expect(
    formatServerAggregate(
      column,
      1234.5,
      node,
      { valueColumns: [{ columnId: "amount", aggregate: "avg" }] },
      "route/A/a",
      2,
    ),
  ).toBe("USD 1234.50");
  const context = aggregate.mock.lastCall![1];
  expect(context).toMatchObject({
    kind: "group",
    rowId: "route/A/a",
    groupLabel: "Team A",
    aggregate: "avg",
  });
  expect(Object.isFrozen(context)).toBe(true);
  expect(context).not.toHaveProperty("row");
  expect(context).not.toHaveProperty("leafCount");
  expect(
    formatServerAggregate(
      column,
      8,
      { ...node, aggregates: { amount: 8 } },
      { valueColumns: [{ columnId: "amount", aggregate: "count" }] },
    ),
  ).toBe("8");
  expect(source).not.toHaveBeenCalled();
});
it("leaves absent aggregate slots blank and retains exact raw BigInt text by default", () => {
  const formatter = vi.fn(() => "unexpected");
  expect(
    formatServerAggregate(
      { id: "amount", aggregateFormatter: formatter },
      undefined,
      { ...node, aggregates: {} },
      { valueColumns: [] },
    ),
  ).toBe("");
  expect(formatter).not.toHaveBeenCalled();
  expect(
    formatServerAggregate(
      { id: "amount" },
      900719925474099312345n,
      { ...node, aggregates: { amount: 900719925474099312345n } },
      { valueColumns: [] },
    ),
  ).toBe("900719925474099312345");
});
it("does not mislabel an opaque provider operation as a source sum", () => {
  const formatter = vi.fn(
    (_value: unknown, _context: { aggregate?: unknown }) => "formatted",
  );
  formatServerAggregate(
    { id: "amount", aggregate: "sum", aggregateFormatter: formatter },
    1,
    node,
    { valueColumns: [{ columnId: "amount", aggregate: "median" }] },
  );
  expect(formatter.mock.lastCall![1].aggregate).toBeUndefined();
});
