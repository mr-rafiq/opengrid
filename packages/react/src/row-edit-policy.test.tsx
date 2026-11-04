// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
afterEach(cleanup);
const setup = () => {
  const model = createGrid({
    rows: [
      { id: "a", amount: 10, locked: false },
      { id: "b", amount: 20, locked: true },
    ],
    getRowId: (row) => row.id,
    columns: [
      {
        id: "amount",
        field: "amount",
        header: "Amount",
        type: "number",
        editable: (row) => !row.locked,
      },
    ],
  });
  const view = render(
    <DataGrid model={model} cellSelection selectionMode="none" />,
  );
  const cell = (id: string) =>
    view.container.querySelector<HTMLElement>(
      `[data-row-id="${id}"][data-column-id="amount"]`,
    )!;
  return { model, view, cell };
};
it("exposes per-row read-only state and permits only an eligible native editor", () => {
  const { model, cell } = setup();
  expect(cell("b").getAttribute("aria-readonly")).toBe("true");
  fireEvent.doubleClick(cell("b"));
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(cell("b"));
  expect(
    (
      screen.getByRole("button", {
        name: "Edit cell",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(cell("a").getAttribute("aria-readonly")).toBe("false");
  fireEvent.doubleClick(cell("a"));
  const editor = screen.getByRole("spinbutton", { name: "Edit Amount row a" });
  fireEvent.change(editor, { target: { value: "35" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  expect(model.getRow("a")!.amount).toBe(35);
  expect(model.getRow("b")!.amount).toBe(20);
  act(() => {
    model.undo();
  });
  expect(model.getRow("a")!.amount).toBe(10);
});
it("keeps an eligible row unchanged when native clipboard paste also targets a protected row", () => {
  const { model, cell } = setup();
  fireEvent.click(cell("a"));
  fireEvent.paste(cell("a"), { clipboardData: { getData: () => "30\n40" } });
  expect(screen.getByRole("alert").textContent).toMatch(/read only/);
  expect(model.getRows().map((row) => row.amount)).toEqual([10, 20]);
  expect(model.undo()).toBe(false);
});
it("edits and undoes a getter-backed nested value through the native cell editor", () => {
  const source = { id: "one", item: { quantity: 2 } };
  const model = createGrid({
    rows: [source],
    getRowId: (r) => r.id,
    valueCache: true,
    columns: [
      {
        id: "quantity",
        field: "item",
        header: "Quantity",
        type: "number",
        editable: true,
        valueGetter: (r) => r.item.quantity,
        valueSetter: (value, row) => {
          row.item.quantity = Number(value);
          return row;
        },
      },
    ],
  });
  const view = render(<DataGrid model={model} selectionMode="none" />);
  fireEvent.doubleClick(
    view.container.querySelector(
      '[data-row-id="one"][data-column-id="quantity"]',
    )!,
  );
  const editor = screen.getByRole("spinbutton");
  expect((editor as HTMLInputElement).value).toBe("2");
  fireEvent.change(editor, { target: { value: "9" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  expect(model.getValue(model.getRow("one")!, "quantity")).toBe(9);
  expect(source.item.quantity).toBe(2);
  act(() => {
    model.undo();
  });
  expect(model.getValue(model.getRow("one")!, "quantity")).toBe(2);
});
