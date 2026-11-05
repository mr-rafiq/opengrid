// @vitest-environment jsdom
import React, { createRef, useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Ag31ClientGrid, type Ag31ClientGridHandle } from "./ag31-client-grid";
afterEach(cleanup);
type Row = { id: string; amount: number };
const id = ({ data }: { data: Row }) => data.id;
const defs = [{ field: "amount", width: 180 }];
it("renders automatic loading and empty states while nullable updates retain resident rows", async () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    rows = [
      { id: "a", amount: 12 },
      { id: "b", amount: 24 },
    ],
    view = render(
      <Ag31ClientGrid
        ref={ref}
        rowData={null}
        columnDefs={defs}
        getRowId={id}
      />,
    );
  expect(screen.getByText("Loading...")).toBeTruthy();
  const grid = screen.getByRole("grid");
  await waitFor(() => expect(grid.getAttribute("aria-busy")).toBe("true"));
  view.rerender(
    <Ag31ClientGrid ref={ref} rowData={rows} columnDefs={defs} getRowId={id} />,
  );
  await waitFor(() => expect(screen.queryByText("Loading...")).toBeNull());
  expect(ref.current!.api.getDisplayedRowCount()).toBe(2);
  act(() => ref.current!.api.showLoadingOverlay());
  view.rerender(
    <Ag31ClientGrid ref={ref} rowData={null} columnDefs={defs} getRowId={id} />,
  );
  expect(ref.current!.api.getDisplayedRowCount()).toBe(2);
  expect(ref.current!.api.getGridOption("rowData")).toBeUndefined();
  expect(screen.getByText("Loading...")).toBeTruthy();
  view.rerender(
    <Ag31ClientGrid ref={ref} rowData={[]} columnDefs={defs} getRowId={id} />,
  );
  await waitFor(() => expect(screen.getByText("No Rows To Show")).toBeTruthy());
  expect(ref.current!.api.getDisplayedRowCount()).toBe(0);
  expect(grid.hasAttribute("aria-busy")).toBe(false);
});
it("updates custom component parameters without remounting and cleans up on hide and destruction", () => {
  const mounted = vi.fn(),
    disposed = vi.fn(),
    ref = createRef<Ag31ClientGridHandle<Row>>();
  function Busy({
    message,
    api,
  }: {
    message: string;
    api: Ag31ClientGridHandle<Row>["api"];
  }) {
    useEffect(() => {
      mounted(api);
      return () => disposed(api);
    }, []);
    return <div role="status">{message}</div>;
  }
  const registry = { busy: Busy },
    view = render(
      <Ag31ClientGrid
        ref={ref}
        rowData={null}
        columnDefs={defs}
        getRowId={id}
        components={registry}
        loadingOverlayComponent="busy"
        loadingOverlayComponentParams={{ message: "First" }}
      />,
    ),
    api = ref.current!.api,
    service = api.overlayService;
  expect(screen.getByText("First")).toBeTruthy();
  expect(mounted).toHaveBeenCalledTimes(1);
  view.rerender(
    <Ag31ClientGrid
      ref={ref}
      rowData={null}
      columnDefs={defs}
      getRowId={id}
      components={registry}
      loadingOverlayComponent="busy"
      loadingOverlayComponentParams={{ message: "Second" }}
    />,
  );
  expect(screen.getByText("Second")).toBeTruthy();
  expect(mounted).toHaveBeenCalledTimes(1);
  act(() => api.hideOverlay());
  expect(screen.queryByText("Second")).toBeNull();
  expect(disposed).toHaveBeenCalledTimes(1);
  act(() => api.showLoadingOverlay());
  expect(mounted).toHaveBeenCalledTimes(2);
  expect(api.overlayService).toBe(service);
  act(() => api.destroy());
  expect(screen.queryByText("Second")).toBeNull();
  expect(disposed).toHaveBeenCalledTimes(2);
  expect(service.isAlive()).toBe(false);
  view.unmount();
  expect(disposed).toHaveBeenCalledTimes(2);
});
it("keeps manual overlay notifications separate from resident view refresh and applies locale messages", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    rows = [{ id: "a", amount: 12 }];
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={rows}
      columnDefs={defs}
      getRowId={id}
      localeText={{
        loadingOoo: "Loading estimate",
        noRowsToShow: "No estimate lines",
      }}
    />,
  );
  const api = ref.current!.api,
    modelUpdated = vi.fn();
  api.addEventListener("modelUpdated", modelUpdated);
  rows[0].amount = 99;
  act(() => api.showLoadingOverlay());
  expect(screen.getByText("Loading estimate")).toBeTruthy();
  expect(screen.getByRole("gridcell", { name: "12" })).toBeTruthy();
  act(() =>
    api.setGridOption("localeText", { loadingOoo: "Updated estimate label" }),
  );
  expect(screen.getByText("Updated estimate label")).toBeTruthy();
  act(() => api.hideOverlay());
  expect(api.getDisplayedRowCount()).toBe(1);
  expect(screen.getByRole("gridcell", { name: "12" })).toBeTruthy();
  expect(screen.queryByRole("gridcell", { name: "99" })).toBeNull();
  expect(modelUpdated).not.toHaveBeenCalled();
  act(() => api.refreshCells({ force: true }));
  expect(screen.getByRole("gridcell", { name: "99" })).toBeTruthy();
});
it("does not create an owner, invoke an overlay component or read source rows during SSR", () => {
  let invoked = 0;
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  const output = renderToString(
    <Ag31ClientGrid
      ref={ref}
      rowData={null}
      columnDefs={defs}
      getRowId={id}
      loadingOverlayComponent={() => {
        invoked++;
        return <div>Loading</div>;
      }}
    />,
  );
  expect(output).toBe("");
  expect(ref.current).toBeNull();
  expect(invoked).toBe(0);
});

it("resolves registered no-row components and evaluates parameter functions with the owned context", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    context = { project: "Synthetic" };
  const params = vi.fn((p: { context: typeof context }) => ({
    message: `${p.context.project} is empty`,
  }));
  function Empty({ message }: { message: string }) {
    return <div role="status">{message}</div>;
  }
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[]}
      columnDefs={defs}
      getRowId={id}
      context={context}
      components={{ empty: Empty }}
      noRowsOverlayComponent="empty"
      noRowsOverlayComponentParams={params}
    />,
  );
  expect(screen.getByText("Synthetic is empty")).toBeTruthy();
  expect(params.mock.calls[0][0]).toMatchObject({
    api: ref.current!.api,
    columnApi: ref.current!.columnApi,
    context,
  });
  act(() => ref.current!.api.hideOverlay());
  expect(screen.queryByText("Synthetic is empty")).toBeNull();
  act(() => ref.current!.api.showNoRowsOverlay());
  expect(screen.getByText("Synthetic is empty")).toBeTruthy();
});
