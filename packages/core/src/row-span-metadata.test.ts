import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index.js";
import type { Column } from "./types.js";

type Item = { id: string; value: string };
const rows: Item[] = [
  { id: "a", value: "A" },
  { id: "b", value: "A" },
];
const create = (columns: Column<Item>[]) =>
  createGrid({ rows, columns, getRowId: (row) => row.id });

describe("row span presentation metadata", () => {
  it("retains static/custom definitions without evaluating predicates in the core pipeline", () => {
    const predicate = vi.fn(() => true),
      input: Column<Item>[] = [
        { id: "value", field: "value", spanRows: predicate },
      ],
      model = create(input);
    expect(model.getColumns()[0].spanRows).toBe(predicate);
    model.setSort("value", "asc");
    model.setFilter("value", { op: "equals", value: "A" });
    model.exportCsv();
    model.getRowModel();
    expect(predicate).not.toHaveBeenCalled();
    input[0].spanRows = false;
    model.getColumns()[0].spanRows = true;
    expect(model.getColumns()[0].spanRows).toBe(predicate);
    expect(model.getRows()).toEqual(rows);
  });
  it.each([true, false, undefined])(
    "accepts boolean/default metadata %s",
    (spanRows) => {
      expect(create([{ id: "value", spanRows }]).getColumns()[0].spanRows).toBe(
        spanRows,
      );
    },
  );
  it.each([0, 1, -1, "true", "false", null, {}, [], NaN])(
    "rejects malformed spanRows metadata %s",
    (spanRows) => {
      expect(() =>
        create([{ id: "value", spanRows } as unknown as Column<Item>]),
      ).toThrow("spanRows");
    },
  );
  it("leaves the explicit two-dimensional combination guard to the React adapter", () => {
    expect(
      create([{ id: "value", colSpan: 2, spanRows: true }]).getColumns()[0],
    ).toMatchObject({ colSpan: 2, spanRows: true });
  });
});
