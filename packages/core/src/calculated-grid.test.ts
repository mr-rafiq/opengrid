import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCalculatedGrid,
  CalculatedColumnDefinitionError,
} from "./calculated-grid";
import type {
  CalculatedColumn,
  CalculatedGridOptions,
} from "./calculated-grid";
import { isFormulaError } from "./formula-engine";
import type { FormulaResult } from "./formula-engine";
import type { Column } from "./types";
import * as language from "./formula-language";
import * as core from "./index";

interface Item {
  id: string;
  team: string;
  price: number;
  quantity: number;
  note: string;
  active: boolean;
  huge?: bigint;
  date?: Date;
}
const rows: Item[] = [
  { id: "a", team: "EU", price: 10, quantity: 2, note: "Alpha", active: true },
  { id: "b", team: "US", price: 5, quantity: 3, note: "Beta", active: false },
  { id: "c", team: "EU", price: 2, quantity: 4, note: "Gamma", active: true },
];
const columns: Column<Item>[] = [
  { id: "team", field: "team" },
  { id: "price", field: "price", type: "number", editable: true },
  { id: "quantity", field: "quantity", type: "number", editable: true },
  { id: "note", field: "note", editable: true },
  { id: "active", field: "active", type: "boolean" },
];
const definitions: CalculatedColumn<Item>[] = [
  {
    id: "subtotal",
    header: "Subtotal",
    expression: "[price] * [quantity]",
    type: "number",
    aggregate: "sum",
  },
  { id: "ready", expression: "[subtotal] >= 15", type: "boolean" },
  { id: "label", expression: 'IF([ready],"Ready","Later")', type: "text" },
];
function fixture(patch: Partial<CalculatedGridOptions<Item>> = {}) {
  return createCalculatedGrid({
    rows,
    columns,
    calculatedColumns: definitions,
    getRowId: (row) => row.id,
    ...patch,
  });
}
const code = (value: FormulaResult) =>
  isFormulaError(value) ? value.code : value;
afterEach(() => vi.restoreAllMocks());

describe("compiled calculated columns in a real grid", () => {
  it("compiles each expression once, reuses programs across rows, and exposes static dependencies", () => {
    const compile = vi.spyOn(language, "compileFormulaProgram"),
      { model, calculations } = fixture();
    expect(compile).toHaveBeenCalledTimes(3);
    for (let repeat = 0; repeat < 3; repeat++)
      for (const row of rows) calculations.getResult(row.id, "label");
    model.setSort("subtotal", "desc");
    model.setQuickFilter("Ready");
    model.getFilteredRows();
    expect(compile).toHaveBeenCalledTimes(3);
    expect(calculations.getStats().compiledPrograms).toBe(3);
    expect(calculations.getDependencies("subtotal")).toEqual([
      "price",
      "quantity",
    ]);
    expect(calculations.getDependencies("label")).toEqual(["ready"]);
    expect(Object.isFrozen(calculations.getDependencies("label"))).toBe(true);
  });
  it("drives sorting, typed column/advanced filters, formatted quick search, grouping and CSV export", () => {
    const { model, calculations } = fixture();
    model.setSort("subtotal", "desc");
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    model.setSort("subtotal", "asc");
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    model.setFilter("subtotal", { op: "gte", value: 15 });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b", "a"]);
    model.setAdvancedFilter({
      kind: "condition",
      columnId: "ready",
      filter: { op: "equals", value: true },
    });
    model.setQuickFilter("Ready");
    expect(model.getFilteredRows()).toHaveLength(2);
    model.setState({ groupBy: ["team"] });
    const groups = model.getRowModel();
    expect(groups.map((group) => group.aggregates?.subtotal)).toEqual([15, 20]);
    expect(model.exportCsv()).toContain('"15","true","Ready"');
    expect(calculations.getResult("a", "subtotal")).toBe(20);
    expect(rows[0]).not.toHaveProperty("subtotal");
    expect(rows[0]).not.toHaveProperty("ready");
  });
  it("aggregates leaf calculations and permits grouping by a calculated category", () => {
    const { model } = fixture();
    model.setState({ groupBy: ["label"] });
    const groups = model.getRowModel();
    expect(
      groups.map((group) => [group.label, group.aggregates?.subtotal]),
    ).toEqual([
      ["Ready", 35],
      ["Later", 8],
    ]);
  });
  it("keeps generated columns read-only and allows ordinary base editing", () => {
    const { model } = fixture();
    const calculated = model
      .getColumns()
      .find((column) => column.id === "subtotal")!;
    expect(calculated.editable).toBe(false);
    expect(calculated.field).toBeUndefined();
    expect(calculated.valueCache).toBe(false);
    expect(model.editCell("a", "subtotal", 999)).toBe("Cell is read only");
    expect(model.editCell("a", "price", 20)).toBeUndefined();
    expect(model.getValue(model.getRow("a")!, "subtotal")).toBe(40);
  });
  it("handles initial filters, grouping and quick search queried before the model is assigned", () => {
    const original = core.createGrid,
      early: unknown[][] = [];
    vi.spyOn(core, "createGrid").mockImplementation((options) => {
      const model = original(options);
      early.push(model.getFilteredRows().map((row) => (row as Item).id));
      model.getRowModel();
      return model;
    });
    const { model, calculations } = fixture({
      initialState: {
        filters: { subtotal: { op: "gte", value: 15 } },
        quickFilter: "Ready",
        groupBy: ["team"],
      },
    });
    expect(early).toEqual([["a", "b"]]);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["a", "b"]);
    expect(calculations.getResult("a", "subtotal")).toBe(20);
  });
  it("does not automatically evaluate raw formula-looking strings", () => {
    const { model, calculations } = fixture({
      rows: [{ ...rows[0], note: "=1+2" }],
      calculatedColumns: [{ id: "copy", expression: "[note]", type: "text" }],
    });
    expect(calculations.getResult("a", "copy")).toBe("=1+2");
    expect(model.getValue(model.getRow("a")!, "copy")).toBe("=1+2");
    expect(model.exportCsv()).toContain("'=1+2");
  });
  it("returns type errors for incompatible declared results without coercing strings or BigInt", () => {
    const { model, calculations } = fixture({
      rows: [{ ...rows[0], huge: 9007199254740993n, date: new Date() }],
      columns: [
        ...columns,
        { id: "huge", field: "huge" },
        { id: "date", field: "date" },
      ],
      calculatedColumns: [
        { id: "wrongNumber", expression: '"5"', type: "number" },
        { id: "wrongBoolean", expression: "1", type: "boolean" },
        { id: "big", expression: "[huge]", type: "number" },
        { id: "dateCopy", expression: "[date]", type: "text" },
      ],
    });
    for (const id of ["wrongNumber", "wrongBoolean", "big", "dateCopy"]) {
      expect(code(calculations.getResult("a", id))).toBe("VALUE");
      expect(model.getValue(model.getRow("a")!, id)).toBeNull();
    }
  });
});

describe("dependencies, lazy branches and error projection", () => {
  it("shares diamond inputs within one evaluation even when the global LRU evicts them", () => {
    const getter = vi.fn((row: Item) => row.price),
      { calculations } = fixture({
        columns: [...columns, { id: "cost", valueGetter: getter }],
        calculationCacheMaxEntries: 1,
        calculatedColumns: [
          { id: "left", expression: "[cost]*2", type: "number" },
          { id: "right", expression: "[cost]+1", type: "number" },
          { id: "total", expression: "[left]+[right]", type: "number" },
        ],
      });
    expect(calculations.getResult("a", "total")).toBe(31);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(calculations.getStats().cacheEntries).toBeLessThanOrEqual(1);
  });
  it("reports active cycles but permits inactive self references in lazy IF", () => {
    const { model, calculations } = fixture({
      calculatedColumns: [
        { id: "first", expression: "[second]+1", type: "number" },
        { id: "second", expression: "[first]+1", type: "number" },
        { id: "safe", expression: "IF(FALSE,[safe],7)", type: "number" },
      ],
    });
    expect(code(calculations.getResult("a", "first"))).toBe("CYCLE");
    expect(calculations.getResult("a", "safe")).toBe(7);
    expect(model.getValue(model.getRow("a")!, "first")).toBeNull();
    expect(model.exportCsv()).toContain("#CYCLE!");
  });
  it("does not execute an error branch or unknown function hidden by IF", () => {
    const { calculations } = fixture({
      calculatedColumns: [
        { id: "safe", expression: "IF([active],7,1/0)", type: "number" },
        {
          id: "unknown",
          expression: "IF(TRUE,9,UNSUPPORTED())",
          type: "number",
        },
      ],
    });
    expect(calculations.getResult("a", "safe")).toBe(7);
    expect(code(calculations.getResult("b", "safe"))).toBe("DIV0");
    expect(calculations.getResult("a", "unknown")).toBe(9);
  });
  it("projects typed errors to null for filtering/aggregation and readable labels for formatted export", () => {
    const { model, calculations } = fixture({
      calculatedColumns: [
        { id: "bad", expression: "1/0", type: "number", aggregate: "sum" },
      ],
    });
    model.setFilter("bad", { op: "blank" });
    expect(model.getFilteredRows()).toHaveLength(3);
    model.setState({ groupBy: ["team"] });
    expect(model.getRowModel().map((group) => group.aggregates?.bad)).toEqual([
      0, 0,
    ]);
    expect(model.exportCsv()).toContain("#DIV/0!");
    const result = calculations.getResult("a", "bad");
    expect(code(result)).toBe("DIV0");
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("catches provider exceptions without publishing or persisting transient failures and preserves base caching", () => {
    let broken = true;
    const getter = vi.fn((row: Item) => {
      if (broken) throw new Error("secret upstream error");
      return row.price;
    });
    const { model, calculations } = fixture({
      columns: [...columns, { id: "input", valueGetter: getter }],
      valueCache: true,
      calculatedColumns: [
        { id: "result", expression: "[input]+1", type: "number" },
      ],
    });
    const listener = vi.fn();
    model.subscribe(listener);
    expect(model.getValue(model.getRow("a")!, "result")).toBeNull();
    const failure = calculations.getResult("a", "result");
    expect(code(failure)).toBe("VALUE");
    expect(JSON.stringify(failure)).not.toContain("secret upstream");
    expect(getter).toHaveBeenCalledTimes(2);
    broken = false;
    expect(model.getValue(model.getRow("a")!, "result")).toBe(11);
    model.resizeColumn("result", 240);
    expect(model.getValue(model.getRow("a")!, "result")).toBe(11);
    expect(getter).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("guards reentrant base getter cycles rather than overflowing or masking the error", () => {
    let model: ReturnType<typeof fixture>["model"];
    const instance = fixture({
      columns: [
        ...columns,
        { id: "dynamic", valueGetter: (row) => model.getValue(row, "result") },
      ],
      calculatedColumns: [
        { id: "result", expression: "[dynamic]+1", type: "number" },
      ],
    });
    model = instance.model;
    expect(code(instance.calculations.getResult("a", "result"))).toBe("CYCLE");
  });
  it("preserves normal formatter callback exceptions and successful row context", () => {
    const formatter = vi.fn(
        (value: unknown, row: Item) => row.id + ":" + value,
      ),
      { model } = fixture({
        calculatedColumns: [
          {
            id: "copy",
            expression: "[price]",
            type: "number",
            valueFormatter: formatter,
          },
        ],
      });
    expect(model.exportCsv()).toContain("a:10");
    expect(formatter.mock.calls[0][1]).toBe(rows[0]);
    const broken = fixture({
      calculatedColumns: [
        {
          id: "badFormat",
          expression: "1",
          type: "number",
          valueFormatter: () => {
            throw new Error("Format failed");
          },
        },
      ],
    });
    expect(() => broken.model.exportCsv()).toThrow("Format failed");
  });
});

describe("bounded caches, canonical rows and lifecycle", () => {
  it("invalidates after edits, undo/redo, transactions and row replacement", () => {
    const { model, calculations } = fixture();
    const read = () => calculations.getResult("a", "subtotal");
    expect(read()).toBe(20);
    model.editCell("a", "price", 20);
    expect(read()).toBe(40);
    model.undo();
    expect(read()).toBe(20);
    model.redo();
    expect(read()).toBe(40);
    model.applyTransaction({ update: [{ ...rows[0], price: 30 }] });
    expect(read()).toBe(60);
    model.setRows(rows);
    expect(read()).toBe(20);
  });
  it("refreshes closure dependencies through both controller and model expiry with one explicit notification", () => {
    let factor = 1;
    const getter = vi.fn((row: Item) => row.price * factor),
      { model, calculations } = fixture({
        columns: [...columns, { id: "input", valueGetter: getter }],
        valueCache: true,
        calculatedColumns: [
          { id: "copy", expression: "[input]", type: "number" },
        ],
      });
    expect(calculations.getResult("a", "copy")).toBe(10);
    model.setFilter("copy", { op: "gt", value: 15 });
    expect(model.getFilteredRows()).toEqual([]);
    const before = model.getState(),
      listener = vi.fn();
    model.subscribe(listener);
    factor = 3;
    calculations.expire();
    expect(model.getState()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["a"]);
    expect(calculations.getResult("a", "copy")).toBe(30);
    factor = 4;
    model.expireValueCache();
    expect(calculations.getResult("a", "copy")).toBe(40);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("uses a bounded shared LRU for raw inputs and calculated results", () => {
    const getter = vi.fn((row: Item) => row.price),
      { calculations } = fixture({
        columns: [...columns, { id: "input", valueGetter: getter }],
        calculationCacheMaxEntries: 2,
        calculatedColumns: [
          { id: "copy", expression: "[input]+1", type: "number" },
        ],
      });
    expect(calculations.getResult("a", "copy")).toBe(11);
    expect(calculations.getResult("a", "copy")).toBe(11);
    expect(getter).toHaveBeenCalledTimes(1);
    calculations.getResult("b", "copy");
    expect(calculations.getStats().cacheEntries).toBe(2);
    calculations.getResult("a", "copy");
    expect(getter).toHaveBeenCalledTimes(3);
  });
  it("never reuses or pollutes canonical entries for foreign same-ID rows or former row objects", () => {
    const getter = vi.fn((row: Item) => row.price),
      { model, calculations } = fixture({
        columns: [...columns, { id: "input", valueGetter: getter }],
        calculatedColumns: [
          { id: "copy", expression: "[input]+1", type: "number" },
        ],
      });
    calculations.getResult("a", "copy");
    const entries = calculations.getStats().cacheEntries,
      foreign = { ...rows[0], price: 999 };
    expect(calculations.evaluate(foreign, "copy")).toBe(1000);
    expect(calculations.evaluate(foreign, "copy")).toBe(1000);
    expect(calculations.getResult("a", "copy")).toBe(11);
    expect(calculations.getStats().cacheEntries).toBe(entries);
    expect(getter).toHaveBeenCalledTimes(3);
    model.editCell("a", "price", 20);
    expect(calculations.evaluate(rows[0], "copy")).toBe(11);
    expect(calculations.getResult("a", "copy")).toBe(21);
  });
  it("has no model subscriptions or getter-time notifications and remains usable after repeated Strict Mode-style cleanup", () => {
    const original = core.createGrid,
      subscriptions: ReturnType<typeof vi.spyOn>[] = [];
    vi.spyOn(core, "createGrid").mockImplementation((options) => {
      const model = original(options);
      subscriptions.push(vi.spyOn(model, "subscribe"));
      return model;
    });
    const { model, calculations } = fixture({
      calculatedColumns: [{ id: "bad", expression: "1/0", type: "number" }],
    });
    expect(subscriptions[0]).not.toHaveBeenCalled();
    const listener = vi.fn();
    model.subscribe(listener);
    const snapshot = model.getState();
    calculations.getResult("a", "bad");
    model.getValue(rows[0], "bad");
    expect(listener).not.toHaveBeenCalled();
    expect(model.getState()).toBe(snapshot);
    calculations.dispose();
    calculations.dispose();
    expect(calculations.getStats().cacheEntries).toBe(0);
    expect(code(calculations.getResult("a", "bad"))).toBe("DIV0");
    model.editCell("a", "price", 7);
    expect(code(calculations.getResult("a", "bad"))).toBe("DIV0");
  });
  it("caches blank results and rejects missing rows, columns and unusable foreign identities safely", () => {
    const getter = vi.fn(() => undefined),
      { calculations } = fixture({
        columns: [...columns, { id: "blank", valueGetter: getter }],
        calculatedColumns: [
          { id: "copy", expression: "[blank]", type: "number" },
        ],
      });
    expect(calculations.getResult("a", "copy")).toBeNull();
    expect(calculations.getResult("a", "copy")).toBeNull();
    expect(getter).toHaveBeenCalledTimes(1);
    expect(code(calculations.getResult("missing", "copy"))).toBe("REF");
    expect(code(calculations.getResult("a", "missing"))).toBe("REF");
    expect(code(calculations.evaluate({ ...rows[0], id: "" }, "copy"))).toBe(
      "REF",
    );
    expect(() => calculations.getDependencies("missing")).toThrow(TypeError);
  });
});

describe("schema, language and resource boundaries", () => {
  it("rejects positional/range references and unknown bracket IDs before creating a model", () => {
    for (const expression of ["A1+1", "$A$1", "SUM(A1:B2)", "[missing]+1"])
      expect(() =>
        fixture({
          calculatedColumns: [{ id: "bad", expression, type: "number" }],
        }),
      ).toThrow(CalculatedColumnDefinitionError);
    expect(() =>
      fixture({
        calculatedColumns: [
          { id: "allowed", expression: '"A1:B2"', type: "text" },
        ],
      }),
    ).not.toThrow();
  });
  it.each([
    "window.location",
    "process.exit()",
    "1;alert(1)",
    "(()=>1)()",
    "[price].constructor",
    "`template`",
  ])("rejects executable syntax %s", (expression) =>
    expect(() =>
      fixture({
        calculatedColumns: [{ id: "bad", expression, type: "number" }],
      }),
    ).toThrow(CalculatedColumnDefinitionError),
  );
  it("validates IDs, readonly restrictions, types and immutable definition snapshots", () => {
    expect(() =>
      fixture({
        calculatedColumns: [{ id: "price", expression: "1", type: "number" }],
      }),
    ).toThrow(/replace base/);
    expect(() =>
      fixture({
        calculatedColumns: [
          { id: "same", expression: "1", type: "number" },
          { id: "same", expression: "2", type: "number" },
        ],
      }),
    ).toThrow(/unique/);
    for (const patch of [
      { field: "price" },
      { editable: true },
      { valueGetter: () => 1 },
      { valueParser: () => 1 },
      { validate: () => undefined },
      { valueCache: true },
      { type: "bigint" },
    ])
      expect(() =>
        fixture({
          calculatedColumns: [
            {
              id: "bad",
              expression: "1",
              type: "number",
              ...patch,
            } as unknown as CalculatedColumn<Item>,
          ],
        }),
      ).toThrow(TypeError);
    const groupPath = ["Totals"],
      definition: CalculatedColumn<Item> = {
        id: "copy",
        expression: "[price]",
        type: "number",
        groupPath,
      },
      instance = fixture({ calculatedColumns: [definition] });
    definition.expression = "999";
    groupPath.push("Mutated");
    const stored = instance.calculations.getDefinitions();
    expect(stored[0].expression).toBe("[price]");
    expect(stored[0].groupPath).toEqual(["Totals"]);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored[0])).toBe(true);
    expect(instance.calculations.getResult("a", "copy")).toBe(10);
  });
  it("supports prototype-like IDs and does not mutate source objects", () => {
    const { model, calculations } = fixture({
      calculatedColumns: [
        { id: "__proto__", expression: "[price]+1", type: "number" },
        { id: "constructor", expression: "[__proto__]+1", type: "number" },
      ],
    });
    expect(calculations.getResult("a", "constructor")).toBe(12);
    expect(model.getColumns().some((column) => column.id === "__proto__")).toBe(
      true,
    );
    expect(Object.hasOwn(rows[0], "__proto__")).toBe(false);
  });
  it("bounds schema size, cache capacity, expression tokens, dependency depth and evaluation steps", () => {
    expect(() =>
      fixture({
        calculatedColumns: Array.from({ length: 65 }, (_, index) => ({
          id: "c" + index,
          expression: "1",
          type: "number",
        })),
      }),
    ).toThrow(/64/);
    expect(() =>
      fixture({
        columns: Array.from({ length: 1025 }, (_, index) => ({
          id: "c" + index,
        })),
        calculatedColumns: [],
      }),
    ).toThrow(/1024/);
    for (const calculationCacheMaxEntries of [0, -1, 1.5, NaN, 1000001])
      expect(() => fixture({ calculationCacheMaxEntries })).toThrow(RangeError);
    expect(() => fixture({ calculationLimits: { maxTokens: 2 } })).toThrow(
      CalculatedColumnDefinitionError,
    );
    expect(() => fixture({ calculationLimits: { maxDepth: 0 } })).toThrow(
      RangeError,
    );
    expect(() => fixture({ calculationLimits: { maxTokens: 2049 } })).toThrow(
      RangeError,
    );
    const deep = fixture({
      calculationLimits: { maxDepth: 2 },
      calculatedColumns: [
        { id: "first", expression: "[second]", type: "number" },
        { id: "second", expression: "[price]", type: "number" },
      ],
    });
    expect(code(deep.calculations.getResult("a", "first"))).toBe("LIMIT");
    expect(deep.calculations.getResult("a", "second")).toBe(10);
    const short = fixture({
      calculationLimits: { maxEvaluationSteps: 2 },
      calculatedColumns: [
        { id: "value", expression: "[price]", type: "number" },
      ],
    });
    expect(code(short.calculations.getResult("a", "value"))).toBe("LIMIT");
  });
  it("recreates schemas explicitly while preserving caller-supplied compatible state and resetting history", () => {
    const first = fixture();
    first.model.editCell("a", "price", 12);
    first.model.pinColumn("subtotal", "left");
    first.model.setSort("subtotal", "desc");
    const second = fixture({
      rows: first.model.getRows(),
      initialState: first.model.getState(),
      calculatedColumns: [
        { id: "subtotal", expression: "[price]*[quantity]+1", type: "number" },
      ],
    });
    expect(second.calculations.getResult("a", "subtotal")).toBe(25);
    expect(second.model.getState().columnPinning.subtotal).toBe("left");
    expect(second.model.undo()).toBe(false);
    expect(first.calculations.getResult("a", "subtotal")).toBe(24);
    expect(() =>
      fixture({
        initialState: {
          advancedFilter: {
            kind: "condition",
            columnId: "removed",
            filter: { op: "blank" },
          },
        },
      }),
    ).toThrow();
  });
});
