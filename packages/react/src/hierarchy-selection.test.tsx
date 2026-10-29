// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createGrid } from "../../core/src/index.js";
import { DataGrid } from "./data-grid.js";
import { GridLocaleProvider, esES } from "./locale.js";
import { useHierarchySelection } from "./use-hierarchy-selection.js";
const grouped = () =>
  createGrid({
    rows: [
      { id: "a", region: "north", amount: 1 },
      { id: "b", region: "north", amount: 2 },
      { id: "c", region: "south", amount: 3 },
    ],
    columns: [
      { id: "region", field: "region", header: "Region" },
      {
        id: "amount",
        field: "amount",
        header: "Amount",
        type: "number",
        editable: true,
      },
    ],
    getRowId: (row) => row.id,
    initialState: { groupBy: ["region"], pageSize: 1 },
  });
const selected = (model: ReturnType<typeof grouped>) =>
  [...model.getState().selected].sort();
const checkbox = (name: string) =>
  screen.getByRole<HTMLInputElement>("checkbox", { name });
const gridCell = (id: string) =>
  [
    ...document.querySelectorAll<HTMLElement>('[role="gridcell"][data-row-id]'),
  ].find((element) => element.dataset.rowId === id)!;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("resident hierarchy selection UI", () => {
  it("restores native mixed state after a rejected click and recovers on the next action", () => {
    const model = grouped();
    model.selectRows(["b"]);
    render(<DataGrid model={model} hierarchySelection="subtree" />);
    const input = checkbox("Select subtree north"),
      before = model.getState();
    expect(input.indeterminate).toBe(true);
    vi.spyOn(model, "getHierarchySelectionPlan").mockImplementationOnce(() => {
      throw new Error("Temporary hierarchy failure");
    });
    fireEvent.click(input);
    expect(model.getState()).toBe(before);
    expect(input.indeterminate).toBe(true);
    expect(input.checked).toBe(false);
    expect(input.getAttribute("aria-checked")).toBe("mixed");
    expect(screen.getByRole("alert").textContent).toContain(
      "Temporary hierarchy failure",
    );
    fireEvent.click(input);
    expect(selected(model)).toEqual(["a", "b"]);
    expect(input.indeterminate).toBe(false);
    expect(input.checked).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("selects collapsed and off-page source descendants with one publication and no synthetic IDs", () => {
    const model = grouped(),
      changed = vi.fn();
    render(<DataGrid model={model} hierarchySelection="subtree" />);
    const stop = model.subscribe(changed);
    fireEvent.click(checkbox("Select subtree north"));
    expect(selected(model)).toEqual(["a", "b"]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(checkbox("Select subtree north").checked).toBe(true);
    expect(checkbox("Select page subtrees").checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: "Select row b" })).toBeNull();
    fireEvent.click(checkbox("Select subtree north"));
    expect(selected(model)).toEqual([]);
    stop();
  });
  it("derives native mixed group/page state and Space selects the remaining descendants", () => {
    const model = grouped();
    model.selectRows(["b", "c"]);
    render(<DataGrid model={model} hierarchySelection="subtree" />);
    const group = checkbox("Select subtree north"),
      header = checkbox("Select page subtrees");
    expect(group.indeterminate).toBe(true);
    expect(group.getAttribute("aria-checked")).toBe("mixed");
    expect(header.indeterminate).toBe(true);
    const cell = gridCell(model.getPageRows()[0].id);
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: " " });
    expect(selected(model)).toEqual(["a", "b", "c"]);
    expect(group.indeterminate).toBe(false);
    expect(group.checked).toBe(true);
    expect(header.indeterminate).toBe(false);
    expect(document.activeElement).toBe(cell);
  });
  it("preserves filtered-out selections and changes scope without clearing history", () => {
    const model = grouped();
    model.editCell("a", "amount", "4");
    model.setFilter("amount", { op: "gte", value: 2 });
    model.selectRows(["c"]);
    const view = render(
      <DataGrid model={model} hierarchySelection="filteredSubtree" />,
    );
    fireEvent.click(checkbox("Select subtree north"));
    expect(selected(model)).toEqual(["a", "b", "c"]);
    act(() => model.setFilter("amount", { op: "gte", value: 5 }));
    expect(checkbox("Select page subtrees").disabled).toBe(true);
    act(() => model.setFilter("amount", { op: "between", value: 2, to: 3 }));
    fireEvent.click(checkbox("Select subtree north"));
    expect(selected(model)).toEqual(["a", "c"]);
    view.rerender(<DataGrid model={model} hierarchySelection="subtree" />);
    expect(checkbox("Select subtree north").indeterminate).toBe(true);
    fireEvent.click(checkbox("Select page subtrees"));
    expect(selected(model)).toEqual(["a", "b", "c"]);
    act(() => model.undo());
    expect(model.getRow("a")!.amount).toBe(1);
  });
  it("unions overlapping expanded rows on a page and keeps another page's selection", () => {
    const model = grouped(),
      north = model.getRowModel()[0].id;
    model.setState({ pageSize: 3, expanded: [north], selected: ["b", "c"] });
    render(<DataGrid model={model} hierarchySelection="subtree" />);
    expect(checkbox("Select page subtrees").indeterminate).toBe(true);
    fireEvent.click(checkbox("Select page subtrees"));
    expect(selected(model)).toEqual(["a", "b", "c"]);
    fireEvent.click(checkbox("Select page subtrees"));
    expect(selected(model)).toEqual(["c"]);
  });
  it("keeps self/single/none policies explicit and shows mixed native page state", () => {
    const model = grouped(),
      north = model.getRowModel()[0].id;
    model.setState({ pageSize: 4, expanded: [north], selected: ["a"] });
    const view = render(<DataGrid model={model} />);
    expect(
      screen.queryByRole("checkbox", { name: "Select subtree north" }),
    ).toBeNull();
    expect(checkbox("Select all rows on page").indeterminate).toBe(true);
    view.rerender(
      <DataGrid
        model={model}
        hierarchySelection="subtree"
        selectionMode="single"
      />,
    );
    expect(
      screen.queryByRole("checkbox", { name: "Select subtree north" }),
    ).toBeNull();
    fireEvent.click(checkbox("Select row b"));
    expect(selected(model)).toEqual(["b"]);
    view.rerender(
      <DataGrid
        model={model}
        hierarchySelection="subtree"
        selectionMode="none"
      />,
    );
    expect(screen.queryByRole("checkbox", { name: "Select row b" })).toBeNull();
  });
  it("selects a data-bearing source parent but filters retained nonmatching ancestors", () => {
    const model = createGrid({
      rows: [
        { id: "p", path: ["Root"], amount: 1 },
        { id: "c", path: ["Root", "Child"], amount: 8 },
      ],
      columns: [{ id: "amount", field: "amount", type: "number" }],
      getRowId: (row) => row.id,
      getTreePath: (row) => row.path,
    });
    const view = render(
      <DataGrid model={model} hierarchySelection="subtree" />,
    );
    fireEvent.click(checkbox("Select subtree Root"));
    expect(model.getState().selected).toEqual(["p", "c"]);
    act(() => {
      model.selectRows(["p"]);
      model.setFilter("amount", { op: "gt", value: 5 });
    });
    view.rerender(
      <DataGrid model={model} hierarchySelection="filteredSubtree" />,
    );
    expect(checkbox("Select subtree Root").indeterminate).toBe(false);
    fireEvent.click(checkbox("Select subtree Root"));
    expect(model.getState().selected).toEqual(["p", "c"]);
    fireEvent.click(checkbox("Select subtree Root"));
    expect(model.getState().selected).toEqual(["p"]);
  });
  it("retains checkbox identity and mixed state through localization/direction changes", () => {
    const model = grouped();
    model.selectRows(["b"]);
    const view = render(
        <GridLocaleProvider>
          <DataGrid model={model} hierarchySelection="subtree" />
        </GridLocaleProvider>,
      ),
      original = checkbox("Select subtree north");
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <DataGrid model={model} hierarchySelection="subtree" direction="rtl" />
      </GridLocaleProvider>,
    );
    expect(checkbox("Seleccionar subárbol north").indeterminate).toBe(true);
    expect(selected(model)).toEqual(["b"]);
    expect(checkbox("Seleccionar subárbol north")).toBe(original);
    const retained = checkbox("Seleccionar subárbol north");
    view.rerender(
      <GridLocaleProvider>
        <DataGrid model={model} hierarchySelection="subtree" direction="ltr" />
      </GridLocaleProvider>,
    );
    expect(checkbox("Select subtree north")).toBe(retained);
    expect(retained.indeterminate).toBe(true);
  });
  it("surfaces unavailable planning without falling back to source-only selection", () => {
    const model = grouped(),
      spy = vi
        .spyOn(model, "getHierarchySelectionPlan")
        .mockImplementation(() => {
          throw new Error("Selection budget unavailable");
        });
    model.selectRows(["c"]);
    render(<DataGrid model={model} hierarchySelection="subtree" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Selection budget unavailable",
    );
    expect(checkbox("Select subtree north").disabled).toBe(true);
    fireEvent.keyDown(gridCell(model.getPageRows()[0].id), { key: " " });
    expect(selected(model)).toEqual(["c"]);
    spy.mockRestore();
    act(() => model.setState({ pageSize: 2 }));
    expect(checkbox("Select subtree north").disabled).toBe(false);
  });
});

describe("authoritative hierarchy commands", () => {
  it("reads newer selection even when the rendered mirror has not advanced", () => {
    const model = grouped(),
      snapshot = model.getState(),
      nodes = model.getPageRows(),
      north = nodes[0].id;
    const hook = renderHook(() =>
      useHierarchySelection(model, snapshot, "subtree", true, nodes),
    );
    model.selectRows(["c"]);
    act(() => {
      expect(hook.result.current.toggle([north])).toBe(true);
    });
    expect(selected(model)).toEqual(["a", "b", "c"]);
  });
  it("fences a model update during planning and retains the concurrent selection", () => {
    const model = grouped(),
      snapshot = model.getState(),
      nodes = model.getPageRows(),
      north = nodes[0].id;
    const hook = renderHook(() =>
      useHierarchySelection(model, snapshot, "subtree", true, nodes),
    );
    const original = model.getHierarchySelectionPlan;
    vi.spyOn(model, "getHierarchySelectionPlan").mockImplementationOnce(
      (options) => {
        const plan = original(options);
        model.selectRows(["c"]);
        return plan;
      },
    );
    act(() => {
      expect(hook.result.current.toggle([north])).toBe(false);
    });
    expect(selected(model)).toEqual(["c"]);
    expect(hook.result.current.error?.notice.key).toBe("hierarchy.changed");
  });
});
