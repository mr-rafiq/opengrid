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
import { CellNotesStore, createGrid, type Column } from "../../core/src/index";
import { DataGrid } from "./data-grid";

type Row = { id: string; desk: string; amount: number; category: string };
const data: Row[] = ["A", "A", "A", "B", "B", "C"].map((desk, index) => ({
  id: `r${index}`,
  desk,
  amount: index + 1,
  category: index < 2 ? "First" : "Later",
}));
function make(columns?: Column<Row>[]) {
  return createGrid({
    rows: data,
    getRowId: (row) => row.id,
    columns: columns ?? [
      {
        id: "desk",
        field: "desk",
        header: "Desk",
        width: 140,
        editable: true,
        spanRows: true,
      },
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
function cell(row: string, column = "desk", root: ParentNode = document) {
  return root.querySelector<HTMLElement>(
    `[data-row-id="${row}"][data-column-id="${column}"]`,
  );
}
function key(row: string, column: string, value: string, extra = {}) {
  fireEvent.keyDown(cell(row, column)!, { key: value, ...extra });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("row-spanning grid integration", () => {
  it("renders one height-aware owner with original logical ARIA row and column positions", () => {
    render(<DataGrid model={make()} />);
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
    expect(cell("r0")?.style.height).toBe("114px");
    expect(cell("r0")?.style.alignItems).toBe("flex-start");
    expect(cell("r1")).toBeNull();
    expect(cell("r2")).toBeNull();
    expect(cell("r1", "amount")?.getAttribute("aria-colindex")).toBe("3");
    expect(
      cell("r1", "amount")
        ?.closest('[role="row"]')
        ?.getAttribute("aria-rowindex"),
    ).toBe("4");
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("8");
    expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe("3");
  });
  it("skips a merged run with Down and resolves Up and horizontal covered targets to the anchor row", () => {
    render(<DataGrid model={make()} />);
    act(() => cell("r0")!.focus());
    key("r0", "desk", "ArrowDown");
    expect(document.activeElement).toBe(cell("r3"));
    key("r3", "desk", "ArrowUp");
    expect(document.activeElement).toBe(cell("r0"));
    act(() => cell("r2", "amount")!.focus());
    key("r2", "amount", "ArrowLeft");
    expect(document.activeElement).toBe(cell("r0"));
    key("r0", "desk", "ArrowRight");
    expect(document.activeElement).toBe(cell("r0", "amount"));
    key("r0", "amount", "End", { ctrlKey: true });
    expect(document.activeElement).toBe(cell("r5", "amount"));
  });
  it("edits only the owner and resolves Enter against the new run after splitting and undo", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    fireEvent.doubleClick(cell("r0")!);
    const editor = within(cell("r0")!).getByRole("textbox");
    fireEvent.change(editor, { target: { value: "Changed" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(grid.getRow("r0")?.desk).toBe("Changed");
    expect(grid.getRow("r1")?.desk).toBe("A");
    expect(cell("r1")?.getAttribute("aria-rowspan")).toBe("2");
    expect(document.activeElement).toBe(cell("r1"));
    act(() => grid.undo());
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
    expect(document.activeElement).toBe(cell("r0"));
  });
  it("cancels an external covered-owner draft and restores focus without overwriting row data", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    act(() => cell("r3")!.focus());
    fireEvent.doubleClick(cell("r3")!);
    fireEvent.change(within(cell("r3")!).getByRole("textbox"), {
      target: { value: "discard draft" },
    });
    act(() =>
      grid.setRows(
        data.map((row) => (row.id === "r3" ? { ...row, desk: "A" } : row)),
      ),
    );
    expect(cell("r3")).toBeNull();
    expect(grid.getRow("r3")?.desk).toBe("A");
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("4");
    expect(document.activeElement).toBe(cell("r0"));
  });
  it("reuses comparator runs across selection and column-width changes", () => {
    const compare = vi.fn((a: Row, b: Row) => a.desk === b.desk);
    const grid = make([
      { id: "desk", field: "desk", spanRows: compare },
      { id: "amount", field: "amount" },
    ]);
    render(
      <StrictMode>
        <DataGrid model={grid} />
      </StrictMode>,
    );
    const count = compare.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    act(() => grid.selectRows(["r1"]));
    expect(compare.mock.calls.length).toBe(count);
    act(() => grid.resizeColumn("desk", 220));
    expect(compare.mock.calls.length).toBe(count);
    expect(cell("r0")?.style.width).toBe("220px");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select row r1",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
  it.each([
    ["getter", "expiry"],
    ["predicate", "expiry"],
    ["getter", "setRows"],
    ["predicate", "setRows"],
  ] as const)(
    "refreshes external %s inputs on %s following selection and resize",
    (kind, notification) => {
      let distinct = false;
      const column: Column<Row> =
        kind === "getter"
          ? {
              id: "desk",
              valueGetter: (row) => (distinct ? row.id : row.desk),
              spanRows: true,
            }
          : {
              id: "desk",
              field: "desk",
              spanRows: (previous, next) =>
                !distinct && previous.desk === next.desk,
            };
      const grid = make([column, { id: "amount", field: "amount" }]);
      render(<DataGrid model={grid} />);
      expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
      act(() => grid.selectRows(["r1"]));
      act(() => grid.resizeColumn("desk", 220));
      distinct = true;
      act(() =>
        notification === "expiry"
          ? grid.expireValueCache()
          : grid.setRows([...grid.getRows()]),
      );
      expect(cell("r0")?.hasAttribute("aria-rowspan")).toBe(false);
      expect(cell("r1")).toBeTruthy();
      expect(cell("r2")).toBeTruthy();
      act(() => grid.selectRows(["r2"]));
      distinct = false;
      act(() =>
        notification === "expiry"
          ? grid.expireValueCache()
          : grid.setRows([...grid.getRows()]),
      );
      expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
      expect(cell("r1")).toBeNull();
    },
  );
  it("reuses runs across cosmetic changes with nested Date and BigInt filter operands", () => {
    const compare = vi.fn(
      (previous: Row, next: Row) => previous.desk === next.desk,
    );
    const grid = createGrid({
      rows: data,
      getRowId: (row) => row.id,
      columns: [
        { id: "desk", field: "desk", spanRows: compare },
        {
          id: "amount",
          type: "bigint",
          valueGetter: (row) => BigInt(row.amount),
        },
        {
          id: "created",
          type: "date",
          valueGetter: (row) => new Date(Date.UTC(2026, 0, row.amount)),
        },
      ],
      initialState: {
        filters: {
          amount: { op: "gte", value: 1n },
          created: { op: "gte", value: new Date("2026-01-01T00:00:00.000Z") },
        },
      },
    });
    render(<DataGrid model={grid} />);
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
    const count = compare.mock.calls.length;
    act(() => grid.selectRows(["r1"]));
    act(() => grid.resizeColumn("desk", 220));
    expect(compare.mock.calls.length).toBe(count);
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
  });
  it("retains only intersecting offscreen owner cells with bounded DOM over 10000 rows", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      ...data[0],
      id: `long${index}`,
      desk: String(Math.floor(index / 500)),
    }));
    const grid = createGrid({
      rows,
      getRowId: (row) => row.id,
      columns: [
        { id: "desk", field: "desk", width: 140, spanRows: true },
        { id: "amount", field: "amount", width: 100 },
      ],
    });
    render(
      <DataGrid
        model={grid}
        height={200}
        rowHeight={30}
        overscan={1}
        pagination={false}
      />,
    );
    const viewport = screen.getByRole("grid");
    viewport.scrollTop = 12000;
    fireEvent.scroll(viewport);
    const anchor = viewport.querySelector<HTMLElement>(
      '[data-row-span-anchor-only="true"]',
    )!;
    expect(anchor?.getAttribute("data-row-key")).toBe("long0");
    expect(within(anchor).getAllByRole("gridcell")).toHaveLength(1);
    expect(within(anchor).queryByRole("checkbox")).toBeNull();
    expect(cell("long0", "amount")).toBeNull();
    expect(cell("long0")?.style.height).toBe("15000px");
    expect(viewport.querySelectorAll('[role="gridcell"]').length).toBeLessThan(
      45,
    );
    viewport.scrollTop = 18000;
    fireEvent.scroll(viewport);
    expect(
      viewport.querySelector(
        '[data-row-span-anchor-only="true"][data-row-key="long500"]',
      ),
    ).toBeTruthy();
  });
  it("uses summed variable row heights and isolates expanded detail and full-width boundaries", () => {
    const grid = make();
    const heights = (node: { id: string }) =>
      Number(node.id.slice(1)) % 2 ? 50 : 30;
    const view = render(<DataGrid model={grid} getRowHeight={heights} />);
    expect(cell("r0")?.style.height).toBe("110px");
    view.rerender(
      <DataGrid
        model={grid}
        getRowHeight={heights}
        renderDetail={() => <p>Detail content</p>}
        expandedDetailRows={["r1"]}
        detailHeight={90}
      />,
    );
    expect(cell("r0")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r1")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(
      screen.getByRole("region", { name: "Details for row r1" }),
    ).toBeTruthy();
    view.rerender(
      <DataGrid
        model={grid}
        getRowHeight={heights}
        isFullWidthRow={(node) => node.id === "r1"}
        renderFullWidthRow={() => <button>Full width</button>}
      />,
    );
    expect(cell("r0")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r2")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(screen.getByRole("button", { name: "Full width" })).toBeTruthy();
  });
  it("clips at pinned row and pagination boundaries without duplicate row identities", () => {
    const grid = make();
    const view = render(
      <DataGrid
        model={grid}
        pinnedTopRowIds={["r0", "r1"]}
        pinnedBottomRowIds={["r3", "r4"]}
      />,
    );
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("2");
    expect(cell("r2")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r3")?.getAttribute("aria-rowspan")).toBe("2");
    expect(
      document.querySelectorAll('.og-row[data-row-key="r0"]'),
    ).toHaveLength(1);
    act(() => grid.setState({ pageSize: 2, page: 1 }));
    view.rerender(<DataGrid model={grid} />);
    expect(cell("r2")?.hasAttribute("aria-rowspan")).toBe(false);
    expect(cell("r3")?.hasAttribute("aria-rowspan")).toBe(false);
  });
  it("Find searches visible owner values only and refreshes after an ownership change", () => {
    const grid = make();
    render(<DataGrid model={grid} />);
    fireEvent.click(screen.getByRole("button", { name: "Find", exact: true }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Find in current view" }),
      { target: { value: "A" } },
    );
    expect(screen.getByText("1 of 1")).toBeTruthy();
    act(() =>
      grid.setRows(
        data.map((row) => (row.id === "r1" ? { ...row, desk: "Other" } : row)),
      ),
    );
    expect(screen.getByText("1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next find match" }));
    expect(document.activeElement).toBe(cell("r2"));
  });
  it("keeps separate row form fields and row selection while disabling rectangular operations and moving", () => {
    const grid = make();
    render(<DataGrid model={grid} rowDragging editMode="row" />);
    expect(screen.getByText(/Row spanning is configured/)).toBeTruthy();
    expect(
      screen.getByText(/Turn off row spanning before moving rows/),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Drag row r1" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row r1" }));
    expect(grid.getState().selected).toEqual(["r1"]);
    expect(
      screen.queryByRole("button", { name: "Copy selected cells" }),
    ).toBeNull();
    const getData = vi.fn(() => "replacement");
    fireEvent.paste(cell("r0")!, { clipboardData: { getData } });
    expect(getData).not.toHaveBeenCalled();
    fireEvent.doubleClick(cell("r0")!);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Edit Desk" }),
      { target: { value: "Form value" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save row" }));
    expect(grid.getRow("r0")?.desk).toBe("Form value");
    expect(grid.getRow("r1")?.desk).toBe("A");
  });
  it("keeps covered notes persisted and opens only the owner's note editor", () => {
    const notes = new CellNotesStore();
    notes.set({ rowId: "r1", columnId: "desk" }, "Covered note");
    render(<DataGrid model={make()} notes={notes} />);
    expect(
      screen.queryByRole("button", { name: /Edit note for Desk row r1/ }),
    ).toBeNull();
    act(() => cell("r0")!.focus());
    key("r0", "desk", "n", { altKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), {
      target: { value: "Owner note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(notes.get({ rowId: "r0", columnId: "desk" })).toBe("Owner note");
    expect(notes.get({ rowId: "r1", columnId: "desk" })).toBe("Covered note");
  });
  it("allows inactive row spans and active vertical spans with a constant one-column footprint", () => {
    const inactive = make([
      { id: "desk", field: "desk", spanRows: false, colSpan: 2 },
      { id: "amount", field: "amount" },
    ]);
    const view = render(<DataGrid model={inactive} />);
    expect(cell("r0")?.getAttribute("aria-colspan")).toBe("2");
    view.unmount();
    const active = make([
      { id: "desk", field: "desk", spanRows: true, colSpan: 1 },
    ]);
    render(<DataGrid model={active} />);
    expect(cell("r0")?.getAttribute("aria-rowspan")).toBe("3");
    expect(cell("r0")?.hasAttribute("aria-colspan")).toBe(false);
  });
});
