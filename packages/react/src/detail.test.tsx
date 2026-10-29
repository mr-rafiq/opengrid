// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./index";
afterEach(cleanup);
function model() {
  return createGrid({
    rows: Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Record ${i}`,
      value: i,
    })),
    columns: [
      { id: "name", field: "name", pinned: "left" },
      { id: "value", field: "value", type: "number", editable: true },
    ],
    getRowId: (r) => r.id,
    initialState: { pageSize: 100 },
  });
}
describe("variable rows and master detail", () => {
  it("keeps nested clipboard operations scoped to their own grid", () => {
    const parent = model(),
      child = model();
    child.setRows([{ id: "0", name: "Child record", value: 5 }]);
    const view = render(
      <DataGrid
        model={parent}
        defaultExpandedDetailRows={["0"]}
        renderDetail={() => (
          <DataGrid
            model={child}
            ariaLabel="Child grid"
            toolbar={false}
            pagination={false}
            notes={false}
          />
        )}
      />,
    );
    const outer = view.container.querySelector<HTMLElement>(
      '[data-row-id="0"][data-column-id="name"]',
    )!;
    fireEvent.click(outer);
    const childGrid = screen.getByRole("grid", { name: "Child grid" }),
      inner = childGrid.querySelector<HTMLElement>(
        '[data-row-id="0"][data-column-id="name"]',
      )!;
    fireEvent.click(inner);
    const setData = vi.fn();
    fireEvent.copy(inner, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledWith("text/plain", "Child record");
    const value = childGrid.querySelector<HTMLElement>(
      '[data-row-id="0"][data-column-id="value"]',
    )!;
    fireEvent.click(value);
    fireEvent.paste(value, { clipboardData: { getData: () => "7" } });
    expect(child.getRow("0")?.value).toBe(7);
    expect(parent.getRow("0")?.value).toBe(0);
    expect(within(childGrid).getByText("7")).toBeTruthy();
  });
  it("positions variable rows with prefix sums and retains logical focus", () => {
    const grid = model();
    const view = render(
      <DataGrid
        model={grid}
        pagination={false}
        getRowHeight={(node) => (node.id === "0" ? 80 : 30)}
      />,
    );
    const row = (id: string) =>
      view.container.querySelector(`[data-row-id="${id}"]`)!.parentElement!;
    expect(row("0").style.height).toBe("80px");
    expect(row("1").style.top).toBe("80px");
    const first = view.container.querySelector<HTMLElement>(
      '[data-row-id="0"][data-column-id="name"]',
    )!;
    fireEvent.keyDown(first, { key: "End", ctrlKey: true });
    expect(document.activeElement?.getAttribute("data-row-id")).toBe("99");
    expect((screen.getByRole("grid") as HTMLElement).scrollTop).toBeGreaterThan(
      2000,
    );
  });
  it("expands a nested detail row with correct ARIA indices and geometric offsets", () => {
    const grid = model();
    const view = render(
      <DataGrid
        model={grid}
        renderDetail={({ row }) => <button>Action for {row.name}</button>}
        detailHeight={120}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand details row 0" }),
    );
    const child = screen.getByRole("region", { name: "Details for row 0" });
    expect(child.textContent).toContain("Action for Record 0");
    expect(
      child.parentElement?.parentElement?.getAttribute("aria-rowindex"),
    ).toBe("4");
    expect(screen.getByRole("treegrid").getAttribute("aria-rowcount")).toBe(
      "103",
    );
    const second =
      view.container.querySelector('[data-row-id="1"]')!.parentElement!;
    expect(second.style.top).toBe("158px");
    expect(second.getAttribute("aria-rowindex")).toBe("5");
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse details row 0" }),
    );
    expect(
      screen.queryByRole("region", { name: "Details for row 0" }),
    ).toBeNull();
  });
  it("supports controlled expansion, keyboard toggling and keeps details fresh after edits", () => {
    const grid = model(),
      changed = vi.fn();
    const view = render(
      <DataGrid
        model={grid}
        expandedDetailRows={[]}
        onExpandedDetailRowsChange={changed}
        renderDetail={({ row }) => <span>Value {row.value}</span>}
      />,
    );
    const first = view.container.querySelector<HTMLElement>(
      '[data-row-id="0"][data-column-id="name"]',
    )!;
    fireEvent.keyDown(first, { key: "Enter", altKey: true });
    expect(changed).toHaveBeenCalledWith(["0"]);
    expect(screen.queryByText("Value 0")).toBeNull();
    view.rerender(
      <DataGrid
        model={grid}
        expandedDetailRows={["0"]}
        renderDetail={({ row }) => <span>Value {row.value}</span>}
      />,
    );
    expect(screen.getByText("Value 0")).toBeTruthy();
    act(() => grid.editCell("0", "value", "12"));
    expect(screen.getByText("Value 12")).toBeTruthy();
  });
  it("preserves detail expansion across filtering and keeps rendering bounded", () => {
    const grid = model();
    const view = render(
      <DataGrid
        model={grid}
        pagination={false}
        defaultExpandedDetailRows={["0"]}
        renderDetail={({ row }) => <span>Detail {row.name}</span>}
      />,
    );
    act(() => grid.setQuickFilter("Record 99"));
    expect(screen.queryByText("Detail Record 0")).toBeNull();
    act(() => grid.setQuickFilter(""));
    expect(screen.getByText("Detail Record 0")).toBeTruthy();
    fireEvent.scroll(screen.getByRole("treegrid"), {
      target: { scrollTop: 3000 },
    });
    expect(view.container.querySelectorAll(".og-row").length).toBeLessThan(40);
  });
});
