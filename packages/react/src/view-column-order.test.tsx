// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { createGrid, type GridModel } from "../../core/src/index";
import { useCellRanges } from "./use-cell-ranges";
import { useFind } from "./use-find";
type Row = { id: string; x: number; y: number; z: number };
const make = () =>
  createGrid({
    rows: [
      { id: "a", x: 1, y: 2, z: 3 },
      { id: "b", x: 4, y: 5, z: 6 },
    ],
    columns: ["x", "y", "z"].map((id) => ({
      id,
      field: id as "x" | "y" | "z",
      type: "number" as const,
      editable: true,
      valueFormatter: (value: unknown) => `match ${value}`,
    })),
    getRowId: (row) => row.id,
  });
type RangeTools = ReturnType<typeof useCellRanges<Row>>;
type FindTools = ReturnType<typeof useFind<Row>>;
function Harness({
  model,
  columnIds,
  capture,
}: {
  model: GridModel<Row>;
  columnIds: readonly string[];
  capture: (ranges: RangeTools, find: FindTools) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const ranges = useCellRanges({
    model,
    rowIds: ["a", "b"],
    columnIds,
    enabled: true,
    viewport,
    getFocusedCell: () => ({ rowId: "a", columnId: "x" }),
    onMessage: () => {},
  });
  const find = useFind(model, ["a", "b"], undefined, columnIds);
  useLayoutEffect(() => {
    capture(ranges, find);
  });
  return (
    <div
      ref={viewport}
      role="grid"
      dir="rtl"
      style={{ width: 300, height: 300, overflow: "auto" }}
    >
      <div role="row">
        {columnIds.map((columnId) => (
          <div
            role="gridcell"
            tabIndex={0}
            key={columnId}
            data-row-id="a"
            data-column-id={columnId}
            onPointerDown={(event) =>
              ranges.begin(event, { rowId: "a", columnId })
            }
          >
            {columnId}
          </div>
        ))}
      </div>
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("view-order hook integration", () => {
  it("preserves controllers, range IDs and active Find match during a runtime view reversal", () => {
    const model = make();
    let ranges!: RangeTools, find!: FindTools;
    const capture = (nextRanges: RangeTools, nextFind: FindTools) => {
      ranges = nextRanges;
      find = nextFind;
    };
    const view = render(
      <Harness model={model} columnIds={["x", "y", "z"]} capture={capture} />,
    );
    act(() => {
      ranges.selectAll();
      find.controller!.setQuery("match");
      find.controller!.select(0);
    });
    const rangeController = ranges.controller,
      findController = find.controller;
    view.rerender(
      <Harness model={model} columnIds={["z", "y", "x"]} capture={capture} />,
    );
    expect(ranges.controller).toBe(rangeController);
    expect(find.controller).toBe(findController);
    expect(ranges.range).toEqual({
      anchor: { rowId: "a", columnId: "x" },
      focus: { rowId: "b", columnId: "z" },
    });
    expect(ranges.selectedCellCount).toBe(6);
    expect(ranges.controller!.copy()).toBe("3\t2\t1\r\n6\t5\t4");
    expect(find.snapshot.query).toBe("match");
    expect(find.snapshot.activeIndex).toBe(2);
    expect(find.snapshot.matches[2]).toEqual({ rowId: "a", columnId: "x" });
  });
  it("handles synchronous hiding before rendered view refs have updated", () => {
    const model = make();
    let ranges!: RangeTools, find!: FindTools;
    render(
      <Harness
        model={model}
        columnIds={["x", "y", "z"]}
        capture={(nextRanges, nextFind) => {
          ranges = nextRanges;
          find = nextFind;
        }}
      />,
    );
    act(() => {
      ranges.selectAll();
      find.controller!.setQuery("match");
    });
    act(() => {
      model.hideColumn("y", true);
    });
    expect(ranges.range).not.toBeNull();
    expect(ranges.selectedCellCount).toBe(4);
    expect(ranges.controller!.copy()).toBe("1\t3\r\n4\t6");
    expect(find.snapshot.matches).toHaveLength(4);
    expect(find.snapshot.matches.every((match) => match.columnId !== "y")).toBe(
      true,
    );
  });
  it("uses physical edge deltas with negative native RTL scrollLeft instead of inverting them", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(
      <Harness model={make()} columnIds={["z", "y", "x"]} capture={() => {}} />,
    );
    const viewport = screen.getByRole("grid"),
      cell = screen.getByRole("gridcell", { name: "z" });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 300,
      top: 0,
      bottom: 300,
      width: 300,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    viewport.scrollLeft = -100;
    fireEvent.pointerDown(cell, { button: 0, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { clientX: 2, clientY: 150 });
    expect(scheduled).toBeTypeOf("function");
    act(() => {
      scheduled!(0);
    });
    expect(viewport.scrollLeft).toBe(-124);
    fireEvent.pointerMove(window, { clientX: 299, clientY: 150 });
    act(() => {
      scheduled!(16);
    });
    expect(viewport.scrollLeft).toBe(-100);
    fireEvent.pointerCancel(window);
  });
});
