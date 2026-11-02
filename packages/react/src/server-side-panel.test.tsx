// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  ServerSideRowModel,
  type Column,
  type ServerRequest,
} from "@opengrid/core";
import { ServerSidePanel } from "./server-side-panel";
import { COLUMN_DRAG_OWNER, columnDragOwner } from "./group-panel";
type Row = { name: string; team: string; amount: number };
const fields: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", groupPath: ["Participant"] },
  { id: "team", field: "team", header: "Team", groupPath: ["Participant"] },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    groupable: false,
    groupPath: ["Performance"],
  },
];
const models: ServerSideRowModel<Row>[] = [];
afterEach(() => {
  cleanup();
  for (const model of models.splice(0)) model.dispose();
});
function setup() {
  const requests: ServerRequest[] = [];
  const model = new ServerSideRowModel<Row>(
    {
      getRows: async (request) => {
        requests.push(request);
        return { nodes: [], rowCount: 0 };
      },
    },
    {
      query: {
        rowGroupColumns: ["team"],
        valueColumns: [{ columnId: "amount", aggregate: "sum" }],
      },
    },
  );
  models.push(model);
  const changes = vi.fn();
  function Host() {
    const [columns, setColumns] = useState(fields);
    return (
      <ServerSidePanel
        model={model}
        columns={columns}
        onColumnsChange={(next) => {
          changes(next);
          setColumns(next);
        }}
      />
    );
  }
  const view = render(<Host />);
  return { model, requests, changes, view };
}
it("publishes native grouping and aggregation changes into actual provider requests", async () => {
  const { model, requests } = setup();
  fireEvent.change(screen.getByRole("combobox", { name: "Column to group" }), {
    target: { value: "name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add group" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Values: Amount" }), {
    target: { value: "avg" },
  });
  await act(async () => {
    await model.loadBlock([], 0);
  });
  expect(requests.at(-1)!.rowGroupColumns).toEqual(["team", "name"]);
  expect(requests.at(-1)!.valueColumns).toEqual([
    { columnId: "amount", aggregate: "avg" },
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: "Move grouping Name earlier" }),
  );
  expect(model.getQuery().rowGroupColumns).toEqual(["name", "team"]);
  fireEvent.click(screen.getByRole("button", { name: "Remove grouping Team" }));
  expect(model.getQuery().rowGroupColumns).toEqual(["name"]);
});
it("keeps visibility application-owned without issuing a provider query", () => {
  const { model, changes, requests } = setup();
  const revision = model.getSnapshot().queryRevision;
  fireEvent.click(screen.getByRole("checkbox", { name: "Name" }));
  expect(
    changes.mock.lastCall![0].find(
      (column: Column<Row>) => column.id === "name",
    ).hidden,
  ).toBe(true);
  expect(model.getSnapshot().queryRevision).toBe(revision);
  expect(requests).toHaveLength(0);
});
it("preserves external query fields and unknown aggregate names until their own field changes", () => {
  const { model } = setup();
  act(() =>
    model.setQuery({
      rowGroupColumns: ["external", "team"],
      valueColumns: [
        { columnId: "external", aggregate: "custom" },
        { columnId: "amount", aggregate: "median" },
      ],
      filters: JSON.parse('{"__proto__":{"op":"equals","value":"x"}}'),
    }),
  );
  expect(
    screen.getByText("Some grouped fields are outside this column list."),
  ).not.toBeNull();
  expect(
    (
      screen.getByRole("combobox", {
        name: "Values: Amount",
      }) as HTMLSelectElement
    ).value,
  ).toBe("median");
  fireEvent.change(screen.getByRole("combobox", { name: "Values: Amount" }), {
    target: { value: "count" },
  });
  expect(model.getQuery().valueColumns).toEqual([
    { columnId: "external", aggregate: "custom" },
    { columnId: "amount", aggregate: "count" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Group by Name" }));
  expect(model.getQuery().rowGroupColumns).toEqual([
    "external",
    "team",
    "name",
  ]);
  expect(Object.hasOwn(model.getQuery().filters, "__proto__")).toBe(true);
});
it("accepts only this provider's drags and refuses non-groupable fields", () => {
  const { model, view } = setup();
  const zone = view.container.querySelector(".og-group-panel")!;
  const transfer = (owner: string, key: string) => ({
    types: [COLUMN_DRAG_OWNER],
    getData: (type: string) => (type === COLUMN_DRAG_OWNER ? owner : key),
  });
  fireEvent.drop(zone, { dataTransfer: transfer("other", "name") });
  expect(model.getQuery().rowGroupColumns).toEqual(["team"]);
  fireEvent.drop(zone, {
    dataTransfer: transfer(columnDragOwner(model), "amount"),
  });
  expect(model.getQuery().rowGroupColumns).toEqual(["team"]);
  fireEvent.drop(zone, {
    dataTransfer: transfer(columnDragOwner(model), "name"),
  });
  expect(model.getQuery().rowGroupColumns).toEqual(["team", "name"]);
});
it("applies staged typed conditions to the provider without a resident-row model", async () => {
  const { model, requests } = setup();
  fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filters: Amount" }));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Operator for condition 1" }),
    { target: { value: "gte" } },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Value for condition 1" }),
    { target: { value: "10" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply conditions" }));
  expect(model.getQuery().filters.amount).toEqual({ op: "gte", value: 10 });
  await act(async () => {
    await model.loadBlock([], 0);
  });
  expect(requests.at(-1)!.filters.amount).toEqual({ op: "gte", value: 10 });
});
it("cancels an open condition dialog when a different provider replaces its owner", () => {
  const { model, view } = setup();
  fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filters: Amount" }));
  const next = new ServerSideRowModel<Row>({
    getRows: async () => ({ nodes: [], rowCount: 0 }),
  });
  models.push(next);
  view.rerender(
    <ServerSidePanel
      model={next}
      columns={fields}
      onColumnsChange={() => {}}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(next.getQuery().filters).toEqual({});
  expect(model.getQuery().filters).toEqual({});
});
it("retains a retryable staged draft when provider query publication rejects", () => {
  const { model } = setup();
  fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filters: Amount" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Value for condition 1" }),
    { target: { value: "10" } },
  );
  const reject = vi.spyOn(model, "setQuery").mockImplementationOnce(() => {
    throw Error("Provider rejected query");
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply conditions" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Provider rejected query",
  );
  expect(screen.getByRole("dialog")).not.toBeNull();
  expect(model.getQuery().filters).toEqual({});
  reject.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Apply conditions" }));
  expect(model.getQuery().filters.amount).toEqual({ op: "equals", value: 10 });
  expect(screen.queryByRole("dialog")).toBeNull();
});
