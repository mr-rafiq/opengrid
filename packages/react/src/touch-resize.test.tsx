// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type GridModel } from "../../core/src/index";
import { useColumnResize } from "./use-column-resize";
import type { UseColumnResizeOptions } from "./use-column-resize";
type Item = { id: string; name: string; other: string };
const make = () =>
  createGrid<Item>({
    rows: [{ id: "a", name: "One", other: "Two" }],
    columns: [
      { id: "name", field: "name", width: 100, minWidth: 80, maxWidth: 200 },
      { id: "other", field: "other", width: 90 },
    ],
    getRowId: (row) => row.id,
  });
function Harness({
  hide = false,
  ...options
}: UseColumnResizeOptions<Item> & { hide?: boolean }) {
  const binding = useColumnResize(options);
  return (
    <div>
      <button type="button">Outside focus</button>
      {!hide &&
        options.model
          .getColumns()
          .map((column) => (
            <div
              key={column.id}
              role="separator"
              tabIndex={0}
              aria-label={`Resize ${column.id}`}
              onPointerDown={(event) =>
                binding.begin(event, column, column.width ?? 160)
              }
            />
          ))}
      <output data-testid="preview">
        {binding.preview
          ? `${binding.preview.columnId}:${binding.preview.width}`
          : "none"}
      </output>
    </div>
  );
}
function pointer(
  type: string,
  {
    id = 7,
    x = 0,
    isPrimary = true,
    pointerType = "touch",
    button = 0,
  }: {
    id?: number;
    x?: number;
    isPrimary?: boolean;
    pointerType?: string;
    button?: number;
  } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    button,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    isPrimary: { value: isPrimary },
    pointerType: { value: pointerType },
  });
  return event;
}
function capture(element: HTMLElement) {
  const owned = new Set<number>();
  const set = vi.fn((id: number) => {
    owned.add(id);
  });
  const release = vi.fn((id: number) => {
    owned.delete(id);
    fireEvent(element, pointer("lostpointercapture", { id }));
  });
  Object.defineProperties(element, {
    setPointerCapture: { configurable: true, value: set },
    releasePointerCapture: { configurable: true, value: release },
    hasPointerCapture: {
      configurable: true,
      value: (id: number) => owned.has(id),
    },
  });
  return { set, release, owned };
}
const preview = () => screen.getByTestId("preview").textContent;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("captured pointer column resize transactions", () => {
  it.each(["mouse", "pen", "touch"])(
    "previews %s moves locally and commits exactly once after cleanup",
    (pointerType) => {
      const model = make(),
        originalSubscribe = model.subscribe,
        originalResize = model.resizeColumn;
      const unsubscribe = vi.fn();
      const subscribe = vi
        .spyOn(model, "subscribe")
        .mockImplementation((listener) => {
          const off = originalSubscribe(listener);
          return () => {
            unsubscribe();
            off();
          };
        });
      const resize = vi
        .spyOn(model, "resizeColumn")
        .mockImplementation((id, width) => {
          expect(unsubscribe).toHaveBeenCalledOnce();
          originalResize(id, width);
        });
      render(<Harness model={model} />);
      expect(subscribe).not.toHaveBeenCalled();
      const handle = screen.getByRole("separator", { name: "Resize name" }),
        captured = capture(handle);
      fireEvent(handle, pointer("pointerdown", { x: 100, pointerType }));
      expect(captured.set).toHaveBeenCalledWith(7);
      expect(preview()).toBe("name:100");
      expect(subscribe).toHaveBeenCalledOnce();
      fireEvent(window, pointer("pointermove", { x: 140, pointerType }));
      expect(preview()).toBe("name:140");
      expect(model.getState().columnWidths.name).toBeUndefined();
      expect(resize).not.toHaveBeenCalled();
      fireEvent(window, pointer("pointermove", { x: 155, pointerType }));
      fireEvent(window, pointer("pointerup", { pointerType }));
      expect(model.getState().columnWidths.name).toBe(155);
      expect(resize).toHaveBeenCalledExactlyOnceWith("name", 155);
      expect(captured.release).toHaveBeenCalledOnce();
      expect(preview()).toBe("none");
      fireEvent(window, pointer("pointerup", { x: 190, pointerType }));
      fireEvent(window, pointer("pointermove", { x: 180, pointerType }));
      expect(resize).toHaveBeenCalledOnce();
    },
  );
  it("clamps preview to core min/max and reverses physical deltas in RTL", () => {
    const model = make();
    const resize = vi.spyOn(model, "resizeColumn");
    render(<Harness model={model} direction="rtl" />);
    const handle = screen.getByRole("separator", { name: "Resize name" });
    capture(handle);
    fireEvent(handle, pointer("pointerdown", { x: 100 }));
    fireEvent(window, pointer("pointermove", { x: -200 }));
    expect(preview()).toBe("name:200");
    fireEvent(window, pointer("pointermove", { x: 180 }));
    expect(preview()).toBe("name:80");
    expect(resize).not.toHaveBeenCalled();
    fireEvent(window, pointer("pointerup"));
    expect(resize).toHaveBeenCalledExactlyOnceWith("name", 80);
  });
  it("keeps missing-ID synthetic mouse events compatible and uses the last preview rather than terminal coordinates", () => {
    const model = make();
    render(<Harness model={model} direction="rtl" />);
    const handle = screen.getByRole("separator", { name: "Resize name" });
    const captured = capture(handle);
    fireEvent(
      handle,
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 100,
      }),
    );
    fireEvent(window, new MouseEvent("pointermove", { clientX: 75 }));
    fireEvent(window, new MouseEvent("pointerup"));
    expect(model.getState().columnWidths.name).toBe(125);
    expect(captured.set).not.toHaveBeenCalled();
  });
  it("ignores foreign move/up/cancel events until the captured pointer ends", () => {
    const model = make(),
      resize = vi.spyOn(model, "resizeColumn");
    render(<Harness model={model} />);
    const handle = screen.getByRole("separator", { name: "Resize name" });
    capture(handle);
    fireEvent(handle, pointer("pointerdown", { x: 100 }));
    fireEvent(window, pointer("pointermove", { id: 8, x: 180 }));
    fireEvent(window, pointer("pointerup", { id: 8 }));
    fireEvent(window, pointer("pointercancel", { id: 8 }));
    fireEvent(handle, pointer("lostpointercapture", { id: 8 }));
    expect(preview()).toBe("name:100");
    expect(resize).not.toHaveBeenCalled();
    fireEvent(window, pointer("pointermove", { x: 130 }));
    fireEvent(window, pointer("pointerup"));
    expect(resize).toHaveBeenCalledExactlyOnceWith("name", 130);
  });
  it.each(["pointercancel", "lostpointercapture", "Escape", "blur"])(
    "discards the local preview on %s without moving external focus",
    (kind) => {
      const model = make(),
        resize = vi.spyOn(model, "resizeColumn");
      render(<Harness model={model} />);
      const handle = screen.getByRole("separator", { name: "Resize name" }),
        captured = capture(handle);
      const outside = screen.getByRole("button", { name: "Outside focus" });
      outside.focus();
      fireEvent(handle, pointer("pointerdown", { x: 100 }));
      fireEvent(window, pointer("pointermove", { x: 140 }));
      if (kind === "Escape") fireEvent.keyDown(window, { key: "Escape" });
      else if (kind === "blur") fireEvent.blur(window);
      else if (kind === "lostpointercapture") {
        captured.owned.delete(7);
        fireEvent(handle, pointer(kind));
      } else fireEvent(window, pointer(kind));
      expect(preview()).toBe("none");
      expect(resize).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(outside);
      fireEvent(window, pointer("pointerup"));
      expect(resize).not.toHaveBeenCalled();
    },
  );
  it("cancels a second contact and does not begin a new resize from that same event", () => {
    const model = make(),
      resize = vi.spyOn(model, "resizeColumn"),
      subscribe = vi.spyOn(model, "subscribe");
    render(<Harness model={model} />);
    const first = screen.getByRole("separator", { name: "Resize name" }),
      second = screen.getByRole("separator", { name: "Resize other" });
    capture(first);
    capture(second);
    fireEvent(first, pointer("pointerdown", { x: 100 }));
    fireEvent(window, pointer("pointermove", { x: 140 }));
    fireEvent(
      second,
      pointer("pointerdown", { id: 8, x: 150, pointerType: "pen" }),
    );
    expect(preview()).toBe("none");
    expect(subscribe).toHaveBeenCalledOnce();
    fireEvent(window, pointer("pointerup", { id: 8 }));
    fireEvent(window, pointer("pointerup"));
    expect(resize).not.toHaveBeenCalled();
  });
  it.each(["filter", "sort", "pin", "selection", "rows"])(
    "invalidates on an active model %s notification",
    (change) => {
      const model = make(),
        resize = vi.spyOn(model, "resizeColumn");
      render(<Harness model={model} />);
      const handle = screen.getByRole("separator", { name: "Resize name" });
      capture(handle);
      fireEvent(handle, pointer("pointerdown", { x: 100 }));
      fireEvent(window, pointer("pointermove", { x: 140 }));
      act(() => {
        if (change === "filter") model.setQuickFilter("One");
        else if (change === "sort") model.setSort("name", "asc");
        else if (change === "pin") model.pinColumn("name", "left");
        else if (change === "selection") model.selectRows(["a"]);
        else model.setRows([{ id: "b", name: "New", other: "Value" }]);
      });
      expect(preview()).toBe("none");
      fireEvent(window, pointer("pointerup"));
      expect(resize).not.toHaveBeenCalled();
    },
  );
  it.each(["direction", "view", "disabled", "guard", "model"])(
    "discards on nonpreview %s changes",
    (change) => {
      const model = make(),
        other = make(),
        resize = vi.spyOn(model, "resizeColumn"),
        otherResize = vi.spyOn(other, "resizeColumn");
      const view = render(
        <Harness
          model={model}
          direction="ltr"
          viewKey="a"
          canResize={() => true}
        />,
      );
      const handle = screen.getByRole("separator", { name: "Resize name" });
      capture(handle);
      fireEvent(handle, pointer("pointerdown", { x: 100 }));
      fireEvent(window, pointer("pointermove", { x: 140 }));
      view.rerender(
        <Harness
          model={change === "model" ? other : model}
          direction={change === "direction" ? "rtl" : "ltr"}
          viewKey={change === "view" ? "b" : "a"}
          enabled={change !== "disabled"}
          canResize={() => change !== "guard"}
        />,
      );
      expect(preview()).toBe("none");
      fireEvent(window, pointer("pointerup"));
      expect(resize).not.toHaveBeenCalled();
      expect(otherResize).not.toHaveBeenCalled();
    },
  );
  it("survives equivalent rerenders and fresh guard identities without resubscribing", () => {
    const model = make(),
      subscribe = vi.spyOn(model, "subscribe"),
      resize = vi.spyOn(model, "resizeColumn");
    const view = render(
      <Harness model={model} viewKey="same" canResize={() => true} />,
    );
    const handle = screen.getByRole("separator", { name: "Resize name" });
    capture(handle);
    fireEvent(handle, pointer("pointerdown", { x: 100 }));
    fireEvent(window, pointer("pointermove", { x: 120 }));
    view.rerender(
      <Harness model={model} viewKey="same" canResize={() => true} />,
    );
    expect(preview()).toBe("name:120");
    expect(subscribe).toHaveBeenCalledOnce();
    fireEvent(window, pointer("pointerup"));
    expect(resize).toHaveBeenCalledExactlyOnceWith("name", 120);
  });
  it("releases capture/subscription on unmount or handle removal without committing", () => {
    const model = make(),
      resize = vi.spyOn(model, "resizeColumn");
    const view = render(<Harness model={model} />);
    const handle = screen.getByRole("separator", { name: "Resize name" }),
      captured = capture(handle);
    fireEvent(handle, pointer("pointerdown", { x: 100 }));
    fireEvent(window, pointer("pointermove", { x: 120 }));
    view.rerender(<Harness model={model} hide />);
    expect(preview()).toBe("none");
    expect(captured.release).toHaveBeenCalledOnce();
    view.unmount();
    fireEvent(window, pointer("pointerup"));
    expect(resize).not.toHaveBeenCalled();
  });
  it("rejects nonprimary, right-button, disabled and invalid-coordinate starts", () => {
    const model = make(),
      subscribe = vi.spyOn(model, "subscribe");
    const view = render(<Harness model={model} />);
    const handle = screen.getByRole("separator", { name: "Resize name" });
    capture(handle);
    fireEvent(handle, pointer("pointerdown", { isPrimary: false }));
    fireEvent(handle, pointer("pointerdown", { button: 2 }));
    fireEvent(handle, pointer("pointerdown", { id: NaN }));
    expect(preview()).toBe("none");
    expect(subscribe).not.toHaveBeenCalled();
    const invalid = pointer("pointerdown");
    Object.defineProperty(invalid, "clientX", { value: NaN });
    fireEvent(handle, invalid);
    expect(subscribe).not.toHaveBeenCalled();
    view.rerender(<Harness model={model} enabled={false} />);
    fireEvent(handle, pointer("pointerdown"));
    expect(preview()).toBe("none");
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("cleans up capture failure, no-op taps, and rejected commits", () => {
    const model = make(),
      resize = vi.spyOn(model, "resizeColumn"),
      onCommitError = vi.fn((_reason: unknown) => {});
    render(<Harness model={model} onCommitError={onCommitError} />);
    const handle = screen.getByRole("separator", { name: "Resize name" }),
      captured = capture(handle);
    captured.set.mockImplementationOnce(() => {
      throw new Error("No active pointer");
    });
    fireEvent(handle, pointer("pointerdown", { x: 100 }));
    expect(preview()).toBe("none");
    fireEvent(window, pointer("pointerup"));
    expect(resize).not.toHaveBeenCalled();
    fireEvent(handle, pointer("pointerdown", { x: 100 }));
    fireEvent(window, pointer("pointerup"));
    expect(resize).not.toHaveBeenCalled();
    resize.mockImplementationOnce(() => {
      throw new Error("Commit rejected");
    });
    fireEvent(handle, pointer("pointerdown", { x: 100 }));
    fireEvent(window, pointer("pointermove", { x: 130 }));
    fireEvent(window, pointer("pointerup"));
    expect(onCommitError.mock.calls[0][0]).toEqual(
      new Error("Commit rejected"),
    );
    expect(preview()).toBe("none");
    expect(captured.owned.size).toBe(0);
  });
});
