import { expect, it } from "vitest";
import { createGrid, type Column } from "./index.js";
type Row = { id: string; value: number };
const columns: Column<Row>[] = [
  { id: "a", field: "value" },
  {
    id: "tree",
    field: "id",
    lockPosition: "left",
    lockPinned: true,
    lockVisible: true,
    pinned: "left",
    columnsPanel: false,
  },
  { id: "b", field: "value" },
  { id: "total", field: "value", lockPosition: "right" },
];
const setup = () =>
  createGrid({
    rows: [{ id: "one", value: 2 }],
    columns,
    getRowId: (row) => row.id,
  });
it("enforces declaration locks against commands and restored layout state", () => {
  const model = setup();
  expect(model.getState().columnOrder).toEqual(["tree", "a", "b", "total"]);
  model.hideColumn("tree", true);
  model.pinColumn("tree", "right");
  model.moveColumn("tree", 3);
  model.moveColumn("a", 0);
  expect(model.getColumns().find((c) => c.id === "tree")).toMatchObject({
    hidden: false,
    pinned: "left",
  });
  model.setState({
    columnOrder: ["total", "b", "a", "tree"],
    columnVisibility: { tree: false },
    columnPinning: { tree: null },
  });
  expect(model.getState().columnOrder).toEqual(["tree", "b", "a", "total"]);
  expect(model.getColumns().find((c) => c.id === "tree")).toMatchObject({
    hidden: false,
    pinned: "left",
  });
  model.hideColumn("a", true);
  expect(model.getColumns().find((c) => c.id === "a")!.hidden).toBe(true);
});
it("uses a new definition's lock baseline while retaining unlocked overrides", () => {
  const model = setup();
  model.resizeColumn("tree", 240);
  model.setColumns(
    columns.map((c) =>
      c.id === "tree" ? { ...c, pinned: "right", hidden: true } : c,
    ),
  );
  expect(model.getColumns().find((c) => c.id === "tree")).toMatchObject({
    pinned: "right",
    hidden: true,
    width: 240,
  });
  model.setColumns(
    columns.map((c) =>
      c.id === "tree" ? { ...c, lockPinned: false, lockVisible: false } : c,
    ),
  );
  model.hideColumn("tree", false);
  model.pinColumn("tree", null);
  expect(model.getColumns().find((c) => c.id === "tree")).toMatchObject({
    pinned: null,
    hidden: false,
  });
});
it("rejects malformed locks or setters atomically", () => {
  const model = setup(),
    revision = model.getColumnRevision();
  for (const invalid of [
    { lockPosition: "start" },
    { lockVisible: 1 },
    { pinned: "none" },
    { valueSetter: () => ({ id: "one", value: 1 }), field: undefined },
  ]) {
    expect(() =>
      model.setColumns([{ ...columns[0], ...invalid } as Column<Row>]),
    ).toThrow();
    expect(model.getColumnRevision()).toBe(revision);
  }
});
