// @vitest-environment jsdom
import { StrictMode, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  createGrid,
  type Column,
  type Filter,
  type GridModel,
} from "../../core/src/index";
import { ColumnConditionFilter } from "./column-condition-filter";
import { GridLocaleProvider, enUS, esES } from "./locale";

type Row = { id: string; value: unknown; active: boolean };
const rows: Row[] = [
  { id: "a", value: 1, active: true },
  { id: "b", value: 2, active: true },
  { id: "c", value: 3, active: false },
  { id: "d", value: null, active: true },
];
function make(
  type: Column<Row>["type"] = "number",
  values = rows,
  id = "value",
) {
  return createGrid<Row>({
    rows: values,
    getRowId: (row) => row.id,
    columns: [
      { id, field: "value", type, header: "Application value" },
      { id: "active", field: "active", type: "boolean" },
    ],
  });
}
function Harness({
  model,
  applied = () => {},
  cleared = () => {},
  maxConditions,
  id = "value",
}: {
  model: GridModel<Row>;
  applied?: (filter?: Filter) => void;
  cleared?: () => void;
  maxConditions?: number;
  id?: string;
}) {
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  return (
    <ColumnConditionFilter
      model={model}
      column={model.getColumns().find((column) => column.id === id)!}
      filter={Object.hasOwn(state.filters, id) ? state.filters[id] : undefined}
      label="Filter Value"
      maxConditions={maxConditions}
      onFilterChange={(filter) => {
        applied(filter);
        model.setFilter(id, filter);
      }}
      onClear={() => {
        cleared();
        model.setFilter(id);
      }}
    />
  );
}
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "Filter Value" }));
const op = (index: number, value: string) =>
  fireEvent.change(
    screen.getByRole("combobox", { name: `Operator for condition ${index}` }),
    { target: { value } },
  );
const value = (index: number, text: string) =>
  fireEvent.change(
    screen.getByRole("textbox", { name: `Value for condition ${index}` }),
    { target: { value: text } },
  );
const apply = () =>
  fireEvent.click(screen.getByRole("button", { name: "Apply conditions" }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("staged column condition dialog", () => {
  it("uses a fresh getter to fence stale controlled props and Reload reads the authoritative filter", () => {
    const model = make(),
      applied = vi.fn();
    const controlled: Filter = { op: "equals", value: 1 };
    model.setFilter("value", controlled);
    render(
      <ColumnConditionFilter
        column={model.getColumns()[0]}
        model={model}
        filter={controlled}
        getFilter={() => model.getState().filters.value}
        label="Filter Value"
        onFilterChange={applied}
        onClear={() => {}}
      />,
    );
    open();
    value(1, "2");
    act(() => model.setFilter("value", { op: "equals", value: 3 }));
    apply();
    expect(applied).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "Apply conditions" })
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current filter" }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("3");
    apply();
    expect(applied).not.toHaveBeenCalled();
  });
  it("allows the controlled mirror to catch up to an unchanged getter without conflicting with a dirty draft", () => {
    const model = make(),
      applied = vi.fn(),
      stale: Filter = { op: "equals", value: 1 },
      fresh: Filter = { op: "equals", value: 2 };
    const getFilter = () => fresh;
    const panel = (filter: Filter) => (
      <ColumnConditionFilter
        column={model.getColumns()[0]}
        model={model}
        filter={filter}
        getFilter={getFilter}
        label="Filter Value"
        onFilterChange={applied}
        onClear={() => {}}
      />
    );
    const view = render(panel(stale));
    open();
    value(1, "3");
    view.rerender(panel({ op: "equals", value: "2" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("3");
    apply();
    expect(applied).toHaveBeenCalledExactlyOnceWith({ op: "equals", value: 3 });
  });
  it("holds drafts through getter failures, blocks setters and supports Reload/Cancel recovery", () => {
    const model = make(),
      applied = vi.fn(),
      cleared = vi.fn();
    let fails = false;
    const getFilter = vi.fn((): Filter => {
      if (fails) throw Error("Source unavailable");
      return { op: "equals", value: 1 };
    });
    render(
      <ColumnConditionFilter
        column={model.getColumns()[0]}
        model={model}
        getFilter={getFilter}
        label="Filter Value"
        onFilterChange={applied}
        onClear={cleared}
      />,
    );
    expect(getFilter).not.toHaveBeenCalled();
    open();
    value(1, "2");
    fails = true;
    apply();
    expect(screen.getByRole("alert").textContent).toContain(
      "Source unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current filter" }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("2");
    expect(applied).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    fails = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current filter" }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(applied).not.toHaveBeenCalled();
    fails = true;
    open();
    expect(screen.getByRole("alert").textContent).toContain(
      "Source unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("stages two conditions and atomically applies one AND filter to real rows", () => {
    const model = make(),
      applied = vi.fn();
    render(<Harness model={model} applied={applied} />);
    open();
    op(1, "gte");
    value(1, "2");
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    op(2, "lt");
    value(2, "3");
    expect(model.getFilteredRows()).toHaveLength(4);
    expect(applied).not.toHaveBeenCalled();
    apply();
    expect(applied).toHaveBeenCalledExactlyOnceWith({
      op: "and",
      conditions: [
        { op: "gte", value: 2 },
        { op: "lt", value: 3 },
      ],
    });
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Filter Value" }),
    );
  });
  it("supports OR and removes conditions without publishing intermediate states", () => {
    const model = make(),
      applied = vi.fn();
    render(<Harness model={model} applied={applied} />);
    open();
    value(1, "1");
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    op(2, "blank");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Match conditions" }),
      { target: { value: "or" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove condition 3" }));
    apply();
    expect(applied).toHaveBeenCalledTimes(1);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["a", "d"]);
  });
  it("keeps a one-condition group representation and spelling untouched on no-op Apply", () => {
    const model = make(),
      applied = vi.fn(),
      cleared = vi.fn();
    model.setFilter("value", {
      op: "or",
      conditions: [{ op: "equals", value: "01.0" }],
    });
    const before = model.getState();
    render(<Harness model={model} applied={applied} cleared={cleared} />);
    open();
    apply();
    expect(applied).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    expect(model.getState()).toBe(before);
  });
  it("Cancel and native Escape discard edits and restore the launcher", () => {
    const model = make(),
      applied = vi.fn();
    render(<Harness model={model} applied={applied} />);
    open();
    value(1, "2");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    open();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    value(1, "3");
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );
    expect(applied).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Filter Value" }),
    );
  });
  it("keeps invalid numeric/range drafts open and the applied filter intact", () => {
    const model = make(),
      applied = vi.fn();
    model.setFilter("value", { op: "gte", value: 2 });
    render(<Harness model={model} applied={applied} />);
    open();
    op(1, "between");
    value(1, "3");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Upper value for condition 1" }),
      { target: { value: "2" } },
    );
    apply();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(applied).not.toHaveBeenCalled();
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b", "c"]);
    value(1, "Infinity");
    apply();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("Infinity");
  });
  it("requires explicit Replace after an external change and retains dirty operands", () => {
    const model = make(),
      applied = vi.fn();
    render(<Harness model={model} applied={applied} />);
    open();
    value(1, "2");
    act(() => model.setFilter("value", { op: "equals", value: 3 }));
    expect(
      screen
        .getByRole("button", { name: "Apply conditions" })
        .matches(":disabled"),
    ).toBe(true);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("2");
    fireEvent.click(
      screen.getByRole("button", { name: "Replace with new conditions" }),
    );
    apply();
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    expect(applied).toHaveBeenCalledTimes(1);
  });
  it("Reload explicitly discards a conflicted draft and unchanged Apply does not publish", () => {
    const model = make(),
      applied = vi.fn();
    render(<Harness model={model} applied={applied} />);
    open();
    value(1, "2");
    act(() => model.setFilter("value", { op: "equals", value: 3 }));
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current filter" }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("3");
    apply();
    expect(applied).not.toHaveBeenCalled();
  });
  it("refreshes a pristine draft on external changes and preserves dirty drafts through row/cosmetic updates", () => {
    const model = make();
    render(<Harness model={model} />);
    open();
    act(() => model.setFilter("value", { op: "gte", value: 2 }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("2");
    value(1, "3");
    act(() => {
      model.selectRows(["a"]);
      model.resizeColumn("value", 210);
      model.setRows([...rows]);
      model.expireValueCache();
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("3");
    expect(
      screen
        .getByRole("button", { name: "Apply conditions" })
        .matches(":disabled"),
    ).toBe(false);
    apply();
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["c"]);
  });
  it("fences the latest model filter even when controlled filter props are deliberately stale", () => {
    const model = make(),
      applied = vi.fn();
    render(
      <ColumnConditionFilter
        model={model}
        column={model.getColumns()[0]}
        label="Filter Value"
        onFilterChange={applied}
        onClear={() => {}}
      />,
    );
    open();
    value(1, "2");
    act(() => model.setFilter("value", { op: "equals", value: 3 }));
    apply();
    expect(applied).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("changed");
  });
  it("closes on model or column identity changes without applying the old draft", () => {
    const first = make(),
      second = make(),
      applied = vi.fn();
    const view = render(<Harness model={first} applied={applied} />);
    open();
    value(1, "2");
    view.rerender(<Harness model={second} applied={applied} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(applied).not.toHaveBeenCalled();
    open();
    value(1, "3");
    view.rerender(<Harness model={second} id="active" applied={applied} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(applied).not.toHaveBeenCalled();
  });
  it("leaves unsupported legacy sources intact until explicit Replace or Clear", () => {
    const applied = vi.fn(),
      cleared = vi.fn();
    render(
      <ColumnConditionFilter
        column={{ id: "value", type: "text" }}
        filter={{ op: "equals", value: new Date("2026-01-01") }}
        label="Filter Value"
        onFilterChange={applied}
        onClear={cleared}
      />,
    );
    open();
    expect(
      screen
        .getByRole("button", { name: "Apply conditions" })
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(applied).not.toHaveBeenCalled();
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "Replace with new conditions" }),
    );
    op(1, "equals");
    value(1, "2026-02-02T00:00:00.000Z");
    apply();
    expect(applied).toHaveBeenCalledExactlyOnceWith({
      op: "equals",
      value: "2026-02-02T00:00:00.000Z",
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(cleared).toHaveBeenCalledTimes(1);
  });
  it("reopens a real single Blank filter and leaves its historical undefined operand untouched", () => {
    const model = make(),
      applied = vi.fn();
    render(<Harness model={model} applied={applied} />);
    open();
    op(1, "blank");
    apply();
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["d"]);
    expect(applied).toHaveBeenCalledTimes(1);
    const before = model.getState();
    open();
    expect(screen.queryByRole("alert")).toBeNull();
    apply();
    expect(applied).toHaveBeenCalledTimes(1);
    expect(model.getState()).toBe(before);
  });
  it("preserves live Date/Date-array representations on no-op Apply and emits ISO only after editing", () => {
    const model = make("date", [
      { id: "a", value: new Date("2026-01-01T12:13:14.123Z"), active: true },
    ]);
    const date = new Date("2026-01-01T12:13:14.123Z"),
      applied = vi.fn();
    model.setFilter("value", { op: "equals", value: date });
    render(<Harness model={model} applied={applied} />);
    open();
    apply();
    expect(applied).not.toHaveBeenCalled();
    expect(model.getState().filters.value.value).toBe(date);
    act(() => model.setFilter("value", { op: "in", value: [date, null] }));
    open();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe('["2026-01-01T12:13:14.123Z",null]');
    apply();
    expect(applied).not.toHaveBeenCalled();
    expect((model.getState().filters.value.value as unknown[])[0]).toBe(date);
    open();
    op(1, "equals");
    value(1, "2026-01-02T00:00:00.000Z");
    apply();
    expect(applied).toHaveBeenCalledExactlyOnceWith({
      op: "equals",
      value: "2026-01-02T00:00:00.000Z",
    });
  });
  it("does not evaluate source accessors and offers explicit replacement", () => {
    const getter = vi.fn(() => "equals"),
      source = Object.defineProperty({}, "op", { get: getter });
    render(
      <ColumnConditionFilter
        column={{ id: "value", type: "text" }}
        filter={source as Filter}
        label="Filter Value"
        onFilterChange={() => {}}
        onClear={() => {}}
      />,
    );
    open();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(getter).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Replace with new conditions" }),
    );
    value(1, "safe");
    apply();
    expect(getter).not.toHaveBeenCalled();
  });
  it("retains staged inputs when callbacks throw and allows retry or cancel", () => {
    const applied = vi.fn(() => {
      throw Error("Application declined");
    });
    render(
      <ColumnConditionFilter
        column={{ id: "value", type: "text" }}
        label="Filter Value"
        onFilterChange={applied}
        onClear={() => {
          throw Error("Clear declined");
        }}
      />,
    );
    open();
    value(1, "<script>not HTML</script>");
    apply();
    expect(screen.getByRole("alert").textContent).toContain(
      "Application declined",
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("<script>not HTML</script>");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("alert").textContent).toContain("Clear declined");
    expect(document.querySelector("script")).toBeNull();
  });
  it("uses a native boolean choice and exact BigInt JSON with a null bucket", () => {
    const model = make("boolean", [
      { id: "a", value: true, active: true },
      { id: "b", value: false, active: true },
    ]);
    const view = render(<Harness model={model} />);
    open();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Value for condition 1" }),
      { target: { value: "false" } },
    );
    apply();
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    const big = make("bigint", [
      { id: "a", value: 9007199254740993123n, active: true },
      { id: "b", value: null, active: true },
      { id: "c", value: 2n, active: true },
    ]);
    view.rerender(<Harness model={big} />);
    open();
    op(1, "in");
    value(1, '["9007199254740993123",null]');
    apply();
    expect(big.getFilteredRows().map((row) => row.id)).toEqual(["a", "b"]);
  });
  it("calendar choice sets explicit UTC midnight while precise timestamp text remains intact", () => {
    const applied = vi.fn();
    render(
      <ColumnConditionFilter
        column={{ id: "value", type: "date" }}
        label="Filter Value"
        onFilterChange={applied}
        onClear={() => {}}
      />,
    );
    open();
    fireEvent.change(screen.getByLabelText("Choose UTC date for condition 1"), {
      target: { value: "2026-03-04" },
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("2026-03-04T00:00:00.000Z");
    value(1, "2026-03-04T12:13:14.123456+02:00");
    apply();
    expect(applied).toHaveBeenCalledExactlyOnceWith({
      op: "equals",
      value: "2026-03-04T12:13:14.123456+02:00",
    });
  });
  it("enforces the configured condition count and provides bounded Replace for oversized sources", () => {
    const model = make();
    render(<Harness model={model} maxConditions={2} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(
      screen
        .getByRole("button", { name: "Add condition" })
        .matches(":disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Remove condition 1" })
        .matches(":disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove condition 1" }));
    expect(
      screen
        .getByRole("button", { name: "Remove condition 1" })
        .matches(":disabled"),
    ).toBe(true);
  });
  it("reopens near-limit valid model/controlled filters without double-counting their operands", () => {
    const model = make(),
      applied = vi.fn();
    model.setFilter("value", {
      op: "and",
      conditions: [
        { op: "in", value: Array.from({ length: 10000 }, (_, index) => index) },
      ],
    });
    const view = render(<Harness model={model} applied={applied} />);
    open();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Apply conditions" })
        .matches(":disabled"),
    ).toBe(false);
    apply();
    expect(applied).not.toHaveBeenCalled();
    const text = make("text");
    text.setFilter("value", {
      op: "and",
      conditions: [{ op: "contains", value: "x".repeat(250000) }],
    });
    view.rerender(<Harness model={text} applied={applied} />);
    open();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Value for condition 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("x".repeat(250000));
    apply();
    expect(applied).not.toHaveBeenCalled();
  });
  it("handles prototype-like column IDs without inherited property confusion", () => {
    const model = make("number", rows, "__proto__");
    render(<Harness model={model} id="__proto__" />);
    open();
    value(1, "2");
    apply();
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    expect(Object.hasOwn(model.getState().filters, "__proto__")).toBe(true);
  });
  it("switches locale in an open RTL dialog without losing draft or input focus", () => {
    const model = make();
    const view = render(
      <div dir="rtl">
        <GridLocaleProvider locale={enUS}>
          <Harness model={model} />
        </GridLocaleProvider>
      </div>,
    );
    open();
    value(1, "123.5");
    const input = screen.getByRole("textbox", {
      name: "Value for condition 1",
    });
    input.focus();
    view.rerender(
      <div dir="rtl">
        <GridLocaleProvider locale={esES}>
          <Harness model={model} />
        </GridLocaleProvider>
      </div>,
    );
    expect(screen.getByRole("dialog").getAttribute("lang")).toBe("es-ES");
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("123.5");
    expect(screen.getByRole("dialog").closest("[dir=rtl]")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Filter Value" }).textContent,
    ).toContain("Filter Value");
  });
  it("opens and cleans the native modal through StrictMode without closing the replayed dialog", () => {
    const show = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    });
    const oldShow = HTMLDialogElement.prototype.showModal,
      oldClose = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = show;
    HTMLDialogElement.prototype.close = close;
    try {
      const model = make(),
        view = render(
          <StrictMode>
            <Harness model={model} />
          </StrictMode>,
        );
      open();
      expect(show).toHaveBeenCalled();
      expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
      const dialog = screen.getByRole("dialog");
      expect(dialog.contains(document.activeElement)).toBe(true);
      view.unmount();
      expect(close).toHaveBeenCalled();
      expect(dialog.hasAttribute("open")).toBe(false);
    } finally {
      HTMLDialogElement.prototype.showModal = oldShow;
      HTMLDialogElement.prototype.close = oldClose;
    }
  });
});
