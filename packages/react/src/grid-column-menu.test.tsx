// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
import { GridLocaleProvider, enUS, esES } from "./locale.js";
import type { GridColumnMenuOptions } from "./column-menu.js";
import { ColumnConditionFilter } from "./column-condition-filter.js";

type Row = { id: string; name: string; team: string; amount: number };
const definitions: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", editable: true },
  { id: "team", field: "team", header: "Team" },
  { id: "amount", field: "amount", header: "Amount", type: "number" },
];
function create(columns = definitions) {
  return createGrid<Row>({
    rows: [
      { id: "a", name: "Ada", team: "Blue", amount: 12 },
      { id: "b", name: "Grace", team: "Red", amount: 5 },
      { id: "c", name: "Lin", team: "Blue", amount: 8 },
    ],
    columns,
    getRowId: (row) => row.id,
  });
}
const trigger = (name = "Name") =>
  screen.getByRole("button", { name: `Column menu for ${name}` });
async function open(name = "Name") {
  fireEvent.click(trigger(name), { detail: 1 });
  await act(async () => {});
  return screen.getByRole("menu", { name: `Column commands for ${name}` });
}
async function command(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name }));
  });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DataGrid column commands", () => {
  it("opens from button, keyboard and header context without fabricating a row or claiming Ctrl-right-click", async () => {
    const model = create(),
      getItems = vi.fn<NonNullable<GridColumnMenuOptions<Row>["getItems"]>>(
        (_context, defaults) => defaults,
      );
    render(<DataGrid model={model} columnMenu={{ getItems }} />);
    await open();
    expect(getItems.mock.calls[0][0]).toMatchObject({
      model,
      origin: "button",
      column: { id: "name" },
    });
    expect(Object.keys(getItems.mock.calls[0][0]).sort()).toEqual([
      "column",
      "model",
      "origin",
    ]);
    expect(Object.isFrozen(getItems.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(getItems.mock.calls[0][1])).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await act(async () => {});
    expect(document.activeElement).toBe(trigger());
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(getItems.mock.lastCall![0].origin).toBe("keyboard");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await act(async () => {});
    const sort = screen.getByRole("button", { name: "Sort Name" });
    fireEvent.keyDown(sort, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await act(async () => {});
    expect(fireEvent.contextMenu(sort, { ctrlKey: true })).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(fireEvent.contextMenu(sort, { clientX: 17, clientY: 20 })).toBe(
      false,
    );
    expect(getItems.mock.lastCall![0].origin).toBe("context");
    expect(model.getState().sorting).toEqual([]);
    expect(model.getState().selected).toEqual([]);
  });
  it("sorts real rows, replaces normal sorts and clears only the chosen member of a multi-sort", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    await open("Amount");
    await command("Sort ascending");
    expect(model.getPageRows().map((node) => node.id)).toEqual(["b", "c", "a"]);
    await open("Amount");
    expect(
      screen
        .getByRole("menuitem", { name: "Sort ascending" })
        .getAttribute("disabled"),
    ).not.toBeNull();
    await command("Sort descending");
    expect(model.getPageRows().map((node) => node.id)).toEqual(["a", "c", "b"]);
    act(() => model.setSort("name", "asc", true));
    await open("Amount");
    await command("Clear this sort");
    expect(model.getState().sorting).toEqual([
      { columnId: "name", direction: "asc" },
    ]);
    await open("Team");
    await command("Sort ascending");
    expect(model.getState().sorting).toEqual([
      { columnId: "team", direction: "asc" },
    ]);
    expect(model.undo()).toBe(false);
  });
  it("pins both physical sides, unpins, hides with a connected fallback and protects the final visible column", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    await open();
    await command("Pin left");
    expect(
      model.getColumns().find((column) => column.id === "name")!.pinned,
    ).toBe("left");
    await open();
    await command("Pin right");
    expect(
      model.getColumns().find((column) => column.id === "name")!.pinned,
    ).toBe("right");
    await open();
    await command("Unpin column");
    expect(
      model.getColumns().find((column) => column.id === "name")!.pinned,
    ).toBeNull();
    await open();
    await command("Hide Name");
    expect(
      screen.queryByRole("button", { name: "Column menu for Name" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger("Team"));
    await open("Team");
    await command("Hide Team");
    await open("Amount");
    expect(
      screen
        .getByRole("menuitem", { name: "Hide Amount" })
        .getAttribute("disabled"),
    ).not.toBeNull();
    expect(model.undo()).toBe(false);
  });
  it("groups, expands the actual hierarchy, collapses and removes a grouping without editing data", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    await open("Team");
    await command("Group by Team");
    expect(model.getState().groupBy).toEqual(["team"]);
    expect(model.getPageRows().every((node) => node.kind === "group")).toBe(
      true,
    );
    act(() => model.setState({ expanded: ["outside"] }));
    await open("Team");
    await command("Expand groups");
    expect(model.getState().expanded).toContain("outside");
    expect(
      model.getPageRows().filter((node) => node.kind === "row"),
    ).toHaveLength(3);
    await open("Team");
    await command("Collapse groups");
    expect(model.getState().expanded).toEqual([]);
    await open("Team");
    await command("Remove Team grouping");
    expect(model.getState().groupBy).toEqual([]);
    expect(model.getPageRows()).toHaveLength(3);
    expect(model.undo()).toBe(false);
  });
  it("focuses a native filter and opens the existing chooser without stealing their focus back", async () => {
    const model = create();
    render(<DataGrid model={model} />);
    await open();
    await command("Focus column filter");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Filter Name" }),
    );
    fireEvent.change(document.activeElement!, { target: { value: "Ada" } });
    expect(model.getPageRows().map((node) => node.id)).toEqual(["a"]);
    await open();
    await command("Choose columns");
    expect(
      document.querySelector<HTMLDetailsElement>(".og-chooser")!.open,
    ).toBe(true);
    expect(document.activeElement?.closest(".og-chooser")).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("resets only the selected manual width and leaves other layout state intact", async () => {
    const model = create();
    model.resizeColumn("name", 280);
    model.resizeColumn("team", 270);
    render(<DataGrid model={model} />);
    await open();
    await command("Reset this width");
    expect(Object.hasOwn(model.getState().columnWidths, "name")).toBe(false);
    expect(model.getState().columnWidths.team).toBe(270);
    await open();
    expect(
      screen
        .getByRole("menuitem", { name: "Reset this width" })
        .getAttribute("disabled"),
    ).not.toBeNull();
  });
  it("disables policy-unavailable commands and never runs a provider in render or SSR", async () => {
    const model = create(
      definitions.map((column) => ({
        ...column,
        sortable: false,
        filterable: false,
      })),
    );
    const getItems = vi.fn<NonNullable<GridColumnMenuOptions<Row>["getItems"]>>(
      (_context, defaults) => defaults,
    );
    renderToString(<DataGrid model={model} columnMenu={{ getItems }} />);
    const view = render(
      <DataGrid model={model} columnMenu={{ getItems }} toolbar={false} />,
    );
    expect(getItems).not.toHaveBeenCalled();
    await open();
    for (const name of [
      "Sort ascending",
      "Sort descending",
      "Clear this sort",
      "Focus column filter",
      "Choose columns",
    ])
      expect(
        screen.getByRole("menuitem", { name }).getAttribute("disabled"),
      ).not.toBeNull();
    view.rerender(<DataGrid model={model} columnMenu={false} />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Column menu for Name" }),
    ).toBeNull();
    expect(getItems).toHaveBeenCalledTimes(1);
  });
  it("keeps stable providers and translated live labels but fences model, membership and chooser policy changes", async () => {
    const model = create(),
      getItems = vi.fn<NonNullable<GridColumnMenuOptions<Row>["getItems"]>>(
        (_context, defaults) => defaults,
      );
    const tree = (spanish = false, toolbar = true, source = model) => (
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <DataGrid
          model={source}
          direction={spanish ? "rtl" : "ltr"}
          columnMenu={{ getItems }}
          toolbar={toolbar}
        />
      </GridLocaleProvider>
    );
    const view = render(tree());
    const original = await open();
    view.rerender(tree(true));
    expect(
      screen.getByRole("menu", { name: "Acciones de columna de Name" }),
    ).toBe(original);
    expect(getItems).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("menuitem", { name: "Ordenar de forma ascendente" }),
    ).toBeTruthy();
    view.rerender(tree());
    expect(screen.getByRole("menu")).toBe(original);
    view.rerender(tree(false, false));
    expect(screen.queryByRole("menu")).toBeNull();
    view.rerender(tree());
    await open();
    act(() => model.hideColumn("team", true));
    expect(screen.queryByRole("menu")).toBeNull();
    await open();
    view.rerender(tree(false, true, create()));
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("opens a built-in filter dialog but only focuses an unknown custom filter button", async () => {
    const model = create(),
      action = vi.fn();
    const view = render(
      <DataGrid
        model={model}
        filterComponents={{ name: ColumnConditionFilter }}
      />,
    );
    await open();
    await command("Focus column filter");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
      true,
    );
    view.unmount();
    const Custom = () => (
      <button onClick={action}>Clear application query</button>
    );
    render(<DataGrid model={model} filterComponents={{ name: Custom }} />);
    await open();
    await command("Focus column filter");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Clear application query" }),
    );
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects an oversized expansion before traversing IDs or changing any state", async () => {
    const model = create();
    const id = vi.fn(() => "too-many");
    const group = { kind: "group", children: [{}] };
    Object.defineProperty(group, "id", { get: id });
    vi.spyOn(model, "getRowModel").mockReturnValue(Array(200001).fill(group));
    render(<DataGrid model={model} />);
    const before = model.getState();
    await open();
    await command("Expand groups");
    expect(screen.getByRole("alert").textContent).toContain("expansion limit");
    expect(model.getState()).toBe(before);
    expect(id).not.toHaveBeenCalled();
  });
  it("replaces providers only on a new invocation and supports retry after a custom failure", async () => {
    const model = create(),
      retry = vi
        .fn()
        .mockRejectedValueOnce(new Error("Try this command again"))
        .mockResolvedValue(undefined);
    const first: GridColumnMenuOptions<Row> = {
      getItems: () => [
        {
          kind: "action",
          id: "retry",
          label: "Application command",
          action: retry,
        },
      ],
    };
    const next = vi.fn<NonNullable<GridColumnMenuOptions<Row>["getItems"]>>(
      () => [],
    );
    const view = render(<DataGrid model={model} columnMenu={first} />);
    await open();
    await command("Application command");
    expect(screen.getByRole("alert").textContent).toContain(
      "Try this command again",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Application command" }),
    );
    await command("Application command");
    expect(retry).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("menu")).toBeNull();
    await open();
    view.rerender(<DataGrid model={model} columnMenu={{ getItems: next }} />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(trigger());
    expect(next).toHaveBeenCalledTimes(1);
  });
  it("aborts cooperative custom work on source replacement and ignores a late completion", async () => {
    const first = create(),
      second = create();
    let release!: () => void, signal!: AbortSignal;
    const options: GridColumnMenuOptions<Row> = {
      getItems: () => [
        {
          kind: "action",
          id: "custom",
          label: "Deferred sort",
          action: async (context, owned) => {
            signal = owned;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            if (!signal.aborted) context.model.setSort("name", "asc");
          },
        },
      ],
    };
    const view = render(<DataGrid model={first} columnMenu={options} />);
    await open();
    await command("Deferred sort");
    expect(screen.getByRole("menu").getAttribute("aria-busy")).toBe("true");
    view.rerender(<DataGrid model={second} columnMenu={options} />);
    expect(signal.aborted).toBe(true);
    await act(async () => release());
    expect(first.getState().sorting).toEqual([]);
    expect(second.getState().sorting).toEqual([]);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("reports malformed custom metadata without running accessors or mutations", async () => {
    const model = create(),
      getter = vi.fn(() => "unsafe");
    const hostile = { kind: "action", id: "hostile", action: vi.fn() };
    Object.defineProperty(hostile, "label", { enumerable: true, get: getter });
    render(
      <DataGrid
        model={model}
        columnMenu={{ getItems: () => [hostile as never] }}
      />,
    );
    fireEvent.click(trigger());
    expect(getter).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(model.getState().sorting).toEqual([]);
  });
});
