// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ServerSideRowModel, type GridModel } from "@opengrid/core";
import { ServerDataGrid } from "./remote-grids.js";

const capture = vi.hoisted(() => ({
  model: undefined as GridModel<unknown> | undefined,
}));
vi.mock("./data-grid.js", () => ({
  DataGrid: ({ model }: { model: GridModel<unknown> }) => {
    capture.model = model;
    return <div />;
  },
}));
afterEach(() => {
  cleanup();
  capture.model = undefined;
});

it("keeps server order provider-authoritative through the GridModel facade", async () => {
  const getRows = vi.fn(async () => ({
    nodes: ["a", "b", "c"].map((id) => ({
      kind: "row" as const,
      id,
      data: { name: id },
    })),
    rowCount: 3,
  }));
  const source = new ServerSideRowModel({ getRows });
  render(
    <ServerDataGrid model={source} columns={[{ id: "name", field: "name" }]} />,
  );
  await waitFor(() => expect(capture.model!.getRows()).toHaveLength(3));
  const model = capture.model!,
    state = model.getState(),
    rows = model.getRows();
  expect(model.getRowReorderStatus()).toMatchObject({
    allowed: false,
    reason: "read-only",
  });
  expect(Object.isFrozen(model.getRowReorderStatus())).toBe(true);
  expect(model.moveRows(["a"], "c", "after")).toContain(
    "provider-authoritative",
  );
  expect(model.getState()).toBe(state);
  expect(model.getRows()).toEqual(rows);
  expect(model.undo()).toBe(false);
  expect(getRows).toHaveBeenCalledTimes(1);
});
