// @vitest-environment jsdom
import { createRef, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type GridEditRequest } from "@opengrid/core";
import { DataGrid } from "./data-grid";
import type { DataGridViewController } from "./index";
afterEach(cleanup);
const pos = (rowId: string, columnId = "name") => ({ rowId, columnId });
function model() {
  return createGrid({
    rows: [
      { id: "a", name: "Alpha", amount: 2 },
      { id: "b", name: "Beta", amount: 5 },
    ],
    columns: [
      { id: "name", field: "name", editable: true },
      {
        id: "amount",
        field: "amount",
        editable: true,
        type: "number",
        validate: (value) => (Number(value) < 0 ? "Positive only" : undefined),
      },
    ],
    getRowId: (row) => row.id,
  });
}
describe("mounted client view controller", () => {
  it("rejects reentrant commit notifications without submitting a duplicate host request", () => {
    const requests: GridEditRequest<{ id: string; name: string }>[] = [];
    const grid = createGrid({
      rows: [{ id: "a", name: "Before" }],
      getRowId: (row) => row.id,
      columns: [{ id: "name", field: "name", editable: true }],
      onEditRequest: (request) => {
        requests.push(request);
      },
    });
    const ref = createRef<DataGridViewController>();
    let notices = 0;
    const nested: boolean[] = [];
    render(
      <DataGrid
        model={grid}
        viewRef={ref}
        selectionMode="none"
        onCellEdit={() => {
          if (++notices === 1) nested.push(ref.current!.stopEditing());
        }}
      />,
    );
    act(() => {
      ref.current!.startEditingCell(pos("a"));
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Edit name row a" }), {
      target: { value: "Once" },
    });
    act(() => {
      expect(ref.current!.stopEditing()).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(notices).toBe(1);
    expect(nested).toEqual([false]);
  });
  it("keeps its identity across state changes and invalidates old model/unmounted handles", () => {
    const grid = model(),
      ref = createRef<DataGridViewController>();
    const view = render(
      <StrictMode>
        <DataGrid model={grid} viewRef={ref} selectionMode="none" />
      </StrictMode>,
    );
    const first = ref.current!;
    expect(first.isActive()).toBe(true);
    act(() => grid.hideColumn("amount", true));
    expect(ref.current).toBe(first);
    expect(first.focusCell(pos("a", "amount"))).toBe(false);
    const replacement = model();
    view.rerender(
      <StrictMode>
        <DataGrid model={replacement} viewRef={ref} selectionMode="none" />
      </StrictMode>,
    );
    expect(first.isActive()).toBe(false);
    expect(first.focusCell(pos("a"))).toBe(false);
    expect(first.getScrollPosition()).toBeNull();
    const current = ref.current!;
    expect(current).not.toBe(first);
    expect(current.isActive()).toBe(true);
    view.unmount();
    expect(current.isActive()).toBe(false);
    expect(current.stopEditing()).toBe(false);
    expect(ref.current).toBeNull();
  });

  it("focuses both virtual axes and reports the logical cell synchronously", () => {
    const grid = createGrid({
      rows: Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        name: `Row ${i}`,
      })),
      columns: Array.from({ length: 40 }, (_, i) => ({
        id: `c${i}`,
        field: "name" as const,
        width: 150,
      })),
      getRowId: (row) => row.id,
      initialState: { pageSize: 1000 },
    });
    const ref = createRef<DataGridViewController>();
    render(
      <DataGrid model={grid} viewRef={ref} height={180} selectionMode="none" />,
    );
    act(() => {
      expect(ref.current!.focusCell(pos("700", "c35"))).toBe(true);
      expect(ref.current!.getFocusedCell()).toEqual(pos("700", "c35"));
    });
    expect(document.activeElement?.getAttribute("data-row-id")).toBe("700");
    expect(document.activeElement?.getAttribute("data-column-id")).toBe("c35");
    expect(ref.current!.getScrollPosition()!.top).toBeGreaterThan(0);
    expect(ref.current!.getScrollPosition()!.left).toBeGreaterThan(0);
    expect(Object.isFrozen(ref.current!.getFocusedCell())).toBe(true);
  });

  it("reveals without moving logical focus or extending the selected range", () => {
    const grid = model(),
      ref = createRef<DataGridViewController>(),
      ranges = vi.fn();
    render(
      <DataGrid
        model={grid}
        viewRef={ref}
        selectionMode="none"
        onCellRangeChange={ranges}
      />,
    );
    act(() => grid.selectRows(["b"]));
    act(() => ref.current!.focusCell(pos("a")));
    const before = ref.current!.getFocusedCell(),
      selected = grid.getState().selected,
      rangeBefore = ranges.mock.calls.at(-1)?.[0],
      callsBefore = ranges.mock.calls.length;
    act(() => {
      expect(ref.current!.revealCell(pos("b", "amount"))).toBe(true);
      expect(ref.current!.revealRow("b")).toBe(true);
    });
    expect(ref.current!.getFocusedCell()).toEqual(before);
    expect(grid.getState().selected).toBe(selected);
    expect(ranges.mock.calls.at(-1)?.[0]).toEqual(rangeBefore);
    expect(ranges).toHaveBeenCalledTimes(callsBefore);
    expect(ref.current!.revealCell(pos("missing"))).toBe(false);
    expect(ref.current!.revealRow("missing")).toBe(false);
  });

  it("commits, retains validation errors and cancels through the active editor", () => {
    const grid = model(),
      ref = createRef<DataGridViewController>();
    render(<DataGrid model={grid} viewRef={ref} selectionMode="none" />);
    act(() => {
      expect(ref.current!.startEditingCell(pos("a", "amount"))).toBe(true);
    });
    expect(ref.current!.getEditingCell()).toEqual(pos("a", "amount"));
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "-4" },
    });
    act(() => {
      expect(ref.current!.stopEditing()).toBe(false);
    });
    expect(screen.getByRole("alert").textContent).toBe("Positive only");
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "12" },
    });
    act(() => {
      expect(ref.current!.stopEditing()).toBe(true);
    });
    expect(grid.getRow("a")?.amount).toBe(12);
    expect(ref.current!.getEditingCell()).toBeNull();
    act(() => {
      expect(
        ref.current!.startEditingCell(pos("a"), { initialText: "Discard" }),
      ).toBe(true);
    });
    act(() => {
      expect(ref.current!.stopEditing({ cancel: true })).toBe(true);
    });
    expect(grid.getRow("a")?.name).toBe("Alpha");
  });

  it("does not reset a draft when asked to start the already active cell", () => {
    const grid = model(),
      ref = createRef<DataGridViewController>();
    render(<DataGrid model={grid} viewRef={ref} selectionMode="none" />);
    act(() => ref.current!.startEditingCell(pos("a")));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit name row a" }), {
      target: { value: "Kept" },
    });
    act(() => {
      expect(ref.current!.startEditingCell(pos("a"))).toBe(true);
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Edit name row a",
        }) as HTMLInputElement
      ).value,
    ).toBe("Kept");
  });

  it("routes a covered column to its real merged owner", () => {
    const grid = createGrid({
      rows: [{ id: "a", name: "Owner" }],
      getRowId: (row) => row.id,
      columns: [
        { id: "owner", field: "name", editable: true, colSpan: 2 },
        { id: "covered", field: "name", editable: true },
      ],
    });
    const ref = createRef<DataGridViewController>();
    render(<DataGrid model={grid} viewRef={ref} selectionMode="none" />);
    act(() => {
      expect(ref.current!.focusCell(pos("a", "covered"))).toBe(true);
    });
    expect(ref.current!.getFocusedCell()).toEqual(pos("a", "owner"));
    act(() => {
      expect(ref.current!.startEditingCell(pos("a", "covered"))).toBe(true);
    });
    expect(ref.current!.getEditingCell()).toEqual(pos("a", "owner"));
  });

  it("keeps row modals/read-only cells outside startEditingCell", () => {
    const grid = model(),
      ref = createRef<DataGridViewController>();
    const view = render(<DataGrid model={grid} viewRef={ref} editMode="row" />);
    expect(ref.current!.startEditingCell(pos("a"))).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<DataGrid model={grid} viewRef={ref} />);
    act(() => grid.setReadOnly(true));
    expect(ref.current!.startEditingCell(pos("a"))).toBe(false);
  });

  it("rejects invalid scroll/position input and returns frozen actual offsets", () => {
    const ref = createRef<DataGridViewController>();
    const view = render(
      <DataGrid model={model()} viewRef={ref} selectionMode="none" />,
    );
    const viewport = view.container.querySelector<HTMLElement>(".og-viewport")!;
    Object.defineProperties(viewport, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 200, configurable: true },
      scrollWidth: { value: 2000, configurable: true },
      clientWidth: { value: 500, configurable: true },
    });
    for (const position of [{ top: -1 }, { left: NaN }, { top: Infinity }, {}])
      expect(ref.current!.scrollTo(position)).toBe(false);
    expect(ref.current!.focusCell(null as never)).toBe(false);
    act(() => {
      expect(ref.current!.scrollTo({ top: 9999, left: 9999 })).toBe(true);
    });
    expect(ref.current!.getScrollPosition()).toEqual({ top: 800, left: 1500 });
    expect(Object.isFrozen(ref.current!.getScrollPosition())).toBe(true);
  });

  it("submits typed custom values through the view stop command", () => {
    const object = { key: "old" },
      next = { key: "new" },
      requests: GridEditRequest<{ id: string; value: typeof object }>[] = [];
    const grid = createGrid({
      rows: [{ id: "a", value: object }],
      getRowId: (row) => row.id,
      columns: [
        {
          id: "value",
          editable: true,
          valueGetter: (row) => row.value,
          valueFormatter: (value) => (value as typeof object).key,
        },
      ],
      onEditRequest: (request) => {
        requests.push(request);
      },
    });
    const ref = createRef<DataGridViewController>();
    render(
      <DataGrid
        model={grid}
        viewRef={ref}
        selectionMode="none"
        renderEditor={(props) => (
          <button
            type="button"
            onClick={() => {
              props.onRawChange?.(next);
              ref.current!.stopEditing();
            }}
          >
            Choose
          </button>
        )}
      />,
    );
    act(() => {
      expect(ref.current!.startEditingCell(pos("a", "value"))).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: /^Choose$/ }));
    expect(requests).toHaveLength(1);
    expect(requests[0].edits[0].value).toBe(next);
    expect(grid.getRow("a")?.value).toBe(object);
  });

  it("restores focus after a synchronous host acknowledgement changes source rows", () => {
    type Row = { id: string; name: string };
    let grid: ReturnType<typeof createGrid<Row>>;
    grid = createGrid<Row>({
      rows: [{ id: "a", name: "Before" }],
      getRowId: (row) => row.id,
      columns: [{ id: "name", field: "name", editable: true }],
      onEditRequest: (request) => {
        grid.applyTransaction({
          update: request.edits.map((edit) => ({
            id: edit.rowId,
            name: String(edit.value),
          })),
        });
      },
    });
    const ref = createRef<DataGridViewController>();
    render(<DataGrid model={grid} viewRef={ref} selectionMode="none" />);
    act(() => {
      expect(ref.current!.startEditingCell(pos("a"))).toBe(true);
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Edit name row a" }), {
      target: { value: "Acknowledged" },
    });
    act(() => {
      expect(ref.current!.stopEditing()).toBe(true);
    });
    expect(grid.getRow("a")?.name).toBe("Acknowledged");
    expect(ref.current!.isActive()).toBe(true);
    expect(ref.current!.getEditingCell()).toBeNull();
    expect(document.activeElement?.getAttribute("data-row-id")).toBe("a");
    expect(document.activeElement?.getAttribute("data-column-id")).toBe("name");
  });
});
