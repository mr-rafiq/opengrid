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

it("separates generated custom-group comparator values from displayed groupData", () => {
  const compare = vi.fn(
    (
      a: unknown,
      b: unknown,
      na: { group: boolean },
      nb: { group: boolean },
    ) => {
      if (na.group && nb.group) {
        expect(a).toBeUndefined();
        expect(b).toBeUndefined();
      }
      return 0;
    },
  );
  const { model, schema, nodes, rows } = setup([
    {
      colId: "tree",
      showRowGroup: true,
      valueGetter: (p: Ag31ValueParams<Row>) =>
        p.node.group ? "SORT " + p.node.key : p.data!.label(),
      comparator: compare,
    },
    {
      field: "team",
      rowGroup: true,
      keyCreator: (p: Ag31ValueParams<Row>) => (p.value as Team).code,
      valueFormatter: (p: Ag31ValueParams<Row>) => (p.value as Team).label(),
    },
  ]);
  model.setState({ groupBy: ["team"] });
  model.setSort("tree", "asc");
  expect(compare.mock.calls.some((c) => c[2].group && c[3].group)).toBe(true);
  expect(schema.read(nodes.getRowNode("a")!.parent!, "tree")).toBe(
    rows[0].team,
  );
  expect(model.getValue(rows[0], "tree")).toBe("Line a");
});

it("falls back to the original value when a source formatter returns null or undefined", () => {
  for (const valueFormatter of [() => null, () => undefined]) {
    const { schema, nodes } = setup([
      { field: "nested.amount", valueFormatter },
    ]);
    expect(schema.format(nodes.getRowNode("a")!, "nested.amount")).toBe("3");
  }
});

it("retains measured formatter result types while native display remains text", () => {
  const { schema, nodes } = setup([
    { field: "nested.amount" },
    { colId: "number", valueGetter: () => 7, valueFormatter: () => 9 },
    { colId: "zero", valueGetter: () => 7, valueFormatter: () => 0 },
    { colId: "empty", valueGetter: () => 7, valueFormatter: () => "" },
    { colId: "missing", valueGetter: () => undefined },
    { colId: "array", valueGetter: () => [1, null, 2] },
  ]);
  const rowNode = nodes.getRowNode("a")!;
  const read = (colKey: string, useFormatter = false) =>
    schema.getCellValue({ rowNode, colKey, useFormatter });
  expect(read("nested.amount")).toBe(3);
  expect(read("nested.amount", true)).toBe("3");
  expect(read("number", true)).toBe(9);
  expect(schema.format(rowNode, "number")).toBe("9");
  expect(schema.getValueFormatted(rowNode, "number")).toBe(9);
  expect(read("zero", true)).toBe(0);
  expect(read("empty", true)).toBe("");
  expect(read("missing")).toBeUndefined();
  expect(read("missing", true)).toBeNull();
  expect(read("array", true)).toBe("1, , 2");
  expect(read("unknown")).toBeNull();
  expect(schema.getValueFormatted(rowNode, "nested.amount")).toBeNull();
});

it("installs measured boolean type formatting for leaf values while leaving generated groups unformatted", () => {
  const { schema, nodes, columns, model } = setup([
    {
      colId: "flag",
      cellDataType: "boolean",
      valueGetter: (p: Ag31ValueParams<Row>) =>
        p.node.group || p.data?.id === "a"
          ? undefined
          : p.data?.nested.amount! > 3,
    },
    {
      field: "team",
      keyCreator: (p: Ag31ValueParams<Row>) => (p.value as Team).code,
      valueFormatter: (p: Ag31ValueParams<Row>) => (p.value as Team).label(),
    },
  ]);
  const rowNode = nodes.getRowNode("a")!;
  expect(
    schema.getCellValue({ rowNode, colKey: "flag", useFormatter: true }),
  ).toBe("");
  expect(
    schema.getCellValue({
      rowNode: nodes.getRowNode("b")!,
      colKey: "flag",
      useFormatter: true,
    }),
  ).toBe("true");
  expect(typeof columns.getColumn("flag")!.getColDef().valueFormatter).toBe(
    "function",
  );
  expect(
    Object.hasOwn(
      columns.getColumn("flag")!.getUserProvidedColDef(),
      "valueFormatter",
    ),
  ).toBe(false);
  model.setState({ groupBy: ["team"] });
  expect(
    schema.getValueFormatted(nodes.getRowNode("a")!.parent!, "flag"),
  ).toBeUndefined();
  expect(
    schema.getCellValue({
      rowNode: nodes.getRowNode("a")!.parent!,
      colKey: "flag",
      useFormatter: true,
    }),
  ).toBeNull();
});
