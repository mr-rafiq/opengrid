import { afterEach, expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import type { Ag31CellValueParams } from "./ag31-cell-values.js";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns.js";

class RecordRow {
  #tag = "original";
  constructor(
    public id = "a",
    public amount: unknown = 10,
  ) {}
  nested = { name: "old" };
  tag() {
    return this.#tag;
  }
}
const owners: ReturnType<typeof createAg31ClientController<RecordRow>>[] = [];
afterEach(() => {
  owners.splice(0).forEach((c) => c.api.destroy());
  vi.useRealTimers();
});
function setup(
  definition: Ag31ColumnDefinition<RecordRow> = {},
  readOnlyEdit = false,
) {
  vi.useFakeTimers();
  const row = new RecordRow(),
    log: string[] = [];
  const columnChanged = vi.fn((_event: unknown) => log.push("column"));
  const globalChanged = vi.fn((_event: unknown) => log.push("global"));
  const requested = vi.fn((_event: unknown) => {});
  const c = createAg31ClientController({
    rows: [row],
    getRowId: (r) => r.id,
    context: { tag: "borrowed" },
    definitions: [
      {
        field: "amount",
        editable: true,
        onCellValueChanged: columnChanged,
        ...definition,
      },
      { field: "nested.name" },
      { colId: "derived", valueGetter: () => "derived" },
    ],
    editing: { readOnlyEdit },
    callbacks: {
      onCellValueChanged: globalChanged,
      onCellEditRequest: requested,
    },
  });
  owners.push(c);
  const node = c.api.getRowNode("a")!;
  const rowChanged = vi.fn((_event: unknown) => log.push("row"));
  node.addEventListener("cellChanged", rowChanged);
  c.api.addEventListener("cellValueChanged", () => log.push("listener"));
  return {
    c,
    row,
    node,
    log,
    columnChanged,
    globalChanged,
    rowChanged,
    requested,
  };
}
it("writes original nested class objects, skips the editor parser and queues source callbacks in measured order", () => {
  const parser = vi.fn(() => 99),
    s = setup({ valueParser: parser });
  expect(s.node.setDataValue("amount", "20")).toBe(true);
  expect(s.row.amount).toBe("20");
  expect(s.log).toEqual(["row"]);
  expect(parser).not.toHaveBeenCalled();
  vi.runOnlyPendingTimers();
  expect(s.log).toEqual(["row", "column", "listener", "global"]);
  expect(s.globalChanged.mock.calls[0][0]).toMatchObject({
    type: "cellValueChanged",
    oldValue: 10,
    newValue: "20",
    value: "20",
    source: undefined,
  });
  expect(s.node.data).toBe(s.row);
  expect(s.row.tag()).toBe("original");
  const nested = s.row.nested;
  expect(s.node.setDataValue("nested.name", "next", "api")).toBe(true);
  expect(s.row.nested).toBe(nested);
  expect(nested.name).toBe("next");
});
it.each([undefined, false, true, 1, 0, null, "", Promise.resolve(false)])(
  "preserves submitted row notifications and setter result semantics (%s)",
  (result) => {
    let retained: Ag31CellValueParams<RecordRow> | undefined;
    const payload = { newValue: "typed", isBasisGroup: false };
    const s = setup({
      valueSetter: (p: Ag31CellValueParams<RecordRow>) => {
        retained = p;
        return result;
      },
    });
    const changed = result === undefined || Boolean(result);
    expect(s.node.setDataValue("amount", payload, "edit")).toBe(changed);
    expect(s.row.amount).toBe(10);
    expect(s.rowChanged.mock.calls[0][0]).toMatchObject({
      newValue: payload,
      oldValue: 10,
      node: s.node,
    });
    expect(retained?.newValue).toBe(changed ? 10 : payload);
    vi.runOnlyPendingTimers();
    expect(s.globalChanged).toHaveBeenCalledTimes(changed ? 1 : 0);
    expect(s.columnChanged).toHaveBeenCalledTimes(changed ? 1 : 0);
    if (changed) {
      expect(s.columnChanged.mock.calls[0][0]).toBe(retained);
      expect(s.globalChanged.mock.calls[0][0]).toMatchObject({
        value: 10,
        newValue: 10,
        oldValue: 10,
        source: "edit",
      });
    }
  },
);
it("borrows typed setter values and allows application acknowledgement without cloning class rows", async () => {
  let finish!: () => void;
  const payload = { newValue: "next", isBasisGroup: false };
  const s = setup({
    valueSetter: (p: Ag31CellValueParams<RecordRow>) => {
      const saved = { ...p };
      return new Promise((resolve) => {
        finish = () => {
          saved.data!.amount = saved.newValue;
          resolve(true);
        };
      });
    },
  });
  expect(s.node.setDataValue("amount", payload)).toBe(true);
  expect(s.row.amount).toBe(10);
  vi.runOnlyPendingTimers();
  finish();
  await Promise.resolve();
  s.c.api.refreshCells();
  expect(s.row.amount).toBe(payload);
  expect(s.node.data).toBe(s.row);
  expect(s.row.tag()).toBe("original");
  expect(s.globalChanged).toHaveBeenCalledTimes(1);
  expect(s.c.model.undo()).toBe(false);
});
it("emits read-only edit requests without invoking the setter or row mutation events", () => {
  const setter = vi.fn(() => true),
    s = setup({ valueSetter: setter }, true);
  expect(s.node.setDataValue("amount", "next")).toBe(false);
  expect(s.row.amount).toBe(10);
  expect(s.rowChanged).not.toHaveBeenCalled();
  expect(setter).not.toHaveBeenCalled();
  vi.runOnlyPendingTimers();
  expect(s.requested.mock.calls[0][0]).toMatchObject({
    type: "cellEditRequest",
    oldValue: 10,
    newValue: "next",
    node: s.node,
    data: s.row,
  });
  expect(s.globalChanged).not.toHaveBeenCalled();
  s.c.api.setGridOption("readOnlyEdit", false);
  expect(s.node.setDataValue("amount", "next")).toBe(true);
  expect(setter).toHaveBeenCalledTimes(1);
});
it("reports no-op and getter-only row changes, rejects missing columns and propagates source errors", () => {
  const s = setup();
  expect(s.node.setDataValue("amount", 10)).toBe(false);
  expect(s.node.setDataValue("derived", "next")).toBe(false);
  expect(s.rowChanged).toHaveBeenCalledTimes(2);
  expect(() => s.node.setDataValue("missing", 2)).toThrow(TypeError);
  const t = setup({
    valueSetter: () => {
      throw new Error("source rejection");
    },
  });
  expect(() => t.node.setDataValue("amount", 2)).toThrow("source rejection");
  expect(t.rowChanged).not.toHaveBeenCalled();
  vi.runOnlyPendingTimers();
  expect(s.globalChanged).not.toHaveBeenCalled();
  expect(t.globalChanged).not.toHaveBeenCalled();
});
it("revokes pending callbacks and stale source node writes on destroy", () => {
  const s = setup();
  s.node.setDataValue("amount", 20);
  s.c.api.destroy();
  vi.runOnlyPendingTimers();
  expect(s.columnChanged).not.toHaveBeenCalled();
  expect(s.globalChanged).not.toHaveBeenCalled();
  expect(s.node.setDataValue("amount", 30)).toBe(false);
  expect(s.row.amount).toBe(20);
});
it("allocates separate generated-group write data without mutating a leaf or allocating on a read-only request", () => {
  const row = new RecordRow(),
    setter = vi.fn((p: Ag31CellValueParams<RecordRow>) => {
      p.data!.amount = p.newValue;
      return true;
    });
  const c = createAg31ClientController({
    rows: [row],
    getRowId: (r) => r.id,
    readOnly: true,
    editing: { enableGroupEdit: true },
    definitions: [
      {
        colId: "family",
        valueGetter: () => "One",
        rowGroup: true,
        enableRowGroup: true,
      },
      {
        field: "amount",
        editable: true,
        valueGetter: (p: { data?: RecordRow }) => p.data?.amount,
        valueSetter: setter,
      },
    ],
  });
  owners.push(c);
  const group = c.api.getDisplayedRowAtIndex(0)!;
  expect(group.group).toBe(true);
  expect(group.data).toBeUndefined();
  c.api.setGridOption("readOnlyEdit", true);
  expect(group.setDataValue("amount", 30)).toBe(false);
  expect(group.data).toBeUndefined();
  expect(setter).not.toHaveBeenCalled();
  c.api.setGridOption("readOnlyEdit", false);
  expect(group.setDataValue("amount", 20)).toBe(true);
  expect(setter.mock.calls[0][0].oldValue).toBeUndefined();
  const generated = group.data;
  expect(generated).toEqual({ amount: 20 });
  expect(generated).not.toBe(row);
  expect(row.amount).toBe(10);
  c.api.applyColumnState({ state: [{ colId: "amount", width: 150 }] });
  expect(group.data).toBe(generated);
});
