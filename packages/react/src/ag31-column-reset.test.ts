import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller";
class Record {
  constructor(
    public id: string,
    public team: string,
    public amount: number,
  ) {}
  label() {
    return this.id;
  }
}
it("restores declared columns and query while preserving source identity, selection and filters", () => {
  const rows = [
      new Record("a", "East", 8),
      new Record("b", "West", 2),
      new Record("c", "East", 4),
    ],
    definitions = [
      {
        field: "team",
        width: 180,
        pinned: "left" as const,
        rowGroup: true,
        filter: "agTextColumnFilter",
      },
      { field: "amount", width: 120, sort: "asc" as const },
      { colId: "label", valueGetter: ({ data }: any) => data?.label() },
    ],
    c = createAg31ClientController({
      rows,
      definitions,
      getRowId: (r) => r.id,
      defaultColDef: { enableRowGroup: true },
    });
  const node = c.api.getRowNode("a"),
    column = c.api.getColumn("amount");
  expect(c.model.getState().groupBy).toEqual(["team"]);
  expect(c.model.getState().sorting).toEqual([
    { columnId: "amount", direction: "asc" },
  ]);
  c.api.setFilterModel({
    team: { filterType: "text", type: "equals", filter: "East" },
  });
  node!.setSelected(true);
  c.api.applyColumnState({
    applyOrder: true,
    state: [
      {
        colId: "label",
        width: 210,
        pinned: "right",
        hide: true,
        sort: "desc",
        sortIndex: 0,
      },
      {
        colId: "amount",
        width: 230,
        sort: null,
        rowGroup: true,
        rowGroupIndex: 0,
      },
      { colId: "team", width: 250, pinned: null, rowGroup: false, sort: null },
    ],
  });
  c.api.resetColumnState();
  expect(
    c.api
      .getColumnState()!
      .map(({ colId, width, pinned, hide, sort, rowGroup }: any) => ({
        colId,
        width,
        pinned,
        hide,
        sort,
        rowGroup,
      })),
  ).toEqual([
    {
      colId: "team",
      width: 180,
      pinned: "left",
      hide: false,
      sort: null,
      rowGroup: true,
    },
    {
      colId: "amount",
      width: 120,
      pinned: null,
      hide: false,
      sort: "asc",
      rowGroup: false,
    },
    {
      colId: "label",
      width: 210,
      pinned: null,
      hide: false,
      sort: null,
      rowGroup: false,
    },
  ]);
  expect(c.api.getFilterModel()).toEqual({
    team: { filterType: "text", type: "equals", filter: "East" },
  });
  expect(c.api.getRowNode("a")).toBe(node);
  expect(node!.data).toBe(rows[0]);
  expect(c.api.getColumn("amount")).toBe(column);
  expect(c.api.getSelectedRows()).toEqual([rows[0]]);
  expect(c.api.getColumn("team")!.getUserProvidedColDef()).toBe(definitions[0]);
  c.api.destroy();
});
it("native model initial state overrides declared defaults but reset returns to declaration", () => {
  const c = createAg31ClientController({
    rows: [new Record("a", "East", 8)],
    definitions: [
      { field: "team", rowGroup: true },
      { field: "amount", sort: "desc" },
    ],
    getRowId: (r) => r.id,
    defaultColDef: { enableRowGroup: true },
    initialState: { groupBy: [], sorting: [] },
  });
  expect(c.model.getState().groupBy).toEqual([]);
  expect(c.model.getState().sorting).toEqual([]);
  c.columnApi.resetColumnState();
  expect(c.model.getState().groupBy).toEqual(["team"]);
  expect(c.model.getState().sorting).toEqual([
    { columnId: "amount", direction: "desc" },
  ]);
  c.api.destroy();
});

it("discards a rejected candidate hierarchy without changing committed nodes or publishing group events", () => {
  vi.useFakeTimers();
  let reject = false;
  const seen: any[] = [];
  const c = createAg31ClientController({
    rows: [
      new Record("a", "East", 8),
      new Record("b", "West", 2),
      new Record("c", "East", 4),
    ],
    getRowId: (r) => r.id,
    defaultColDef: { enableRowGroup: true },
    definitions: [
      { field: "team", rowGroup: true },
      { field: "amount" },
      { colId: "duplicate", valueGetter: (p: any) => p.data?.team },
      {
        colId: "computed",
        sort: "asc",
        valueGetter: (p: any) => {
          if (!p.node.group) return p.data.amount;
          seen.push(p.node);
          if (reject && p.node.field === "duplicate")
            throw new Error("Blocked candidate group");
          return (p.node.allLeafChildren ?? []).reduce(
            (sum: number, node: any) => sum + node.data.amount,
            0,
          );
        },
      },
    ],
  });
  try {
    const beforeNodes: any[] = [];
    c.api.forEachNode((node) => {
      if (node.group) beforeNodes.push(node);
    });
    vi.runOnlyPendingTimers();
    const beforeState = c.model.getState(),
      events = vi.fn();
    c.api.addEventListener("columnRowGroupChanged", events);
    reject = true;
    expect(() =>
      c.api.applyColumnState({
        state: [
          { colId: "team", rowGroup: false },
          { colId: "duplicate", rowGroup: true, rowGroupIndex: 0 },
        ],
      }),
    ).toThrow("Blocked candidate group");
    expect(c.model.getState()).toBe(beforeState);
    const afterNodes: any[] = [];
    c.api.forEachNode((node) => {
      if (node.group) afterNodes.push(node);
    });
    expect(afterNodes).toEqual(beforeNodes);
    afterNodes.forEach((node, index) => expect(node).toBe(beforeNodes[index]));
    vi.runOnlyPendingTimers();
    expect(events).not.toHaveBeenCalled();
    expect(seen.length).toBeGreaterThan(0);
    reject = false;
    const beforeSuccess = seen.length;
    c.api.applyColumnState({
      state: [
        { colId: "team", rowGroup: false },
        { colId: "duplicate", rowGroup: true, rowGroupIndex: 0 },
      ],
    });
    const committed: any[] = [];
    c.api.forEachNode((node) => {
      if (node.group) committed.push(node);
    });
    const candidates = seen
      .slice(beforeSuccess)
      .filter((node) => node.field === "duplicate");
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates)
      expect(committed.some((node) => node === candidate)).toBe(true);
  } finally {
    c.api.destroy();
    vi.useRealTimers();
  }
});

it("uses initial pinning on construction and reset while retaining undeclared widths and raw sort indices", () => {
  const c = createAg31ClientController({
    rows: [new Record("a", "East", 1)],
    getRowId: (r) => r.id,
    definitions: [
      {
        field: "team",
        initialPinned: "right",
        sort: null,
        initialSort: "desc",
        sortIndex: -1,
      },
      { field: "amount", sort: "asc", sortIndex: 7 },
    ],
  });
  try {
    expect(c.api.getColumn("team")!.getPinned()).toBe("right");
    expect(c.api.getColumn("team")!.getSort()).toBeUndefined();
    expect(c.api.getColumn("team")!.getSortIndex()).toBe(-1);
    c.api.applyColumnState({
      state: [
        { colId: "team", pinned: null, width: 230 },
        { colId: "amount", sort: null, sortIndex: -3 },
      ],
    });
    expect(c.api.getColumn("amount")!.getSortIndex()).toBe(-3);
    c.api.resetColumnState();
    expect(c.api.getColumn("team")!.getPinned()).toBe("right");
    expect(c.api.getColumn("team")!.getActualWidth()).toBe(230);
    expect(c.api.getColumn("team")!.getSort()).toBe("desc");
    expect(c.api.getColumn("team")!.getSortIndex()).toBe(-1);
    expect(c.api.getColumn("amount")!.getSortIndex()).toBe(7);
  } finally {
    c.api.destroy();
  }
});
