// @vitest-environment jsdom
import { StrictMode, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  createGrid,
  type Column,
  type Filter,
  type GridModel,
} from "../../core/src/index";
import { SetListFilter } from "./set-list-filter";
import { GridLocaleProvider, enUS, esES } from "./locale";

type Row = { id: string; value: unknown; visible: boolean };
const source: Row[] = [
  { id: "a", value: "Alpha", visible: true },
  { id: "b", value: "Beta", visible: true },
  { id: "c", value: "Alpha", visible: false },
  { id: "d", value: "Gamma", visible: true },
];
const column: Column<Row> = {
  id: "value",
  field: "value",
  header: "Application values",
  type: "text",
};
function make(rows = source, definition = column, filter?: Filter) {
  const grid = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [definition, { id: "visible", field: "visible", type: "boolean" }],
  });
  if (filter) grid.setFilter("value", filter);
  return grid;
}
function Harness({
  model,
  applied = () => {},
  cleared = () => {},
  pageSize = 50,
}: {
  model: GridModel<Row>;
  applied?: (filter?: Filter) => void;
  cleared?: () => void;
  pageSize?: number;
}) {
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  return (
    <SetListFilter
      model={model}
      column={model.getColumns().find((item) => item.id === "value")!}
      filter={
        Object.hasOwn(state.filters, "value") ? state.filters.value : undefined
      }
      label="Application value filter"
      pageSize={pageSize}
      onFilterChange={(filter) => {
        applied(filter);
        model.setFilter("value", filter);
      }}
      onClear={() => {
        cleared();
        model.setFilter("value");
      }}
    />
  );
}
const open = () => {
  fireEvent.click(
    screen.getByRole("button", { name: "Application value filter" }),
  );
  return screen.getByRole("dialog");
};
const choice = (value: string) =>
  within(screen.getByRole("dialog")).getByRole("checkbox", {
    name: new RegExp(value),
  }) as HTMLInputElement;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("staged resident SetListFilter", () => {
  it("does not mutate the model until Apply and Cancel discards checkbox drafts", () => {
    const grid = make(),
      applied = vi.fn();
    render(<Harness model={grid} applied={applied} />);
    const before = grid.getState();
    open();
    fireEvent.click(choice("Beta"));
    expect(grid.getState()).toBe(before);
    expect(applied).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(grid.getState()).toBe(before);
    open();
    expect(choice("Beta").checked).toBe(true);
    fireEvent.click(choice("Beta"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(applied).toHaveBeenCalledExactlyOnceWith({
      op: "in",
      value: ["alpha", "gamma"],
    });
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual([
      "a",
      "c",
      "d",
    ]);
  });
  it("supports explicit empty selection and stages Clear as implicit all until Apply", () => {
    const grid = make(),
      applied = vi.fn(),
      cleared = vi.fn();
    render(<Harness model={grid} applied={applied} cleared={cleared} />);
    open();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(applied).toHaveBeenLastCalledWith({ op: "in", value: [] });
    expect(grid.getFilteredRows()).toHaveLength(0);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(cleared).not.toHaveBeenCalled();
    expect(grid.getFilteredRows()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(grid.getFilteredRows()).toHaveLength(4);
  });
  it("limits mounted choices but search-scoped select-all selects matches across pages", () => {
    const rows = Array.from({ length: 125 }, (_, index) => ({
      id: String(index),
      value: `Value ${index}`,
      visible: true,
    }));
    const grid = make(rows, column, { op: "in", value: [] });
    render(<Harness model={grid} pageSize={10} />);
    const dialog = open();
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(11);
    fireEvent.change(screen.getByRole("textbox", { name: "Search values" }), {
      target: { value: "Value 1" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search values" }), {
      target: { value: "Value 5" },
    });
    expect(choice("Value 5 ").checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(grid.getFilteredRows()).toHaveLength(
      rows.filter((row) => String(row.value).includes("Value 1")).length,
    );
  });
  it("preserves an explicit all-current-values selection and leaves newly arriving values unchecked", () => {
    const grid = make();
    render(<Harness model={grid} />);
    open();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    act(() =>
      grid.setRows([...source, { id: "new", value: "Delta", visible: true }]),
    );
    expect(choice("Delta").checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(grid.getState().filters.value?.op).toBe("in");
    expect(grid.getFilteredRows()).toHaveLength(4);
  });
  it("includes new values in implicit all without silently changing the committed filter", () => {
    const grid = make(),
      applied = vi.fn(),
      cleared = vi.fn();
    render(<Harness model={grid} applied={applied} cleared={cleared} />);
    open();
    act(() =>
      grid.setRows([...source, { id: "new", value: "Delta", visible: true }]),
    );
    expect(choice("Delta").checked).toBe(true);
    expect(applied).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(cleared).toHaveBeenCalledTimes(1);
  });
  it("reports removed selections, keeps surviving draft keys, and never auto-writes a filter", () => {
    const grid = make(source, column, { op: "in", value: ["Alpha", "Beta"] }),
      applied = vi.fn();
    render(<Harness model={grid} applied={applied} />);
    open();
    fireEvent.click(choice("Beta"));
    act(() =>
      grid.setRows([
        { id: "b", value: "Beta", visible: true },
        { id: "new", value: "Delta", visible: true },
      ]),
    );
    expect(screen.getByText(/1 selected values disappeared/)).toBeTruthy();
    expect(choice("Beta").checked).toBe(false);
    expect(choice("Delta").checked).toBe(false);
    expect(applied).not.toHaveBeenCalled();
    expect(grid.getState().filters.value?.value).toEqual(["Alpha", "Beta"]);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(applied).toHaveBeenCalledWith({ op: "in", value: [] });
  });
  it("requires Reload or Cancel after an external filter change conflicts with a dirty draft", () => {
    const grid = make(source, column, { op: "in", value: ["Alpha"] }),
      applied = vi.fn();
    render(<Harness model={grid} applied={applied} />);
    open();
    fireEvent.click(choice("Beta"));
    act(() => grid.setFilter("value", { op: "in", value: ["Gamma"] }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /applied filter changed/,
    );
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(applied).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reload applied filter" }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(choice("Gamma").checked).toBe(true);
    expect(choice("Beta").checked).toBe(false);
  });
  it("does not confuse cosmetic cloned state or equivalent membership order with a conflict", () => {
    const grid = make(source, column, { op: "in", value: ["Alpha", "Beta"] });
    render(<Harness model={grid} />);
    open();
    fireEvent.click(choice("Gamma"));
    act(() => grid.selectRows(["a"]));
    act(() => grid.resizeColumn("value", 220));
    act(() =>
      grid.setFilter("value", { op: "in", value: ["beta", "ALPHA", "alpha"] }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(choice("Gamma").checked).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("rebuilds source choices after explicit value-cache expiry while retaining draft keys", () => {
    let suffix = "";
    const grid = make(
      source,
      { ...column, valueGetter: (row) => `${String(row.value)}${suffix}` },
      { op: "in", value: ["Alpha"] },
    );
    render(<Harness model={grid} />);
    open();
    act(() =>
      grid.setRows(
        source.map((row) =>
          row.id === "b" ? { ...row, value: "Changed" } : row,
        ),
      ),
    );
    expect(choice("Changed")).toBeTruthy();
    suffix = " refreshed";
    act(() => grid.expireValueCache());
    expect(choice("Changed refreshed").checked).toBe(false);
    expect(choice("Alpha refreshed").checked).toBe(false);
    expect(grid.getState().filters.value?.value).toEqual(["Alpha"]);
  });
  it("refreshes choices through ordinary cell edit, undo and redo without changing the staged filter", () => {
    const grid = make(
        source,
        { ...column, editable: true },
        { op: "in", value: ["Alpha"] },
      ),
      applied = vi.fn();
    render(<Harness model={grid} applied={applied} />);
    open();
    act(() => {
      expect(grid.editCell("b", "value", "Changed")).toBeUndefined();
    });
    expect(choice("Changed").checked).toBe(false);
    act(() => {
      expect(grid.undo()).toBe(true);
    });
    expect(choice("Beta").checked).toBe(false);
    act(() => {
      expect(grid.redo()).toBe(true);
    });
    expect(choice("Changed").checked).toBe(false);
    expect(applied).not.toHaveBeenCalled();
    expect(grid.getState().filters.value?.value).toEqual(["Alpha"]);
  });
  it("preserves unsupported filters until Clear is explicitly applied", () => {
    const grid = make(source, column, { op: "contains", value: "Al" }),
      cleared = vi.fn();
    render(<Harness model={grid} cleared={cleared} />);
    open();
    expect(screen.getByText(/not a value list/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(grid.getState().filters.value?.op).toBe("contains");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(cleared).toHaveBeenCalledTimes(1);
  });
  it("indexes all resident choices while preserving other column, quick and advanced AND filters", () => {
    const grid = make();
    grid.setFilter("visible", { op: "equals", value: true });
    grid.setQuickFilter("Alpha");
    grid.setAdvancedFilter({
      kind: "condition",
      columnId: "value",
      filter: { op: "startsWith", value: "Al" },
    });
    render(<Harness model={grid} />);
    open();
    expect(choice("Beta")).toBeTruthy();
    expect(choice("Gamma")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.click(choice("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["a"]);
    expect(grid.getState().filters.visible).toEqual({
      op: "equals",
      value: true,
    });
    expect(grid.getState().quickFilter).toBe("Alpha");
    expect(grid.getState().advancedFilter).toBeTruthy();
  });
  it("keeps the draft and applied filter when a controlled callback rejects Apply", () => {
    const failure = vi.fn(() => {
      throw new Error("Application rejected this filter");
    });
    render(
      <SetListFilter
        model={make()}
        column={column}
        label="Application value filter"
        onFilterChange={failure}
        onClear={() => {}}
      />,
    );
    open();
    fireEvent.click(choice("Beta"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Application rejected this filter",
    );
    expect(choice("Beta").checked).toBe(false);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("groups invalid typed values with blanks and explains that bucket explicitly", () => {
    const rows = [
      { id: "a", value: 3n, visible: true },
      { id: "b", value: "bad integer", visible: true },
      { id: "c", value: null, visible: true },
    ];
    const grid = make(rows, { ...column, type: "bigint" });
    render(<Harness model={grid} />);
    open();
    expect(screen.getByText("Includes 1 invalid typed values")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.click(choice("Blank or invalid"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["b", "c"]);
  });
  it("disambiguates duplicate formatted labels without merging typed choices or executing markup", () => {
    const rows = [
      { id: "a", value: 1, visible: true },
      { id: "b", value: 2, visible: true },
    ];
    const grid = make(rows, {
      ...column,
      type: "number",
      valueFormatter: () => "<b>Same</b>",
    });
    render(<Harness model={grid} />);
    open();
    expect(screen.getAllByText("<b>Same</b>")).toHaveLength(2);
    expect(screen.getByRole("dialog").querySelector("b")).toBeNull();
    fireEvent.click(choice("Number: 2"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["a"]);
  });
  it("keeps large BigInt membership exact through selection and Apply", () => {
    const rows = [
      { id: "a", value: 9007199254740993n, visible: true },
      { id: "b", value: 9007199254740994n, visible: true },
    ];
    const grid = make(rows, { ...column, type: "bigint" });
    render(<Harness model={grid} />);
    open();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.click(choice("9007199254740993"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(grid.getState().filters.value?.value).toEqual([9007199254740993n]);
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["a"]);
  });
  it("distinguishes negative zero from zero even when their formatted labels collide", () => {
    const rows = [
      { id: "negative", value: -0, visible: true },
      { id: "positive", value: 0, visible: true },
    ];
    const grid = make(rows, {
      ...column,
      type: "number",
      valueFormatter: () => "Zero",
    });
    render(<Harness model={grid} />);
    open();
    expect(choice("Number: -0")).toBeTruthy();
    expect(choice("Number: 0")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.click(choice("Number: -0"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      Object.is((grid.getState().filters.value?.value as unknown[])[0], -0),
    ).toBe(true);
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["negative"]);
  });
  it("coalesces equal date instants and applies immutable canonical date operands", () => {
    const rows = [
      { id: "a", value: "2026-01-01T00:00:00Z", visible: true },
      { id: "b", value: "2025-12-31T19:00:00-05:00", visible: true },
      { id: "c", value: "2026-01-02T00:00:00Z", visible: true },
    ];
    const grid = make(rows, {
      ...column,
      type: "date",
      valueFormatter: (value) =>
        Date.parse(String(value)) === Date.UTC(2026, 0, 1)
          ? "First instant"
          : "Second instant",
    });
    render(<Harness model={grid} />);
    open();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all matching values" }),
    );
    fireEvent.click(choice("First instant"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(grid.getState().filters.value?.value).toEqual([
      "2026-01-01T00:00:00.000Z",
    ]);
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["a", "b"]);
  });
  it("handles missing models, index limits and model replacement without writes", () => {
    const applied = vi.fn();
    const view = render(
      <SetListFilter
        column={column}
        label="Application value filter"
        onFilterChange={applied}
        onClear={() => {}}
      />,
    );
    open();
    expect(screen.getByRole("alert").textContent).toMatch(
      /resident grid model/,
    );
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    view.unmount();
    const rows = Array.from({ length: 10001 }, (_, index) => ({
      id: String(index),
      value: `Distinct ${index}`,
      visible: true,
    }));
    const grid = make(rows);
    const other = make();
    const second = render(<Harness model={grid} applied={applied} />);
    open();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(applied).not.toHaveBeenCalled();
    second.rerender(<Harness model={other} applied={applied} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("preserves RTL drafts across language switches and closes native dialogs with focus restoration", () => {
    const previousShow = Object.getOwnPropertyDescriptor(
        HTMLDialogElement.prototype,
        "showModal",
      ),
      previousClose = Object.getOwnPropertyDescriptor(
        HTMLDialogElement.prototype,
        "close",
      );
    const show = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: show,
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: close,
    });
    try {
      const grid = make();
      const view = render(
        <StrictMode>
          <div dir="rtl">
            <GridLocaleProvider locale={enUS}>
              <Harness model={grid} />
            </GridLocaleProvider>
          </div>
        </StrictMode>,
      );
      const modal = open();
      expect(show).toHaveBeenCalled();
      fireEvent.click(choice("Beta"));
      view.rerender(
        <StrictMode>
          <div dir="rtl">
            <GridLocaleProvider locale={esES}>
              <Harness model={grid} />
            </GridLocaleProvider>
          </div>
        </StrictMode>,
      );
      expect(screen.getByRole("dialog")).toBe(modal);
      expect(choice("Beta").checked).toBe(false);
      expect(
        screen.getByRole("textbox", { name: esES.messages["setList.search"] }),
      ).toBeTruthy();
      expect(modal.closest("[dir]")?.getAttribute("dir")).toBe("rtl");
      fireEvent(modal, new Event("cancel", { cancelable: true }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(close).toHaveBeenCalled();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Application value filter" }),
      );
    } finally {
      cleanup();
      for (const [name, descriptor] of [
        ["showModal", previousShow],
        ["close", previousClose],
      ] as const) {
        if (descriptor)
          Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
      }
    }
  });
});
