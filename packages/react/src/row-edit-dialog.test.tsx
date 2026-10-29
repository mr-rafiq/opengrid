// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid } from "../../core/src/index";
import type { Column, GridOptions } from "../../core/src/types";
import { CellEditor } from "./editors";
import { RowEditDialog } from "./row-edit-dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
interface Order {
  id: string;
  name: string;
  minimum: number;
  maximum: number;
  active: boolean;
  category: string;
  notes: string;
  locked: string;
  hidden: string;
}
const original: Order = {
  id: "a",
  name: "Ada",
  minimum: 5,
  maximum: 10,
  active: true,
  category: "a",
  notes: "Original notes",
  locked: "Read only",
  hidden: "Hidden",
};
const columns: Column<Order>[] = [
  { id: "name", field: "name", header: "Name", editable: true },
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
    validate: (value, row) =>
      Number(value) < row.minimum ? "Maximum below minimum" : undefined,
  },
  {
    id: "active",
    field: "active",
    header: "Active",
    type: "boolean",
    editable: true,
  },
  { id: "category", field: "category", header: "Category", editable: true },
  { id: "notes", field: "notes", header: "Notes", editable: true },
  { id: "locked", field: "locked", header: "Locked" },
  {
    id: "hidden",
    field: "hidden",
    header: "Hidden",
    hidden: true,
    editable: true,
  },
  {
    id: "calculated",
    header: "Calculated",
    editable: true,
    valueGetter: (row) => row.minimum + row.maximum,
  },
];
function model(patch: Partial<GridOptions<Order>> = {}) {
  return createGrid({
    rows: [original, { ...original, id: "b", name: "Grace" }],
    columns,
    getRowId: (row) => row.id,
    ...patch,
  });
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("RowEditDialog atomic drafts", () => {
  it("commits cross-field changes atomically in a single undo step", () => {
    const grid = model();
    const onClose = vi.fn();
    const onCommit = vi.fn();
    render(
      <RowEditDialog
        model={grid}
        rowId="a"
        onClose={onClose}
        onCommit={onCommit}
      />,
    );
    change("Edit Minimum", "20");
    change("Edit Maximum", "30");
    change("Edit Name", "Updated");
    expect(grid.getRow("a")).toEqual(original);
    click("Save row");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(grid.getRow("a")).toMatchObject({
      name: "Updated",
      minimum: 20,
      maximum: 30,
    });
    expect(onCommit).toHaveBeenCalledWith("a");
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      expect(grid.undo()).toBe(true);
    });
    expect(grid.getRow("a")).toEqual(original);
    expect(grid.undo()).toBe(false);
  });

  it("rolls back all fields on validation errors and retains drafts for correction", () => {
    const grid = model();
    const onClose = vi.fn();
    render(<RowEditDialog model={grid} rowId="a" onClose={onClose} />);
    change("Edit Name", "Must not leak");
    change("Edit Minimum", "50");
    click("Save row");
    expect(screen.getByRole("alert").textContent).toBe(
      "Minimum exceeds maximum",
    );
    expect(grid.getRow("a")).toEqual(original);
    expect((screen.getByLabelText("Edit Name") as HTMLInputElement).value).toBe(
      "Must not leak",
    );
    expect(onClose).not.toHaveBeenCalled();
    change("Edit Maximum", "60");
    click("Save row");
    expect(grid.getRow("a")).toMatchObject({
      name: "Must not leak",
      minimum: 50,
      maximum: 60,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps drafts local across Tab and blur, then discards them on Cancel", () => {
    const grid = model();
    const onClose = vi.fn();
    render(<RowEditDialog model={grid} rowId="a" onClose={onClose} />);
    const name = screen.getByLabelText("Edit Name");
    change("Edit Name", "Draft");
    expect(fireEvent.keyDown(name, { key: "Tab" })).toBe(true);
    fireEvent.blur(name, {
      relatedTarget: screen.getByLabelText("Edit Minimum"),
    });
    expect(grid.getRow("a")).toEqual(original);
    expect((name as HTMLInputElement).value).toBe("Draft");
    click("Cancel");
    expect(grid.getRow("a")).toEqual(original);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(grid.undo()).toBe(false);
  });

  it("cancels on Escape/native cancel once and focuses only the requested eligible field", () => {
    const grid = model();
    const onClose = vi.fn();
    render(
      <RowEditDialog
        model={grid}
        rowId="a"
        initialColumnId="minimum"
        onClose={onClose}
      />,
    );
    const minimum = screen.getByLabelText("Edit Minimum");
    expect(document.activeElement).toBe(minimum);
    change("Edit Minimum", "99");
    expect(fireEvent.keyDown(minimum, { key: "Escape" })).toBe(false);
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(screen.getByRole("dialog"), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(grid.getRow("a")).toEqual(original);
  });

  it("focuses the first eligible field when the requested column is read only", () => {
    render(
      <RowEditDialog
        model={model()}
        rowId="a"
        initialColumnId="locked"
        onClose={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Edit Name"));
  });

  it("renders only visible fields represented in the session and handles rows with none", () => {
    const grid = model();
    const view = render(
      <RowEditDialog model={grid} rowId="a" onClose={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Edit Locked")).toBeNull();
    expect(screen.queryByLabelText("Edit Hidden")).toBeNull();
    expect(screen.queryByLabelText("Edit Calculated")).toBeNull();
    const readonly = model({
      columns: columns.map((column) => ({ ...column, editable: false })),
    });
    view.rerender(
      <RowEditDialog model={readonly} rowId="a" onClose={vi.fn()} />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "no editable visible fields",
    );
    expect(
      (screen.getByRole("button", { name: "Save row" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
  });
});

describe("RowEditDialog editor integration", () => {
  it("supports native select, checkbox and multiline drafts without committing on multiline Enter", () => {
    const grid = model();
    const onClose = vi.fn();
    render(
      <RowEditDialog
        model={grid}
        rowId="a"
        onClose={onClose}
        editorOptions={{
          category: {
            type: "select",
            options: [
              { value: "a", label: "Alpha" },
              { value: "b", label: "Beta" },
            ],
          },
          notes: { type: "largeText" },
        }}
      />,
    );
    change("Edit Category", "b");
    fireEvent.click(screen.getByRole("checkbox", { name: "Edit Active" }));
    change("Edit Notes", "First\nSecond");
    const notes = screen.getByLabelText("Edit Notes");
    expect(fireEvent.keyDown(notes, { key: "Enter" })).toBe(true);
    expect(grid.getRow("a")).toEqual(original);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(notes, { key: "Enter", ctrlKey: true });
    expect(grid.getRow("a")).toMatchObject({
      category: "b",
      active: false,
      notes: "First\nSecond",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("loads async select choices and commits the selected draft only on Save", async () => {
    const grid = model();
    const provider = vi.fn(async () => [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ]);
    render(
      <RowEditDialog
        model={grid}
        rowId="a"
        onClose={vi.fn()}
        editorOptions={{ category: { type: "select", asyncOptions: provider } }}
      />,
    );
    await screen.findByRole("option", { name: "Beta" });
    change("Edit Category", "b");
    expect(grid.getRow("a")?.category).toBe("a");
    click("Save row");
    expect(grid.getRow("a")?.category).toBe("b");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("supports custom editors and forwards shared draft and keyboard handlers", () => {
    const grid = model();
    const custom = vi.fn();
    render(
      <RowEditDialog
        model={grid}
        rowId="a"
        onClose={vi.fn()}
        renderEditor={(context) => {
          if (context.column.id !== "name") return <CellEditor {...context} />;
          custom(context.autoFocus, context.row.minimum);
          return (
            <input
              aria-label="Custom name"
              value={context.value}
              onChange={(event) => context.onChange(event.target.value)}
              onBlur={context.onBlur}
              onKeyDown={context.onKeyDown}
            />
          );
        }}
      />,
    );
    expect(custom).toHaveBeenCalledWith(false, 5);
    expect(document.activeElement).toBe(screen.getByLabelText("Custom name"));
    change("Custom name", "Custom draft");
    fireEvent.keyDown(screen.getByLabelText("Custom name"), { key: "Enter" });
    expect(grid.getRow("a")?.name).toBe("Custom draft");
  });
});

describe("RowEditDialog lifecycle and conflicts", () => {
  it("does not save from Enter while a reload-discard confirmation is pending", () => {
    const grid = model();
    const onClose = vi.fn();
    render(<RowEditDialog model={grid} rowId="a" onClose={onClose} />);
    change("Edit Name", "Draft");
    click("Reload row");
    fireEvent.keyDown(screen.getByLabelText("Edit Name"), { key: "Enter" });
    expect(grid.getRow("a")?.name).toBe("Ada");
    expect(onClose).not.toHaveBeenCalled();
    click("Keep editing");
    click("Save row");
    expect(grid.getRow("a")?.name).toBe("Draft");
  });
  it("retains conflicting drafts and requires explicit confirmation before reloading", () => {
    const grid = model();
    const onClose = vi.fn();
    render(<RowEditDialog model={grid} rowId="a" onClose={onClose} />);
    change("Edit Name", "Local draft");
    act(() => {
      grid.editCell("a", "name", "Server value");
    });
    click("Save row");
    expect(screen.getByRole("alert").textContent).toContain(
      "changed externally",
    );
    expect((screen.getByLabelText("Edit Name") as HTMLInputElement).value).toBe(
      "Local draft",
    );
    expect(grid.getRow("a")?.name).toBe("Server value");
    click("Reload row");
    expect(screen.getByRole("group").textContent).toContain(
      "Discard this draft",
    );
    click("Keep editing");
    expect((screen.getByLabelText("Edit Name") as HTMLInputElement).value).toBe(
      "Local draft",
    );
    click("Reload row");
    click("Discard draft and reload");
    expect((screen.getByLabelText("Edit Name") as HTMLInputElement).value).toBe(
      "Server value",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    change("Edit Name", "After reload");
    click("Save row");
    expect(grid.getRow("a")?.name).toBe("After reload");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("supports an explicitly selected overwrite conflict policy", () => {
    const grid = model();
    render(
      <RowEditDialog
        model={grid}
        rowId="a"
        conflictPolicy="overwrite"
        onClose={vi.fn()}
      />,
    );
    change("Edit Name", "Local wins");
    act(() => {
      grid.editCell("a", "name", "Remote");
    });
    click("Save row");
    expect(grid.getRow("a")?.name).toBe("Local wins");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports deleted or initially missing rows without throwing React errors", () => {
    const grid = model();
    const onClose = vi.fn();
    const view = render(
      <RowEditDialog model={grid} rowId="a" onClose={onClose} />,
    );
    change("Edit Name", "Draft");
    act(() => grid.applyTransaction({ remove: ["a"] }));
    click("Save row");
    expect(screen.getByRole("alert").textContent).toContain("deleted");
    expect((screen.getByLabelText("Edit Name") as HTMLInputElement).value).toBe(
      "Draft",
    );
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(
      <RowEditDialog model={grid} rowId="missing" onClose={onClose} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("missing row");
    expect(
      (screen.getByRole("button", { name: "Save row" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("cancels old sessions when changing rows or unmounting without committing", () => {
    const grid = model();
    const view = render(
      <RowEditDialog model={grid} rowId="a" onClose={vi.fn()} />,
    );
    change("Edit Name", "Discard A");
    view.rerender(<RowEditDialog model={grid} rowId="b" onClose={vi.fn()} />);
    expect((screen.getByLabelText("Edit Name") as HTMLInputElement).value).toBe(
      "Grace",
    );
    expect(grid.getRow("a")).toEqual(original);
    change("Edit Name", "Discard B");
    view.unmount();
    expect(grid.getRow("b")?.name).toBe("Grace");
    expect(grid.undo()).toBe(false);
  });

  it("opens through the native modal API before open is set and closes on cleanup", () => {
    const previousShow = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      "showModal",
    );
    const previousClose = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      "close",
    );
    const show = vi.fn(function (this: HTMLDialogElement) {
      expect(this.hasAttribute("open")).toBe(false);
      this.setAttribute("open", "");
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: show,
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: close,
    });
    try {
      const view = render(
        <RowEditDialog
          model={model()}
          rowId="a"
          initialColumnId="maximum"
          onClose={vi.fn()}
        />,
      );
      expect(show).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(
        screen.getByLabelText("Edit Maximum"),
      );
      view.unmount();
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      if (previousShow)
        Object.defineProperty(
          HTMLDialogElement.prototype,
          "showModal",
          previousShow,
        );
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
      if (previousClose)
        Object.defineProperty(
          HTMLDialogElement.prototype,
          "close",
          previousClose,
        );
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    }
  });
});
