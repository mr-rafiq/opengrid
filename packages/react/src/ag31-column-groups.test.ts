import { expect, it, vi } from "vitest";
import { createAg31ColumnGroups } from "./ag31-column-groups.js";
import { createAg31ClientController } from "./ag31-client-controller.js";

const definitions = [
  { field: "id" },
  {
    headerName: "Details",
    children: [
      { field: "a" },
      { field: "b", columnGroupShow: "open" },
      { field: "c", columnGroupShow: "closed" },
    ],
  },
  {
    groupId: "other",
    headerName: "Details",
    openByDefault: true,
    children: [{ field: "d" }, { field: "e", columnGroupShow: "open" }],
  },
];
it("keeps group display separate from leaf visibility and declared hidden state", () => {
  const c = createAg31ClientController({
    rows: [{ id: "one" }],
    getRowId: (r) => r.id,
    definitions,
  });
  const ids = () => c.api.getAllDisplayedColumns()!.map((c) => c.getColId());
  expect(ids()).toEqual(["id", "a", "c", "d", "e"]);
  expect(c.api.getColumn("b")!.isVisible()).toBe(true);
  expect(c.api.getColumnState()!.find((c) => c.colId === "b")!.hide).toBe(
    false,
  );
  const before = c.api.getColumnState();
  c.api.setColumnGroupOpened("0", true);
  expect(ids()).toEqual(["id", "a", "b", "d", "e"]);
  expect(c.api.getColumnState()).toEqual(before);
  c.api.applyColumnState({ state: [{ colId: "b", hide: true }] });
  c.api.setColumnGroupOpened("0", false);
  c.api.setColumnGroupOpened("0", true);
  expect(c.api.getColumn("b")!.isVisible()).toBe(false);
  expect(ids()).not.toContain("b");
  c.api.destroy();
});
it("includes balanced padding groups and stable distinct identities for equal captions", () => {
  const g = createAg31ColumnGroups(definitions, () => {});
  expect(g.getColumnGroupState()).toEqual([
    { groupId: "1", open: false },
    { groupId: "0", open: false },
    { groupId: "other", open: true },
  ]);
  expect(g.getPath("id")).toEqual([{ key: "1", label: "", padding: true }]);
  expect(g.getPath("a")).toEqual([{ key: "0", label: "Details" }]);
  expect(g.getPath("d")).toEqual([{ key: "other", label: "Details" }]);
  expect(g.canToggle(["1"])).toBe(false);
  expect(g.canToggle(["0"])).toBe(true);
});
it("resets initial open state without changing definitions or caller snapshots", () => {
  const changed = vi.fn(),
    g = createAg31ColumnGroups(definitions, changed);
  const input = [
    { groupId: "0", open: true },
    { groupId: "other", open: false },
    { groupId: "missing", open: true },
  ];
  g.setColumnGroupState(input);
  expect(changed).toHaveBeenCalledTimes(1);
  input[0].open = false;
  const state = g.getColumnGroupState();
  state[1].open = false;
  expect(g.isExpanded(["0"])).toBe(true);
  g.resetColumnGroupState();
  expect(g.isExpanded(["0"])).toBe(false);
  expect(g.isExpanded(["other"])).toBe(true);
  expect(definitions[2].openByDefault).toBe(true);
});
it("rejects accessors atomically and never executes them", () => {
  const changed = vi.fn(),
    g = createAg31ColumnGroups(definitions, changed),
    read = vi.fn();
  const bad = Object.defineProperty({ groupId: "other" }, "open", {
    get: read,
  });
  expect(() =>
    g.setColumnGroupState([{ groupId: "0", open: true }, bad as never]),
  ).toThrow(/boolean/);
  expect(g.isExpanded(["0"])).toBe(false);
  expect(read).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});
it("nested conditions apply at each original parent edge", () => {
  const g = createAg31ColumnGroups(
    [
      {
        groupId: "outer",
        headerName: "Outer",
        children: [
          { field: "a" },
          {
            groupId: "inner",
            headerName: "Inner",
            columnGroupShow: "open",
            children: [{ field: "b" }, { field: "c", columnGroupShow: "open" }],
          },
        ],
      },
    ],
    () => {},
  );
  expect(g.isColumnDisplayed("a")).toBe(true);
  expect(g.isColumnDisplayed("b")).toBe(false);
  g.setColumnGroupOpened("outer", true);
  expect(g.isColumnDisplayed("b")).toBe(true);
  expect(g.isColumnDisplayed("c")).toBe(false);
  g.setColumnGroupOpened("inner", true);
  expect(g.isColumnDisplayed("c")).toBe(true);
});
it("flat leaf definitions do not invent groups", () => {
  const g = createAg31ColumnGroups([{ field: "a" }], () => {});
  expect(g.getColumnGroupState()).toEqual([]);
  expect(g.getPath("a")).toEqual([]);
});

it("hidden children recompute expansion without hiding the surviving closed-only column", () => {
  const c = createAg31ClientController({
    rows: [{ id: "one" }],
    getRowId: (r) => r.id,
    definitions,
  });
  c.api.setColumnGroupOpened("0", true);
  c.api.applyColumnState({
    state: [
      { colId: "a", hide: true },
      { colId: "b", hide: true },
    ],
  });
  expect(c.api.getAllDisplayedColumns()!.map((c) => c.colId)).toContain("c");
  expect(c.groups.canToggle(["0"])).toBe(false);
  c.api.destroy();
});

it("generated IDs skip numeric explicit IDs and nested snapshots use source postorder", () => {
  const g = createAg31ColumnGroups(
    [
      { groupId: "0", headerName: "A", children: [{ field: "a" }] },
      { headerName: "B", children: [{ field: "b" }] },
    ],
    () => {},
  );
  expect(g.getColumnGroupState().map((g) => g.groupId)).toEqual(["0", "1"]);
  const nested = createAg31ColumnGroups(
    [
      {
        groupId: "outer",
        headerName: "Outer",
        children: [
          { field: "a" },
          { groupId: "inner", headerName: "Inner", children: [{ field: "b" }] },
        ],
      },
      { field: "id" },
    ],
    () => {},
  );
  expect(nested.getColumnGroupState().map((g) => g.groupId)).toEqual([
    "0",
    "inner",
    "outer",
    "2",
    "1",
  ]);
});
