import { expect, it, vi } from "vitest";
import { createGrid } from "./index.js";
function setup() {
  const rows = [1, 2, 3, 4, 5].map((amount) => ({
    id: String(amount),
    amount,
  }));
  const model = createGrid({
    rows,
    getRowId: (r) => r.id,
    columns: [{ id: "amount", field: "amount", type: "number" }],
  });
  return { model, rows };
}
it("publishes replacement column filters and the predicate as one query", () => {
  const { model } = setup();
  model.setFilter("amount", { op: "gt", value: 4 });
  const observed: unknown[] = [];
  model.subscribe(() =>
    observed.push({
      ids: model.getFilteredRows().map((r) => r.id),
      filters: model.getState().filters,
    }),
  );
  model.setExternalFilter((r) => r.amount > 2, {
    columnFilters: { amount: { op: "lt", value: 5 } },
  });
  expect(observed).toEqual([
    { ids: ["3", "4"], filters: { amount: { op: "lt", value: 5 } } },
  ]);
});
it("rolls back both query halves and their cached result when a predicate fails", () => {
  const { model } = setup();
  model.setExternalFilter((r) => r.amount < 4);
  model.setFilter("amount", { op: "gt", value: 1 });
  const before = model.getState();
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["2", "3"]);
  const changed = vi.fn();
  model.subscribe(changed);
  expect(() =>
    model.setExternalFilter(
      () => {
        throw Error("temporary read");
      },
      { columnFilters: {} },
    ),
  ).toThrow("temporary read");
  expect(model.getState()).toBe(before);
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["2", "3"]);
  expect(changed).not.toHaveBeenCalled();
  model.selectRows(["2"]);
  expect(model.getFilteredRows().map((r) => r.id)).toEqual(["2", "3"]);
});
it("rejects invalid conditions before publishing a partial replacement", () => {
  const { model } = setup();
  const before = model.getState(),
    read = vi.fn(() => true);
  expect(() =>
    model.setExternalFilter(read, {
      columnFilters: { amount: { op: "and", conditions: [] } },
    }),
  ).toThrow();
  expect(model.getState()).toBe(before);
  expect(read).not.toHaveBeenCalled();
});
it("rejects accessor updates without evaluating them", () => {
  const { model } = setup(),
    get = vi.fn(() => ({}));
  expect(() =>
    model.setExternalFilter(
      undefined,
      Object.defineProperty({}, "columnFilters", { get, enumerable: true }),
    ),
  ).toThrow(/accessors/);
  expect(get).not.toHaveBeenCalled();
});
