// @vitest-environment jsdom
import {
  createRef,
  StrictMode,
  Suspense,
  startTransition,
  useState,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type Column } from "../../core/src/index";
import { DataGrid } from "./data-grid";
import type { DataGridSizingController } from "./column-sizing";

type Row = { id: string; a: string; b: string; c: string };
function model(extra: Partial<Column<Row>> = {}) {
  return createGrid({
    rows: [{ id: "one", a: "Alpha", b: "Beta", c: "Gamma" }],
    columns: [
      { id: "a", field: "a", width: 100, pinned: "left", ...extra },
      { id: "b", field: "b", flex: 1, minWidth: 50 },
      { id: "c", field: "c", flex: 2, minWidth: 50, pinned: "right" },
    ],
    getRowId: (row) => row.id,
  });
}
const cell = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-row-id="one"][data-column-id="${id}"]`,
  )!;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("React flex geometry", () => {
  it.each(["ltr", "rtl"] as const)(
    "fits all visible columns with selection controls and pinned geometry in %s",
    (direction) => {
      let width = 744,
        measure = () => {};
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
        () => width,
      );
      vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
        { width: 744 },
      ] as unknown as DOMRectList);
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: () => void) {
            measure = callback;
          }
          observe() {}
          disconnect() {}
        },
      );
      const grid = model(),
        ref = createRef<DataGridSizingController>(),
        changed = vi.fn();
      grid.subscribe(changed);
      render(
        <DataGrid
          model={grid}
          sizingRef={ref}
          toolbar={false}
          direction={direction}
        />,
      );
      let report: ReturnType<DataGridSizingController["sizeColumnsToFit"]>;
      act(() => {
        report = ref.current!.sizeColumnsToFit();
      });
      expect(report!.cancelled).toBe(false);
      const fitted = ref.current!.getWidths();
      expect(fitted.b).toBeCloseTo(fitted.c, 10);
      expect(fitted.a + fitted.b + fitted.c + 44).toBeCloseTo(width, 10);
      expect(parseFloat(cell("a").style.width)).toBeCloseTo(fitted.a, 10);
      expect(changed).toHaveBeenCalledTimes(1);
      act(() => {
        width = 1044;
        measure();
      });
      expect(ref.current!.getWidths()).toEqual(fitted);
      act(() => ref.current!.resetWidths());
      expect(ref.current!.getWidths()).toEqual({ a: 100, b: 300, c: 600 });
    },
  );
  it("keeps retained commands bound to committed widths while a replacement render suspends", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
    const original = model(),
      replacement = model({ width: 300 });
    const rendered = vi.spyOn(replacement, "getColumns"),
      ref = createRef<DataGridSizingController>();
    const pending = new Promise<never>(() => {});
    function Fence({ blocked }: { blocked: boolean }) {
      if (blocked) throw pending;
      return null;
    }
    function Harness() {
      const [replacing, setReplacing] = useState(false);
      return (
        <>
          <button onClick={() => startTransition(() => setReplacing(true))}>
            Replace concurrently
          </button>
          <Suspense fallback={<p>Loading replacement</p>}>
            <DataGrid
              model={replacing ? replacement : original}
              sizingRef={ref}
              toolbar={false}
              selectionMode="none"
            />
            <Fence blocked={replacing} />
          </Suspense>
        </>
      );
    }
    render(<Harness />);
    const retained = ref.current!,
      committed = retained.getWidths();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Replace concurrently" }),
      );
    });
    expect(rendered).toHaveBeenCalled();
    expect(screen.queryByText("Loading replacement")).toBeNull();
    expect(cell("a").style.width).toBe("100px");
    expect(ref.current).toBe(retained);
    expect(retained.getWidths()).toEqual(committed);
    expect(retained.getWidths().a).toBe(100);
  });
  it("drops an owned preview before rendering a replacement model with different columns", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
    const original = model(),
      ref = createRef<DataGridSizingController>();
    const view = render(
      <DataGrid
        model={original}
        sizingRef={ref}
        toolbar={false}
        selectionMode="none"
      />,
    );
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        button: 0,
      });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: "mouse" },
        isPrimary: { value: true },
      });
      return event;
    };
    fireEvent(
      screen.getByRole("separator", { name: "Resize b" }),
      pointer("pointerdown", 100),
    );
    fireEvent(window, pointer("pointermove", 150));
    expect(cell("b").style.width).toBe("250px");
    const next = createGrid<Row>({
      rows: [{ id: "one", a: "A", b: "B", c: "C" }],
      columns: [{ id: "replacement", field: "b", flex: 1 }],
      getRowId: (row) => row.id,
    });
    expect(() =>
      view.rerender(
        <DataGrid
          model={next}
          sizingRef={ref}
          toolbar={false}
          selectionMode="none"
        />,
      ),
    ).not.toThrow();
    fireEvent(window, pointer("pointerup", 160));
    expect(ref.current!.getWidths()).toEqual({ replacement: 700 });
    expect(original.getState().columnWidths).toEqual({});
    expect(next.getState().columnWidths).toEqual({});
  });
  it("uses measured space including controls without publishing model state, and resets manual overrides", () => {
    let width = 744,
      measure = () => {};
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => width,
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          measure = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const grid = model(),
      changed = vi.fn(),
      ref = createRef<DataGridSizingController>();
    grid.subscribe(changed);
    render(
      <StrictMode>
        <DataGrid model={grid} sizingRef={ref} toolbar={false} />
      </StrictMode>,
    );
    expect(ref.current?.getWidths()).toEqual({ a: 100, b: 200, c: 400 });
    expect(cell("b").style.width).toBe("200px");
    expect(changed).not.toHaveBeenCalled();
    act(() => {
      width = 1044;
      measure();
    });
    expect(ref.current?.getWidths()).toEqual({ a: 100, b: 300, c: 600 });
    expect(changed).not.toHaveBeenCalled();
    act(() => grid.resizeColumn("b", 180));
    expect(ref.current?.getWidths()).toEqual({ a: 100, b: 180, c: 720 });
    act(() => ref.current!.resetWidths(["b"]));
    expect(ref.current?.getWidths()).toEqual({ a: 100, b: 300, c: 600 });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(Object.hasOwn(grid.getState().columnWidths, "b")).toBe(false);
  });
  it("uses fallback widths before a positive measurement and clamps overflow to minima", () => {
    let width = 0,
      measure = () => {};
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => width,
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          measure = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const ref = createRef<DataGridSizingController>();
    render(
      <DataGrid
        model={model()}
        sizingRef={ref}
        toolbar={false}
        selectionMode="none"
      />,
    );
    expect(ref.current?.getWidths()).toEqual({ a: 100, b: 160, c: 160 });
    act(() => {
      width = 120;
      measure();
    });
    expect(ref.current?.getWidths()).toEqual({ a: 100, b: 50, c: 50 });
    expect(cell("c").style.right).toBe("0px");
  });
  it("keeps logical flex allocation through RTL, leaf groups, pinning and column spans", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
    const grid = model({ flex: 1, colSpan: 2 });
    // Pin boundaries deliberately clip a span; clearing the left pin permits A+B.
    grid.pinColumn("a", null);
    const ref = createRef<DataGridSizingController>();
    const view = render(
      <DataGrid
        model={grid}
        sizingRef={ref}
        toolbar={false}
        selectionMode="none"
      />,
    );
    const widths = ref.current!.getWidths();
    expect(widths).toEqual({ a: 175, b: 175, c: 350 });
    expect(cell("a").style.width).toBe("350px");
    expect(cell("b")).toBeNull();
    view.rerender(
      <DataGrid
        model={grid}
        direction="rtl"
        sizingRef={ref}
        toolbar={false}
        selectionMode="none"
      />,
    );
    expect(ref.current!.getWidths()).toEqual(widths);
    expect(cell("a").style.width).toBe("350px");
    expect(cell("a").getAttribute("aria-colspan")).toBe("2");
  });
  it("uses the resolved flex width for keyboard resize and resets it to proportional ownership", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
    const grid = model(),
      ref = createRef<DataGridSizingController>();
    render(
      <DataGrid
        model={grid}
        sizingRef={ref}
        toolbar={false}
        selectionMode="none"
      />,
    );
    const separator = screen.getByRole("separator", { name: "Resize b" });
    expect(separator.getAttribute("aria-valuenow")).toBe("200");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(grid.getState().columnWidths.b).toBe(210);
    expect(cell("c").style.width).toBe("390px");
    act(() => ref.current!.resetWidths());
    expect(cell("b").style.width).toBe("200px");
  });
});
