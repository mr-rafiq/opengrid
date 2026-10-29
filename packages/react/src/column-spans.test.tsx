// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid, CellNotesStore, type Column } from "../../core/src/index";
import { DataGrid } from "./data-grid";

type Row = {
  id: string;
  expanded: boolean;
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
};
const source: Row[] = [
  {
    id: "one",
    expanded: true,
    a: "Caption",
    b: "covered needle",
    c: "C",
    d: "Review",
    e: "Status",
  },
  {
    id: "two",
    expanded: false,
    a: "Other",
    b: "visible needle",
    c: "D",
    d: "Check",
    e: "Done",
  },
];
function make(columns?: Column<Row>[]) {
  return createGrid({
    rows: source,
    getRowId: (row) => row.id,
    columns: columns ?? [
      {
        id: "a",
        field: "a",
        header: "Caption",
        width: 100,
        editable: true,
        colSpan: (row) => (row.expanded ? 2 : 1),
      },
      { id: "b", field: "b", header: "Value", width: 120, editable: true },
      { id: "c", field: "c", header: "Category", width: 80, editable: true },
      { id: "d", field: "d", header: "Review", width: 100, editable: true },
      { id: "e", field: "e", header: "Status", width: 100, editable: true },
    ],
  });
}
function cell(row: string, col: string, container: ParentNode = document) {
  return container.querySelector<HTMLElement>(
    `[data-row-id="${row}"][data-column-id="${col}"]`,
  );
}
function press(row: string, col: string, key: string, extra = {}) {
  fireEvent.keyDown(cell(row, col)!, { key, ...extra });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("column-spanning grid integration", () => {
  it("builds plans only for the virtual window and evicts old row plans from its bounded cache", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
    const callback = vi.fn(() => 2);
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      ...source[0],
      id: `row${index}`,
    }));
    const grid = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        { id: "a", field: "a", width: 100, colSpan: callback },
        { id: "b", field: "b", width: 100 },
        { id: "c", field: "c", width: 100 },
      ],
    });
    render(
      <DataGrid
        model={grid}
        pagination={false}
        height={200}
        overscan={2}
        rowHeight={30}
      />,
    );
    expect(callback.mock.calls.length).toBeLessThan(20);
    const viewport = screen.getByRole("grid");
    for (let step = 1; step <= 30; step++) {
      viewport.scrollTop = step * 400;
      fireEvent.scroll(viewport);
    }
    expect(callback.mock.calls.length).toBeLessThan(500);
    const before = callback.mock.calls.length;
    viewport.scrollTop = 0;
    fireEvent.scroll(viewport);
    // Returning to the initial window must recompute: retaining all visited rows
    // would pass DOM bounds but keep an unbounded per-row plan table alive.
    expect(callback.mock.calls.length).toBeGreaterThan(before);
    expect(
      document.querySelectorAll('[data-column-id="a"][data-row-id]').length,
    ).toBeLessThan(20);
  });
  it("renders only owners while headers, filters and ARIA retain original leaf positions", () => {
    render(<DataGrid model={make()} />);
    expect(cell("one", "b")).toBeNull();
    expect(cell("one", "a")?.style.width).toBe("220px");
    expect(cell("one", "a")?.getAttribute("aria-colspan")).toBe("2");
    expect(cell("one", "a")?.getAttribute("aria-colindex")).toBe("2");
    expect(cell("one", "c")?.getAttribute("aria-colindex")).toBe("4");
    expect(cell("two", "b")).toBeTruthy();
    expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe("6");
    expect(screen.getByRole("button", { name: /Sort Value/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Filter Value" })).toBeTruthy();
  });
  it("skips covered leaves horizontally and remaps vertical, End and Home targets", () => {
    render(<DataGrid model={make()} />);
    act(() => cell("one", "a")!.focus());
    press("one", "a", "ArrowRight");
    expect(document.activeElement).toBe(cell("one", "c"));
    press("one", "c", "ArrowLeft");
    expect(document.activeElement).toBe(cell("one", "a"));
    act(() => cell("two", "b")!.focus());
    press("two", "b", "ArrowUp");
    expect(document.activeElement).toBe(cell("one", "a"));
    press("one", "a", "End");
    expect(document.activeElement).toBe(cell("one", "e"));
    press("one", "e", "Home");
    expect(document.activeElement).toBe(cell("one", "a"));
  });
  it("edits owner values and Tab navigates to the next owner instead of looping", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    fireEvent.doubleClick(cell("one", "a")!);
    const editor = within(cell("one", "a")!).getByRole("textbox");
    fireEvent.change(editor, { target: { value: "Updated" } });
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(grid.getRow("one")?.a).toBe("Updated");
    expect(grid.getRow("one")?.b).toBe("covered needle");
    expect(document.activeElement).toBe(cell("one", "c"));
    fireEvent.doubleClick(cell("one", "c")!);
    fireEvent.keyDown(within(cell("one", "c")!).getByRole("textbox"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(document.activeElement).toBe(cell("one", "a"));
    act(() => grid.undo());
    expect(grid.getRow("one")?.a).toBe("Caption");
  });
  it("cancels a draft that becomes covered and restores focus to its new owner", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    act(() => cell("two", "b")!.focus());
    fireEvent.doubleClick(cell("two", "b")!);
    fireEvent.change(within(cell("two", "b")!).getByRole("textbox"), {
      target: { value: "discard this" },
    });
    act(() =>
      grid.setRows(
        source.map((row) =>
          row.id === "two" ? { ...row, expanded: true } : row,
        ),
      ),
    );
    expect(cell("two", "b")).toBeNull();
    expect(grid.getRow("two")?.b).toBe("visible needle");
    expect(document.activeElement).toBe(cell("two", "a"));
    expect(cell("two", "a")?.tabIndex).toBe(0);
  });
  it("cancels a draft when its owner is hidden and respects explicitly revealed hidden columns", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    act(() => cell("two", "c")!.focus());
    fireEvent.doubleClick(cell("two", "c")!);
    fireEvent.change(within(cell("two", "c")!).getByRole("textbox"), {
      target: { value: "discard" },
    });
    act(() => grid.hideColumn("c", true));
    expect(grid.getRow("two")?.c).toBe("D");
    expect(cell("two", "c")).toBeNull();
    act(() => grid.hideColumn("c", false));
    expect(cell("two", "c")).toBeTruthy();
  });
  it("clips at pin boundaries and computes right offsets after the merged span end", () => {
    const grid = make([
      { id: "a", field: "a", width: 100, pinned: "left", colSpan: 9 },
      { id: "b", field: "b", width: 120 },
      { id: "c", field: "c", width: 80, pinned: "right", colSpan: 2 },
      { id: "d", field: "d", width: 100, pinned: "right" },
      { id: "e", field: "e", width: 110, pinned: "right" },
    ]);
    render(<DataGrid model={grid} />);
    expect(cell("one", "a")?.style.width).toBe("100px");
    expect(cell("one", "a")?.style.left).toBe("44px");
    expect(cell("one", "c")?.style.width).toBe("180px");
    expect(cell("one", "c")?.style.right).toBe("110px");
    expect(cell("one", "d")).toBeNull();
    act(() => grid.resizeColumn("d", 140));
    expect(cell("one", "c")?.style.width).toBe("220px");
    act(() => grid.hideColumn("d", true));
    expect(cell("one", "e")).toBeNull();
    expect(cell("one", "c")?.style.right).toBe("0px");
  });
  it("keeps an offscreen anchor mounted while the merged tail intersects the horizontal viewport", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
    const columns: Column<Row>[] = Array.from({ length: 30 }, (_, index) => ({
      id: `v${index}`,
      valueGetter: () => String(index),
      width: 100,
      colSpan: index === 3 ? 9 : undefined,
    }));
    render(
      <DataGrid
        model={make(columns)}
        selectionMode="none"
        columnOverscan={0}
      />,
    );
    const viewport = screen.getByRole("grid");
    viewport.scrollLeft = 700;
    fireEvent.scroll(viewport);
    expect(cell("one", "v3")?.style.width).toBe("900px");
    expect(cell("one", "v7")).toBeNull();
    expect(cell("one", "v20")).toBeNull();
    expect(
      document.querySelectorAll('[data-row-id="one"]').length,
    ).toBeLessThan(8);
    act(() => cell("one", "v3")!.focus());
    press("one", "v3", "ArrowRight");
    expect(document.activeElement).toBe(cell("one", "v12"));
  });
  it("Find excludes covered values and refreshes match counts when ownership changes", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    fireEvent.click(screen.getByRole("button", { name: "Find", exact: true }));
    const input = screen.getByRole("textbox", { name: "Find in current view" });
    fireEvent.change(input, { target: { value: "needle" } });
    expect(screen.getByText("1 of 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next find match" }));
    expect(document.activeElement).toBe(cell("two", "b"));
    act(() => grid.setRows(source.map((row) => ({ ...row, expanded: false }))));
    expect(screen.getByText("2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next find match" }));
    expect(document.activeElement).toBe(cell("one", "b"));
  });
  it("visibly disables range clipboard and fill while keeping row selection and editor text clipboard", () => {
    const grid = make();
    render(<DataGrid model={grid} toolbar={false} />);
    expect(
      screen.getByText(/Cell ranges, grid clipboard and fill are unavailable/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row one" }));
    expect(grid.getState().selected).toEqual(["one"]);
    const setData = vi.fn(),
      getData = vi.fn(() => "pasted");
    fireEvent.copy(cell("one", "a")!, { clipboardData: { setData } });
    fireEvent.paste(cell("one", "a")!, { clipboardData: { getData } });
    press("one", "a", "a", { ctrlKey: true });
    press("one", "a", "d", { ctrlKey: true });
    expect(setData).not.toHaveBeenCalled();
    expect(getData).not.toHaveBeenCalled();
    expect(grid.getRow("one")?.a).toBe("Caption");
    expect(document.querySelector(".og-fill-handle")).toBeNull();
    fireEvent.doubleClick(cell("one", "a")!);
    const editor = within(cell("one", "a")!).getByRole("textbox");
    expect(fireEvent.copy(editor, { clipboardData: { setData } })).toBe(true);
    expect(fireEvent.paste(editor, { clipboardData: { getData } })).toBe(true);
  });
  it("keeps the separate full-row form editable for visible fields covered in the grid", () => {
    const grid = make();
    render(<DataGrid model={grid} editMode="row" />);
    fireEvent.doubleClick(cell("one", "a")!);
    const dialog = screen.getByRole("dialog");
    const value = within(dialog).getByRole("textbox", { name: "Edit Value" });
    fireEvent.change(value, { target: { value: "form edit" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save row" }));
    expect(grid.getRow("one")?.b).toBe("form edit");
    expect(cell("one", "b")).toBeNull();
  });
  it("supports pinned and full-width rows and ignores span callbacks for synthetic rows", () => {
    const callback = vi.fn((row: Row) => (row.expanded ? 2 : 1));
    const grid = make([
      { id: "a", field: "a", colSpan: callback },
      { id: "b", field: "b" },
    ]);
    render(
      <StrictMode>
        <DataGrid
          model={grid}
          pinnedTopRowIds={["one"]}
          isFullWidthRow={(node) => node.id === "two"}
          renderFullWidthRow={() => <button>Summary action</button>}
        />
      </StrictMode>,
    );
    expect(cell("one", "a")?.getAttribute("aria-colspan")).toBe("2");
    expect(
      document
        .querySelector('.og-row[data-row-key="one"]')
        ?.getAttribute("data-row-region"),
    ).toBe("top");
    expect(screen.getByRole("button", { name: "Summary action" })).toBeTruthy();
    expect(callback.mock.calls.every(([row]) => row.id === "one")).toBe(true);
  });
  it("stores notes on owner cells and renders no covered-cell note affordance", () => {
    const notes = new CellNotesStore();
    notes.set({ rowId: "one", columnId: "b" }, "Covered note");
    render(<DataGrid model={make()} notes={notes} />);
    expect(
      screen.queryByRole("button", { name: /Edit note for Value row one/ }),
    ).toBeNull();
    act(() => cell("one", "a")!.focus());
    press("one", "a", "n", { altKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), {
      target: { value: "Owner note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(notes.get({ rowId: "one", columnId: "a" })).toBe("Owner note");
    expect(notes.get({ rowId: "one", columnId: "b" })).toBe("Covered note");
  });
});
