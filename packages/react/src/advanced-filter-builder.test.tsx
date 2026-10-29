// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Column, FilterExpression } from "../../core/src/types";
import { createGrid } from "../../core/src/index";
import { AdvancedFilterBuilder } from "./advanced-filter-builder";

afterEach(cleanup);
type Row = {
  name: string;
  amount: number;
  serial: bigint;
  date: string;
  active: boolean;
  secret: string;
};
const columns: Column<Row>[] = [
  { id: "name", field: "name", header: "Name" },
  { id: "amount", field: "amount", header: "Amount", type: "number" },
  { id: "serial", field: "serial", header: "Serial", type: "bigint" },
  { id: "date", field: "date", header: "Date", type: "date" },
  { id: "active", field: "active", header: "Active", type: "boolean" },
  { id: "secret", field: "secret", header: "Secret", filterable: false },
];
const condition = (columnId = "name", value = "Ada"): FilterExpression => ({
  kind: "condition",
  columnId,
  filter: { op: "equals", value },
});
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function click(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("AdvancedFilterBuilder draft editing", () => {
  it("builds nested AND/OR/NOT expressions without applying on each edit", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={null}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    click("Add AND group root");
    click("Add condition 1");
    change("Value 1.1", "Ada");
    click("Add OR group 1");
    click("Add condition 1.2");
    change("Column 1.2.1", "amount");
    change("Operator 1.2.1", "gt");
    change("Value 1.2.1", "20");
    click("Add NOT group 1.2");
    change("Value 1.2.2.1", "bad");
    expect(onApply).not.toHaveBeenCalled();
    click("Apply filter");
    expect(onApply).toHaveBeenCalledWith({
      kind: "and",
      children: [
        {
          kind: "condition",
          columnId: "name",
          filter: { op: "contains", value: "Ada" },
        },
        {
          kind: "or",
          children: [
            {
              kind: "condition",
              columnId: "amount",
              filter: { op: "gt", value: "20" },
            },
            {
              kind: "not",
              child: {
                kind: "condition",
                columnId: "name",
                filter: { op: "contains", value: "bad" },
              },
            },
          ],
        },
      ],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps a group in NOT without dropping its existing conditions", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={{
          kind: "and",
          children: [condition(), condition("name", "Grace")],
        }}
        onApply={onApply}
      />,
    );
    change("Match 1", "not");
    expect(screen.getByLabelText("Value 1.1.1")).toBeTruthy();
    expect(screen.getByLabelText("Value 1.1.2")).toBeTruthy();
    click("Apply filter");
    expect(onApply.mock.calls[0][0]).toEqual({
      kind: "not",
      child: {
        kind: "and",
        children: [condition(), condition("name", "Grace")],
      },
    });
  });

  it("adds a sibling inside NOT by preserving its child in an AND group", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={{ kind: "not", child: condition() }}
        onApply={onApply}
      />,
    );
    click("Add condition 1");
    change("Value 1.1.2", "Grace");
    click("Apply filter");
    expect(onApply.mock.calls[0][0]).toEqual({
      kind: "not",
      child: {
        kind: "and",
        children: [
          condition(),
          {
            kind: "condition",
            columnId: "name",
            filter: { op: "contains", value: "Grace" },
          },
        ],
      },
    });
  });

  it("keeps Clear local until Apply and passes null for a cleared filter", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition()}
        onApply={onApply}
      />,
    );
    click("Clear draft");
    expect(screen.getByText("No advanced filter")).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    click("Apply filter");
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it("cancels draft changes and closes without applying", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition()}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    change("Value 1", "Changed");
    click("Cancel");
    expect((screen.getByLabelText("Value 1") as HTMLInputElement).value).toBe(
      "Ada",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("replaces the draft when the controlled expression changes externally", () => {
    const onApply = vi.fn();
    const view = render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition()}
        onApply={onApply}
      />,
    );
    change("Value 1", "Local draft");
    view.rerender(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition("name", "External")}
        onApply={onApply}
      />,
    );
    expect((screen.getByLabelText("Value 1") as HTMLInputElement).value).toBe(
      "External",
    );
    view.rerender(
      <AdvancedFilterBuilder
        columns={columns}
        value={null}
        onApply={onApply}
      />,
    );
    expect(screen.getByText("No advanced filter")).toBeTruthy();
  });

  it("removes conditions and groups and rejects empty groups on Apply", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={{ kind: "and", children: [condition()] }}
        onApply={onApply}
      />,
    );
    click("Remove condition 1.1");
    click("Apply filter");
    expect(screen.getByRole("alert").textContent).toContain(
      "at least one condition",
    );
    expect(onApply).not.toHaveBeenCalled();
    click("Remove group 1");
    click("Apply filter");
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it("excludes nonfilterable columns and can clear a view with no available columns", () => {
    const onApply = vi.fn();
    const view = render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition()}
        onApply={onApply}
      />,
    );
    expect(
      within(screen.getByLabelText("Column 1")).queryByRole("option", {
        name: "Secret",
      }),
    ).toBeNull();
    view.rerender(
      <AdvancedFilterBuilder
        columns={columns.filter((c) => c.id === "secret")}
        value={null}
        onApply={onApply}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "No filterable columns",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Add condition root",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Apply filter");
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it("catches core validation errors and links them to labelled controls without closing", () => {
    const onClose = vi.fn();
    const onApply = vi.fn(() => {
      throw new TypeError("Date operand is invalid");
    });
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition()}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    click("Apply filter");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Date operand is invalid");
    expect(document.activeElement).toBe(alert);
    expect(
      screen.getByLabelText("Value 1").getAttribute("aria-describedby"),
    ).toBe(alert.id);
    expect(onClose).not.toHaveBeenCalled();
    change("Value 1", "Revised");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("applies its draft to the actual core model with typed AND/OR/NOT evaluation", () => {
    const model = createGrid({
      columns,
      rows: [
        {
          name: "Ada",
          amount: 12,
          serial: 1n,
          date: "2026-10-29",
          active: false,
          secret: "",
        },
        {
          name: "Grace",
          amount: 30,
          serial: 2n,
          date: "2026-10-29",
          active: true,
          secret: "",
        },
        {
          name: "Lin",
          amount: 50,
          serial: 3n,
          date: "2026-10-29",
          active: false,
          secret: "",
        },
      ],
      getRowId: (row) => row.name,
    });
    const expression: FilterExpression = {
      kind: "and",
      children: [
        {
          kind: "or",
          children: [
            {
              kind: "condition",
              columnId: "name",
              filter: { op: "startsWith", value: "A" },
            },
            {
              kind: "condition",
              columnId: "amount",
              filter: { op: "gte", value: "40" },
            },
          ],
        },
        {
          kind: "not",
          child: {
            kind: "condition",
            columnId: "active",
            filter: { op: "equals", value: "false" },
          },
        },
      ],
    };
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={expression}
        onApply={model.setAdvancedFilter}
      />,
    );
    change("Value 1.1.2", "20");
    expect(model.getFilteredRows()).toHaveLength(3);
    click("Apply filter");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(model.getFilteredRows().map((row) => row.name)).toEqual(["Grace"]);
  });
});

describe("AdvancedFilterBuilder typed operands", () => {
  it.each([
    [
      "name",
      [
        "contains",
        "equals",
        "notEqual",
        "startsWith",
        "endsWith",
        "in",
        "blank",
        "notBlank",
      ],
    ],
    [
      "amount",
      [
        "equals",
        "notEqual",
        "gt",
        "gte",
        "lt",
        "lte",
        "between",
        "in",
        "blank",
        "notBlank",
      ],
    ],
    [
      "date",
      [
        "equals",
        "notEqual",
        "gt",
        "gte",
        "lt",
        "lte",
        "between",
        "in",
        "blank",
        "notBlank",
      ],
    ],
    ["active", ["equals", "notEqual", "in", "blank", "notBlank"]],
  ] as const)(
    "offers meaningful existing operators for %s columns",
    (id, expected) => {
      render(
        <AdvancedFilterBuilder
          columns={columns}
          value={condition(id, id === "active" ? "true" : "10")}
          onApply={vi.fn()}
        />,
      );
      const select = screen.getByLabelText("Operator 1") as HTMLSelectElement;
      expect([...select.options].map((option) => option.value)).toEqual(
        expected,
      );
    },
  );

  it("keeps numeric and BigInt range boundaries as raw strings", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition("serial", "900719925474099312345")}
        onApply={onApply}
      />,
    );
    change("Operator 1", "between");
    change("Upper value 1", "900719925474099312346");
    click("Apply filter");
    expect(onApply).toHaveBeenCalledWith({
      kind: "condition",
      columnId: "serial",
      filter: {
        op: "between",
        value: "900719925474099312345",
        to: "900719925474099312346",
      },
    });
  });

  it("parses JSON membership with typed scalars and newline membership as text", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition("amount", "1")}
        onApply={onApply}
      />,
    );
    change("Operator 1", "in");
    change("Set values 1", '[1, "2", 3.5]');
    click("Apply filter");
    expect(onApply.mock.calls[0][0].filter.value).toEqual([1, "2", 3.5]);
    change("Column 1", "name");
    change("Set values 1", "  North  \n\n South \n");
    click("Apply filter");
    expect(onApply.mock.calls[1][0].filter.value).toEqual(["North", "South"]);
  });

  it("rejects malformed, nested and empty sets without applying", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition()}
        onApply={onApply}
      />,
    );
    change("Operator 1", "in");
    for (const invalid of ["[unclosed", '[{"value":"x"}]', "[]", "\n\n"]) {
      change("Set values 1", invalid);
      click("Apply filter");
      expect(screen.getByRole("alert")).toBeTruthy();
    }
    expect(onApply).not.toHaveBeenCalled();
  });

  it("rejects precision-losing JSON numbers for BigInt and accepts quoted integers", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition("serial", "1")}
        onApply={onApply}
      />,
    );
    change("Operator 1", "in");
    change("Set values 1", "[900719925474099312345]");
    click("Apply filter");
    expect(screen.getByRole("alert").textContent).toContain("quoted strings");
    expect(onApply).not.toHaveBeenCalled();
    change("Set values 1", '["900719925474099312345"]');
    click("Apply filter");
    expect(onApply.mock.calls[0][0].filter.value).toEqual([
      "900719925474099312345",
    ]);
  });

  it("omits operands for blank checks and resets invalid operators on column changes", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition()}
        onApply={onApply}
      />,
    );
    change("Operator 1", "blank");
    expect(screen.queryByLabelText("Value 1")).toBeNull();
    click("Apply filter");
    expect(onApply).toHaveBeenCalledWith({
      kind: "condition",
      columnId: "name",
      filter: { op: "blank" },
    });
    change("Operator 1", "startsWith");
    change("Column 1", "amount");
    expect(
      (screen.getByLabelText("Operator 1") as HTMLSelectElement).value,
    ).toBe("equals");
  });

  it("validates missing scalar and range values while leaving date parsing to the core", () => {
    const onApply = vi.fn();
    render(
      <AdvancedFilterBuilder
        columns={columns}
        value={condition("date", "")}
        onApply={onApply}
      />,
    );
    click("Apply filter");
    expect(screen.getByRole("alert").textContent).toContain("Enter a value");
    change("Value 1", "2026-10-29");
    change("Operator 1", "between");
    click("Apply filter");
    expect(screen.getByRole("alert").textContent).toContain("upper value");
    change("Upper value 1", "2026-11-01");
    click("Apply filter");
    expect(onApply.mock.calls[0][0].filter).toEqual({
      op: "between",
      value: "2026-10-29",
      to: "2026-11-01",
    });
  });

  it("enforces the eight-level editing limit and reports deeper imported expressions", () => {
    let nested = condition();
    for (let i = 0; i < 7; i++) nested = { kind: "not", child: nested };
    const onApply = vi.fn();
    const view = render(
      <AdvancedFilterBuilder
        columns={columns}
        value={nested}
        onApply={onApply}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: "Wrap condition 1.1.1.1.1.1.1.1 in NOT",
      }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Add condition 1.1.1.1.1.1.1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Apply filter");
    expect(onApply).toHaveBeenCalledWith(nested);
    view.rerender(
      <AdvancedFilterBuilder
        columns={columns}
        value={{ kind: "not", child: nested }}
        onApply={onApply}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("at most 8 levels");
  });
});
