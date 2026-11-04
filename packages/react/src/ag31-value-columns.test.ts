import { describe, expect, it, vi } from "vitest";
import { createGrid } from "@opengrid/core";
import {
  createAg31ValueColumns,
  type Ag31ValueParams,
} from "./ag31-value-columns";
import {
  createAg31LeafColumns,
  type Ag31ColumnDefinition,
} from "./ag31-leaf-columns";
import { createAg31RowNodes } from "./ag31-row-nodes";

class Team {
  #label: string;
  constructor(public code: string) {
    this.#label = `Team ${code}`;
  }
  label() {
    return this.#label;
  }
  toString(): string {
    throw new Error("A domain object must use its source formatter");
  }
}
class Row {
  #label: string;
  nested: { amount: number };
  constructor(
    public id: string,
    public team: Team,
    amount: number,
  ) {
    this.#label = `Line ${id}`;
    this.nested = { amount };
  }
  label() {
    return this.#label;
  }
}
function setup(custom?: readonly Ag31ColumnDefinition<Row>[]) {
  const rows = [
    new Row("a", new Team("A"), 3),
    new Row("b", new Team("B"), 9),
    new Row("c", new Team("A"), 6),
  ];
  const api = {},
    context = { label: "Original context" };
  const calls = vi.fn((p: Ag31ValueParams<Row>) =>
    p.node.group ? "UNUSED GROUP GETTER" : p.data!.label(),
  );
  const definitions: readonly Ag31ColumnDefinition<Row>[] = custom ?? [
    {
      colId: "tree",
      showRowGroup: true,
      valueGetter: calls,
      valueFormatter: (p: Ag31ValueParams<Row>) =>
        p.value instanceof Team ? p.value.label() : p.value,
    },
    {
      headerName: "Source",
      children: [
        {
          field: "team",
          rowGroup: true,
          keyCreator: (p: Ag31ValueParams<Row>) => (p.value as Team).code,
          valueFormatter: (p: Ag31ValueParams<Row>) =>
            (p.value as Team).label(),
        },
        {
          field: "nested.amount",
          cellDataType: "number",
          filter: "agNumberColumnFilter",
          valueFormatter: (p: Ag31ValueParams<Row>) => `${p.value} EUR`,
        },
      ],
    },
    {
      colId: "double",
      valueGetter: (p: Ag31ValueParams<Row>) =>
        Number(p.getValue("nested.amount")) * 2,
    },
  ];
  const defaults = { editable: true, enableRowGroup: true, sortable: true };
  const schema = createAg31ValueColumns({
    definitions,
    defaultColDef: defaults,
    getRowId: (r: Row) => r.id,
    commonParams: () => ({ api, context }),
  });
  const model = createGrid({
    rows,
    columns: schema.columns,
    getRowId: (r) => r.id,
  });
  const nodes = createAg31RowNodes({
    model,
    context: () => context,
    getRowId: (r) => r.id,
    rowHeight: 32,
    groupIdentity: schema.groupIdentity,
    writeCell: () => false,
  });
  const columns = createAg31LeafColumns({
    model,
    definitions: schema.leafDefinitions,
    defaultColDef: defaults,
    commonParams: () => ({ api, context }),
    ownsNode: (node) => nodes.getRowNode(node.id) === node,
  });
  schema.bind({ model, nodes, columns });
  return { schema, model, nodes, columns, rows, api, context, calls };
}
describe("source value-column compilation", () => {
  it("formats array-valued groups with the measured comma-space fallback", () => {
    const { schema, nodes } = setup([
      { colId: "phases", valueGetter: () => [null, 21, 22] },
    ]);
    expect(schema.format(nodes.getRowNode("a")!, "phases")).toBe(", 21, 22");
    const custom = setup([
      {
        colId: "phases",
        valueGetter: () => [21, 22],
        valueFormatter: () => "Source format",
      },
    ]);
    expect(custom.schema.format(custom.nodes.getRowNode("a")!, "phases")).toBe(
      "Source format",
    );
  });
  it("runs first-projection callbacks with real source nodes, classes, nested fields and dependent getters", () => {
    const { schema, model, nodes, columns, rows, api, context, calls } =
      setup();
    expect(model.getValue(rows[0], "tree")).toBe("Line a");
    expect(schema.read(nodes.getRowNode("a")!, "double")).toBe(6);
    const params = calls.mock.calls[0][0];
    expect(params.data).toBe(rows[0]);
    expect(params.node).toBe(nodes.getRowNode("a"));
    expect(params.column).toBe(columns.getColumn("tree"));
    expect(params.colDef).toBe(columns.getColumn("tree")!.getColDef());
    expect(params.api).toBe(api);
    expect(params.context).toBe(context);
    expect(params.node.beans.gos.context).toBe(context);
    expect(params.data!.label()).toBe("Line a");
    expect(schema.format(nodes.getRowNode("a")!, "nested.amount")).toBe(
      "3 EUR",
    );
    expect(
      schema.columns.find((c) => c.id === "nested.amount")!.groupPath,
    ).toEqual(["Source"]);
  });
  it("merges object keys while generated groupData takes precedence over the tree getter", () => {
    const { schema, model, nodes, rows, calls } = setup();
    model.setState({ groupBy: ["team"] });
    const parent = nodes.getRowNode("a")!.parent!;
    calls.mockClear();
    expect(parent.allLeafChildren!.map((n) => n.id)).toEqual(["a", "c"]);
    expect(parent.key).toBe("A");
    expect(parent.id).toBe("row-group-team-A");
    expect(schema.read(parent, "tree")).toBe(rows[0].team);
    expect(schema.format(parent, "tree")).toBe("Team A");
    expect(calls).not.toHaveBeenCalled();
    const displayed = model.getRowModel();
    expect(displayed).toHaveLength(2);
    expect(schema.columns[0].groupValueGetter!(displayed[0])).toBe(
      rows[0].team,
    );
  });
  it("retains stable column/node identity and reads updated class instances after host transactions", () => {
    const { schema, model, nodes, columns } = setup(),
      node = nodes.getRowNode("a")!,
      column = columns.getColumn("tree");
    const replacement = new Row("a", new Team("A"), 12);
    model.applyTransaction({ update: [replacement] });
    expect(nodes.getRowNode("a")).toBe(node);
    expect(columns.getColumn("tree")).toBe(column);
    expect(schema.read(node, "double")).toBe(24);
    expect(node.data).toBe(replacement);
  });
  it("passes both real comparator nodes and the descending flag without coercing values first", () => {
    const compare = vi.fn(
      (
        a: unknown,
        b: unknown,
        na: { data?: Row },
        nb: { data?: Row },
        descending: boolean,
      ) => {
        expect(a).toBeUndefined();
        expect(b).toBeUndefined();
        expect(typeof descending).toBe("boolean");
        return na.data!.nested.amount - nb.data!.nested.amount;
      },
    );
    const { model, nodes } = setup([
      { colId: "business", valueGetter: () => undefined, comparator: compare },
    ]);
    model.setSort("business", "desc");
    expect(model.getRowModel().map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(compare.mock.calls.length).toBeGreaterThan(0);
    expect(compare.mock.calls.every((c) => c[4])).toBe(true);
    expect(compare.mock.calls[0][2]).toBe(
      nodes.getRowNode(compare.mock.calls[0][2].data!.id),
    );
  });
  it("rejects cycles and uncompiled expression/aggregate contracts explicitly", () => {
    const cyclic: Ag31ColumnDefinition<Row> = { headerName: "Cycle" };
    cyclic.children = [cyclic];
    expect(() => setup([cyclic])).toThrow(/acyclic/);
    expect(() => setup([{ colId: "x", valueGetter: "data.id" }])).toThrow(
      /expressions/,
    );
    expect(() => setup([{ colId: "x", aggFunc: "sum" }])).toThrow(
      /separate contract/,
    );
    expect(() => setup([{ field: "id" }, { colId: "id" }])).toThrow(/unique/);
  });
  it("bounds dependent getter recursion and clears the stack after a rejected callback", () => {
    let recursive = true;
    const { schema, nodes } = setup([
      {
        colId: "a",
        valueGetter: (p: Ag31ValueParams<Row>) =>
          recursive ? p.getValue("b") : 7,
      },
      { colId: "b", valueGetter: (p: Ag31ValueParams<Row>) => p.getValue("a") },
    ]);
    // Hierarchy projection itself reads source values, so the first read must be guarded too.
    expect(() => schema.read(nodes.getRowNode("a")!, "a")).toThrow(/recursive/);
    recursive = false;
    expect(schema.read(nodes.getRowNode("a")!, "a")).toBe(7);
  });
  it("does not bind twice or expose values from foreign or destroyed handles", () => {
    const own = setup(),
      foreign = setup();
    expect(
      own.schema.read(foreign.nodes.getRowNode("a")!, "tree"),
    ).toBeUndefined();
    expect(() => own.schema.bind(own)).toThrow(/only be bound once/);
    own.schema.destroy();
    expect(() => own.schema.read(own.nodes.getRowNode("a")!, "tree")).toThrow(
      /live row/,
    );
  });
});
