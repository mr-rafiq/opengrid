// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createGrid } from "../../core/src/index";
import { DataGrid } from "./data-grid";
import { CellEditor } from "./editors";
const options = [
  { value: "aa", label: "Alpha" },
  { value: "bb", label: "Beta" },
  { value: "blocked", label: "Blocked" },
];
const config = { country: { type: "richSelect" as const, options } };
type Row = { id: string; country: string; quantity: number };
function model() {
  return createGrid<Row>({
    rows: [
      { id: "one", country: "aa", quantity: 1 },
      { id: "two", country: "aa", quantity: 2 },
    ],
    getRowId: (row) => row.id,
    columns: [
      {
        id: "country",
        field: "country",
        header: "Country",
        editable: true,
        pinned: "left",
        validate: (value) =>
          value === "blocked" ? "Unavailable market" : undefined,
      },
      {
        id: "quantity",
        field: "quantity",
        header: "Quantity",
        editable: true,
        type: "number",
        pinned: "right",
      },
    ],
  });
}
const cell = (row = "one") =>
  document.querySelector<HTMLElement>(
    `[data-row-id="${row}"][data-column-id="country"]`,
  )!;
const search = () =>
  screen.getByRole("combobox", { name: "Search Country choices" });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("rich picker editing ownership", () => {
  it("retains invalid cell choices, commits a valid Enter once and keeps ordinary undo/navigation", async () => {
    const grid = model();
    render(<DataGrid model={grid} editorOptions={config} />);
    act(() => cell().focus());
    fireEvent.keyDown(cell(), { key: "F2" });
    fireEvent.change(search(), { target: { value: "Blocked" } });
    await act(async () => fireEvent.keyDown(search(), { key: "Enter" }));
    expect(grid.getRow("one")!.country).toBe("aa");
    expect(
      within(screen.getByRole("dialog", { name: "Choose Country" })).getByRole(
        "alert",
      ).textContent,
    ).toBe("Unavailable market");
    fireEvent.change(search(), { target: { value: "Beta" } });
    await act(async () => fireEvent.keyDown(search(), { key: "Enter" }));
    expect(grid.getRow("one")!.country).toBe("bb");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(cell("two"));
    act(() => {
      grid.undo();
    });
    expect(grid.getRow("one")!.country).toBe("aa");
    expect(grid.undo()).toBe(false);
  });
  it("cancels without a write or successful edit callback", () => {
    const grid = model(),
      changed = vi.fn();
    render(
      <DataGrid model={grid} editorOptions={config} onCellEdit={changed} />,
    );
    act(() => cell().focus());
    fireEvent.keyDown(cell(), { key: "F2" });
    fireEvent.change(search(), { target: { value: "Beta" } });
    fireEvent.keyDown(search(), { key: "Escape" });
    expect(grid.getRow("one")!.country).toBe("aa");
    expect(changed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cell());
  });
  it("stages a row field, cancels only its picker, and saves the complete row atomically", async () => {
    const grid = model();
    render(<DataGrid model={grid} editorOptions={config} editMode="row" />);
    act(() => cell().focus());
    fireEvent.keyDown(cell(), { key: "F2" });
    const rowDialog = screen.getByRole("dialog");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(
      within(rowDialog).getByRole("button", { name: "Choose Country" }),
    );
    fireEvent.change(search(), { target: { value: "Beta" } });
    fireEvent.keyDown(search(), { key: "Escape" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(grid.getRow("one")!.country).toBe("aa");
    fireEvent.click(
      within(rowDialog).getByRole("button", { name: "Choose Country" }),
    );
    fireEvent.change(search(), { target: { value: "Beta" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply choice" })),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(grid.getRow("one")!.country).toBe("aa");
    fireEvent.change(
      within(rowDialog).getByRole("spinbutton", { name: "Edit Quantity" }),
      { target: { value: "8" } },
    );
    fireEvent.click(
      within(rowDialog).getByRole("button", { name: "Save row" }),
    );
    expect(grid.getRow("one")).toMatchObject({ country: "bb", quantity: 8 });
    act(() => {
      grid.undo();
    });
    expect(grid.getRow("one")).toMatchObject({ country: "aa", quantity: 1 });
    expect(grid.undo()).toBe(false);
  });
  it("closes old-model choices without writing to a replacement with the same IDs", () => {
    const original = model(),
      replacement = model();
    const view = render(<DataGrid model={original} editorOptions={config} />);
    act(() => cell().focus());
    fireEvent.keyDown(cell(), { key: "F2" });
    fireEvent.change(search(), { target: { value: "Beta" } });
    view.rerender(<DataGrid model={replacement} editorOptions={config} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(original.getRow("one")!.country).toBe("aa");
    expect(replacement.getRow("one")!.country).toBe("aa");
  });
  it("commits a coherent mirrored draft for a standalone controlled editor", async () => {
    const committed: string[] = [];
    const row = {};
    function Harness() {
      const [value, setValue] = useState("aa");
      return (
        <CellEditor
          row={row}
          column={{ id: "country", header: "Country" }}
          label="Edit Country"
          editorType="richSelect"
          value={value}
          options={options}
          onChange={setValue}
          onCommit={() => {
            committed.push(value);
            return true;
          }}
          onCancel={vi.fn()}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(search(), { target: { value: "Beta" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply choice" })),
    );
    expect(committed).toEqual(["bb"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not commit a mirrored value belonging to a replacement editing owner", async () => {
    const commit = vi.fn(),
      row = {},
      first = {},
      second = {};
    function Harness() {
      const [value, setValue] = useState("aa"),
        [owner, setOwner] = useState(first);
      return (
        <CellEditor
          row={row}
          column={{ id: "country", header: "Country" }}
          label="Edit Country"
          editorType="richSelect"
          contextKey={owner}
          value={value}
          options={options}
          onChange={(next) => {
            setValue(next);
            setOwner(second);
          }}
          onCommit={commit}
          onCancel={vi.fn()}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(search(), { target: { value: "Beta" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply choice" })),
    );
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("rejects a controlled owner that did not accept the requested draft", async () => {
    const commit = vi.fn();
    render(
      <CellEditor
        row={{}}
        column={{ id: "country", header: "Country" }}
        label="Edit Country"
        editorType="richSelect"
        value="aa"
        options={options}
        onChange={vi.fn()}
        onCommit={commit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(search(), { target: { value: "Beta" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply choice" })),
    );
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be applied",
    );
  });
});
