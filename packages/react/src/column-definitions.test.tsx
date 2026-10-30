// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
type Row = { id: string; name: string; alternate: string };
const rows: Row[] = [
  { id: "one", name: "Alpha", alternate: "First" },
  { id: "two", name: "Alpha", alternate: "Second" },
];
const columns: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", editable: true },
  { id: "alternate", field: "alternate", header: "Alternate" },
];
const make = () =>
  createGrid({ rows, columns, getRowId: (row: Row) => row.id });
const cell = (row = "one", column = "name") =>
  document.querySelector<HTMLElement>(
    `[data-row-id="${row}"][data-column-id="${column}"]`,
  )!;
afterEach(cleanup);
it("cancels a same-ID cell draft before a new field can receive its value", () => {
  const model = make();
  render(
    <StrictMode>
      <DataGrid model={model} />
    </StrictMode>,
  );
  fireEvent.doubleClick(cell());
  const editor = screen.getByRole("textbox", { name: /Edit Name/ });
  fireEvent.change(editor, { target: { value: "Stale draft" } });
  act(() =>
    model.setColumns([
      { id: "name", field: "alternate", header: "Replacement", editable: true },
    ]),
  );
  expect(screen.queryByRole("textbox", { name: /Edit/ })).toBeNull();
  expect(cell().textContent).toContain("First");
  expect(model.getRow("one")).toBe(rows[0]);
  expect(model.undo()).toBe(false);
  fireEvent.doubleClick(cell());
  const next = screen.getByRole("textbox", { name: /Edit Replacement/ });
  fireEvent.change(next, { target: { value: "Fresh" } });
  fireEvent.keyDown(next, { key: "Enter" });
  expect(model.getRow("one")!.alternate).toBe("Fresh");
  expect(model.getRow("one")!.name).toBe("Alpha");
});
it("keeps an invalid replacement's active draft and does not steal intentional outside focus", () => {
  const model = make();
  render(
    <>
      <button>Outside columns</button>
      <DataGrid model={model} />
    </>,
  );
  fireEvent.doubleClick(cell());
  const editor = screen.getByRole("textbox", { name: /Edit Name/ });
  fireEvent.change(editor, { target: { value: "Retained draft" } });
  expect(() =>
    act(() => model.setColumns([{ id: "name", width: NaN }])),
  ).toThrow();
  expect(screen.getByRole("textbox", { name: /Edit Name/ })).toBe(editor);
  expect((editor as HTMLInputElement).value).toBe("Retained draft");
  const outside = screen.getByRole("button", { name: "Outside columns" });
  outside.focus();
  act(() => model.setColumns([columns[1]]));
  expect(document.activeElement).toBe(outside);
  expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe("2");
});
it("rebuilds same-ID row-span ownership when its field changes", () => {
  const model = make();
  model.setColumns([{ ...columns[0], spanRows: true }, columns[1]]);
  render(<DataGrid model={model} />);
  expect(cell().getAttribute("aria-rowspan")).toBe("2");
  expect(cell("two")).toBeNull();
  act(() =>
    model.setColumns([
      { ...columns[0], field: "alternate", spanRows: true },
      columns[1],
    ]),
  );
  expect(cell().getAttribute("aria-rowspan")).toBeNull();
  expect(cell("two").textContent).toContain("Second");
});
it("clears mounted ranges when definitions change and removes deleted view IDs safely", () => {
  const model = make();
  render(<DataGrid model={model} cellSelection />);
  fireEvent.click(cell());
  expect(cell().getAttribute("aria-selected")).toBe("true");
  act(() => model.setColumns([{ ...columns[0], field: "alternate" }]));
  expect(cell().getAttribute("aria-selected")).toBe("false");
  expect(cell("one", "alternate")).toBeNull();
});
it("closes a row editor and column menu after accepted definitions", () => {
  const model = make();
  const view = render(<DataGrid model={model} editMode="row" columnMenu />);
  fireEvent.doubleClick(cell());
  expect(screen.getByRole("dialog")).toBeTruthy();
  act(() => model.setColumns([{ ...columns[0], field: "alternate" }]));
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(<DataGrid model={model} columnMenu />);
  fireEvent.click(
    screen.getByRole("button", { name: "Column menu for Name" }),
    { detail: 1 },
  );
  expect(screen.getByRole("menu")).toBeTruthy();
  act(() => model.setColumns([{ ...columns[0], header: "New name" }]));
  expect(screen.queryByRole("menu")).toBeNull();
});
it("renders a zero-column client schema without fabricated data cells and can restore it", () => {
  const model = make();
  render(<DataGrid model={model} />);
  act(() => model.setColumns([]));
  expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe("1");
  expect(document.querySelector("[data-row-id][data-column-id]")).toBeNull();
  act(() => model.setColumns(columns));
  expect(cell().textContent).toContain("Alpha");
});

it("keeps a zero-column view without selection controls structurally accessible", () => {
  const model = make();
  render(<DataGrid model={model} selectionMode="none" />);
  act(() => model.setColumns([]));
  expect(screen.getByRole("columnheader").textContent).toBe(
    "No visible columns",
  );
  expect(screen.getAllByRole("row")).toHaveLength(1);
  expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("1");
  expect(model.getRows()).toEqual(rows);
  act(() => model.setColumns(columns));
  expect(cell().textContent).toContain("Alpha");
});

it("does not apply a delayed clipboard read into a newly selected same-ID field", async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  let resolve!: (value: string) => void;
  const pending = new Promise<string>((done) => {
    resolve = done;
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: () => pending },
  });
  try {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    act(() => model.setColumns([{ ...columns[0], field: "alternate" }]));
    fireEvent.click(cell());
    await act(async () => {
      resolve("Stale clipboard");
      await pending;
    });
    expect(model.getRow("one")).toBe(rows[0]);
    expect(model.undo()).toBe(false);
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
