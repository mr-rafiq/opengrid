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
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./data-grid";
import { RowGroupPanel } from "./group-panel";
import { GridLocaleProvider, esES } from "./locale";
import { buildGridPrintSnapshot, GridPrintView } from "./print-view";
afterEach(cleanup);
const make = () =>
  createGrid({
    rows: [
      { id: "a", team: "A", area: "W", amount: 2 },
      { id: "b", team: "B", area: "E", amount: 7 },
    ],
    columns: [
      { id: "team", field: "team", header: "Team" },
      { id: "area", field: "area", header: "Area" },
      {
        id: "amount",
        field: "amount",
        header: "Amount",
        aggregate: "sum",
        type: "number",
        groupable: false,
        editable: true,
      },
    ],
    getRowId: (r) => r.id,
  });
function transfer() {
  const data = new Map<string, string>();
  return {
    get types() {
      return [...data.keys()];
    },
    setData: (k: string, v: string) => data.set(k, v),
    getData: (k: string) => data.get(k) ?? "",
  };
}
describe("resident grouping controls and total rows", () => {
  it("adds/reorders/removes groups without changing visibility and returns keyboard focus", () => {
    const model = make();
    render(<DataGrid model={model} rowGroupPanel="always" />);
    const panel = screen.getByRole("region", { name: "Row groups" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add group" }));
    expect(model.getState().groupBy).toEqual(["team"]);
    expect(document.activeElement).toBe(
      within(panel).getByRole("button", { name: "Sort groups by Team" }),
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Add group" }));
    expect(model.getState().groupBy).toEqual(["team", "area"]);
    fireEvent.click(
      within(panel).getByRole("button", { name: "Move grouping Area earlier" }),
    );
    expect(model.getState().groupBy).toEqual(["area", "team"]);
    fireEvent.click(
      within(panel).getByRole("button", { name: "Remove grouping Area" }),
    );
    expect(model.getState().groupBy).toEqual(["team"]);
    expect(document.activeElement).toBe(
      within(panel).getByRole("button", { name: "Sort groups by Team" }),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Remove grouping Team" }),
    );
    expect(document.activeElement).toBe(
      within(panel).getByRole("button", { name: "Add group" }),
    );
    expect(model.getColumns().some((c) => c.hidden)).toBe(false);
    expect(within(panel).queryByRole("option", { name: "Amount" })).toBeNull();
  });
  it("accepts actual owned header drags, ignores foreign drags, and reorders chip drags", () => {
    const model = make();
    render(<DataGrid model={model} rowGroupPanel="always" />);
    const panel = screen.getByRole("region", { name: "Row groups" });
    const foreign = transfer();
    foreign.setData("text/opengrid-column", "area");
    fireEvent.drop(panel, { dataTransfer: foreign });
    expect(model.getState().groupBy).toEqual([]);
    for (const column of ["Team", "Area"]) {
      const data = transfer();
      fireEvent.dragStart(
        screen.getByRole("button", { name: `Sort ${column}` }),
        { dataTransfer: data },
      );
      fireEvent.drop(panel, { dataTransfer: data });
    }
    expect(model.getState().groupBy).toEqual(["team", "area"]);
    const data = transfer();
    fireEvent.dragStart(panel.querySelectorAll("li")[1], {
      dataTransfer: data,
    });
    fireEvent.drop(panel.querySelector("li")!, { dataTransfer: data });
    expect(model.getState().groupBy).toEqual(["area", "team"]);
  });
  it("cycles grouping-key sorts and preserves multi-sort on Shift", () => {
    const model = make();
    model.setState({ groupBy: ["team", "area"] });
    render(<RowGroupPanel model={model} />);
    const team = screen.getByRole("button", { name: "Sort groups by Team" });
    fireEvent.click(team);
    expect(model.getState().sorting).toEqual([
      { columnId: "team", direction: "asc" },
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Sort groups by Area" }),
      { shiftKey: true },
    );
    expect(model.getState().sorting).toHaveLength(2);
    fireEvent.click(team);
    expect(model.getState().sorting).toEqual([
      { columnId: "team", direction: "desc" },
    ]);
    fireEvent.click(team);
    expect(model.getState().sorting).toEqual([]);
  });
  it("responds to definition replacement and scopes pending configuration to the model", () => {
    const model = make();
    model.setState({ groupBy: ["team"] });
    const view = render(<RowGroupPanel model={model} />);
    act(() =>
      model.setColumns(model.getColumns().filter((c) => c.id !== "team")),
    );
    expect(
      screen.queryByRole("button", { name: "Sort groups by Team" }),
    ).toBeNull();
    expect(screen.getByRole("option", { name: "Area" })).toBeTruthy();
    view.rerender(<RowGroupPanel model={make()} />);
    expect(screen.getByRole("option", { name: "Team" })).toBeTruthy();
  });
  it("keeps the panel opt-in and shows whenGrouped only while grouping is active", () => {
    const model = make();
    const view = render(<DataGrid model={model} />);
    expect(screen.queryByRole("region", { name: "Row groups" })).toBeNull();
    view.rerender(<DataGrid model={model} rowGroupPanel="whenGrouped" />);
    expect(screen.queryByRole("region", { name: "Row groups" })).toBeNull();
    act(() => model.setState({ groupBy: ["team"] }));
    expect(screen.getByRole("region", { name: "Row groups" })).toBeTruthy();
  });
  it("renders totals as noneditable nonselectable rows and prints their values", () => {
    const model = make();
    model.setState({
      groupBy: ["team"],
      groupTotalRow: "bottom",
      grandTotalRow: "top",
    });
    model.setState({
      expanded: model
        .getRowModel()
        .filter((n) => n.kind === "group")
        .map((n) => n.id),
    });
    render(<DataGrid model={model} hierarchySelection="subtree" />);
    expect(screen.getByText("Grand total")).toBeTruthy();
    expect(screen.getByText("Total A")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    const selectPage = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Select page subtrees",
    });
    expect(selectPage.disabled).toBe(false);
    fireEvent.click(selectPage);
    expect([...model.getState().selected].sort()).toEqual(["a", "b"]);
    fireEvent.click(selectPage);
    expect(model.getState().selected).toEqual([]);

    const total = document.querySelector<HTMLElement>(".og-total-row")!;
    expect(within(total).queryByRole("checkbox")).toBeNull();
    const amount = total.querySelector<HTMLElement>(
      '[data-column-id="amount"]',
    )!;
    expect(amount.getAttribute("aria-readonly")).toBe("true");
    expect(amount.textContent).toBe("9");
    fireEvent.doubleClick(amount);
    expect(
      screen.queryByRole("spinbutton", { name: /Edit Amount/ }),
    ).toBeNull();
    const snapshot = buildGridPrintSnapshot(model, { scope: "view" });
    expect(
      snapshot.rows.filter((r) => r.kind === "total").map((r) => r.cells[0]),
    ).toEqual(["Grand total", "Total A", "Total B"]);
    expect(snapshot.rows[0].cells[2]).toBe("9");
  });
  it("localizes panel controls and print/grid totals together", () => {
    const model = make();
    model.setState({ grandTotalRow: "top" });
    render(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={model} rowGroupPanel="always" />
        <GridPrintView model={model} scope="view" />
      </GridLocaleProvider>,
    );
    expect(screen.getByRole("region", { name: "Agrupar filas" })).toBeTruthy();
    expect(screen.getAllByText("Total general")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Añadir grupo" })).toBeTruthy();
  });
  it("retains the first aggregate value when totals occupy the first visible column", () => {
    const model = make();
    model.setColumns([model.getColumns()[2]]);
    model.setState({ grandTotalRow: "top" });
    render(<DataGrid model={model} />);
    expect(
      document.querySelector(".og-total-row [data-column-id=amount]")
        ?.textContent,
    ).toContain("9");
    expect(
      buildGridPrintSnapshot(model, { scope: "view" }).rows[0].cells[0],
    ).toBe("Grand total: 9");
  });
});
