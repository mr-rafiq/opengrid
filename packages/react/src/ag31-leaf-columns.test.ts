import { describe, expect, it, vi } from "vitest";
import { createGrid } from "@opengrid/core";
import { createAg31RowNodes } from "./ag31-row-nodes";
import { createAg31LeafColumns } from "./ag31-leaf-columns";

const setup = () => {
  const rows = [
    { id: "a", team: "A", amount: 1 },
    { id: "b", team: "B", amount: 2 },
  ];
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      { id: "alias", field: "team", width: 151 },
      { id: "amount", field: "amount", width: 120, pinned: "left" },
    ],
  });
  const nodes = createAg31RowNodes({
    model,
    getRowId: (row) => row.id,
    rowHeight: 32,
    groupIdentity: (node) => ({ id: node.id, key: String(node.groupValue) }),
    writeCell: () => false,
  });
  const api = {},
    context = {},
    policy = vi.fn((_params: unknown) => true);
  const definitions = [
    { colId: "alias", field: "team", editable: undefined, width: undefined },
    { field: "amount", editable: policy },
  ];
  const columns = createAg31LeafColumns({
    model,
    definitions,
    defaultColDef: { editable: true, width: 151, sortable: true },
    commonParams: () => ({ api, context }),
    ownsNode: (node) => nodes.getRowNode(node.id) === node,
  });
  return { model, nodes, columns, definitions, api, context, policy, rows };
};
describe("owned AG31 leaf column contracts", () => {
  it("borrows user definitions, owns merged defaults and resolves IDs, fields and owned objects", () => {
    const { columns, definitions } = setup(),
      column = columns.getColumn("alias")!;
    expect(columns.getColumn("team")).toBeNull();
    expect(column).toBe(columns.getColumn(column));
    expect(column.getUserProvidedColDef()).toBe(definitions[0]);
    expect(column.getColDef()).not.toBe(definitions[0]);
    expect(column.getColDef()).toMatchObject({
      colId: "alias",
      field: "team",
      editable: true,
      width: 151,
      sortable: true,
    });
    expect(column.getColDef()).toBe(column.getColDef());
    expect(column.colDef).toBe(column.getColDef());
    expect(column.colDef.field).toBe("team");
    expect(columns.getColumn(column.getColDef())).toBe(column);
    expect(columns.getColumn(definitions[0])).toBeNull();
    expect(column.getSort()).toBeUndefined();
    expect(column.getSortIndex()).toBeUndefined();
    expect(columns.getColumn({ colId: "alias" })).toBeNull();
    expect(
      Object.hasOwn(columns.getColumn("amount")!.getColDef(), "colId"),
    ).toBe(false);
  });
  it("retains wrapper identity while following actual layout, query and grouping state", () => {
    const { columns, model } = setup(),
      column = columns.getColumn("alias")!;
    expect(columns.getAllDisplayedColumns().map((c) => c.colId)).toEqual([
      "amount",
      "alias",
    ]);
    model.moveColumn("alias", 1);
    expect(columns.getColumns().map((c) => c.colId)).toEqual([
      "alias",
      "amount",
    ]);
    model.pinColumn("alias", "right");
    model.resizeColumn("alias", 201);
    model.setSort("alias", "desc");
    model.setFilter("alias", { op: "equals", value: "A" });
    model.setState({ groupBy: ["alias"] });
    expect(columns.getColumn("alias")).toBe(column);
    expect(column.actualWidth).toBe(201);
    expect(column.getPinned()).toBe("right");
    expect(column.isPinned()).toBe(true);
    expect(column.getSort()).toBe("desc");
    expect(column.getSortIndex()).toBe(0);
    expect(column.isSortDescending()).toBe(true);
    expect(column.isFilterActive()).toBe(true);
    expect(column.isRowGroupActive()).toBe(true);
    model.hideColumn("alias", true);
    expect(column.isVisible()).toBe(false);
    expect(columns.getAllDisplayedColumns().map((c) => c.colId)).toEqual([
      "amount",
    ]);
  });
  it("supplies original source node, class data, stable column and current common params to edit policy", () => {
    const { columns, nodes, policy, api, context, rows } = setup(),
      column = columns.getColumn("amount")!,
      node = nodes.getRowNode("a")!;
    expect(column.isCellEditable(node)).toBe(true);
    const params = policy.mock.calls[0]?.[0] as { data: unknown };
    expect(params).toMatchObject({
      api,
      context,
      column,
      colDef: column.getColDef(),
      data: rows[0],
      node,
    });
    expect(params.data).toBe(rows[0]);
  });
  it("fails closed for read-only, foreign, destroyed and malformed policies without side effects", () => {
    const { columns, nodes, policy, model } = setup(),
      column = columns.getColumn("amount")!,
      node = nodes.getRowNode("a")!;
    const other = setup();
    expect(column.isCellEditable(other.nodes.getRowNode("a")!)).toBe(false);
    expect(policy).not.toHaveBeenCalled();
    policy.mockImplementation(() => {
      throw new Error("Denied");
    });
    expect(column.isCellEditable(node)).toBe(false);
    policy.mockImplementation(() => true);
    model.setReadOnly(true);
    expect(column.isCellEditable(node)).toBe(false);
    model.setReadOnly(false);
    columns.destroy();
    expect(column.isCellEditable(node)).toBe(false);
    expect(columns.getColumn("amount")).toBeNull();
    expect(columns.getColumns()).toEqual([]);
    expect(column.isVisible()).toBe(false);
  });
  it("rejects a mismatched schema instead of handing callbacks stale definitions", () => {
    const { columns, model } = setup();
    model.setColumns([
      { id: "alias", field: "team" },
      { id: "amount", field: "amount" },
    ]);
    expect(() => columns.getColumns()).toThrow(/definitions changed/);
  });
});

it("notifies column sort listeners synchronously with common params and the prior sort index", () => {
  const model = createGrid({
    rows: [{ id: "a", amount: 1 }],
    getRowId: (r) => r.id,
    columns: [{ id: "amount", field: "amount" }],
  });
  const api = {},
    columnApi = {},
    context = { label: "Current" };
  const columns = createAg31LeafColumns({
    model,
    definitions: [{ field: "amount" }],
    commonParams: () => ({ api, columnApi, context }),
    ownsNode: () => false,
  });
  const column = columns.getColumn("amount")!,
    calls: unknown[] = [];
  const listener = (event: any) =>
    calls.push({
      type: event.type,
      keys: Object.keys(event).sort(),
      same: event.column === column,
      api: event.api === api,
      columnApi: event.columnApi === columnApi,
      context: event.context === context,
      source: event.source,
      columns: event.columns,
      sort: column.getSort(),
      index: column.getSortIndex(),
    });
  column.addEventListener("sortChanged", listener);
  model.setSort("amount", "asc");
  expect(calls).toEqual([
    {
      type: "sortChanged",
      keys: [
        "api",
        "column",
        "columnApi",
        "columns",
        "context",
        "source",
        "type",
      ],
      same: true,
      api: true,
      columnApi: true,
      context: true,
      source: "api",
      columns: [column],
      sort: "asc",
      index: undefined,
    },
  ]);
  expect(column.getSortIndex()).toBe(0);
  column.removeEventListener("sortChanged", listener);
  model.setSort("amount", "desc");
  expect(calls).toHaveLength(1);
  column.addEventListener("sortChanged", listener);
  columns.destroy();
  model.setSort("amount", "asc");
  expect(calls).toHaveLength(1);
});
