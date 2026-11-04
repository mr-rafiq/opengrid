import { describe, expect, it } from "vitest";
import {
  createGrid,
  createCellRangeModel,
  createRowEditSession,
} from "./index.js";

interface RecordRow {
  id: string;
  kind: "item" | "summary";
  amount: number;
  locked: boolean;
}
const setup = () =>
  createGrid<RecordRow>({
    getRowId: (row) => row.id,
    rows: [
      { id: "item", kind: "item", amount: 10, locked: false },
      { id: "summary", kind: "summary", amount: 20, locked: false },
    ],
    columns: [
      {
        id: "amount",
        field: "amount",
        type: "number",
        editable: (row) => row.kind === "item" && !row.locked,
      },
    ],
  });
describe("row-aware editing policy", () => {
  it("evaluates editability for the actual target and keeps rejected writes out of history", () => {
    const grid = setup();
    expect(grid.editCell("summary", "amount", 90)).toBe("Cell is read only");
    expect(grid.getRow("summary")!.amount).toBe(20);
    expect(grid.undo()).toBe(false);
    expect(grid.editCell("item", "amount", "25")).toBeUndefined();
    expect(grid.getRow("item")!.amount).toBe(25);
    expect(grid.undo()).toBe(true);
    expect(grid.getRow("item")!.amount).toBe(10);
  });
  it("rejects the complete mixed-row batch and range paste without partial edits", () => {
    const grid = setup(),
      ranges = createCellRangeModel(grid);
    expect(
      grid.batchEdit([
        { rowId: "item", columnId: "amount", value: 1 },
        { rowId: "summary", columnId: "amount", value: 2 },
      ]),
    ).toBe("Cell is read only");
    ranges.setRange({ rowId: "item", columnId: "amount" });
    expect(ranges.paste("30\n40")).toMatch(/read only/);
    expect(grid.getRows().map((row) => row.amount)).toEqual([10, 20]);
    expect(grid.undo()).toBe(false);
    ranges.dispose();
  });
  it("offers row drafts only for eligible fields and rechecks a changed row before commit", () => {
    const grid = setup(),
      denied = createRowEditSession(grid, "summary");
    expect(denied.getSnapshot().values).toEqual({});
    expect(denied.setValue("amount", 7)).toMatch(/read only/);
    const session = createRowEditSession(grid, "item");
    session.setValue("amount", 7);
    grid.applyTransaction({
      update: [{ ...grid.getRow("item")!, locked: true }],
    });
    expect(session.commit()).toMatch(/read only/);
    expect(grid.getRow("item")!.amount).toBe(10);
    expect(grid.undo()).toBe(false);
  });
  it("fails closed for throwing predicates and non-boolean results", () => {
    const grid = setup();
    grid.setColumns([
      {
        id: "amount",
        field: "amount",
        editable: () => {
          throw new Error("policy unavailable");
        },
      },
    ]);
    expect(grid.editCell("item", "amount", 1)).toMatch(/read only/);
    grid.setColumns([
      {
        id: "amount",
        field: "amount",
        editable: (() => Promise.resolve(true)) as unknown as (
          row: RecordRow,
        ) => boolean,
      },
    ]);
    expect(grid.editCell("item", "amount", 2)).toMatch(/read only/);
    expect(grid.getRow("item")!.amount).toBe(10);
    expect(grid.undo()).toBe(false);
  });
});
