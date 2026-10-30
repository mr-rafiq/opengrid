// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
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
  InfiniteRowModel,
  type Column,
  type DataRequest,
  type InfiniteResponse,
} from "@opengrid/core";
import { InfiniteDataGrid } from "./remote-grids.js";
import { GridLocaleProvider, esES } from "./locale.js";

afterEach(cleanup);
type Row = { id: string; name: string; amount: number };
const columns: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", pinned: "left", width: 160 },
  { id: "amount", field: "amount", header: "Amount", width: 140 },
];
const records = (start: number, end: number) =>
  Array.from({ length: Math.max(0, end - start) }, (_, offset) => ({
    id: `r${start + offset}`,
    name: `Record ${start + offset}`,
    amount: start + offset,
  }));
function fixture(count = 37, unknown = false) {
  const getRows = vi.fn(
    async ({
      startRow,
      endRow,
    }: DataRequest): Promise<InfiniteResponse<Row>> => ({
      rows: records(startRow, Math.min(endRow, count)),
      ...(unknown ? {} : { rowCount: count }),
    }),
  );
  const model = new InfiniteRowModel<Row>(
    { getRows },
    { getRowId: (r) => r.id, blockSize: 10, maxBlocks: 4 },
  );
  return { model, getRows };
}
const cell = (index: number, column = "name") =>
  document.querySelector<HTMLElement>(
    `[data-viewport-row="${index}"][data-column-id="${column}"]`,
  )!;

describe("pull-based infinite React binding", () => {
  it("renders actual provider blocks with a distinct default label and exact count", async () => {
    const { model, getRows } = fixture();
    render(<InfiniteDataGrid model={model} columns={columns} height={180} />);
    const grid = screen.getByRole("grid", { name: "Infinite data grid" });
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    expect(grid.getAttribute("aria-rowcount")).toBe("38");
    expect(getRows).toHaveBeenCalledTimes(1);
    expect(screen.getByText("37 rows")).toBeTruthy();
    expect(screen.queryByText("37 live rows")).toBeNull();
    expect(grid.querySelectorAll('[role="row"]').length).toBeLessThan(15);
  });
  it("extends an unknown count by scrolling through blocks and reaches a real terminal count", async () => {
    const { model, getRows } = fixture(35, true);
    render(<InfiniteDataGrid model={model} columns={columns} height={180} />);
    const grid = screen.getByRole("grid");
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    expect(grid.getAttribute("aria-rowcount")).toBe("-1");
    expect(model.getSnapshot().estimatedRowCount).toBe(20);
    for (const top of [360, 720, 1080]) {
      fireEvent.scroll(grid, { target: { scrollTop: top } });
      await waitFor(() => expect(model.getSnapshot().loading).toBe(false));
    }
    await waitFor(() => expect(grid.getAttribute("aria-rowcount")).toBe("36"));
    expect(model.getSnapshot().rowCount).toBe(35);
    expect(getRows.mock.calls.map(([request]) => request.startRow)).toEqual([
      0, 10, 20, 30,
    ]);
    expect(grid.querySelectorAll('[role="row"]').length).toBeLessThan(18);
  });
  it("keeps logical keyboard focus through a pending block and its eventual contents", async () => {
    let finish!: (response: InfiniteResponse<Row>) => void;
    const getRows = vi.fn(
      async ({ startRow }: DataRequest): Promise<InfiniteResponse<Row>> =>
        startRow === 0
          ? { rows: records(0, 10), rowCount: 100 }
          : new Promise((resolve) => {
              finish = resolve;
            }),
    );
    const model = new InfiniteRowModel<Row>(
      { getRows },
      { getRowId: (r) => r.id, blockSize: 10, maxBlocks: 4 },
    );
    render(<InfiniteDataGrid model={model} columns={columns} height={180} />);
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    cell(0).focus();
    fireEvent.keyDown(cell(0), { key: "End", ctrlKey: true });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    const target = cell(99, "amount");
    expect(document.activeElement).toBe(target);
    expect(target.getAttribute("aria-label")).toContain("Loading");
    expect(target.closest('[role="row"]')?.getAttribute("aria-busy")).toBe(
      "true",
    );
    await act(async () => finish({ rows: records(90, 100), rowCount: 100 }));
    await waitFor(() => expect(target.textContent).toBe("99"));
    expect(cell(99, "amount")).toBe(target);
    expect(document.activeElement).toBe(target);
  });
  it("uses bounded physical scrolling and DOM for a million exact-count rows", async () => {
    const getRows = vi.fn(async ({ startRow, endRow }: DataRequest) => ({
      rows: records(startRow, Math.min(endRow, 1_000_000)),
      rowCount: 1_000_000,
    }));
    const model = new InfiniteRowModel<Row>(
      { getRows },
      { getRowId: (r) => r.id, blockSize: 100, maxBlocks: 4 },
    );
    render(<InfiniteDataGrid model={model} columns={columns} height={180} />);
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    cell(0).focus();
    fireEvent.keyDown(cell(0), { key: "End", ctrlKey: true });
    await waitFor(() =>
      expect(cell(999999, "amount")?.textContent).toBe("999999"),
    );
    expect(document.activeElement).toBe(cell(999999, "amount"));
    expect(
      screen.getByRole("grid").querySelectorAll('[role="row"]').length,
    ).toBeLessThan(18);
    expect(
      getRows.mock.calls.some(([request]) => request.startRow === 999900),
    ).toBe(true);
  });
  it("surfaces failures and retries explicitly without a render-driven retry loop", async () => {
    const getRows = vi
      .fn()
      .mockRejectedValueOnce(new Error("Provider offline"))
      .mockResolvedValue({ rows: records(0, 3), rowCount: 3 });
    const model = new InfiniteRowModel<Row>(
      { getRows },
      { getRowId: (r) => r.id, blockSize: 10 },
    );
    const view = render(
      <InfiniteDataGrid model={model} columns={columns} height={180} />,
    );
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Provider offline");
    view.rerender(
      <InfiniteDataGrid model={model} columns={columns} height={180} />,
    );
    expect(getRows).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry infinite rows" }),
    );
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getRows).toHaveBeenCalledTimes(2);
  });
  it("refreshes an empty dataset into populated rows", async () => {
    const getRows = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValue({ rows: records(0, 3), rowCount: 3 });
    const model = new InfiniteRowModel<Row>(
      { getRows },
      { getRowId: (r) => r.id, blockSize: 10 },
    );
    render(<InfiniteDataGrid model={model} columns={columns} height={180} />);
    await screen.findByText("No rows");
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("1");
    act(() => model.refresh());
    await waitFor(() => expect(cell(2)?.textContent).toBe("Record 2"));
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("4");
  });
  it("preserves focused cells and cached data when language and direction change", async () => {
    const { model, getRows } = fixture();
    const view = render(
      <GridLocaleProvider>
        <InfiniteDataGrid model={model} columns={columns} height={180} />
      </GridLocaleProvider>,
    );
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    const target = cell(0);
    target.focus();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <InfiniteDataGrid
          model={model}
          columns={columns}
          direction="rtl"
          height={180}
        />
      </GridLocaleProvider>,
    );
    expect(
      screen.getByRole("grid", { name: "Cuadrícula de datos infinitos" }),
    ).toBeTruthy();
    expect(cell(0)).toBe(target);
    expect(document.activeElement).toBe(target);
    expect(getRows).toHaveBeenCalledTimes(1);
  });
  it("does not fetch during server rendering or dispose a borrowed model on unmount", async () => {
    const { model, getRows } = fixture();
    const html = renderToString(
      <InfiniteDataGrid model={model} columns={columns} />,
    );
    expect(html).toContain("Infinite data grid");
    expect(getRows).not.toHaveBeenCalled();
    const dispose = vi.spyOn(model, "dispose");
    const view = render(<InfiniteDataGrid model={model} columns={columns} />);
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    view.unmount();
    expect(dispose).not.toHaveBeenCalled();
    expect(model.getSnapshot().disposed).toBe(false);
    model.dispose();
  });
  it("resets scrolled query ownership to row zero and restores grid-owned focus", async () => {
    const { model, getRows } = fixture(100);
    render(<InfiniteDataGrid model={model} columns={columns} height={180} />);
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    cell(0).focus();
    fireEvent.keyDown(cell(0), { key: "End", ctrlKey: true });
    await waitFor(() => expect(cell(99, "amount")?.textContent).toBe("99"));
    expect(document.activeElement).toBe(cell(99, "amount"));
    const before = getRows.mock.calls.length;
    act(() =>
      model.setQuery({ sorting: [{ columnId: "amount", direction: "desc" }] }),
    );
    await waitFor(() => expect(cell(0, "amount")?.textContent).toBe("0"));
    expect(document.activeElement).toBe(cell(0, "amount"));
    expect(screen.getByRole("grid").scrollTop).toBe(0);
    expect(
      getRows.mock.calls
        .slice(before)
        .every(([request]) => request.startRow === 0),
    ).toBe(true);
  });
  it("preserves intentional outside focus through query resets", async () => {
    const { model } = fixture(100);
    render(
      <>
        <button
          type="button"
          onClick={() =>
            model.setQuery({
              sorting: [{ columnId: "amount", direction: "desc" }],
            })
          }
        >
          Change query
        </button>
        <InfiniteDataGrid model={model} columns={columns} height={180} />
      </>,
    );
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    cell(0).focus();
    fireEvent.keyDown(cell(0), { key: "End", ctrlKey: true });
    await waitFor(() => expect(cell(99, "amount")?.textContent).toBe("99"));
    const button = screen.getByRole("button", { name: "Change query" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    expect(document.activeElement).toBe(button);
  });
  it("starts a replacement provider at the beginning without disposing the previous owner", async () => {
    const first = fixture(100),
      second = fixture(3);
    const view = render(
      <InfiniteDataGrid model={first.model} columns={columns} height={180} />,
    );
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    cell(0).focus();
    fireEvent.keyDown(cell(0), { key: "End", ctrlKey: true });
    await waitFor(() => expect(cell(99, "amount")?.textContent).toBe("99"));
    view.rerender(
      <InfiniteDataGrid model={second.model} columns={columns} height={180} />,
    );
    await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
    expect(screen.getByRole("grid").scrollTop).toBe(0);
    expect(second.getRows.mock.calls[0][0].startRow).toBe(0);
    expect(first.model.getSnapshot().disposed).toBe(false);
  });
  it.each([false, true])(
    "clamps a focused terminal placeholder while preserving outside focus=%s",
    async (outside) => {
      let finish!: (response: InfiniteResponse<Row>) => void;
      const model = new InfiniteRowModel<Row>(
        {
          getRows: async ({ startRow }) =>
            startRow === 0
              ? { rows: records(0, 10) }
              : new Promise((resolve) => {
                  finish = resolve;
                }),
        },
        { getRowId: (r) => r.id, blockSize: 10, maxBlocks: 4 },
      );
      render(
        <>
          <button type="button">Outside control</button>
          <InfiniteDataGrid model={model} columns={columns} height={180} />
        </>,
      );
      await waitFor(() => expect(cell(0)?.textContent).toBe("Record 0"));
      cell(0).focus();
      fireEvent.keyDown(cell(0), { key: "End", ctrlKey: true });
      await waitFor(() => expect(finish).toBeTypeOf("function"));
      expect(document.activeElement).toBe(cell(19, "amount"));
      const button = screen.getByRole("button", { name: "Outside control" });
      if (outside) button.focus();
      await act(async () => finish({ rows: records(10, 15), rowCount: 15 }));
      await waitFor(() => expect(cell(14, "amount")?.textContent).toBe("14"));
      expect(document.activeElement).toBe(
        outside ? button : cell(14, "amount"),
      );
    },
  );
  it("renders the provider's changed query results without local sorting", async () => {
    const getRows = vi.fn(async ({ sorting }: DataRequest) => ({
      rows: [
        {
          id: "one",
          name: sorting.length
            ? "Sorted provider result"
            : "Initial provider result",
          amount: sorting.length ? 20 : 10,
        },
      ],
      rowCount: 1,
    }));
    const model = new InfiniteRowModel<Row>(
      { getRows },
      { getRowId: (r) => r.id, blockSize: 10 },
    );
    render(<InfiniteDataGrid model={model} columns={columns} />);
    await waitFor(() =>
      expect(cell(0)?.textContent).toBe("Initial provider result"),
    );
    act(() =>
      model.setQuery({ sorting: [{ columnId: "amount", direction: "desc" }] }),
    );
    await waitFor(() =>
      expect(cell(0)?.textContent).toBe("Sorted provider result"),
    );
    expect(getRows.mock.calls.at(-1)?.[0].sorting).toEqual([
      { columnId: "amount", direction: "desc" },
    ]);
  });
});
