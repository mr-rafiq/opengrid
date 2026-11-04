import { describe, expect, it, vi } from "vitest";
import {
  createGrid,
  createCellRangeModel,
  createRowEditSession,
  type Column,
} from "./index.js";
interface Row {
  id: string;
  item: { quantity: number; rate: number };
  locked?: boolean;
}
const definitions = (): Column<Row>[] => [
  {
    id: "quantity",
    field: "item",
    type: "number",
    editable: (row) => !row.locked,
    valueGetter: (row) => row.item.quantity,
    valueSetter: (value, row) => {
      row.item.quantity = Number(value);
      return row;
    },
    validate: (value) =>
      Number(value) < 0 ? "Quantity must be positive" : undefined,
  },
  {
    id: "rate",
    field: "item",
    type: "number",
    editable: true,
    valueGetter: (row) => row.item.rate,
    valueSetter: (value, row) => {
      row.item.rate = Number(value);
      return row;
    },
  },
];
const setup = (rows: Row[] = [{ id: "a", item: { quantity: 2, rate: 10 } }]) =>
  createGrid({
    rows,
    columns: definitions(),
    getRowId: (row) => row.id,
    valueCache: true,
  });
describe("owned custom value setters", () => {
  it("edits a cached getter-backed field without mutating source data and undoes the whole row", () => {
    const source = Object.freeze({
        id: "a",
        item: Object.freeze({ quantity: 2, rate: 10 }),
      }),
      grid = setup([source]);
    expect(grid.getValue(grid.getRow("a")!, "quantity")).toBe(2);
    expect(grid.editCell("a", "quantity", "7")).toBeUndefined();
    expect(source.item.quantity).toBe(2);
    expect(grid.getValue(grid.getRow("a")!, "quantity")).toBe(7);
    expect(grid.undo()).toBe(true);
    expect(grid.getRow("a")!.item.quantity).toBe(2);
    expect(grid.redo()).toBe(true);
    expect(grid.getRow("a")!.item.quantity).toBe(7);
  });
  it("rolls back nested candidate mutations on validation failure across a multi-row paste", () => {
    const sources = [
        { id: "a", item: { quantity: 2, rate: 10 } },
        { id: "b", item: { quantity: 3, rate: 20 } },
      ],
      grid = setup(sources),
      range = createCellRangeModel(grid);
    range.setRange({ rowId: "a", columnId: "quantity" });
    expect(range.paste("8\t40\n-1\t50")).toBe("Quantity must be positive");
    expect(grid.getRows()).toEqual(sources);
    expect(sources.map((row) => row.item.quantity)).toEqual([2, 3]);
    expect(grid.undo()).toBe(false);
    range.dispose();
  });
  it("keeps two custom fields with one backing object independent in row drafts and validates the final candidate", () => {
    const grid = setup(),
      validate = vi.fn((value: unknown, row: Row) =>
        Number(value) * row.item.rate > 100 ? "Limit" : undefined,
      );
    grid.setColumns(
      definitions().map((column) =>
        column.id === "quantity" ? { ...column, validate } : column,
      ),
    );
    const session = createRowEditSession(grid, "a");
    expect(session.getSnapshot().values).toEqual({ quantity: 2, rate: 10 });
    session.setValue("quantity", "4");
    expect(session.getSnapshot().values.rate).toBe(10);
    session.setValue("rate", "30");
    expect(session.commit()).toBe("Limit");
    expect(grid.getRow("a")!.item).toEqual({ quantity: 2, rate: 10 });
    session.setValue("rate", "20");
    expect(session.commit()).toBeUndefined();
    expect(grid.getRow("a")!.item).toEqual({ quantity: 4, rate: 20 });
    expect(validate.mock.lastCall?.[0]).toBe(4);
    expect(grid.undo()).toBe(true);
    expect(grid.getRow("a")!.item).toEqual({ quantity: 2, rate: 10 });
  });
  it("preserves public-data prototypes and cycles in owned drafts", () => {
    class Item {
      constructor(public quantity: number) {}
      amount() {
        return this.quantity * 2;
      }
    }
    type Cyclic = {
      id: string;
      item: Item;
      self?: Cyclic;
      tags: Map<string, Set<number>>;
      date: Date;
    };
    const source: Cyclic = {
      id: "a",
      item: new Item(2),
      tags: new Map([["a", new Set([1])]]),
      date: new Date("2020-01-01"),
    };
    source.self = source;
    const grid = createGrid({
      rows: [source],
      getRowId: (row) => row.id,
      columns: [
        {
          id: "amount",
          field: "item",
          editable: true,
          valueGetter: (row) => row.item.amount(),
          valueSetter: (value, row) => {
            expect(row.self).toBe(row);
            row.item.quantity = Number(value);
            row.tags.get("a")!.add(2);
            row.date.setUTCFullYear(2030);
            return row;
          },
        },
      ],
    });
    expect(grid.editCell("a", "amount", 4)).toBeUndefined();
    expect(grid.getValue(grid.getRow("a")!, "amount")).toBe(8);
    expect(source.item.amount()).toBe(4);
    expect(source.tags.get("a")!.size).toBe(1);
    expect(source.date.getUTCFullYear()).toBe(2020);
    expect(grid.undo()).toBe(true);
    expect(grid.getRow("a")).toBe(source);
  });
  it("rejects identity changes and unsupported async results without adding history", () => {
    const grid = setup();
    grid.setColumns([
      {
        ...definitions()[0],
        valueSetter: (_value, row) => ({ ...row, id: "changed" }),
      },
    ]);
    expect(grid.editCell("a", "quantity", 4)).toMatch(/row ID/);
    grid.setColumns([
      {
        ...definitions()[0],
        valueSetter: (_value, row) => Promise.resolve(row) as unknown as Row,
      },
    ]);
    expect(grid.editCell("a", "quantity", 4)).toMatch(/Async value setters/);
    expect(grid.getRow("a")!.item.quantity).toBe(2);
    expect(grid.undo()).toBe(false);
  });
  it("does not overwrite source rows replaced during a setter callback", () => {
    const grid = setup();
    grid.setColumns([
      {
        ...definitions()[0],
        valueSetter: (value, row) => {
          grid.setRows([{ id: "a", item: { quantity: 99, rate: 10 } }]);
          row.item.quantity = Number(value);
          return row;
        },
      },
    ]);
    expect(grid.editCell("a", "quantity", 4)).toBe(
      "Row data changed during editing",
    );
    expect(grid.getRow("a")!.item.quantity).toBe(99);
    expect(grid.undo()).toBe(false);
  });
  it("does not evaluate own data accessors while copying an edit draft", () => {
    const source = { id: "a", item: { quantity: 2, rate: 10 } },
      getter = vi.fn(() => 3);
    Object.defineProperty(source.item, "unexpected", {
      get: getter,
      enumerable: true,
    });
    const grid = setup([source]);
    expect(grid.editCell("a", "quantity", 4)).toMatch(/data accessors/);
    expect(getter).not.toHaveBeenCalled();
    expect(source.item.quantity).toBe(2);
    expect(grid.undo()).toBe(false);
  });
  it("does not evaluate a toStringTag accessor and rejects oversized primitive graphs", () => {
    const source = { id: "a", item: { quantity: 2, rate: 10 } },
      getter = vi.fn(() => "Object");
    Object.defineProperty(source.item, Symbol.toStringTag, { get: getter });
    const grid = setup([source]);
    expect(grid.editCell("a", "quantity", 4)).toMatch(/data accessors/);
    expect(getter).not.toHaveBeenCalled();
    const large = {
      id: "a",
      item: { quantity: 2, rate: 10 },
      values: Array.from({ length: 100001 }, () => 1),
    };
    grid.setRows([large]);
    expect(grid.editCell("a", "quantity", 4)).toMatch(/copy budget/);
    expect(large.item.quantity).toBe(2);
    expect(grid.undo()).toBe(false);
  });
});
