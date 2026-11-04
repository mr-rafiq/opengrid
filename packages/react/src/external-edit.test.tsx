// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type GridEditRequest } from "@opengrid/core";
import { DataGrid } from "./data-grid";
import { deDE, GridLocaleProvider } from "./locale";

afterEach(cleanup);
function fixture() {
  const original = { id: "a", amount: 2 };
  const requests: GridEditRequest<typeof original>[] = [];
  const model = createGrid({
    rows: [original, { id: "b", amount: 5 }],
    getRowId: (row) => row.id,
    columns: [
      {
        id: "virtual",
        header: "Amount",
        editable: true,
        type: "number",
        valueGetter: (row) => row.amount * 2,
      },
    ],
    onEditRequest: (request) => {
      requests.push(request);
    },
  });
  return { model, requests, original };
}
function cell(row = "a") {
  return document.querySelector<HTMLElement>(
    `[data-row-id="${row}"][data-column-id="virtual"]`,
  )!;
}

describe("external edit request interaction", () => {
  it("submits a getter cell and waits for host data without announcing a local save", () => {
    const { model, requests, original } = fixture();
    render(<DataGrid model={model} selectionMode="none" />);
    expect(cell().getAttribute("aria-readonly")).toBe("false");
    fireEvent.keyDown(cell(), { key: "F2" });
    const editor = screen.getByRole("spinbutton", {
      name: "Edit Amount row a",
    });
    fireEvent.change(editor, { target: { value: "18" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(requests).toHaveLength(1);
    expect(requests[0].edits[0].value).toBe(18);
    expect(model.getRow("a")).toBe(original);
    expect(cell().textContent).toBe("4");
    expect(screen.getByText(/Edit requested\. The application/)).toBeTruthy();
    expect(screen.queryByText("Cell updated")).toBeNull();
    expect(model.undo()).toBe(false);
    act(() => model.applyTransaction({ update: [{ id: "a", amount: 9 }] }));
    expect(cell().textContent).toBe("18");
  });

  it("submits a row draft with a distinct action and closes without changing source", () => {
    const { model, requests } = fixture();
    render(<DataGrid model={model} editMode="row" selectionMode="none" />);
    fireEvent.keyDown(cell(), { key: "F2" });
    expect(screen.queryByRole("button", { name: "Save row" })).toBeNull();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Edit Amount" }), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit row" }));
    expect(requests).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cell().textContent).toBe("4");
    expect(screen.getByText(/Edit requested\. The application/)).toBeTruthy();
  });

  it("pastes through the request boundary and avoids a false undo promise", () => {
    const { model, requests } = fixture();
    render(<DataGrid model={model} selectionMode="none" />);
    fireEvent.click(cell());
    fireEvent.paste(cell(), { clipboardData: { getData: () => "12\n14" } });
    expect(requests).toHaveLength(1);
    expect(requests[0].edits.map((e) => e.value)).toEqual([12, 14]);
    expect(cell().textContent).toBe("4");
    expect(cell("b").textContent).toBe("10");
    expect(screen.getByText(/Range edit requested/)).toBeTruthy();
    expect(screen.queryByText(/Cells pasted\. Undo/)).toBeNull();
  });

  it("keeps request mode behind the existing read-only boundary", () => {
    const { model, requests } = fixture();
    model.setReadOnly(true);
    render(<DataGrid model={model} selectionMode="none" />);
    expect(cell().getAttribute("aria-readonly")).toBe("true");
    fireEvent.keyDown(cell(), { key: "F2" });
    fireEvent.paste(cell(), { clipboardData: { getData: () => "12" } });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it("uses German request text and submit labels for row editing", () => {
    const { model } = fixture();
    render(
      <GridLocaleProvider locale={deDE}>
        <DataGrid model={model} editMode="row" selectionMode="none" />
      </GridLocaleProvider>,
    );
    fireEvent.keyDown(cell(), { key: "F2" });
    expect(
      screen.getByRole("button", { name: "Zeile übermitteln" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Änderung angefordert\. Die Anwendung/),
    ).toBeTruthy();
  });
});
