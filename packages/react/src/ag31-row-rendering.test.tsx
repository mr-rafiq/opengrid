// @vitest-environment jsdom
import React, { createRef, useEffect, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
} from "./ag31-client-grid.js";
import { createAg31ClientController } from "./ag31-client-controller.js";
import { createAg31CellFocus } from "./ag31-cell-focus.js";
type Row = { id: string; amount: number };
import type { DataGridViewController } from "./grid-view.js";
const identify = ({ data }: { data: Row }) => data.id;
afterEach(cleanup);

function pendingSetup() {
  const owner = createAg31ClientController({
    rows: [
      { id: "a", amount: 1 },
      { id: "b", amount: 2 },
    ],
    getRowId: (row: Row) => row.id,
    definitions: [{ field: "amount", editable: true }],
    editing: {},
  });
  let active = false;
  const start = vi.fn(() => true);
  const view = {
    isActive: () => active,
    startEditingCell: start,
  } as unknown as DataGridViewController;
  const detach = owner.attachEditingView(() => view);
  return {
    owner,
    start,
    detach,
    activate: () => {
      active = true;
    },
  };
}
it("starts only the latest queued editor after an owned view commit", () => {
  const { owner, start, activate } = pendingSetup();
  owner.api.startEditingCell({ rowIndex: 0, colKey: "amount" });
  owner.api.startEditingCell({ rowIndex: 1, colKey: "amount", key: "9" });
  owner.flushEditing();
  expect(start).not.toHaveBeenCalled();
  activate();
  owner.flushEditing();
  owner.flushEditing();
  expect(start).toHaveBeenCalledExactlyOnceWith(
    { rowId: "b", columnId: "amount" },
    { initialText: "9" },
  );
  owner.api.destroy();
});
it("revokes a pending editor on cancellation, record replacement, targeted redraw or detach", () => {
  for (const action of ["cancel", "replace", "redraw", "detach"] as const) {
    const { owner, start, activate, detach } = pendingSetup();
    owner.api.startEditingCell({ rowIndex: 0, colKey: "amount" });
    if (action === "cancel") owner.api.stopEditing(true);
    if (action === "replace")
      owner.api.applyTransaction({ update: [{ id: "a", amount: 9 }] });
    if (action === "redraw")
      owner.api.redrawRows({ rowNodes: [owner.api.getRowNode("a")!] });
    if (action === "detach") detach();
    activate();
    owner.flushEditing();
    expect(start, action).not.toHaveBeenCalled();
    owner.api.destroy();
  }
});

it("remounts only owned target rows, distinguishes refresh and preserves state/selection/record identity", () => {
  const counts = new Map<string, { mounts: number; unmounts: number }>();
  function Probe(p: any) {
    const [local, setLocal] = useState(0);
    useEffect(() => {
      const count = counts.get(p.node.id) ?? { mounts: 0, unmounts: 0 };
      count.mounts++;
      counts.set(p.node.id, count);
      return () => {
        count.unmounts++;
      };
    }, []);
    return (
      <button onClick={() => setLocal(local + 1)}>
        {p.node.id}:{local}
      </button>
    );
  }
  const rows = [
    { id: "a", amount: 1 },
    { id: "b", amount: 2 },
  ];
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  render(
    <Ag31ClientGrid
      ref={ref}
      getRowId={identify}
      rowData={rows}
      rowSelection="multiple"
      columnDefs={[
        { field: "id", cellRenderer: Probe, checkboxSelection: true },
        { field: "amount" },
      ]}
    />,
  );
  const api = ref.current!.api,
    a = api.getRowNode("a")!,
    b = api.getRowNode("b")!;
  act(() => b.setSelected(true));
  fireEvent.click(screen.getByRole("button", { name: "a:0" }));
  const state = api.getColumnState();
  act(() => api.refreshCells({ force: true }));
  expect(screen.getByRole("button", { name: "a:1" })).toBeTruthy();
  act(() => api.redrawRows({ rowNodes: [] }));
  expect(counts.get("a")).toEqual({ mounts: 1, unmounts: 0 });
  act(() => api.redrawRows({ rowNodes: [a, a] }));
  expect(screen.getByRole("button", { name: "a:0" })).toBeTruthy();
  expect(counts.get("a")).toEqual({ mounts: 2, unmounts: 1 });
  expect(counts.get("b")).toEqual({ mounts: 1, unmounts: 0 });
  expect(api.getRowNode("a")).toBe(a);
  expect(a.data).toBe(rows[0]);
  expect(api.getSelectedNodes()).toEqual([b]);
  expect(api.getColumnState()).toEqual(state);
  act(() => api.redrawRows());
  expect(counts.get("a")).toEqual({ mounts: 3, unmounts: 2 });
  expect(counts.get("b")).toEqual({ mounts: 2, unmounts: 1 });
});

it("opens a real editor after same-turn selection invalidates the mounted view", async () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>();
  render(
    <Ag31ClientGrid
      ref={ref}
      getRowId={identify}
      rowData={[
        { id: "a", amount: 1 },
        { id: "b", amount: 2 },
      ]}
      rowSelection="multiple"
      columnDefs={[
        {
          field: "amount",
          editable: true,
          cellEditor: "agNumberCellEditor",
          cellDataType: "number",
          checkboxSelection: true,
        },
      ]}
    />,
  );
  act(() => {
    ref.current!.api.getRowNode("b")!.setSelected(true);
    ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "amount" });
  });
  await waitFor(() =>
    expect(
      screen.getByRole("spinbutton", { name: "Cell editor" }),
    ).toBeTruthy(),
  );
  expect(ref.current!.api.getEditingCells()).toHaveLength(1);
  expect(ref.current!.api.getSelectedNodes()?.map((node) => node.id)).toEqual([
    "b",
  ]);
});

it("commits a targeted number editor once and preserves unrelated and empty-target drafts", async () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    changed = vi.fn();
  const rows = [
    { id: "a", amount: 1 },
    { id: "b", amount: 2 },
  ];
  render(
    <Ag31ClientGrid
      ref={ref}
      getRowId={identify}
      rowData={rows}
      columnDefs={[
        {
          field: "amount",
          editable: true,
          cellEditor: "agNumberCellEditor",
          cellDataType: "number",
        },
      ]}
      onCellValueChanged={changed}
    />,
  );
  const api = ref.current!.api;
  act(() => api.startEditingCell({ rowIndex: 0, colKey: "amount" }));
  const input = screen.getByRole("spinbutton", { name: "Cell editor" });
  fireEvent.change(input, { target: { value: "888" } });
  act(() => api.redrawRows({ rowNodes: [api.getRowNode("b")!] }));
  expect(screen.getByRole("spinbutton", { name: "Cell editor" })).toBe(input);
  act(() => api.redrawRows({ rowNodes: [] }));
  expect(rows[0].amount).toBe(1);
  expect(api.getEditingCells()).toHaveLength(1);
  act(() => api.redrawRows({ rowNodes: [api.getRowNode("a")!] }));
  expect(rows[0].amount).toBe(888);
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(api.getEditingCells()).toEqual([]);
});

it("ignores foreign, root and retired nodes and becomes inert after controller destruction", () => {
  const make = () =>
    createAg31ClientController({
      rows: [{ id: "a", amount: 1 }],
      getRowId: (r: Row) => r.id,
      definitions: [{ field: "amount" }],
    });
  const owner = make(),
    other = make(),
    retired = owner.api.getRowNode("a")!;
  const refresh = vi.fn();
  owner.subscribeViewRefresh(refresh);
  owner.api.redrawRows({
    rowNodes: [other.api.getRowNode("a")!, owner.nodes.getRootNode()],
  });
  expect(refresh).not.toHaveBeenCalled();
  owner.api.applyTransaction({ remove: [retired.data!] });
  owner.api.applyTransaction({ add: [{ id: "a", amount: 2 }] });
  owner.api.redrawRows({ rowNodes: [retired] });
  expect(refresh).not.toHaveBeenCalled();
  const live = owner.api.getRowNode("a")!,
    key = owner.rowRendering.key("a");
  owner.api.redrawRows({ rowNodes: [live] });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(owner.rowRendering.key("a")).not.toBe(key);
  owner.api.destroy();
  owner.api.redrawRows();
  expect(refresh).toHaveBeenCalledTimes(1);
  other.api.destroy();
});

it("consumes full-redraw focus restoration once and revokes stale logical, attachment and external-focus ownership", () => {
  const owner = createAg31ClientController({
    rows: [{ id: "a", amount: 1 }],
    getRowId: (r: Row) => r.id,
    definitions: [{ field: "amount" }],
  });
  let external = false;
  const focus = vi.fn(() => true);
  const detach = owner.cellFocus.attach(() => ({
    focus,
    ownsBrowserFocus: () => true,
    canRestoreBrowserFocus: () => !external,
  }));
  owner.api.setFocusedCell(0, "amount");
  focus.mockClear();
  owner.api.redrawRows();
  owner.rowRendering.flush();
  owner.rowRendering.flush();
  expect(focus).toHaveBeenCalledTimes(1);
  owner.api.redrawRows();
  external = true;
  owner.rowRendering.flush();
  expect(focus).toHaveBeenCalledTimes(1);
  external = false;
  owner.api.redrawRows();
  owner.api.clearFocusedCell();
  owner.rowRendering.flush();
  expect(focus).toHaveBeenCalledTimes(1);
  owner.api.setFocusedCell(0, "amount");
  focus.mockClear();
  owner.api.redrawRows();
  detach();
  owner.rowRendering.flush();
  expect(focus).not.toHaveBeenCalled();
  owner.api.destroy();
});

it("never restores an editor or changes focus on targeted redraw", () => {
  const column = { getColId: () => "amount" } as any;
  const service = createAg31CellFocus({
    column: () => column,
    position: () => ({ rowId: "a", columnId: "amount" }),
    locate: () => null,
    subscribe: () => () => {},
    emit: () => {},
  });
  const focus = vi.fn(() => true);
  service.attach(() => ({
    focus,
    ownsBrowserFocus: () => false,
    canRestoreBrowserFocus: () => true,
  }));
  service.setFocusedCell(0, "amount");
  focus.mockClear();
  expect(service.captureRedrawFocus()).toBeUndefined();
  expect(focus).not.toHaveBeenCalled();
  service.destroy();
});
