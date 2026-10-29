// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createGrid, type Column } from "../../core/src/index";
import { DataGrid, Sparkline } from "./data-grid";
import { GridLocaleProvider, enUS, esES } from "./locale";

type Row = { id: string; name: string; amount: number };
const rows: Row[] = [
  { id: "a", name: "Application title", amount: 1 },
  { id: "b", name: "Second", amount: 2 },
];
const columns: Column<Row>[] = [
  {
    id: "name",
    field: "name",
    header: "Application header",
    editable: true,
    groupPath: ["App group"],
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    groupPath: ["App group"],
  },
];
const make = (extra?: Column<Row>[]) =>
  createGrid({ rows, columns: extra ?? columns, getRowId: (row) => row.id });
function cell(row = "a", column = "name", root: ParentNode = document) {
  return root.querySelector<HTMLElement>(
    `[data-row-id="${row}"][data-column-id="${column}"]`,
  )!;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("localized grid interactions", () => {
  it("translates owned core reorder reasons while preserving copied and application-owned status messages", () => {
    const grid = make();
    grid.setSort("amount", "asc");
    const status = grid.getRowReorderStatus();
    if (status.allowed) throw new Error("Expected the real core sorting guard");
    const view = render(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={grid} rowDragging />
      </GridLocaleProvider>,
    );
    expect(screen.getByText(esES.messages["move.sorting"])).toBeTruthy();
    const copied = { ...grid, getRowReorderStatus: () => ({ ...status }) };
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={copied} rowDragging />
      </GridLocaleProvider>,
    );
    expect(screen.getByText(status.message)).toBeTruthy();
    expect(screen.queryByText(esES.messages["move.sorting"])).toBeNull();
    const custom = {
      ...grid,
      getRowReorderStatus: () => ({ ...status, message: "Blocked: sorting" }),
    };
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={custom} rowDragging />
      </GridLocaleProvider>,
    );
    expect(screen.getByText("Blocked: sorting")).toBeTruthy();
    view.rerender(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={custom} rowDragging />
      </GridLocaleProvider>,
    );
    expect(screen.getByText("Blocked: sorting")).toBeTruthy();
  });
  it("preserves default English and translates built-ins while retaining application labels and values", () => {
    const grid = make();
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={grid} />
      </GridLocaleProvider>,
    );
    const root = screen.getByRole("grid").closest("section")!;
    expect(root.lang).toBe("en-US");
    expect(
      screen.getByRole("textbox", { name: "Search all rows" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Collapse column group App group" }),
    ).toBeTruthy();
    const node = cell();
    const before = grid.getState();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={grid} />
      </GridLocaleProvider>,
    );
    expect(root.lang).toBe("es-ES");
    expect(
      screen.getByRole("textbox", { name: esES.messages["grid.searchLabel"] }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: esES.messages["grid.undo"] }),
    ).toBeTruthy();
    expect(screen.getAllByText("Application header").length).toBeGreaterThan(0);
    expect(screen.getByText("Application title")).toBeTruthy();
    expect(screen.getByText("App group")).toBeTruthy();
    expect(cell()).toBe(node);
    expect(grid.getState()).toBe(before);
  });
  it("switches locale without remounting a focused editor or discarding its draft and undo history", () => {
    const grid = make();
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={grid} />
      </GridLocaleProvider>,
    );
    act(() => cell().focus());
    fireEvent.keyDown(cell(), { key: "F2" });
    const input = within(cell()).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Draft retained" } });
    expect(document.activeElement).toBe(input);
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={grid} />
      </GridLocaleProvider>,
    );
    expect(within(cell()).getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Draft retained");
    expect(document.activeElement).toBe(input);
    expect(grid.getRow("a")?.name).toBe("Application title");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(grid.getRow("a")?.name).toBe("Draft retained");
    fireEvent.keyDown(cell("a", "amount"), { key: "z", ctrlKey: true });
    expect(grid.getRow("a")?.name).toBe("Application title");
    view.rerender(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={grid} />
      </GridLocaleProvider>,
    );
    expect(screen.getByText("Change undone")).toBeTruthy();
  });
  it("keeps a range and copied contents while an existing built-in notice retranslates", () => {
    const grid = make(),
      ranges = vi.fn();
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={grid} onCellRangeChange={ranges} />
      </GridLocaleProvider>,
    );
    fireEvent.click(cell("a", "amount"));
    fireEvent.click(cell("b", "amount"), { shiftKey: true });
    act(() => cell("b", "amount").focus());
    const setData = vi.fn();
    fireEvent.copy(cell("b", "amount"), { clipboardData: { setData } });
    expect(setData).toHaveBeenLastCalledWith("text/plain", "1\r\n2");
    const before = grid.getState(),
      selected = ranges.mock.calls.at(-1)?.[0];
    expect(screen.getByText("Selected cells copied.")).toBeTruthy();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={grid} onCellRangeChange={ranges} />
      </GridLocaleProvider>,
    );
    expect(screen.getByText(esES.messages["range.copied"])).toBeTruthy();
    expect(document.activeElement).toBe(cell("b", "amount"));
    expect(ranges.mock.calls.at(-1)?.[0]).toEqual(selected);
    expect(grid.getState()).toBe(before);
    fireEvent.copy(cell("b", "amount"), { clipboardData: { setData } });
    expect(setData).toHaveBeenLastCalledWith("text/plain", "1\r\n2");
  });
  it("retranslates an already open clipboard availability error without losing focus or model state", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    try {
      const grid = make();
      const view = render(
        <GridLocaleProvider locale={enUS}>
          <DataGrid model={grid} />
        </GridLocaleProvider>,
      );
      fireEvent.click(cell());
      fireEvent.click(
        screen.getByRole("button", { name: "Copy selected cells" }),
      );
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(enUS.messages["range.copyUnavailable"]);
      const before = grid.getState();
      view.rerender(
        <GridLocaleProvider locale={esES}>
          <DataGrid model={grid} />
        </GridLocaleProvider>,
      );
      expect(screen.getByRole("alert")).toBe(alert);
      expect(alert.textContent).toBe(esES.messages["range.copyUnavailable"]);
      expect(grid.getState()).toBe(before);
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  it("preserves raw application validation and renderer content through a locale change", () => {
    const grid = make([
      {
        ...columns[0],
        validate: () => "Application validation: keep this exact text",
      },
      columns[1],
    ]);
    const renderCell = ({ value }: { value: unknown }) => (
      <span data-application>{String(value)}</span>
    );
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={grid} renderCell={renderCell} />
      </GridLocaleProvider>,
    );
    fireEvent.doubleClick(cell());
    const input = within(cell()).getByRole("textbox");
    fireEvent.change(input, { target: { value: "App draft" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toBe(
      "Application validation: keep this exact text",
    );
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={grid} renderCell={renderCell} />
      </GridLocaleProvider>,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Application validation: keep this exact text",
    );
    expect(
      (within(cell()).getByRole("textbox") as HTMLInputElement).value,
    ).toBe("App draft");
    expect(cell("b").querySelector("[data-application]")?.textContent).toBe(
      "Second",
    );
  });
  it("keeps Find and filter state live across a provider change", () => {
    const grid = make();
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={grid} />
      </GridLocaleProvider>,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Filter Application header" }),
      { target: { value: "title" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    const find = screen.getByRole("textbox", { name: "Find in current view" });
    fireEvent.change(find, { target: { value: "Application" } });
    act(() => find.focus());
    const before = grid.getState();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={grid} />
      </GridLocaleProvider>,
    );
    expect(
      screen.getByRole("textbox", { name: esES.messages["find.label"] }),
    ).toBe(find);
    expect((find as HTMLInputElement).value).toBe("Application");
    expect(document.activeElement).toBe(find);
    expect(grid.getState()).toBe(before);
    expect(grid.getFilteredRows()).toHaveLength(1);
  });
  it("keeps one asynchronous editor request alive during locale switching", async () => {
    let resolve!: (value: readonly { value: string; label: string }[]) => void;
    const provider = vi.fn(
      () =>
        new Promise<readonly { value: string; label: string }[]>((done) => {
          resolve = done;
        }),
    );
    const options = {
      name: { type: "select" as const, asyncOptions: provider },
    };
    const grid = make();
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={grid} editorOptions={options} />
      </GridLocaleProvider>,
    );
    fireEvent.doubleClick(cell());
    await waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={grid} editorOptions={options} />
      </GridLocaleProvider>,
    );
    expect(provider).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve([{ value: "Application title", label: "App option" }]),
    );
    await waitFor(() =>
      expect(
        within(cell()).getByRole("option", { name: "App option" }),
      ).toBeTruthy(),
    );
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("respects explicit nested locales and treats message overrides as text", () => {
    const outer = make(),
      inner = make();
    render(
      <StrictMode>
        <GridLocaleProvider
          locale={esES}
          messages={{ "grid.undo": "Custom <b>undo</b>" }}
        >
          <DataGrid
            model={outer}
            ariaLabel="Outer application"
            isFullWidthRow={(node) => node.id === "a"}
            renderFullWidthRow={() => (
              <GridLocaleProvider locale={enUS}>
                <DataGrid model={inner} ariaLabel="Inner application" />
              </GridLocaleProvider>
            )}
          />
        </GridLocaleProvider>
      </StrictMode>,
    );
    const parent = screen.getByRole("grid", { name: "Outer application" }),
      nested = screen.getByRole("grid", { name: "Inner application" });
    expect(parent.closest("section")?.lang).toBe("es-ES");
    expect(nested.closest("section")?.lang).toBe("en-US");
    expect(
      screen
        .getByRole("button", { name: "Custom <b>undo</b>" })
        .querySelector("b"),
    ).toBeNull();
    expect(
      within(nested.closest("section")!).getByRole("button", {
        name: "Undo",
      }),
    ).toBeTruthy();
    const setData = vi.fn();
    fireEvent.click(cell("a", "amount", nested));
    fireEvent.copy(cell("a", "amount", nested), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenLastCalledWith("text/plain", "1");
  });
  it("localizes the built-in Sparkline label while retaining an explicit application label", () => {
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <Sparkline values={[1, 2]} />
      </GridLocaleProvider>,
    );
    expect(screen.getByRole("img", { name: "Trend" })).toBeTruthy();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <Sparkline values={[1, 2]} />
      </GridLocaleProvider>,
    );
    expect(
      screen.getByRole("img", { name: esES.messages["grid.sparkline"] }),
    ).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("lang")).toBe("es-ES");
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <Sparkline values={[1, 2]} label="My application chart" />
      </GridLocaleProvider>,
    );
    expect(
      screen.getByRole("img", { name: "My application chart" }),
    ).toBeTruthy();
  });
});
