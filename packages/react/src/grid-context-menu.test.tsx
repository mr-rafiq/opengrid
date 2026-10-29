// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
import { GridLocaleProvider, esES } from "./locale.js";
import type { GridContextMenuOptions } from "./context-menu-items.js";
type Row = { id: string; name: string; amount: number };
const columns: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", editable: true, pinned: "left" },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    validate: (value) =>
      Number(value) < 0 ? "Amount must be positive" : undefined,
  },
  { id: "id", field: "id", header: "Record", pinned: "right" },
];
const create = () =>
  createGrid<Row>({
    rows: [
      { id: "a", name: "Ada", amount: 12 },
      { id: "b", name: "Grace", amount: 5 },
    ],
    columns,
    getRowId: (r) => r.id,
  });
const cell = (id: string, column: string) =>
  document.querySelector<HTMLElement>(
    `[role="gridcell"][data-row-id="${id}"][data-column-id="${column}"]`,
  )!;
const clipboard = {
  writeText: vi.fn<(value: string) => Promise<void>>(),
  readText: vi.fn<() => Promise<string>>(),
};
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
beforeEach(() => {
  clipboard.writeText.mockReset().mockResolvedValue(undefined);
  clipboard.readText.mockReset().mockResolvedValue("");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});
async function open(id = "a", column = "name") {
  fireEvent.contextMenu(cell(id, column), { clientX: 40, clientY: 60 });
  await act(async () => {});
  return screen.getByRole("menu");
}
async function command(name: string) {
  await act(async () =>
    fireEvent.click(screen.getByRole("menuitem", { name })),
  );
}
describe("DataGrid contextual commands", () => {
  it("invalidates changed selection/editor/notes and command-provider policies without replaying stable providers", async () => {
    const model = create();
    const getItems = vi.fn<
      NonNullable<GridContextMenuOptions<Row>["getItems"]>
    >((_context, defaults) => defaults);
    const view = render(<DataGrid model={model} contextMenu={{ getItems }} />);
    const menu = await open();
    view.rerender(<DataGrid model={model} contextMenu={{ getItems }} />);
    expect(screen.getByRole("menu")).toBe(menu);
    expect(getItems).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(menu, { key: "Escape" });
    await act(async () => {});
    for (const variant of [
      { selectionMode: "none" as const },
      { notes: false as const },
      { hierarchySelection: "subtree" as const },
      { editMode: "row" as const },
    ]) {
      view.rerender(<DataGrid model={model} contextMenu={{ getItems }} />);
      await open();
      view.rerender(
        <DataGrid model={model} contextMenu={{ getItems }} {...variant} />,
      );
      expect(screen.queryByRole("menu")).toBeNull();
    }
    view.rerender(<DataGrid model={model} contextMenu={{ getItems }} />);
    await open();
    const restricted = vi.fn<
      NonNullable<GridContextMenuOptions<Row>["getItems"]>
    >(() => []);
    view.rerender(
      <DataGrid model={model} contextMenu={{ getItems: restricted }} />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(restricted).not.toHaveBeenCalled();
    fireEvent.contextMenu(cell("a", "name"));
    expect(restricted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(model.getState().selected).toEqual([]);
    expect(model.undo()).toBe(false);
  });
  it("opens from keyboard and pointer, toggles real row selection and restores focus without data history", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    cell("a", "name").focus();
    fireEvent.keyDown(cell("a", "name"), { key: "F10", shiftKey: true });
    expect(
      screen.getByRole("menu", { name: "Commands for Name, row a" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Select row a" }),
    );
    await act(async () => {});
    expect(model.getState().selected).toEqual(["a"]);
    expect(model.undo()).toBe(false);
    expect(document.activeElement).toBe(cell("a", "name"));
    await open();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Select row a" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await act(async () => {});
    expect(document.activeElement).toBe(cell("a", "name"));
    expect(fireEvent.contextMenu(cell("a", "name"), { ctrlKey: true })).toBe(
      true,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(cell("a", "name"), { key: "ContextMenu" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });
  it("opens actual cell editors, retains validation and undoes or redoes through existing history", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    await open("a", "amount");
    await command("Edit cell");
    const editor = screen.getByRole("spinbutton", {
      name: "Edit Amount row a",
    });
    fireEvent.change(editor, { target: { value: "-1" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(model.getRow("a")!.amount).toBe(12);
    fireEvent.change(editor, { target: { value: "42" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(model.getRow("a")!.amount).toBe(42);
    await open("a", "amount");
    await command("Undo");
    expect(model.getRow("a")!.amount).toBe(12);
    await open("a", "amount");
    await command("Redo");
    expect(model.getRow("a")!.amount).toBe(42);
  });
  it("opens the real note dialog at the requested cell and keeps its plain-text contract", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    await open("b", "amount");
    await command("Note");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Amount");
    expect(screen.getByRole("dialog").textContent).toContain("b");
    expect(screen.getByRole("textbox", { name: "Note text" })).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("preserves a selected rectangle when invoked within it and collapses only when invoked outside", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    fireEvent.click(cell("a", "name"));
    fireEvent.keyDown(cell("a", "name"), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(cell("a", "amount"), {
      key: "ArrowDown",
      shiftKey: true,
    });
    await open("a", "name");
    await command("Copy selected cells");
    expect(clipboard.writeText).toHaveBeenLastCalledWith("Ada\t12\r\nGrace\t5");
    await open("b", "id");
    await command("Copy selected cells");
    expect(clipboard.writeText).toHaveBeenLastCalledWith("b");
    act(() => model.editCell("a", "name", "=COMMAND()"));
    await open();
    await command("Copy cell");
    expect(clipboard.writeText).toHaveBeenLastCalledWith("'=COMMAND()");
  });
  it("pastes through atomic validation, retains a rejected menu and retries with one undo", async () => {
    const model = create();
    clipboard.readText
      .mockResolvedValueOnce("Changed\t-1")
      .mockResolvedValueOnce("Changed\t9");
    render(<DataGrid model={model} />);
    await open();
    await command("Paste cells");
    expect(model.getRow("a")).toEqual({ id: "a", name: "Ada", amount: 12 });
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Amount must be positive",
    );
    await command("Paste cells");
    expect(model.getRow("a")).toEqual({ id: "a", name: "Changed", amount: 9 });
    expect(screen.queryByRole("menu")).toBeNull();
    act(() => {
      expect(model.undo()).toBe(true);
    });
    expect(model.getRow("a")).toEqual({ id: "a", name: "Ada", amount: 12 });
    expect(model.undo()).toBe(false);
  });
  it("does not paste a late clipboard result after an authoritative source update", async () => {
    let done!: (value: string) => void;
    clipboard.readText.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const model = create();
    render(<DataGrid model={model} />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste cells" }));
    act(() =>
      model.applyTransaction({
        update: [{ id: "a", name: "Incoming", amount: 91 }],
      }),
    );
    expect(screen.queryByRole("menu")).toBeNull();
    await act(async () => done("Stale\t8"));
    expect(model.getRow("a")).toEqual({
      id: "a",
      name: "Incoming",
      amount: 91,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not apply a delayed paste through a newly reversed column order", async () => {
    let done!: (value: string) => void;
    clipboard.readText.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const model = create(),
      view = render(<DataGrid model={model} />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste cells" }));
    view.rerender(<DataGrid model={model} direction="rtl" />);
    expect(screen.getByRole("menu")).toBeTruthy();
    await act(async () => done("Changed\t9"));
    expect(model.getRow("a")).toEqual({ id: "a", name: "Ada", amount: 12 });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(model.undo()).toBe(false);
  });
  it("cancels cooperative custom work when the model owner is replaced", async () => {
    let done!: () => void, signal!: AbortSignal;
    const first = create(),
      second = create();
    const options: GridContextMenuOptions<Row> = {
      getItems: () => [
        {
          kind: "action",
          id: "custom",
          label: "Delayed change",
          action: async (context, ownedSignal) => {
            signal = ownedSignal;
            await new Promise<void>((resolve) => {
              done = resolve;
            });
            if (!signal.aborted) context.model.editCell("a", "name", "Changed");
          },
        },
      ],
    };
    const view = render(<DataGrid model={first} contextMenu={options} />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delayed change" }));
    view.rerender(<DataGrid model={second} contextMenu={options} />);
    expect(signal.aborted).toBe(true);
    await act(async () => done());
    expect(first.getRow("a")!.name).toBe("Ada");
    expect(second.getRow("a")!.name).toBe("Ada");
  });
  it("owns customization metadata and reports invalid or source-mutating providers without opening stale commands", async () => {
    const model = create(),
      getItems = vi.fn<NonNullable<GridContextMenuOptions<Row>["getItems"]>>(
        (context, defaults) => {
          expect(Object.isFrozen(context)).toBe(true);
          expect(Object.isFrozen(context.position)).toBe(true);
          expect(Object.isFrozen(defaults)).toBe(true);
          expect(Object.isFrozen(context.row)).toBe(false);
          return [
            {
              kind: "action",
              id: "custom",
              label: "Custom",
              action: () => {
                context.model.editCell("a", "name", "Custom");
              },
            },
            ...defaults,
          ];
        },
      );
    const view = render(<DataGrid model={model} contextMenu={{ getItems }} />);
    expect(getItems).not.toHaveBeenCalled();
    await open();
    await command("Custom");
    expect(model.getRow("a")!.name).toBe("Custom");
    view.rerender(
      <DataGrid
        model={model}
        contextMenu={{
          getItems: () =>
            Array.from({ length: 49 }, (_, index) => ({
              kind: "separator",
              id: String(index),
            })),
        }}
      />,
    );
    fireEvent.contextMenu(cell("a", "name"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("48");
    view.rerender(
      <DataGrid
        model={model}
        contextMenu={{
          getItems: (_context, defaults) => {
            model.editCell("a", "name", "Incoming");
            return defaults;
          },
        }}
      />,
    );
    fireEvent.contextMenu(cell("a", "name"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(model.getRow("a")!.name).toBe("Incoming");
    expect(screen.getByRole("alert").textContent).toContain("grid changed");
  });
  it("restores a surviving logical cell after filtering away the menu's invocation element", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    await open();
    act(() => model.setFilter("name", { op: "equals", value: "Grace" }));
    await act(async () => {});
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(cell("b", "name"));
  });
  it("keeps the same popup and focused command across Spanish and RTL changes", async () => {
    const model = create(),
      view = render(
        <GridLocaleProvider>
          <DataGrid model={model} />
        </GridLocaleProvider>,
      );
    await open();
    const copy = screen.getByRole("menuitem", { name: "Copy cell" }),
      menu = screen.getByRole("menu");
    expect(document.activeElement).toBe(copy);
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={model} direction="rtl" />
      </GridLocaleProvider>,
    );
    expect(screen.getByRole("menuitem", { name: "Copiar celda" })).toBe(copy);
    expect(screen.getByRole("menu")).toBe(menu);
    expect(document.activeElement).toBe(copy);
    expect(menu.closest(".og-root")?.getAttribute("dir")).toBe("rtl");
  });
  it("supports actual merged owners while leaving range commands disabled", async () => {
    const model = createGrid({
      rows: [
        { id: "a", name: "Same", amount: 1 },
        { id: "b", name: "Same", amount: 2 },
      ],
      columns: [
        { ...columns[0], colSpan: 2, spanRows: true },
        { ...columns[1], pinned: "left" as const },
        columns[2],
      ],
      getRowId: (r: Row) => r.id,
    });
    render(<DataGrid model={model} />);
    expect(cell("a", "name").getAttribute("aria-rowspan")).toBe("2");
    expect(cell("a", "name").getAttribute("aria-colspan")).toBe("2");
    await open();
    expect(
      (
        screen.getByRole("menuitem", {
          name: "Paste cells",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await command("Copy cell");
    expect(clipboard.writeText).toHaveBeenLastCalledWith("Same");
    expect(model.getRow("b")!.amount).toBe(2);
  });
  it("leaves interactive renderer controls and disabled menus to the browser and never invokes providers during SSR", async () => {
    const model = create(),
      getItems = vi.fn<NonNullable<GridContextMenuOptions<Row>["getItems"]>>(
        (_context, defaults) => defaults,
      ),
      view = render(
        <DataGrid
          model={model}
          contextMenu={{ getItems }}
          renderCell={({ value }) => <button>{String(value)}</button>}
        />,
      );
    expect(
      fireEvent.contextMenu(cell("a", "name").querySelector("button")!),
    ).toBe(true);
    expect(getItems).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    view.rerender(<DataGrid model={model} contextMenu={false} />);
    expect(fireEvent.contextMenu(cell("a", "name"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    renderToString(<DataGrid model={model} contextMenu={{ getItems }} />);
    expect(getItems).not.toHaveBeenCalled();
    expect(model.getRow("a")!.name).toBe("Ada");
  });
});
