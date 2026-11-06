import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import { createAg31CellFocus } from "./ag31-cell-focus.js";

it("preserves declared grouping before a source cell has ever received focus", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    position: { Position: `G${Math.floor(index / 10)}` },
    tree: `Position ${index}`,
  }));
  const owner = createAg31ClientController({
    rows,
    getRowId: (row) => row.id,
    definitions: [
      { field: "position.Position", rowGroup: true, hide: true },
      { field: "tree" },
    ],
  });
  expect(owner.model.getState().groupBy).toEqual(["position.Position"]);
  expect(owner.api.getDisplayedRowCount()).toBe(3);
  expect(owner.api.getRowNode("10")?.parent?.key).toBe("G1");
  expect(owner.api.getFocusedCell()).toBeNull();
  owner.api.destroy();
});

function setup() {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: String(index),
    amount: index,
  }));
  const owner = createAg31ClientController({
    rows,
    getRowId: (row) => row.id,
    definitions: [{ field: "id" }, { field: "amount" }],
  });
  const emit = vi.fn();
  let rendered = true,
    browserOwned = false;
  const focusBrowser = vi.fn(() => rendered);
  const service = createAg31CellFocus({
    column: owner.columns.getColumn,
    position(index, column) {
      const row = owner.model.getRowModel()[index];
      return row && owner.columns.getAllDisplayedColumns().includes(column)
        ? { rowId: row.id, columnId: column.colId }
        : null;
    },
    locate(position) {
      const index = owner.model
          .getRowModel()
          .findIndex((row) => row.id === position.rowId),
        column = owner.columns.getColumn(position.columnId);
      return index >= 0 && column ? { index, column } : null;
    },
    subscribe: owner.model.subscribe,
    emit,
  });
  const read = () => ({
    focus: focusBrowser,
    ownsBrowserFocus: () => browserOwned,
  });
  const detach = service.attach(read);
  return {
    owner,
    rows,
    service,
    emit,
    focusBrowser,
    read,
    detach,
    rendered(value: boolean) {
      rendered = value;
    },
    browserOwned(value: boolean) {
      browserOwned = value;
    },
    destroy() {
      service.destroy();
      owner.api.destroy();
    },
  };
}
it("starts without source focus and keeps source column identity without changing query or selection", () => {
  const c = setup(),
    state = c.owner.model.getState();
  expect(c.service.getFocusedCell()).toBeNull();
  expect(c.service.controller.getSnapshot()).toBeNull();
  c.service.setFocusedCell(2, "amount");
  expect(c.service.getFocusedCell()).toEqual({
    rowIndex: 2,
    rowPinned: null,
    column: c.owner.columns.getColumn("amount"),
  });
  expect(c.service.controller.getSnapshot()).toEqual({
    rowId: "2",
    columnId: "amount",
  });
  expect(c.focusBrowser).toHaveBeenCalledExactlyOnceWith(
    { rowId: "2", columnId: "amount" },
    false,
  );
  expect(c.owner.model.getState()).toBe(state);
  expect(c.owner.api.getSelectedNodes()).toEqual([]);
  c.destroy();
});
it("retains the numeric coordinate through sort and a hidden column without replacing it with row identity", () => {
  const c = setup();
  c.service.setFocusedCell(2, "amount");
  c.owner.model.setSort("amount", "desc");
  expect(c.service.getFocusedCell()?.rowIndex).toBe(2);
  expect(c.service.controller.getSnapshot()).toEqual({
    rowId: "3",
    columnId: "amount",
  });
  c.owner.api.applyColumnState({ state: [{ colId: "amount", hide: true }] });
  expect(c.service.getFocusedCell()?.column).toBe(
    c.owner.columns.getColumn("amount"),
  );
  expect(c.service.controller.getSnapshot()).toBeNull();
  c.destroy();
});
it("rejects unsupported coordinates before changing retained focus or publishing an event", () => {
  const c = setup();
  c.service.setFocusedCell(1, "amount");
  const before = c.service.getFocusedCell();
  for (const index of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => c.service.setFocusedCell(index, "id")).toThrow(TypeError);
  expect(() => c.service.setFocusedCell(0, "id", "top" as never)).toThrow(
    "Pinned source focus is not supported",
  );
  expect(c.service.getFocusedCell()).toEqual(before);
  expect(c.emit).toHaveBeenCalledTimes(1);
  c.destroy();
});
it("does not reveal or take delayed focus merely because an unrendered target later mounts", () => {
  const c = setup();
  c.rendered(false);
  c.service.setFocusedCell(3, "amount");
  c.rendered(true);
  c.focusBrowser.mockClear();
  c.service.flush();
  expect(c.focusBrowser).not.toHaveBeenCalled();
  c.service.setFocusedCell(3, "amount");
  expect(c.focusBrowser).toHaveBeenCalledExactlyOnceWith(
    { rowId: "3", columnId: "amount" },
    false,
  );
  c.destroy();
});
it("reconciles DOM focus only when the mounted cell owns it and does not steal a descendant editor", () => {
  const c = setup();
  c.service.setFocusedCell(2, "amount");
  c.focusBrowser.mockClear();
  c.service.flush();
  expect(c.focusBrowser).not.toHaveBeenCalled();
  c.browserOwned(true);
  c.owner.model.setSort("amount", "desc");
  c.service.flush();
  expect(c.focusBrowser).toHaveBeenCalledExactlyOnceWith(
    { rowId: "3", columnId: "amount" },
    true,
  );
  c.destroy();
});
it("distinguishes explicit browser focus, view focus and clear events while clearing unknown columns silently", () => {
  const c = setup();
  c.service.setFocusedCell(1, "amount");
  c.service.controller.setFocusedCell({ rowId: "1", columnId: "amount" });
  expect(c.emit).toHaveBeenCalledTimes(1);
  expect(c.emit.mock.calls[0][0]).toMatchObject({
    type: "cellFocused",
    forceBrowserFocus: true,
    rowIndex: 1,
  });
  c.service.controller.setFocusedCell({ rowId: "4", columnId: "id" });
  expect(c.emit.mock.calls[1][0]).toMatchObject({
    type: "cellFocused",
    forceBrowserFocus: false,
    rowIndex: 4,
  });
  c.service.clearFocusedCell();
  expect(c.emit.mock.calls[2][0]).toMatchObject({
    type: "cellFocusCleared",
    rowIndex: 4,
  });
  expect(c.service.getFocusedCell()).toBeNull();
  c.service.setFocusedCell(1, "missing");
  c.service.clearFocusedCell();
  expect(c.emit).toHaveBeenCalledTimes(3);
  c.destroy();
});
it("does not revive an unrendered focus request after replacing its attachment and revokes retirement", () => {
  const c = setup();
  c.rendered(false);
  c.service.setFocusedCell(2, "amount");
  c.service.setFocusedCell(4, "id");
  c.rendered(true);
  c.focusBrowser.mockClear();
  c.service.flush();
  c.service.flush();
  expect(c.focusBrowser).not.toHaveBeenCalled();
  c.rendered(false);
  c.service.setFocusedCell(2, "amount");
  c.detach();
  c.service.attach(c.read);
  c.rendered(true);
  c.focusBrowser.mockClear();
  c.service.flush();
  expect(c.focusBrowser).not.toHaveBeenCalled();
  c.destroy();
  const calls = c.emit.mock.calls.length;
  c.service.setFocusedCell(1, "amount");
  c.service.clearFocusedCell();
  c.service.controller.setFocusedCell({ rowId: "0", columnId: "id" });
  expect(c.emit).toHaveBeenCalledTimes(calls);
  expect(c.service.getFocusedCell()).toBeNull();
});
