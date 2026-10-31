// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ServerSideRowModel,
  type Column,
  type ServerRequest,
  type ServerResponse,
} from "@opengrid/core";
import { ServerTreeDataGrid } from "./server-tree-grid";
import { ServerDataGrid } from "./remote-grids";
afterEach(cleanup);
type Row = { name: string; amount: number };
const columns: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", width: 180, pinned: "left" },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    width: 120,
  },
];
const root: ServerResponse<Row> = {
  nodes: [
    {
      kind: "group",
      id: "same",
      key: "A",
      childCount: 1,
      aggregates: { amount: 100 },
    },
    {
      kind: "group",
      id: "other",
      key: "B",
      childCount: 1,
      aggregates: { amount: 200 },
    },
  ],
  rowCount: 2,
};
const provider = async ({
  groupKeys,
}: ServerRequest): Promise<ServerResponse<Row>> =>
  groupKeys.length
    ? {
        nodes: [
          {
            kind: "row",
            id: "same",
            data: { name: `Leaf ${groupKeys.join("/")}`, amount: 1 },
          },
        ],
        rowCount: 1,
      }
    : root;
const make = (maxBlocks = 5) =>
  new ServerSideRowModel(
    { getRows: provider },
    { blockSize: 2, maxBlocks, query: { rowGroupColumns: ["name"] } },
  );
const expand = (name: string) =>
  screen.getByRole("button", { name: `Expand ${name}` });
describe("simultaneously expanded server branches", () => {
  it("keeps two branches and reused route-local IDs visible without recomputing provider aggregates", async () => {
    const source = vi.fn(provider);
    const model = new ServerSideRowModel(
      { getRows: source },
      { blockSize: 2, maxBlocks: 3 },
    );
    render(<ServerTreeDataGrid model={model} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await screen.findByText("Leaf A");
    fireEvent.click(expand("B"));
    await screen.findByText("Leaf B");
    expect(screen.getByText("Leaf A")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(source).toHaveBeenCalledTimes(3);
    expect(
      document.querySelectorAll("[data-column-id=name][data-row-id]"),
    ).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Collapse A" }));
    expect(screen.queryByText("Leaf A")).toBeNull();
    expect(screen.getByText("Leaf B")).toBeTruthy();
    fireEvent.click(expand("A"));
    await screen.findByText("Leaf A");
    expect(source).toHaveBeenCalledTimes(3);
  });
  it("refuses over-capacity expansion without evicting an open sibling and releases reservations on unmount", async () => {
    const model = make(2);
    const view = render(<ServerTreeDataGrid model={model} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await screen.findByText("Leaf A");
    fireEvent.click(expand("B"));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/capacity/);
    expect(screen.getByText("Leaf A")).toBeTruthy();
    expect(expand("B")).toBeTruthy();
    view.unmount();
    expect(() =>
      model.setActiveBlocks({}, [
        { groupKeys: ["C"], blockIndex: 0 },
        { groupKeys: ["D"], blockIndex: 0 },
      ]),
    ).not.toThrow();
  });
  it("uses native per-branch paging and keeps other open branches", async () => {
    const model = new ServerSideRowModel<Row>(
      {
        getRows: async (request) =>
          request.groupKeys.length
            ? {
                nodes: Array.from(
                  { length: Math.min(2, 3 - request.startRow) },
                  (_, i) => ({
                    kind: "row" as const,
                    id: String(request.startRow + i),
                    data: {
                      name: `${request.groupKeys[0]} ${request.startRow + i}`,
                      amount: 1,
                    },
                  }),
                ),
                rowCount: 3,
              }
            : root,
      },
      { blockSize: 2, maxBlocks: 5 },
    );
    render(<ServerTreeDataGrid model={model} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await screen.findByText("A 0");
    fireEvent.click(expand("B"));
    await screen.findByText("B 0");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Load more in this branch" })[0],
    );
    await screen.findByText("A 2");
    expect(screen.getByText("B 0")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Load more in this branch" }),
    ).toHaveLength(1);
  });
  it("retains a failed branch alongside a successful sibling and retries the actual provider", async () => {
    let fail = true;
    const source = vi.fn(async (request: ServerRequest) => {
      if (request.groupKeys[0] === "A" && fail) throw Error("Offline A");
      return provider(request);
    });
    const model = new ServerSideRowModel(
      { getRows: source },
      { blockSize: 2, maxBlocks: 3 },
    );
    render(<ServerTreeDataGrid model={model} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await screen.findByText("Offline A");
    fireEvent.click(expand("B"));
    await screen.findByText("Leaf B");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Leaf A");
    expect(screen.getByText("Leaf B")).toBeTruthy();
    expect(
      source.mock.calls.filter(([request]) => request.groupKeys[0] === "A"),
    ).toHaveLength(2);
  });
  it("resets all branches on same-query reset and fences late former-query responses", async () => {
    let resolve!: (response: ServerResponse<Row>) => void;
    const source = vi.fn(async (request: ServerRequest) =>
      request.groupKeys.length
        ? await new Promise<ServerResponse<Row>>((yes) => (resolve = yes))
        : root,
    );
    const model = new ServerSideRowModel(
      { getRows: source },
      { blockSize: 2, maxBlocks: 3, maxConcurrentRequests: 2 },
    );
    render(<ServerTreeDataGrid model={model} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await waitFor(() => expect(source).toHaveBeenCalledTimes(2));
    act(() => model.setQuery({}));
    await waitFor(() => expect(source).toHaveBeenCalledTimes(3));
    await screen.findByRole("button", { name: "Expand A" });
    await act(async () =>
      resolve({
        nodes: [
          { kind: "row", id: "old", data: { name: "Stale leaf", amount: 1 } },
        ],
        rowCount: 1,
      }),
    );
    expect(screen.queryByText("Stale leaf")).toBeNull();
    expect(screen.queryByRole("button", { name: "Collapse A" })).toBeNull();
  });
  it("sends sorting/filtering to the provider and supports StrictMode cleanup", async () => {
    const model = make();
    const view = render(
      <StrictMode>
        <ServerTreeDataGrid model={model} columns={columns} />
      </StrictMode>,
    );
    await screen.findByRole("button", { name: "Expand A" });
    fireEvent.click(screen.getByRole("button", { name: "Sort Amount" }));
    await waitFor(() =>
      expect(model.getQuery().sorting).toEqual([
        { columnId: "amount", direction: "asc" },
      ]),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Filter Name" }), {
      target: { value: "West" },
    });
    await waitFor(() =>
      expect(model.getQuery().filters.name).toEqual({
        op: "contains",
        value: "West",
      }),
    );
    view.unmount();
    expect(() =>
      model.setActiveBlocks({}, [
        { groupKeys: ["C"], blockIndex: 0 },
        { groupKeys: ["D"], blockIndex: 0 },
        { groupKeys: ["E"], blockIndex: 0 },
        { groupKeys: ["F"], blockIndex: 0 },
        { groupKeys: ["G"], blockIndex: 0 },
      ]),
    ).not.toThrow();
  });
  it("collapses nested descendants independently from a sibling route with reused keys", async () => {
    const model = new ServerSideRowModel<Row>(
      {
        getRows: async ({ groupKeys }) =>
          !groupKeys.length
            ? root
            : groupKeys.length === 1 && groupKeys[0] === "A"
              ? {
                  nodes: [
                    {
                      kind: "group",
                      id: "same",
                      key: "shared",
                      label: "Inner",
                      childCount: 1,
                    },
                  ],
                  rowCount: 1,
                }
              : {
                  nodes: [
                    {
                      kind: "row",
                      id: "same",
                      data: {
                        name: groupKeys.length === 2 ? "Nested A" : "Leaf B",
                        amount: 1,
                      },
                    },
                  ],
                  rowCount: 1,
                },
      },
      { blockSize: 2, maxBlocks: 4 },
    );
    render(<ServerTreeDataGrid model={model} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Expand Inner" }),
    );
    await screen.findByText("Nested A");
    fireEvent.click(expand("B"));
    await screen.findByText("Leaf B");
    fireEvent.click(screen.getByRole("button", { name: "Collapse A" }));
    expect(screen.queryByText("Nested A")).toBeNull();
    expect(screen.getByText("Leaf B")).toBeTruthy();
    fireEvent.click(expand("A"));
    await screen.findByRole("button", { name: "Expand Inner" });
    expect(screen.queryByText("Nested A")).toBeNull();
  });
  it("does not resurrect an earlier query's saved error when its branch is reopened", async () => {
    let offline = true;
    const model = new ServerSideRowModel<Row>(
      {
        getRows: async (request) => {
          if (request.groupKeys[0] === "A" && offline)
            throw Error("Former query error");
          return provider(request);
        },
      },
      { blockSize: 2, maxBlocks: 3 },
    );
    render(<ServerTreeDataGrid model={model} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await screen.findByText("Former query error");
    offline = false;
    act(() => model.setQuery({}));
    await screen.findByRole("button", { name: "Expand A" });
    fireEvent.click(screen.getByRole("button", { name: "Expand A" }));
    await screen.findByText("Leaf A");
    expect(screen.queryByText("Former query error")).toBeNull();
  });

  it("does not carry saved errors into a replacement model", async () => {
    const old = new ServerSideRowModel<Row>(
      {
        getRows: async (request) => {
          if (request.groupKeys.length) throw Error("Old model failure");
          return root;
        },
      },
      { blockSize: 2, maxBlocks: 3 },
    );
    const view = render(<ServerTreeDataGrid model={old} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await screen.findByText("Old model failure");
    view.rerender(<ServerTreeDataGrid model={make()} columns={columns} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand A" }));
    await screen.findByText("Leaf A");
    expect(screen.queryByText("Old model failure")).toBeNull();
  });
  for (const Component of [ServerTreeDataGrid, ServerDataGrid])
    it(`preserves owned special-name column filters in ${Component.name}`, async () => {
      const model = make();
      const special: Column<Row>[] = [
        { id: "constructor", field: "name", header: "Constructor" },
        { id: "__proto__", field: "name", header: "Prototype" },
      ];
      render(<Component model={model} columns={special} />);
      await waitFor(() => expect(model.getSnapshot().blocks).toHaveLength(1));
      fireEvent.change(
        screen.getByRole("textbox", { name: "Filter Constructor" }),
        { target: { value: "first" } },
      );
      await waitFor(() =>
        expect(Object.hasOwn(model.getQuery().filters, "constructor")).toBe(
          true,
        ),
      );
      fireEvent.change(
        screen.getByRole("textbox", { name: "Filter Prototype" }),
        { target: { value: "second" } },
      );
      await waitFor(() =>
        expect(Object.hasOwn(model.getQuery().filters, "__proto__")).toBe(true),
      );
      expect(model.getQuery().filters["__proto__"]).toEqual({
        op: "contains",
        value: "second",
      });
      fireEvent.change(
        screen.getByRole("textbox", { name: "Filter Constructor" }),
        { target: { value: "" } },
      );
      await waitFor(() =>
        expect(Object.hasOwn(model.getQuery().filters, "constructor")).toBe(
          false,
        ),
      );
      expect(model.getQuery().filters["__proto__"]).toEqual({
        op: "contains",
        value: "second",
      });
    });
});
