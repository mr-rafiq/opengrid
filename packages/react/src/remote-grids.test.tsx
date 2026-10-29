// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  ServerSideRowModel,
  LiveViewportRowModel,
  type ServerRequest,
  type ServerResponse,
  type ViewportRequest,
  type Column,
} from "@opengrid/core";
import { ServerDataGrid, LiveViewportDataGrid } from "./remote-grids.js";
afterEach(cleanup);
type Item = { name: string; price: number };
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Name", pinned: "left", width: 160 },
  { id: "price", field: "price", header: "Price", type: "number", width: 120 },
];
const leaf = (id: string, price = 1) => ({
  kind: "row" as const,
  id,
  data: { name: id, price },
});
function serverFixture() {
  const getRows = vi.fn(
    async (request: ServerRequest): Promise<ServerResponse<Item>> => {
      if (!request.groupKeys.length)
        return {
          nodes: [
            {
              kind: "group",
              id: "east",
              key: "East",
              childCount: 3,
              aggregates: { price: 60 },
            },
          ],
          rowCount: 1,
        };
      const rows = [leaf("zebra", 30), leaf("alpha", 10), leaf("middle", 20)];
      return {
        nodes: rows.slice(request.startRow, request.endRow),
        rowCount: 3,
      };
    },
  );
  return {
    model: new ServerSideRowModel<Item>(
      { getRows },
      { blockSize: 2, query: { rowGroupColumns: ["region"] } },
    ),
    getRows,
  };
}
function serverCell(id: string, columnId: string) {
  return document.querySelector<HTMLDivElement>(
    `[data-row-id="${id}"][data-column-id="${columnId}"]`,
  )!;
}
function viewportFixture() {
  const requests: ViewportRequest<Item>[] = [];
  const cleanups: ReturnType<typeof vi.fn>[] = [];
  const source = {
    subscribe: vi.fn((request: ViewportRequest<Item>) => {
      requests.push(request);
      const cleanup = vi.fn();
      cleanups.push(cleanup);
      return cleanup;
    }),
  };
  return {
    model: new LiveViewportRowModel<Item>(source, { buffer: 2 }),
    requests,
    cleanups,
    source,
  };
}
function liveCell(index: number, columnId: string) {
  return document.querySelector<HTMLDivElement>(
    `[data-viewport-row="${index}"][data-column-id="${columnId}"]`,
  )!;
}

describe("server-authoritative React block binding", () => {
  it("does not transfer loaded-page selection between routes that reuse a node ID", async () => {
    const model = new ServerSideRowModel<Item>({
      getRows: async (request) =>
        request.groupKeys.length
          ? { nodes: [leaf("same")], rowCount: 1 }
          : {
              nodes: [{ kind: "group", id: "same", key: "East" }],
              rowCount: 1,
            },
    });
    render(<ServerDataGrid model={model} columns={columns} />);
    await screen.findByRole("button", { name: "Open group East" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row same" }));
    expect(screen.getByText("1 selected on this loaded page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open group East" }));
    await waitFor(() =>
      expect(serverCell("same", "name")?.textContent).toBe("same"),
    );
    expect(screen.getByText("0 selected on this loaded page")).toBeTruthy();
  });
  it("reloads an externally invalidated active block even when query values are unchanged", async () => {
    const getRows = vi.fn(async (): Promise<ServerResponse<Item>> => ({
      nodes: [leaf("a")],
      rowCount: 1,
    }));
    const model = new ServerSideRowModel<Item>({ getRows });
    render(<ServerDataGrid model={model} columns={columns} />);
    await waitFor(() => expect(serverCell("a", "name")).toBeTruthy());
    act(() => model.setQuery({}));
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(serverCell("a", "name")).toBeTruthy());
  });
  it("loads roots, drills group routes, pages provider blocks and navigates breadcrumbs", async () => {
    const { model, getRows } = serverFixture();
    render(
      <ServerDataGrid model={model} columns={columns} ariaLabel="Orders" />,
    );
    await screen.findByRole("button", { name: "Open group East" });
    expect(screen.getByText("1 rows at this route")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open group East" }));
    await waitFor(() =>
      expect(serverCell("zebra", "name")?.textContent).toBe("zebra"),
    );
    expect(getRows.mock.calls.at(-1)?.[0]).toMatchObject({
      groupKeys: ["East"],
      startRow: 0,
      endRow: 2,
    });
    expect(screen.getByText("Server page 1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next server page" }));
    await waitFor(() =>
      expect(serverCell("middle", "name")?.textContent).toBe("middle"),
    );
    expect(screen.getByText("Server page 2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All groups" }));
    await screen.findByRole("button", { name: "Open group East" });
    expect(
      screen
        .getByRole("button", { name: "Next server page" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("forwards sorting and filtering without locally reordering or excluding provider rows", async () => {
    const getRows = vi.fn(async (): Promise<ServerResponse<Item>> => ({
      nodes: [leaf("zebra", 30), leaf("alpha", 10)],
      rowCount: 2,
    }));
    const model = new ServerSideRowModel<Item>({ getRows }, { blockSize: 2 });
    render(<ServerDataGrid model={model} columns={columns} />);
    await waitFor(() => expect(serverCell("zebra", "name")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sort Name" }));
    await waitFor(() => expect(getRows.mock.calls.length).toBe(2));
    expect(model.getQuery().sorting).toEqual([
      { columnId: "name", direction: "asc" },
    ]);
    await waitFor(() => expect(serverCell("zebra", "name")).toBeTruthy());
    const visible = Array.from(
      document.querySelectorAll('[data-column-id="name"]'),
    ).map((cell) => cell.textContent);
    expect(visible).toEqual(["zebra", "alpha"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter Name" }), {
      target: { value: "NOT_A_MATCH" },
    });
    await waitFor(() => expect(getRows.mock.calls.length).toBe(3));
    expect(model.getQuery().filters).toEqual({
      name: { op: "contains", value: "NOT_A_MATCH" },
    });
    await waitFor(() => expect(serverCell("zebra", "name")).toBeTruthy());
  });
  it("reflects initialized and externally changed authoritative query state and detaches getter copies", async () => {
    const getRows = vi.fn(async (): Promise<ServerResponse<Item>> => ({
      nodes: [leaf("a")],
      rowCount: 1,
    }));
    const model = new ServerSideRowModel<Item>(
      { getRows },
      {
        query: {
          sorting: [{ columnId: "price", direction: "desc" }],
          filters: { name: { op: "contains", value: "a" } },
        },
      },
    );
    const copy = model.getQuery();
    copy.sorting[0].direction = "asc";
    copy.filters.name.value = "mutated";
    expect(model.getQuery().sorting[0].direction).toBe("desc");
    expect(model.getQuery().filters.name.value).toBe("a");
    render(<ServerDataGrid model={model} columns={columns} />);
    await screen.findByText("a");
    expect(
      screen
        .getByRole("button", { name: "Sort Price" })
        .closest('[role="columnheader"]')
        ?.getAttribute("aria-sort"),
    ).toBe("descending");
    expect(
      (screen.getByRole("textbox", { name: "Filter Name" }) as HTMLInputElement)
        .value,
    ).toBe("a");
    act(() =>
      model.setQuery({
        sorting: [{ columnId: "name", direction: "asc" }],
        filters: {},
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Sort Name" })
          .closest('[role="columnheader"]')
          ?.getAttribute("aria-sort"),
      ).toBe("ascending"),
    );
    expect(
      (screen.getByRole("textbox", { name: "Filter Name" }) as HTMLInputElement)
        .value,
    ).toBe("");
  });
  it("retries failures and keeps local column controls and loaded-page selection", async () => {
    const getRows = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ nodes: [leaf("a")], rowCount: 1 });
    const model = new ServerSideRowModel<Item>({ getRows });
    render(<ServerDataGrid model={model} columns={columns} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry server rows" }));
    await waitFor(() => expect(serverCell("a", "name")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row a" }));
    expect(screen.getByText("1 selected on this loaded page")).toBeTruthy();
    fireEvent.click(
      screen.getByText("Server columns", { selector: "summary" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show server Price" }),
    );
    expect(screen.queryByRole("button", { name: "Sort Price" })).toBeNull();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Pin server Name" }),
      { target: { value: "right" } },
    );
    expect(serverCell("a", "name").style.right).toBe("0px");
  });
  it("resets to the first provider block on query changes", async () => {
    const { model, getRows } = serverFixture();
    render(<ServerDataGrid model={model} columns={columns} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Open group East" }),
    );
    await waitFor(() => expect(serverCell("zebra", "name")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Next server page" }));
    await waitFor(() => expect(serverCell("middle", "name")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sort Price" }));
    await waitFor(() =>
      expect(getRows.mock.calls.at(-1)?.[0].startRow).toBe(0),
    );
    await waitFor(() =>
      expect(screen.getByText("Server page 1 of 2")).toBeTruthy(),
    );
  });
  it("does not dispose or abort the caller-owned model on unmount and ignores late UI results", async () => {
    let finish!: (response: ServerResponse<Item>) => void;
    let request!: ServerRequest;
    const model = new ServerSideRowModel<Item>({
      getRows: (r) => {
        request = r;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    const view = render(<ServerDataGrid model={model} columns={columns} />);
    await waitFor(() => expect(request).toBeTruthy());
    view.unmount();
    expect(request.signal.aborted).toBe(false);
    await act(async () => {
      finish({ nodes: [leaf("late")], rowCount: 1 });
      await model.loadBlock([], 0);
    });
    expect(model.getSnapshot().blocks[0].response.nodes[0].id).toBe("late");
  });
});

describe("React live sparse viewport", () => {
  it("renders real provider pushes and updates existing cells without remounting focus", () => {
    const { model, requests } = viewportFixture();
    render(
      <LiveViewportDataGrid
        model={model}
        columns={columns}
        height={240}
        ariaLabel="Live orders"
      />,
    );
    act(() => {
      requests[0].onRowCount(1000);
      requests[0].onRows([
        { index: 0, id: "a", data: { name: "First", price: 10 } },
      ]);
    });
    expect(liveCell(0, "name").textContent).toBe("First");
    act(() => liveCell(0, "price").focus());
    const focused = document.activeElement;
    act(() =>
      requests
        .at(-1)!
        .onRows([{ index: 0, id: "a", data: { name: "First", price: 99 } }]),
    );
    expect(liveCell(0, "price").textContent).toBe("99");
    expect(document.activeElement).toBe(focused);
    expect(
      screen
        .getByRole("grid", { name: "Live orders" })
        .getAttribute("aria-rowcount"),
    ).toBe("1001");
  });
  it("keeps DOM and physical scroll height bounded for a million rows", () => {
    const { model, requests } = viewportFixture();
    render(
      <LiveViewportDataGrid model={model} columns={columns} height={240} />,
    );
    act(() => requests[0].onRowCount(1_000_000));
    expect(
      document.querySelectorAll("[data-viewport-row]").length,
    ).toBeLessThan(50);
    expect(
      Number(
        (
          document.querySelector(".og-live-viewport .og-body") as HTMLDivElement
        ).style.height.replace("px", ""),
      ),
    ).toBeLessThanOrEqual(8_000_000);
  });
  it("navigates to the last logical row through the scaled scroll space and loads its new window", () => {
    const { model, requests } = viewportFixture();
    render(
      <LiveViewportDataGrid model={model} columns={columns} height={240} />,
    );
    act(() => requests[0].onRowCount(1_000_000));
    act(() => liveCell(0, "name").focus());
    fireEvent.keyDown(liveCell(0, "name"), { key: "End", ctrlKey: true });
    expect(document.activeElement).toBe(liveCell(999999, "price"));
    expect(requests.at(-1)?.endRow).toBe(1_000_000);
    expect(requests.at(-1)!.startRow).toBeGreaterThan(999900);
    act(() =>
      requests.at(-1)!.onRows([
        {
          index: 999999,
          id: "last",
          data: { name: "Last order", price: 777 },
        },
      ]),
    );
    expect(liveCell(999999, "price").textContent).toBe("777");
    expect(document.activeElement).toBe(liveCell(999999, "price"));
  });
  it("retries failed streams and rejects late events from prior windows", () => {
    const { model, requests, cleanups } = viewportFixture();
    render(
      <LiveViewportDataGrid model={model} columns={columns} height={240} />,
    );
    act(() => {
      requests[0].onRowCount(1000);
      requests[0].onError(new Error("offline"));
    });
    expect(screen.getByRole("alert").textContent).toContain("offline");
    fireEvent.click(screen.getByRole("button", { name: "Retry live rows" }));
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    act(() =>
      requests[0].onRows([
        { index: 0, id: "stale", data: { name: "Stale", price: 1 } },
      ]),
    );
    expect(screen.queryByText("Stale")).toBeNull();
    act(() =>
      requests
        .at(-1)!
        .onRows([{ index: 0, id: "fresh", data: { name: "Fresh", price: 2 } }]),
    );
    expect(liveCell(0, "name").textContent).toBe("Fresh");
  });
  it("maintains an empty-dataset count stream and resumes rows after server growth", async () => {
    const { model, requests } = viewportFixture();
    render(
      <LiveViewportDataGrid model={model} columns={columns} height={240} />,
    );
    await act(async () => {
      requests[0].onRowCount(0);
      await Promise.resolve();
    });
    expect(screen.getByText("No live rows")).toBeTruthy();
    expect(requests.at(-1)?.signal.aborted).toBe(false);
    await act(async () => {
      requests.at(-1)!.onRowCount(2);
      await Promise.resolve();
    });
    act(() =>
      requests
        .at(-1)!
        .onRows([{ index: 0, id: "new", data: { name: "New row", price: 3 } }]),
    );
    expect(liveCell(0, "name").textContent).toBe("New row");
  });
  it("windows hundreds of columns while retaining pinned columns and absolute ARIA indices", () => {
    const { model, requests } = viewportFixture();
    const wide: Column<Item>[] = [
      { id: "name", field: "name", pinned: "left", width: 100 },
      ...Array.from({ length: 200 }, (_, index): Column<Item> => ({
        id: `c${index}`,
        valueGetter: (row) => row.price,
        width: 100,
      })),
      { id: "price", field: "price", pinned: "right", width: 100 },
    ];
    render(<LiveViewportDataGrid model={model} columns={wide} height={240} />);
    act(() => {
      requests[0].onRowCount(100);
      requests[0].onRows([
        { index: 0, id: "a", data: { name: "A", price: 2 } },
      ]);
    });
    expect(screen.getAllByRole("columnheader").length).toBeLessThan(20);
    expect(liveCell(0, "name").style.left).toBe("0px");
    expect(liveCell(0, "price").style.right).toBe("0px");
    expect(liveCell(0, "price").getAttribute("aria-colindex")).toBe("202");
  });
  it("unsubscribes React observers without disposing the caller-owned live stream", () => {
    const { model, requests, cleanups } = viewportFixture();
    const view = render(
      <LiveViewportDataGrid model={model} columns={columns} />,
    );
    view.unmount();
    expect(cleanups[0]).not.toHaveBeenCalled();
    expect(requests[0].signal.aborted).toBe(false);
    act(() =>
      requests[0].onRows([
        { index: 0, id: "after", data: { name: "After", price: 1 } },
      ]),
    );
    expect(model.getSnapshot().rows[0].data.name).toBe("After");
    model.dispose();
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
  });
});
