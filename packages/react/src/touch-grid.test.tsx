// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid, type Column } from "../../core/src/index";
import { DataGrid } from "./data-grid";

type Row = { id: string; name: string; amount: number };
const rows: Row[] = [
  { id: "a", name: "Alpha", amount: 1 },
  { id: "b", name: "Beta", amount: 2 },
  { id: "c", name: "Gamma", amount: 3 },
];
const columns: Column<Row>[] = [
  {
    id: "name",
    field: "name",
    header: "Name",
    width: 140,
    editable: true,
    groupPath: ["Info"],
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    width: 100,
    type: "number",
    editable: true,
    groupPath: ["Info"],
  },
];
const make = (schema = columns) =>
  createGrid({ rows, columns: schema, getRowId: (row) => row.id });
const cell = (id = "a", column = "name") =>
  document.querySelector<HTMLElement>(
    `[data-row-id="${id}"][data-column-id="${column}"]`,
  )!;
function pointer(
  target: Node | Window,
  type: string,
  patch: {
    pointerId?: number;
    isPrimary?: boolean;
    x?: number;
    y?: number;
    pointerType?: string;
  } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: patch.x ?? 100,
    clientY: patch.y ?? 100,
  });
  Object.defineProperties(event, {
    pointerId: { value: patch.pointerId ?? 1 },
    pointerType: { value: patch.pointerType ?? "touch" },
    isPrimary: { value: patch.isPrimary ?? true },
  });
  return fireEvent(target, event);
}
function click(target: Element, detail = 1) {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail,
  });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  fireEvent(target, event);
}
function tap(target: Element, id = 1) {
  pointer(target, "pointerdown", { pointerId: id });
  pointer(target, "pointerup", { pointerId: id });
  click(target);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("native-friendly touch grid interaction", () => {
  it("allows a real mouse double-click immediately after touch on a hybrid device", () => {
    render(<DataGrid model={make()} />);
    tap(cell());
    pointer(cell(), "pointerdown", { pointerType: "mouse", pointerId: 20 });
    pointer(cell(), "pointerup", { pointerType: "mouse", pointerId: 20 });
    fireEvent.doubleClick(cell());
    expect(within(cell()).getByRole("textbox")).toBeTruthy();
  });
  it("recovers after window blur interrupts contacts without pointer-up events", () => {
    render(<DataGrid model={make()} />);
    pointer(cell(), "pointerdown", { pointerId: 1 });
    pointer(cell("b"), "pointerdown", { pointerId: 2, isPrimary: false });
    fireEvent.blur(window);
    tap(cell(), 3);
    expect(document.activeElement).toBe(cell());
    expect(within(cell()).queryByRole("textbox")).toBeNull();
    tap(cell(), 4);
    expect(within(cell()).getByRole("textbox")).toBeTruthy();
  });
  it("selects completed taps without preventing native pointer pan or mutating row data", () => {
    const grid = make(),
      ranges = vi.fn();
    render(<DataGrid model={grid} onCellRangeChange={ranges} />);
    expect(pointer(cell("b", "amount"), "pointerdown")).toBe(true);
    pointer(cell("b", "amount"), "pointerup");
    click(cell("b", "amount"));
    expect(document.activeElement).toBe(cell("b", "amount"));
    expect(ranges.mock.calls.at(-1)?.[0]).toEqual({
      anchor: { rowId: "b", columnId: "amount" },
      focus: { rowId: "b", columnId: "amount" },
    });
    expect(grid.getRow("b")?.amount).toBe(2);
  });
  it("double-taps the same editable cell and suppresses a duplicate compatibility dblclick", () => {
    render(<DataGrid model={make()} />);
    tap(cell());
    tap(cell(), 2);
    const input = within(cell()).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Keep draft" } });
    fireEvent.doubleClick(cell());
    expect(within(cell()).getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Keep draft");
  });
  it("does not double-tap edit after movement, scroll, cancellation, long press or a different cell", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    render(<DataGrid model={make()} />);
    tap(cell());
    pointer(cell(), "pointerdown");
    pointer(cell(), "pointermove", { x: 125 });
    pointer(cell(), "pointerup");
    click(cell());
    tap(cell());
    expect(within(cell()).queryByRole("textbox")).toBeNull();
    pointer(cell(), "pointerdown");
    fireEvent.scroll(screen.getByRole("grid"));
    pointer(cell(), "pointerup");
    click(cell());
    tap(cell());
    expect(within(cell()).queryByRole("textbox")).toBeNull();
    pointer(cell(), "pointerdown");
    pointer(cell(), "pointercancel");
    pointer(cell(), "pointerup");
    click(cell());
    tap(cell());
    expect(within(cell()).queryByRole("textbox")).toBeNull();
    pointer(cell(), "pointerdown");
    now += 600;
    pointer(cell(), "pointerup");
    click(cell());
    tap(cell());
    expect(within(cell()).queryByRole("textbox")).toBeNull();
    tap(cell("b"));
    expect(within(cell("b")).queryByRole("textbox")).toBeNull();
  });
  it("rejects secondary contacts and lost capture until the cancelled gesture has ended", () => {
    render(<DataGrid model={make()} />);
    pointer(cell(), "pointerdown", { pointerId: 1 });
    pointer(cell("b"), "pointerdown", { pointerId: 2, isPrimary: false });
    pointer(cell("b"), "pointerup", { pointerId: 2, isPrimary: false });
    pointer(cell(), "pointerup", { pointerId: 1 });
    click(cell());
    tap(cell());
    expect(within(cell()).queryByRole("textbox")).toBeNull();
    pointer(cell(), "pointerdown");
    pointer(cell(), "lostpointercapture");
    pointer(cell(), "pointerup");
    click(cell());
    tap(cell());
    expect(within(cell()).queryByRole("textbox")).toBeNull();
  });
  it("ignores interactive renderer descendants and provides an explicit Edit cell fallback", () => {
    const clicked = vi.fn();
    render(
      <DataGrid
        model={make()}
        renderCell={({ value }) => (
          <>
            <span>{String(value)}</span>
            <button onClick={clicked}>App action</button>
          </>
        )}
      />,
    );
    const button = within(cell()).getByRole("button", { name: "App action" });
    tap(button);
    tap(button, 2);
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(within(cell()).queryByRole("textbox")).toBeNull();
    tap(cell());
    fireEvent.click(screen.getByRole("button", { name: "Edit cell" }));
    expect(within(cell()).getByRole("textbox")).toBeTruthy();
  });
  it("extends a fresh range by explicit taps across scrolling and exposes copy/series fill choices", () => {
    const changed = vi.fn();
    render(<DataGrid model={make()} onCellRangeChange={changed} />);
    tap(cell("a", "amount"));
    fireEvent.click(screen.getByRole("button", { name: "Extend range" }));
    expect(
      screen
        .getByRole("button", { name: "Extend range" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByText(/Tap a cell to extend the current range/),
    ).toBeTruthy();
    tap(cell("b", "amount"));
    fireEvent.scroll(screen.getByRole("grid"));
    tap(cell("c", "amount"));
    expect(changed.mock.calls.at(-1)?.[0]).toEqual({
      anchor: { rowId: "a", columnId: "amount" },
      focus: { rowId: "c", columnId: "amount" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Fill mode" }), {
      target: { value: "series" },
    });
    expect(
      (screen.getByRole("combobox", { name: "Fill mode" }) as HTMLSelectElement)
        .value,
    ).toBe("series");
    const setData = vi.fn();
    fireEvent.copy(cell("c", "amount"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "1\r\n2\r\n3");
  });
  it("previews merged widths without model writes and commits once only on valid release", () => {
    const grid = make([{ ...columns[0], colSpan: 2 }, columns[1]]),
      resize = vi.spyOn(grid, "resizeColumn");
    render(<DataGrid model={grid} />);
    const handle = screen.getByRole("separator", { name: "Resize Name" });
    pointer(handle, "pointerdown", { x: 100 });
    pointer(window, "pointermove", { x: 140 });
    expect(resize).not.toHaveBeenCalled();
    expect(cell().style.width).toBe("280px");
    pointer(window, "pointerup", { x: 140 });
    expect(resize).toHaveBeenCalledExactlyOnceWith("name", 180);
    expect(cell().style.width).toBe("280px");
    pointer(handle, "pointerdown", { x: 100 });
    pointer(window, "pointermove", { x: 130 });
    pointer(window, "pointercancel", { x: 130 });
    expect(resize).toHaveBeenCalledTimes(1);
    expect(cell().style.width).toBe("280px");
  });
  it("discards resize previews on direction flips and preserves an existing cell draft", () => {
    const grid = make(),
      resize = vi.spyOn(grid, "resizeColumn");
    const view = render(<DataGrid model={grid} />);
    const handle = screen.getByRole("separator", { name: "Resize Name" });
    pointer(handle, "pointerdown");
    pointer(window, "pointermove", { x: 130 });
    view.rerender(<DataGrid model={grid} direction="rtl" />);
    pointer(window, "pointerup", { x: 130 });
    expect(resize).not.toHaveBeenCalled();
    expect(cell().style.width).toBe("140px");
    fireEvent.click(screen.getByRole("button", { name: "Edit cell" }));
    const input = within(cell()).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Draft" } });
    expect(
      screen
        .getByRole("separator", { name: "Resize Name" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    pointer(handle, "pointerdown");
    pointer(window, "pointermove", { x: 60 });
    pointer(window, "pointerup", { x: 60 });
    expect(resize).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("Draft");
  });
  it("does not consume row-grip touch pan and retains button-based row movement", () => {
    const grid = make();
    render(<DataGrid model={grid} rowDragging />);
    const grip = screen.getByRole("button", {
      name: "Drag row b",
    }) as HTMLButtonElement;
    expect(pointer(grip, "pointerdown")).toBe(true);
    expect(grip.draggable).toBe(false);
    pointer(grip, "pointerup");
    act(() => grip.focus());
    fireEvent.click(
      screen.getByRole("button", { name: "Move focused row up" }),
    );
    expect(grid.getRows().map((row) => row.id)).toEqual(["b", "a", "c"]);
    expect(
      screen.getByText(/On touch screens, use Move focused row/),
    ).toBeTruthy();
  });
  it("cancels an in-flight fill before opening an editor so release cannot write under the draft", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    tap(cell("a", "amount"));
    const handle = screen.getByRole("button", {
      name: "Drag to fill cells; Alt-drag extends a numeric series",
    });
    pointer(handle, "pointerdown");
    fireEvent.keyDown(cell("a", "amount"), { key: "F2" });
    expect(within(cell("a", "amount")).getByRole("spinbutton")).toBeTruthy();
    pointer(window, "pointermove", { y: 200 });
    pointer(window, "pointerup", { y: 200 });
    expect(grid.getRows().map((row) => row.amount)).toEqual([1, 2, 3]);
    expect(grid.undo()).toBe(false);
    expect(within(cell("a", "amount")).getByRole("spinbutton")).toBeTruthy();
  });
});
