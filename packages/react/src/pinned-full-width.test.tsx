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
import { createGrid } from "../../core/src/index";
import type { Column, RowNode } from "../../core/src/types";
import { DataGrid } from "./data-grid";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
interface Item {
  id: string;
  name: string;
  amount: number;
}
const columns: Column<Item>[] = [
  {
    id: "name",
    field: "name",
    header: "Name",
    editable: true,
    pinned: "left",
    width: 150,
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    width: 130,
  },
];
function makeModel(count = 6) {
  return createGrid({
    columns,
    rows: Array.from({ length: count }, (_, index) => ({
      id: String(index),
      name: `Record ${index}`,
      amount: index + 1,
    })),
    getRowId: (row) => row.id,
    initialState: { pageSize: 100 },
  });
}
function cell(id: string, column = "name", container: ParentNode = document) {
  return container.querySelector<HTMLDivElement>(
    `[data-row-id="${id}"][data-column-id="${column}"]`,
  )!;
}
function row(id: string) {
  return document.querySelector<HTMLDivElement>(
    `.og-row[data-row-key="${id}"]`,
  )!;
}
function full(id: string) {
  return document.querySelector<HTMLDivElement>(
    `[data-full-width-row-id="${id}"]`,
  )!;
}
const fullPredicate = (node: RowNode<Item>) => node.id === "2";
const fullRenderer = ({ rowId }: { rowId: string }) => (
  <span>Full content {rowId}</span>
);

describe("pinned row integration", () => {
  it("renders each model row once with explicit band order and logical ARIA indices", () => {
    render(
      <DataGrid
        model={makeModel()}
        pinnedTopRowIds={["3", "1", "3"]}
        pinnedBottomRowIds={["1", "5"]}
      />,
    );
    expect(
      [
        ...screen
          .getByRole("rowgroup", { name: "Pinned top rows" })
          .querySelectorAll(".og-row"),
      ].map((element) => element.getAttribute("data-row-key")),
    ).toEqual(["3", "1"]);
    expect(
      [
        ...screen
          .getByRole("rowgroup", { name: "Pinned bottom rows" })
          .querySelectorAll(".og-row"),
      ].map((element) => element.getAttribute("data-row-key")),
    ).toEqual(["5"]);
    expect(
      [...document.querySelectorAll(".og-row")].map((element) =>
        element.getAttribute("data-row-key"),
      ),
    ).toEqual(["3", "1", "0", "2", "4", "5"]);
    expect(
      [...document.querySelectorAll(".og-row")].map((element) =>
        element.getAttribute("aria-rowindex"),
      ),
    ).toEqual(["3", "4", "5", "6", "7", "8"]);
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("8");
    expect(cell("3").style.position).toBe("sticky");
    expect(
      document.querySelectorAll('[data-row-id="3"][data-column-id="name"]'),
    ).toHaveLength(1);
  });

  it("scopes pins to the visible page and filters without changing model pagination or export order", () => {
    const model = makeModel();
    model.setState({ pageSize: 2 });
    const csv = model.exportCsv({ allRows: true });
    render(
      <DataGrid
        model={model}
        pinnedTopRowIds={["0"]}
        pinnedBottomRowIds={["5"]}
      />,
    );
    expect(row("0").dataset.rowRegion).toBe("top");
    expect(
      screen.queryByRole("rowgroup", { name: "Pinned bottom rows" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      screen.queryByRole("rowgroup", { name: "Pinned top rows" }),
    ).toBeNull();
    expect(row("2").dataset.rowRegion).toBe("body");
    act(() => model.setState({ page: 2 }));
    expect(row("5").dataset.rowRegion).toBe("bottom");
    expect(model.getPageCount()).toBe(3);
    act(() => model.setQuickFilter("Record 4"));
    expect(
      screen.queryByRole("rowgroup", { name: "Pinned bottom rows" }),
    ).toBeNull();
    expect(model.exportCsv({ allRows: true })).toBe(csv);
  });

  it("keeps virtual body offsets independent from pinned variable-height rows", () => {
    render(
      <DataGrid
        model={makeModel(1000)}
        pagination={false}
        height={300}
        pinnedTopRowIds={["0"]}
        pinnedBottomRowIds={["999"]}
        getRowHeight={(node) =>
          node.id === "0" ? 70 : node.id === "999" ? 80 : 40
        }
      />,
    );
    const grid = screen.getByRole("grid");
    expect(row("0").style.top).toBe("0px");
    expect(row("1").style.top).toBe("0px");
    expect(row("999").style.top).toBe("0px");
    expect(row("0").style.height).toBe("70px");
    expect(grid.style.height).toBe("300px");
    fireEvent.scroll(grid, { target: { scrollTop: 25000 } });
    expect(cell("0")).toBeTruthy();
    expect(cell("999")).toBeTruthy();
    expect(document.querySelectorAll(".og-row").length).toBeLessThan(35);
  });

  it("expands the viewport minimum rather than hiding the scrolling body under large bands", () => {
    render(
      <DataGrid
        model={makeModel()}
        height={150}
        pinnedTopRowIds={["0"]}
        pinnedBottomRowIds={["5"]}
        getRowHeight={() => 100}
      />,
    );
    expect(screen.getByRole("grid").style.height).toBe("340px");
  });

  it("preserves focused row identity when pinning and unpinning remounts it in another band", () => {
    const model = makeModel();
    const view = render(<DataGrid model={model} />);
    act(() => cell("3", "amount").focus());
    view.rerender(<DataGrid model={model} pinnedTopRowIds={["3"]} />);
    expect(document.activeElement).toBe(cell("3", "amount"));
    expect(cell("3", "amount").tabIndex).toBe(0);
    view.rerender(<DataGrid model={model} pinnedBottomRowIds={["3"]} />);
    expect(document.activeElement).toBe(cell("3", "amount"));
    view.rerender(<DataGrid model={model} />);
    expect(document.activeElement).toBe(cell("3", "amount"));
    expect(row("3").dataset.rowRegion).toBe("body");
  });

  it("restores a row-dialog origin by ID after a pin change while the modal is open", () => {
    const model = makeModel();
    const view = render(<DataGrid model={model} editMode="row" />);
    act(() => cell("3", "amount").focus());
    fireEvent.keyDown(cell("3", "amount"), { key: "F2" });
    fireEvent.change(screen.getByLabelText("Edit Amount"), {
      target: { value: "88" },
    });
    view.rerender(
      <DataGrid model={model} editMode="row" pinnedTopRowIds={["3"]} />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Edit Amount"));
    fireEvent.click(screen.getByRole("button", { name: "Save row" }));
    expect(model.getRow("3")?.amount).toBe(88);
    expect(document.activeElement).toBe(cell("3", "amount"));
    expect(row("3").dataset.rowRegion).toBe("top");
  });

  it("selects, copies, pastes and fills ordinary cells across all three bands in visual order", () => {
    const model = makeModel(4);
    render(
      <DataGrid
        model={model}
        pinnedTopRowIds={["2"]}
        pinnedBottomRowIds={["0"]}
        selectionMode="none"
      />,
    );
    fireEvent.click(cell("2", "amount"));
    fireEvent.click(cell("0", "amount"), { shiftKey: true });
    const setData = vi.fn();
    fireEvent.copy(cell("0", "amount"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "3\r\n2\r\n4\r\n1");
    fireEvent.paste(cell("0", "amount"), {
      clipboardData: { getData: () => "30\n20\n40\n10" },
    });
    expect(model.getRows().map((item) => item.amount)).toEqual([
      10, 20, 30, 40,
    ]);
    fireEvent.keyDown(cell("0", "amount"), { key: "d", ctrlKey: true });
    expect(model.getRows().map((item) => item.amount)).toEqual([
      30, 30, 30, 30,
    ]);
    act(() => {
      model.undo();
      model.undo();
    });
    expect(model.getRows().map((item) => item.amount)).toEqual([1, 2, 3, 4]);
  });

  it("navigates through top, body and bottom rows and retains selection after pin reorder", () => {
    const model = makeModel(3);
    const view = render(
      <DataGrid
        model={model}
        pinnedTopRowIds={["2"]}
        pinnedBottomRowIds={["0"]}
      />,
    );
    act(() => cell("2").focus());
    fireEvent.keyDown(cell("2"), { key: "ArrowDown", shiftKey: true });
    expect(document.activeElement).toBe(cell("1"));
    fireEvent.keyDown(cell("1"), { key: "ArrowDown", shiftKey: true });
    expect(document.activeElement).toBe(cell("0"));
    expect(screen.getAllByRole("gridcell", { selected: true })).toHaveLength(3);
    view.rerender(
      <DataGrid
        model={model}
        pinnedTopRowIds={["0"]}
        pinnedBottomRowIds={["2"]}
      />,
    );
    expect(document.activeElement).toBe(cell("0"));
    expect(screen.getAllByRole("gridcell", { selected: true })).toHaveLength(3);
  });

  it("promotes only pinned tree leaf presentation depth without mutating source nodes", () => {
    const model = createGrid({
      columns,
      rows: [
        { id: "p", name: "Parent", amount: 1 },
        { id: "c", name: "Child", amount: 2 },
      ],
      getRowId: (row) => row.id,
      getTreePath: (row) => (row.id === "c" ? ["p", "c"] : ["p"]),
    });
    model.toggleExpanded("p");
    const originalDepth = model
      .getRowModel()
      .find((node) => node.id === "c")!.depth;
    render(<DataGrid model={model} pinnedTopRowIds={["c", "p"]} />);
    expect(row("c").getAttribute("aria-level")).toBe("1");
    expect(row("p").dataset.rowRegion).toBe("body");
    expect(model.getRowModel().find((node) => node.id === "c")!.depth).toBe(
      originalDepth,
    );
  });
});

describe("full-width rows", () => {
  it("renders a single colspan cell with original data in any row region", () => {
    const renderer = vi.fn(fullRenderer);
    render(
      <DataGrid
        model={makeModel()}
        pinnedTopRowIds={["2"]}
        isFullWidthRow={fullPredicate}
        renderFullWidthRow={renderer}
      />,
    );
    expect(row("2").dataset.fullWidth).toBe("true");
    expect(within(row("2")).getAllByRole("gridcell")).toHaveLength(1);
    expect(full("2").getAttribute("aria-colspan")).toBe("3");
    expect(cell("2")).toBeNull();
    expect(renderer.mock.calls.at(-1)?.[0]).toMatchObject({
      rowId: "2",
      rowPinned: "top",
      node: { id: "2", data: { name: "Record 2" } },
    });
  });

  it("visits a full-width focus target for row navigation while Shift range extension skips its absent cells", () => {
    render(
      <DataGrid
        model={makeModel()}
        isFullWidthRow={fullPredicate}
        renderFullWidthRow={fullRenderer}
      />,
    );
    act(() => cell("1").focus());
    fireEvent.keyDown(cell("1"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(full("2"));
    fireEvent.keyDown(full("2"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("3"));
    fireEvent.click(cell("1"));
    fireEvent.keyDown(cell("1"), { key: "ArrowDown", shiftKey: true });
    expect(document.activeElement).toBe(cell("3"));
    expect(screen.getAllByRole("gridcell", { selected: true })).toHaveLength(2);
    expect(full("2").getAttribute("aria-selected")).toBeNull();
  });

  it("excludes full-width rows from copy/paste and Find while preserving actual normal-row data", () => {
    const model = makeModel(4);
    render(
      <DataGrid
        model={model}
        isFullWidthRow={fullPredicate}
        renderFullWidthRow={fullRenderer}
        selectionMode="none"
      />,
    );
    fireEvent.click(cell("1", "amount"));
    fireEvent.click(cell("3", "amount"), { shiftKey: true });
    const setData = vi.fn();
    fireEvent.copy(cell("3", "amount"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "2\r\n4");
    fireEvent.paste(cell("3", "amount"), {
      clipboardData: { getData: () => "22\n44" },
    });
    expect(model.getRow("2")?.amount).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Find in current view" }),
      { target: { value: "Record 2" } },
    );
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("supports full-width base rows plus separately counted Alt+Enter details", () => {
    render(
      <DataGrid
        model={makeModel(4)}
        pinnedBottomRowIds={["2"]}
        isFullWidthRow={fullPredicate}
        renderFullWidthRow={fullRenderer}
        getRowHeight={(node) => (node.id === "2" ? 90 : 38)}
        renderDetail={({ rowId }) => <p>Detail {rowId}</p>}
        detailHeight={100}
      />,
    );
    act(() => full("2").focus());
    fireEvent.keyDown(full("2"), { key: "Enter", altKey: true });
    expect(
      screen.getByRole("region", { name: "Details for row 2" }),
    ).toBeTruthy();
    expect(row("2").style.height).toBe("90px");
    expect(screen.getByRole("treegrid").getAttribute("aria-rowcount")).toBe(
      "7",
    );
    expect(row("2").getAttribute("aria-rowindex")).toBe("6");
    expect(
      document.querySelector(".og-detail-row")?.getAttribute("aria-rowindex"),
    ).toBe("7");
    expect(
      (
        screen.getByRole("rowgroup", {
          name: "Pinned bottom rows",
        }) as HTMLElement
      ).style.height,
    ).toBe("190px");
  });

  it("keeps nested-grid pointer and clipboard behavior isolated from the outer full-width row", () => {
    const outer = makeModel(4),
      inner = makeModel(1);
    render(
      <DataGrid
        model={outer}
        pinnedTopRowIds={["2"]}
        isFullWidthRow={fullPredicate}
        renderFullWidthRow={() => (
          <DataGrid
            model={inner}
            ariaLabel="Nested full-width grid"
            toolbar={false}
            pagination={false}
            notes={false}
          />
        )}
        getRowHeight={(node) => (node.id === "2" ? 250 : 38)}
      />,
    );
    const nested = screen.getByRole("grid", { name: "Nested full-width grid" });
    fireEvent.click(cell("0", "amount", nested));
    const setData = vi.fn();
    fireEvent.copy(cell("0", "amount", nested), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledTimes(1);
    fireEvent.paste(cell("0", "amount", nested), {
      clipboardData: { getData: () => "99" },
    });
    expect(inner.getRow("0")?.amount).toBe(99);
    expect(outer.getRow("0")?.amount).toBe(1);
    fireEvent.keyDown(cell("0", "amount", nested), { key: "F2" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(nested).getByRole("spinbutton", { name: "Edit Amount row 0" }),
    ).toBeTruthy();
  });

  it("works under StrictMode and validates full-width renderer configuration", () => {
    const model = makeModel();
    render(
      <StrictMode>
        <DataGrid
          model={model}
          pinnedTopRowIds={["2"]}
          isFullWidthRow={fullPredicate}
          renderFullWidthRow={fullRenderer}
        />
      </StrictMode>,
    );
    act(() => full("2").focus());
    fireEvent.keyDown(full("2"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("0"));
    expect(() =>
      render(<DataGrid model={model} isFullWidthRow={fullPredicate} />),
    ).toThrow("require renderFullWidthRow");
  });
});
