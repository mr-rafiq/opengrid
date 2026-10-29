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
  ServerSideRowModel,
  LiveViewportRowModel,
  type Column,
  type ServerRequest,
  type ServerResponse,
  type ViewportRequest,
} from "@opengrid/core";
import { ServerDataGrid, LiveViewportDataGrid } from "./remote-grids.js";
import { GridLocaleProvider, enUS, esES } from "./locale.js";
afterEach(cleanup);
interface Item {
  name: string;
  price: number;
}
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Name", pinned: "left", width: 160 },
  { id: "price", field: "price", header: "Price", type: "number", width: 120 },
];
const leaf = (id: string) => ({
  kind: "row" as const,
  id,
  data: { name: id, price: 12 },
});

it("keeps server route/page/selection/focus without reloading on a locale change", async () => {
  const getRows = vi.fn(
    async (request: ServerRequest): Promise<ServerResponse<Item>> =>
      request.groupKeys.length
        ? {
            nodes: [leaf("first"), leaf("second"), leaf("third")].slice(
              request.startRow,
              request.endRow,
            ),
            rowCount: 3,
          }
        : {
            nodes: [{ kind: "group", id: "east", key: "East", childCount: 3 }],
            rowCount: 1,
          },
  );
  const model = new ServerSideRowModel<Item>(
      { getRows },
      { blockSize: 2, query: { rowGroupColumns: ["region"] } },
    ),
    view = render(
      <GridLocaleProvider locale={enUS}>
        <ServerDataGrid model={model} columns={columns} />
      </GridLocaleProvider>,
    );
  fireEvent.click(
    await screen.findByRole("button", { name: "Open group East" }),
  );
  await screen.findByRole("checkbox", { name: "Select row first" });
  fireEvent.click(screen.getByRole("button", { name: "Next server page" }));
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Select row third" }),
  );
  const target = document.querySelector<HTMLElement>(
    '[data-row-id="third"][data-column-id="name"]',
  )!;
  act(() => target.focus());
  const calls = getRows.mock.calls.length;
  view.rerender(
    <GridLocaleProvider locale={esES}>
      <ServerDataGrid model={model} columns={columns} />
    </GridLocaleProvider>,
  );
  expect(screen.getByRole("button", { name: "Todos los grupos" })).toBeTruthy();
  expect(screen.getByText("Página del servidor 2 de 2")).toBeTruthy();
  expect(
    screen.getByText("1 seleccionada en esta página cargada"),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Seleccionar la fila third",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(document.activeElement).toBe(target);
  expect(target.textContent).toBe("third");
  expect(getRows.mock.calls.length).toBe(calls);
  expect(
    document.querySelector(".og-remote-server")?.getAttribute("lang"),
  ).toBe("es-ES");
  view.unmount();
  model.dispose();
}, 15000);

it("keeps a live subscription, focused row and data while translating count/loading controls", async () => {
  const requests: ViewportRequest<Item>[] = [],
    dispose = vi.fn(),
    subscribe = vi.fn((request: ViewportRequest<Item>) => {
      requests.push(request);
      return dispose;
    }),
    model = new LiveViewportRowModel<Item>({ subscribe }, { buffer: 2 });
  const view = render(
    <GridLocaleProvider locale={enUS}>
      <LiveViewportDataGrid
        model={model}
        columns={columns}
        ariaLabel="Stateful live rows"
      />
    </GridLocaleProvider>,
  );
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  act(() => {
    requests[0].onRowCount(10000);
    requests[0].onRows([
      { index: 0, id: "live", data: { name: "Business value", price: 42 } },
    ]);
  });
  const target = document.querySelector<HTMLElement>(
    '[data-viewport-row="0"][data-column-id="name"]',
  )!;
  act(() => target.focus());
  const calls = subscribe.mock.calls.length;
  view.rerender(
    <GridLocaleProvider locale={esES}>
      <LiveViewportDataGrid
        model={model}
        columns={columns}
        ariaLabel="Stateful live rows"
      />
    </GridLocaleProvider>,
  );
  expect(screen.getByText(/10\.000 filas en directo/)).toBeTruthy();
  expect(screen.getByText("Proveedor en directo de solo lectura")).toBeTruthy();
  expect(target.textContent).toBe("Business value");
  expect(document.activeElement).toBe(target);
  expect(subscribe.mock.calls.length).toBe(calls);
  expect(dispose).not.toHaveBeenCalled();
  expect(
    document.querySelector(".og-live-viewport")?.getAttribute("lang"),
  ).toBe("es-ES");
  view.unmount();
  model.dispose();
});

it("translates server retry UI and default labels while leaving provider errors unchanged", async () => {
  const model = new ServerSideRowModel<Item>({
      getRows: async () => {
        throw new Error("Provider chose this message");
      },
    }),
    view = render(
      <GridLocaleProvider locale={enUS}>
        <ServerDataGrid model={model} columns={columns} />
      </GridLocaleProvider>,
    );
  await screen.findByRole("alert");
  view.rerender(
    <GridLocaleProvider locale={esES}>
      <ServerDataGrid model={model} columns={columns} />
    </GridLocaleProvider>,
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "Provider chose this message",
  );
  expect(
    screen.getByRole("button", { name: "Reintentar filas del servidor" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("grid", { name: "Cuadrícula de datos del servidor" }),
  ).toBeTruthy();
  view.unmount();
  model.dispose();
});
