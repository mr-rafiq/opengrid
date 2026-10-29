// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  LiveViewportRowModel,
  ServerSideRowModel,
  type Column,
  type ViewportRequest,
} from "@opengrid/core";
import { LiveViewportDataGrid, ServerDataGrid } from "./remote-grids.js";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
interface Item {
  name: string;
  amount: number;
  team: string;
}
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Name", pinned: "left", width: 150 },
  { id: "amount", field: "amount", header: "Amount", width: 180 },
  { id: "team", field: "team", header: "Team", pinned: "right", width: 120 },
];
it("keeps server loaded selection and query across direction changes", async () => {
  const getRows = vi.fn(async () => ({
    nodes: [
      {
        kind: "row" as const,
        id: "first",
        data: { name: "First", amount: 12, team: "Atlas" },
      },
    ],
    rowCount: 1,
  }));
  const model = new ServerSideRowModel<Item>({ getRows });
  const view = render(
    <ServerDataGrid model={model} columns={columns} direction="ltr" />,
  );
  const checkbox = await screen.findByRole("checkbox", {
    name: "Select row first",
  });
  fireEvent.click(checkbox);
  const target = document.querySelector<HTMLElement>(
    '[data-row-id="first"][data-column-id="amount"]',
  )!;
  act(() => target.focus());
  const calls = getRows.mock.calls.length;
  view.rerender(
    <ServerDataGrid model={model} columns={columns} direction="rtl" />,
  );
  expect(
    screen
      .getAllByRole("button", { name: /^Sort / })
      .map((button) =>
        button.getAttribute("aria-label")?.replace(/^Sort /, ""),
      ),
  ).toEqual(["Team", "Amount", "Name"]);
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect(document.activeElement).toBe(target);
  expect(getRows).toHaveBeenCalledTimes(calls);
  expect(screen.getByRole("grid").getAttribute("dir")).toBe("rtl");
  view.unmount();
  model.dispose();
});
it("normalizes live RTL scrolling, keyboard order and runtime direction without resubscribing", async () => {
  let measure: () => void = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const requests: ViewportRequest<Item>[] = [],
    dispose = vi.fn(),
    subscribe = vi.fn((request: ViewportRequest<Item>) => {
      requests.push(request);
      return dispose;
    });
  const model = new LiveViewportRowModel<Item>({ subscribe }, { buffer: 2 });
  const view = render(
    <LiveViewportDataGrid model={model} columns={columns} direction="rtl" />,
  );
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  act(() => {
    requests.at(-1)!.onRowCount(1000);
    requests.at(-1)!.onRows([
      {
        index: 0,
        id: "first",
        data: { name: "First", amount: 12, team: "Atlas" },
      },
    ]);
  });
  const grid = screen.getByRole("grid");
  Object.defineProperty(grid, "clientWidth", {
    configurable: true,
    value: 300,
  });
  Object.defineProperty(grid, "scrollWidth", {
    configurable: true,
    value: 450,
  });
  act(() => measure());
  act(() => {
    grid.scrollLeft = -80;
    fireEvent.scroll(grid);
  });
  const team = document.querySelector<HTMLElement>(
    '[data-viewport-row="0"][data-column-id="team"]',
  )!;
  act(() => team.focus());
  fireEvent.keyDown(team, { key: "ArrowLeft" });
  const amount = document.querySelector<HTMLElement>(
    '[data-viewport-row="0"][data-column-id="amount"]',
  )!;
  expect(document.activeElement).toBe(amount);
  expect(grid.scrollLeft).toBe(0);
  // Oversized center cells consistently reveal their leading edge instead of oscillating.
  fireEvent.click(amount);
  fireEvent.click(amount);
  expect(grid.scrollLeft).toBe(0);
  expect(
    screen.getAllByRole("columnheader").map((header) => header.textContent),
  ).toEqual(["Team", "Amount", "Name"]);
  const calls = subscribe.mock.calls.length;
  view.rerender(
    <LiveViewportDataGrid model={model} columns={columns} direction="ltr" />,
  );
  expect(grid.getAttribute("dir")).toBe("ltr");
  expect(grid.scrollLeft).toBeGreaterThanOrEqual(0);
  expect(document.activeElement).toBe(amount);
  expect(
    screen.getAllByRole("columnheader").map((header) => header.textContent),
  ).toEqual(["Name", "Amount", "Team"]);
  expect(subscribe).toHaveBeenCalledTimes(calls);
  expect(dispose).not.toHaveBeenCalled();
  act(() => {
    team.focus();
    grid.scrollLeft = 80;
    fireEvent.scroll(grid);
  });
  view.rerender(
    <LiveViewportDataGrid model={model} columns={columns} direction="rtl" />,
  );
  expect(grid.scrollLeft).toBe(-80);
  expect(document.activeElement).toBe(team);
  expect(subscribe).toHaveBeenCalledTimes(calls);
  view.unmount();
  model.dispose();
});
it("uses physical sticky offsets for multiple live pins in RTL", () => {
  const model = new LiveViewportRowModel<Item>({ subscribe: () => () => {} });
  const doubled: Column<Item>[] = [
    columns[0],
    { ...columns[0], id: "name2", width: 70 },
    columns[1],
    columns[2],
    { ...columns[2], id: "team2", width: 90 },
  ];
  const view = render(
    <LiveViewportDataGrid model={model} columns={doubled} direction="rtl" />,
  );
  const headers = screen.getAllByRole("columnheader");
  expect(headers.map((header) => (header as HTMLElement).style.left)).toEqual([
    "",
    "",
    "",
    "70px",
    "0px",
  ]);
  expect(headers.map((header) => (header as HTMLElement).style.right)).toEqual([
    "0px",
    "120px",
    "",
    "",
    "",
  ]);
  view.unmount();
  model.dispose();
});
