// @vitest-environment jsdom
import React, { createRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
} from "./ag31-client-grid.js";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns.js";
afterEach(cleanup);
class Row {
  constructor(
    public id = "a",
    public name: unknown = "old",
  ) {}
  tag() {
    return "original";
  }
}
const getRowId = ({ data }: { data: Row }) => data.id;
function SourceEditor(p: any) {
  const [value, setValue] = useState(String(p.value));
  return (
    <input
      autoFocus
      aria-label="Source editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          p.onValueChange({ newValue: value, isBasisGroup: p.node.group });
          p.stopEditing(true);
        }
      }}
    />
  );
}
function setup(
  options: {
    readOnlyEdit?: boolean;
    cancelOnStart?: boolean;
    suppressClickEdit?: boolean;
    definitions?: Ag31ColumnDefinition<Row>[];
  } = {},
) {
  const row = new Row(),
    ref = createRef<Ag31ClientGridHandle<Row>>(),
    changed = vi.fn(),
    requested = vi.fn(),
    stopped = vi.fn(),
    parser = vi.fn((p: any) => String(p.newValue) + "!");
  const definitions = options.definitions ?? [
    {
      field: "name",
      editable: true,
      cellEditor: SourceEditor,
      valueParser: parser,
      suppressKeyboardEvent: (p: any) =>
        p.editing && ["Enter", "Tab"].includes(p.event.key),
    },
  ];
  const view = render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[row]}
      columnDefs={definitions}
      getRowId={getRowId}
      readOnlyEdit={options.readOnlyEdit}
      suppressClickEdit={options.suppressClickEdit}
      onCellEditingStarted={
        options.cancelOnStart ? (p) => p.api.stopEditing(true) : undefined
      }
      onCellValueChanged={changed}
      onCellEditRequest={requested}
      onCellEditingStopped={stopped}
    />,
  );
  return { row, ref, changed, requested, stopped, parser, view };
}
it("commits a reactive editor's typed payload through the public source API without applying its parser", async () => {
  const s = setup();
  act(() =>
    s.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  const input = screen.getByRole("textbox", { name: "Source editor" });
  fireEvent.change(input, { target: { value: "next" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(s.changed).toHaveBeenCalledTimes(1));
  expect(s.row.name).toEqual({ newValue: "next", isBasisGroup: false });
  expect(s.ref.current!.api.getRowNode("a")!.data).toBe(s.row);
  expect(s.row.tag()).toBe("original");
  expect(s.parser).not.toHaveBeenCalled();
  expect(s.ref.current!.api.getEditingCells()).toEqual([]);
  expect(s.stopped.mock.calls[0][0]).toMatchObject({
    oldValue: "old",
    newValue: s.row.name,
    value: s.row.name,
    valueChanged: true,
  });
});
it("routes read-only commits as requests and cancels through the AccessAwareGrid editing-start guard", async () => {
  const s = setup({ readOnlyEdit: true });
  act(() =>
    s.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  const input = screen.getByRole("textbox", { name: "Source editor" });
  fireEvent.change(input, { target: { value: "next" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(s.requested).toHaveBeenCalledTimes(1));
  expect(s.row.name).toBe("old");
  expect(s.changed).not.toHaveBeenCalled();
  expect(s.requested.mock.calls[0][0]).toMatchObject({
    newValue: { newValue: "next", isBasisGroup: false },
    value: { newValue: "next", isBasisGroup: false },
  });
  expect(s.stopped.mock.calls[0][0]).toMatchObject({
    value: "old",
    valueChanged: false,
    newValue: { newValue: "next" },
  });
  s.view.unmount();
  const guarded = setup({ cancelOnStart: true });
  act(() =>
    guarded.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  await waitFor(() => expect(guarded.stopped).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("textbox", { name: "Source editor" })).toBeNull();
  expect(guarded.row.name).toBe("old");
  expect(guarded.stopped.mock.calls[0][0]).toMatchObject({
    newValue: undefined,
    valueChanged: false,
  });
});
it("allows keyboard/API entry when double-click editing is suppressed and cancels without a setter", () => {
  const s = setup({ suppressClickEdit: true });
  const cell = screen.getByRole("gridcell", { name: "old" });
  fireEvent.doubleClick(cell);
  expect(screen.queryByRole("textbox", { name: "Source editor" })).toBeNull();
  fireEvent.keyDown(cell, { key: "F2" });
  expect(screen.getByRole("textbox", { name: "Source editor" })).toBeTruthy();
  act(() => s.ref.current!.api.stopEditing(true));
  expect(s.row.name).toBe("old");
  expect(s.ref.current!.api.getEditingCells()).toEqual([]);
});
it("uses the provided text editor parser and rejects stale editor callbacks after source replacement", async () => {
  const s = setup({
    definitions: [
      {
        field: "name",
        editable: true,
        valueParser: (p: any) => p.newValue + "!",
      },
    ],
  });
  act(() =>
    s.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  const input = screen.getByRole("textbox", { name: "Cell editor" });
  fireEvent.change(input, { target: { value: "next" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(s.row.name).toBe("next!"));
  act(() =>
    s.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  act(() => s.ref.current!.api.setGridOption("rowData", []));
  expect(s.ref.current!.api.getEditingCells()).toEqual([]);
  expect(screen.queryByRole("textbox", { name: "Cell editor" })).toBeNull();
});
it("parses provided input once at commit, including a printable-key entry, while Escape does not parse", () => {
  const parser = vi.fn((p: any) => p.newValue + "!");
  const s = setup({
    definitions: [{ field: "name", editable: true, valueParser: parser }],
  });
  fireEvent.keyDown(screen.getByRole("gridcell", { name: "old" }), {
    key: "x",
  });
  let input = screen.getByRole("textbox", { name: "Cell editor" });
  expect((input as HTMLInputElement).value).toBe("x");
  fireEvent.change(input, { target: { value: "xy" } });
  expect(parser).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(parser).toHaveBeenCalledTimes(1);
  expect(s.row.name).toBe("xy!");
  act(() =>
    s.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  input = screen.getByRole("textbox", { name: "Cell editor" });
  fireEvent.change(input, { target: { value: "discard" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(parser).toHaveBeenCalledTimes(1);
  expect(s.row.name).toBe("xy!");
});
it("rejects callbacks from a retired editor and cancels when the same row ID receives new source data", () => {
  const captures: any[] = [];
  function Editor(props: any) {
    captures.push(props);
    return <input aria-label="Captured editor" />;
  }
  const s = setup({
    definitions: [{ field: "name", editable: true, cellEditor: Editor }],
  });
  act(() =>
    s.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  const stale = captures.at(-1);
  act(() => s.ref.current!.api.stopEditing(true));
  act(() =>
    s.ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }),
  );
  act(() => {
    stale.onValueChange("stale");
    stale.stopEditing();
  });
  expect(s.ref.current!.api.getEditingCells()).toHaveLength(1);
  expect(s.row.name).toBe("old");
  const replacement = new Row("a", "replacement");
  act(() => s.ref.current!.api.setGridOption("rowData", [replacement]));
  expect(s.ref.current!.api.getEditingCells()).toEqual([]);
  act(() => {
    stale.onValueChange("stale");
    stale.stopEditing();
  });
  expect(replacement.name).toBe("replacement");
  expect(s.row.name).toBe("old");
});
it("preserves imperative editing policy overrides through unrelated prop updates", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    row = new Row(),
    definitions = [{ field: "name", editable: true }];
  const view = render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[row]}
      columnDefs={definitions}
      getRowId={getRowId}
    />,
  );
  act(() => ref.current!.api.setGridOption("readOnlyEdit", true));
  view.rerender(
    <Ag31ClientGrid
      ref={ref}
      rowData={[row]}
      columnDefs={definitions}
      getRowId={getRowId}
      context={{ unrelated: true }}
    />,
  );
  expect(ref.current!.api.getGridOption("readOnlyEdit")).toBe(true);
  view.rerender(
    <Ag31ClientGrid
      ref={ref}
      rowData={[row]}
      columnDefs={definitions}
      getRowId={getRowId}
      readOnlyEdit={false}
    />,
  );
  expect(ref.current!.api.getGridOption("readOnlyEdit")).toBe(false);
});
it("resolves a registered selector once per session and merges source editor parameters", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    row = new Row();
  function Editor(p: any) {
    return (
      <input
        autoFocus
        aria-label={`${p.base}:${p.hint}`}
        value={p.value}
        onChange={(e) => p.onValueChange(e.target.value)}
      />
    );
  }
  const selector = vi.fn(() => ({
    component: "selected",
    params: { hint: "selected" },
  }));
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[row]}
      getRowId={getRowId}
      components={{ selected: Editor }}
      columnDefs={[
        {
          field: "name",
          editable: true,
          cellEditorSelector: selector,
          cellEditorParams: () => ({ base: "base", hint: "base" }),
        },
      ]}
    />,
  );
  act(() => ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }));
  const input = screen.getByRole("textbox", { name: "base:selected" });
  fireEvent.change(input, { target: { value: "one" } });
  fireEvent.change(input, { target: { value: "two" } });
  expect(selector).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(row.name).toBe("two");
});
it("keeps a generated-group editor alive when a direct source API write initializes its separate data", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    row = new Row();
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[row]}
      getRowId={getRowId}
      enableGroupEdit
      columnDefs={[
        {
          colId: "family",
          valueGetter: () => "One",
          rowGroup: true,
          enableRowGroup: true,
        },
        {
          field: "name",
          editable: true,
          valueGetter: (p: any) =>
            p.node.group
              ? (p.data?.name ?? p.node.allLeafChildren[0].data.name)
              : p.data.name,
        },
      ]}
    />,
  );
  act(() => ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }));
  const group = ref.current!.api.getDisplayedRowAtIndex(0)!;
  expect(group.data).toBeUndefined();
  act(() => {
    expect(group.setDataValue("name", "direct")).toBe(true);
  });
  expect(ref.current!.api.getEditingCells()).toHaveLength(1);
  expect(group.data).toEqual({ name: "direct" });
  expect(row.name).toBe("old");
  act(() => ref.current!.api.stopEditing(true));
  expect(group.data).toEqual({ name: "direct" });
});
it("commits a provided editor before pointer focus moves to a different cell", () => {
  const ref = createRef<Ag31ClientGridHandle<Row>>(),
    rows = [new Row(), new Row("b", "other")];
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={rows}
      getRowId={getRowId}
      columnDefs={[{ field: "name", editable: true }]}
    />,
  );
  act(() => ref.current!.api.startEditingCell({ rowIndex: 0, colKey: "name" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Cell editor" }), {
    target: { value: "next" },
  });
  fireEvent.pointerDown(screen.getByRole("gridcell", { name: "other" }), {
    pointerType: "mouse",
    button: 0,
    isPrimary: true,
    pointerId: 1,
  });
  expect(rows[0].name).toBe("next");
  expect(ref.current!.api.getEditingCells()).toEqual([]);
});
