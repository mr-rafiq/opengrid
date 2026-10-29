// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid } from "../../core/src/index";
import type { Column } from "../../core/src/types";
import { DataGrid, Sparkline } from "./index";

afterEach(cleanup);
type Item = { id: string; name: string; amount: number; team: string };
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Name", editable: true, pinned: "left" },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    aggregate: "sum",
    validate: (value) =>
      Number(value) < 0 ? "Amount must be positive" : undefined,
  },
  { id: "team", field: "team", header: "Team" },
];
const data: Item[] = [
  { id: "a", name: "Ada", amount: 12, team: "North" },
  { id: "b", name: "Grace", amount: 5, team: "South" },
  { id: "c", name: "Lin", amount: 8, team: "North" },
];
function model(rows = data) {
  return createGrid({
    rows,
    columns,
    getRowId: (row) => row.id,
    initialState: { pageSize: 10 },
  });
}
function cell(id: string, col: string) {
  return document.querySelector<HTMLDivElement>(
    `[data-row-id="${id}"][data-column-id="${col}"]`,
  )!;
}

describe("React DataGrid", () => {
  it("renders and controls prototype-like column IDs without inherited state lookups", () => {
    const grid = createGrid({
      rows: [{ id: "a", value: 4 }],
      columns: [
        {
          id: "__proto__",
          field: "value",
          header: "Prototype id",
          type: "number",
          editable: true,
        },
        { id: "constructor", field: "value", header: "Constructor id" },
      ],
      getRowId: (row) => row.id,
    });
    render(<DataGrid model={grid} />);
    expect(
      screen.getByRole("button", { name: "Sort Prototype id" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sort Constructor id" }),
    ).toBeTruthy();
    act(() => {
      grid.pinColumn("__proto__", "left");
      grid.resizeColumn("__proto__", 240);
      grid.hideColumn("constructor", true);
    });
    expect(cell("a", "__proto__").style.width).toBe("240px");
    expect(cell("a", "__proto__").style.position).toBe("sticky");
    expect(
      screen.queryByRole("button", { name: "Sort Constructor id" }),
    ).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Filter Prototype id" }),
      { target: { value: "4" } },
    );
    expect(grid.getFilteredRows()).toHaveLength(1);
  });
  it("discards an uncommitted editor when its data model is replaced", () => {
    const original = model(),
      replacement = model();
    replacement.setRows([
      { id: "a", name: "Replacement", amount: 7, team: "North" },
    ]);
    const view = render(<DataGrid model={original} />);
    fireEvent.keyDown(cell("a", "name"), { key: "F2" });
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Name row a" }), {
      target: { value: "Uncommitted" },
    });
    view.rerender(<DataGrid model={replacement} />);
    expect(
      screen.queryByRole("textbox", { name: "Edit Name row a" }),
    ).toBeNull();
    expect(cell("a", "name").textContent).toBe("Replacement");
    expect(replacement.getRows()[0].name).toBe("Replacement");
    expect(original.getRows()[0].name).toBe("Ada");
    expect(replacement.undo()).toBe(false);
  });
  it("renders typed data and custom content with labelled grid semantics", () => {
    render(
      <DataGrid
        model={model()}
        ariaLabel="Portfolio"
        renderCell={({ value, column }) =>
          column.id === "amount" ? (
            <strong>${String(value)}</strong>
          ) : (
            String(value)
          )
        }
      />,
    );
    const grid = screen.getByRole("grid", { name: "Portfolio" });
    expect(grid.getAttribute("aria-colcount")).toBe("4");
    expect(grid.getAttribute("aria-rowcount")).toBe("5");
    expect(grid.querySelector("[aria-level]")).toBeNull();
    expect(within(grid).getByText("$12")).toBeTruthy();
    expect(cell("a", "name").getAttribute("tabindex")).toBe("0");
    expect(cell("b", "name").getAttribute("tabindex")).toBe("-1");
  });

  it("cycles sorting, supports Shift multi-sort, and reports sort direction", () => {
    const grid = model();
    render(<DataGrid model={grid} />);
    fireEvent.click(screen.getByRole("button", { name: "Sort Amount" }));
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Sort Name" }), {
      shiftKey: true,
    });
    expect(grid.getState().sorting).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Sort Amount" }));
    expect(grid.getState().sorting).toEqual([
      { columnId: "amount", direction: "desc" },
    ]);
    expect(
      screen
        .getByRole("button", { name: "Sort Amount" })
        .closest("[role=columnheader]")
        ?.getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("applies quick and column filters and renders the empty state", () => {
    const grid = model();
    render(<DataGrid model={grid} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter Name" }), {
      target: { value: "ada" },
    });
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["a"]);
    expect(document.querySelector('[data-row-id="b"]')).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Search all rows" }), {
      target: { value: "unknown" },
    });
    expect(screen.getByText("No matching rows")).toBeTruthy();
  });

  it("edits with F2, rejects invalid input and cancels without changing data", () => {
    const grid = model();
    render(<DataGrid model={grid} />);
    fireEvent.keyDown(cell("a", "amount"), { key: "F2" });
    let editor = screen.getByRole("spinbutton", { name: "Edit Amount row a" });
    fireEvent.change(editor, { target: { value: "-2" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toBe(
      "Amount must be positive",
    );
    expect(grid.getRows()[0].amount).toBe(12);
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(
      screen.queryByRole("spinbutton", { name: "Edit Amount row a" }),
    ).toBeNull();
    fireEvent.keyDown(cell("a", "amount"), { key: "Enter" });
    editor = screen.getByRole("spinbutton", { name: "Edit Amount row a" });
    fireEvent.change(editor, { target: { value: "42" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(grid.getRows()[0].amount).toBe(42);
    expect(document.activeElement).toBe(cell("b", "amount"));
    fireEvent.keyDown(cell("b", "amount"), { key: "z", ctrlKey: true });
    expect(grid.getRows()[0].amount).toBe(12);
  });

  it("keeps one active cell and navigates between columns and rows", () => {
    render(<DataGrid model={model()} />);
    fireEvent.keyDown(cell("a", "name"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("a", "amount"));
    fireEvent.keyDown(cell("a", "amount"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("b", "amount"));
    fireEvent.keyDown(cell("b", "amount"), { key: "End", ctrlKey: true });
    expect(document.activeElement).toBe(cell("c", "team"));
    expect(
      document.querySelectorAll('[data-column-id][tabindex="0"]'),
    ).toHaveLength(1);
  });

  it("supports row and page selection and single-select mode", () => {
    const grid = model();
    const view = render(<DataGrid model={grid} />);
    fireEvent.keyDown(cell("a", "name"), { key: " " });
    expect(grid.getState().selected).toEqual(["a"]);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all rows on page" }),
    );
    expect([...grid.getState().selected].sort()).toEqual(["a", "b", "c"]);
    view.rerender(<DataGrid model={grid} selectionMode="single" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row b" }));
    expect(grid.getState().selected).toEqual(["b"]);
  });

  it("resizes with keyboard and updates visibility, order and pinning", () => {
    const grid = model();
    render(<DataGrid model={grid} />);
    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize Amount" }),
      { key: "ArrowRight" },
    );
    expect(grid.getState().columnWidths.amount).toBe(170);
    fireEvent.click(screen.getByText("Columns"));
    fireEvent.change(screen.getByRole("combobox", { name: "Pin Amount" }), {
      target: { value: "right" },
    });
    expect(grid.getState().columnPinning.amount).toBe("right");
    expect(cell("a", "amount").style.position).toBe("sticky");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Team" }));
    expect(document.querySelector('[data-column-id="team"]')).toBeNull();
    expect(grid.getState().columnVisibility.team).toBe(false);
  });

  it("paginates and updates for external model mutations", () => {
    const grid = model(
      Array.from({ length: 24 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        amount: i,
        team: "North",
      })),
    );
    render(<DataGrid model={grid} />);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(cell("10", "name")).toBeTruthy();
    act(() => grid.setQuickFilter("Person 23"));
    expect(screen.getByText("Person 23")).toBeTruthy();
  });

  it("virtualizes large sets and mounts an offscreen keyboard destination", () => {
    const grid = model(
      Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        name: `Record ${i}`,
        amount: i,
        team: "North",
      })),
    );
    render(
      <DataGrid model={grid} pagination={false} height={250} overscan={3} />,
    );
    expect(document.querySelectorAll(".og-row").length).toBeLessThan(30);
    fireEvent.keyDown(cell("0", "name"), { key: "End", ctrlKey: true });
    expect(cell("999", "team")).toBeTruthy();
    expect(document.activeElement).toBe(cell("999", "team"));
    expect(document.querySelectorAll(".og-row").length).toBeLessThan(30);
  });

  it("clamps an old scroll window after external filtering and sanitizes invalid dimensions", () => {
    const grid = model(
      Array.from({ length: 400 }, (_, i) => ({
        id: String(i),
        name: `Record ${i}`,
        amount: i,
        team: "North",
      })),
    );
    render(
      <DataGrid
        model={grid}
        pagination={false}
        height={Number.NaN}
        rowHeight={Number.POSITIVE_INFINITY}
        overscan={-5}
      />,
    );
    const viewport = screen.getByRole("grid");
    fireEvent.scroll(viewport, { target: { scrollTop: 12000 } });
    expect(cell("0", "name")).toBeTruthy(); // Retained logical focus keeps its DOM target.
    expect(cell("1", "name")).toBeNull(); // Other offscreen rows remain virtualized.
    act(() => grid.setQuickFilter("Record 399"));
    expect(cell("399", "name")).toBeTruthy();
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.style.height).toBe("480px");
  });

  it("uses pointer movement for column resize and preserves core width limits", () => {
    const grid = model();
    render(<DataGrid model={grid} />);
    const resizer = screen.getByRole("separator", { name: "Resize Amount" });
    // JSDOM does not implement PointerEvent; MouseEvent carries clientX for this handler.
    fireEvent(
      resizer,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }),
    );
    fireEvent(window, new MouseEvent("pointermove", { clientX: 160 }));
    fireEvent(window, new MouseEvent("pointerup"));
    expect(grid.getState().columnWidths.amount).toBe(220);
  });

  it("expands and collapses grouped rows using keyboard", () => {
    const grid = createGrid({
      rows: data,
      columns,
      getRowId: (row) => row.id,
      initialState: { groupBy: ["team"], pageSize: 100 },
    });
    render(<DataGrid model={grid} />);
    const group = document.querySelector<HTMLDivElement>(
      '.og-group-row [data-column-id="name"]',
    )!;
    expect(group).toBeTruthy();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(cell("a", "name")).toBeTruthy();
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(cell("a", "name")).toBeNull();
  });

  it("switches to treegrid semantics for grouping and removes hierarchy levels when grouping is cleared", () => {
    const grid = model();
    render(<DataGrid model={grid} ariaLabel="Team hierarchy" />);
    expect(
      screen
        .getByRole("grid", { name: "Team hierarchy" })
        .querySelector("[aria-level]"),
    ).toBeNull();
    act(() => grid.setState({ groupBy: ["team"] }));
    const hierarchy = screen.getByRole("treegrid", { name: "Team hierarchy" });
    const first = hierarchy.querySelector("[aria-level]");
    expect(first?.getAttribute("aria-level")).toBe("1");
    expect(first?.getAttribute("aria-expanded")).toBe("false");
    const groupCell = first?.querySelector<HTMLDivElement>(
      '[data-column-id="name"]',
    )!;
    fireEvent.keyDown(groupCell, { key: "ArrowRight" });
    expect(
      cell("a", "name").closest('[role="row"]')?.getAttribute("aria-level"),
    ).toBe("2");
    act(() => grid.setState({ groupBy: [] }));
    expect(
      screen
        .getByRole("grid", { name: "Team hierarchy" })
        .querySelector("[aria-level]"),
    ).toBeNull();
    expect(screen.queryByRole("treegrid")).toBeNull();
  });

  it("uses treegrid semantics for tree records even when only root rows are visible", () => {
    const grid = createGrid({
      rows: data,
      columns,
      getRowId: (row) => row.id,
      getTreePath: (row) => (row.id === "c" ? ["a", "c"] : [row.id]),
    });
    render(<DataGrid model={grid} />);
    expect(screen.getByRole("treegrid")).toBeTruthy();
    expect(
      cell("a", "name").closest('[role="row"]')?.getAttribute("aria-level"),
    ).toBe("1");
    expect(cell("c", "name")).toBeNull();
    fireEvent.keyDown(cell("a", "name"), { key: "ArrowRight" });
    expect(
      cell("c", "name").closest('[role="row"]')?.getAttribute("aria-level"),
    ).toBe("2");
  });
});

it("renders an accessible sparkline with finite SVG coordinates", () => {
  render(<Sparkline values={[2, 7, Number.NaN, 4]} label="Weekly revenue" />);
  const chart = screen.getByRole("img", { name: "Weekly revenue" });
  expect(chart.querySelector("polyline")?.getAttribute("points")).not.toContain(
    "NaN",
  );
});
