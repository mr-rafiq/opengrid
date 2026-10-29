// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid, CellNotesStore } from "@opengrid/core";
import { DataGrid } from "./index";
afterEach(cleanup);
function setup() {
  const model = createGrid({
    rows: [
      { id: "a", name: "Ada", amount: 10 },
      { id: "b", name: "Grace", amount: 20 },
      { id: "c", name: "Lin", amount: 30 },
    ],
    columns: [
      { id: "name", field: "name", header: "Name", editable: true },
      {
        id: "amount",
        field: "amount",
        header: "Amount",
        type: "number",
        editable: true,
      },
    ],
    getRowId: (r) => r.id,
  });
  const notes = new CellNotesStore();
  const view = render(<DataGrid model={model} notes={notes} />);
  const cell = (row: string, column = "name") =>
    view.container.querySelector<HTMLElement>(
      `[data-row-id="${row}"][data-column-id="${column}"]`,
    )!;
  return { model, notes, cell };
}
describe("Find notes and advanced-filter integration", () => {
  it("finds formatted cells without filtering and preserves input focus until navigation", () => {
    const { model, cell } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    const input = screen.getByRole("textbox", { name: "Find in current view" });
    fireEvent.change(input, { target: { value: "Grace" } });
    expect(model.getFilteredRows()).toHaveLength(3);
    expect(document.activeElement).toBe(input);
    expect(cell("b").className).toContain("og-find-active");
    fireEvent.click(screen.getByRole("button", { name: "Next find match" }));
    expect(document.activeElement).toBe(cell("b"));
    fireEvent.keyDown(cell("b"), { key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("search", { name: "Find in current view" }),
    ).toBeNull();
  });
  it("saves plain notes without changing data and restores cell focus on close", () => {
    const { model, notes, cell } = setup();
    fireEvent.keyDown(cell("a"), { key: "n", altKey: true });
    const dialog = screen.getByRole("dialog", { name: "Cell note" });
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Note text" }),
      { target: { value: "<img src=x onerror=alert(1)>" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    expect(notes.get({ rowId: "a", columnId: "name" })).toContain("<img");
    expect(model.getRows()[0].name).toBe("Ada");
    expect(
      screen
        .getByRole("button", { name: "Edit note for Name row a" })
        .getAttribute("title"),
    ).toContain("<img");
    expect(document.querySelector("img")).toBeNull();
    expect(document.activeElement).toBe(cell("a"));
    act(() => model.setQuickFilter("Grace"));
    act(() => model.setQuickFilter(""));
    expect(
      screen.getByRole("button", { name: "Edit note for Name row a" }),
    ).toBeTruthy();
  });
  it("deletes a note and keeps another cell annotation intact", () => {
    const { notes, cell } = setup();
    act(() => {
      notes.set({ rowId: "a", columnId: "name" }, "first");
      notes.set({ rowId: "b", columnId: "amount" }, "second");
    });
    fireEvent.keyDown(cell("a"), { key: "n", altKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(notes.get({ rowId: "a", columnId: "name" })).toBeUndefined();
    expect(notes.get({ rowId: "b", columnId: "amount" })).toBe("second");
  });
  it("applies advanced typed conditions together with quick search and clears via draft apply", () => {
    const { model } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Advanced filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Add condition root" }));
    fireEvent.change(screen.getByLabelText("Column 1"), {
      target: { value: "amount" },
    });
    fireEvent.change(screen.getByLabelText("Operator 1"), {
      target: { value: "gt" },
    });
    fireEvent.change(screen.getByLabelText("Value 1"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b", "c"]);
    expect(
      screen
        .getByRole("button", { name: "Advanced filter" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "Search all rows" }), {
      target: { value: "Grace" },
    });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    fireEvent.click(screen.getByRole("button", { name: "Advanced filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(model.getState().advancedFilter).toBeNull();
    expect(model.getFilteredRows()).toHaveLength(1);
  });
});
