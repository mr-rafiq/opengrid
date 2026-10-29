// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CellNotesStore } from "../../core/src/notes";
import { CellNoteDialog } from "./cell-note-dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const position = { rowId: "row-7", columnId: "revenue" };
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("CellNoteDialog", () => {
  it("reads an existing plain-text note, opens the fallback dialog and focuses the textarea", () => {
    const store = new CellNotesStore();
    store.set(position, "Review the quarterly result");
    render(
      <CellNoteDialog
        store={store}
        position={position}
        columnLabel="Revenue"
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Cell note" });
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(screen.getByText("Revenue", { exact: false }).textContent).toContain(
      "row-7",
    );
    const input = screen.getByRole("textbox", {
      name: "Note text",
    }) as HTMLTextAreaElement;
    expect(input.value).toBe("Review the quarterly result");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("button", { name: "Delete note" })).toBeTruthy();
  });

  it("saves the complete draft as plain text and closes only after success", () => {
    const store = new CellNotesStore();
    const onClose = vi.fn();
    render(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    expect(screen.queryByRole("button", { name: "Delete note" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "First line\nSecond line" },
    });
    expect(store.get(position)).toBeUndefined();
    click("Save note");
    expect(store.get(position)).toBe("First line\nSecond line");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("deletes an existing note and treats an empty saved draft as deletion", () => {
    const store = new CellNotesStore();
    store.set(position, "Existing");
    const onClose = vi.fn();
    const view = render(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    click("Delete note");
    expect(store.get(position)).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    store.set(position, "Second note");
    render(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    click("Save note");
    expect(store.get(position)).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("preserves whitespace rather than silently trimming the note", () => {
    const store = new CellNotesStore();
    render(
      <CellNoteDialog store={store} position={position} onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  \n " },
    });
    click("Save note");
    expect(store.get(position)).toBe("  \n ");
  });

  it("cancels without modifying the stored note", () => {
    const store = new CellNotesStore();
    store.set(position, "Original");
    const onClose = vi.fn();
    render(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Discard me" },
    });
    click("Cancel");
    expect(store.get(position)).toBe("Original");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles Escape and native cancel without duplicate close requests or note mutation", () => {
    const store = new CellNotesStore();
    const onClose = vi.fn();
    render(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" }),
    ).toBe(false);
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(store.get(position)).toBeUndefined();
  });

  it("retains the full over-limit draft and existing note when the store rejects Save", () => {
    const store = new CellNotesStore({ maxTextLength: 5 });
    store.set(position, "Prior");
    const onClose = vi.fn();
    render(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    const pasted = "A long pasted note that must never be truncated";
    fireEvent.change(input, { target: { value: pasted } });
    click("Save note");
    expect(input.value).toBe(pasted);
    expect(input.hasAttribute("maxlength")).toBe(false);
    expect(store.get(position)).toBe("Prior");
    expect(onClose).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("character limit");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Fixed" } });
    expect(screen.queryByRole("alert")).toBeNull();
    click("Save note");
    expect(store.get(position)).toBe("Fixed");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports note-count and delete failures while leaving the dialog open", () => {
    const store = new CellNotesStore({ maxNotes: 1 });
    store.set({ rowId: "other", columnId: "x" }, "Occupied");
    const onClose = vi.fn();
    const view = render(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New" } });
    click("Save note");
    expect(screen.getByRole("alert").textContent).toContain("note count limit");
    expect(onClose).not.toHaveBeenCalled();
    view.unmount();
    const other = { rowId: "other", columnId: "x" };
    vi.spyOn(store, "delete").mockImplementation(() => {
      throw new Error("Delete failed");
    });
    render(<CellNoteDialog store={store} position={other} onClose={onClose} />);
    click("Delete note");
    expect(screen.getByRole("alert").textContent).toBe("Delete failed");
    expect(store.get(other)).toBe("Occupied");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows read errors without crashing and rereads when the target cell changes", () => {
    const store = new CellNotesStore();
    const bad = { rowId: "", columnId: "revenue" };
    const onClose = vi.fn();
    const view = render(
      <CellNoteDialog store={store} position={bad} onClose={onClose} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("nonempty string");
    store.set(position, "New target");
    view.rerender(
      <CellNoteDialog store={store} position={position} onClose={onClose} />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "New target",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses showModal before setting open and closes the native modal on unmount", () => {
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
        <CellNoteDialog
          store={new CellNotesStore()}
          position={position}
          onClose={vi.fn()}
        />,
      );
      expect(show).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(screen.getByRole("textbox"));
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

  it("treats HTML-like note text and labels as text without creating executable elements", () => {
    const store = new CellNotesStore();
    const payload =
      '<img src=x onerror="alert(1)"><script>window.pwned=true</script>';
    store.set(position, payload);
    render(
      <CellNoteDialog
        store={store}
        position={position}
        columnLabel="<b>Revenue</b>"
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      payload,
    );
    expect(
      document.querySelector("dialog img,dialog script,dialog b"),
    ).toBeNull();
    click("Save note");
    expect(store.get(position)).toBe(payload);
  });
});
