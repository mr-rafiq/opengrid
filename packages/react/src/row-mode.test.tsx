// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid } from "../../core/src/index";
import type { Column } from "../../core/src/types";
import { DataGrid } from "./data-grid";

afterEach(cleanup);
interface Item {
  id: string;
  name: string;
  minimum: number;
  maximum: number;
  code: string;
}
const original: Item = {
  id: "a",
  name: "Ada",
  minimum: 5,
  maximum: 10,
  code: "Locked",
};
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Name", editable: true, pinned: "left" },
  {
    id: "minimum",
    field: "minimum",
    header: "Minimum",
    type: "number",
    editable: true,
    validate: (value, row) =>
      Number(value) > row.maximum ? "Minimum exceeds maximum" : undefined,
  },
  {
    id: "maximum",
    field: "maximum",
    header: "Maximum",
    type: "number",
    editable: true,
  },
  { id: "code", field: "code", header: "Code" },
];
function model() {
  return createGrid({
    columns,
    rows: [original, { ...original, id: "b", name: "Grace" }],
    getRowId: (row) => row.id,
  });
}
function cell(id: string, column: string) {
  return document.querySelector<HTMLDivElement>(
    `[data-row-id="${id}"][data-column-id="${column}"]`,
  )!;
}
function change(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("DataGrid row editing mode", () => {
  it("creates a fresh live session after StrictMode effect replay", () => {
    const grid = model();
    render(
      <StrictMode>
        <DataGrid model={grid} editMode="row" />
      </StrictMode>,
    );
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    expect(
      (screen.getByRole("button", { name: "Save row" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    change("Edit Name", "Strict saved");
    click("Save row");
    expect(grid.getRow("a")?.name).toBe("Strict saved");
    expect(screen.queryByRole("dialog")).toBeNull();
  }, 15000);
  it("opens with F2, commits one atomic row batch, restores the initiating cell and emits row context", () => {
    const grid = model();
    const onRowEdit = vi.fn();
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        model={grid}
        editMode="row"
        onRowEdit={onRowEdit}
        onCellEdit={onCellEdit}
      />,
    );
    act(() => cell("a", "minimum").focus());
    fireEvent.keyDown(cell("a", "minimum"), { key: "F2" });
    expect(screen.getByRole("dialog", { name: "Edit row a" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Edit Minimum"));
    change("Edit Name", "Updated");
    change("Edit Minimum", "20");
    change("Edit Maximum", "30");
    expect(grid.getRow("a")).toEqual(original);
    click("Save row");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(grid.getRow("a")).toMatchObject({
      name: "Updated",
      minimum: 20,
      maximum: 30,
    });
    expect(document.activeElement).toBe(cell("a", "minimum"));
    expect(onRowEdit).toHaveBeenCalledTimes(1);
    expect(onRowEdit).toHaveBeenCalledWith({ rowId: "a" });
    expect(onCellEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(cell("a", "minimum"), { key: "z", ctrlKey: true });
    expect(grid.getRow("a")).toEqual(original);
    expect(grid.undo()).toBe(false);
  });

  it("opens from Enter or double-click on a data row, including a read-only initiating column", () => {
    const grid = model();
    render(<DataGrid model={grid} editMode="row" />);
    act(() => cell("a", "code").focus());
    fireEvent.keyDown(cell("a", "code"), { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("Edit Name"));
    click("Cancel");
    expect(document.activeElement).toBe(cell("a", "code"));
    fireEvent.doubleClick(cell("b", "name"));
    expect(screen.getByRole("dialog", { name: "Edit row b" })).toBeTruthy();
    click("Cancel");
    expect(grid.getRow("a")).toEqual(original);
    expect(document.activeElement).toBe(cell("b", "name"));
  });

  it("opens the focused row through the toolbar and restores focus after Escape cancellation", () => {
    const grid = model();
    const onRowEdit = vi.fn();
    render(<DataGrid model={grid} editMode="row" onRowEdit={onRowEdit} />);
    act(() => cell("b", "maximum").focus());
    click("Edit row");
    expect(screen.getByRole("dialog", { name: "Edit row b" })).toBeTruthy();
    change("Edit Name", "Discard");
    fireEvent.keyDown(screen.getByLabelText("Edit Name"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(grid.getRow("b")?.name).toBe("Grace");
    expect(document.activeElement).toBe(cell("b", "maximum"));
    expect(onRowEdit).not.toHaveBeenCalled();
  });

  it("does not start row editing from a single printable key or discard its baseline value", () => {
    const grid = model();
    render(<DataGrid model={grid} editMode="row" />);
    expect(fireEvent.keyDown(cell("a", "name"), { key: "Q" })).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    expect((screen.getByLabelText("Edit Name") as HTMLInputElement).value).toBe(
      "Ada",
    );
  });

  it("keeps the default cell-editing behavior and does not show the row toolbar control", () => {
    const grid = model();
    render(<DataGrid model={grid} />);
    expect(screen.queryByRole("button", { name: "Edit row" })).toBeNull();
    fireEvent.keyDown(cell("a", "name"), { key: "Q" });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Edit Name row a",
        }) as HTMLInputElement
      ).value,
    ).toBe("Q");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Edit Name row a" }),
      { key: "Escape" },
    );
    expect(grid.getRow("a")).toEqual(original);
  });

  it("keeps invalid row drafts in the dialog while model cells remain unchanged", () => {
    const grid = model();
    render(<DataGrid model={grid} editMode="row" />);
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    change("Edit Name", "Invalid draft");
    change("Edit Minimum", "99");
    click("Save row");
    expect(screen.getByRole("alert").textContent).toBe(
      "Minimum exceeds maximum",
    );
    expect(grid.getRow("a")).toEqual(original);
    expect(cell("a", "name").textContent).toBe("Ada");
    change("Edit Maximum", "100");
    click("Save row");
    expect(grid.getRow("a")).toMatchObject({
      name: "Invalid draft",
      minimum: 99,
      maximum: 100,
    });
  });

  it("cancels a row draft when the edit mode or model changes", () => {
    const first = model();
    const onRowEdit = vi.fn();
    const view = render(
      <DataGrid model={first} editMode="row" onRowEdit={onRowEdit} />,
    );
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    change("Edit Name", "Discard mode draft");
    view.rerender(
      <DataGrid model={first} editMode="cell" onRowEdit={onRowEdit} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(first.getRow("a")).toEqual(original);
    view.rerender(
      <DataGrid model={first} editMode="row" onRowEdit={onRowEdit} />,
    );
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    change("Edit Name", "Discard model draft");
    const second = model();
    view.rerender(
      <DataGrid model={second} editMode="row" onRowEdit={onRowEdit} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(first.getRow("a")).toEqual(original);
    expect(second.getRow("a")).toEqual(original);
    expect(onRowEdit).not.toHaveBeenCalled();
  });

  it("ignores double-clicks on interactive renderer descendants", () => {
    const grid = model();
    render(
      <DataGrid
        model={grid}
        editMode="row"
        renderCell={({ column, value }) =>
          column.id === "name" ? (
            <button type="button" aria-label={`Inspect ${String(value)}`}>
              {String(value)}
            </button>
          ) : (
            String(value)
          )
        }
      />,
    );
    fireEvent.doubleClick(screen.getByRole("button", { name: "Inspect Ada" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.doubleClick(cell("a", "name"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("forwards explicit overwrite policy to the row session", () => {
    const grid = model();
    render(
      <DataGrid model={grid} editMode="row" rowConflictPolicy="overwrite" />,
    );
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    change("Edit Name", "Local wins");
    act(() => {
      grid.editCell("a", "name", "Server");
    });
    click("Save row");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(grid.getRow("a")?.name).toBe("Local wins");
  });

  it("restores grid-container focus when the edited row is deleted and the view becomes empty", () => {
    const grid = model();
    render(<DataGrid model={grid} editMode="row" />);
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    act(() => grid.applyTransaction({ remove: ["a", "b"] }));
    click("Cancel");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("grid"));
  });
});
