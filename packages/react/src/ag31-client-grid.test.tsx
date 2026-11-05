// @vitest-environment jsdom
import React, { StrictMode, createRef, useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
} from "./ag31-client-grid.js";
afterEach(cleanup);
type Row = { id: string; amount: number };
const getRowId = ({ data }: { data: Row }) => data.id;

it("embeds source checkboxes in the data column with distinct filtered group and all-row header scopes", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[
        { id: "a", amount: 1 },
        { id: "b", amount: 2 },
        { id: "c", amount: 2 },
      ]}
      getRowId={getRowId}
      rowSelection="multiple"
      groupSelectsChildren
      groupSelectsFiltered
      suppressRowClickSelection
      columnDefs={[
        {
          field: "id",
          checkboxSelection: true,
          headerCheckboxSelection: true,
          enableRowGroup: true,
        },
        { field: "amount", cellDataType: "number", enableRowGroup: true },
      ]}
      initialModelState={{ groupBy: ["amount"] }}
    />,
  );
  const api = ref.current!.api;
  const group = api.getDisplayedRowAtIndex(0)!;
  expect(screen.getByRole("treegrid").getAttribute("aria-colcount")).toBe("2");
  const checkbox = screen.getByRole("checkbox", {
    name: `Select ${group.id}`,
  }) as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(api.getSelectedRows()!.map((row) => row.id)).toEqual(["a"]);
  act(() => {
    api.setGridOption("isExternalFilterPresent", () => true);
    api.setGridOption(
      "doesExternalFilterPass",
      (node: any) => node.data.id !== "a",
    );
    api.onFilterChanged();
  });
  const header = screen.getByRole("checkbox", {
    name: "Select all rows",
  }) as HTMLInputElement;
  expect(header.indeterminate).toBe(true);
  fireEvent.click(header);
  expect(api.getSelectedRows()).toHaveLength(3);
  expect(header.checked).toBe(true);
  fireEvent.click(header);
  expect(api.getSelectedRows()).toEqual([]);
});

it("commits a live API/ref before ready and revokes it on StrictMode unmount", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  const callbacks: Ag31ClientGridHandle<Row>[] = [];
  const view = render(
    <StrictMode>
      <Ag31ClientGrid
        ref={ref}
        rowData={[{ id: "a", amount: 3 }]}
        columnDefs={[{ field: "amount" }]}
        getRowId={getRowId}
        onGridReady={(event) => {
          expect(ref.current?.api).toBe(event.api);
          expect(event.api.isDestroyed()).toBe(false);
          expect(event.api.getRowNode("a")?.data?.amount).toBe(3);
          callbacks.push(event);
        }}
      />
    </StrictMode>,
  );
  expect(callbacks).toHaveLength(1);
  const api = ref.current!.api;
  expect(screen.getByRole("grid")).toBeTruthy();
  view.unmount();
  expect(ref.current).toBeNull();
  expect(api.isDestroyed()).toBe(true);
  expect(api.getRowNode("a")).toBeUndefined();
});

it("refreshes source renderers without replacing nodes or resorting, then forwards class records and context updates", () => {
  class Record {
    constructor(
      public id: string,
      public amount: number,
    ) {}
    describe() {
      return `class:${this.amount}`;
    }
  }
  const seen: unknown[] = [];
  function Renderer(p: any) {
    seen.push(p.node);
    return (
      <span>
        {p.data.describe()}:{p.context.label}
      </span>
    );
  }
  const defs = [{ field: "amount", cellRenderer: "Record", editable: true }];
  const ref = createRef<Ag31ClientGridHandle<Record>>();
  const records = [new Record("a", 3), new Record("b", 12)];
  const props = {
    columnDefs: defs,
    getRowId: ({ data }: { data: Record }) => data.id,
    components: { Record: Renderer },
    ref,
  };
  const view = render(
    <Ag31ClientGrid
      {...props}
      rowData={records}
      context={{ label: "first" }}
    />,
  );
  const api = ref.current!.api,
    node = api.getRowNode("a")!;
  act(() =>
    api.applyColumnState({ state: [{ colId: "amount", sort: "asc" }] }),
  );
  records[0].amount = 99;
  act(() => api.refreshCells({ force: true }));
  expect(screen.getByText("class:99:first")).toBeTruthy();
  expect(api.getDisplayedRowAtIndex(0)).toBe(node);
  const replacement = new Record("a", 42);
  view.rerender(
    <Ag31ClientGrid
      {...props}
      rowData={[replacement, records[1]]}
      context={{ label: "second" }}
    />,
  );
  expect(screen.getByText("class:42:second")).toBeTruthy();
  expect(api.getRowNode("a")).toBe(node);
  expect(node.data).toBe(replacement);
  expect(seen).toContain(node);
  // Until setters/editors are compiled, source editable flags cannot enable native writes.
  fireEvent.doubleClick(screen.getByText("class:42:second"));
  expect(screen.queryByRole("textbox", { name: /edit/i })).toBeNull();
});

it("connects custom header subscriptions to local sort and asynchronous source row events", async () => {
  const calculate = vi.fn((p: any) => {
    let sum = 0;
    p.api.forEachNodeAfterFilter((n: any) => {
      if (!n.group) sum += n.data.amount;
    });
    return sum;
  });
  function Header(p: any) {
    const [sum, setSum] = useState(0),
      [direction, setDirection] = useState("");
    useEffect(() => {
      const update = () => setSum(p.calculate(p));
      const sort = () => setDirection(p.column.getSort() ?? "none");
      update();
      p.api.addEventListener("rowDataUpdated", update);
      p.column.addEventListener("sortChanged", sort);
      return () => {
        p.api.removeEventListener("rowDataUpdated", update);
        p.column.removeEventListener("sortChanged", sort);
      };
    }, [p]);
    return (
      <>
        <button onClick={() => p.progressSort()}>
          Total {sum} {direction}
        </button>
        <button onClick={(e) => p.showColumnMenu(e.currentTarget)}>
          Source menu
        </button>
      </>
    );
  }
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[{ id: "a", amount: 3 }]}
      getRowId={getRowId}
      columnDefs={[
        {
          field: "amount",
          headerComponent: Header,
          headerComponentParams: { calculate },
        },
      ]}
    />,
  );
  expect(screen.getByRole("button", { name: "Total 3" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Total 3" }));
  expect(screen.getByRole("button", { name: "Total 3 asc" })).toBeTruthy();
  const calculationCount = calculate.mock.calls.length;
  act(() => ref.current!.api.refreshCells({ force: true }));
  expect(calculate).toHaveBeenCalledTimes(calculationCount);
  await act(async () => {
    ref.current!.api.applyTransaction({ add: [{ id: "b", amount: 12 }] });
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(screen.getByRole("button", { name: "Total 15 asc" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Source menu" }));
  expect(screen.getByRole("menu")).toBeTruthy();
});
