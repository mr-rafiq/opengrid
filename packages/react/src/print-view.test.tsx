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
import { createGrid, type Column } from "../../core/src/index";
import { buildGridPrintSnapshot, GridPrintView } from "./print-view";
type Item = { id: string; name: string; amount: number; team: string };
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Name", pinned: "left" },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    editable: true,
    aggregate: "sum",
    valueFormatter: (value) => `USD ${value}`,
  },
  { id: "team", field: "team", header: "Team" },
];
const rows: Item[] = [
  { id: "a", name: "Ada", amount: 12, team: "North" },
  { id: "b", name: "Grace", amount: 5, team: "South" },
  { id: "c", name: "Lin", amount: 8, team: "North" },
];
const make = (data = rows) =>
  createGrid({
    rows: data,
    columns,
    getRowId: (row) => row.id,
    initialState: { pageSize: 2 },
  });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("prints only own group aggregate values for prototype-like column IDs", () => {
  const model = createGrid({
    rows: [{ id: "a", team: "North", value: 4 }],
    getRowId: (row) => row.id,
    columns: [
      { id: "team", field: "team" },
      { id: "constructor", field: "value" },
      { id: "__proto__", field: "value", aggregate: "sum" },
    ],
    initialState: { groupBy: ["team"] },
  });
  expect(
    buildGridPrintSnapshot(model, { scope: "view" }).rows[0].cells,
  ).toEqual(["North (1)", "", "4"]);
});

it("exposes a named keyboard focus target for scrolling the print table", () => {
  render(<GridPrintView model={make()} />);
  const region = screen.getByRole("region", {
    name: "Grid print view table scroll area",
  });
  expect(region.tabIndex).toBe(0);
  region.focus();
  expect(document.activeElement).toBe(region);
});
describe("plain-text print snapshots", () => {
  it("projects formatted sorted/filtered rows and visible columns in logical order", () => {
    const model = make();
    model.setSort("amount", "desc");
    model.setFilter("team", { op: "equals", value: "North" });
    model.hideColumn("team", true);
    const snapshot = buildGridPrintSnapshot(model);
    expect(snapshot.columns.map((column) => column.id)).toEqual([
      "name",
      "amount",
    ]);
    expect(snapshot.rows.map((row) => row.cells)).toEqual([
      ["Ada", "USD 12"],
      ["Lin", "USD 8"],
    ]);
    expect(snapshot.rowCount).toBe(2);
    expect(snapshot.cellCount).toBe(6);
  });
  it("distinguishes selected filtered, all-source input order and page scopes", () => {
    const model = make();
    model.selectRows(["a", "b"]);
    model.setSort("amount", "asc");
    model.setFilter("team", { op: "equals", value: "North" });
    expect(
      buildGridPrintSnapshot(model, { scope: "selected" }).rows.map(
        (row) => row.cells[0],
      ),
    ).toEqual(["Ada"]);
    expect(
      buildGridPrintSnapshot(model, { scope: "all" }).rows.map(
        (row) => row.cells[0],
      ),
    ).toEqual(["Ada", "Grace", "Lin"]);
    model.setFilter("team");
    model.setState({ page: 1 });
    expect(
      buildGridPrintSnapshot(model, { scope: "page" }).rows.map(
        (row) => row.cells[0],
      ),
    ).toEqual(["Ada"]);
  });
  it("captures visible groups, aggregates and tree depth without expanding the model", () => {
    const model = make();
    model.setState({ groupBy: ["team"] });
    const closed = buildGridPrintSnapshot(model, { scope: "view" });
    expect(closed.rowCount).toBe(2);
    expect(closed.rows[0].kind).toBe("group");
    expect(closed.rows[0].cells).toEqual(["North (2)", "20", ""]);
    const group = model.getRowModel()[0];
    model.toggleExpanded(group.id);
    const open = buildGridPrintSnapshot(model, { scope: "view" });
    expect(open.rows.map((row) => row.depth)).toEqual([0, 1, 1, 0]);
    expect(open.rows[1].cells[1]).toBe("USD 12");
    const expanded = [...model.getState().expanded];
    buildGridPrintSnapshot(model, { scope: "filtered" });
    expect(model.getState().expanded).toEqual(expanded);
  });
  it("freezes detached strings so subsequent grid edits cannot alter captured values", () => {
    const model = make();
    const snapshot = buildGridPrintSnapshot(model);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.rows[0].cells)).toBe(true);
    model.editCell("a", "amount", 99);
    expect(snapshot.rows[0].cells[1]).toBe("USD 12");
    expect(buildGridPrintSnapshot(model).rows[0].cells[1]).toBe("USD 99");
  });
  it("rejects row/cell limits explicitly before running formatter callbacks", () => {
    const formatter = vi.fn((value: unknown) => String(value));
    const model = createGrid({
      rows: Array.from({ length: 1001 }, (_, i) => ({
        id: String(i),
        value: i,
      })),
      columns: [{ id: "value", field: "value", valueFormatter: formatter }],
      getRowId: (row) => row.id,
    });
    expect(() => buildGridPrintSnapshot(model)).toThrow(
      /1,001 rows.*maxRows 1,000/,
    );
    expect(formatter).not.toHaveBeenCalled();
    expect(buildGridPrintSnapshot(model, { maxRows: 1001 }).rowCount).toBe(
      1001,
    );
    expect(() => buildGridPrintSnapshot(make(), { maxCells: 11 })).toThrow(
      /12 table cells/,
    );
    expect(buildGridPrintSnapshot(make(), { maxCells: 12 }).cellCount).toBe(12);
  });
  it("rejects malformed limits/scopes rather than silently truncating", () => {
    for (const maxRows of [0, -1, 1.5, NaN, Infinity, 10001])
      expect(() => buildGridPrintSnapshot(make(), { maxRows })).toThrow(
        RangeError,
      );
    for (const maxCells of [0, 1.5, Infinity, 1000001])
      expect(() => buildGridPrintSnapshot(make(), { maxCells })).toThrow(
        RangeError,
      );
    expect(() =>
      buildGridPrintSnapshot(make(), { scope: "invalid" as "all" }),
    ).toThrow("Unknown print scope");
  });
});
describe("GridPrintView", () => {
  it("renders safe table text with column/row headers and no automatic print", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <GridPrintView
        model={make([
          {
            id: "x",
            name: "<img src=x onerror=alert(1)>",
            amount: 1,
            team: "North",
          },
        ])}
        title="Portfolio report"
        caption="Current holdings"
      />,
    );
    const table = screen.getByRole("table", { name: "Portfolio report" });
    expect(
      within(table).getByRole("columnheader", { name: "Amount" }),
    ).toBeTruthy();
    expect(
      within(table).getByRole("rowheader", {
        name: "<img src=x onerror=alert(1)>",
      }),
    ).toBeTruthy();
    expect(table.querySelector("img")).toBeNull();
    expect(print).not.toHaveBeenCalled();
  });
  it("flags stale data but only updates captured rows after explicit refresh", () => {
    const model = make();
    render(<GridPrintView model={model} />);
    act(() => {
      model.editCell("a", "amount", 99);
      model.setFilter("team", { op: "equals", value: "South" });
    });
    expect(screen.getByRole("table").textContent).toContain("USD 12");
    expect(screen.getByRole("status").textContent).toContain("Grid changed");
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh print snapshot" }),
    );
    expect(screen.getByRole("table").textContent).not.toContain("USD 12");
    expect(screen.getByRole("table").textContent).toContain("Grace");
    expect(screen.getByRole("status").textContent).toContain(
      "1 rows, 3 columns",
    );
    expect(screen.getByRole("status").textContent).not.toContain(
      "Grid changed",
    );
  });
  it("recaptures when model/scope props change and represents grouped depth accessibly", () => {
    const model = make();
    model.setState({ groupBy: ["team"] });
    model.toggleExpanded(model.getRowModel()[0].id);
    const view = render(<GridPrintView model={model} scope="view" />);
    expect(
      screen.getByRole("rowheader", { name: "Level 2: Ada" }).style
        .paddingInlineStart,
    ).toBe("24px");
    view.rerender(<GridPrintView model={make([])} scope="filtered" />);
    expect(screen.getByText("No rows in this print scope.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("0 rows");
  });
  it("renders explicit limit/formatter failures and disables printing instead of partial tables", () => {
    const view = render(<GridPrintView model={make()} maxRows={2} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "exceeding maxRows 2",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Print snapshot",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const bad = createGrid({
      rows: [{ id: "x", value: 1 }],
      columns: [
        {
          id: "value",
          field: "value",
          valueFormatter: () => {
            throw new Error("Formatter unavailable");
          },
        },
      ],
      getRowId: (row) => row.id,
    });
    view.rerender(<GridPrintView model={bad} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Formatter unavailable",
    );
  });
  it("handles no visible columns without an invalid empty table", () => {
    const model = make();
    columns.forEach((column) => model.hideColumn(column.id, true));
    render(<GridPrintView model={model} />);
    expect(screen.getByText("No visible columns to print.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Print snapshot",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("targets only the requested snapshot and restores print metadata after afterprint", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const view = render(
      <div data-og-print-ancestor="previous">
        <GridPrintView
          model={make()}
          title="Target"
          pageSize="A4"
          orientation="landscape"
          repeatHeaders={false}
          avoidRowBreaks={false}
        />
        <aside>Unrelated UI</aside>
      </div>,
    );
    const wrapper = view.container.firstElementChild!;
    fireEvent.click(screen.getByRole("button", { name: "Print snapshot" }));
    expect(print).toHaveBeenCalledOnce();
    const target = document.documentElement.getAttribute(
      "data-og-print-target",
    );
    expect(target).toBeTruthy();
    expect(wrapper.getAttribute("data-og-print-ancestor")).toBe(target);
    const style = screen
      .getByRole("region", { name: "Target" })
      .querySelector("style")!.textContent!;
    expect(style).toContain("@media print");
    expect(style).toContain("size:A4 landscape");
    expect(style).toContain("thead{display:table-row-group;}");
    expect(style).toContain("break-inside:auto");
    fireEvent(window, new Event("afterprint"));
    expect(document.documentElement.hasAttribute("data-og-print-target")).toBe(
      false,
    );
    expect(wrapper.getAttribute("data-og-print-ancestor")).toBe("previous");
    expect(document.body.hasAttribute("data-og-print-ancestor")).toBe(false);
  });
  it("switches targets safely between multiple instances and cleans up on unmount", () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    const view = render(
      <div>
        <GridPrintView model={make()} title="First" />
        <GridPrintView model={make()} title="Second" />
      </div>,
    );
    fireEvent.click(
      within(screen.getByRole("region", { name: "First" })).getByRole(
        "button",
        { name: "Print snapshot" },
      ),
    );
    const first = document.documentElement.getAttribute("data-og-print-target");
    fireEvent.click(
      within(screen.getByRole("region", { name: "Second" })).getByRole(
        "button",
        { name: "Print snapshot" },
      ),
    );
    const second = document.documentElement.getAttribute(
      "data-og-print-target",
    );
    expect(second).not.toBe(first);
    expect(
      screen
        .getByRole("region", { name: "Second" })
        .getAttribute("data-og-print-view"),
    ).toBe(second);
    view.unmount();
    expect(document.documentElement.hasAttribute("data-og-print-target")).toBe(
      false,
    );
    expect(document.body.hasAttribute("data-og-print-ancestor")).toBe(false);
  });
  it("restores metadata and announces an unsupported print operation", () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("Not supported");
    });
    render(<GridPrintView model={make()} />);
    fireEvent.click(screen.getByRole("button", { name: "Print snapshot" }));
    expect(screen.getByRole("status").textContent).toContain(
      "Printing is unavailable",
    );
    expect(document.documentElement.hasAttribute("data-og-print-target")).toBe(
      false,
    );
    expect(document.body.hasAttribute("data-og-print-ancestor")).toBe(false);
  });
});
