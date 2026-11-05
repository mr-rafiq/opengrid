// @vitest-environment jsdom
import React, { StrictMode, createRef, useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  Ag31ClientGrid,
  resolveAg31ClientGridConfig,
  type Ag31ClientGridHandle,
} from "./ag31-client-grid.js";
import { Ag31ClientGrid as PublicGrid } from "./index.js";
afterEach(cleanup);
type Row = { id: string; amount: number };
const getRowId = ({ data }: { data: Row }) => data.id;
it("renders and clears source row/cell decorations with current context while protecting native geometry", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  const context = { active: true },
    rowData = [{ id: "a", amount: 12 }];
  const rowStyle = () => ({
    backgroundColor: "gold",
    height: 9999,
    top: 9999,
    width: 9999,
  });
  const definitions = [
    {
      field: "amount",
      width: 180,
      cellStyle: { color: "navy", width: 1 },
      cellClass: "domain-amount",
      cellClassRules: {
        changed: (p: { context: unknown }) =>
          (p.context as { active: boolean }).active,
      },
      tooltipValueGetter: (p: { data: Row }) => `Amount ${p.data.amount}`,
    },
  ];
  const view = render(
    <PublicGrid
      ref={ref}
      getRowId={getRowId}
      rowData={rowData}
      columnDefs={definitions}
      context={context}
      getRowStyle={rowStyle}
    />,
  );
  const cell = screen.getByRole("gridcell", { name: /^12$/ });
  const row = cell.closest<HTMLElement>('[data-og-row-id="a"]')!;
  expect(row.style.backgroundColor).toBe("gold");
  expect(row.style.height).toBe("42px");
  expect(row.style.top).toBe("0px");
  expect(row.style.width).toBe("100%");
  expect(cell.style.color).toBe("navy");
  expect(cell.style.width).toBe("180px");
  expect(cell.classList.contains("changed")).toBe(true);
  expect(cell.title).toBe("Amount 12");
  act(() => {
    ref.current!.api.setGridOption("context", { active: false });
    ref.current!.api.refreshCells();
  });
  expect(cell.classList.contains("changed")).toBe(false);
  act(() =>
    ref.current!.api.setGridOption("getRowStyle", () => ({
      backgroundColor: "pink",
    })),
  );
  view.rerender(
    <PublicGrid
      ref={ref}
      getRowId={getRowId}
      rowData={[...rowData]}
      columnDefs={definitions}
      context={context}
      getRowStyle={rowStyle}
    />,
  );
  expect(ref.current!.api.getGridOption("getRowStyle")).not.toBe(rowStyle);
  expect(row.style.backgroundColor).toBe("pink");
  act(() => ref.current!.api.setGridOption("getRowStyle", null));
  expect(row.style.backgroundColor).toBe("");
});
it("keeps omitted columns and rows stable through the public ref lifecycle and unrelated prop changes", async () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    ready = vi.fn();
  const view = render(
    <StrictMode>
      <PublicGrid<Row> ref={ref} getRowId={getRowId} onGridReady={ready} />
    </StrictMode>,
  );
  await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  const api = ref.current!.api;
  expect(api.getDisplayedRowCount()).toBe(0);
  expect(api.getGridOption("rowData")).toBeUndefined();
  view.rerender(
    <StrictMode>
      <PublicGrid<Row>
        ref={ref}
        getRowId={getRowId}
        onGridReady={ready}
        context={{ label: "changed" }}
      />
    </StrictMode>,
  );
  expect(ref.current!.api).toBe(api);
  expect(api.getGridOption("context")).toEqual({ label: "changed" });
  expect(ready).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(api.isDestroyed()).toBe(true);
});
it("forwards external-filter props while preserving imperative overrides on unrelated row updates", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  const definitions = [{ field: "amount" }],
    present = () => true;
  const pass = (node: { data?: Row }) => node.data!.amount > 5;
  const rows = [
    { id: "a", amount: 1 },
    { id: "b", amount: 8 },
  ];
  const options = {
    getRowId,
    isExternalFilterPresent: present,
    doesExternalFilterPass: pass,
  };
  const view = render(
    <Ag31ClientGrid
      ref={ref}
      gridOptions={options}
      rowData={rows}
      columnDefs={definitions}
    />,
  );
  expect(ref.current!.api.getDisplayedRowCount()).toBe(1);
  act(() => ref.current!.api.setGridOption("isExternalFilterPresent", null));
  view.rerender(
    <Ag31ClientGrid
      ref={ref}
      gridOptions={options}
      rowData={[...rows]}
      columnDefs={definitions}
    />,
  );
  expect(ref.current!.api.getDisplayedRowCount()).toBe(2);
  view.rerender(
    <Ag31ClientGrid
      ref={ref}
      gridOptions={options}
      isExternalFilterPresent={present}
      doesExternalFilterPass={() => false}
      rowData={rows}
      columnDefs={definitions}
    />,
  );
  expect(ref.current!.api.getDisplayedRowCount()).toBe(2);
  // Only a changed presence prop replaces the deliberate imperative clear.
  view.rerender(
    <Ag31ClientGrid
      ref={ref}
      gridOptions={options}
      isExternalFilterPresent={() => true}
      doesExternalFilterPass={() => false}
      rowData={rows}
      columnDefs={definitions}
    />,
  );
  expect(ref.current!.api.getDisplayedRowCount()).toBe(0);
});

it("binds explicit event props over gridOptions and preserves imperative callback changes across unrelated row updates", async () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    option = vi.fn(),
    explicit = vi.fn(),
    imperative = vi.fn(),
    calls: string[] = [];
  const base = {
    ref,
    getRowId,
    columnDefs: [
      { field: "id", checkboxSelection: true, headerCheckboxSelection: true },
      { field: "amount" },
    ],
    rowSelection: "multiple" as const,
    suppressRowClickSelection: true,
  };
  const options = { onSelectionChanged: option };
  const view = render(
    <Ag31ClientGrid
      {...base}
      rowData={[{ id: "a", amount: 1 }]}
      gridOptions={options}
      onSelectionChanged={explicit}
    />,
  );
  const api = ref.current!.api;
  api.addEventListener("selectionChanged", () => calls.push("api"));
  expect(api.getGridOption("onSelectionChanged")).toBe(explicit);
  act(() => api.getRowNode("a")!.setSelected(true));
  await waitFor(() => expect(explicit).toHaveBeenCalledTimes(1));
  expect(option).not.toHaveBeenCalled();
  expect(calls).toEqual(["api"]);
  expect(explicit.mock.calls[0][0]).toMatchObject({
    type: "selectionChanged",
    source: "api",
    api,
    columnApi: ref.current!.columnApi,
  });
  act(() => api.setGridOption("onSelectionChanged", imperative));
  view.rerender(
    <Ag31ClientGrid
      {...base}
      rowData={[{ id: "a", amount: 2 }]}
      gridOptions={options}
      onSelectionChanged={explicit}
    />,
  );
  expect(api.getGridOption("onSelectionChanged")).toBe(imperative);
  act(() => api.getRowNode("a")!.setSelected(false));
  await waitFor(() => expect(imperative).toHaveBeenCalledTimes(1));
});

it("notifies committed gridReady API listeners before the configured option and cancels queued ready delivery on unmount", async () => {
  const calls: string[] = [],
    listener = () => calls.push("api"),
    option = () => calls.push("option");
  const ref = (handle: Ag31ClientGridHandle<Row> | null) =>
    handle?.api.addEventListener("gridReady", listener);
  const view = render(
    <StrictMode>
      <Ag31ClientGrid
        ref={ref}
        getRowId={getRowId}
        rowData={[{ id: "a", amount: 1 }]}
        columnDefs={[{ field: "amount" }]}
        onGridReady={option}
      />
    </StrictMode>,
  );
  await waitFor(() => expect(calls).toEqual(["api", "option"]));
  view.unmount();
  vi.useFakeTimers();
  try {
    const cancelled = vi.fn(),
      next = render(
        <Ag31ClientGrid
          getRowId={getRowId}
          rowData={[]}
          columnDefs={[{ field: "amount" }]}
          onGridReady={cancelled}
        />,
      );
    next.unmount();
    vi.runOnlyPendingTimers();
    expect(cancelled).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("matches measured defined-prop precedence without mutating source options or losing false/null", () => {
  const context = { from: "options" };
  const rows = [{ id: "a", amount: 3 }];
  const options = {
    getRowId,
    rowData: rows,
    columnDefs: [{ field: "amount" }],
    context,
    rowHeight: 42,
    suppressRowClickSelection: true,
  };
  const resolved = resolveAg31ClientGridConfig({
    gridOptions: options,
    context: undefined,
    rowHeight: undefined,
    suppressRowClickSelection: false,
  });
  expect(resolved.context).toBe(context);
  expect(resolved.rowHeight).toBe(42);
  expect(resolved.suppressRowClickSelection).toBe(false);
  expect(resolved.rowData).toBe(rows);
  expect(resolved.getRowId).toBe(getRowId);
  expect(options.suppressRowClickSelection).toBe(true);
  expect(
    resolveAg31ClientGridConfig({
      gridOptions: options,
      context: null,
      rowHeight: 0,
    }).context,
  ).toBeNull();
  expect(
    resolveAg31ClientGridConfig({
      gridOptions: options,
      context: null,
      rowHeight: 0,
    }).rowHeight,
  ).toBe(0);
  expect(() =>
    resolveAg31ClientGridConfig({
      gridOptions: { ...options, sideBar: true } as any,
    }),
  ).toThrow(/Unsupported source gridOptions option: sideBar/);
});

it("mounts a source identity and callbacks supplied through gridOptions while explicit context wins", async () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  const ready = vi.fn();
  render(
    <Ag31ClientGrid
      ref={ref}
      context={{ from: "props" }}
      gridOptions={{
        getRowId,
        rowData: [{ id: "a", amount: 3 }],
        columnDefs: [{ field: "amount" }],
        context: { from: "options" },
        onGridReady: ready,
      }}
    />,
  );
  await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  expect(ready.mock.calls[0][0].api).toBe(ref.current!.api);
  expect(ref.current!.api.getRowNode("a")!.data!.amount).toBe(3);
  expect(ref.current!.api.getGridOption("context")).toEqual({ from: "props" });
});

it("normalizes nullable loading options like the measured grid service and forwards authoritative records without recreating the API", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  const options = {
    getRowId,
    columnDefs: [{ field: "amount" }],
    rowData: null as Row[] | null,
  };
  const view = render(<Ag31ClientGrid ref={ref} gridOptions={options} />);
  const api = ref.current!.api;
  expect(api.getGridOption("rowData")).toBeUndefined();
  expect(api.getDisplayedRowCount()).toBe(0);
  const row = { id: "a", amount: 42 };
  view.rerender(
    <Ag31ClientGrid ref={ref} gridOptions={{ ...options, rowData: [row] }} />,
  );
  expect(ref.current!.api).toBe(api);
  expect(api.getRowNode("a")!.data).toBe(row);
  view.rerender(<Ag31ClientGrid ref={ref} gridOptions={options} />);
  expect(api.getGridOption("rowData")).toBeUndefined();
  expect(api.getDisplayedRowCount()).toBe(0);
});

it("preserves imperative context changes when only the rowData prop changes", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    context = { from: "props" };
  const props = { ref, getRowId, columnDefs: [{ field: "amount" }], context };
  const view = render(
    <Ag31ClientGrid {...props} rowData={[{ id: "a", amount: 1 }]} />,
  );
  const imperative = { from: "api" };
  act(() => ref.current!.api.setGridOption("context", imperative));
  view.rerender(
    <Ag31ClientGrid {...props} rowData={[{ id: "a", amount: 2 }]} />,
  );
  expect(ref.current!.api.getGridOption("context")).toBe(imperative);
  const next = { from: "new prop" };
  view.rerender(
    <Ag31ClientGrid
      {...props}
      context={next}
      rowData={[{ id: "a", amount: 3 }]}
    />,
  );
  expect(ref.current!.api.getGridOption("context")).toBe(next);
});

it("emits ready once after initial narrow-layout unpinning commits an active view", async () => {
  const width = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("og-viewport") ? 320 : 0;
    });
  try {
    const ref = createRef<Ag31ClientGridHandle<Row>>(),
      ready = vi.fn();
    render(
      <Ag31ClientGrid
        ref={ref}
        getRowId={getRowId}
        rowData={[{ id: "a", amount: 1 }]}
        columnDefs={[
          { field: "id", width: 300, pinned: "left" },
          { field: "amount", width: 240, pinned: "right" },
        ]}
        onGridReady={ready}
      />,
    );
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    expect(
      ref
        .current!.api.getColumnState()!
        .every((column) => column.pinned === null),
    ).toBe(true);
    expect(ready.mock.calls[0][0].api).toBe(ref.current!.api);
  } finally {
    width.mockRestore();
  }
});

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

it("commits a live API/ref before ready and revokes it on StrictMode unmount", async () => {
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
  await waitFor(() => expect(callbacks).toHaveLength(1));
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
