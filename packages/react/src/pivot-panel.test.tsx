// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid, type PivotConfiguration } from "@opengrid/core";
import { PivotPanel } from "./pivot-panel";
import { COLUMN_DRAG_OWNER, columnDragOwner } from "./group-panel";
afterEach(cleanup);
function make() {
  return createGrid({
    rows: [
      { id: "a", country: "UK", game: "Chess", amount: 10 },
      { id: "b", country: "France", game: "Go", amount: 30 },
    ],
    getRowId: (row) => row.id,
    columns: [
      { id: "country", field: "country", header: "Country" },
      { id: "game", field: "game", header: "Game" },
      { id: "amount", field: "amount", header: "Amount", type: "number" },
    ],
  });
}
const initial: PivotConfiguration = {
  rows: ["country"],
  columns: ["game"],
  values: [{ columnId: "amount", aggregate: "sum" }],
};
it("adds, moves and removes fields with native controls and updates aggregation/totals", () => {
  const model = make();
  const onChange = vi.fn();
  function Editor() {
    const [config, setConfig] = useState(initial);
    return (
      <PivotPanel
        model={model}
        configuration={config}
        onConfigurationChange={(next) => {
          onChange(next);
          setConfig(next);
        }}
      />
    );
  }
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Rows field"), {
    target: { value: "game" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add rows field" }));
  expect(onChange.mock.lastCall![0].rows).toEqual(["country", "game"]);
  expect(onChange.mock.lastCall![0].columns).toEqual([]);
  fireEvent.click(
    screen.getByRole("button", { name: "Move earlier: Game (Rows)" }),
  );
  expect(onChange.mock.lastCall![0].rows).toEqual(["game", "country"]);
  fireEvent.change(screen.getByLabelText("Aggregation: Amount"), {
    target: { value: "avg" },
  });
  expect(onChange.mock.lastCall![0].values[0].aggregate).toBe("avg");
  fireEvent.click(screen.getByLabelText("Grand total"));
  expect(onChange.mock.lastCall![0].grandTotal).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Remove: Game (Rows)" }));
  expect(onChange.mock.lastCall![0].rows).toEqual(["country"]);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Add rows field" }),
  );
});
it("rejects over-limit configurations without calling the host or replacing its applied values", () => {
  const changed = vi.fn();
  render(
    <PivotPanel
      model={make()}
      configuration={{ ...initial, columns: [] }}
      onConfigurationChange={changed}
      limits={{ maxColumns: 3 }}
    />,
  );
  fireEvent.change(screen.getByLabelText("Columns field"), {
    target: { value: "game" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add columns field" }));
  expect(screen.getByRole("alert").textContent).toContain("exceeds 3 columns");
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Aggregation: Amount")).not.toBeNull();
});
it("accepts only drags belonging to this source and exposes count for text values", () => {
  const model = make();
  const changed = vi.fn();
  render(
    <PivotPanel
      model={model}
      configuration={initial}
      onConfigurationChange={changed}
    />,
  );
  const zone = screen
    .getByRole("region", { name: "Pivot fields" })
    .querySelector('[data-pivot-zone="values"]')!;
  const transfer = (owner: string) => ({
    getData: (type: string) => (type === COLUMN_DRAG_OWNER ? owner : "country"),
    types: [COLUMN_DRAG_OWNER],
  });
  fireEvent.drop(zone, { dataTransfer: transfer("foreign") });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.drop(zone, { dataTransfer: transfer(columnDragOwner(model)) });
  expect(changed.mock.lastCall![0].values).toEqual([
    ...initial.values,
    { columnId: "country", aggregate: "count" },
  ]);
});
it("retains source schema constraints and does not mutate the source grid", () => {
  const model = make();
  act(() =>
    model.setColumns(
      model
        .getColumnDefinitions()
        .map((column) => ({ ...column, groupable: false })),
    ),
  );
  const before = model.getState();
  render(
    <PivotPanel
      model={model}
      configuration={{
        rows: [],
        columns: [],
        values: [{ columnId: "country", aggregate: "count" }],
      }}
      onConfigurationChange={() => {}}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Add rows field" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    within(screen.getByLabelText("Aggregation: Country")).getAllByRole(
      "option",
    ),
  ).toHaveLength(1);
  expect(model.getState()).toBe(before);
});
