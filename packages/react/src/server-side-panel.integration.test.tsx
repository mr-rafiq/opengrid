// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  ServerSideRowModel,
  type Column,
  type ServerNode,
  type ServerRequest,
} from "@opengrid/core";
import { ServerSidePanel } from "./server-side-panel";
import { ServerTreeDataGrid } from "./server-tree-grid";
import { ServerDataGrid } from "./remote-grids";
import { COLUMN_DRAG_OWNER, columnDragOwner } from "./group-panel";
type Row = { name: string; team: string; amount: number };
const rows: Row[] = [
  { name: "First", team: "A", amount: 10 },
  { name: "Second", team: "A", amount: 20 },
];
const owned: ServerSideRowModel<Row>[] = [];
afterEach(() => {
  cleanup();
  for (const model of owned.splice(0)) model.dispose();
});
function setup(kind: "tree" | "breadcrumb" = "tree") {
  const requests: ServerRequest[] = [];
  const leaf = vi.fn((value: unknown, row: Row) => {
    expect(
      rows.includes(row) ||
        rows.some((item) => item.name === row.name && item.team === row.team),
    ).toBe(true);
    return `Leaf ${value}`;
  });
  const aggregate = vi.fn((value: unknown, context: { aggregate?: unknown }) =>
    context.aggregate === "count"
      ? `Count ${value}`
      : `USD ${Number(value).toFixed(2)}`,
  );
  const initial: Column<Row>[] = [
    { id: "name", field: "name", header: "Name", width: 170 },
    { id: "team", field: "team", header: "Team", width: 100, hidden: true },
    {
      id: "amount",
      field: "amount",
      header: "Amount",
      type: "number",
      groupable: false,
      width: 140,
      valueFormatter: leaf,
      aggregateFormatter: aggregate,
    },
  ];
  const model = new ServerSideRowModel<Row>(
    {
      getRows: async (request) => {
        requests.push(request);
        const operation = request.valueColumns.find(
          (value) => value.columnId === "amount",
        )?.aggregate;
        const value = operation === "avg" ? 15 : operation === "count" ? 2 : 30;
        const nodes: ServerNode<Row>[] = request.rowGroupColumns.length
          ? [
              {
                kind: "group",
                id: "a",
                key: "A",
                label: "Team A",
                childCount: 2,
                aggregates: { amount: value },
              },
            ]
          : rows.map((data, index) => ({
              kind: "row",
              id: String(index),
              data,
            }));
        return { nodes, rowCount: nodes.length };
      },
    },
    {
      query: {
        rowGroupColumns: ["team"],
        valueColumns: [{ columnId: "amount", aggregate: "sum" }],
      },
    },
  );
  owned.push(model);
  function Host() {
    const [columns, setColumns] = useState(initial);
    return (
      <>
        <ServerSidePanel
          model={model}
          columns={columns}
          onColumnsChange={setColumns}
        />
        {kind === "tree" ? (
          <ServerTreeDataGrid
            model={model}
            columns={columns}
            ariaLabel="Bound server"
          />
        ) : (
          <ServerDataGrid
            model={model}
            columns={columns}
            onColumnsChange={setColumns}
            notes={false}
            ariaLabel="Bound server"
          />
        )}
      </>
    );
  }
  const view = render(<Host />);
  return { view, model, requests, leaf, aggregate };
}
for (const kind of ["tree", "breadcrumb"] as const)
  it(`${kind}: actual query refreshes currency/count cells and leaf callbacks only see real rows`, async () => {
    const { model, requests, leaf, aggregate } = setup(kind);
    await screen.findByText("USD 30.00");
    expect(leaf).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Values: Amount" }), {
      target: { value: "avg" },
    });
    await screen.findByText("USD 15.00");
    expect(requests.at(-1)!.valueColumns[0].aggregate).toBe("avg");
    fireEvent.change(screen.getByRole("combobox", { name: "Values: Amount" }), {
      target: { value: "count" },
    });
    await screen.findByText("Count 2");
    expect(aggregate.mock.lastCall![1].aggregate).toBe("count");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove grouping Team" }),
    );
    await screen.findByText("Leaf 10");
    expect(model.getQuery().rowGroupColumns).toEqual([]);
    expect(leaf).toHaveBeenCalled();
  });
it("tree: controlled visibility retains resized widths, loaded branches and a shared header drag owner", async () => {
  const { view, model, requests } = setup();
  await screen.findByText("USD 30.00");
  const grid = screen.getByRole("treegrid", { name: "Bound server" });
  const header = () =>
    within(grid)
      .getByRole("button", { name: "Sort Amount" })
      .closest<HTMLElement>(".og-header-cell")!;
  const before = parseFloat(header().style.width);
  const resize = within(grid).getByRole("separator", { name: "Resize Amount" });
  fireEvent.keyDown(resize, { key: "ArrowRight" });
  const width = header().style.width;
  expect(parseFloat(width)).toBeGreaterThan(before);
  const requestCount = requests.length;
  const revision = model.getSnapshot().queryRevision;
  fireEvent.click(screen.getByRole("checkbox", { name: "Team" }));
  await waitFor(() =>
    expect(
      within(grid).getByRole("button", { name: "Sort Team" }),
    ).not.toBeNull(),
  );
  expect(header().style.width).toBe(width);
  expect(model.getSnapshot().queryRevision).toBe(revision);
  expect(requests).toHaveLength(requestCount);
  const data = new Map<string, string>();
  fireEvent.dragStart(within(grid).getByRole("button", { name: "Sort Team" }), {
    dataTransfer: {
      setData: (key: string, value: string) => data.set(key, value),
    },
  });
  expect(data.get(COLUMN_DRAG_OWNER)).toBe(columnDragOwner(model));
  expect(view.container.querySelector(".og-server-side-panel")).not.toBeNull();
});
it("breadcrumb: chooser visibility mirrors the panel, which can restore the column", async () => {
  const { view, requests } = setup("breadcrumb");
  await screen.findByText("USD 30.00");
  fireEvent.click(view.container.querySelector(".og-remote-server summary")!);
  const show = screen.getByRole("checkbox", { name: "Show server Amount" });
  fireEvent.click(show);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Amount",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false),
  );
  expect(screen.queryByRole("button", { name: "Sort Amount" })).toBeNull();
  const count = requests.length;
  fireEvent.click(screen.getByRole("checkbox", { name: "Amount" }));
  await screen.findByRole("button", { name: "Sort Amount" });
  await screen.findByText("USD 30.00");
  expect(requests).toHaveLength(count);
});
