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
  CellNotesStore,
  ServerSideRowModel,
  createGrid,
  type Column,
} from "@opengrid/core";
import { ServerDataGrid, type ServerNotesContext } from "./remote-grids.js";
import { DataGrid } from "./data-grid.js";
import { GridLocaleProvider, esES } from "./locale.js";

afterEach(cleanup);
type Row = { name: string };
const columns: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", width: 160 },
];
const position = { rowId: "same", columnId: "name" };
const cell = () =>
  document.querySelector<HTMLElement>(
    '[role="gridcell"][data-row-id="same"][data-column-id="name"]',
  )!;
const text = () =>
  screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Note text" });
function open() {
  fireEvent.keyDown(cell(), { key: "n", altKey: true });
  return text();
}
function save(value: string) {
  fireEvent.change(text(), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
}
const leaf = () => ({
  kind: "row" as const,
  id: "same",
  data: { name: "Leaf record" },
});
const flat = () =>
  new ServerSideRowModel<Row>({
    getRows: async () => ({ nodes: [leaf()], rowCount: 1 }),
  });

describe("server note ownership", () => {
  it("isolates permitted route-local IDs and restores both routes on return", async () => {
    const model = new ServerSideRowModel<Row>({
      getRows: async ({ groupKeys }) => ({
        nodes: groupKeys.length
          ? [leaf()]
          : [{ kind: "group", id: "same", key: "East", childCount: 1 }],
        rowCount: 1,
      }),
    });
    render(<ServerDataGrid model={model} columns={columns} />);
    await screen.findByRole("button", { name: "Open group East" });
    open();
    save("Root note");
    fireEvent.click(screen.getByRole("button", { name: "Open group East" }));
    await waitFor(() => expect(cell()?.textContent).toContain("Leaf record"));
    expect(open().value).toBe("");
    save("East note");
    fireEvent.click(screen.getByRole("button", { name: "All groups" }));
    await screen.findByRole("button", { name: "Open group East" });
    expect(open().value).toBe("Root note");
    save("Root note");
    fireEvent.click(screen.getByRole("button", { name: "Open group East" }));
    await waitFor(() => expect(cell()?.textContent).toContain("Leaf record"));
    expect(open().value).toBe("East note");
  });
  it("isolates query namespaces and restores a previous query", async () => {
    const model = flat();
    render(<ServerDataGrid model={model} columns={columns} />);
    await waitFor(() => expect(cell()).toBeTruthy());
    open();
    save("Original query");
    act(() =>
      model.setQuery({ sorting: [{ columnId: "name", direction: "asc" }] }),
    );
    await waitFor(() => expect(cell()).toBeTruthy());
    expect(open().value).toBe("");
    save("Sorted query");
    act(() => model.setQuery({ sorting: [] }));
    await waitFor(() => expect(cell()).toBeTruthy());
    expect(open().value).toBe("Original query");
  });
  it("replaces an open draft when the provider instance changes", async () => {
    const first = flat(),
      second = flat();
    const view = render(<ServerDataGrid model={first} columns={columns} />);
    await waitFor(() => expect(cell()).toBeTruthy());
    open();
    save("First provider");
    open();
    fireEvent.change(text(), { target: { value: "Unsaved first draft" } });
    view.rerender(<ServerDataGrid model={second} columns={columns} />);
    await waitFor(() => expect(cell()).toBeTruthy());
    if (!screen.queryByRole("dialog")) open();
    expect(text().value).toBe("");
    save("Second provider");
    view.rerender(<ServerDataGrid model={first} columns={columns} />);
    await waitFor(() => expect(cell()).toBeTruthy());
    // Default notes belong to the mounted provider instance; replacing it releases its owned store.
    expect(open().value).toBe("");
  });
  it("passes a frozen scope context to an application resolver and preserves it across locale changes", async () => {
    const model = flat(),
      store = new CellNotesStore();
    const resolver = vi.fn((_context: ServerNotesContext<Row>) => store);
    const view = render(
      <GridLocaleProvider>
        <ServerDataGrid model={model} columns={columns} notes={resolver} />
      </GridLocaleProvider>,
    );
    await waitFor(() => expect(cell()).toBeTruthy());
    expect(resolver).toHaveBeenCalledTimes(1);
    const context = resolver.mock.calls[0][0];
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.groupKeys)).toBe(true);
    expect(context.model).toBe(model);
    open();
    fireEvent.change(text(), { target: { value: "Retain draft" } });
    const editor = text();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <ServerDataGrid
          model={model}
          columns={columns}
          notes={resolver}
          direction="rtl"
        />
      </GridLocaleProvider>,
    );
    expect(document.activeElement).toBe(editor);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().notes).toHaveLength(0);
    expect(JSON.parse(context.scopeKey)[0]).toBe(context.queryKey);
    expect(editor.value).toBe("Retain draft");
  });
  it("disables notes explicitly or per resolver without loading data during SSR", () => {
    const getRows = vi.fn(async () => ({ nodes: [leaf()], rowCount: 1 }));
    const model = new ServerSideRowModel<Row>({ getRows });
    expect(
      renderToString(
        <ServerDataGrid model={model} columns={columns} notes={false} />,
      ),
    ).not.toContain('role="dialog"');
    const resolver = vi.fn(() => false as const);
    renderToString(
      <ServerDataGrid model={model} columns={columns} notes={resolver} />,
    );
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(getRows).not.toHaveBeenCalled();
  });
  it("retains application-owned stores when their provider is supplied again", async () => {
    const first = flat(),
      second = flat();
    const stores = new WeakMap([
      [first, new CellNotesStore()],
      [second, new CellNotesStore()],
    ]);
    const resolver = ({ model }: ServerNotesContext<Row>) =>
      stores.get(model) ?? false;
    const view = render(
      <ServerDataGrid model={first} columns={columns} notes={resolver} />,
    );
    await waitFor(() => expect(cell()).toBeTruthy());
    open();
    save("Persisted first");
    view.rerender(
      <ServerDataGrid model={second} columns={columns} notes={resolver} />,
    );
    await waitFor(() => expect(cell()).toBeTruthy());
    expect(open().value).toBe("");
    save("Persisted second");
    view.rerender(
      <ServerDataGrid model={first} columns={columns} notes={resolver} />,
    );
    await waitFor(() => expect(cell()).toBeTruthy());
    expect(open().value).toBe("Persisted first");
    expect(stores.get(second)?.get(position)).toBe("Persisted second");
  });
  it("rejects invalid resolver contracts without loading data or mutating notes", () => {
    const model = flat();
    expect(() =>
      renderToString(
        <ServerDataGrid
          model={model}
          columns={columns}
          notes={new CellNotesStore() as never}
        />,
      ),
    ).toThrow("resolver or false");
    expect(() =>
      renderToString(
        <ServerDataGrid
          model={model}
          columns={columns}
          notes={(() => null) as never}
        />,
      ),
    ).toThrow("CellNotesStore or false");
    expect(model.getSnapshot().blocks).toHaveLength(0);
  });
  it("removes note controls when a resolver disables the active namespace", async () => {
    const model = flat();
    render(
      <ServerDataGrid model={model} columns={columns} notes={() => false} />,
    );
    await waitFor(() => expect(cell()).toBeTruthy());
    fireEvent.keyDown(cell(), { key: "n", altKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Note" })).toBeNull();
  });
});

describe("controlled note editor ownership", () => {
  const create = () =>
    createGrid({
      rows: [{ id: "same", name: "Ada" }],
      getRowId: (r) => r.id,
      columns: [{ id: "name", field: "name", header: "Name" }],
    });
  it("remounts an open editor on store replacement before an old draft can save", () => {
    const model = create(),
      first = new CellNotesStore(),
      second = new CellNotesStore();
    first.set(position, "First");
    second.set(position, "Second");
    const view = render(<DataGrid model={model} notes={first} />);
    open();
    const old = text();
    fireEvent.change(old, { target: { value: "Old draft" } });
    view.rerender(<DataGrid model={model} notes={second} />);
    expect(text()).not.toBe(old);
    expect(text().value).toBe("Second");
    save("Updated second");
    expect(first.get(position)).toBe("First");
    expect(second.get(position)).toBe("Updated second");
  });
  it("preserves an open draft and focus through language and direction changes", () => {
    const model = create(),
      notes = new CellNotesStore();
    const view = render(
      <GridLocaleProvider>
        <DataGrid model={model} notes={notes} />
      </GridLocaleProvider>,
    );
    open();
    const editor = text();
    fireEvent.change(editor, { target: { value: "Keep this draft" } });
    editor.focus();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={model} notes={notes} direction="rtl" />
      </GridLocaleProvider>,
    );
    expect(document.activeElement).toBe(editor);
    expect(editor.value).toBe("Keep this draft");
    expect(notes.get(position)).toBeUndefined();
  });
  it("aborts pending context tasks when the note store changes", async () => {
    const model = create(),
      first = new CellNotesStore(),
      second = new CellNotesStore();
    let signal: AbortSignal | undefined,
      finish: () => void = () => {};
    const contextMenu = {
      getItems: () => [
        {
          kind: "action" as const,
          id: "wait",
          label: "Wait",
          action: (_context: unknown, taskSignal: AbortSignal) => {
            signal = taskSignal;
            return new Promise<void>((resolve) => {
              finish = resolve;
            });
          },
        },
      ],
    };
    const view = render(
      <DataGrid model={model} notes={first} contextMenu={contextMenu} />,
    );
    fireEvent.contextMenu(cell());
    await act(async () =>
      fireEvent.click(screen.getByRole("menuitem", { name: "Wait" })),
    );
    expect(signal?.aborted).toBe(false);
    view.rerender(
      <DataGrid model={model} notes={second} contextMenu={contextMenu} />,
    );
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    await act(async () => finish());
    expect(first.getSnapshot().notes).toHaveLength(0);
    expect(second.getSnapshot().notes).toHaveLength(0);
  });
});
