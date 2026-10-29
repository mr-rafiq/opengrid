// @vitest-environment jsdom
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid } from "../../core/src/index";
import type { Column } from "../../core/src/types";
import { DataGrid } from "./data-grid";
import { NumberRangeFilter } from "./filter-components";
import type { ColumnFilterProps } from "./filter-components";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
type Row = { id: string; name: string; amount: number };
const columns: Column<Row>[] = [
  { id: "name", field: "name", header: "Name", width: 180 },
  {
    id: "amount",
    field: "amount",
    header: "Amount",
    type: "number",
    width: 220,
  },
];
function model() {
  return createGrid({
    rows: [1, 2, 3, 4, 5].map((amount) => ({
      id: String(amount),
      name: `Item ${amount}`,
      amount,
    })),
    columns,
    getRowId: (row) => row.id,
  });
}
const rangeComponents = { amount: NumberRangeFilter<Row> };
const amountValues = (grid: ReturnType<typeof model>) =>
  grid.getFilteredRows().map((row) => row.amount);
function input(label: string) {
  return screen.getByRole("textbox", { name: label }) as HTMLInputElement;
}
function change(label: string, value: string) {
  fireEvent.change(input(label), { target: { value } });
}

describe("controlled inclusive range filter", () => {
  it("requires an explicit numeric/date column type rather than applying ambiguous string comparisons", () => {
    const onFilterChange = vi.fn();
    render(
      <NumberRangeFilter
        column={columns[0]}
        label="Name"
        onFilterChange={onFilterChange}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "supports number, BigInt and date",
    );
    expect(input("Name minimum").disabled).toBe(true);
    expect(onFilterChange).not.toHaveBeenCalled();
  });
  it("filters actual model rows with lower, upper, between and empty bounds", () => {
    const grid = model();
    render(<DataGrid model={grid} filterComponents={rangeComponents} />);
    change("Filter Amount minimum", "2");
    expect(grid.getState().filters.amount).toEqual({ op: "gte", value: "2" });
    expect(amountValues(grid)).toEqual([2, 3, 4, 5]);
    change("Filter Amount maximum", "4");
    expect(grid.getState().filters.amount).toEqual({
      op: "between",
      value: "2",
      to: "4",
    });
    expect(amountValues(grid)).toEqual([2, 3, 4]);
    change("Filter Amount minimum", "");
    expect(grid.getState().filters.amount).toEqual({ op: "lte", value: "4" });
    expect(amountValues(grid)).toEqual([1, 2, 3, 4]);
    change("Filter Amount maximum", "");
    expect(grid.getState().filters.amount).toBeUndefined();
    expect(amountValues(grid)).toEqual([1, 2, 3, 4, 5]);
  });

  it("retains invalid or reversed drafts without replacing the last valid filter", () => {
    const grid = model();
    render(<DataGrid model={grid} filterComponents={rangeComponents} />);
    change("Filter Amount minimum", "3");
    change("Filter Amount maximum", "2");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("must not exceed");
    expect(input("Filter Amount maximum").value).toBe("2");
    expect(amountValues(grid)).toEqual([3, 4, 5]);
    expect(
      input("Filter Amount maximum").getAttribute("aria-describedby"),
    ).toBe(alert.id);
    expect(input("Filter Amount maximum").getAttribute("aria-invalid")).toBe(
      "true",
    );
    act(() => grid.toggleSelection("3"));
    expect(input("Filter Amount maximum").value).toBe("2");
    expect(screen.getByRole("alert")).toBeTruthy();
    change("Filter Amount maximum", "5");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(grid.getState().filters.amount.op).toBe("between");
  });

  it("rejects incomplete, non-finite and oversized operands without truncation", () => {
    const grid = model();
    render(<DataGrid model={grid} filterComponents={rangeComponents} />);
    change("Filter Amount minimum", "2");
    for (const value of [
      "-",
      "1e",
      "Infinity",
      "1e999",
      "0x10",
      "2abc",
      "9".repeat(257),
    ]) {
      change("Filter Amount minimum", value);
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(input("Filter Amount minimum").value).toBe(value);
      expect(amountValues(grid)).toEqual([2, 3, 4, 5]);
    }
  });

  it("synchronizes external controlled state and clears through its owned callback", () => {
    const grid = model();
    render(<DataGrid model={grid} filterComponents={rangeComponents} />);
    act(() => grid.setFilter("amount", { op: "between", value: 2, to: 3 }));
    expect(input("Filter Amount minimum").value).toBe("2");
    expect(input("Filter Amount maximum").value).toBe("3");
    act(() => grid.setFilter("amount", { op: "equals", value: 4 }));
    expect(input("Filter Amount minimum").value).toBe("4");
    expect(input("Filter Amount maximum").value).toBe("4");
    fireEvent.click(
      screen.getByRole("button", { name: "Clear Filter Amount" }),
    );
    expect(grid.getState().filters.amount).toBeUndefined();
    expect(input("Filter Amount minimum").value).toBe("");
  });

  it("reports unsupported external operators instead of silently clearing them", () => {
    const grid = model();
    grid.setFilter("amount", { op: "gt", value: 2 });
    render(<DataGrid model={grid} filterComponents={rangeComponents} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "not an inclusive range",
    );
    expect(grid.getState().filters.amount).toEqual({ op: "gt", value: 2 });
    change("Filter Amount minimum", "3");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(amountValues(grid)).toEqual([3, 4, 5]);
  });

  it("preserves BigInt precision and validates integer bounds without Number coercion", () => {
    const grid = createGrid({
      rows: [
        { id: "a", amount: 900719925474099312345n },
        { id: "b", amount: 900719925474099312346n },
      ],
      columns: [
        {
          id: "amount",
          field: "amount",
          header: "Serial",
          type: "bigint",
          width: 250,
        },
      ],
      getRowId: (row) => row.id,
    });
    render(
      <DataGrid
        model={grid}
        filterComponents={{ amount: NumberRangeFilter }}
      />,
    );
    change("Filter Serial minimum", "900719925474099312346");
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    expect(input("Filter Serial minimum").inputMode).toBe("numeric");
    change("Filter Serial maximum", "900719925474099312346.5");
    expect(screen.getByRole("alert").textContent).toContain("complete integer");
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
  });

  it("supports valid ISO date bounds and rejects nonexistent calendar dates", () => {
    const grid = createGrid({
      rows: [
        { id: "a", date: "2024-02-28" },
        { id: "b", date: "2024-02-29" },
        { id: "c", date: "2024-03-01" },
      ],
      columns: [
        { id: "date", field: "date", header: "Date", type: "date", width: 300 },
      ],
      getRowId: (row) => row.id,
    });
    render(
      <DataGrid model={grid} filterComponents={{ date: NumberRangeFilter }} />,
    );
    change("Filter Date minimum", "2024-02-28");
    change("Filter Date maximum", "2024-02-30");
    expect(screen.getByRole("alert").textContent).toContain(
      "valid calendar date",
    );
    expect(grid.getFilteredRows()).toHaveLength(3);
    change("Filter Date maximum", "2024-02-29");
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("keeps callback errors visible and preserves the supplied controlled filter", () => {
    const onFilterChange = vi.fn(() => {
      throw new Error("Rejected by host");
    });
    const onClear = vi.fn(() => {
      throw new Error("Clear rejected");
    });
    render(
      <NumberRangeFilter
        column={columns[1]}
        filter={{ op: "gte", value: "2" }}
        label="Amount"
        onFilterChange={onFilterChange}
        onClear={onClear}
      />,
    );
    change("Amount minimum", "3");
    expect(screen.getByRole("alert").textContent).toBe("Rejected by host");
    expect(input("Amount minimum").value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Clear Amount" }));
    expect(screen.getByRole("alert").textContent).toBe("Clear rejected");
  });
});

describe("DataGrid custom filter lifecycle", () => {
  it("resets the bound model page and vertical viewport when applying a custom filter", () => {
    const grid = createGrid({
      rows: Array.from({ length: 30 }, (_, index) => ({
        id: String(index + 1),
        name: `Item ${index + 1}`,
        amount: index + 1,
      })),
      columns,
      getRowId: (row) => row.id,
      initialState: { pageSize: 10, page: 2 },
    });
    render(
      <DataGrid model={grid} filterComponents={rangeComponents} height={180} />,
    );
    const viewport = screen.getByRole("grid");
    fireEvent.scroll(viewport, { target: { scrollTop: 180 } });
    change("Filter Amount minimum", "22");
    expect(grid.getState().page).toBe(0);
    expect(viewport.scrollTop).toBe(0);
    expect(grid.getFilteredRows()).toHaveLength(9);
  });
  it("mounts, updates and cleans up real React components controlled by the assigned model column", () => {
    const grid = model(),
      mounted = vi.fn(),
      unmounted = vi.fn(),
      updated = vi.fn();
    function Custom(props: ColumnFilterProps<Row>) {
      useEffect(() => {
        mounted();
        return () => {
          unmounted();
        };
      }, []);
      useEffect(() => {
        updated(props.filter);
      }, [props.filter]);
      return (
        <input
          aria-label={props.label}
          value={String(props.filter?.value ?? "")}
          onChange={(event) =>
            props.onFilterChange(
              event.target.value
                ? { op: "gte", value: event.target.value }
                : undefined,
            )
          }
        />
      );
    }
    const view = render(
      <DataGrid model={grid} filterComponents={{ amount: Custom }} />,
    );
    expect(mounted).toHaveBeenCalledTimes(1);
    change("Filter Amount", "3");
    expect(amountValues(grid)).toEqual([3, 4, 5]);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenLastCalledWith({ op: "gte", value: "3" });
    act(() => grid.setFilter("name", { op: "contains", value: "3" }));
    expect(grid.getState().filters.amount.value).toBe("3");
    expect(grid.getFilteredRows()).toHaveLength(1);
    view.unmount();
    expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it("uses native controls by default and ignores inherited component registry entries", () => {
    const inherited = vi.fn(() => <span>Inherited component</span>);
    const registry = Object.create({ amount: inherited });
    render(<DataGrid model={model()} filterComponents={registry} />);
    expect(screen.getByRole("textbox", { name: "Filter Amount" })).toBeTruthy();
    expect(inherited).not.toHaveBeenCalled();
  });

  it("handles prototype-like column IDs with own registry/filter lookups", () => {
    const seen = vi.fn();
    function Custom(props: ColumnFilterProps<{ id: string; value: number }>) {
      seen(props.filter);
      return (
        <button onClick={() => props.onFilterChange({ op: "gte", value: 2 })}>
          Apply prototype range
        </button>
      );
    }
    const grid = createGrid({
      rows: [
        { id: "a", value: 1 },
        { id: "b", value: 2 },
      ],
      columns: [{ id: "__proto__", field: "value", type: "number" }],
      getRowId: (row) => row.id,
    });
    render(
      <DataGrid
        model={grid}
        filterComponents={Object.fromEntries([["__proto__", Custom]])}
      />,
    );
    expect(seen).toHaveBeenCalledWith(undefined);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply prototype range" }),
    );
    expect(grid.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    expect(Object.hasOwn(grid.getState().filters, "__proto__")).toBe(true);
  });

  it("remounts filter owners on model replacement and never leaks invalid drafts into the replacement", () => {
    const first = model(),
      second = model();
    first.setFilter("amount", { op: "gte", value: "2" });
    second.setFilter("amount", { op: "gte", value: "2" });
    const view = render(
      <DataGrid model={first} filterComponents={rangeComponents} />,
    );
    change("Filter Amount minimum", "-");
    expect(screen.getByRole("alert")).toBeTruthy();
    view.rerender(
      <DataGrid model={second} filterComponents={rangeComponents} />,
    );
    expect(input("Filter Amount minimum").value).toBe("2");
    expect(screen.queryByRole("alert")).toBeNull();
    change("Filter Amount minimum", "4");
    expect(amountValues(second)).toEqual([4, 5]);
    expect(amountValues(first)).toEqual([2, 3, 4, 5]);
  });

  it("cleans up on hiding and restores persisted filter data when shown again", () => {
    const grid = model();
    render(<DataGrid model={grid} filterComponents={rangeComponents} />);
    change("Filter Amount minimum", "3");
    act(() => grid.hideColumn("amount", true));
    expect(
      screen.queryByRole("textbox", { name: "Filter Amount minimum" }),
    ).toBeNull();
    expect(amountValues(grid)).toEqual([3, 4, 5]);
    act(() => grid.hideColumn("amount", false));
    expect(input("Filter Amount minimum").value).toBe("3");
  });

  it("supports StrictMode effect replay without duplicate filter applications", () => {
    const grid = model(),
      setFilter = vi.spyOn(grid, "setFilter");
    render(
      <StrictMode>
        <DataGrid model={grid} filterComponents={rangeComponents} />
      </StrictMode>,
    );
    expect(setFilter).not.toHaveBeenCalled();
    change("Filter Amount minimum", "2");
    expect(setFilter).toHaveBeenCalledTimes(1);
    expect(amountValues(grid)).toEqual([2, 3, 4, 5]);
  });

  it.each(["native", "custom"])(
    "retains the focused %s filter through horizontal virtualization and restores persisted data after a later remount",
    (kind) => {
      type Wide = { id: string; [key: string]: string | number };
      const columns: Column<Wide>[] = Array.from(
        { length: 90 },
        (_, index) => ({
          id: `c${index}`,
          field: `c${index}`,
          header: `C${index}`,
          type: "number",
          width: 120,
        }),
      );
      const rows: Wide[] = [
        Object.fromEntries([
          ["id", "a"],
          ...columns.map((column, index) => [column.id, index]),
        ]) as Wide,
      ];
      const grid = createGrid({ rows, columns, getRowId: (row) => row.id });
      const props =
        kind === "custom"
          ? { filterComponents: { c60: NumberRangeFilter<Wide> } }
          : {};
      render(<DataGrid model={grid} {...props} columnOverscan={0} />);
      const viewport = screen.getByRole("grid");
      Object.defineProperty(viewport, "clientWidth", {
        configurable: true,
        value: 400,
      });
      fireEvent(window, new Event("resize"));
      fireEvent.scroll(viewport, { target: { scrollLeft: 7100 } });
      const label = kind === "custom" ? "Filter C60 minimum" : "Filter C60";
      const focused = input(label);
      act(() => focused.focus());
      fireEvent.change(focused, { target: { value: "60" } });
      fireEvent.scroll(viewport, { target: { scrollLeft: 0 } });
      expect(input(label)).toBe(focused);
      expect(document.activeElement).toBe(focused);
      act(() => input("Search all rows").focus());
      expect(screen.queryByRole("textbox", { name: label })).toBeNull();
      fireEvent.scroll(viewport, { target: { scrollLeft: 7100 } });
      expect(input(label).value).toBe("60");
    },
  );
});
