// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
afterEach(cleanup);
it("can hide or selectively show floating filters while retaining model filtering and accurate row indices", () => {
  const model = createGrid({
    rows: [
      { id: "a", name: "Alpha", amount: 3 },
      { id: "b", name: "Beta", amount: 9 },
    ],
    getRowId: (row) => row.id,
    columns: [
      { id: "name", field: "name" },
      { id: "amount", field: "amount", type: "number" },
    ],
  });
  const view = render(
    <DataGrid model={model} toolbar={false} floatingFilters={false} />,
  );
  expect(view.container.querySelector(".og-filter-row")).toBeNull();
  expect(
    view.container
      .querySelector('[data-row-id="a"]')!
      .closest('[role="row"]')!
      .getAttribute("aria-rowindex"),
  ).toBe("2");
  act(() => model.setFilter("name", { op: "contains", value: "Beta" }));
  expect(view.container.querySelector('[data-row-id="a"]')).toBeNull();
  expect(screen.getByText("Beta")).toBeTruthy();
  view.rerender(
    <DataGrid
      model={model}
      toolbar={false}
      floatingFilters={(column) => column.id === "name"}
    />,
  );
  expect(view.container.querySelectorAll(".og-filter-row input")).toHaveLength(
    1,
  );
  expect(
    view.container
      .querySelector('[data-row-id="b"]')!
      .closest('[role="row"]')!
      .getAttribute("aria-rowindex"),
  ).toBe("3");
  view.rerender(<DataGrid model={model} toolbar={false} />);
  expect(view.container.querySelectorAll(".og-filter-row input")).toHaveLength(
    2,
  );
});
it("delegates checkbox state/action scopes to a host without changing hidden selections or letting native filtered state override mixed groups", () => {
  const model = createGrid({
    rows: [
      { id: "a", team: "A", amount: 3 },
      { id: "b", team: "A", amount: 9 },
      { id: "c", team: "B", amount: 12 },
    ],
    getRowId: (row) => row.id,
    columns: [
      { id: "team", field: "team" },
      { id: "amount", field: "amount", type: "number" },
    ],
    initialState: {
      groupBy: ["team"],
      selected: ["b"],
      filters: { amount: { op: "gt", value: 5 } },
    },
  });
  const idsFor = (node: { kind: string; id: string; label?: string }) =>
    node.kind === "group"
      ? node.label === "A"
        ? ["a", "b"]
        : ["c"]
      : [node.id];
  let toggles = 0;
  const controls = {
    getRowState(node: { kind: string; id: string; label?: string }) {
      const ids = idsFor(node),
        selected = new Set(model.getState().selected),
        count = ids.filter((id) => selected.has(id)).length;
      return {
        checked: count === ids.length,
        mixed: count > 0 && count < ids.length,
        label:
          node.kind === "group"
            ? `Host group ${node.label}`
            : `Host row ${node.id}`,
      };
    },
    toggleRow(node: { kind: string; id: string; label?: string }) {
      toggles++;
      const next = new Set(model.getState().selected);
      const ids = node.kind === "group" ? ["b"] : [node.id];
      for (const id of ids)
        controls.getRowState(node).checked ? next.delete(id) : next.add(id);
      model.selectRows([...next]);
    },
    getHeaderState() {
      const count = model.getState().selected.length;
      return {
        checked: count === 3,
        mixed: count > 0 && count < 3,
        label: "All source records",
      };
    },
    toggleHeader() {
      model.selectRows(
        controls.getHeaderState().checked ? [] : ["a", "b", "c"],
      );
    },
  };
  render(
    <DataGrid
      model={model}
      toolbar={false}
      selectionCheckboxColumn="team"
      hierarchySelection="filteredSubtree"
      selectionControls={controls}
    />,
  );
  const group = screen.getByRole("checkbox", {
    name: "Host group A",
  }) as HTMLInputElement;
  expect(group.indeterminate).toBe(true);
  expect(group.closest('[role="row"]')!.getAttribute("aria-selected")).toBe(
    "false",
  );
  fireEvent.click(group);
  expect(toggles).toBe(1);
  expect(model.getState().selected).toEqual(["b"]);
  expect(group.indeterminate).toBe(true);
  act(() => model.selectRows([]));
  fireEvent.click(screen.getByRole("checkbox", { name: "All source records" }));
  expect(model.getState().selected).toEqual(["a", "b", "c"]);
  expect(
    (screen.getByRole("checkbox", { name: "Host group A" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
});
it("integrates native selection into a data column without an extra ARIA column, duplicate checkbox or sort/edit activation", () => {
  const model = createGrid({
    rows: [
      { id: "a", team: "A", amount: 3 },
      { id: "b", team: "A", amount: 9 },
      { id: "c", team: "B", amount: 12 },
    ],
    getRowId: (row) => row.id,
    columns: [
      { id: "team", field: "team", header: "Team", editable: true },
      { id: "amount", field: "amount", type: "number" },
    ],
    initialState: { groupBy: ["team"] },
  });
  const view = render(
    <DataGrid
      model={model}
      toolbar={false}
      pagination={false}
      selectionCheckboxColumn="team"
      hierarchySelection="filteredSubtree"
    />,
  );
  const grid = screen.getByRole("treegrid");
  expect(grid.getAttribute("aria-colcount")).toBe("2");
  expect(view.container.querySelectorAll(".og-selection")).toHaveLength(0);
  const firstGroup = model.getRowModel()[0];
  fireEvent.click(screen.getByRole("checkbox", { name: "Select subtree A" }));
  expect(model.getState().selected).toEqual(["a", "b"]);
  expect(model.getState().sorting).toEqual([]);
  expect(model.getState().expanded).toEqual([]);
  act(() => {
    model.toggleExpanded(firstGroup.id);
    model.setFilter("amount", { op: "gt", value: 5 });
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select subtree A" }));
  expect(model.getState().selected).toEqual(["a"]);
  const header = view.container.querySelector(
    '[data-og-size-column-id="team"]',
  )!;
  expect(header.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  fireEvent.click(header.querySelector('input[type="checkbox"]')!);
  expect(new Set(model.getState().selected)).toEqual(new Set(["a", "b", "c"]));
  expect(model.getState().sorting).toEqual([]);
  const checkbox = screen.getByRole("checkbox", { name: "Select row b" });
  fireEvent.doubleClick(checkbox);
  expect(view.container.querySelector(".og-editing")).toBeNull();
  view.rerender(
    <DataGrid
      model={model}
      toolbar={false}
      selectionCheckboxColumn="team"
      selectionMode="none"
    />,
  );
  expect(
    view.container.querySelectorAll('input[type="checkbox"]'),
  ).toHaveLength(0);
  expect(screen.getByRole("treegrid").getAttribute("aria-colcount")).toBe("2");
});
it("retains native grouping/sorting while rendering application labels, decoration and status", () => {
  const model = createGrid({
    rows: [{ id: "a", category: "Materials", value: 12 }],
    getRowId: (r) => r.id,
    columns: [
      { id: "category", field: "category", header: "Category" },
      { id: "value", field: "value", aggregate: "sum" },
    ],
    initialState: { groupBy: ["category"] },
  });
  const view = render(
    <DataGrid
      model={model}
      statusContent={<span>Filtered budget: 12</span>}
      renderHeader={({ column }) => <b>{column.header ?? column.id} summary</b>}
      renderGroupCell={({ node, column, displayValue }) =>
        column.id === "category" ? (
          <strong>Section {node.label}</strong>
        ) : (
          displayValue
        )
      }
      getRowClassName={() => "application-row"}
      getCellClassName={() => "application-cell"}
      getCellTooltip={({ node }) => `Details ${node.label}`}
    />,
  );
  expect(screen.getByText("Category summary")).toBeTruthy();
  expect(screen.getByText("Section Materials")).toBeTruthy();
  expect(screen.getByText("Filtered budget: 12")).toBeTruthy();
  expect(view.container.querySelector(".og-row.application-row")).toBeTruthy();
  expect(
    view.container.querySelector(
      '.og-cell.application-cell[title="Details Materials"]',
    ),
  ).toBeTruthy();
  const sort = screen.getByRole("button", { name: "Category summary" });
  expect(sort.getAttribute("title")).toBe("Sort Category");
  fireEvent.click(sort);
  expect(model.getState().sorting).toEqual([
    { columnId: "category", direction: "asc" },
  ]);
});
it("revokes an open editor and write commands when the model becomes read only", () => {
  const model = createGrid({
    rows: [{ id: "a", value: 1 }],
    getRowId: (r) => r.id,
    columns: [{ id: "value", field: "value", editable: true, type: "number" }],
  });
  const view = render(<DataGrid model={model} cellSelection />);
  fireEvent.doubleClick(
    view.container.querySelector('[data-row-id="a"][data-column-id="value"]')!,
  );
  expect(screen.getByRole("spinbutton")).toBeTruthy();
  act(() => model.setReadOnly(true));
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Paste cells" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Fill down selected cells",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: /Drag to fill cells/ }),
  ).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    view.container
      .querySelector('[data-row-id="a"][data-column-id="value"]')!
      .getAttribute("aria-readonly"),
  ).toBe("true");
});

it("lets a complete hierarchy renderer own its prefix without duplicate native controls and retains grid keyboard expansion", () => {
  const model = createGrid({
    rows: [{ id: "a", category: "Materials", amount: 12 }],
    getRowId: (row) => row.id,
    columns: [
      { id: "category", field: "category" },
      { id: "amount", field: "amount" },
    ],
    initialState: { groupBy: ["category"] },
  });
  const group = model.getRowModel()[0];
  const view = render(
    <DataGrid
      model={model}
      toolbar={false}
      renderTreePrefix={({ node }) =>
        node.children?.length ? (
          <button
            type="button"
            aria-label="Application expansion"
            onClick={(event) => {
              event.stopPropagation();
              model.toggleExpanded(node.id);
            }}
          >
            Open
          </button>
        ) : (
          <span>Leaf prefix</span>
        )
      }
    />,
  );
  expect(
    screen.getByRole("button", { name: "Application expansion" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Expand Materials" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Application expansion" }),
  );
  expect(model.getState().expanded).toContain(group.id);
  expect(screen.getByText("Leaf prefix")).toBeTruthy();
  expect(view.container.querySelectorAll(".og-tree-prefix")).toHaveLength(0);
  view.rerender(
    <DataGrid model={model} toolbar={false} renderTreePrefix={() => null} />,
  );
  const cell = view.container.querySelector(
    `[data-row-id='${group.id}'][data-column-id='category']`,
  )!;
  fireEvent.focus(cell);
  fireEvent.keyDown(cell, { key: "ArrowLeft" });
  expect(model.getState().expanded).not.toContain(group.id);
  fireEvent.keyDown(cell, { key: "ArrowRight" });
  expect(model.getState().expanded).toContain(group.id);
  view.rerender(<DataGrid model={model} toolbar={false} />);
  expect(
    screen.getByRole("button", { name: "Collapse Materials" }),
  ).toBeTruthy();
});

it("lets an interactive header own sort/menu controls without nested buttons and keeps native keyboard and resize", async () => {
  const model = createGrid({
    rows: [{ id: "a", amount: 3 }],
    getRowId: (r) => r.id,
    columns: [
      { id: "amount", field: "amount", header: "Amount", type: "number" },
    ],
  });
  const view = render(
    <DataGrid
      model={model}
      toolbar={false}
      renderHeaderControls={({ progressSort, showColumnMenu }) => (
        <>
          <button type="button" onClick={() => progressSort()}>
            Application sort
          </button>
          <button
            type="button"
            onClick={(event) => showColumnMenu(event.currentTarget)}
          >
            Application menu
          </button>
        </>
      )}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Application sort" }),
  ).not.toBeNull();
  const header = screen.getByRole("columnheader", { name: "Amount" });
  expect(header.querySelector(".og-sort")).toBeNull();
  expect(header.querySelector(".og-column-menu-trigger")).toBeNull();
  expect(header.querySelectorAll("button button")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Application sort" }));
  expect(model.getState().sorting).toEqual([
    { columnId: "amount", direction: "asc" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Application sort" }));
  expect(model.getState().sorting[0].direction).toBe("desc");
  fireEvent.focus(header);
  fireEvent.keyDown(header, { key: "Enter" });
  expect(model.getState().sorting).toEqual([]);
  expect(header.querySelector('[role="separator"]')).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Application menu" }));
  const menu = screen.getByRole("menu");
  expect(menu).toBeTruthy();
  fireEvent.keyDown(menu, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(
    view.container.querySelector(
      '.og-header-cell[data-og-custom-header="true"]',
    ),
  ).toBeTruthy();
});
