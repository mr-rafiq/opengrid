// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type Column } from "../../core/src/index";
import { DataGrid } from "./data-grid";

type Row = {
  id: string;
  region: string;
  team: string;
  amount: number;
  span: number;
};
const data = (count = 6): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    region:
      count === 6
        ? ["A", "A", "A", "B", "B", "C"][index]
        : index < count / 2
          ? "A"
          : "B",
    team: "Hidden team",
    amount: index + 1,
    span: 2,
  }));
function fixture(input = data(), overrides: Partial<Column<Row>> = {}) {
  return createGrid({
    rows: input,
    getRowId: (row) => row.id,
    columns: [
      {
        id: "region",
        field: "region",
        header: "Region",
        width: 140,
        spanRows: true,
        colSpan: (row) => row.span,
        editable: true,
        ...overrides,
      },
      { id: "team", field: "team", header: "Team", width: 100, spanRows: true },
      {
        id: "amount",
        field: "amount",
        header: "Amount",
        width: 100,
        type: "number",
        editable: true,
      },
    ],
  });
}
const cell = (row: string, column = "region") =>
  document.querySelector<HTMLElement>(
    `[data-row-id="${row}"][data-column-id="${column}"]`,
  );
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("combined merged-cell grid", () => {
  it("renders one rectangular owner with both logical ARIA spans and no covered values", () => {
    const model = fixture(),
      read = vi.spyOn(model, "getValue");
    render(<DataGrid model={model} toolbar={false} />);
    expect(cell("r0")?.getAttribute("aria-colspan")).toBe("2");
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
    expect(cell("r0")?.getAttribute("aria-colindex")).toBe("2");
    expect(cell("r0")?.style.width).toBe("240px");
    expect(cell("r0")?.style.height).toBe("114px");
    expect(cell("r1")).toBeNull();
    expect(cell("r2")).toBeNull();
    for (const row of data()) expect(cell(row.id, "team")).toBeNull();
    expect(cell("r2", "amount")).not.toBeNull();
    expect(read.mock.calls.some(([, id]) => id === "team")).toBe(false);
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("8");
    expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe("4");
    expect(
      screen.getByText(/Cell ranges, grid clipboard and fill are unavailable/i),
    ).not.toBeNull();
  });
  it.each(["ltr", "rtl"] as const)(
    "normalizes horizontal and vertical covered targets in %s",
    (direction) => {
      render(
        <DataGrid model={fixture()} direction={direction} toolbar={false} />,
      );
      act(() => cell("r2", "amount")!.focus());
      fireEvent.keyDown(cell("r2", "amount")!, {
        key: direction === "ltr" ? "ArrowLeft" : "ArrowRight",
      });
      expect(document.activeElement).toBe(cell("r0"));
      fireEvent.keyDown(cell("r0")!, { key: "ArrowDown" });
      expect(document.activeElement).toBe(cell("r3"));
      fireEvent.keyDown(cell("r3")!, { key: "ArrowUp" });
      expect(document.activeElement).toBe(cell("r0"));
      fireEvent.keyDown(cell("r0")!, {
        key: direction === "ltr" ? "ArrowRight" : "ArrowLeft",
      });
      expect(document.activeElement).toBe(cell("r0", "amount"));
      fireEvent.keyDown(cell("r0", "amount")!, { key: "End", ctrlKey: true });
      expect(document.activeElement).toBe(cell("r5", "amount"));
    },
  );
  it("splits editing at the real owner and restores the rectangle and focus with undo", () => {
    const model = fixture();
    render(<DataGrid model={model} />);
    act(() => cell("r0")!.focus());
    fireEvent.keyDown(cell("r0")!, { key: "F2" });
    const editor = screen.getByRole("textbox", { name: "Edit Region row r0" });
    fireEvent.change(editor, { target: { value: "Z" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(model.getRow("r0")!.region).toBe("Z");
    expect(model.getRow("r1")!.region).toBe("A");
    expect(model.getRow("r0")!.team).toBe("Hidden team");
    expect(cell("r0")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r1")?.getAttribute("aria-rowspan")).toBe("2");
    expect(document.activeElement).toBe(cell("r1"));
    act(() => {
      model.undo();
    });
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
    expect(document.activeElement).toBe(cell("r0"));
  });
  it("creates neighboring vertical owners only after a horizontal footprint changes", () => {
    const input = data().slice(0, 3);
    input[1].span = 1;
    input[2].span = 1;
    render(<DataGrid model={fixture(input)} toolbar={false} />);
    expect(cell("r0")?.getAttribute("aria-colspan")).toBe("2");
    expect(cell("r0")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r1")?.getAttribute("aria-rowspan")).toBe("2");
    expect(cell("r1")?.hasAttribute("aria-colspan")).toBe(false);
    expect(cell("r1", "team")?.getAttribute("aria-rowspan")).toBe("2");
    expect(cell("r2")).toBeNull();
    expect(cell("r2", "team")).toBeNull();
  });
  it("retains an owner above and before both virtual windows without unrelated anchor content", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(340);
    const input = data(100);
    const model = createGrid({
      rows: input,
      getRowId: (row) => row.id,
      columns: [
        {
          id: "region",
          field: "region",
          width: 300,
          colSpan: 2,
          spanRows: true,
        },
        { id: "team", field: "team", width: 300, spanRows: true },
        { id: "amount", field: "amount", width: 140 },
      ],
    });
    render(
      <DataGrid
        model={model}
        toolbar={false}
        pagination={false}
        height={190}
        overscan={0}
        columnOverscan={0}
        selectionMode="none"
      />,
    );
    const grid = screen.getByRole("grid");
    act(() => {
      grid.scrollTop = 40 * 38;
      grid.scrollLeft = 400;
      fireEvent.scroll(grid);
    });
    expect(cell("r0")?.style.width).toBe("600px");
    expect(cell("r0")?.style.height).toBe("1900px");
    expect(cell("r0", "amount")).toBeNull();
    expect(cell("r40")).toBeNull();
    expect(cell("r40", "team")).toBeNull();
    expect(cell("r40", "amount")).not.toBeNull();
    act(() => cell("r40", "amount")!.focus());
    fireEvent.keyDown(cell("r40", "amount")!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell("r0"));
  });
  it("keeps band boundaries and pin clipping while reusing vertical topology for width changes", () => {
    const adjacent = vi.fn(
      (previous: Row, next: Row) => previous.region === next.region,
    );
    const model = createGrid({
      rows: data(),
      getRowId: (row) => row.id,
      columns: [
        {
          id: "region",
          field: "region",
          width: 140,
          colSpan: 20,
          spanRows: adjacent,
          pinned: "left",
        },
        { id: "team", field: "team", width: 100, pinned: "left" },
        { id: "amount", field: "amount", width: 100, pinned: "right" },
      ],
    });
    render(
      <DataGrid
        model={model}
        toolbar={false}
        pinnedTopRowIds={["r0"]}
        pinnedBottomRowIds={["r4"]}
      />,
    );
    expect(cell("r0")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r1")?.getAttribute("aria-rowspan")).toBe("2");
    expect(cell("r1")?.getAttribute("aria-colspan")).toBe("2");
    expect(cell("r3")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r4")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r1", "amount")).not.toBeNull();
    const calls = adjacent.mock.calls.length;
    act(() => model.resizeColumn("region", 180));
    expect(cell("r1")?.style.width).toBe("280px");
    expect(cell("r1")?.style.height).toBe("76px");
    expect(adjacent).toHaveBeenCalledTimes(calls);
  });
  it("Find omits both horizontal and vertical covered values", () => {
    render(<DataGrid model={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Find", exact: true }));
    const search = screen.getByRole("textbox", {
      name: "Find in current view",
    });
    fireEvent.change(search, { target: { value: "Hidden team" } });
    expect(screen.getByText("No matches")).not.toBeNull();
    fireEvent.change(search, { target: { value: "A" } });
    expect(screen.getByText("1 of 1")).not.toBeNull();
  });
  it("cancels a draft when its field becomes horizontally covered and restores the rectangle owner", () => {
    const input = data().map((row) => ({ ...row, span: 1 }));
    const model = createGrid({
      rows: input,
      getRowId: (row) => row.id,
      columns: [
        {
          id: "region",
          field: "region",
          colSpan: (row) => row.span,
          spanRows: true,
        },
        { id: "team", field: "team", header: "Team", editable: true },
        { id: "amount", field: "amount" },
      ],
    });
    render(<DataGrid model={model} />);
    act(() => cell("r1", "team")!.focus());
    fireEvent.keyDown(cell("r1", "team")!, { key: "F2" });
    const editor = screen.getByRole("textbox", { name: "Edit Team row r1" });
    fireEvent.change(editor, { target: { value: "discard draft" } });
    act(() =>
      model.applyTransaction({ update: [{ ...model.getRow("r1")!, span: 2 }] }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Edit Team row r1" }),
    ).toBeNull();
    expect(model.getRow("r1")!.team).toBe("Hidden team");
    expect(document.activeElement).toBe(cell("r1"));
  });
});
