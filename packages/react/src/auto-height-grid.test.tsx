// @vitest-environment jsdom
import { StrictMode, createRef } from "react";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
import type { DataGridRowHeightController } from "./auto-row-heights.js";
import { GridLocaleProvider, esES } from "./locale.js";

type Row = { id: string; description: string; amount: number; notes: string };
const data: Row[] = [0, 1, 2].map((index) => ({
  id: `r${index}`,
  description: "Shared description",
  amount: index,
  notes: `Note ${index}`,
}));
const columns: Column<Row>[] = [
  {
    id: "description",
    field: "description",
    header: "Description",
    width: 160,
    editable: true,
    wrapText: true,
    autoHeight: true,
  },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    width: 100,
  },
  { id: "notes", field: "notes", header: "Notes", width: 140 },
];
const model = (schema: Column<Row>[] = columns) =>
  createGrid<Row>({
    rows: data.map((row) => ({ ...row })),
    getRowId: (row) => row.id,
    columns: schema,
  });
const metricKey = (row: string, column = "description") =>
  JSON.stringify([row, column]);
let heights: Map<string, number>, sheet: HTMLStyleElement;
class TestObserver {
  static instances: TestObserver[] = [];
  targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    TestObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  emit() {
    const targets = [...this.targets].filter((target) =>
      target.classList.contains("og-cell-content"),
    );
    if (targets.length)
      this.callback(
        targets.map((target) => ({ target })) as ResizeObserverEntry[],
        this as unknown as ResizeObserver,
      );
  }
  static emitCells() {
    for (const instance of this.instances) instance.emit();
  }
}
beforeEach(() => {
  heights = new Map();
  TestObserver.instances = [];
  vi.stubGlobal("ResizeObserver", TestObserver);
  sheet = document.createElement("style");
  sheet.textContent = readFileSync("packages/react/src/styles.css", "utf8");
  document.head.append(sheet);
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (!this.classList.contains("og-cell-content"))
        return original.call(this);
      const cell = this.parentElement!;
      return new DOMRect(
        0,
        0,
        Math.max(1, Number.parseFloat(cell.style.width) - 24),
        heights.get(metricKey(cell.dataset.rowId!, cell.dataset.columnId!)) ??
          20,
      );
    },
  );
});
afterEach(() => {
  cleanup();
  sheet.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const cell = (row = "r0", column = "description") =>
  document.querySelector<HTMLElement>(
    `[role="gridcell"][data-row-id="${row}"][data-column-id="${column}"]`,
  )!;
const rowHeight = (row = "r0") =>
  cell(row, "amount").closest<HTMLElement>('[role="row"]')!.style.height;
async function observed() {
  await act(async () => {
    TestObserver.emitCells();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

describe("automatic natural-content grid height", () => {
  it("grows a wrapped cell using its measured content without writing data or history", async () => {
    heights.set(metricKey("r0"), 60);
    const grid = model();
    render(<DataGrid model={grid} rowHeight={36} />);
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    expect(rowHeight("r1")).toBe("36px");
    expect(cell().classList.contains("og-wrap-text")).toBe(true);
    expect(
      getComputedStyle(cell().querySelector(".og-cell-content")!).whiteSpace,
    ).toBe("normal");
    expect(grid.getRows()[0].description).toBe("Shared description");
    expect(grid.undo()).toBe(false);
  });
  it("wraps without measuring when autoHeight is disabled", async () => {
    heights.set(metricKey("r0"), 200);
    render(
      <DataGrid
        model={model(
          columns.map((column) => ({ ...column, autoHeight: false })),
        )}
        rowHeight={36}
      />,
    );
    await observed();
    expect(rowHeight()).toBe("36px");
    expect(
      TestObserver.instances
        .flatMap((observer) => [...observer.targets])
        .some((target) => target.classList.contains("og-cell-content")),
    ).toBe(false);
  });
  it("adds a spanning owner's deficit to the final original row", async () => {
    heights.set(metricKey("r0"), 180);
    render(
      <DataGrid
        model={model(
          columns.map((column) =>
            column.id === "description"
              ? { ...column, spanRows: true }
              : column,
          ),
        )}
        rowHeight={36}
      />,
    );
    await waitFor(() => expect(cell().style.height).toBe("192px"));
    expect(rowHeight()).toBe("36px");
    expect(rowHeight("r1")).toBe("36px");
    expect(rowHeight("r2")).toBe("120px");
    expect(cell().getAttribute("aria-rowspan")).toBe("3");
    expect(cell("r1")).toBeNull();
  });
  it("shares height supplied by a second auto column before adding span excess", async () => {
    heights.set(metricKey("r0"), 180);
    heights.set(metricKey("r2", "notes"), 120);
    const schema = columns.map((column) =>
      column.id === "description"
        ? { ...column, spanRows: true }
        : column.id === "notes"
          ? { ...column, wrapText: true, autoHeight: true }
          : column,
    );
    render(<DataGrid model={model(schema)} rowHeight={36} />);
    await waitFor(() => expect(rowHeight("r2")).toBe("132px"));
    expect(rowHeight()).toBe("36px");
    expect(cell().style.height).toBe("204px");
  });
  it("preserves an explicit base row-height minimum", async () => {
    heights.set(metricKey("r0"), 60);
    render(
      <DataGrid
        model={model()}
        rowHeight={36}
        getRowHeight={(node) => (node.id === "r0" ? 100 : 80)}
      />,
    );
    await observed();
    expect(rowHeight()).toBe("100px");
    expect(rowHeight("r1")).toBe("80px");
  });
  it("responds to a later content resize while retaining a focused cell", async () => {
    heights.set(metricKey("r0"), 60);
    render(<DataGrid model={model()} rowHeight={36} />);
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    const target = cell();
    act(() => target.focus());
    heights.set(metricKey("r0"), 120);
    await observed();
    await waitFor(() => expect(rowHeight()).toBe("132px"));
    expect(cell()).toBe(target);
    expect(document.activeElement).toBe(target);
  });
  it("remeasures width changes and controlled edits/undo", async () => {
    const grid = model();
    heights.set(metricKey("r0"), 80);
    render(<DataGrid model={grid} rowHeight={36} />);
    await waitFor(() => expect(rowHeight()).toBe("92px"));
    heights.set(metricKey("r0"), 40);
    act(() => grid.setState({ columnWidths: { description: 240 } }));
    await waitFor(() => expect(rowHeight()).toBe("52px"));
    expect(cell().style.width).toBe("240px");
    heights.set(metricKey("r0"), 100);
    act(() => grid.editCell("r0", "description", "Edited content"));
    await waitFor(() => expect(rowHeight()).toBe("112px"));
    expect(cell().textContent).toContain("Edited content");
    heights.set(metricKey("r0"), 40);
    act(() => grid.undo());
    await waitFor(() => expect(rowHeight()).toBe("52px"));
    expect(cell().textContent).toContain("Shared description");
  });
  it("keeps offscreen auto columns mounted for complete row measurement", async () => {
    heights.set(metricKey("r0"), 80);
    const schema: Column<Row>[] = [
      { id: "amount", field: "amount", header: "Amount", width: 100 },
      ...Array.from({ length: 25 }, (_, index): Column<Row> => ({
        id: `metric${index}`,
        header: `Metric ${index}`,
        width: 180,
        valueGetter: (row) => row.amount + index,
      })),
      columns[0],
    ];
    render(<DataGrid model={model(schema)} rowHeight={36} height={180} />);
    await waitFor(() => expect(rowHeight()).toBe("92px"));
    expect(cell()).toBeTruthy();
    expect(
      document.querySelectorAll('[data-row-id="r0"][role="gridcell"]').length,
    ).toBeLessThan(15);
  });
  it("resets a borrowed measurement controller explicitly without changing source data", async () => {
    const api = createRef<DataGridRowHeightController>();
    heights.set(metricKey("r0"), 60);
    const grid = model();
    render(<DataGrid model={grid} rowHeight={36} rowHeightRef={api} />);
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    heights.set(metricKey("r0"), 100);
    act(() => api.current!.reset());
    await waitFor(() => expect(rowHeight()).toBe("112px"));
    expect(grid.getRows()[0].description).toBe("Shared description");
  });
  it("retains cell identity and outside focus during language/direction changes", async () => {
    heights.set(metricKey("r0"), 60);
    const grid = model();
    const view = render(
      <GridLocaleProvider>
        <button type="button">Outside</button>
        <DataGrid model={grid} rowHeight={36} />
      </GridLocaleProvider>,
    );
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    const target = cell(),
      outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <button type="button">Outside</button>
        <DataGrid model={grid} rowHeight={36} direction="rtl" />
      </GridLocaleProvider>,
    );
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    expect(cell()).toBe(target);
    expect(document.activeElement).toBe(outside);
  });
  it("survives StrictMode observer replay and rejects obsolete model callbacks", async () => {
    heights.set(metricKey("r0"), 60);
    const first = model(),
      second = model();
    const view = render(
      <StrictMode>
        <DataGrid model={first} rowHeight={36} />
      </StrictMode>,
    );
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    const old = [...TestObserver.instances];
    heights.set(metricKey("r0"), 120);
    view.rerender(
      <StrictMode>
        <DataGrid model={second} rowHeight={36} />
      </StrictMode>,
    );
    for (const observer of old)
      observer.callback(
        [
          { target: cell().querySelector(".og-cell-content")! },
        ] as ResizeObserverEntry[],
        observer as unknown as ResizeObserver,
      );
    await waitFor(() => expect(rowHeight()).toBe("132px"));
    expect(second.getRows()[0].description).toBe("Shared description");
  });
  it("preserves pinned bands and reflows independent span geometry", async () => {
    heights.set(metricKey("r1", "notes"), 120);
    const schema = columns.map((column) =>
      column.id === "description"
        ? { ...column, autoHeight: false, spanRows: true }
        : column.id === "notes"
          ? { ...column, wrapText: true, autoHeight: true }
          : column,
    );
    render(
      <DataGrid
        model={model(schema)}
        rowHeight={36}
        pinnedTopRowIds={["r0"]}
      />,
    );
    await waitFor(() => expect(rowHeight("r1")).toBe("132px"));
    expect(rowHeight("r0")).toBe("36px");
    expect(cell("r1").style.height).toBe("168px");
    expect(cell("r1").getAttribute("aria-rowspan")).toBe("2");
  });
  it("measures automatic owners in both pinned bands and retains selection estimates", async () => {
    const grid = model();
    heights.set(metricKey("r0"), 60);
    heights.set(metricKey("r2"), 90);
    render(
      <DataGrid
        model={grid}
        rowHeight={36}
        pinnedTopRowIds={["r0"]}
        pinnedBottomRowIds={["r2"]}
      />,
    );
    await waitFor(() => expect(rowHeight("r0")).toBe("72px"));
    await waitFor(() => expect(rowHeight("r2")).toBe("102px"));
    const owner = cell();
    act(() => grid.toggleSelection("r0"));
    expect(rowHeight("r0")).toBe("72px");
    expect(rowHeight("r2")).toBe("102px");
    expect(cell()).toBe(owner);
  });
  it("allocates measured combined rectangular owner height to its last row", async () => {
    heights.set(metricKey("r0"), 180);
    const schema = columns.map((column) =>
      column.id === "description"
        ? { ...column, spanRows: true, colSpan: () => 2 }
        : column,
    );
    render(<DataGrid model={model(schema)} rowHeight={36} />);
    await waitFor(() => expect(cell().style.height).toBe("192px"));
    expect(cell().getAttribute("aria-rowspan")).toBe("3");
    expect(cell().getAttribute("aria-colspan")).toBe("2");
    const sizes = [
      ...document.querySelectorAll<HTMLElement>('[role="row"][data-og-row-id]'),
    ].map((row) => row.style.height);
    expect(sizes).toEqual(["36px", "36px", "120px"]);
  });
  it("keeps the same body source point below a growing pinned top band", async () => {
    const grid = createGrid<Row>({
      rows: Array.from({ length: 80 }, (_, index) => ({
        ...data[0],
        id: `r${index}`,
        amount: index,
      })),
      getRowId: (row) => row.id,
      columns,
    });
    heights.set(metricKey("r0"), 60);
    render(
      <>
        <button type="button">Outside pinned anchor</button>
        <DataGrid
          model={grid}
          rowHeight={36}
          pagination={false}
          pinnedTopRowIds={["r0"]}
          height={320}
        />
      </>,
    );
    await waitFor(() => expect(rowHeight("r0")).toBe("72px"));
    const viewport = screen.getByRole("grid"),
      outside = screen.getByRole("button", { name: "Outside pinned anchor" });
    act(() => outside.focus());
    fireEvent.scroll(viewport, { target: { scrollTop: 1080 } });
    await waitFor(() => expect(cell("r31", "amount")).toBeTruthy());
    const anchor = cell("r31", "amount");
    heights.set(metricKey("r0"), 120);
    await observed();
    await waitFor(() => expect(rowHeight("r0")).toBe("132px"));
    expect(viewport.scrollTop).toBe(1080);
    expect(cell("r31", "amount")).toBe(anchor);
    expect(document.activeElement).toBe(outside);
  });
  it("anchors the first visible source row when a retained earlier cell grows", async () => {
    const grid = createGrid<Row>({
      rows: Array.from({ length: 80 }, (_, index) => ({
        ...data[0],
        id: `r${index}`,
        amount: index,
      })),
      getRowId: (row) => row.id,
      columns,
    });
    heights.set(metricKey("r0"), 60);
    render(
      <>
        <button type="button">Outside anchor</button>
        <DataGrid model={grid} rowHeight={36} pagination={false} height={220} />
      </>,
    );
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    const viewport = screen.getByRole("grid"),
      outside = screen.getByRole("button", { name: "Outside anchor" });
    outside.focus();
    fireEvent.scroll(viewport, { target: { scrollTop: 1080 } });
    await waitFor(() => expect(cell("r29", "amount")).toBeTruthy());
    const anchor = cell("r29", "amount");
    heights.set(metricKey("r0"), 180);
    await observed();
    await waitFor(() => expect(viewport.scrollTop).toBe(1200));
    expect(cell("r29", "amount")).toBe(anchor);
    expect(document.activeElement).toBe(outside);
    expect(viewport.style.overflowAnchor).toBe("none");
  });
  it("preserves a visible focused row when width invalidates offscreen estimates", async () => {
    const grid = createGrid<Row>({
      rows: Array.from({ length: 80 }, (_, index) => ({
        ...data[0],
        id: `r${index}`,
        amount: index,
      })),
      getRowId: (row) => row.id,
      columns,
    });
    heights.set(metricKey("r0"), 60);
    render(
      <DataGrid model={grid} rowHeight={36} pagination={false} height={220} />,
    );
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    const viewport = screen.getByRole("grid");
    fireEvent.scroll(viewport, { target: { scrollTop: 1080 } });
    await waitFor(() => expect(cell("r30", "amount")).toBeTruthy());
    const anchor = cell("r30", "amount");
    act(() => anchor.focus());
    await observed();
    act(() => grid.resizeColumn("description", 240));
    await waitFor(() => expect(viewport.scrollTop).toBe(1044));
    expect(document.activeElement).toBe(anchor);
    expect(cell("r30", "amount")).toBe(anchor);
  });
  it("anchors focused detail content through changes above and inside its master row", async () => {
    const grid = createGrid<Row>({
      rows: Array.from({ length: 80 }, (_, index) => ({
        ...data[0],
        id: `r${index}`,
        amount: index,
      })),
      getRowId: (row) => row.id,
      columns,
    });
    heights.set(metricKey("r0"), 60);
    render(
      <DataGrid
        model={grid}
        rowHeight={36}
        pagination={false}
        height={220}
        detailHeight={120}
        renderDetail={({ rowId }) => (
          <button type="button">Detail action {rowId}</button>
        )}
      />,
    );
    await waitFor(() => expect(rowHeight()).toBe("72px"));
    const viewport = screen.getByRole("treegrid");
    fireEvent.scroll(viewport, { target: { scrollTop: 1080 } });
    await waitFor(() => expect(cell("r29")).toBeTruthy());
    fireEvent.click(
      cell("r29").querySelector<HTMLButtonElement>("button[aria-expanded]")!,
    );
    const detail = await screen.findByRole("button", {
      name: "Detail action r29",
    });
    await observed();
    act(() => detail.focus());
    const before = viewport.scrollTop;
    heights.set(metricKey("r0"), 180);
    heights.set(metricKey("r29"), 80);
    await observed();
    await waitFor(() => expect(viewport.scrollTop).toBe(before + 176));
    expect(document.activeElement).toBe(detail);
  });
  it("renders estimates without browser measurement during SSR", () => {
    const html = renderToString(<DataGrid model={model()} rowHeight={36} />);
    expect(html).toContain("og-auto-height");
    expect(TestObserver.instances).toEqual([]);
    expect(html).toContain("height:36px");
  });
  it("rejects invalid flags and configured column budgets before observing cells", () => {
    expect(() =>
      renderToString(
        <DataGrid
          model={model([{ ...columns[0], autoHeight: "yes" as never }])}
        />,
      ),
    ).toThrow(/boolean/);
    const tooMany = Array.from({ length: 9 }, (_, index): Column<Row> => ({
      id: `auto${index}`,
      header: `Auto ${index}`,
      autoHeight: true,
    }));
    expect(() => renderToString(<DataGrid model={model(tooMany)} />)).toThrow(
      /eight/,
    );
    expect(TestObserver.instances).toEqual([]);
  });
});
