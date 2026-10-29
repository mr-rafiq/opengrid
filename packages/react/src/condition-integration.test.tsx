// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createGrid,
  ServerSideRowModel,
  type CompoundFilter,
  type ServerRequest,
} from "../../core/src/index";
import { ColumnConditionFilter, DataGrid, NumberRangeFilter } from "./index";
import { ServerDataGrid } from "./remote-grids";

const group = (): CompoundFilter => ({
  op: "and",
  conditions: [
    { op: "gte", value: 2 },
    { op: "lte", value: 3 },
  ],
});
function make() {
  return createGrid({
    rows: [
      { id: "a", amount: 1 },
      { id: "b", amount: 2 },
      { id: "c", amount: 3 },
    ],
    columns: [
      { id: "amount", field: "amount", type: "number", header: "Amount" },
    ],
    getRowId: (row) => row.id,
  });
}
afterEach(cleanup);
describe("condition filters inside DataGrid", () => {
  it("keeps nested popup clipboard events out of the parent grid's selected range", () => {
    const inner = make();
    const outer = createGrid({
      rows: [{ id: "outer", panel: "Host" }],
      columns: [{ id: "panel", field: "panel", editable: true }],
      getRowId: (row) => row.id,
    });
    render(
      <DataGrid
        model={outer}
        ariaLabel="Outer grid"
        toolbar={false}
        selectionMode="none"
        defaultExpandedDetailRows={["outer"]}
        detailHeight={280}
        renderDetail={() => (
          <DataGrid
            model={inner}
            ariaLabel="Inner grid"
            toolbar={false}
            selectionMode="none"
            height={250}
            filterComponents={{ amount: ColumnConditionFilter }}
          />
        )}
      />,
    );
    const parent = screen.getByRole("treegrid", { name: "Outer grid" });
    const child = screen.getByRole("grid", { name: "Inner grid" });
    const cell = parent.querySelector<HTMLElement>(
      '[data-row-id="outer"][data-column-id="panel"]',
    )!;
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: "a", ctrlKey: true });
    expect(cell.classList.contains("og-range-selected")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Filter Amount" }));
    const dialog = screen.getByRole("dialog"),
      help = dialog.querySelector("p")!;
    expect(parent.contains(dialog)).toBe(true);
    expect(child.contains(dialog)).toBe(false);
    const setData = vi.fn(),
      getData = vi.fn(() => "Changed");
    for (const type of ["copy", "paste"]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { setData, getData },
      });
      fireEvent(help, event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(setData).not.toHaveBeenCalled();
    expect(getData).not.toHaveBeenCalled();
    expect(outer.getRow("outer")?.panel).toBe("Host");
  });
  it("edits one server compound query atomically while preserving provider rows and request ownership", async () => {
    type RemoteRow = { name: string; price: number };
    const requests: ServerRequest[] = [];
    const query: CompoundFilter = {
      op: "and",
      conditions: [
        { op: "gte", value: 10 },
        { op: "lte", value: 20 },
      ],
    };
    const model = new ServerSideRowModel<RemoteRow>(
      {
        getRows: async (request) => {
          requests.push(request);
          return {
            nodes: [
              { kind: "row", id: "zebra", data: { name: "Zebra", price: 30 } },
              { kind: "row", id: "alpha", data: { name: "Alpha", price: 10 } },
            ],
            rowCount: 2,
          };
        },
      },
      { query: { filters: { price: query } } },
    );
    render(
      <ServerDataGrid
        model={model}
        columns={[
          { id: "name", field: "name", header: "Name" },
          { id: "price", field: "price", header: "Price", type: "number" },
        ]}
      />,
    );
    const price = (id: string) =>
      document.querySelector<HTMLElement>(
        `[data-row-id="${id}"][data-column-id="price"]`,
      );
    await waitFor(() => expect(price("zebra")?.textContent).toBe("30"));
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Filter Price" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Value for condition 1" }),
      { target: { value: "11" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply conditions" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    const expected = {
      op: "and",
      conditions: [
        { op: "gte", value: 11 },
        { op: "lte", value: 20 },
      ],
    };
    expect(requests[1]!.filters.price).toEqual(expected);
    expect(model.getQuery().filters.price).toEqual(expected);
    await waitFor(() => expect(price("alpha")?.textContent).toBe("10"));
    expect(price("zebra")?.textContent).toBe("30");
    (requests[1]!.filters.price as CompoundFilter).conditions[0]!.value = 999;
    expect(model.getQuery().filters.price).toEqual(expected);
    fireEvent.click(screen.getByRole("button", { name: "Filter Price" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("11");
  });
  it("opens an externally installed compound by default and keeps its launcher/focus after Clear", () => {
    const model = make();
    model.setFilter("amount", group());
    render(
      <StrictMode>
        <DataGrid model={model} toolbar={false} selectionMode="none" />
      </StrictMode>,
    );
    const launcher = screen.getByRole("button", { name: "Filter Amount" });
    fireEvent.click(launcher);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("grid").contains(dialog)).toBe(false);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(model.getState().filters).toEqual({});
    expect(screen.getByRole("button", { name: "Filter Amount" })).toBe(
      launcher,
    );
    expect(document.activeElement).toBe(launcher);
    fireEvent.click(launcher);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Value for condition 1" }),
      { target: { value: "3" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply conditions" }));
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["c"]);
    expect(document.activeElement).toBe(launcher);
  });
  it("upgrades an existing default input after compound installation and resets that UI ownership on model replacement", () => {
    const model = make();
    const view = render(
      <DataGrid model={model} toolbar={false} selectionMode="none" />,
    );
    expect(screen.getByRole("textbox", { name: "Filter Amount" })).toBeTruthy();
    act(() => model.setFilter("amount", group()));
    expect(screen.queryByRole("textbox", { name: "Filter Amount" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter Amount" })).toBeTruthy();
    view.rerender(
      <DataGrid model={make()} toolbar={false} selectionMode="none" />,
    );
    expect(screen.getByRole("textbox", { name: "Filter Amount" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filter Amount" })).toBeNull();
  });
  it("preserves compounds in a registered range control until an explicit Clear", () => {
    const model = make();
    model.setFilter("amount", group());
    render(
      <DataGrid
        model={model}
        toolbar={false}
        selectionMode="none"
        filterComponents={{ amount: NumberRangeFilter }}
      />,
    );
    const minimum = screen.getByRole("textbox", {
      name: "Filter Amount minimum",
    });
    expect(minimum.matches(":disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain(
      "grouped conditions",
    );
    const before = model.getState();
    // A synthetic event cannot bypass the unsupported-model guard either.
    fireEvent.change(minimum, { target: { value: "50" } });
    expect(model.getState()).toBe(before);
    expect((minimum as HTMLInputElement).value).toBe("");
    fireEvent.click(
      screen.getByRole("button", { name: "Clear Filter Amount" }),
    );
    expect(model.getState().filters).toEqual({});
    expect(minimum.matches(":disabled")).toBe(false);
    fireEvent.change(minimum, { target: { value: "2" } });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b", "c"]);
    act(() =>
      model.setFilter("amount", {
        op: "and",
        conditions: [{ op: "gt", value: 2 }, { op: "notBlank" }],
      }),
    );
    expect(minimum.matches(":disabled")).toBe(true);
    expect((minimum as HTMLInputElement).value).toBe("");
  });
});
