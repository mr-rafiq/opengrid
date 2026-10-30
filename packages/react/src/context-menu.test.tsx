// @vitest-environment jsdom
import { StrictMode, useRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "@opengrid/core";
import { GridContextMenu } from "./context-menu.js";
import { gridMessage, GridLocaleProvider, esES } from "./locale.js";
import type {
  GridContextMenuContext,
  GridContextMenuItem,
  GridContextMenuAction,
} from "./context-menu-items.js";
import { GridContextMenuError } from "./context-menu-items.js";
type Row = { id: string; name: string };
const model = createGrid<Row>({
  rows: [{ id: "one", name: "First" }],
  columns: [{ id: "name", field: "name", header: "Name", editable: true }],
  getRowId: (r) => r.id,
});
const context: GridContextMenuContext<Row> = Object.freeze({
  model,
  position: Object.freeze({ rowId: "one", columnId: "name" }),
  row: model.getRows()[0],
  column: model.getColumns()[0],
  value: "First",
});
const point = Object.freeze({ x: 20, y: 30 });
function Host({
  items,
  ownedContext = context,
  isCurrent = () => true,
  closed = () => {},
}: {
  items: readonly GridContextMenuItem<Row>[];
  ownedContext?: GridContextMenuContext<Row>;
  isCurrent?: () => boolean;
  closed?: () => void;
}) {
  const [open, setOpen] = useState(false),
    button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={button} onClick={() => setOpen(true)}>
        Open commands
      </button>
      <button>Outside</button>
      {open && (
        <GridContextMenu
          context={ownedContext}
          items={items}
          point={point}
          returnFocus={button.current}
          isCurrent={isCurrent}
          onClose={() => {
            closed();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
const item = (
  id: string,
  label: string | ReturnType<typeof gridMessage<"grid.undo">>,
  action = vi.fn(),
): GridContextMenuAction<Row> => ({ kind: "action", id, label, action });
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Open commands" }));
  await act(async () => {});
}
afterEach(() => cleanup());
describe("context menu lifecycle and keyboard", () => {
  it("preserves an equivalent grid inline offset through RTL but dismisses actual subsequent scrolling", async () => {
    const viewport = document.createElement("div");
    viewport.setAttribute("role", "grid");
    viewport.setAttribute("dir", "ltr");
    viewport.scrollLeft = 120;
    const anchor = document.createElement("button");
    viewport.append(anchor);
    document.body.append(viewport);
    const closed = vi.fn();
    const view = render(
      <GridContextMenu
        context={context}
        items={[item("inspect", "Inspect")]}
        point={point}
        returnFocus={anchor}
        isCurrent={() => true}
        onClose={closed}
      />,
    );
    viewport.setAttribute("dir", "rtl");
    viewport.scrollLeft = -120;
    fireEvent.scroll(viewport);
    expect(closed).not.toHaveBeenCalled();
    viewport.scrollLeft = -121;
    fireEvent.scroll(viewport);
    expect(closed).toHaveBeenCalledTimes(1);
    view.unmount();
    viewport.remove();
    await act(async () => {});
  });
  it("aborts replaced standalone contexts and cannot let old completions unlock new work", async () => {
    const completions: (() => void)[] = [];
    const action = vi.fn(
      (_context: GridContextMenuContext<Row>, _signal: AbortSignal) =>
        new Promise<void>((resolve) => completions.push(resolve)),
    );
    const items = [item("work", "Work", action)],
      view = render(<Host items={items} />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Work" }));
    const previous = action.mock.calls[0][1];
    const next = Object.freeze({
      ...context,
      position: Object.freeze({ rowId: "two", columnId: "name" }),
    });
    view.rerender(<Host items={items} ownedContext={next} />);
    expect(previous.aborted).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Work" }));
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1][0]).toBe(next);
    await act(async () => completions[0]());
    expect(screen.getByRole("menu").getAttribute("aria-busy")).toBe("true");
    await act(async () => completions[1]());
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("retains retryable source-read errors as translated notices without invoking a stale command", async () => {
    let fail = true;
    const action = vi.fn(),
      items = [item("run", "Run", action)],
      isCurrent = () => {
        if (fail)
          throw new GridContextMenuError(gridMessage("range.copyUnavailable"));
        return true;
      };
    const view = render(
      <GridLocaleProvider>
        <Host items={items} isCurrent={isCurrent} />
      </GridLocaleProvider>,
    );
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Run" }));
    const before = screen.getByRole("alert").textContent;
    expect(action).not.toHaveBeenCalled();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <Host items={items} isCurrent={isCurrent} />
      </GridLocaleProvider>,
    );
    expect(screen.getByRole("alert").textContent).not.toBe(before);
    fail = false;
    await act(async () =>
      fireEvent.click(screen.getByRole("menuitem", { name: "Run" })),
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("focuses enabled actions, wraps arrows, skips separators/disabled entries and supports Home/End/typeahead", async () => {
    render(
      <StrictMode>
        <Host
          items={[
            item("copy", "Copy cell"),
            { kind: "separator", id: "s" },
            { ...item("cut", "Cut"), disabled: true },
            item("paste", "Paste"),
            item("print", "Print"),
          ]}
        />
      </StrictMode>,
    );
    await open();
    const copy = screen.getByRole("menuitem", { name: "Copy cell" }),
      paste = screen.getByRole("menuitem", { name: "Paste" }),
      print = screen.getByRole("menuitem", { name: "Print" });
    expect(document.activeElement).toBe(copy);
    fireEvent.keyDown(copy, { key: "ArrowDown" });
    expect(document.activeElement).toBe(paste);
    fireEvent.keyDown(paste, { key: "End" });
    expect(document.activeElement).toBe(print);
    fireEvent.keyDown(print, { key: "ArrowDown" });
    expect(document.activeElement).toBe(copy);
    fireEvent.keyDown(copy, { key: "ArrowUp" });
    expect(document.activeElement).toBe(print);
    fireEvent.keyDown(print, { key: "Home" });
    expect(document.activeElement).toBe(copy);
    fireEvent.keyDown(copy, { key: "p" });
    expect(document.activeElement).toBe(paste);
    fireEvent.keyDown(paste, { key: "p" });
    expect(document.activeElement).toBe(print);
    fireEvent.keyDown(print, { key: "Escape" });
    await act(async () => {});
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open commands" }),
    );
  });
  it("runs a command once with its context and a cancellation signal", async () => {
    let done!: () => void;
    const action = vi.fn(
      (_context: GridContextMenuContext<Row>, _signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
    );
    render(<Host items={[item("run", "Run", action)]} />);
    await open();
    const command = screen.getByRole("menuitem", { name: "Run" });
    fireEvent.click(command);
    fireEvent.click(command);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0]).toBe(context);
    const signal = action.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => done());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(signal.aborted).toBe(true);
  });
  it("retains a failed command, displays literal errors, retries and restores its item focus", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("<b>Unavailable</b>"))
      .mockResolvedValue(undefined);
    render(<Host items={[item("retry", "Retry command", action)]} />);
    await open();
    await act(async () =>
      fireEvent.click(screen.getByRole("menuitem", { name: "Retry command" })),
    );
    expect(screen.getByRole("alert").textContent).toBe("<b>Unavailable</b>");
    expect(screen.getByRole("alert").querySelector("b")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Retry command" }),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("menuitem", { name: "Retry command" })),
    );
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("fences stale ownership before invoking a callback", async () => {
    let current = true;
    const action = vi.fn(),
      closed = vi.fn();
    render(
      <Host
        items={[item("run", "Run", action)]}
        isCurrent={() => current}
        closed={closed}
      />,
    );
    await open();
    current = false;
    fireEvent.click(screen.getByRole("menuitem", { name: "Run" }));
    await act(async () => {});
    expect(action).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("aborts pending work on Escape and ignores its late rejection", async () => {
    let fail!: (reason: unknown) => void;
    const action = vi.fn(
      (_context: GridContextMenuContext<Row>, _signal: AbortSignal) =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    render(<Host items={[item("wait", "Wait", action)]} />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Wait" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await act(async () => {});
    expect((action.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    await act(async () => fail(new Error("Late failure")));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("dismisses outside and external scrolling while preserving intentional connected focus", async () => {
    render(<Host items={[item("copy", "Copy")]} />);
    await open();
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    fireEvent.pointerDown(outside);
    await act(async () => {});
    expect(document.activeElement).toBe(outside);
    expect(screen.queryByRole("menu")).toBeNull();
    await open();
    fireEvent.scroll(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.scroll(document);
    expect(screen.getByRole("menu")).toBeTruthy();
    document.documentElement.scrollTop = 20;
    fireEvent.scroll(document.documentElement);
    document.documentElement.scrollTop = 0;
    await act(async () => {});
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("retranslates descriptors and keeps the same focused action during language changes", async () => {
    const items = [item("undo", gridMessage("grid.undo"))],
      view = render(
        <GridLocaleProvider>
          <Host items={items} />
        </GridLocaleProvider>,
      );
    await open();
    const undo = screen.getByRole("menuitem", { name: "Undo" });
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <Host items={items} />
      </GridLocaleProvider>,
    );
    expect(screen.getByRole("menuitem", { name: "Deshacer" })).toBe(undo);
    expect(document.activeElement).toBe(undo);
  });
  it("exposes native checked and disabled state and a dismiss action for an empty menu", async () => {
    const view = render(
      <Host
        items={[
          { ...item("row", "Select row"), checked: true },
          { ...item("readonly", "Read only"), disabled: true },
        ]}
      />,
    );
    await open();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Select row" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      (screen.getByRole("menuitem", { name: "Read only" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    view.unmount();
    render(<Host items={[]} />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
