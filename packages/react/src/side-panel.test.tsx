// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { GridSidePanel } from "./side-panel";
import {
  createParticipants,
  participantColumns,
} from "../../../examples/site/src/participant-data";
afterEach(cleanup);
it("offers grouping grips as keyboard/touch toggles without changing visibility", () => {
  const { model } = setup();
  const grip = screen.getByRole("button", { name: "Group by Name" });
  expect(grip.draggable).toBe(true);
  fireEvent.click(grip);
  expect(model.getState().groupBy).toEqual(["name"]);
  expect(
    (screen.getByRole("checkbox", { name: "Name" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(grip.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(grip);
  expect(model.getState().groupBy).toEqual([]);
});
it("keeps category visibility controls usable while collapsed and expands matching search results", () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Collapse Participant columns" }),
  );
  expect(screen.queryByRole("checkbox", { name: "Name" })).toBeNull();
  expect(
    screen.getByRole("checkbox", { name: "Columns: Participant" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Name" },
  });
  expect(screen.getByRole("checkbox", { name: "Name" })).toBeTruthy();
});
it("does not advertise grouping grips for explicitly non-groupable columns", () => {
  const { model } = setup();
  act(() =>
    model.setColumns(
      model
        .getColumnDefinitions()
        .map((column) => ({ ...column, groupable: false })),
    ),
  );
  expect(screen.queryByRole("button", { name: "Group by Name" })).toBeNull();
});
function setup() {
  const custom = (values: unknown[]) => values.length * 2;
  const model = createGrid({
    rows: [{ id: "1", name: "Mira", value: 3 }],
    getRowId: (row) => row.id,
    columns: [
      { id: "name", field: "name", header: "Name", groupPath: ["Participant"] },
      {
        id: "value",
        field: "value",
        header: "Score",
        type: "number",
        hidden: true,
        groupPath: ["Performance"],
        aggregate: custom,
      },
    ],
  });
  render(<GridSidePanel model={model} />);
  return { model, custom };
}
it("reflects default hidden columns, mixed groups and external state without stale checkboxes", () => {
  const { model } = setup();
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Score",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  fireEvent.click(screen.getByRole("checkbox", { name: "Score" }));
  expect(
    model.getColumns().find((column) => column.id === "value")?.hidden,
  ).toBe(false);
  act(() => model.hideColumn("name", true));
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Name",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});
it("search matches group labels and bulk visibility only changes the matching group", () => {
  const { model } = setup();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "participant" },
  });
  expect(screen.queryByRole("checkbox", { name: "Score" })).toBeNull();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Columns: Participant" }),
  );
  expect(model.getColumns().every((column) => column.hidden)).toBe(true);
});
it("native vertical tabs support arrows, Home/End and retain a single tab stop", () => {
  setup();
  const columns = screen.getByRole("tab", { name: "Columns" });
  columns.focus();
  fireEvent.keyDown(columns, { key: "ArrowDown" });
  const filters = screen.getByRole("tab", { name: "Filters" });
  expect(document.activeElement).toBe(filters);
  expect(filters.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
    filters.id,
  );
  fireEvent.keyDown(filters, { key: "Home" });
  expect(document.activeElement).toBe(columns);
  expect(filters.tabIndex).toBe(-1);
});
it("preserves custom aggregates until an explicit native choice and updates real group values", () => {
  const { model, custom } = setup();
  const values = screen.getByRole("combobox", { name: "Values: Score" });
  expect((values as HTMLSelectElement).value).toBe("custom");
  expect(
    model.getColumns().find((column) => column.id === "value")?.aggregate,
  ).toBe(custom);
  fireEvent.change(values, { target: { value: "sum" } });
  act(() => model.setState({ groupBy: ["name"] }));
  expect(model.getRowModel()[0].aggregates?.value).toBe(3);
  fireEvent.change(values, { target: { value: "" } });
  expect(
    model.getColumns().find((column) => column.id === "value")?.aggregate,
  ).toBeUndefined();
});
it("offers working keyboard grouping and reacts to replacement definitions", () => {
  const { model } = setup();
  const groups = screen.getByRole("region", { name: "Columns: Row groups" });
  fireEvent.change(within(groups).getByRole("combobox"), {
    target: { value: "name" },
  });
  fireEvent.click(within(groups).getByRole("button", { name: "Add group" }));
  expect(model.getState().groupBy).toEqual(["name"]);
  act(() =>
    model.setColumns([
      {
        id: "__proto__",
        field: "name",
        header: "Replacement",
        groupPath: ["__proto__"],
      },
    ]),
  );
  expect(screen.getByRole("checkbox", { name: "Replacement" })).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: "Name" })).toBeNull();
});
it("changing an aggregate retains definition defaults so a later view reset restores visibility and sizing", () => {
  const { model } = setup();
  act(() => {
    model.hideColumn("value", false);
    model.hideColumn("name", true);
    model.resizeColumn("value", 310);
    model.pinColumn("value", "left");
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Values: Score" }), {
    target: { value: "sum" },
  });
  expect(
    model.getColumns().find((column) => column.id === "value"),
  ).toMatchObject({ width: 310, hidden: false, pinned: "left" });
  act(() =>
    model.setState({
      columnVisibility: {},
      columnWidths: {},
      columnPinning: {},
    }),
  );
  expect(
    model.getColumns().find((column) => column.id === "name")?.hidden,
  ).not.toBe(true);
  expect(
    model.getColumns().find((column) => column.id === "value"),
  ).toMatchObject({ width: 160, hidden: true, aggregate: "sum" });
});
it("generates deterministic bounded synthetic data with 22 independent columns", () => {
  const rows = createParticipants(100000);
  expect(rows).toHaveLength(100000);
  expect(new Set(rows.map((row) => row.id)).size).toBe(100000);
  expect(rows.slice(0, 1000)).toEqual(createParticipants(1000));
  expect(participantColumns()).toHaveLength(22);
  expect(new Set(participantColumns().map((column) => column.id)).size).toBe(
    22,
  );
  expect(
    rows.every(
      (row) =>
        row.rating >= 1 &&
        row.rating <= 5 &&
        row.matches === row.wins + row.losses + row.draws,
    ),
  ).toBe(true);
  expect(() => createParticipants(500000)).toThrow(RangeError);
});
