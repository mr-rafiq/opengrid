// @vitest-environment jsdom
import { StrictMode } from "react";
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
import { DataGrid } from "./data-grid";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
interface Row {
  id: string;
  name: string;
  amount: number;
}
const originals: Row[] = ["a", "b", "c", "d"].map((id, index) => ({
  id,
  name: id.toUpperCase(),
  amount: index + 1,
}));
const columns: Column<Row>[] = [
  {
    id: "name",
    field: "name",
    header: "Name",
    editable: true,
    pinned: "left",
    width: 140,
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    width: 140,
  },
];
function model(patch: Partial<GridOptions<Row>> = {}) {
  return createGrid({
    rows: originals,
    columns,
    getRowId: (row) => row.id,
    ...patch,
  });
}
function order(grid: ReturnType<typeof model>) {
  return grid.getRows().map((row) => row.id);
}
function cell(id: string, column = "name", container: ParentNode = document) {
  return container.querySelector<HTMLDivElement>(
    `[data-row-id="${id}"][data-column-id="${column}"]`,
  )!;
}
function row(id: string, container: ParentNode = document) {
  return container.querySelector<HTMLDivElement>(
    `.og-row[data-row-key="${id}"]`,
  )!;
}
function handle(id: string) {
  return screen.getByRole("button", {
    name: `Drag row ${id}`,
  }) as HTMLButtonElement;
}
function transfer() {
  const values = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
    types: [],
  } as unknown as DataTransfer;
}
function bounds(element: HTMLElement, top = 100, height = 40) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: top,
    left: 0,
    right: 300,
    top,
    bottom: top + height,
    width: 300,
    height,
    toJSON() {
      return {};
    },
  });
}
function dispatchDrag(
  element: Element,
  type: string,
  data: DataTransfer,
  clientY: number,
  clientX = 30,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "dataTransfer", { value: data });
  return fireEvent(element, event);
}
function drag(
  source: string,
  target: string,
  position: "before" | "after" = "after",
  data = transfer(),
) {
  const targetRow = row(target);
  bounds(targetRow);
  dispatchDrag(handle(source), "dragstart", data, 110);
  dispatchDrag(targetRow, "dragover", data, position === "before" ? 101 : 139);
  return {
    data,
    targetRow,
    drop: () =>
      dispatchDrag(targetRow, "drop", data, position === "before" ? 101 : 139),
  };
}

describe("managed row moves", () => {
  it("moves by native drag once on drop, preserves objects/selection and supplies one undo", () => {
    const grid = model(),
      onRowMove = vi.fn();
    grid.selectRows(["a", "c"]);
    render(<DataGrid model={grid} rowDragging onRowMove={onRowMove} />);
    const before = grid.getRows();
    const gesture = drag("a", "c");
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    expect(row("c").dataset.rowDropPosition).toBe("after");
    gesture.drop();
    expect(order(grid)).toEqual(["b", "c", "a", "d"]);
    expect(grid.getRow("a")).toBe(before[0]);
    expect(grid.getState().selected).toEqual(["a", "c"]);
    expect(onRowMove).toHaveBeenCalledExactlyOnceWith({
      rowIds: ["a"],
      targetRowId: "c",
      position: "after",
    });
    expect(document.activeElement).toBe(cell("a"));
    act(() => {
      expect(grid.undo()).toBe(true);
    });
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    expect(grid.undo()).toBe(false);
    expect(document.querySelector(".og-row-drop-indicator")).toBeNull();
  });
  it("supports before-target drops and suppresses no-op callbacks/history", () => {
    const grid = model(),
      callback = vi.fn();
    render(<DataGrid model={grid} rowDragging onRowMove={callback} />);
    drag("d", "b", "before").drop();
    expect(order(grid)).toEqual(["a", "d", "b", "c"]);
    act(() => grid.undo());
    const snapshot = grid.getState();
    callback.mockClear();
    drag("a", "a", "before").drop();
    expect(grid.getState()).toBe(snapshot);
    expect(callback).not.toHaveBeenCalled();
    act(() => {
      expect(grid.redo()).toBe(true);
    });
    expect(order(grid)).toEqual(["a", "d", "b", "c"]);
  });
  it("moves from data cells using Alt arrows without replacing range anchors or logical focus", () => {
    const grid = model(),
      ranges = vi.fn();
    render(<DataGrid model={grid} rowDragging onCellRangeChange={ranges} />);
    fireEvent.click(cell("a", "amount"));
    fireEvent.click(cell("c", "amount"), { shiftKey: true });
    act(() => cell("a", "amount").focus());
    fireEvent.keyDown(cell("a", "amount"), { key: "ArrowDown", altKey: true });
    expect(order(grid)).toEqual(["b", "a", "c", "d"]);
    expect(document.activeElement).toBe(cell("a", "amount"));
    expect(ranges.mock.calls.at(-1)?.[0]).toEqual({
      anchor: { rowId: "a", columnId: "amount" },
      focus: { rowId: "c", columnId: "amount" },
    });
    const setData = vi.fn();
    fireEvent.copy(cell("a", "amount"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "1\r\n3");
    act(() => grid.undo());
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
  });
  it("supports Alt arrows on drag handles and accessible toolbar moves", () => {
    const grid = model();
    render(<DataGrid model={grid} rowDragging />);
    act(() => handle("b").focus());
    fireEvent.keyDown(handle("b"), { key: "ArrowUp", altKey: true });
    expect(order(grid)).toEqual(["b", "a", "c", "d"]);
    expect(document.activeElement).toBe(handle("b"));
    expect(
      (
        screen.getByRole("button", {
          name: "Move focused row up",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Move focused row down" }),
    );
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    expect(document.activeElement).toBe(cell("b"));
    fireEvent.keyDown(cell("b"), { key: "z", ctrlKey: true });
    expect(order(grid)).toEqual(["b", "a", "c", "d"]);
    fireEvent.keyDown(cell("b"), { key: "y", ctrlKey: true });
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps pagination moves within the current page and preserves off-page order", () => {
    const grid = model({ initialState: { pageSize: 2, page: 1 } });
    render(<DataGrid model={grid} rowDragging />);
    act(() => cell("c").focus());
    fireEvent.keyDown(cell("c"), { key: "ArrowUp", altKey: true });
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    expect(grid.undo()).toBe(false);
    fireEvent.keyDown(cell("c"), { key: "ArrowDown", altKey: true });
    expect(order(grid)).toEqual(["a", "b", "d", "c"]);
    expect(grid.getState().page).toBe(1);
    expect(model().getPageCount()).toBe(1);
  });
  it("keeps one logical controls gutter with or without row selection", () => {
    const grid = model();
    const view = render(<DataGrid model={grid} rowDragging />);
    expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe("3");
    expect(cell("a").getAttribute("aria-colindex")).toBe("2");
    expect(cell("a").style.left).toBe("76px");
    expect(screen.getByRole("checkbox", { name: "Select row a" })).toBeTruthy();
    view.rerender(<DataGrid model={grid} rowDragging selectionMode="none" />);
    expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe("3");
    expect(cell("a").style.left).toBe("32px");
    expect(screen.queryByRole("checkbox", { name: "Select row a" })).toBeNull();
    expect(handle("a")).toBeTruthy();
  });
  it("does not change the default grid when dragging is disabled", () => {
    render(<DataGrid model={model()} />);
    expect(screen.queryByRole("button", { name: "Drag row a" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Move focused row up" }),
    ).toBeNull();
    expect(cell("a").style.left).toBe("44px");
  });
  it("announces core failures without changing order or invoking the success callback", () => {
    const grid = model(),
      callback = vi.fn();
    vi.spyOn(grid, "moveRows").mockReturnValue("Move rejected by host");
    render(<DataGrid model={grid} rowDragging onRowMove={callback} />);
    drag("a", "c").drop();
    expect(screen.getByRole("alert").textContent).toBe("Move rejected by host");
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("eligibility and ownership", () => {
  it("keeps selection-only updates during a drag without treating them as stale row order", () => {
    const grid = model();
    render(<DataGrid model={grid} rowDragging />);
    const gesture = drag("a", "c");
    act(() => grid.selectRows(["b", "d"]));
    gesture.drop();
    expect(order(grid)).toEqual(["b", "c", "a", "d"]);
    expect(grid.getState().selected).toEqual(["b", "d"]);
  });
  it("rejects a source from an old page even while the new page remains reorderable", () => {
    const grid = model({ initialState: { pageSize: 2 } });
    const move = vi.spyOn(grid, "moveRows");
    render(<DataGrid model={grid} rowDragging />);
    const gesture = drag("a", "b");
    act(() => grid.setState({ page: 1 }));
    dispatchDrag(row("d"), "drop", gesture.data, 130);
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    expect(move).not.toHaveBeenCalled();
  });
  it("isolates an active outer drag from nested-grid targets and nested drags from the outer grid", () => {
    const outer = model(),
      inner = model();
    const outerMove = vi.spyOn(outer, "moveRows"),
      innerMove = vi.spyOn(inner, "moveRows");
    render(
      <DataGrid
        model={outer}
        rowDragging
        ariaLabel="Outer reorder"
        renderCell={({ row: data, column, value }) =>
          data.id === "a" && column.id === "name" ? (
            <DataGrid
              model={inner}
              rowDragging
              ariaLabel="Inner reorder"
              toolbar={false}
            />
          ) : (
            String(value)
          )
        }
      />,
    );
    const outerGrid = screen.getByRole("grid", { name: "Outer reorder" }),
      innerGrid = screen.getByRole("grid", { name: "Inner reorder" });
    const outerBody = outerGrid.querySelector(".og-body")!;
    const outerB = outerBody.querySelector<HTMLElement>(
        ':scope > .og-row[data-row-key="b"]',
      )!,
      outerC = outerBody.querySelector<HTMLElement>(
        ':scope > .og-row[data-row-key="c"]',
      )!;
    const ownHandle = outerB.querySelector<HTMLButtonElement>(
        ".og-row-drag-handle",
      )!,
      innerHandle = innerGrid.querySelector<HTMLButtonElement>(
        ".og-row-drag-handle",
      )!;
    const data = transfer();
    dispatchDrag(ownHandle, "dragstart", data, 100);
    dispatchDrag(row("c", innerGrid), "drop", data, 130);
    fireEvent.dragEnd(ownHandle);
    dispatchDrag(innerHandle, "dragstart", data, 100);
    dispatchDrag(outerC, "drop", data, 130);
    fireEvent.dragEnd(innerHandle);
    expect(outerMove).not.toHaveBeenCalled();
    expect(innerMove).not.toHaveBeenCalled();
    expect(order(outer)).toEqual(["a", "b", "c", "d"]);
    expect(order(inner)).toEqual(["a", "b", "c", "d"]);
  });
  it.each([
    "sorting",
    "filtering",
    "grouping",
    "tree-data",
    "external-filter",
    "read-only",
  ] as const)(
    "shows authoritative %s reasons and disables both gesture and controls",
    (reason) => {
      const grid = model();
      vi.spyOn(grid, "getRowReorderStatus").mockReturnValue({
        allowed: false,
        reason,
        message: `Blocked: ${reason}`,
      });
      const move = vi.spyOn(grid, "moveRows");
      render(<DataGrid model={grid} rowDragging />);
      expect(screen.getByText(`Blocked: ${reason}`)).toBeTruthy();
      expect(handle("a").draggable).toBe(false);
      expect(handle("a").disabled).toBe(true);
      fireEvent.keyDown(cell("a"), { key: "ArrowDown", altKey: true });
      expect(move).not.toHaveBeenCalled();
    },
  );
  it("blocks actual pinned/full-width rows, expanded details, active editing and missing columns visibly", () => {
    const grid = model();
    const view = render(
      <DataGrid model={grid} rowDragging pinnedTopRowIds={["a"]} />,
    );
    expect(screen.getByText(/Remove pinned rows from this view/)).toBeTruthy();
    view.rerender(
      <DataGrid
        model={grid}
        rowDragging
        isFullWidthRow={(node) => node.id === "a"}
        renderFullWidthRow={() => "Full row"}
      />,
    );
    expect(screen.getByText(/Turn off full-width rows/)).toBeTruthy();
    view.rerender(
      <DataGrid
        model={grid}
        rowDragging
        renderDetail={() => "Details"}
        expandedDetailRows={["a"]}
      />,
    );
    expect(screen.getByText(/Close detail panels/)).toBeTruthy();
    view.rerender(<DataGrid model={grid} rowDragging />);
    fireEvent.keyDown(cell("a"), { key: "F2" });
    expect(screen.getByText(/Finish or cancel editing/)).toBeTruthy();
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Edit Name row a" }),
      { key: "Escape" },
    );
    act(() => {
      grid.hideColumn("name", true);
      grid.hideColumn("amount", true);
    });
    expect(screen.getByText(/Show a data column/)).toBeTruthy();
  });
  it("rejects foreign payloads and cross-grid drops without accepting column or nested-grid drags", () => {
    const left = model(),
      right = model();
    render(
      <>
        <DataGrid model={left} rowDragging ariaLabel="Left" />
        <DataGrid model={right} rowDragging ariaLabel="Right" />
      </>,
    );
    const leftGrid = screen.getByRole("grid", { name: "Left" }),
      rightGrid = screen.getByRole("grid", { name: "Right" });
    const data = transfer();
    const leftHandle = leftGrid.querySelector<HTMLButtonElement>(
      ".og-row-drag-handle",
    )!;
    fireEvent.dragStart(leftHandle, { dataTransfer: data });
    const rightRow = row("c", rightGrid);
    bounds(rightRow);
    fireEvent.dragOver(rightRow, { dataTransfer: data, clientY: 130 });
    fireEvent.drop(rightRow, { dataTransfer: data, clientY: 130 });
    expect(order(right)).toEqual(["a", "b", "c", "d"]);
    fireEvent.dragEnd(leftHandle);
    const fake = transfer();
    fake.setData("application/x-opengrid-managed-row", "foreign");
    const target = row("c", leftGrid);
    fireEvent.drop(target, { dataTransfer: fake });
    expect(order(left)).toEqual(["a", "b", "c", "d"]);
  });
  it("rejects a tampered nonce and cancels stale page/view drags", () => {
    const grid = model();
    render(<DataGrid model={grid} rowDragging />);
    const source = drag("a", "c");
    source.data.setData("application/x-opengrid-managed-row", "wrong nonce");
    source.drop();
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    const next = drag("a", "c");
    act(() => grid.setSort("amount", "desc"));
    fireEvent.drop(row("c"), { dataTransfer: next.data, clientY: 130 });
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
    expect(grid.undo()).toBe(false);
    expect(document.querySelector('[data-row-dragging="true"]')).toBeNull();
  });
  it("cancels on native dragend, Escape, model replacement and unmount", () => {
    const grid = model();
    const view = render(<DataGrid model={grid} rowDragging />);
    drag("a", "c");
    fireEvent.dragEnd(handle("a"));
    expect(document.querySelector(".og-row-drop-indicator")).toBeNull();
    drag("a", "c");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector('[data-row-dragging="true"]')).toBeNull();
    drag("a", "c");
    view.rerender(<DataGrid model={model()} rowDragging />);
    expect(document.querySelector(".og-row-drop-indicator")).toBeNull();
    view.unmount();
    expect(order(grid)).toEqual(["a", "b", "c", "d"]);
  });
  it("supports StrictMode without duplicate history or move callbacks", () => {
    const grid = model(),
      callback = vi.fn();
    render(
      <StrictMode>
        <DataGrid model={grid} rowDragging onRowMove={callback} />
      </StrictMode>,
    );
    fireEvent.keyDown(cell("a"), { key: "ArrowDown", altKey: true });
    expect(order(grid)).toEqual(["b", "a", "c", "d"]);
    expect(callback).toHaveBeenCalledTimes(1);
    act(() => grid.undo());
    expect(grid.undo()).toBe(false);
  });
  it("auto-scrolls only near owned body edges and cancels its animation frame on cleanup", () => {
    const frames: FrameRequestCallback[] = [];
    const cancel = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const grid = model();
    const view = render(<DataGrid model={grid} rowDragging height={200} />);
    const viewport = screen.getByRole("grid");
    bounds(viewport, 0, 200);
    Object.defineProperty(viewport, "clientHeight", {
      value: 200,
      configurable: true,
    });
    const gesture = drag("a", "d");
    dispatchDrag(gesture.targetRow, "dragover", gesture.data, 195);
    act(() => frames.shift()!(0));
    expect(viewport.scrollTop).toBe(16);
    dispatchDrag(document.body, "dragover", gesture.data, 195);
    act(() => frames.shift()!(1));
    expect(viewport.scrollTop).toBe(16);
    expect(document.querySelector(".og-row-drop-indicator")).toBeNull();
    view.unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
