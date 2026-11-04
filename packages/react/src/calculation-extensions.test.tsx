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
it("retains native grouping/sorting while rendering application labels, decoration and status", () => {
  const model = createGrid({
    rows: [{ id: "a", category: "Materials", value: 12 }],
    getRowId: (r) => r.id,
    columns: [
      { id: "category", field: "category", header: "Category" },
      { id: "value", field: "value", aggregate: "sum" },
    ],
    initialState: { groupBy: ["category"] },
  });
  const view = render(
    <DataGrid
      model={model}
      statusContent={<span>Filtered budget: 12</span>}
      renderHeader={({ column }) => <b>{column.header ?? column.id} summary</b>}
      renderGroupCell={({ node, column, displayValue }) =>
        column.id === "category" ? (
          <strong>Section {node.label}</strong>
        ) : (
          displayValue
        )
      }
      getRowClassName={() => "application-row"}
      getCellClassName={() => "application-cell"}
      getCellTooltip={({ node }) => `Details ${node.label}`}
    />,
  );
  expect(screen.getByText("Category summary")).toBeTruthy();
  expect(screen.getByText("Section Materials")).toBeTruthy();
  expect(screen.getByText("Filtered budget: 12")).toBeTruthy();
  expect(view.container.querySelector(".og-row.application-row")).toBeTruthy();
  expect(
    view.container.querySelector(
      '.og-cell.application-cell[title="Details Materials"]',
    ),
  ).toBeTruthy();
  const sort = screen.getByRole("button", { name: "Category summary" });
  expect(sort.getAttribute("title")).toBe("Sort Category");
  fireEvent.click(sort);
  expect(model.getState().sorting).toEqual([
    { columnId: "category", direction: "asc" },
  ]);
});
it("revokes an open editor and write commands when the model becomes read only", () => {
  const model = createGrid({
    rows: [{ id: "a", value: 1 }],
    getRowId: (r) => r.id,
    columns: [{ id: "value", field: "value", editable: true, type: "number" }],
  });
  const view = render(<DataGrid model={model} cellSelection />);
  fireEvent.doubleClick(
    view.container.querySelector('[data-row-id="a"][data-column-id="value"]')!,
  );
  expect(screen.getByRole("spinbutton")).toBeTruthy();
  act(() => model.setReadOnly(true));
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Paste cells" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Fill down selected cells",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: /Drag to fill cells/ }),
  ).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    view.container
      .querySelector('[data-row-id="a"][data-column-id="value"]')!
      .getAttribute("aria-readonly"),
  ).toBe("true");
});

it("lets a complete hierarchy renderer own its prefix without duplicate native controls and retains grid keyboard expansion", () => {
  const model = createGrid({
    rows: [{ id: "a", category: "Materials", amount: 12 }],
    getRowId: (row) => row.id,
    columns: [
      { id: "category", field: "category" },
      { id: "amount", field: "amount" },
    ],
    initialState: { groupBy: ["category"] },
  });
  const group = model.getRowModel()[0];
  const view = render(
    <DataGrid
      model={model}
      toolbar={false}
      renderTreePrefix={({ node }) =>
        node.children?.length ? (
          <button
            type="button"
            aria-label="Application expansion"
            onClick={(event) => {
              event.stopPropagation();
              model.toggleExpanded(node.id);
            }}
          >
            Open
          </button>
        ) : (
          <span>Leaf prefix</span>
        )
      }
    />,
  );
  expect(
    screen.getByRole("button", { name: "Application expansion" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Expand Materials" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Application expansion" }),
  );
  expect(model.getState().expanded).toContain(group.id);
  expect(screen.getByText("Leaf prefix")).toBeTruthy();
  expect(view.container.querySelectorAll(".og-tree-prefix")).toHaveLength(0);
  view.rerender(
    <DataGrid model={model} toolbar={false} renderTreePrefix={() => null} />,
  );
  const cell = view.container.querySelector(
    `[data-row-id='${group.id}'][data-column-id='category']`,
  )!;
  fireEvent.focus(cell);
  fireEvent.keyDown(cell, { key: "ArrowLeft" });
  expect(model.getState().expanded).not.toContain(group.id);
  fireEvent.keyDown(cell, { key: "ArrowRight" });
  expect(model.getState().expanded).toContain(group.id);
  view.rerender(<DataGrid model={model} toolbar={false} />);
  expect(
    screen.getByRole("button", { name: "Collapse Materials" }),
  ).toBeTruthy();
});
