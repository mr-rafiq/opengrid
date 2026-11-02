// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createGrid, type PivotConfiguration } from "@opengrid/core";
import { useClientPivot } from "./use-client-pivot";
import { DataGrid } from "./data-grid";
afterEach(cleanup);
const config: PivotConfiguration = {
  rows: ["team"],
  columns: ["game"],
  values: [{ columnId: "amount", aggregate: "sum" }],
};
function source() {
  return createGrid({
    rows: [
      { id: "a", team: "North", game: "Chess", amount: 10 },
      { id: "b", team: "North", game: "Chess", amount: 30 },
      { id: "c", team: "South", game: "Go", amount: 100 },
    ],
    getRowId: (row) => row.id,
    columns: [
      { id: "team", field: "team" },
      { id: "game", field: "game" },
      { id: "amount", field: "amount", type: "number", editable: true },
    ],
  });
}
it("refreshes edited and filtered source values without changing source layout or history", () => {
  const model = source();
  const before = model.getState();
  const { result } = renderHook(() => useClientPivot(model, config));
  const output = result.current.model!;
  expect(output.getColumns().every((column) => !column.pinned)).toBe(true);
  const value = result.current.report!.columns.find(
    (column) => column.kind === "value",
  )!.id;
  expect(result.current.report!.rows[0].cells[value]).toBe(40);
  expect(model.getState()).toBe(before);
  act(() => output.resizeColumn(value, 240));
  act(() => {
    output.pinColumn(value, "right");
    output.setState({ sorting: [{ columnId: value, direction: "desc" }] });
  });
  act(() => model.editCell("a", "amount", 20));
  expect(result.current.model).toBe(output);
  expect(result.current.report!.rows[0].cells[value]).toBe(50);
  expect(output.getColumns().find((column) => column.id === value)!.width).toBe(
    240,
  );
  expect(output.getState().columnPinning[value]).toBe("right");
  expect(output.getState().sorting).toEqual([
    { columnId: value, direction: "desc" },
  ]);
  act(() => model.undo());
  expect(result.current.report!.rows[0].cells[value]).toBe(40);
  act(() => model.setQuickFilter("South"));
  expect(result.current.report!.sourceRowCount).toBe(1);
  expect(result.current.report!.rows[0].keys[0].label).toBe("South");
});
it("keeps stable measure IDs when operation changes and pins one grand total", () => {
  const model = source();
  const { result, rerender } = renderHook(
    ({ configuration }) => useClientPivot(model, configuration),
    { initialProps: { configuration: config } },
  );
  const ids = result.current.report!.columns.map((column) => column.id);
  rerender({
    configuration: {
      ...config,
      values: [{ columnId: "amount", aggregate: "avg" }],
    },
  });
  expect(result.current.report!.columns.map((column) => column.id)).toEqual(
    ids,
  );
  expect(result.current.pinnedBottomRowIds).toHaveLength(1);
  expect(
    result.current.model!.getRows().filter((row) => row.grand),
  ).toHaveLength(1);
});
it("does no report work while disabled and hides stale output on a source schema error", () => {
  const model = source();
  const { result, rerender } = renderHook(
    ({ enabled }) => useClientPivot(model, config, { enabled }),
    { initialProps: { enabled: false } },
  );
  expect(result.current.status).toBe("disabled");
  expect(result.current.model).toBeNull();
  rerender({ enabled: true });
  const output = result.current.model!;
  act(() =>
    model.setColumns(
      model.getColumnDefinitions().filter((column) => column.id !== "game"),
    ),
  );
  expect(result.current.status).toBe("error");
  expect(result.current.model).toBeNull();
  expect(output.getRows()).toHaveLength(0);
});
it("omits an empty filter band for read-only matrices with correct row geometry", () => {
  const model = source();
  function Matrix() {
    const view = useClientPivot(model, config);
    return (
      view.model && (
        <DataGrid
          model={view.model}
          height={400}
          toolbar={false}
          pagination={false}
          selectionMode="none"
          pinnedBottomRowIds={view.pinnedBottomRowIds}
        />
      )
    );
  }
  const view = render(<Matrix />);
  expect(view.container.querySelector(".og-filter-row")).toBeNull();
  expect(view.container.querySelectorAll(".og-pinned-row").length).toBe(1);
  expect(
    view.container
      .querySelector('[role="grid"]')!
      .getAttribute("aria-rowcount"),
  ).toBe("5");
  expect(
    view.container
      .querySelector(".og-row:not(.og-pinned-row)")!
      .getAttribute("aria-rowindex"),
  ).toBe("3");
});
it("adjusts accessible row indexes when runtime definitions add a filter band", () => {
  const model = createGrid({
    rows: [{ id: "a", amount: 1 }],
    getRowId: (row) => row.id,
    columns: [{ id: "amount", field: "amount", filterable: false }],
  });
  const view = render(
    <DataGrid model={model} height={400} toolbar={false} pagination={false} />,
  );
  expect(view.container.querySelector(".og-filter-row")).toBeNull();
  expect(
    view.container.querySelector(".og-row")!.getAttribute("aria-rowindex"),
  ).toBe("2");
  act(() =>
    model.setColumns([{ id: "amount", field: "amount", filterable: true }]),
  );
  expect(view.container.querySelector(".og-filter-row")).not.toBeNull();
  expect(
    view.container.querySelector(".og-row")!.getAttribute("aria-rowindex"),
  ).toBe("3");
});
