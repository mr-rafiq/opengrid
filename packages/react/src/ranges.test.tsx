// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./index";
afterEach(cleanup);
function setup() {
  const model = createGrid({
    rows: [
      { id: "a", name: "A", price: 10, quantity: 2 },
      { id: "b", name: "B", price: 20, quantity: 3 },
      { id: "c", name: "C", price: 30, quantity: 4 },
    ],
    columns: [
      { id: "name", field: "name", pinned: "left" },
      {
        id: "price",
        field: "price",
        type: "number",
        editable: true,
        validate: (v) => (Number(v) > 0 ? undefined : "Positive only"),
      },
      { id: "quantity", field: "quantity", type: "number", editable: true },
    ],
    getRowId: (r) => r.id,
  });
  const view = render(<DataGrid model={model} selectionMode="none" />);
  const cell = (row: string, column: string) =>
    view.container.querySelector<HTMLElement>(
      `[data-row-id="${row}"][data-column-id="${column}"]`,
    )!;
  return { model, view, cell };
}
describe("React cell ranges", () => {
  it("notifies the latest listener for semantic range/view changes without replaying on handler or value updates", () => {
    const { model, view, cell } = setup();
    const first = vi.fn(),
      latest = vi.fn(),
      reattached = vi.fn();
    view.rerender(
      <DataGrid model={model} selectionMode="none" onCellRangeChange={first} />,
    );
    expect(first).toHaveBeenCalledExactlyOnceWith(null);
    fireEvent.click(cell("a", "price"));
    expect(first).toHaveBeenCalledTimes(2);
    view.rerender(
      <DataGrid
        model={model}
        selectionMode="none"
        onCellRangeChange={latest}
      />,
    );
    expect(latest).not.toHaveBeenCalled();
    act(() => model.editCell("a", "price", 11));
    act(() => model.resizeColumn("price", 180));
    expect(latest).not.toHaveBeenCalled();
    fireEvent.click(cell("c", "price"), { shiftKey: true });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.lastCall?.[0].focus).toEqual({
      rowId: "c",
      columnId: "price",
    });
    act(() => model.setSort("price", "desc"));
    expect(latest).toHaveBeenCalledTimes(2);
    view.rerender(<DataGrid model={model} selectionMode="none" />);
    view.rerender(
      <DataGrid
        model={model}
        selectionMode="none"
        onCellRangeChange={reattached}
      />,
    );
    expect(reattached).toHaveBeenCalledTimes(1);
    act(() => model.setQuickFilter("A"));
    expect(reattached).toHaveBeenLastCalledWith(null);
    expect(latest).toHaveBeenCalledTimes(2);
  });
  it("extends a rectangle by keyboard, exposes selection and clears it", () => {
    const { cell } = setup();
    cell("a", "price").focus();
    fireEvent.keyDown(cell("a", "price"), {
      key: "ArrowRight",
      shiftKey: true,
    });
    fireEvent.keyDown(cell("a", "quantity"), {
      key: "ArrowDown",
      shiftKey: true,
    });
    expect(screen.getAllByRole("gridcell", { selected: true })).toHaveLength(4);
    expect(screen.getByText(/4 cells selected/)).toBeTruthy();
    fireEvent.keyDown(cell("b", "quantity"), { key: "Escape" });
    expect(screen.queryAllByRole("gridcell", { selected: true })).toHaveLength(
      0,
    );
  });
  it("copies quoted text via native copy event and atomically pastes with one undo", () => {
    const { cell, model } = setup();
    fireEvent.click(cell("a", "price"));
    fireEvent.click(cell("b", "quantity"), { shiftKey: true });
    const setData = vi.fn();
    fireEvent.copy(cell("b", "quantity"), { clipboardData: { setData } });
    expect(setData.mock.calls[0][0]).toBe("text/plain");
    expect(setData.mock.calls[0][1]).toMatch(/10\t2/);
    fireEvent.paste(cell("b", "quantity"), {
      clipboardData: { getData: () => "40\t5\n50\t6" },
    });
    expect(
      model
        .getRows()
        .slice(0, 2)
        .map((r) => [r.price, r.quantity]),
    ).toEqual([
      [40, 5],
      [50, 6],
    ]);
    model.undo();
    expect(
      model
        .getRows()
        .slice(0, 2)
        .map((r) => [r.price, r.quantity]),
    ).toEqual([
      [10, 2],
      [20, 3],
    ]);
  });
  it("rejects an invalid pasted cell without changing other target cells", () => {
    const { cell, model } = setup();
    fireEvent.click(cell("a", "price"));
    fireEvent.paste(cell("a", "price"), {
      clipboardData: { getData: () => "40\t5\n-1\t6" },
    });
    expect(screen.getByRole("alert").textContent).toContain("Positive only");
    expect(model.getRows()[0].price).toBe(10);
    expect(model.undo()).toBe(false);
  });
  it("fills down and right using atomic validated history", () => {
    const { cell, model } = setup();
    fireEvent.click(cell("a", "price"));
    fireEvent.click(cell("c", "price"), { shiftKey: true });
    fireEvent.keyDown(cell("c", "price"), { key: "d", ctrlKey: true });
    expect(model.getRows().map((r) => r.price)).toEqual([10, 10, 10]);
    model.undo();
    fireEvent.click(cell("a", "price"));
    fireEvent.click(cell("a", "quantity"), { shiftKey: true });
    fireEvent.keyDown(cell("a", "quantity"), { key: "r", ctrlKey: true });
    expect(model.getRows()[0].quantity).toBe(10);
  });
  it("selects all visible data cells and recovers after filtering endpoints", () => {
    const { cell, model } = setup();
    fireEvent.keyDown(cell("a", "name"), { key: "a", ctrlKey: true });
    expect(screen.getAllByRole("gridcell", { selected: true })).toHaveLength(9);
    fireEvent.change(screen.getByRole("textbox", { name: "Search all rows" }), {
      target: { value: "A" },
    });
    expect(screen.queryAllByRole("gridcell", { selected: true })).toHaveLength(
      0,
    );
    expect(model.getFilteredRows()).toHaveLength(1);
  });
});
