// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { createGrid, type Column } from "../../core/src/index";
import { DataGrid } from "./data-grid";
import { GridLocaleProvider, esES } from "./locale";

type Row = { id: string; [key: string]: string };
const row: Row = {
  id: "one",
  l1: "L1",
  l2: "L2",
  c1: "C1",
  c2: "C2",
  r1: "R1",
  r2: "R2",
};
const columns: Column<Row>[] = [
  {
    id: "l1",
    field: "l1",
    header: "Left 1",
    pinned: "left",
    width: 80,
    groupPath: ["Left"],
  },
  {
    id: "l2",
    field: "l2",
    header: "Left 2",
    pinned: "left",
    width: 90,
    groupPath: ["Left"],
  },
  {
    id: "c1",
    field: "c1",
    header: "Center 1",
    width: 100,
    editable: true,
    groupPath: ["Center"],
  },
  {
    id: "c2",
    field: "c2",
    header: "Center 2",
    width: 110,
    editable: true,
    groupPath: ["Center"],
  },
  {
    id: "r1",
    field: "r1",
    header: "Right 1",
    pinned: "right",
    width: 120,
    groupPath: ["Right"],
  },
  {
    id: "r2",
    field: "r2",
    header: "Right 2",
    pinned: "right",
    width: 130,
    groupPath: ["Right"],
  },
];
const make = (schema = columns, rows = [row]) =>
  createGrid({ rows, columns: schema, getRowId: (value) => value.id });
function cell(column: string, id = "one", root: ParentNode = document) {
  return root.querySelector<HTMLElement>(
    `[data-row-id="${id}"][data-column-id="${column}"]`,
  );
}
function ids() {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.og-row[data-row-key="one"] > [data-column-id]',
    ),
  ].map((node) => node.dataset.columnId);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("explicit RTL DataGrid presentation", () => {
  it("keeps locale independent from direction and preserves physical pin regions with a right gutter", () => {
    const grid = make();
    const before = grid.getState();
    render(<DataGrid model={grid} direction="rtl" virtualizeColumns={false} />);
    expect(screen.getByRole("grid").getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("grid").closest("section")?.lang).toBe("en-US");
    expect(ids()).toEqual(["r1", "r2", "c1", "c2", "l1", "l2"]);
    expect(cell("r1")?.style.right).toBe("44px");
    expect(cell("r2")?.style.right).toBe("164px");
    expect(cell("l1")?.style.left).toBe("90px");
    expect(cell("l2")?.style.left).toBe("0px");
    expect(cell("r1")?.getAttribute("aria-colindex")).toBe("2");
    expect(cell("l2")?.getAttribute("aria-colindex")).toBe("7");
    expect(grid.getState()).toBe(before);
  });
  it("uses LTR by default even inside an RTL document or Spanish provider", () => {
    render(
      <div dir="rtl">
        <GridLocaleProvider locale={esES}>
          <DataGrid model={make()} virtualizeColumns={false} />
        </GridLocaleProvider>
      </div>,
    );
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("dir")).toBe("ltr");
    expect(grid.closest("section")?.lang).toBe("es-ES");
    expect(ids()).toEqual(["l1", "l2", "c1", "c2", "r1", "r2"]);
  });
  it("maps physical arrow keys while keeping Home, End and editing Tab in inline order", () => {
    render(
      <DataGrid model={make()} direction="rtl" virtualizeColumns={false} />,
    );
    act(() => cell("c1")!.focus());
    fireEvent.keyDown(cell("c1")!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell("c2"));
    fireEvent.keyDown(cell("c2")!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("c1"));
    fireEvent.keyDown(cell("c1")!, { key: "Home" });
    expect(document.activeElement).toBe(cell("r1"));
    fireEvent.keyDown(cell("r1")!, { key: "End" });
    expect(document.activeElement).toBe(cell("l2"));
    fireEvent.doubleClick(cell("c1")!);
    fireEvent.keyDown(within(cell("c1")!).getByRole("textbox"), { key: "Tab" });
    expect(document.activeElement).toBe(cell("c2"));
  });
  it("normalizes negative browser scroll offsets and navigates to virtual columns", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    const schema: Column<Row>[] = Array.from({ length: 30 }, (_, index) => ({
      id: `v${index}`,
      valueGetter: () => String(index),
      width: 100,
    }));
    render(
      <DataGrid
        model={make(schema)}
        direction="rtl"
        selectionMode="none"
        columnOverscan={0}
      />,
    );
    const grid = screen.getByRole("grid");
    grid.scrollLeft = -800;
    fireEvent.scroll(grid);
    expect(grid.scrollLeft).toBe(-800);
    expect(cell("v8")?.getAttribute("aria-colindex")).toBe("9");
    expect(cell("v20")).toBeNull();
    act(() => cell("v8")!.focus());
    fireEvent.keyDown(cell("v8")!, { key: "End" });
    expect(document.activeElement).toBe(cell("v29"));
    expect(grid.scrollLeft).toBeLessThan(-2000);
    fireEvent.keyDown(cell("v29")!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("v28"));
    fireEvent.keyDown(cell("v28")!, { key: "Home" });
    expect(document.activeElement).toBe(cell("v0"));
    expect(grid.scrollLeft).toBe(0);
  });
  it("mirrors keyboard and pointer resizing at the inline end without changing physical pin settings", () => {
    const grid = make();
    render(<DataGrid model={grid} direction="rtl" virtualizeColumns={false} />);
    const resize = screen.getByRole("separator", { name: "Resize Center 1" });
    fireEvent.keyDown(resize, { key: "ArrowLeft" });
    expect(grid.getState().columnWidths.c1).toBe(110);
    fireEvent.keyDown(resize, { key: "ArrowRight" });
    expect(grid.getState().columnWidths.c1).toBe(100);
    fireEvent(
      resize,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }),
    );
    fireEvent(window, new MouseEvent("pointermove", { clientX: 75 }));
    fireEvent(window, new MouseEvent("pointerup"));
    expect(grid.getState().columnWidths.c1).toBe(125);
    expect(grid.getColumns().find((column) => column.id === "r1")?.pinned).toBe(
      "right",
    );
  });
  it("preserves a focused draft and undo history during runtime direction changes", () => {
    const grid = make();
    const view = render(
      <DataGrid model={grid} direction="ltr" virtualizeColumns={false} />,
    );
    act(() => cell("c1")!.focus());
    fireEvent.keyDown(cell("c1")!, { key: "F2" });
    const editor = within(cell("c1")!).getByRole("textbox");
    fireEvent.change(editor, { target: { value: "Draft" } });
    const before = grid.getState();
    view.rerender(
      <DataGrid model={grid} direction="rtl" virtualizeColumns={false} />,
    );
    expect(within(cell("c1")!).getByRole("textbox")).toBe(editor);
    expect((editor as HTMLInputElement).value).toBe("Draft");
    expect(document.activeElement).toBe(editor);
    expect(grid.getState()).toBe(before);
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(grid.getRow("one")?.c1).toBe("Draft");
    expect(document.activeElement).toBe(cell("c2"));
    act(() => grid.undo());
    expect(grid.getRow("one")?.c1).toBe("C1");
    view.rerender(
      <DataGrid model={grid} direction="ltr" virtualizeColumns={false} />,
    );
    expect(document.activeElement).toBe(cell("c2"));
  });
  it("moves chooser columns in physical left and right directions under RTL", () => {
    render(
      <DataGrid model={make()} direction="rtl" virtualizeColumns={false} />,
    );
    const chooser = screen.getByText("Columns").closest("details")!;
    chooser.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Move Center 1 left" }));
    expect(ids()).toEqual(["r1", "r2", "c2", "c1", "l1", "l2"]);
    fireEvent.click(
      screen.getByRole("button", { name: "Move Center 1 right" }),
    );
    expect(ids()).toEqual(["r1", "r2", "c1", "c2", "l1", "l2"]);
  });
  it("does not restart asynchronous editors or remount focused group toggles on a direction flip", async () => {
    let resolve!: (value: readonly { value: string; label: string }[]) => void;
    const provider = vi.fn(
      () =>
        new Promise<readonly { value: string; label: string }[]>((done) => {
          resolve = done;
        }),
    );
    const options = { c1: { type: "select" as const, asyncOptions: provider } };
    const grid = make();
    const view = render(
      <DataGrid
        model={grid}
        direction="ltr"
        virtualizeColumns={false}
        editorOptions={options}
      />,
    );
    const group = screen.getByRole("button", {
      name: "Collapse column group Right",
    });
    act(() => group.focus());
    view.rerender(
      <DataGrid
        model={grid}
        direction="rtl"
        virtualizeColumns={false}
        editorOptions={options}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Collapse column group Right" }),
    ).toBe(group);
    expect(document.activeElement).toBe(group);
    fireEvent.doubleClick(cell("c1")!);
    await waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
    const control = within(cell("c1")!).getByRole("combobox");
    view.rerender(
      <DataGrid
        model={grid}
        direction="ltr"
        virtualizeColumns={false}
        editorOptions={options}
      />,
    );
    expect(provider).toHaveBeenCalledTimes(1);
    expect(within(cell("c1")!).getByRole("combobox")).toBe(control);
    await act(async () =>
      resolve([{ value: "C1", label: "Application choice" }]),
    );
    expect(
      within(cell("c1")!).getByRole("option", { name: "Application choice" }),
    ).toBeTruthy();
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("preserves range IDs while copying and Find follow the supplied inline column order", () => {
    const grid = make(),
      changed = vi.fn();
    const view = render(
      <DataGrid
        model={grid}
        direction="ltr"
        virtualizeColumns={false}
        onCellRangeChange={changed}
      />,
    );
    act(() => cell("l1")!.focus());
    fireEvent.keyDown(cell("l1")!, { key: "a", ctrlKey: true });
    const range = changed.mock.calls.at(-1)?.[0],
      before = grid.getState();
    view.rerender(
      <DataGrid
        model={grid}
        direction="rtl"
        virtualizeColumns={false}
        onCellRangeChange={changed}
      />,
    );
    expect(changed.mock.calls.at(-1)?.[0]).toEqual(range);
    expect(grid.getState()).toBe(before);
    const setData = vi.fn();
    fireEvent.copy(cell("l1")!, { clipboardData: { setData } });
    expect(setData).toHaveBeenLastCalledWith("text/plain", "R2\tC1\tC2\tL1");
    fireEvent.keyDown(cell("l1")!, { key: "a", ctrlKey: true });
    fireEvent.copy(cell("l1")!, { clipboardData: { setData } });
    expect(setData).toHaveBeenLastCalledWith(
      "text/plain",
      "R1\tR2\tC1\tC2\tL1\tL2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Find in current view" }),
      { target: { value: "1" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Next find match" }));
    expect(document.activeElement).toBe(cell("c1"));
  });
  it("keeps merged column owners and grouped headers aligned with physical RTL pins", () => {
    const schema = columns.map((column) => ({
      ...column,
      colSpan: ["r1", "c1", "l1"].includes(column.id) ? 2 : undefined,
    }));
    render(
      <DataGrid
        model={make(schema)}
        direction="rtl"
        virtualizeColumns={false}
      />,
    );
    expect(cell("r1")?.style.width).toBe("250px");
    expect(cell("r1")?.style.right).toBe("44px");
    expect(cell("l1")?.style.width).toBe("170px");
    expect(cell("l1")?.style.left).toBe("0px");
    expect(cell("c1")?.getAttribute("aria-colspan")).toBe("2");
    expect(cell("c2")).toBeNull();
    const group = screen
      .getByRole("button", { name: "Collapse column group Right" })
      .closest<HTMLElement>('[role="columnheader"]')!;
    expect(group.style.right).toBe("44px");
    expect(group.getAttribute("aria-colindex")).toBe("2");
    act(() => cell("r1")!.focus());
    fireEvent.keyDown(cell("r1")!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell("c1"));
  });
  it("retains only the visible part of a pinned row-span owner when vertically scrolled in RTL", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
    const schema = columns.map((column) => ({
      ...column,
      spanRows: column.id === "r1",
    }));
    const rows = Array.from({ length: 120 }, (_, index) => ({
      ...row,
      id: `item${index}`,
    }));
    render(
      <DataGrid
        model={make(schema, rows)}
        direction="rtl"
        pagination={false}
        height={200}
        overscan={1}
      />,
    );
    const grid = screen.getByRole("grid");
    grid.scrollTop = 2000;
    fireEvent.scroll(grid);
    const anchor = grid.querySelector<HTMLElement>(
      '[data-row-span-anchor-only="true"]',
    )!;
    expect(anchor).toBeTruthy();
    expect(within(anchor).getAllByRole("gridcell")).toHaveLength(1);
    expect(cell("r1", "item0")?.style.right).toBe("44px");
    expect(cell("r1", "item0")?.getAttribute("aria-rowspan")).toBe("120");
    expect(within(anchor).queryByRole("checkbox")).toBeNull();
  });
  it("retains focused filters while direction changes and keeps nested default-LTR grids isolated", () => {
    const grid = make();
    const view = render(
      <DataGrid model={grid} direction="ltr" virtualizeColumns={false} />,
    );
    const filter = screen.getByRole("textbox", { name: "Filter Center 1" });
    act(() => filter.focus());
    fireEvent.change(filter, { target: { value: "C1" } });
    view.rerender(
      <DataGrid model={grid} direction="rtl" virtualizeColumns={false} />,
    );
    expect(screen.getByRole("textbox", { name: "Filter Center 1" })).toBe(
      filter,
    );
    expect(document.activeElement).toBe(filter);
    expect((filter as HTMLInputElement).value).toBe("C1");
    const inner = make();
    view.rerender(
      <DataGrid
        model={grid}
        direction="rtl"
        ariaLabel="Outer"
        isFullWidthRow={() => true}
        renderFullWidthRow={() => (
          <DataGrid model={inner} ariaLabel="Inner" virtualizeColumns={false} />
        )}
      />,
    );
    expect(
      screen.getByRole("grid", { name: "Outer" }).getAttribute("dir"),
    ).toBe("rtl");
    const nested = screen.getByRole("grid", { name: "Inner" });
    expect(nested.getAttribute("dir")).toBe("ltr");
    expect(cell("l1", "one", nested)?.style.left).toBe("44px");
  });
});
