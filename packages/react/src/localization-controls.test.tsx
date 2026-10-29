// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  CellNotesStore,
  createGrid,
  type Column,
  type FilterExpression,
} from "../../core/src/index";
import { GridLocaleProvider, enUS, esES } from "./locale";
import type { GridLocale } from "./locale";
import { CellEditor } from "./editors";
import type { EditorOption } from "./editors";
import { RowEditDialog } from "./row-edit-dialog";
import { CellNoteDialog } from "./cell-note-dialog";
import { AdvancedFilterBuilder } from "./advanced-filter-builder";
import { NumberRangeFilter } from "./filter-components";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const localize = (locale: GridLocale, children: ReactNode) => (
  <GridLocaleProvider locale={locale}>{children}</GridLocaleProvider>
);
const row = { id: "a", name: "Application name", amount: 12 };
const nameColumn: Column<typeof row> = {
  id: "name",
  field: "name",
  header: "Name",
  editable: true,
};
const amountColumn: Column<typeof row> = {
  id: "amount",
  field: "amount",
  header: "Amount",
  type: "number",
  editable: true,
};
const columns = [nameColumn, amountColumn];
const noop = () => {};
function choicesEditor(
  provider: (signal?: AbortSignal) => Promise<readonly EditorOption[]>,
) {
  return (
    <CellEditor
      row={row}
      column={nameColumn}
      value="current"
      label="Application choice"
      editorType="select"
      asyncOptions={provider}
      onChange={noop}
      onCommit={noop}
      onCancel={noop}
    />
  );
}

describe("runtime-localized built-in controls", () => {
  it("translates async loading without restarting the provider or replacing focused editor DOM", async () => {
    let finish!: (value: readonly EditorOption[]) => void;
    const provider = vi.fn(
      (_signal?: AbortSignal) =>
        new Promise<readonly EditorOption[]>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(localize(enUS, choicesEditor(provider)));
    await waitFor(() => expect(provider).toHaveBeenCalledOnce());
    const select = screen.getByRole("combobox", { name: "Application choice" });
    select.focus();
    expect(screen.getByRole("status").textContent).toBe("Loading choices...");
    view.rerender(localize(esES, choicesEditor(provider)));
    expect(screen.getByRole("status").textContent).toBe("Cargando opciones...");
    expect(select.closest(".og-editor-shell")?.getAttribute("lang")).toBe(
      "es-ES",
    );
    expect(screen.getByRole("combobox", { name: "Application choice" })).toBe(
      select,
    );
    expect(document.activeElement).toBe(select);
    expect(provider).toHaveBeenCalledOnce();
    await act(async () =>
      finish([{ value: "current", label: "Application option label" }]),
    );
    expect(
      screen.getByRole("option", { name: "Application option label" }),
    ).toBeTruthy();
    expect((select as HTMLSelectElement).value).toBe("current");
  });
  it("retranslates a stored owned provider-validation notice while keeping retry identity stable", async () => {
    const provider = vi.fn(
      async (_signal?: AbortSignal) =>
        [{ value: 1, label: "Bad" }] as unknown as readonly EditorOption[],
    );
    const view = render(localize(enUS, choicesEditor(provider)));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Options provider returned invalid choices",
      ),
    );
    const select = screen.getByRole("combobox");
    select.focus();
    view.rerender(localize(esES, choicesEditor(provider)));
    expect(screen.getByRole("alert").textContent).toContain(
      "El proveedor de opciones devolvi\u00f3 valores no v\u00e1lidos",
    );
    expect(
      screen.getByRole("button", { name: "Reintentar opciones" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(select);
    expect(provider).toHaveBeenCalledOnce();
  });
  it("does not translate an application error even when its text matches an owned English notice", async () => {
    const provider = vi.fn(async (_signal?: AbortSignal) => {
      throw new Error("Options provider returned invalid choices");
    });
    const view = render(localize(enUS, choicesEditor(provider)));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Options provider returned invalid choices",
      ),
    );
    view.rerender(localize(esES, choicesEditor(provider)));
    expect(screen.getByRole("alert").textContent).toBe(
      "No se pudieron cargar las opciones: Options provider returned invalid choices Reintentar opciones",
    );
    expect(provider).toHaveBeenCalledOnce();
  });
  it("keeps row-edit draft/session/focus while translating the open modal and saving controls", () => {
    const model = createGrid({
      rows: [row],
      columns,
      getRowId: (item) => item.id,
    });
    const close = vi.fn();
    const child = <RowEditDialog model={model} rowId="a" onClose={close} />;
    const view = render(localize(enUS, child));
    const input = screen.getByRole("textbox", {
      name: "Edit Name",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Application draft" } });
    input.focus();
    view.rerender(localize(esES, child));
    expect(
      screen.getByRole("dialog", { name: "Editar la fila a" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("dialog", { name: "Editar la fila a" })
        .getAttribute("lang"),
    ).toBe("es-ES");
    expect(screen.getByRole("textbox", { name: "Editar Name" })).toBe(input);
    expect(input.value).toBe("Application draft");
    expect(document.activeElement).toBe(input);
    expect(model.getRow("a")?.name).toBe("Application name");
    fireEvent.click(screen.getByRole("button", { name: "Guardar fila" }));
    expect(model.getRow("a")?.name).toBe("Application draft");
    expect(close).toHaveBeenCalledOnce();
  });
  it("keeps application row-validation text unchanged and does not refocus it on locale change", () => {
    const model = createGrid({
      rows: [row],
      columns: [
        {
          ...nameColumn,
          validate: (value) =>
            value === "bad" ? "Application validation" : undefined,
        },
      ],
      getRowId: (item) => item.id,
    });
    const child = <RowEditDialog model={model} rowId="a" onClose={noop} />;
    const view = render(localize(enUS, child));
    const input = screen.getByRole("textbox", { name: "Edit Name" });
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Save row" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Application validation",
    );
    input.focus();
    view.rerender(localize(esES, child));
    expect(screen.getByRole("alert").textContent).toBe(
      "Application validation",
    );
    expect(document.activeElement).toBe(input);
  });
  it("preserves note drafts/focus and application labels while translating help and actions", () => {
    const store = new CellNotesStore();
    const position = { rowId: "a", columnId: "name" };
    store.set(position, "Original note");
    const child = (
      <CellNoteDialog
        store={store}
        position={position}
        columnLabel="Application column"
        onClose={noop}
      />
    );
    const view = render(localize(enUS, child));
    const textarea = screen.getByRole("textbox", {
      name: "Note text",
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Application note draft" } });
    textarea.focus();
    view.rerender(localize(esES, child));
    expect(screen.getByRole("dialog", { name: "Nota de celda" })).toBeTruthy();
    expect(
      screen
        .getByRole("dialog", { name: "Nota de celda" })
        .getAttribute("lang"),
    ).toBe("es-ES");
    expect(screen.getByRole("textbox", { name: "Texto de la nota" })).toBe(
      textarea,
    );
    expect(textarea.value).toBe("Application note draft");
    expect(document.activeElement).toBe(textarea);
    expect(screen.getByText(/Application column/).textContent).toBe(
      "Application column \u00b7 Fila a",
    );
    expect(screen.getByText(/Las notas son texto/).textContent).toContain(
      "10.000",
    );
    expect(store.get(position)).toBe("Original note");
    fireEvent.click(screen.getByRole("button", { name: "Guardar nota" }));
    expect(store.get(position)).toBe("Application note draft");
  });
  it("retranslates stored UI-owned note save fallback without clearing its draft", () => {
    const store = new CellNotesStore();
    const position = { rowId: "a", columnId: "name" };
    vi.spyOn(store, "set").mockImplementation(() => {
      throw undefined;
    });
    const child = (
      <CellNoteDialog store={store} position={position} onClose={noop} />
    );
    const view = render(localize(enUS, child));
    const textarea = screen.getByRole("textbox", {
      name: "Note text",
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Unable to save this note",
    );
    view.rerender(localize(esES, child));
    expect(screen.getByRole("alert").textContent).toBe(
      "No se puede guardar esta nota",
    );
    expect(textarea.value).toBe("Draft");
    expect(document.activeElement).toBe(textarea);
  });
  it("keeps an invalid range draft and focused input while translating labels and stored validation", () => {
    const onFilterChange = vi.fn();
    const child = (
      <NumberRangeFilter
        column={amountColumn}
        label="Amount"
        onFilterChange={onFilterChange}
        onClear={noop}
      />
    );
    const view = render(localize(enUS, child));
    const input = screen.getByRole("textbox", {
      name: "Amount minimum",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12e" } });
    input.focus();
    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a complete finite number for each range bound",
    );
    view.rerender(localize(esES, child));
    expect(screen.getByRole("textbox", { name: "M\u00ednimo de Amount" })).toBe(
      input,
    );
    expect(input.value).toBe("12e");
    expect(input.closest(".og-number-range-filter")?.getAttribute("lang")).toBe(
      "es-ES",
    );
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("alert").textContent).toBe(
      "Introduzca un n\u00famero finito completo para cada l\u00edmite",
    );
    expect(onFilterChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "12" } });
    expect(onFilterChange).toHaveBeenCalledWith({ op: "gte", value: "12" });
  });
  it("preserves an advanced-filter draft and focus while translating operator choices and ARIA labels", () => {
    const expression: FilterExpression = {
      kind: "condition",
      columnId: "name",
      filter: { op: "contains", value: "Original" },
    };
    const onApply = vi.fn();
    const child = (
      <AdvancedFilterBuilder
        columns={columns}
        value={expression}
        onApply={onApply}
      />
    );
    const view = render(localize(enUS, child));
    const input = screen.getByRole("textbox", {
      name: "Value 1",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Application filter draft" } });
    input.focus();
    view.rerender(localize(esES, child));
    expect(
      screen.getByRole("heading", { name: "Filtro avanzado" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "Filtro avanzado" })
        .closest(".og-filter-builder")
        ?.getAttribute("lang"),
    ).toBe("es-ES");
    expect(screen.getByRole("textbox", { name: "Valor 1" })).toBe(input);
    expect(input.value).toBe("Application filter draft");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("option", { name: "Contiene" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Name" })).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtro" }));
    expect(onApply).toHaveBeenCalledWith({
      kind: "condition",
      columnId: "name",
      filter: { op: "contains", value: "Application filter draft" },
    });
  });
  it("retranslates owned builder errors without refocusing, and resolves operator IDs at render time", () => {
    const expression: FilterExpression = {
      kind: "condition",
      columnId: "amount",
      filter: { op: "contains", value: "12" },
    };
    const child = (
      <AdvancedFilterBuilder
        columns={columns}
        value={expression}
        onApply={noop}
      />
    );
    const view = render(localize(enUS, child));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Contains is not available for Amount",
    );
    const input = screen.getByRole("textbox", { name: "Value 1" });
    input.focus();
    view.rerender(localize(esES, child));
    expect(screen.getByRole("alert").textContent).toBe(
      "Contiene no est\u00e1 disponible para Amount",
    );
    expect(document.activeElement).toBe(input);
  });
  it("leaves application filter errors raw instead of matching and translating English", () => {
    const expression: FilterExpression = {
      kind: "condition",
      columnId: "name",
      filter: { op: "equals", value: "App" },
    };
    const child = (
      <AdvancedFilterBuilder
        columns={columns}
        value={expression}
        onApply={() => {
          throw new Error("Each AND or OR group needs at least one condition");
        }}
      />
    );
    const view = render(localize(enUS, child));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    view.rerender(localize(esES, child));
    expect(screen.getByRole("alert").textContent).toBe(
      "Each AND or OR group needs at least one condition",
    );
  });
});
