// @vitest-environment jsdom
import { StrictMode } from "react";
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
  createFormulaGrid,
  formulaInput,
  isFormulaError,
  type FormulaGridInput,
  type Column,
} from "../../core/src/index";
import { DataGrid } from "./data-grid";
import { GridLocaleProvider, enUS, esES } from "./locale";

interface SheetRow {
  id: string;
  input: number;
  price: number;
  total: FormulaGridInput;
  note: FormulaGridInput;
}
const columns: Column<SheetRow>[] = [
  {
    id: "input",
    field: "input",
    header: "Input",
    type: "number",
    editable: true,
    width: 140,
  },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    editable: true,
    width: 140,
  },
  {
    id: "total",
    field: "total",
    header: "Total",
    type: "number",
    editable: true,
    width: 240,
  },
  {
    id: "note",
    field: "note",
    header: "Note",
    editable: true,
    width: 240,
  },
];
function make() {
  return createFormulaGrid<SheetRow>({
    columns,
    rows: [
      {
        id: "a",
        input: 2,
        price: 3,
        total: formulaInput("=A1*B1"),
        note: "=1+2",
      },
      {
        id: "b",
        input: 4,
        price: 5,
        total: formulaInput("=C1+1"),
        note: "Literal note",
      },
      {
        id: "c",
        input: 6,
        price: 7,
        total: formulaInput("=SUM(C1:C2)"),
        note: null,
      },
    ],
    getRowId: (row) => row.id,
    formulaColumns: ["total", "note"],
  });
}
function cell(id: string, column = "total") {
  return document.querySelector<HTMLElement>(
    `[data-row-id="${id}"][data-column-id="${column}"]`,
  )!;
}
function edit(id = "a", column = "total") {
  fireEvent.doubleClick(cell(id, column));
  return within(cell(id, column)).getByRole("textbox") as HTMLInputElement;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("registered formula model grid integration", () => {
  it("automatically seeds raw formulas, ignores unchanged Enter and shares dependency undo", () => {
    const { model, formulas } = make();
    render(<DataGrid model={model} />);
    expect(cell("a").textContent).toBe("6");
    let input = edit();
    expect(input.value).toBe("=A1*B1");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Cell input mode",
        }) as HTMLSelectElement
      ).value,
    ).toBe("formula");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(formulas.getFormula({ rowId: "a", columnId: "total" })).toBe(
      "=A1*B1",
    );
    expect(model.undo()).toBe(false);
    input = edit();
    fireEvent.change(input, { target: { value: "=A1*4" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cell("a").textContent).toBe("8");
    expect(cell("b").textContent).toBe("9");
    expect(cell("c").textContent).toBe("17");
    expect(document.activeElement).toBe(cell("b"));
    act(() => model.undo());
    expect(cell("a").textContent).toBe("6");
    expect(cell("b").textContent).toBe("7");
    expect(cell("c").textContent).toBe("13");
  });
  it("retains rejected raw drafts through Enter and Tab, then replaces a formula with a literal", () => {
    const { model, formulas } = make();
    render(<DataGrid model={model} />);
    const input = edit();
    fireEvent.change(input, { target: { value: "=SUM(" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("=SUM(");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(document.activeElement).toBe(input);
    expect(formulas.getFormula({ rowId: "a", columnId: "total" })).toBe(
      "=A1*B1",
    );
    expect(model.undo()).toBe(false);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Cell input mode" }),
      { target: { value: "literal" } },
    );
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(formulas.getInput({ rowId: "a", columnId: "total" })).toBe(12);
    expect(
      formulas.getFormula({ rowId: "a", columnId: "total" }),
    ).toBeUndefined();
    act(() => model.undo());
    expect(formulas.getFormula({ rowId: "a", columnId: "total" })).toBe(
      "=A1*B1",
    );
    expect(cell("a").textContent).toBe("6");
  });
  it("does not execute equals-prefixed literals until formula mode is explicitly committed", () => {
    const { model, formulas } = make();
    render(<DataGrid model={model} />);
    expect(cell("a", "note").textContent).toBe("=1+2");
    let input = edit("a", "note");
    expect(input.value).toBe("=1+2");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Cell input mode",
        }) as HTMLSelectElement
      ).value,
    ).toBe("literal");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Cell input mode" }),
      { target: { value: "formula" } },
    );
    fireEvent.keyDown(input, { key: "Escape" });
    expect(formulas.getInput({ rowId: "a", columnId: "note" })).toBe("=1+2");
    input = edit("a", "note");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Cell input mode" }),
      { target: { value: "formula" } },
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cell("a", "note").textContent).toBe("3");
    act(() => model.undo());
    expect(cell("a", "note").textContent).toBe("=1+2");
  });
  it("keeps mode focus inside the editor and Escape from the selector cancels without writes", () => {
    const { model, formulas } = make();
    render(<DataGrid model={model} />);
    const input = edit();
    fireEvent.change(input, { target: { value: "=A1*99" } });
    fireEvent.keyDown(input, { key: "m", altKey: true });
    const mode = screen.getByRole("combobox", { name: "Cell input mode" });
    expect(document.activeElement).toBe(mode);
    fireEvent.change(mode, { target: { value: "literal" } });
    expect(formulas.getFormula({ rowId: "a", columnId: "total" })).toBe(
      "=A1*B1",
    );
    fireEvent.keyDown(mode, { key: "Escape" });
    expect(document.activeElement).toBe(cell("a"));
    expect(model.undo()).toBe(false);
  });
  it("renders typed runtime errors visibly without publishing from Strict Mode reads", () => {
    const { model, formulas } = make();
    formulas.setFormula({ rowId: "a", columnId: "total" }, "=C1");
    const listener = vi.fn();
    model.subscribe(listener);
    const view = render(
      <StrictMode>
        <DataGrid model={model} />
      </StrictMode>,
    );
    expect(cell("a").textContent).toContain("#CYCLE");
    expect(cell("a").getAttribute("aria-invalid")).toBe("true");
    expect(cell("a").getAttribute("data-formula-error")).toBe("CYCLE");
    expect(cell("a").getAttribute("aria-description")).toBeTruthy();
    expect(model.getValue(model.getRow("a")!, "total")).toBeNull();
    expect(
      isFormulaError(formulas.getResult({ rowId: "a", columnId: "total" })),
    ).toBe(true);
    view.rerender(
      <StrictMode>
        <DataGrid model={model} />
      </StrictMode>,
    );
    expect(listener).not.toHaveBeenCalled();
    act(() => model.undo());
    expect(cell("a").textContent).toBe("6");
    expect(cell("a").hasAttribute("aria-invalid")).toBe(false);
  });
  it("preserves editor DOM, raw draft and mode across language and direction switches", () => {
    const { model } = make();
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <DataGrid model={model} direction="ltr" />
      </GridLocaleProvider>,
    );
    const input = edit();
    fireEvent.change(input, { target: { value: "=A1*9" } });
    act(() => input.focus());
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={model} direction="rtl" />
      </GridLocaleProvider>,
    );
    expect(within(cell("a")).getByRole("textbox")).toBe(input);
    expect(input.value).toBe("=A1*9");
    expect(document.activeElement).toBe(input);
    expect(
      (
        screen.getByRole("combobox", {
          name: esES.messages["formula.mode"],
        }) as HTMLSelectElement
      ).value,
    ).toBe("formula");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(model.undo()).toBe(false);
  });
  it("retains connected logical focus when a formula edit filters its source row out", () => {
    const { model, formulas } = make();
    model.setFilter("total", { op: "gt", value: 0 });
    render(<DataGrid model={model} />);
    const input = edit();
    fireEvent.change(input, { target: { value: "=0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(formulas.getResult({ rowId: "a", columnId: "total" })).toBe(0);
    expect(cell("a")).toBeNull();
    expect(document.activeElement?.isConnected).toBe(true);
    expect(document.activeElement).toBe(cell("b"));
    act(() => model.undo());
    expect(cell("a").textContent).toBe("6");
    act(() => model.setFilter("total", { op: "equals", value: 6 }));
    const last = edit();
    fireEvent.change(last, { target: { value: "=0" } });
    fireEvent.keyDown(last, { key: "Enter" });
    expect(cell("a")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("grid"));
  });
  it("shows the row-session guard rather than stringifying formula atoms", () => {
    const { model, formulas } = make();
    render(<DataGrid model={model} editMode="row" />);
    fireEvent.doubleClick(cell("a"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/formula/i);
    expect(
      within(screen.getByRole("dialog")).queryAllByRole("textbox"),
    ).toHaveLength(0);
    expect(formulas.getFormula({ rowId: "a", columnId: "total" })).toBe(
      "=A1*B1",
    );
    expect(model.undo()).toBe(false);
  });
  it("rejects an explicitly supplied controller belonging to a different model", () => {
    const first = make(),
      second = make();
    expect(() =>
      render(<DataGrid model={first.model} formulas={second.formulas} />),
    ).toThrow(/controller must own/i);
  });
});
