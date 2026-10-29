// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid, type CellRange, type Column } from "../../core/src/index";
import { computeGridChartData, GridChart } from "./charts";
type Item = {
  id: string;
  category: string;
  x: number;
  a: number | null;
  b: number | null;
};
const columns: Column<Item>[] = [
  { id: "category", field: "category", header: "Category" },
  { id: "x", field: "x", type: "number", header: "Position" },
  { id: "a", field: "a", type: "number", header: "Amount", editable: true },
  { id: "b", field: "b", type: "number", header: "Balance", editable: true },
];
const rows: Item[] = [
  { id: "a", category: "Alpha", x: 1, a: 10, b: -2 },
  { id: "b", category: "Alpha", x: 2, a: 20, b: 0 },
  { id: "c", category: "Beta", x: 3, a: null, b: 4 },
  { id: "d", category: "Gamma", x: 4, a: NaN, b: Infinity },
];
const make = (data = rows) =>
  createGrid({ rows: data, columns, getRowId: (r) => r.id });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("chart projections", () => {
  it("aggregates categories without coercing missing and nonfinite values", () => {
    const data = computeGridChartData(make(), {
      xColumnId: "category",
      yColumnIds: ["a", "b"],
    });
    expect(data.totalPoints).toBe(3);
    expect(data.sourceRowCount).toBe(4);
    expect(data.points.map((p) => p.values)).toEqual([
      { a: 30, b: -2 },
      { a: null, b: 4 },
      { a: null, b: null },
    ]);
    expect(
      computeGridChartData(make(), {
        xColumnId: "category",
        yColumnIds: ["a"],
        aggregation: "avg",
      }).points[0].values.a,
    ).toBe(15);
  });
  it("uses sorted continuous X for lines and individual rows for numeric scatter", () => {
    const model = make();
    model.setSort("x", "desc");
    const line = computeGridChartData(model, {
      type: "line",
      xColumnId: "x",
      yColumnIds: ["a"],
    });
    expect(line.numericX).toBe(true);
    expect(line.points.map((p) => p.x)).toEqual([1, 2, 3, 4]);
    const scatter = computeGridChartData(model, {
      type: "scatter",
      xColumnId: "x",
      yColumnIds: ["b"],
    });
    expect(scatter.points.map((p) => p.x)).toEqual([4, 3, 2, 1]);
    expect(scatter.totalPoints).toBe(4);
    expect(
      computeGridChartData(model, {
        type: "scatter",
        xColumnId: "category",
        yColumnIds: ["a"],
      }).points,
    ).toEqual([]);
  });
  it("scopes reversed range endpoints to visible leaf rows and columns", () => {
    const model = make();
    const range: CellRange = {
      anchor: { rowId: "b", columnId: "b" },
      focus: { rowId: "a", columnId: "category" },
    };
    const data = computeGridChartData(model, {
      range,
      xColumnId: "category",
      yColumnIds: ["a", "b"],
    });
    expect(data.sourceRowCount).toBe(2);
    expect(data.points[0].values).toEqual({ a: 30, b: -2 });
    model.hideColumn("b", true);
    const hidden = computeGridChartData(model, {
      range,
      xColumnId: "category",
      yColumnIds: ["a"],
    });
    expect(hidden.invalidRange).toBe(true);
    expect(hidden.points).toEqual([]);
  });
  it("never broadens stale or collapsed range endpoints to the whole dataset", () => {
    const model = make();
    const range = {
      anchor: { rowId: "a", columnId: "category" },
      focus: { rowId: "c", columnId: "a" },
    };
    model.setState({ groupBy: ["category"] });
    expect(computeGridChartData(model, { range }).invalidRange).toBe(true);
    expect(
      computeGridChartData(model, { xColumnId: "category", yColumnIds: ["a"] })
        .sourceRowCount,
    ).toBe(4);
    model.setState({ groupBy: [] });
    model.applyTransaction({ remove: ["a"] });
    expect(computeGridChartData(model, { range }).sourceRowCount).toBe(0);
  });
  it("uniformly samples a bounded result while retaining endpoints", () => {
    const model = make(
      Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        category: `C${i}`,
        x: i,
        a: i,
        b: i,
      })),
    );
    const data = computeGridChartData(model, {
      maxPoints: 5,
      xColumnId: "category",
      yColumnIds: ["a"],
    });
    expect(data.sampled).toBe(true);
    expect(data.totalPoints).toBe(20);
    expect(data.points.map((p) => p.label)).toEqual([
      "C0",
      "C4",
      "C9",
      "C14",
      "C19",
    ]);
    expect(
      computeGridChartData(model, {
        maxPoints: 0,
        xColumnId: "category",
        yColumnIds: ["a"],
      }).points,
    ).toHaveLength(1);
  });
  it("bounds series and skips unsafe numeric coercion or overflowed sums", () => {
    const model = make([
      { id: "a", category: "Huge", x: 1, a: 1e308, b: 0 },
      { id: "b", category: "Huge", x: 2, a: 1e308, b: null },
    ]);
    expect(
      computeGridChartData(model, { xColumnId: "category", yColumnIds: ["a"] })
        .points[0].values.a,
    ).toBeNull();
    const mixed = make([
      {
        id: "a",
        category: "Mixed",
        x: 1,
        a: "42" as unknown as number,
        b: 1n as unknown as number,
      },
    ]);
    expect(
      computeGridChartData(mixed, {
        xColumnId: "category",
        yColumnIds: ["a", "b"],
      }).points[0].values,
    ).toEqual({ a: null, b: null });
  });
});
describe("React GridChart", () => {
  it("renders labelled SVG bars, legend and exact accessible data table", () => {
    render(
      <GridChart
        model={make()}
        xColumnId="category"
        yColumnIds={["a", "b"]}
        ariaLabel="Holdings chart"
      />,
    );
    const image = screen.getByRole("img", { name: /Holdings chart/ });
    expect(image.querySelectorAll("rect")).toHaveLength(3);
    expect(
      screen.getByRole("list", { name: "Chart legend" }).textContent,
    ).toContain("Amount");
    fireEvent.click(screen.getByText("Chart data table (3 rows)"));
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("row", { name: "Alpha 30 -2" }),
    ).toBeTruthy();
    expect(image.getAttribute("viewBox")).toBe("0 0 800 320");
  });
  it("updates after validated edits, filters and interactive chart controls", () => {
    const model = make();
    render(<GridChart model={model} xColumnId="category" yColumnIds={["a"]} />);
    act(() => {
      model.editCell("a", "a", 5);
    });
    expect(screen.getByRole("img").innerHTML).toContain("25");
    fireEvent.change(screen.getByRole("combobox", { name: "Chart type" }), {
      target: { value: "line" },
    });
    expect(
      screen.getByRole("img").querySelector("path[data-series=a]"),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Chart aggregation" }),
      { target: { value: "avg" } },
    );
    act(() => model.setFilter("category", { op: "equals", value: "Alpha" }));
    expect(
      screen.getByText(/2 source rows. Showing 1 of 1 categories/),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Chart data table (1 rows)"));
    expect(screen.getByRole("table").textContent).toContain("12.5");
    fireEvent.click(screen.getByText("Y series (1/8)"));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Chart series Balance" }),
    );
    expect(
      screen.getByRole("img").querySelectorAll("path[data-series]"),
    ).toHaveLength(2);
  });
  it("renders line gaps, scatter marks and safe empty/all-zero domains", () => {
    const model = make([
      { id: "a", category: "A", x: 0, a: 1, b: 0 },
      { id: "b", category: "B", x: 1, a: null, b: 0 },
      { id: "c", category: "C", x: 2, a: -1, b: 0 },
    ]);
    const view = render(
      <GridChart
        model={model}
        xColumnId="category"
        yColumnIds={["a"]}
        type="line"
      />,
    );
    const path = screen
      .getByRole("img")
      .querySelector("path")!
      .getAttribute("d")!;
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).not.toContain("NaN");
    view.rerender(
      <GridChart
        model={model}
        xColumnId="x"
        yColumnIds={["a"]}
        type="scatter"
      />,
    );
    expect(screen.getByRole("img").querySelectorAll("circle")).toHaveLength(2);
    view.rerender(
      <GridChart
        model={model}
        xColumnId="category"
        yColumnIds={["b"]}
        type="bar"
      />,
    );
    expect(screen.getByRole("img").innerHTML).not.toMatch(/NaN|Infinity/);
    act(() => model.setRows([]));
    expect(screen.getByText("No finite numeric values to chart")).toBeTruthy();
  });
  it("shows range invalidation and sampling limits, excludes hidden series", () => {
    const model = make();
    const range: CellRange = {
      anchor: { rowId: "a", columnId: "category" },
      focus: { rowId: "b", columnId: "b" },
    };
    render(
      <GridChart
        model={model}
        range={range}
        xColumnId="category"
        yColumnIds={["a", "b"]}
        maxPoints={1}
      />,
    );
    expect(
      screen.getByText(/2 source rows. Showing 1 of 1 categories/),
    ).toBeTruthy();
    act(() => model.hideColumn("b", true));
    expect(
      screen.getByText(/selected range is no longer visible/),
    ).toBeTruthy();
    expect(screen.getByRole("img").querySelectorAll("rect")).toHaveLength(0);
  });
  it("scales opposite-sign finite extremes without invalid SVG coordinates", () => {
    const model = make([
      {
        id: "a",
        category: "A",
        x: -Number.MAX_VALUE,
        a: -Number.MAX_VALUE,
        b: 0,
      },
      {
        id: "b",
        category: "B",
        x: Number.MAX_VALUE,
        a: Number.MAX_VALUE,
        b: 0,
      },
    ]);
    render(
      <GridChart
        model={model}
        xColumnId="x"
        yColumnIds={["a"]}
        type="scatter"
      />,
    );
    const image = screen.getByRole("img");
    expect(image.innerHTML).not.toMatch(/NaN|Infinity/);
    const circles = [...image.querySelectorAll("circle")];
    expect(circles).toHaveLength(2);
    expect(
      circles.every(
        (circle) =>
          Number.isFinite(Number(circle.getAttribute("cx"))) &&
          Number.isFinite(Number(circle.getAttribute("cy"))),
      ),
    ).toBe(true);
  });
  it("shows sampling warnings and full numeric precision in the data table", () => {
    const model = make(
      Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        category: `Row ${i}`,
        x: i,
        a: 0.123456789,
        b: 0,
      })),
    );
    render(
      <GridChart
        model={model}
        xColumnId="category"
        yColumnIds={["a"]}
        maxPoints={2}
      />,
    );
    expect(screen.getByText(/Uniform sampling is active/)).toBeTruthy();
    fireEvent.click(screen.getByText("Chart data table (2 rows)"));
    expect(screen.getByRole("table").textContent).toContain("0.123456789");
    expect(screen.getByRole("img").querySelectorAll("rect")).toHaveLength(2);
  });
  it("reports unsupported browser download behavior without throwing", () => {
    const BaseURL = URL;
    vi.stubGlobal(
      "URL",
      class extends BaseURL {
        static createObjectURL(): string {
          throw new Error("blocked");
        }
      },
    );
    render(
      <GridChart model={make()} xColumnId="category" yColumnIds={["a"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export chart SVG" }));
    expect(screen.getByRole("status").textContent).toContain("unavailable");
  });
  it("exports real SVG through a browser download and reports success", () => {
    const create = vi.fn((_blob: Blob) => "blob:chart");
    const revoke = vi.fn();
    const BaseURL = URL;
    vi.stubGlobal(
      "URL",
      class extends BaseURL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(
      <GridChart model={make()} xColumnId="category" yColumnIds={["a"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export chart SVG" }));
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:chart");
    expect(screen.getByRole("status").textContent).toBe("Chart SVG exported");
  });
});
