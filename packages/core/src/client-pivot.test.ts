import { describe, expect, it, vi } from "vitest";
import {
  createGrid,
  buildClientPivotReport,
  exportClientPivotCsv,
  normalizePivotConfiguration,
  ClientPivotError,
} from "./index.js";
import type { Column, PivotConfiguration, PivotAggregation } from "./index.js";
type Item = {
  id: string;
  row: unknown;
  column: unknown;
  value: unknown;
  other?: unknown;
};
const rows: Item[] = [
  { id: "a", row: "North", column: "A", value: 1 },
  { id: "b", row: "North", column: "A", value: 3 },
  { id: "c", row: "North", column: "B", value: 100 },
  { id: "d", row: "South", column: "A", value: 10 },
  { id: "e", row: "South", column: "B", value: 20 },
];
const columns: Column<Item>[] = [
  { id: "row", field: "row", header: "Region" },
  { id: "column", field: "column", header: "Game" },
  {
    id: "value",
    field: "value",
    header: "Amount",
    type: "number",
    editable: true,
  },
  { id: "other", field: "other", header: "Other" },
];
const make = (data = rows, definitions = columns) =>
  createGrid<Item>({
    rows: data,
    columns: definitions,
    getRowId: (row) => row.id,
  });
const config = (aggregate: PivotAggregation = "sum"): PivotConfiguration => ({
  rows: ["row"],
  columns: ["column"],
  values: [{ columnId: "value", aggregate }],
});
function valueColumn(
  report: ReturnType<typeof buildClientPivotReport>,
  pivot?: unknown,
) {
  return report.columns.find((column) =>
    pivot === undefined
      ? column.kind === "rowTotal"
      : column.kind === "value" && column.pivotKeys![0].value === pivot,
  )!;
}
describe("bounded client pivot reports", () => {
  it("builds row/column values and totals without changing source state", () => {
    const model = make(),
      previous = model.getState();
    const report = buildClientPivotReport(model, config());
    expect(report.sourceRowCount).toBe(5);
    expect(report.rows.map((row) => row.keys[0].value)).toEqual([
      "North",
      "South",
    ]);
    expect(report.rows[0].cells[valueColumn(report, "A").id]).toBe(4);
    expect(report.rows[0].cells[valueColumn(report, "B").id]).toBe(100);
    expect(report.rows[0].cells[valueColumn(report).id]).toBe(104);
    expect(report.grandTotal!.cells[valueColumn(report).id]).toBe(134);
    expect(model.getState()).toBe(previous);
    expect(model.getRows()).toEqual(rows);
  });
  it("computes weighted averages from original records for every total", () => {
    const report = buildClientPivotReport(make(), config("avg"));
    expect(report.rows[0].cells[valueColumn(report, "A").id]).toBe(2);
    expect(report.rows[0].cells[valueColumn(report).id]).toBeCloseTo(104 / 3);
    expect(report.rows[1].cells[valueColumn(report).id]).toBe(15);
    expect(report.grandTotal!.cells[valueColumn(report, "A").id]).toBeCloseTo(
      14 / 3,
    );
    expect(report.grandTotal!.cells[valueColumn(report, "B").id]).toBe(60);
    expect(report.grandTotal!.cells[valueColumn(report).id]).toBeCloseTo(
      134 / 5,
    );
  });
  it("supports multiple row fields, column fields and independent value columns", () => {
    const report = buildClientPivotReport(
      make(rows.map((row) => ({ ...row, other: row.id === "a" ? "X" : "Y" }))),
      {
        rows: ["row", "other"],
        columns: ["column", "other"],
        values: [
          { columnId: "value", aggregate: "sum" },
          { columnId: "row", aggregate: "count" },
        ],
      },
    );
    expect(report.rows).toHaveLength(3);
    expect(
      report.columns.filter((column) => column.kind === "dimension"),
    ).toHaveLength(2);
    expect(report.columns.some((column) => column.groupPath.length === 2)).toBe(
      true,
    );
    const count = report.columns.find(
      (column) => column.kind === "rowTotal" && column.sourceColumnId === "row",
    )!;
    expect(report.grandTotal!.cells[count.id]).toBe(5);
  });
  it.each(["sum", "count", "min", "max", "avg"] as const)(
    "uses documented empty intersections for %s",
    (operation) => {
      const report = buildClientPivotReport(
        make([rows[0], rows[4]]),
        config(operation),
      );
      expect(report.rows[0].cells[valueColumn(report, "B").id]).toBe(
        operation === "sum" || operation === "count" ? 0 : null,
      );
    },
  );
  it("uses filtered source records and updates after edit/undo", () => {
    const model = make();
    model.setFilter("value", { op: "gt", value: 5 });
    const report = buildClientPivotReport(model, config("avg"));
    expect(report.sourceRowCount).toBe(3);
    expect(report.grandTotal!.cells[valueColumn(report).id]).toBeCloseTo(
      130 / 3,
    );
    model.setFilter("value");
    model.editCell("a", "value", 5);
    const changed = buildClientPivotReport(model, config());
    expect(changed.grandTotal!.cells[valueColumn(changed).id]).toBe(138);
    expect(report.grandTotal!.cells[valueColumn(report).id]).toBeCloseTo(
      130 / 3,
    );
    model.undo();
    const undone = buildClientPivotReport(model, config());
    expect(undone.grandTotal!.cells[valueColumn(undone).id]).toBe(134);
  });
  it("keeps BigInts exact and uses integer-division averages", () => {
    const model = make(
      [
        { ...rows[0], value: 9007199254740993n },
        { ...rows[1], value: 9007199254740994n },
      ],
      columns.map((column) =>
        column.id === "value" ? { ...column, type: "bigint" } : column,
      ),
    );
    const report = buildClientPivotReport(model, config());
    expect(report.grandTotal!.cells[valueColumn(report).id]).toBe(
      18014398509481987n,
    );
    expect(report.grandTotal!.display[valueColumn(report).id]).toBe(
      "18014398509481987",
    );
    const average = buildClientPivotReport(model, config("avg"));
    expect(average.grandTotal!.cells[valueColumn(average).id]).toBe(
      9007199254740993n,
    );
  });
  it("rejects mixed numeric types and non-finite aggregate results explicitly", () => {
    expect(() =>
      buildClientPivotReport(
        make([{ ...rows[0], value: 1n }, rows[1]]),
        config(),
      ),
    ).toThrow(/cannot be mixed/);
    expect(() =>
      buildClientPivotReport(
        make([
          { ...rows[0], value: 1e308 },
          { ...rows[1], value: 1e308 },
        ]),
        config(),
      ),
    ).toThrow(/overflow/);
  });
  it("keeps typed, delimiter-containing and signed-zero identities separate", () => {
    const inputs = [1, "1", 0, -0, null, undefined, "a|b", "[a,b]", 1n];
    const report = buildClientPivotReport(
      make(
        inputs.map((row, index) => ({
          id: String(index),
          row,
          column: "A",
          value: 1,
        })),
      ),
      config(),
    );
    expect(report.rows).toHaveLength(inputs.length);
    expect(new Set(report.rows.map((row) => row.id)).size).toBe(inputs.length);
    expect(
      new Set(report.rows.map((row) => row.display[report.columns[0].id])).size,
    ).toBe(inputs.length);
    expect(report.grandTotal!.cells[valueColumn(report).id]).toBe(
      inputs.length,
    );
  });
  it("normalizes valid dates without aliasing source Date objects or string identities", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const report = buildClientPivotReport(
      make([
        { ...rows[0], row: date },
        { ...rows[1], row: date.toISOString() },
      ]),
      config(),
    );
    expect(report.rows).toHaveLength(2);
    date.setUTCFullYear(2000);
    expect(report.rows[0].keys[0].value).toBe("2026-01-01T00:00:00.000Z");
    expect(() =>
      buildClientPivotReport(
        make([{ ...rows[0], row: new Date("invalid") }]),
        config(),
      ),
    ).toThrow(/Invalid pivot date/);
  });
  it("rejects object/symbol dimensions without invoking arbitrary conversion methods", () => {
    const convert = vi.fn(() => "unsafe");
    for (const row of [{ toString: convert, toJSON: convert }, Symbol("x")])
      expect(() =>
        buildClientPivotReport(make([{ ...rows[0], row }]), config()),
      ).toThrow(ClientPivotError);
    expect(convert).not.toHaveBeenCalled();
  });
  it("formats dimensions with real source rows and aggregates with row-free context", () => {
    const currency = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    });
    const source = vi.fn((value: unknown, row: Item) => {
      expect(rows.some((item) => item.id === row.id)).toBe(true);
      return `Region ${value}`;
    });
    const fake = vi.fn(() => {
      throw new Error("source value formatter must not receive pivot rows");
    });
    const model = make(
      rows,
      columns.map((column) =>
        column.id === "row"
          ? { ...column, valueFormatter: source }
          : column.id === "value"
            ? {
                ...column,
                valueFormatter: fake,
                aggregateFormatter: (value, context) =>
                  context.aggregate === "count"
                    ? String(value)
                    : currency.format(Number(value)),
              }
            : column,
      ),
    );
    const report = buildClientPivotReport(model, config());
    expect(report.rows[0].display[report.columns[0].id]).toBe("Region North");
    expect(report.rows[0].display[valueColumn(report).id]).toBe("$104.00");
    expect(fake).not.toHaveBeenCalled();
    const count = buildClientPivotReport(model, config("count"));
    expect(count.grandTotal!.display[valueColumn(count).id]).toBe("5");
  });
  it("reads each selected source value only once per record", () => {
    const getter = vi.fn((row: Item) => row.value);
    const model = make(rows, [
      { id: "value", valueGetter: getter, type: "number" },
    ]);
    const report = buildClientPivotReport(model, {
      rows: ["value"],
      columns: ["value"],
      values: [{ columnId: "value", aggregate: "sum" }],
    });
    expect(report.sourceRowCount).toBe(5);
    expect(getter).toHaveBeenCalledTimes(5);
  });
  it("returns detached frozen report/configuration/cell snapshots", () => {
    const configuration = {
      rows: ["row"],
      columns: ["column"],
      values: [{ columnId: "value", aggregate: "sum" as const }],
    };
    const report = buildClientPivotReport(make(), configuration);
    configuration.rows[0] = "other";
    expect(report.configuration.rows).toEqual(["row"]);
    for (const value of [
      report,
      report.columns,
      report.rows,
      report.rows[0],
      report.rows[0].cells,
      report.rows[0].display,
      report.rows[0].keys,
      report.configuration.values[0],
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(Object.getPrototypeOf(report.rows[0].cells)).toBe(null);
  });
  it("supports summary-only and no-column configurations without duplicate totals", () => {
    const summary = buildClientPivotReport(make(), {
      ...config("avg"),
      rows: [],
    });
    expect(summary.rows).toHaveLength(1);
    expect(summary.grandTotal).toBeUndefined();
    expect(summary.rows[0].display[summary.columns[0].id]).toBe("All records");
    expect(summary.rows[0].cells[valueColumn(summary).id]).toBeCloseTo(134 / 5);
    const noColumns = buildClientPivotReport(make(), {
      ...config("avg"),
      columns: [],
    });
    expect(noColumns.columns).toHaveLength(2);
    expect(noColumns.columns.some((column) => column.kind === "rowTotal")).toBe(
      false,
    );
    expect(noColumns.grandTotal!.cells[noColumns.columns[1].id]).toBeCloseTo(
      134 / 5,
    );
  });
  it("keeps no-values configuration functional without pretending there is a report", () => {
    const report = buildClientPivotReport(make(), {
      rows: ["row"],
      columns: ["column"],
      values: [],
    });
    expect(report.emptyReason).toBe("noValues");
    expect(report.rows).toEqual([]);
    expect(report.grandTotal).toBeUndefined();
  });
  it("handles empty source totals without NaN", () => {
    for (const aggregate of ["sum", "count", "avg"] as const) {
      const report = buildClientPivotReport(make([]), config(aggregate));
      expect(report.rows).toEqual([]);
      expect(report.grandTotal!.cells[valueColumn(report).id]).toBe(
        aggregate === "avg" ? null : 0,
      );
    }
  });
  it("enforces input, row, column and cell budgets with explicit errors", () => {
    const options = [
      { maxSourceRows: 4 },
      { maxRows: 1 },
      { maxColumns: 3 },
      { maxCells: 3 },
    ];
    for (const limits of options)
      expect(() =>
        buildClientPivotReport(make(), config(), { limits }),
      ).toThrow(ClientPivotError);
    for (const maxCells of [0, -1, 1.5, NaN, Infinity, 2000001])
      expect(() =>
        buildClientPivotReport(make(), config(), { limits: { maxCells } }),
      ).toThrow(/Invalid pivot limit/);
  });
  it("rejects malformed/unknown/duplicate/sparse configuration atomically", () => {
    const base = config(),
      available = columns;
    for (const rows of [["unknown"], ["row", "row"], new Array(1)])
      expect(() =>
        normalizePivotConfiguration({ ...base, rows }, available),
      ).toThrow(ClientPivotError);
    for (const values of [
      [{ columnId: "value", aggregate: "bogus" }],
      [base.values[0], base.values[0]],
      new Array(1),
    ])
      expect(() =>
        normalizePivotConfiguration(
          { ...base, values } as PivotConfiguration,
          available,
        ),
      ).toThrow(ClientPivotError);
    expect(() =>
      buildClientPivotReport(
        make(),
        { ...base, rows: ["row", "column"], values: [] },
        { limits: { maxColumns: 1 } },
      ),
    ).toThrow(/dimensions exceed/);
  });
  it("uses safe identities for prototype-like keys and avoids total-header collisions", () => {
    const report = buildClientPivotReport(
      make([
        { ...rows[0], row: "__proto__", column: "Total" },
        { ...rows[1], row: "constructor", column: "A" },
      ]),
      config(),
    );
    expect(report.rows).toHaveLength(2);
    expect(
      report.columns.find((column) => column.kind === "rowTotal")!.groupPath,
    ).toEqual(["Total (2)"]);
  });
  it("does not merge ordinal suffixes with real category labels, including nested paths", () => {
    const data = [1, "1", "1 (1)", "1 (2)", "1 (3)"].map((value, index) => ({
      id: String(index),
      row: value,
      column: value,
      value: index + 1,
      other: "Parent",
    }));
    const setup = {
      ...config(),
      rows: ["other", "row"],
      columns: ["other", "column"],
      rowTotals: false,
    };
    const report = buildClientPivotReport(make(data), setup);
    const paths = report.columns
      .filter((column) => column.kind === "value")
      .map((column) => JSON.stringify(column.groupPath));
    expect(new Set(paths).size).toBe(5);
    expect(
      new Set(report.rows.map((row) => row.display[report.columns[1].id])).size,
    ).toBe(5);
    expect(paths).toContain(JSON.stringify(["Parent", "1 (1)"]));
    const reversed = buildClientPivotReport(make([...data].reverse()), setup);
    for (const column of report.columns)
      expect(
        reversed.columns.find((item) => item.id === column.id)!.groupPath,
      ).toEqual(column.groupPath);
  });
  it("exports actual formatted CSV with row/grand totals and formula neutralisation", () => {
    const report = buildClientPivotReport(
      make([{ ...rows[0], row: '=HYPERLINK("bad")' }]),
      config(),
    );
    const csv = exportClientPivotCsv(report);
    expect(csv).toContain('"Total / Sum Amount"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"Grand total"');
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});
