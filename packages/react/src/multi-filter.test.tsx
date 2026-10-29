// @vitest-environment jsdom
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid, type Column, type Filter } from "@opengrid/core";
import {
  MultiFilter,
  createMultiFilter,
  type MultiFilterDefinition,
} from "./multi-filter.js";
import type { ColumnFilterProps } from "./filter-components.js";
import { GridLocaleProvider, esES } from "./locale.js";
import { DataGrid } from "./data-grid.js";
import { ColumnConditionFilter } from "./column-condition-filter.js";
import { SetListFilter } from "./set-list-filter.js";
type Row = { id: string; region: string };
const column: Column<Row> = {
  id: "region",
  field: "region",
  header: "Region",
  type: "text",
};
function TextChild(props: ColumnFilterProps<Row>) {
  return (
    <input
      aria-label={props.label}
      value={props.filter?.op === "contains" ? String(props.filter.value) : ""}
      onChange={(event) =>
        props.onFilterChange(
          event.target.value
            ? { op: "contains", value: event.target.value }
            : undefined,
        )
      }
    />
  );
}
function ValuesChild(props: ColumnFilterProps<Row>) {
  return (
    <button
      type="button"
      onClick={() => props.onFilterChange({ op: "in", value: ["south"] })}
    >
      {props.label}
    </button>
  );
}
const definitions: readonly MultiFilterDefinition<Row>[] = [
  { id: "text", label: "Conditions", component: TextChild },
  { id: "values", label: "Values", component: ValuesChild },
];
const dialog = () =>
  screen.getByRole("dialog", { name: "Combined filters for Region" });
const applyButton = () =>
  within(dialog()).getByRole<HTMLButtonElement>("button", {
    name: "Apply combined filter",
  });
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Filter Region" }));
  return dialog();
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("staged independent child filter modal", () => {
  it("retains a finishing child draft after an external root change until the user explicitly keeps it", () => {
    const model = createGrid<Row>({
      rows: [
        { id: "n", region: "north" },
        { id: "s", region: "south" },
        { id: "w", region: "west" },
      ],
      columns: [column],
      getRowId: (row) => row.id,
    });
    const Combined = createMultiFilter<Row>([
      {
        id: "conditions",
        label: "Conditions",
        component: ColumnConditionFilter,
      },
      { id: "values", label: "Values", component: SetListFilter },
    ]);
    render(<DataGrid model={model} filterComponents={{ region: Combined }} />);
    const parent = open();
    fireEvent.click(
      within(parent).getByRole("button", { name: "Edit Conditions" }),
    );
    const child = screen.getByRole("dialog", { name: "Conditions for Region" });
    fireEvent.change(
      within(child).getByRole("textbox", { name: "Value for condition 1" }),
      { target: { value: "north" } },
    );
    act(() => model.setFilter("region", { op: "equals", value: "west" }));
    fireEvent.click(
      within(child).getByRole("button", { name: "Apply conditions" }),
    );
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["w"]);
    expect(dialog()).toBe(parent);
    expect(applyButton().disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Keep staged filters" }),
    );
    fireEvent.click(applyButton());
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["n"]);
  });
  it("stages supplied condition and set-list dialogs while nested cancellation leaves their parent open", () => {
    const model = createGrid<Row>({
      rows: [
        { id: "n", region: "north" },
        { id: "s", region: "south" },
        { id: "w", region: "west" },
      ],
      columns: [column],
      getRowId: (row) => row.id,
    });
    const Combined = createMultiFilter<Row>([
      {
        id: "conditions",
        label: "Conditions",
        component: ColumnConditionFilter,
      },
      { id: "values", label: "Values", component: SetListFilter },
    ]);
    render(<DataGrid model={model} filterComponents={{ region: Combined }} />);
    const parent = open();
    fireEvent.click(
      within(parent).getByRole("button", { name: "Edit Conditions" }),
    );
    let child = screen.getByRole("dialog", { name: "Conditions for Region" });
    fireEvent(child, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(
      screen.queryByRole("dialog", { name: "Conditions for Region" }),
    ).toBeNull();
    expect(dialog()).toBe(parent);
    fireEvent.click(
      within(parent).getByRole("button", { name: "Edit Conditions" }),
    );
    child = screen.getByRole("dialog", { name: "Conditions for Region" });
    fireEvent.change(
      within(child).getByRole("textbox", { name: "Value for condition 1" }),
      { target: { value: "so" } },
    );
    fireEvent.click(
      within(child).getByRole("button", { name: "Apply conditions" }),
    );
    expect(model.getFilteredRows()).toHaveLength(3);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(
      within(parent).getByRole("button", { name: "Edit Values" }),
    );
    child = screen.getByRole("dialog", { name: "Values for Region" });
    fireEvent.click(
      within(child).getByRole("checkbox", {
        name: "Select all matching values",
      }),
    );
    fireEvent.click(within(child).getByRole("checkbox", { name: /south/ }));
    fireEvent.click(within(child).getByRole("button", { name: "Apply" }));
    expect(model.getFilteredRows()).toHaveLength(3);
    expect(dialog()).toBe(parent);
    const changed = vi.fn(),
      stop = model.subscribe(changed);
    fireEvent.click(applyButton());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["s"]);
    stop();
  });
  it("recovers from an unreadable initial source and retains staged settings on a failed Apply read", () => {
    let failed = true,
      source: Filter | undefined;
    const changed = vi.fn((next?: Filter) => {
        source = next;
      }),
      read = () => {
        if (failed) throw new Error("Source unavailable");
        return source;
      };
    render(
      <MultiFilter
        column={column}
        definitions={definitions}
        label="Filter Region"
        getFilter={read}
        onFilterChange={changed}
        onClear={() => {
          source = undefined;
        }}
      />,
    );
    const parent = open();
    expect(applyButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain(
      "Source unavailable",
    );
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Reload applied filters" }),
    );
    expect(dialog()).toBe(parent);
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Conditions" }), {
      target: { value: "so" },
    });
    failed = true;
    fireEvent.click(applyButton());
    expect(changed).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Edit Conditions",
        }) as HTMLInputElement
      ).value,
    ).toBe("so");
    failed = false;
    fireEvent.click(applyButton());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("never reads a closed source or renders child components during SSR", () => {
    const read = vi.fn(() => undefined),
      changed = vi.fn(),
      props = {
        column,
        definitions,
        label: "Filter Region",
        getFilter: read,
        onFilterChange: changed,
        onClear: vi.fn(),
      };
    const html = renderToString(<MultiFilter {...props} />);
    expect(html).not.toContain("<dialog");
    expect(read).not.toHaveBeenCalled();
    render(
      <StrictMode>
        <MultiFilter {...props} />
      </StrictMode>,
    );
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    open();
    expect(
      screen.getByRole("textbox", { name: "Edit Conditions" }),
    ).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });
  it("cancels independently staged children without writing the applied model", () => {
    const changed = vi.fn(),
      clear = vi.fn();
    render(
      <MultiFilter
        column={column}
        definitions={definitions}
        label="Filter Region"
        onFilterChange={changed}
        onClear={clear}
      />,
    );
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Conditions" }), {
      target: { value: "north" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Values" }));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(clear).not.toHaveBeenCalled();
    open();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Edit Conditions",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
  it("publishes exactly one owned combined model and ignores a reentrant Apply", () => {
    let source: Filter | undefined;
    const changed = vi.fn((next?: Filter) => {
      if (changed.mock.calls.length === 1) applyButton().click();
      source = next;
    });
    render(
      <MultiFilter
        column={column}
        definitions={definitions}
        label="Filter Region"
        getFilter={() => source}
        onFilterChange={changed}
        onClear={() => {
          source = undefined;
        }}
      />,
    );
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Conditions" }), {
      target: { value: "so" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Values" }));
    fireEvent.click(applyButton());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(source).toEqual({
      op: "multi",
      filters: [
        { id: "text", filter: { op: "contains", value: "so" } },
        { id: "values", filter: { op: "in", value: ["south"] } },
      ],
    });
    expect(Object.isFrozen(source)).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("requires explicit replacement of unsupported applied settings and Cancel preserves them", () => {
    let source: Filter | undefined = { op: "contains", value: "old" };
    const changed = vi.fn((next?: Filter) => {
        source = next;
      }),
      clear = vi.fn(() => {
        source = undefined;
      });
    render(
      <MultiFilter
        column={column}
        definitions={definitions}
        label="Filter Region"
        getFilter={() => source}
        onFilterChange={changed}
        onClear={clear}
      />,
    );
    open();
    expect(applyButton().disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Start new child filters" }),
    );
    expect(source).toEqual({ op: "contains", value: "old" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(source).toEqual({ op: "contains", value: "old" });
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "Start new child filters" }),
    );
    fireEvent.click(applyButton());
    expect(clear).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(source).toBeUndefined();
  });
  it("fences a fresh external change before its controlled mirror arrives and can keep staged filters explicitly", () => {
    let source: Filter | undefined;
    const changed = vi.fn((next?: Filter) => {
      source = next;
    });
    render(
      <MultiFilter
        column={column}
        definitions={definitions}
        label="Filter Region"
        getFilter={() => source}
        onFilterChange={changed}
        onClear={() => {
          source = undefined;
        }}
      />,
    );
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Conditions" }), {
      target: { value: "north" },
    });
    source = { op: "equals", value: "external" };
    fireEvent.click(applyButton());
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "applied filter changed",
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Edit Conditions",
        }) as HTMLInputElement
      ).value,
    ).toBe("north");
    fireEvent.click(
      screen.getByRole("button", { name: "Keep staged filters" }),
    );
    expect(applyButton().disabled).toBe(false);
    fireEvent.click(applyButton());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(source?.op).toBe("multi");
  });
  it("blocks a same-event Apply after invalid child staging and clears private drafts explicitly", () => {
    function Invalid(props: ColumnFilterProps<Row>) {
      return (
        <button
          type="button"
          onClick={() => {
            props.onFilterChange({ op: "multi", filters: [{ id: "nested" }] });
            applyButton().click();
          }}
        >
          {props.label}
        </button>
      );
    }
    const changed = vi.fn(),
      clear = vi.fn();
    render(
      <MultiFilter
        column={column}
        definitions={[{ id: "bad", label: "Invalid", component: Invalid }]}
        label="Filter Region"
        onFilterChange={changed}
        onClear={clear}
      />,
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Invalid" }));
    expect(changed).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(applyButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be staged",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Clear staged filters" }),
    );
    expect(applyButton().disabled).toBe(false);
    fireEvent.click(applyButton());
    expect(clear).toHaveBeenCalledTimes(1);
  });
  it("preserves a focused child and modal through locale, direction and definition label changes", () => {
    const props = {
      column,
      label: "Filter Region",
      onFilterChange: vi.fn(),
      onClear: vi.fn(),
    };
    const view = render(
      <GridLocaleProvider>
        <div dir="ltr">
          <MultiFilter {...props} definitions={definitions} />
        </div>
      </GridLocaleProvider>,
    );
    open();
    const input = screen.getByRole<HTMLInputElement>("textbox", {
        name: "Edit Conditions",
      }),
      modal = dialog();
    fireEvent.change(input, { target: { value: "north" } });
    act(() => input.focus());
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <div dir="rtl">
          <MultiFilter
            {...props}
            definitions={definitions.map((child) => ({
              ...child,
              label: child.id === "text" ? "Condiciones" : "Valores",
            }))}
          />
        </div>
      </GridLocaleProvider>,
    );
    expect(
      screen.getByRole("dialog", { name: "Filtros combinados de Region" }),
    ).toBe(modal);
    expect(screen.getByRole("textbox", { name: "Editar Condiciones" })).toBe(
      input,
    );
    expect(input.value).toBe("north");
    expect(document.activeElement).toBe(input);
    expect(modal.getAttribute("lang")).toBe("es-ES");
  });
  it("closes old-schema work without publishing and reopens against the new configuration", () => {
    const props = {
      column,
      label: "Filter Region",
      onFilterChange: vi.fn(),
      onClear: vi.fn(),
    };
    const view = render(<MultiFilter {...props} definitions={definitions} />);
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Conditions" }), {
      target: { value: "discard" },
    });
    view.rerender(<MultiFilter {...props} definitions={[definitions[0]]} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(props.onFilterChange).not.toHaveBeenCalled();
    open();
    expect(screen.queryByRole("button", { name: "Edit Values" })).toBeNull();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Edit Conditions",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
  it("uses the grid's real atomic query pipeline while children only stage", () => {
    const model = createGrid<Row>({
      rows: [
        { id: "n", region: "north" },
        { id: "s", region: "south" },
        { id: "w", region: "west" },
      ],
      columns: [column],
      getRowId: (row) => row.id,
    });
    const Combined = createMultiFilter(definitions);
    render(<DataGrid model={model} filterComponents={{ region: Combined }} />);
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Conditions" }), {
      target: { value: "so" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Values" }));
    expect(model.getFilteredRows()).toHaveLength(3);
    const changed = vi.fn(),
      stop = model.subscribe(changed);
    fireEvent.click(applyButton());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["s"]);
    stop();
  });
});
