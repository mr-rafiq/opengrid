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

type Row = { id: string; x: number; y: number };
type Tools = ReturnType<typeof useCellRanges<Row>>;
const beforePoint = Object.getOwnPropertyDescriptor(
  document,
  "elementFromPoint",
);
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 11;
    this.pointerType = options.pointerType ?? "touch";
    this.isPrimary = options.isPrimary ?? true;
  }
}
const make = () =>
  createGrid({
    rows: [20, 25, 12, 13, 14].map((x, index) => ({
      id: String.fromCharCode(97 + index),
      x,
      y: index + 2,
    })),
    columns: [
      { id: "x", field: "x", type: "number", editable: true },
      { id: "y", field: "y", type: "number", editable: true },
    ],
    getRowId: (row) => row.id,
  });
function Harness({
  model,
  capture,
  columnIds = ["x", "y"],
  rowIds = ["a", "b", "c", "d", "e"],
  direction = "ltr",
}: {
  model: GridModel<Row>;
  capture: (tools: Tools) => void;
  columnIds?: readonly string[];
  rowIds?: string[];
  direction?: "ltr" | "rtl";
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const tools = useCellRanges({
    model,
    rowIds,
    columnIds,
    viewport,
    enabled: true,
    getFocusedCell: () => ({ rowId: "a", columnId: "x" }),
    onMessage: () => {},
  });
  useLayoutEffect(() => {
    capture(tools);
  });
  return (
    <div ref={viewport} role="grid" dir={direction}>
      {rowIds.map((rowId) => (
        <div role="row" key={rowId}>
          {columnIds.map((columnId) => (
            <div
              role="gridcell"
              tabIndex={0}
              key={columnId}
              data-row-id={rowId}
              data-column-id={columnId}
              onPointerDown={(event) => tools.begin(event, { rowId, columnId })}
            >
              {rowId}-{columnId}
            </div>
          ))}
        </div>
      ))}
      <button
        type="button"
        aria-label="Fill handle"
        onPointerDown={tools.fillHandle}
      >
        Fill
      </button>
    </div>
  );
}
function setup() {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  const model = make();
  let tools!: Tools;
  const capture = (value: Tools) => {
    tools = value;
  };
  const view = render(<Harness model={model} capture={capture} />);
  const viewport = screen.getByRole("grid"),
    handle = screen.getByRole("button", { name: "Fill handle" });
  const captured = new Set<number>();
  const setCapture = vi.fn((id: number) => {
    captured.add(id);
  });
  const releaseCapture = vi.fn((id: number) => {
    captured.delete(id);
  });
  Object.defineProperties(viewport, {
    setPointerCapture: { configurable: true, value: setCapture },
    hasPointerCapture: {
      configurable: true,
      value: (id: number) => captured.has(id),
    },
    releasePointerCapture: { configurable: true, value: releaseCapture },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    right: 400,
    top: 0,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  });
  const cell = (rowId: string, columnId = "x") =>
    screen.getByRole("gridcell", { name: `${rowId}-${columnId}` });
  let pointed: Element | null = cell("a");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => pointed,
  });
  const pointer = (
    target: Node | Window,
    type: string,
    options: PointerEventInit = {},
  ) => {
    const event = new TestPointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      clientX: 200,
      clientY: 150,
      ...options,
    });
    fireEvent(target, event);
    return event;
  };
  const point = (rowId: string, columnId = "x") => {
    pointed = cell(rowId, columnId);
  };
  const source = () => {
    act(() => {
      tools.controller!.setRange(
        { rowId: "a", columnId: "x" },
        { rowId: "b", columnId: "x" },
      );
    });
  };
  const extend = (options: PointerEventInit = {}) => {
    point("e");
    pointer(window, "pointermove", { clientY: 300, ...options });
  };
  const end = (options: PointerEventInit = {}) =>
    pointer(window, "pointerup", { clientY: 300, ...options });
  const tick = () => {
    const [id, callback] = frames.entries().next().value!;
    frames.delete(id);
    act(() => callback(16));
  };
  return {
    model,
    view,
    viewport,
    handle,
    cell,
    pointer,
    point,
    source,
    extend,
    end,
    tick,
    frames,
    setCapture,
    releaseCapture,
    captured,
    capture,
    get tools() {
      return tools;
    },
    set pointed(value: Element | null) {
      pointed = value;
    },
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (beforePoint)
    Object.defineProperty(document, "elementFromPoint", beforePoint);
  else Reflect.deleteProperty(document, "elementFromPoint");
});
describe("touch range mode", () => {
  it("leaves ordinary touch body gestures to native panning without capture or preview changes", () => {
    const test = setup();
    test.source();
    const before = test.tools.range;
    const event = test.pointer(test.cell("c"), "pointerdown");
    expect(event.defaultPrevented).toBe(false);
    expect(test.setCapture).not.toHaveBeenCalled();
    test.extend();
    test.pointer(window, "pointercancel");
    expect(test.tools.range).toEqual(before);
    expect(test.frames.size).toBe(0);
    expect(test.model.getRows().map((row) => row.x)).toEqual([
      20, 25, 12, 13, 14,
    ]);
    expect(test.model.undo()).toBe(false);
  });
  it("supports anchor tap, native scroll and endpoint tap through explicit extension mode", () => {
    const test = setup();
    test.pointer(test.cell("a", "x"), "pointerdown");
    test.pointer(window, "pointerup");
    act(() => {
      test.tools.select({ rowId: "a", columnId: "x" });
    });
    act(() => {
      test.tools.setExtendOnTap(true);
    });
    expect(test.tools.range).toEqual({
      anchor: { rowId: "a", columnId: "x" },
      focus: { rowId: "a", columnId: "x" },
    });
    test.viewport.scrollTop = 500;
    fireEvent.scroll(test.viewport);
    test.pointer(test.cell("e", "y"), "pointerdown", { pointerId: 12 });
    test.pointer(window, "pointerup", { pointerId: 12 });
    act(() => {
      test.tools.select({ rowId: "e", columnId: "y" });
    });
    expect(test.tools.range).toEqual({
      anchor: { rowId: "a", columnId: "x" },
      focus: { rowId: "e", columnId: "y" },
    });
    expect(test.tools.selectedCellCount).toBe(10);
    expect(test.setCapture).not.toHaveBeenCalled();
    act(() => {
      test.tools.setExtendOnTap(false);
    });
    act(() => {
      test.tools.select({ rowId: "a", columnId: "x" });
    });
    expect(test.tools.selectedCellCount).toBe(1);
    expect(test.model.undo()).toBe(false);
  });
  it("keeps explicit desktop/keyboard extension flags independent of tap mode", () => {
    const test = setup();
    act(() => {
      test.tools.setExtendOnTap(true);
    });
    act(() => {
      test.tools.select({ rowId: "a", columnId: "x" }, false);
      test.tools.select({ rowId: "c", columnId: "y" }, true);
    });
    expect(test.tools.selectedCellCount).toBe(6);
    act(() => {
      test.tools.select({ rowId: "d", columnId: "x" });
    });
    expect(test.tools.range!.anchor).toEqual({ rowId: "a", columnId: "x" });
    expect(test.tools.selectedCellCount).toBe(4);
    act(() => {
      test.tools.select({ rowId: "d", columnId: "x" }, false);
    });
    expect(test.tools.selectedCellCount).toBe(1);
  });
});
describe("owned pointer filling", () => {
  it("captures a primary touch fill and commits the selected series as one undoable transaction", () => {
    const test = setup();
    test.source();
    act(() => {
      test.tools.setFillMode("series");
    });
    const batch = vi.spyOn(test.model, "batchEdit");
    const down = test.pointer(test.handle, "pointerdown");
    expect(down.defaultPrevented).toBe(true);
    expect(test.setCapture).toHaveBeenCalledWith(11);
    test.extend();
    expect(test.tools.selectedCellCount).toBe(5);
    test.end();
    expect(test.model.getRows().map((row) => row.x)).toEqual([
      20, 25, 30, 35, 40,
    ]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(test.releaseCapture).toHaveBeenCalledWith(11);
    expect(test.frames.size).toBe(0);
    test.end();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(test.model.undo()).toBe(true);
    expect(test.model.getRows().map((row) => row.x)).toEqual([
      20, 25, 12, 13, 14,
    ]);
    expect(test.model.undo()).toBe(false);
  });
  it("snapshots the chosen fill mode at gesture start and preserves desktop Alt series", () => {
    const test = setup();
    test.source();
    test.pointer(test.handle, "pointerdown");
    act(() => {
      test.tools.setFillMode("series");
    });
    test.extend();
    test.end();
    expect(test.model.getRows().map((row) => row.x)).toEqual([
      20, 25, 20, 25, 20,
    ]);
    act(() => {
      test.model.undo();
      test.tools.setFillMode("copy");
    });
    test.source();
    test.pointer(test.handle, "pointerdown", {
      pointerType: "mouse",
      pointerId: 2,
    });
    test.extend({ pointerType: "mouse", pointerId: 2 });
    test.end({ pointerType: "mouse", pointerId: 2, altKey: true });
    expect(test.model.getRows().map((row) => row.x)).toEqual([
      20, 25, 30, 35, 40,
    ]);
  });
  it("ignores foreign move/up/cancel and lost capture on a different target", () => {
    const test = setup();
    test.source();
    const batch = vi.spyOn(test.model, "batchEdit");
    test.pointer(test.handle, "pointerdown");
    test.point("e");
    test.pointer(window, "pointermove", { pointerId: 99 });
    test.pointer(window, "pointerup", { pointerId: 99 });
    test.pointer(window, "pointercancel", { pointerId: 99 });
    test.pointer(test.cell("c"), "lostpointercapture");
    expect(test.tools.selectedCellCount).toBe(2);
    expect(batch).not.toHaveBeenCalled();
    expect(test.captured.has(11)).toBe(true);
    test.extend();
    test.end();
    expect(batch).toHaveBeenCalledTimes(1);
  });
  it("rejects secondary contacts and secondary-button fill starts", () => {
    const test = setup();
    test.source();
    test.pointer(test.handle, "pointerdown", { isPrimary: false });
    expect(test.setCapture).not.toHaveBeenCalled();
    test.pointer(window, "pointerup", { isPrimary: false });
    test.pointer(test.handle, "pointerdown", {
      pointerType: "pen",
      button: 2,
      buttons: 2,
    });
    expect(test.setCapture).not.toHaveBeenCalled();
    test.pointer(window, "pointerup", { pointerType: "pen", button: 2 });
    expect(test.model.undo()).toBe(false);
  });
  it("fails closed if pointer capture cannot be acquired", () => {
    const test = setup();
    test.source();
    test.setCapture.mockImplementation(() => {
      throw new Error("Capture denied");
    });
    const batch = vi.spyOn(test.model, "batchEdit");
    test.pointer(test.handle, "pointerdown");
    test.extend();
    test.end();
    expect(test.tools.selectedCellCount).toBe(2);
    expect(batch).not.toHaveBeenCalled();
    expect(test.frames.size).toBe(0);
  });
  it.each([
    "cancel",
    "lost",
    "escape",
    "second",
    "outside",
    "model",
    "view",
    "direction",
    "blur",
    "unmount",
  ] as const)(
    "cancels %s without writing data and restores the source preview",
    (reason) => {
      const test = setup();
      test.source();
      const controller = test.tools.controller!;
      const before = controller.getSnapshot().range;
      const batch = vi.spyOn(test.model, "batchEdit");
      test.pointer(test.handle, "pointerdown");
      test.extend();
      expect(test.tools.selectedCellCount).toBe(5);
      if (reason === "cancel") test.pointer(window, "pointercancel");
      else if (reason === "lost") {
        test.captured.delete(11);
        test.pointer(test.viewport, "lostpointercapture");
      } else if (reason === "escape")
        fireEvent.keyDown(test.cell("e"), { key: "Escape" });
      else if (reason === "second")
        test.pointer(test.cell("c"), "pointerdown", {
          pointerId: 22,
          isPrimary: false,
        });
      else if (reason === "outside") {
        test.pointed = null;
        test.end();
      } else if (reason === "model")
        act(() => {
          test.model.resizeColumn("x", 180);
        });
      else if (reason === "view")
        test.view.rerender(
          <Harness
            model={test.model}
            capture={test.capture}
            columnIds={["y", "x"]}
          />,
        );
      else if (reason === "direction")
        test.view.rerender(
          <Harness model={test.model} capture={test.capture} direction="rtl" />,
        );
      else if (reason === "blur") fireEvent(window, new Event("blur"));
      else test.view.unmount();
      test.end();
      expect(controller.getSnapshot().range).toEqual(before);
      expect(batch).not.toHaveBeenCalled();
      expect(test.model.getRows().map((row) => row.x)).toEqual([
        20, 25, 12, 13, 14,
      ]);
      expect(test.frames.size).toBe(0);
    },
  );
  it("recovers after all contacts from an interrupted multi-touch gesture release", () => {
    const test = setup();
    test.source();
    test.pointer(test.handle, "pointerdown");
    test.extend();
    test.pointer(test.cell("c"), "pointerdown", {
      pointerId: 22,
      isPrimary: false,
    });
    test.end();
    test.pointer(window, "pointerup", { pointerId: 22, isPrimary: false });
    test.pointer(test.handle, "pointerdown", { pointerId: 31 });
    test.extend({ pointerId: 31 });
    test.end({ pointerId: 31 });
    expect(test.model.getRows().map((row) => row.x)).toEqual([
      20, 25, 20, 25, 20,
    ]);
    expect(test.model.undo()).toBe(true);
    expect(test.model.undo()).toBe(false);
  });
  it("recovers after window blur even when the operating system never delivers the old pointerup", () => {
    const test = setup();
    test.source();
    const batch = vi.spyOn(test.model, "batchEdit");
    test.pointer(test.handle, "pointerdown");
    test.extend();
    fireEvent(window, new Event("blur"));
    expect(test.tools.selectedCellCount).toBe(2);
    expect(batch).not.toHaveBeenCalled();
    expect(test.frames.size).toBe(0);
    test.pointer(test.handle, "pointerdown", { pointerId: 31 });
    test.pointer(window, "pointerup", { pointerId: 11 });
    test.extend({ pointerId: 31 });
    test.end({ pointerId: 31 });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(test.model.getRows().map((row) => row.x)).toEqual([
      20, 25, 20, 25, 20,
    ]);
  });
});
describe("desktop range dragging", () => {
  it.each(["mouse", "pen"])(
    "preserves %s drag selection and restores the previous selection on cancellation",
    (type) => {
      const test = setup();
      act(() => {
        test.tools.select({ rowId: "b", columnId: "y" }, false);
      });
      const before = test.tools.range;
      test.pointer(test.cell("a"), "pointerdown", {
        pointerType: type,
        pointerId: 2,
      });
      expect(test.setCapture).not.toHaveBeenCalled();
      test.point("c", "y");
      test.pointer(window, "pointermove", { pointerType: type, pointerId: 2 });
      expect(test.tools.selectedCellCount).toBe(6);
      test.pointer(window, "pointercancel", {
        pointerType: type,
        pointerId: 2,
      });
      expect(test.tools.range).toEqual(before);
      expect(test.model.undo()).toBe(false);
      test.pointer(test.cell("a"), "pointerdown", {
        pointerType: type,
        pointerId: 3,
      });
      test.point("c", "y");
      test.pointer(window, "pointermove", { pointerType: type, pointerId: 3 });
      test.pointer(window, "pointerup", { pointerType: type, pointerId: 3 });
      expect(test.tools.selectedCellCount).toBe(6);
      expect(test.model.undo()).toBe(false);
    },
  );
  it("keeps physical edge deltas unchanged for native negative RTL scrollLeft", () => {
    const test = setup();
    test.view.rerender(
      <Harness model={test.model} capture={test.capture} direction="rtl" />,
    );
    test.viewport.scrollLeft = -100;
    test.pointer(test.cell("a"), "pointerdown", {
      pointerType: "mouse",
      pointerId: 2,
    });
    test.point("b");
    test.pointer(window, "pointermove", {
      pointerType: "mouse",
      pointerId: 2,
      clientX: 2,
      clientY: 150,
    });
    test.tick();
    expect(test.viewport.scrollLeft).toBe(-124);
    test.pointer(window, "pointercancel", {
      pointerType: "mouse",
      pointerId: 2,
    });
    expect(test.frames.size).toBe(0);
  });
});
