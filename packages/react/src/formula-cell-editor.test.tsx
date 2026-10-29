// @vitest-environment jsdom
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createFormulaGrid, formulaInput } from "../../core/src/index";
import { FormulaCellEditor, type FormulaEditMode } from "./formula-cell-editor";
import { GridLocaleProvider, enUS, esES } from "./locale";

const position = { rowId: "row", columnId: "total" };
function make() {
  return createFormulaGrid({
    rows: [{ id: "row", input: 2, total: formulaInput("=A1*3") }],
    getRowId: (row) => row.id,
    columns: [
      { id: "input", field: "input", type: "number" },
      {
        id: "total",
        field: "total",
        header: "Application total",
        editable: true,
      },
    ],
    formulaColumns: ["total"],
  });
}
function Harness({
  bundle,
  blurred = () => {},
  cancelled = () => {},
}: {
  bundle: ReturnType<typeof make>;
  blurred?: () => void;
  cancelled?: () => void;
}) {
  const raw = bundle.formulas.getFormula(position);
  const [mode, setMode] = useState<FormulaEditMode>(
    raw === undefined ? "literal" : "formula",
  );
  const [value, setValue] = useState(
    raw ?? String(bundle.formulas.getInput(position) ?? ""),
  );
  const [error, setError] = useState(""),
    [closed, setClosed] = useState(false);
  const finished = useRef(false),
    next = useRef<HTMLButtonElement>(null);
  function commit() {
    if (finished.current) return false;
    const failure =
      mode === "formula"
        ? bundle.formulas.setFormula(position, value)
        : bundle.model.editCell(position.rowId, position.columnId, value);
    if (failure) {
      setError(failure);
      return false;
    }
    finished.current = true;
    setClosed(true);
    next.current?.focus();
    return true;
  }
  function cancel() {
    finished.current = true;
    cancelled();
    setClosed(true);
    next.current?.focus();
  }
  const row = bundle.model.getRow(position.rowId)!;
  const column = bundle.model
    .getColumns()
    .find((column) => column.id === position.columnId)!;
  return (
    <>
      <button ref={next}>Next logical cell</button>
      {!closed && (
        <FormulaCellEditor
          row={row}
          column={column}
          value={value}
          label="Edit application total"
          mode={mode}
          onModeChange={setMode}
          onChange={(value) => {
            setValue(value);
            setError("");
          }}
          error={error || undefined}
          onCommit={commit}
          onCancel={cancel}
          onBlur={() => {
            blurred();
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancel();
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              event.stopPropagation();
              commit();
            }
          }}
        />
      )}
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("explicit formula editor boundary", () => {
  it("seeds raw expressions and formula mode instead of the computed display value", () => {
    const bundle = make();
    render(<Harness bundle={bundle} />);
    expect(bundle.model.getValue(bundle.model.getRow("row")!, "total")).toBe(6);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Edit application total",
        }) as HTMLInputElement
      ).value,
    ).toBe("=A1*3");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Cell input mode",
        }) as HTMLSelectElement
      ).value,
    ).toBe("formula");
  });
  it("keeps focus transitions and mode changes inside the editor from committing", () => {
    const bundle = make(),
      blurred = vi.fn();
    render(<Harness bundle={bundle} blurred={blurred} />);
    const input = screen.getByRole("textbox"),
      selector = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Uncommitted draft" } });
    act(() => selector.focus());
    fireEvent.change(selector, { target: { value: "literal" } });
    act(() => input.focus());
    act(() => selector.focus());
    fireEvent.change(selector, { target: { value: "formula" } });
    expect(blurred).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("Uncommitted draft");
    expect(bundle.formulas.getFormula(position)).toBe("=A1*3");
  });
  it("keeps invalid formula drafts open after Enter and Tab without changing the prior atom", () => {
    const bundle = make();
    render(<Harness bundle={bundle} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "=SUM(" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("=SUM(");
    expect(bundle.formulas.getFormula(position)).toBe("=A1*3");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByRole("textbox")).toBe(input);
    expect(bundle.formulas.getFormula(position)).toBe("=A1*3");
  });
  it("commits a raw formula through the host's Enter policy and shared undo history", () => {
    const bundle = make();
    render(<Harness bundle={bundle} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "=A1*4" } });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(bundle.formulas.getFormula(position)).toBe("=A1*4");
    expect(bundle.model.getValue(bundle.model.getRow("row")!, "total")).toBe(8);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Next logical cell" }),
    );
    act(() => {
      expect(bundle.model.undo()).toBe(true);
    });
    expect(bundle.formulas.getFormula(position)).toBe("=A1*3");
  });
  it("treats equals-prefixed text as literal only when Literal mode is explicitly selected", () => {
    const bundle = make();
    render(<Harness bundle={bundle} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "literal" },
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "=A1*99" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Tab" });
    expect(bundle.formulas.getFormula(position)).toBeUndefined();
    expect(bundle.model.getValue(bundle.model.getRow("row")!, "total")).toBe(
      "=A1*99",
    );
  });
  it("cancels from the mode selector with Escape without a blur commit", () => {
    const bundle = make(),
      cancelled = vi.fn();
    render(<Harness bundle={bundle} cancelled={cancelled} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "=A1*100" },
    });
    const selector = screen.getByRole("combobox");
    act(() => selector.focus());
    fireEvent.keyDown(selector, { key: "Escape" });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(bundle.formulas.getFormula(position)).toBe("=A1*3");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("uses Alt+M to reach the selector and Enter to return without forwarding a commit key", () => {
    const forwarded = vi.fn(),
      cancel = vi.fn();
    const bundle = make();
    render(
      <FormulaCellEditor
        row={bundle.model.getRow("row")!}
        column={bundle.model.getColumns()[1]}
        value="=A1*3"
        mode="formula"
        onModeChange={() => {}}
        label="Raw expression"
        onChange={() => {}}
        onCommit={() => {}}
        onCancel={cancel}
        onKeyDown={forwarded}
      />,
    );
    const input = screen.getByRole("textbox"),
      selector = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "m", altKey: true });
    expect(document.activeElement).toBe(selector);
    expect(forwarded).not.toHaveBeenCalled();
    fireEvent.keyDown(selector, { key: "Enter" });
    expect(document.activeElement).toBe(input);
    expect(forwarded).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(forwarded).toHaveBeenCalledTimes(1);
  });
  it("preserves mode, raw draft and DOM focus across locale and direction changes", () => {
    const bundle = make();
    const view = render(
      <div dir="ltr">
        <GridLocaleProvider locale={enUS}>
          <Harness bundle={bundle} />
        </GridLocaleProvider>
      </div>,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "=A1*7" } });
    act(() => input.focus());
    view.rerender(
      <div dir="rtl">
        <GridLocaleProvider locale={esES}>
          <Harness bundle={bundle} />
        </GridLocaleProvider>
      </div>,
    );
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("=A1*7");
    expect(document.activeElement).toBe(input);
    expect(
      (
        screen.getByRole("combobox", {
          name: esES.messages["formula.mode"],
        }) as HTMLSelectElement
      ).value,
    ).toBe("formula");
    expect(bundle.formulas.getFormula(position)).toBe("=A1*3");
  });
  it("commits only when focus leaves the whole editor and leaves invalid drafts intact", () => {
    const bundle = make(),
      blurred = vi.fn();
    render(<Harness bundle={bundle} blurred={blurred} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "=SUM(" } });
    act(() => screen.getByRole("combobox").focus());
    expect(blurred).not.toHaveBeenCalled();
    act(() => input.focus());
    act(() =>
      screen.getByRole("button", { name: "Next logical cell" }).focus(),
    );
    expect(blurred).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "=SUM(",
    );
    expect(bundle.formulas.getFormula(position)).toBe("=A1*3");
  });
});
