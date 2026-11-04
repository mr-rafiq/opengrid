// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./data-grid";
import { buildGridPrintSnapshot } from "./print-view";
afterEach(cleanup);
class Title {
  constructor(private caption: string) {}
  label() {
    return this.caption;
  }
  toString(): string {
    throw new Error("Unexpected generated value coercion");
  }
}

it("renders and prints typed group-specific values with row-free formatting and real source callbacks", () => {
  const rows = [
    { id: "a", team: "West", rank: 1 },
    { id: "b", team: "East", rank: 2 },
  ];
  const source = vi.fn((value: unknown, row: (typeof rows)[number]) => {
    expect(rows.includes(row)).toBe(true);
    return `Item ${row.id}`;
  });
  const group = vi.fn(
    (node: { kind: string; groupValue?: unknown; data?: unknown }) => {
      expect(node.kind).toBe("group");
      expect(node.data).toBeUndefined();
      return new Title(`Business ${node.groupValue}`);
    },
  );
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      {
        id: "business",
        header: "Business",
        valueGetter: (row) => row.rank,
        valueFormatter: source,
        groupValueGetter: group,
        aggregateFormatter: (value, context) => {
          expect(context.kind).toBe("group");
          expect(Object.hasOwn(context, "row")).toBe(false);
          return (value as Title).label();
        },
        compare: (a, b) =>
          (a instanceof Title ? a.label() : String(a)).localeCompare(
            b instanceof Title ? b.label() : String(b),
          ),
      },
      { id: "team", field: "team" },
    ],
    initialState: { groupBy: ["team"], grandTotalRow: "bottom" },
  });
  const view = render(
    <DataGrid model={model} selectionMode="none" height={500} />,
  );
  const cells = () =>
    [
      ...view.container.querySelectorAll('[data-column-id="business"].og-cell'),
    ].map((cell) => cell.textContent);
  expect(cells()[0]).toContain("Business West");
  expect(cells()[1]).toContain("Business East");
  expect(source).not.toHaveBeenCalled();
  const snapshot = buildGridPrintSnapshot(model, { scope: "view" });
  expect(
    snapshot.rows
      .filter((row) => row.kind === "group")
      .map((row) => row.cells[0]),
  ).toEqual(["Business West (1)", "Business East (1)"]);
  expect(source).not.toHaveBeenCalled();
  act(() => model.setSort("business", "asc"));
  expect(cells()[0]).toContain("Business East");
  expect(cells()[1]).toContain("Business West");
  act(() => model.toggleExpanded(model.getRowModel()[0].id));
  expect(cells()).toContain("Item b");
  expect(source).toHaveBeenCalled();
  expect(group).toHaveBeenCalled();
});
