// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type Column } from "../../core/src/index";
import { DataGrid } from "./index";
type Row = {
  id: string;
  name: string;
  actual: number;
  budget: number;
  prior: number;
  status: string;
  notes: string;
};
const columns: Column<Row>[] = [
  {
    id: "name",
    field: "name",
    header: "Name",
    width: 160,
    pinned: "left",
    groupPath: ["Identity"],
  },
  {
    id: "actual",
    field: "actual",
    header: "Actual",
    width: 100,
    type: "number",
    groupPath: ["Financials", "Current"],
  },
  {
    id: "budget",
    field: "budget",
    header: "Budget",
    width: 100,
    type: "number",
    groupPath: ["Financials", "Current"],
  },
  {
    id: "prior",
    field: "prior",
    header: "Prior",
    width: 100,
    type: "number",
    groupPath: ["Financials", "Prior period"],
  },
  { id: "status", field: "status", header: "Status", width: 120 },
  {
    id: "notes",
    field: "notes",
    header: "Notes",
    width: 120,
    pinned: "right",
    groupPath: ["Identity"],
  },
];
const rows: Row[] = [
  {
    id: "r1",
    name: "One",
    actual: 10,
    budget: 12,
    prior: 9,
    status: "Open",
    notes: "First",
  },
  {
    id: "r2",
    name: "Two",
    actual: 20,
    budget: 18,
    prior: 15,
    status: "Closed",
    notes: "Second",
  },
];
const make = () => createGrid({ rows, columns, getRowId: (row) => row.id });
function groupCells(path: string[]) {
  return [...document.querySelectorAll<HTMLElement>(".og-header-group")].filter(
    (cell) =>
      cell.dataset.groupPath === JSON.stringify(path) &&
      cell.dataset.groupDepth === String(path.length - 1),
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("DataGrid column-group integration", () => {
  it("shifts header/filter/data ARIA rows and keeps group regions aligned with pinning", () => {
    render(
      <DataGrid toolbar={false} model={make()} ariaLabel="Grouped data" />,
    );
    const grid = screen.getByRole("grid", { name: "Grouped data" });
    expect(grid.getAttribute("aria-rowcount")).toBe("6");
    const first = document
      .querySelector('[data-row-id="r1"]')!
      .closest('[role="row"]')!;
    expect(first.getAttribute("aria-rowindex")).toBe("5");
    expect(
      screen
        .getByRole("button", { name: "Sort Actual" })
        .closest('[role="row"]')!
        .getAttribute("aria-rowindex"),
    ).toBe("3");
    expect(
      screen
        .getByRole("textbox", { name: "Filter Actual" })
        .closest('[role="row"]')!
        .getAttribute("aria-rowindex"),
    ).toBe("4");
    const identity = groupCells(["Identity"]);
    expect(identity).toHaveLength(2);
    expect(identity[0].style.left).toBe("44px");
    expect(identity[1].style.right).toBe("0px");
    expect(groupCells(["Financials"])[0].getAttribute("aria-colspan")).toBe(
      "3",
    );
  });
  it("collapses and restores child columns without revealing a previously hidden member", () => {
    const model = make();
    model.hideColumn("prior", true);
    render(<DataGrid toolbar={false} model={model} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse column group Financials" }),
    );
    expect(screen.queryByRole("button", { name: "Sort Budget" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sort Prior" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sort Actual" })).toBeTruthy();
    const expand = screen.getByRole("button", {
      name: "Expand column group Financials",
    });
    expect(expand.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(expand);
    expect(screen.getByRole("button", { name: "Sort Budget" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sort Prior" })).toBeNull();
  });
  it("restores nested collapse policy when toggling a child under a collapsed ancestor", () => {
    render(<DataGrid toolbar={false} model={make()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Collapse column group Financials / Current",
      }),
    );
    expect(screen.queryByRole("button", { name: "Sort Budget" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sort Prior" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse column group Financials" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand column group Financials / Current",
      }),
    );
    expect(screen.getByRole("button", { name: "Sort Budget" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort Prior" })).toBeTruthy();
  });
  it("splits and rejoins nested header segments after reorder, hide and resize", () => {
    const model = make();
    render(<DataGrid toolbar={false} model={model} />);
    act(() => model.moveColumn("prior", 2));
    expect(groupCells(["Financials", "Current"])).toHaveLength(2);
    act(() => {
      model.hideColumn("prior", true);
      model.resizeColumn("actual", 140);
    });
    const current = groupCells(["Financials", "Current"]);
    expect(current).toHaveLength(1);
    expect(current[0].style.width).toBe("240px");
    expect(current[0].getAttribute("aria-colspan")).toBe("2");
  });
  it("supports disabling group presentation and resetting on model replacement", () => {
    const model = make();
    const view = render(<DataGrid toolbar={false} model={model} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse column group Financials" }),
    );
    const replacement = make();
    view.rerender(<DataGrid toolbar={false} model={replacement} />);
    expect(
      screen.getByRole("button", { name: "Collapse column group Financials" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort Budget" })).toBeTruthy();
    view.rerender(
      <DataGrid toolbar={false} model={replacement} columnGroups={false} />,
    );
    expect(document.querySelector(".og-group-headers")).toBeNull();
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("4");
    expect(
      document
        .querySelector('[data-row-id="r1"]')!
        .closest('[role="row"]')!
        .getAttribute("aria-rowindex"),
    ).toBe("3");
  });
  it("moves focus to the surviving toggle when collapsing a group split across pins", () => {
    render(<DataGrid toolbar={false} model={make()} />);
    const toggles = screen.getAllByRole("button", {
      name: "Collapse column group Identity",
    });
    const disappearing = toggles.at(-1)!;
    disappearing.focus();
    fireEvent.click(disappearing);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Expand column group Identity" }),
    );
  });
  it("keeps wide group labels and toggles in the currently visible middle of the group", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    type Wide = { id: string; [key: string]: string };
    const row: Wide = { id: "r" };
    const columns: Column<Wide>[] = Array.from({ length: 100 }, (_, index) => {
      row[`c${index}`] = String(index);
      return {
        id: `c${index}`,
        field: `c${index}`,
        width: 100,
        groupPath: ["Wide section"],
      };
    });
    render(
      <DataGrid
        toolbar={false}
        model={createGrid({ rows: [row], columns, getRowId: (row) => row.id })}
        selectionMode="none"
        columnOverscan={0}
      />,
    );
    const viewport = screen.getByRole("grid");
    viewport.scrollLeft = 5000;
    fireEvent.scroll(viewport);
    const content = document.querySelector<HTMLElement>(
      ".og-header-group-content",
    )!;
    expect(parseFloat(content.style.marginLeft)).toBeGreaterThan(4900);
    expect(parseFloat(content.style.maxWidth)).toBeLessThanOrEqual(500);
    expect(
      screen.getByRole("button", {
        name: "Collapse column group Wide section",
      }),
    ).toBeTruthy();
    expect(document.querySelectorAll(".og-header-group")).toHaveLength(1);
  });
});
