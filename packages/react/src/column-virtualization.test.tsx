// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid, type Column } from "../../core/src/index";
import { DataGrid } from "./index";
type WideRow = { id: string; [key: string]: string };
function wide() {
  const columns: Column<WideRow>[] = Array.from({ length: 100 }, (_, i) => ({
    id: `c${i}`,
    field: `c${i}`,
    header: `Column ${i}`,
    width: 100,
    pinned: i === 0 ? "left" : i === 99 ? "right" : null,
  }));
  const row: WideRow = { id: "row" };
  for (let i = 0; i < 100; i++) row[`c${i}`] = `Value ${i}`;
  return createGrid({ rows: [row], columns, getRowId: (r) => r.id });
}
function getCell(id: string) {
  return document.querySelector<HTMLElement>(
    `[data-row-id="row"][data-column-id="${id}"]`,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("horizontal React virtualization", () => {
  it("bounds center DOM and preserves full ARIA indices plus both pinned regions", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    render(<DataGrid model={wide()} selectionMode="none" columnOverscan={0} />);
    const viewport = screen.getByRole("grid");
    expect(viewport.getAttribute("aria-colcount")).toBe("100");
    expect(within(viewport).getAllByRole("columnheader").length).toBeLessThan(
      10,
    );
    expect(getCell("c0")).toBeTruthy();
    expect(getCell("c99")).toBeTruthy();
    expect(getCell("c50")).toBeNull();
    viewport.scrollLeft = 4500;
    fireEvent.scroll(viewport);
    expect(getCell("c46")?.getAttribute("aria-colindex")).toBe("47");
    expect(getCell("c0")).toBeTruthy();
    expect(getCell("c99")?.style.right).toBe("0px");
    expect(within(viewport).getAllByRole("columnheader").length).toBeLessThan(
      12,
    );
    expect(
      viewport.querySelector("[role=presentation][aria-hidden=true]"),
    ).toBeTruthy();
  });
  it("moves keyboard focus through an unmounted center column and back across pinning", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
    render(<DataGrid model={wide()} selectionMode="none" columnOverscan={0} />);
    const first = getCell("c0")!;
    first.focus();
    fireEvent.keyDown(first, { key: "End", ctrlKey: true });
    const last = getCell("c99")!;
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(getCell("c98"));
    expect(screen.getByRole("grid").scrollLeft).toBeGreaterThan(9000);
    fireEvent.keyDown(getCell("c98")!, { key: "Home", ctrlKey: true });
    expect(document.activeElement).toBe(getCell("c0"));
  });
  it("updates pinned offsets and logical indices after resize, reorder and hide", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    const grid = wide();
    render(<DataGrid model={grid} selectionMode="none" columnOverscan={0} />);
    act(() => {
      grid.pinColumn("c50", "left");
      grid.resizeColumn("c0", 150);
    });
    expect(getCell("c50")?.style.left).toBe("150px");
    expect(getCell("c50")?.getAttribute("aria-colindex")).toBe("2");
    act(() => {
      grid.moveColumn("c50", 0);
      grid.hideColumn("c0", true);
    });
    expect(getCell("c50")?.style.left).toBe("0px");
    expect(getCell("c50")?.getAttribute("aria-colindex")).toBe("1");
    expect(getCell("c0")).toBeNull();
  });
  it("can disable horizontal virtualization and clamps scroll after schema layout changes", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    const grid = wide();
    const view = render(
      <DataGrid model={grid} selectionMode="none" virtualizeColumns={false} />,
    );
    expect(
      within(screen.getByRole("grid")).getAllByRole("columnheader"),
    ).toHaveLength(100);
    view.rerender(
      <DataGrid model={grid} selectionMode="none" columnOverscan={0} />,
    );
    const viewport = screen.getByRole("grid");
    viewport.scrollLeft = 9500;
    fireEvent.scroll(viewport);
    act(() => {
      for (let i = 5; i < 99; i++) grid.hideColumn(`c${i}`, true);
    });
    expect(viewport.scrollLeft).toBe(100);
    expect(getCell("c4")).toBeTruthy();
  });
});
