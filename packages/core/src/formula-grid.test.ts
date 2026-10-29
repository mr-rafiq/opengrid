import { describe, expect, it, vi } from "vitest";
import {
  createFormulaGrid,
  createGrid,
  createRowEditSession,
  createSetFilterIndex,
  formulaInput,
  getFormulaGridController,
  isFormulaError,
  isFormulaInput,
} from "./index.js";
import type {
  FormulaGridOptions,
  FormulaGridInput,
  FormulaGridController,
  FormulaResult,
  GridModel,
} from "./index.js";

interface Row {
  id: string;
  price: number;
  quantity: number;
  total: FormulaGridInput;
  note: FormulaGridInput;
  team: string;
}
const cell = (rowId = "a", columnId = "total") => ({ rowId, columnId });
function fixture(patch: Partial<FormulaGridOptions<Row>> = {}) {
  return createFormulaGrid<Row>({
    rows: [
      {
        id: "a",
        price: 2,
        quantity: 4,
        total: formulaInput("=[price]*[quantity]"),
        note: "=literal",
        team: "A",
      },
      {
        id: "b",
        price: 3,
        quantity: 5,
        total: formulaInput("=A2*B2"),
        note: "plain",
        team: "A",
      },
      {
        id: "c",
        price: 5,
        quantity: 2,
        total: formulaInput("=SUM(C1:C2)"),
        note: "plain",
        team: "B",
      },
    ],
    columns: [
      { id: "price", field: "price", type: "number", editable: true },
      { id: "quantity", field: "quantity", type: "number", editable: true },
      {
        id: "total",
        field: "total",
        type: "number",
        editable: true,
        aggregate: "sum",
      },
      { id: "note", field: "note", type: "text", editable: true },
      { id: "team", field: "team" },
    ],
    formulaColumns: ["total", "note"],
    getRowId: (row) => row.id,
    ...patch,
  });
}
const resultCode = (result: FormulaResult) =>
  isFormulaError(result) ? result.code : undefined;

describe("formula atoms and registered model identity", () => {
  it("freezes explicit atoms while ordinary equals-prefixed strings stay literal", () => {
    const atom = formulaInput("=1+2");
    expect(Object.isFrozen(atom)).toBe(true);
    expect(isFormulaInput(atom)).toBe(true);
    expect(isFormulaInput("=1+2")).toBe(false);
    const { model, formulas } = fixture();
    expect(formulas.getInput(cell("a", "note"))).toBe("=literal");
    expect(formulas.getResult(cell("a", "note"))).toBe("=literal");
    expect(model.getValue(model.getRow("a")!, "note")).toBe("=literal");
    expect(formulas.getFormula(cell("a", "note"))).toBeUndefined();
    expect(formulas.setFormula(cell("a", "note"), '="=1+2"')).toBeUndefined();
    expect(formulas.getResult(cell("a", "note"))).toBe("=1+2");
  });

  it("does not invoke malformed atom accessors or accept extra properties/prototypes", () => {
    const read = vi.fn(() => "=1");
    const malformed = { kind: "formula" };
    Object.defineProperty(malformed, "expression", { get: read });
    expect(isFormulaInput(malformed)).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(
      isFormulaInput({ kind: "formula", expression: "=1", extra: true }),
    ).toBe(false);
    expect(
      isFormulaInput(Object.create({ kind: "formula", expression: "=1" })),
    ).toBe(false);
    const { model } = fixture();
    const snapshot = model.getState(),
      notify = vi.fn();
    model.subscribe(notify);
    expect(model.editCell("a", "total", malformed)).toContain("Malformed");
    expect(model.getState()).toBe(snapshot);
    expect(notify).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("isolates imported unfrozen atoms without freezing borrowed rows", () => {
    const imported = { kind: "formula" as const, expression: "=2+3" };
    const original = { id: "r", value: imported };
    const { model, formulas } = createFormulaGrid({
      rows: [original],
      columns: [{ id: "value", field: "value", editable: true }],
      formulaColumns: ["value"],
      getRowId: (row) => row.id,
    });
    expect(Object.isFrozen(original)).toBe(false);
    expect(Object.isFrozen(imported)).toBe(false);
    expect(formulas.getInput(cell("r", "value"))).not.toBe(imported);
    expect(Object.isFrozen(formulas.getInput(cell("r", "value")))).toBe(true);
    imported.expression = "=100";
    expect(model.getValue(model.getRow("r")!, "value")).toBe(5);
  });

  it("registers exact model identity and retains safe recognition through cleanup/reuse", () => {
    const { model, formulas } = fixture();
    expect(getFormulaGridController(model)).toBe(formulas);
    expect(formulas.model).toBe(model);
    expect(getFormulaGridController({ ...model })).toBeUndefined();
    expect(
      getFormulaGridController(
        createGrid({ rows: [], columns: [], getRowId: () => "" }),
      ),
    ).toBeUndefined();
    expect(formulas.supportsColumn("total")).toBe(true);
    expect(formulas.supportsColumn("price")).toBe(false);
    expect(() => createRowEditSession(model, "a")).toThrow("Full-row");
    formulas.dispose();
    formulas.dispose();
    expect(getFormulaGridController(model)).toBe(formulas);
    expect(formulas.getResult(cell())).toBe(8);
    expect(formulas.setFormula(cell(), "=9")).toBeUndefined();
    expect(formulas.getResult(cell())).toBe(9);
  });
});

describe("formula values in actual client pipelines", () => {
  it("feeds chained cross-row results to sort/filter/group/aggregate/Set List/CSV", () => {
    const { model, formulas } = fixture();
    expect(["a", "b", "c"].map((id) => formulas.getResult(cell(id)))).toEqual([
      8, 15, 23,
    ]);
    model.setSort("total", "desc");
    expect(model.getFilteredRows().map((row) => row.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    model.setFilter("total", { op: "gte", value: 15 });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["c", "b"]);
    const index = createSetFilterIndex(model, "total");
    expect(index.entries.map((entry) => entry.value)).toEqual([8, 15, 23]);
    model.setFilter("total");
    model.setSort("total", null);
    model.setState({ groupBy: ["team"] });
    expect(model.getRowModel().map((node) => node.aggregates?.total)).toEqual([
      23, 23,
    ]);
    expect(model.exportCsv()).toContain('"2","4","8"');
    expect(model.exportCsv()).toContain('"5","2","23"');
    expect(isFormulaInput(model.getRow("a")!.total)).toBe(true);
  });

  it("keeps source-coordinate bindings through sorting/filtering/reorder/layout changes", () => {
    const { model, formulas } = fixture();
    expect(formulas.setFormula(cell("c"), "=$A$1 + A2")).toBeUndefined();
    model.setSort("price", "desc");
    model.setFilter("price", { op: "gt", value: 2 });
    model.moveColumn("price", 3);
    model.pinColumn("total", "left");
    model.hideColumn("quantity", true);
    expect(formulas.getResult(cell("c"))).toBe(5);
    model.setFilter("price");
    model.setSort("price", null);
    expect(model.moveRows(["b"], "a", "before")).toBeUndefined();
    expect(model.getRows().map((row) => row.id)).toEqual(["b", "a", "c"]);
    expect(formulas.getResult(cell("c"))).toBe(5);
    model.undo();
    expect(formulas.getResult(cell("c"))).toBe(5);
  });

  it("projects errors to null but formats readable errors and preserves typed diagnostics", () => {
    const { model, formulas } = fixture();
    expect(formulas.setFormula(cell("a"), "=1/0")).toBeUndefined();
    expect(resultCode(formulas.getResult(cell("a")))).toBe("DIV0");
    expect(model.getValue(model.getRow("a")!, "total")).toBe(null);
    expect(model.exportCsv()).toContain('"#DIV/0!"');
    const index = createSetFilterIndex(model, "total");
    expect(index.entries.find((entry) => entry.blank)?.count).toBe(2);
    expect(index.entries.find((entry) => entry.blank)?.invalidCount).toBe(0);
    model.setFilter("total", { op: "blank" });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["a", "c"]);
    expect(formulas.getInput(cell("a"))).toEqual(formulaInput("=1/0"));
  });

  it("supports lazy IF, cycles and recovery, and rejects wrong declared result types", () => {
    const { formulas } = fixture();
    expect(formulas.setFormula(cell(), "=IF(FALSE,[total],7)")).toBeUndefined();
    expect(formulas.getResult(cell())).toBe(7);
    expect(formulas.setFormula(cell(), "=[total]+1")).toBeUndefined();
    expect(resultCode(formulas.getResult(cell()))).toBe("CYCLE");
    expect(formulas.setFormula(cell(), '="text"')).toBeUndefined();
    expect(resultCode(formulas.getResult(cell()))).toBe("VALUE");
    expect(formulas.setFormula(cell(), "=[unknown]")).toBeUndefined();
    expect(resultCode(formulas.getResult(cell()))).toBe("REF");
    expect(formulas.setLiteral(cell(), 20)).toBeUndefined();
    expect(formulas.getResult(cell())).toBe(20);
  });
});

describe("atomic formula input editing and shared history", () => {
  it("commits mixed formula/literal fields as one batch and one undo, including direct model edits", () => {
    const { model, formulas } = fixture();
    const notify = vi.fn();
    model.subscribe(notify);
    expect(
      formulas.batchInputs([
        { rowId: "a", columnId: "price", value: 10 },
        { rowId: "b", columnId: "total", value: formulaInput("=A1*2") },
      ]),
    ).toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(formulas.getResult(cell("a"))).toBe(40);
    expect(formulas.getResult(cell("b"))).toBe(20);
    expect(formulas.getResult(cell("c"))).toBe(60);
    expect(model.undo()).toBe(true);
    expect(formulas.getResult(cell("a"))).toBe(8);
    expect(formulas.getFormula(cell("b"))).toBe("=A2*B2");
    expect(model.undo()).toBe(false);
    expect(model.redo()).toBe(true);
    expect(formulas.getResult(cell("c"))).toBe(60);
    expect(model.editCell("a", "total", "11")).toBeUndefined();
    expect(formulas.getFormula(cell("a"))).toBeUndefined();
    expect(formulas.getInput(cell("a"))).toBe(11);
    model.undo();
    expect(formulas.getFormula(cell("a"))).toBe("=[price]*[quantity]");
  });

  it("validates final cross-row staged results and rolls back errors without history/notification changes", () => {
    const validate = vi.fn(
      (
        result: FormulaResult,
        context: {
          cell: { rowId: string; columnId: string };
          getResult(cell: { rowId: string; columnId: string }): FormulaResult;
        },
      ) => {
        if (context.cell.rowId !== "c" || context.cell.columnId !== "total")
          return;
        const first = context.getResult(cell("a")),
          second = context.getResult(cell("b"));
        return typeof first === "number" &&
          typeof second === "number" &&
          first > second
          ? "First total exceeds second"
          : undefined;
      },
    );
    const { model, formulas } = fixture({ validateFormulaResult: validate });
    const oldState = model.getState(),
      originalRows = model.getRows(),
      notify = vi.fn();
    model.subscribe(notify);
    expect(
      formulas.batchInputs([
        { rowId: "a", columnId: "total", value: formulaInput("=20") },
        { rowId: "b", columnId: "total", value: 30 },
      ]),
    ).toBeUndefined();
    expect(formulas.getResult(cell("c"))).toBe(50);
    expect(notify).toHaveBeenCalledTimes(1);
    const committed = model.getState(),
      currentRows = model.getRows();
    expect(
      formulas.batchInputs([
        { rowId: "a", columnId: "total", value: 50 },
        { rowId: "b", columnId: "total", value: formulaInput("=40") },
      ]),
    ).toBe("First total exceeds second");
    expect(model.getState()).toBe(committed);
    expect(model.getRows()).toEqual(currentRows);
    expect(formulas.getResult(cell("c"))).toBe(50);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(model.undo()).toBe(true);
    expect(model.getRows()).toEqual(originalRows);
    expect(model.getState()).not.toBe(oldState);
    expect(model.undo()).toBe(false);
  });

  it("keeps raw column validators explicit and stages result validators after raw validation", () => {
    const raw = vi.fn((value: unknown) =>
      isFormulaInput(value) || typeof value === "number"
        ? undefined
        : "raw input rejected",
    );
    const result = vi.fn((value: FormulaResult) =>
      typeof value === "number" && value < 0 ? "Negative result" : undefined,
    );
    const grid = createFormulaGrid({
      rows: [{ id: "r", value: 1 as FormulaGridInput }],
      columns: [
        {
          id: "value",
          field: "value",
          type: "number",
          editable: true,
          validate: raw,
        },
      ],
      formulaColumns: ["value"],
      getRowId: (row) => row.id,
      validateFormulaResult: result,
    });
    expect(
      grid.formulas.setFormula(cell("r", "value"), "=2+3"),
    ).toBeUndefined();
    expect(isFormulaInput(raw.mock.calls[0]![0])).toBe(true);
    expect(result.mock.calls[0]![0]).toBe(5);
    expect(grid.formulas.setFormula(cell("r", "value"), "=-1")).toBe(
      "Negative result",
    );
    expect(grid.formulas.getResult(cell("r", "value"))).toBe(5);
  });

  it("rejects parse/injection/parser/validator failures and preserves redo on rejected/no-op changes", () => {
    const { model, formulas } = fixture();
    formulas.setLiteral(cell(), 10);
    model.undo();
    const state = model.getState(),
      notify = vi.fn();
    model.subscribe(notify);
    for (const expression of [
      "=1+",
      "=globalThis.process.exit()",
      "=this.constructor",
      "=A1;alert(1)",
    ])
      expect(formulas.setFormula(cell(), expression)).toBeTypeOf("string");
    expect(formulas.setFormula(cell(), "=[price]*[quantity]")).toBeUndefined();
    expect(
      formulas.batchInputs([
        { rowId: "a", columnId: "total", value: formulaInput("=999") },
        {
          rowId: "a",
          columnId: "total",
          value: formulaInput("=[price]*[quantity]"),
        },
      ]),
    ).toBeUndefined();
    // Atom equality should be semantic for an unchanged expression (no-op/redo protection).
    expect(model.getState()).toBe(state);
    expect(notify).not.toHaveBeenCalled();
    expect(model.redo()).toBe(true);
    expect(formulas.getResult(cell())).toBe(10);
    const failure = fixture({
      columns: [
        {
          id: "total",
          field: "total",
          editable: true,
          valueParser: () => {
            throw new Error("Parser failed");
          },
        },
        { id: "note", field: "note", editable: true },
      ],
    });
    expect(failure.formulas.setLiteral(cell(), 4)).toBe("Parser failed");
    const protectedGrid = fixture({
      columns: [
        {
          id: "total",
          field: "total",
          editable: true,
          validate: () => "Validator failed",
        },
        { id: "note", field: "note", editable: true },
      ],
    });
    expect(protectedGrid.formulas.setFormula(cell(), "=4")).toBe(
      "Validator failed",
    );
  });
});

describe("formula lifetime, caches and structural bounds", () => {
  it("does not publish from getters/formatters and invalidates after every data/history path", () => {
    const { model, formulas } = fixture();
    const notify = vi.fn();
    model.subscribe(notify);
    for (let repeat = 0; repeat < 5; repeat++) {
      formulas.getResult(cell());
      model.getValue(model.getRow("a")!, "total");
      model.exportCsv();
    }
    expect(notify).not.toHaveBeenCalled();
    expect(model.editCell("a", "price", 5)).toBeUndefined();
    expect(formulas.getResult(cell())).toBe(20);
    model.undo();
    expect(formulas.getResult(cell())).toBe(8);
    model.redo();
    expect(formulas.getResult(cell())).toBe(20);
    model.applyTransaction({ update: [{ ...model.getRow("a")!, price: 7 }] });
    expect(formulas.getResult(cell())).toBe(28);
    model.setRows(
      model
        .getRows()
        .map((row) => (row.id === "a" ? { ...row, price: 10 } : row)),
    );
    expect(formulas.getResult(cell())).toBe(40);
  });

  it("recovers transient provider failures, interoperates with base getter caching, and explicitly expires closures", () => {
    let broken = true,
      factor = 2;
    const getter = vi.fn((row: { base: number }) => {
      if (broken) throw new Error("private provider text");
      return row.base * factor;
    });
    const { model, formulas } = createFormulaGrid({
      rows: [{ id: "r", base: 3, total: formulaInput("=[input]+1") }],
      columns: [
        { id: "input", valueGetter: getter },
        { id: "total", field: "total", editable: true, type: "number" },
      ],
      formulaColumns: ["total"],
      getRowId: (row) => row.id,
      valueCache: true,
    });
    expect(resultCode(formulas.getResult(cell("r")))).toBe("VALUE");
    expect(model.getValue(model.getRow("r")!, "total")).toBe(null);
    broken = false;
    expect(formulas.getResult(cell("r"))).toBe(7);
    const reads = getter.mock.calls.length;
    model.selectRows(["r"]);
    expect(formulas.getResult(cell("r"))).toBe(7);
    expect(getter).toHaveBeenCalledTimes(reads);
    factor = 4;
    expect(formulas.getResult(cell("r"))).toBe(7);
    const state = model.getState(),
      notify = vi.fn();
    model.subscribe(notify);
    formulas.expire();
    expect(model.getState()).not.toBe(state);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(formulas.getResult(cell("r"))).toBe(13);
    factor = 5;
    model.expireValueCache();
    expect(formulas.getResult(cell("r"))).toBe(16);
  });

  it("isolates foreign same-ID row reads from resident memoization", () => {
    const { model, formulas } = fixture();
    expect(formulas.getResult(cell())).toBe(8);
    const foreign = { ...model.getRow("a")!, price: 10 };
    expect(model.getValue(foreign, "total")).toBe(40);
    expect(formulas.getResult(cell())).toBe(8);
    expect(model.getValue({ ...foreign, id: "missing" }, "total")).toBe(null);
    expect(formulas.getInput(cell("missing"))).toBeUndefined();
    expect(resultCode(formulas.getResult(cell("missing")))).toBe("REF");
  });

  it("rejects structural mutations before clearing history and freezes transaction/import atoms", () => {
    const { model, formulas } = fixture();
    formulas.setLiteral(cell(), 20);
    const state = model.getState(),
      rows = model.getRows(),
      notify = vi.fn();
    model.subscribe(notify);
    expect(() => model.applyTransaction({ remove: ["a"] })).toThrow(
      "Structural",
    );
    expect(() =>
      model.applyTransaction({ add: [{ ...rows[0]!, id: "new" }] }),
    ).toThrow("Structural");
    expect(() => model.setRows(rows.slice(1))).toThrow("Structural");
    expect(model.getRows()).toEqual(rows);
    expect(model.getState()).toBe(state);
    expect(notify).not.toHaveBeenCalled();
    expect(model.undo()).toBe(true);
    expect(formulas.getResult(cell())).toBe(8);
    const atom = { kind: "formula" as const, expression: "=42" };
    model.applyTransaction({
      update: [{ ...model.getRow("a")!, total: atom }],
    });
    atom.expression = "=100";
    expect(formulas.getResult(cell())).toBe(42);
    expect(Object.isFrozen(formulas.getInput(cell()))).toBe(true);
  });

  it("enforces schema, total sheet, formula, dependency, text and batch limits", () => {
    expect(() => fixture({ formulaGridLimits: { maxCells: 14 } })).toThrow(
      "cell",
    );
    expect(() => fixture({ formulaGridLimits: { maxFormulas: 2 } })).toThrow(
      "count",
    );
    expect(() =>
      fixture({ formulaGridLimits: { maxDependencies: 1 } }),
    ).toThrow("dependency");
    expect(() =>
      fixture({ formulaGridLimits: { maxFormulaText: 2 } }),
    ).toThrow();
    expect(() => fixture({ formulaLimits: { maxTokens: 1 } })).toThrow();
    expect(() => fixture({ formulaColumns: ["total", "total"] })).toThrow(
      "unique",
    );
    expect(() => fixture({ formulaColumns: ["missing"] })).toThrow("raw field");
    expect(() =>
      fixture({ formulaGridLimits: { maxCells: Infinity } }),
    ).toThrow();
    expect(() => fixture({ formulaLimits: { maxDepth: 65 } })).toThrow();
    const { model, formulas } = fixture({
      formulaGridLimits: { maxBatchEdits: 1 },
    });
    const state = model.getState();
    expect(
      formulas.batchInputs([
        { rowId: "a", columnId: "total", value: 1 },
        { rowId: "b", columnId: "total", value: 2 },
      ]),
    ).toContain("edit budget");
    expect(
      model.batchEdit([
        { rowId: "a", columnId: "total", value: 1 },
        { rowId: "b", columnId: "total", value: 2 },
      ]),
    ).toContain("edit budget");
    expect(model.getState()).toBe(state);
  });

  it("uses evaluation-local diamond memoization even with a one-entry cache", () => {
    const getter = vi.fn(() => 3);
    const { formulas } = createFormulaGrid({
      rows: [
        {
          id: "r",
          left: formulaInput("=[base]+1"),
          right: formulaInput("=[base]*2"),
          result: formulaInput("=[left]+[right]"),
        },
      ],
      columns: [
        { id: "base", valueGetter: getter },
        { id: "left", field: "left" },
        { id: "right", field: "right" },
        { id: "result", field: "result" },
      ],
      formulaColumns: ["left", "right", "result"],
      getRowId: (row) => row.id,
      formulaGridLimits: { cacheMaxEntries: 1 },
    });
    expect(formulas.getResult(cell("r", "result"))).toBe(10);
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it("bounds candidate validation work and preserves the previous calculation on rollback", () => {
    const { model, formulas } = fixture({
      formulaGridLimits: { maxValidationSteps: 1 },
      validateFormulaResult: () => undefined,
    });
    const state = model.getState(),
      rows = model.getRows(),
      notify = vi.fn();
    model.subscribe(notify);
    expect(formulas.setLiteral(cell(), 10)).toContain("validation work budget");
    expect(model.getState()).toBe(state);
    expect(model.getRows()).toEqual(rows);
    expect(formulas.getResult(cell())).toBe(8);
    expect(notify).not.toHaveBeenCalled();
    expect(model.undo()).toBe(false);
  });

  it("returns evaluation budget errors without poisoning a later smaller independent read", () => {
    const { formulas } = fixture({ formulaLimits: { maxEvaluationSteps: 7 } });
    expect(resultCode(formulas.getResult(cell("c")))).toBe("LIMIT");
    expect(formulas.getResult(cell("a"))).toBe(8);
  });

  it("bounds reentrant foreign-row getter reads without changing the committed sheet", () => {
    type ForeignRow = { id: string; total: FormulaGridInput };
    let model: GridModel<ForeignRow>;
    const getter = vi.fn((row: ForeignRow) => model.getValue(row, "total"));
    const grid = createFormulaGrid<ForeignRow>({
      rows: [{ id: "r", total: 2 }],
      columns: [
        { id: "base", valueGetter: getter },
        { id: "total", field: "total" },
      ],
      formulaColumns: ["total"],
      getRowId: (row) => row.id,
    });
    model = grid.model;
    const foreign = { id: "r", total: formulaInput("=[base]+1") };
    // The getter deliberately consumes the public null projection of its cyclic
    // nested read. That blank becomes 0 in the outer arithmetic expression.
    const value = model.getValue(foreign, "total");
    expect(value).toBe(1);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(
      model.getColumns().find((column) => column.id === "total")!
        .valueFormatter!(value, foreign),
    ).toBe("1");
    expect(getter).toHaveBeenCalledTimes(2);
    expect(grid.formulas.getResult(cell("r"))).toBe(2);
    expect(model.getRow("r")!.total).toBe(2);
  });

  it("stops candidate evaluation at the remaining validation budget before reading providers", () => {
    const provider = vi.fn(() => 3);
    const { model, formulas } = createFormulaGrid({
      rows: [{ id: "r", total: formulaInput("=[base]*2") }],
      columns: [
        { id: "base", valueGetter: provider },
        { id: "total", field: "total", editable: true },
      ],
      formulaColumns: ["total"],
      getRowId: (row) => row.id,
      formulaGridLimits: { maxValidationSteps: 1 },
      validateFormulaResult: () => undefined,
    });
    const before = model.getState();
    expect(formulas.setFormula(cell("r"), "=[base]*3")).toContain(
      "validation work budget",
    );
    expect(provider).not.toHaveBeenCalled();
    expect(model.getState()).toBe(before);
    expect(formulas.getFormula(cell("r"))).toBe("=[base]*2");
    expect(formulas.getResult(cell("r"))).toBe(6);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(model.undo()).toBe(false);
  });

  it("retains custom formatting and source row context, including prototype-like IDs", () => {
    const format = vi.fn(
      (value: unknown, row: { id: string }) => `${row.id}:${value}`,
    );
    const { model, formulas } = createFormulaGrid({
      rows: [{ id: "constructor", value: formulaInput("=2+3") }],
      columns: [
        {
          id: "__proto__",
          field: "value",
          editable: true,
          valueFormatter: format,
        },
      ],
      formulaColumns: ["__proto__"],
      getRowId: (row) => row.id,
    });
    expect(formulas.getResult(cell("constructor", "__proto__"))).toBe(5);
    expect(model.exportCsv()).toContain('"constructor:5"');
    expect(format.mock.calls[0]![1]).toBe(model.getRow("constructor"));
    const notify = vi.fn();
    model.subscribe(notify);
    expect(
      formulas.setFormula(cell("constructor", "__proto__"), "=[__proto__]"),
    ).toBeUndefined();
    expect(
      resultCode(formulas.getResult(cell("constructor", "__proto__"))),
    ).toBe("CYCLE");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("preserves normal grids and rejects atoms on non-enabled fields and ordinary getter writes", () => {
    const { model, formulas } = fixture();
    const state = model.getState();
    expect(model.editCell("a", "price", formulaInput("=10"))).toBe(
      "Column is not formula enabled",
    );
    expect(formulas.setFormula(cell("a", "price"), "=10")).toBe(
      "Column is not formula enabled",
    );
    expect(model.getState()).toBe(state);
    const plain = createGrid({
      rows: [{ id: "r", value: "=1+2" }],
      columns: [
        { id: "value", field: "value", editable: true },
        {
          id: "derived",
          field: "value",
          editable: true,
          valueGetter: () => 10,
        },
      ],
      getRowId: (row) => row.id,
    });
    expect(plain.getValue(plain.getRow("r")!, "value")).toBe("=1+2");
    expect(plain.editCell("r", "derived", "new")).toBe("Cell is read only");
    expect(plain.editCell("r", "value", "=5+6")).toBeUndefined();
    expect(plain.getValue(plain.getRow("r")!, "value")).toBe("=5+6");
  });

  it("returns thrown result-validator failures atomically through existing batch errors", () => {
    const { model, formulas } = fixture({
      validateFormulaResult: () => {
        throw new Error("External constraint unavailable");
      },
    });
    const state = model.getState(),
      rows = model.getRows(),
      notify = vi.fn();
    model.subscribe(notify);
    expect(formulas.setFormula(cell(), "=4")).toBe(
      "External constraint unavailable",
    );
    expect(model.getState()).toBe(state);
    expect(model.getRows()).toEqual(rows);
    expect(notify).not.toHaveBeenCalled();
    expect(formulas.getResult(cell())).toBe(8);
  });

  it("terminates reentrant getter cycles without publishing diagnostics", () => {
    let model: GridModel<{ id: string; total: FormulaGridInput }>;
    let formulas: FormulaGridController<{
      id: string;
      total: FormulaGridInput;
    }>;
    const grid = createFormulaGrid({
      rows: [{ id: "r", total: formulaInput("=[input]") as FormulaGridInput }],
      columns: [
        { id: "input", valueGetter: () => formulas.getResult(cell("r")) },
        { id: "total", field: "total" },
      ],
      formulaColumns: ["total"],
      getRowId: (row) => row.id,
    });
    model = grid.model;
    formulas = grid.formulas;
    const notify = vi.fn();
    model.subscribe(notify);
    expect(resultCode(grid.formulas.getResult(cell("r")))).toBe("VALUE");
    expect(notify).not.toHaveBeenCalled();
  });
});
