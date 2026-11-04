// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid, type GridEditRequest } from "@opengrid/core";
import { DataGrid } from "./data-grid";
import type { CellEditorProps } from "./editors";
import { RowEditDialog } from "./row-edit-dialog";

class Choice {
  #code: string;
  constructor(code: string) {
    this.#code = code;
  }
  caption() {
    return this.#code;
  }
  toString(): string {
    throw new Error("Domain objects must not become string drafts");
  }
}
interface RecordRow {
  id: string;
  choice: Choice;
}
afterEach(cleanup);
function fixture() {
  const rows: RecordRow[] = [
    { id: "a", choice: new Choice("First") },
    { id: "b", choice: new Choice("Second") },
  ];
  const requests: GridEditRequest<RecordRow>[] = [];
  const model = createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [
      {
        id: "choice",
        header: "Choice",
        editable: true,
        valueGetter: (row) => row.choice,
        valueFormatter: (value) => (value as Choice).caption(),
      },
    ],
    onEditRequest: (request) => {
      requests.push(request);
    },
  });
  return { rows, requests, model };
}
const cell = (id = "a") =>
  document.querySelector<HTMLElement>(
    `[data-row-id="${id}"][data-column-id="choice"]`,
  )!;

describe("typed custom editor drafts", () => {
  it("keeps the typed object when a printable key starts its custom editor", () => {
    const { model, rows, requests } = fixture();
    render(
      <DataGrid
        model={model}
        selectionMode="none"
        renderEditor={(props) => (
          <button type="button" onClick={() => props.onCommit()}>
            Current {(props.rawValue as Choice).caption()}
          </button>
        )}
      />,
    );
    fireEvent.keyDown(cell(), { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: /^Current First$/ }));
    expect(requests[0].edits[0].value).toBe(rows[0].choice);
  });
  it("retains an unchanged object when a custom editor closes without a value change", () => {
    const { model, rows, requests } = fixture();
    render(
      <DataGrid
        model={model}
        selectionMode="none"
        renderEditor={(props) => (
          <button type="button" onClick={() => props.onCommit()}>
            Close unchanged editor
          </button>
        )}
      />,
    );
    fireEvent.keyDown(cell(), { key: "F2" });
    fireEvent.click(
      screen.getByRole("button", { name: "Close unchanged editor" }),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].edits[0].value).toBe(rows[0].choice);
  });
  it("preserves original class values and synchronously submits onRawChange then onCommit", () => {
    const { model, rows, requests } = fixture(),
      next = new Choice("Chosen"),
      notify = vi.fn();
    let original: unknown;
    render(
      <DataGrid
        model={model}
        selectionMode="none"
        onCellEdit={notify}
        renderEditor={(props) => {
          original = props.rawValue;
          return (
            <button
              type="button"
              onClick={() => {
                expect(props.onRawChange?.(next)).toBe(true);
                props.onCommit();
              }}
            >
              Choose object
            </button>
          );
        }}
      />,
    );
    fireEvent.keyDown(cell(), { key: "F2" });
    expect(original).toBe(rows[0].choice);
    fireEvent.click(screen.getByRole("button", { name: "Choose object" }));
    expect(requests).toHaveLength(1);
    expect(requests[0].edits[0].value).toBe(next);
    expect((requests[0].edits[0].value as Choice).caption()).toBe("Chosen");
    expect(notify.mock.calls[0][0].value).toBe(next);
    expect(model.getRow("a")).toBe(rows[0]);
    expect(cell().textContent).toBe("First");
    expect(screen.queryByRole("button", { name: "Choose object" })).toBeNull();
  });

  it.each([undefined, null, false, 0, 2n])(
    "submits an explicit typed %s without text coercion",
    (value) => {
      const { model, requests } = fixture();
      render(
        <DataGrid
          model={model}
          selectionMode="none"
          renderEditor={(props) => (
            <button
              type="button"
              onClick={() => {
                props.onRawChange?.(value);
                props.onCommit();
              }}
            >
              Submit value
            </button>
          )}
        />,
      );
      fireEvent.keyDown(cell(), { key: "F2" });
      fireEvent.click(screen.getByRole("button", { name: "Submit value" }));
      expect(requests).toHaveLength(1);
      expect(requests[0].edits[0].value).toBe(value);
    },
  );

  it("ignores old editor callbacks after another cell starts, including blur/commit/cancel", () => {
    const { model, requests } = fixture();
    let current!: CellEditorProps<RecordRow>;
    render(
      <DataGrid
        model={model}
        selectionMode="none"
        renderEditor={(props) => {
          current = props;
          return <button type="button">Editor {props.row.id}</button>;
        }}
      />,
    );
    fireEvent.keyDown(cell(), { key: "F2" });
    const stale = current;
    act(() => stale.onCancel());
    fireEvent.keyDown(cell("b"), { key: "F2" });
    const active = current;
    expect(active.contextKey).not.toBe(stale.contextKey);
    act(() => {
      expect(stale.onRawChange?.(new Choice("Stale"))).toBe(false);
      stale.onChange("stale text");
      expect(stale.onCommit()).toBe(false);
      stale.onBlur?.();
      stale.onCancel();
    });
    expect(screen.getByRole("button", { name: "Editor b" })).toBeTruthy();
    expect(requests).toHaveLength(0);
    const next = new Choice("Current");
    act(() => {
      active.onRawChange?.(next);
      active.onCommit();
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].edits[0]).toMatchObject({ rowId: "b", value: next });
  });

  it("rejects typed callbacks after unmount and after the read-only gate changes", () => {
    const { model, requests } = fixture();
    let context!: CellEditorProps<RecordRow>;
    const view = render(
      <DataGrid
        model={model}
        selectionMode="none"
        renderEditor={(props) => {
          context = props;
          return <button type="button">Editor</button>;
        }}
      />,
    );
    fireEvent.keyDown(cell(), { key: "F2" });
    act(() => model.setReadOnly(true));
    expect(context.onRawChange?.(new Choice("Denied"))).toBe(false);
    act(() => model.setReadOnly(false));
    fireEvent.keyDown(cell(), { key: "F2" });
    const stale = context;
    view.unmount();
    expect(stale.onRawChange?.(new Choice("Detached"))).toBe(false);
    expect(stale.onCommit()).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it("submits typed row drafts without coercing class instances", () => {
    const { model, rows, requests } = fixture(),
      next = new Choice("Row choice");
    let context!: CellEditorProps<RecordRow>;
    render(
      <RowEditDialog
        model={model}
        rowId="a"
        onClose={() => {}}
        renderEditor={(props) => {
          context = props;
          return (
            <button
              type="button"
              onClick={() => {
                props.onRawChange?.(next);
                props.onCommit();
              }}
            >
              Choose row object
            </button>
          );
        }}
      />,
    );
    expect(context.rawValue).toBe(rows[0].choice);
    fireEvent.click(screen.getByRole("button", { name: "Choose row object" }));
    expect(requests).toHaveLength(1);
    expect(requests[0].edits[0].value).toBe(next);
    expect(model.getRow("a")?.choice).toBe(rows[0].choice);
  });

  it("does not let callbacks from a replaced row dialog affect its new session", () => {
    const { model, requests } = fixture();
    const closed = vi.fn();
    let context!: CellEditorProps<RecordRow>;
    const editor = (props: CellEditorProps<RecordRow>) => {
      context = props;
      return <button type="button">Row editor {props.row.id}</button>;
    };
    const view = render(
      <RowEditDialog
        model={model}
        rowId="a"
        onClose={closed}
        renderEditor={editor}
      />,
    );
    const stale = context;
    view.rerender(
      <RowEditDialog
        model={model}
        rowId="b"
        onClose={closed}
        renderEditor={editor}
      />,
    );
    act(() => {
      expect(stale.onRawChange?.(new Choice("Stale"))).toBe(false);
      stale.onChange("stale");
      expect(stale.onCommit()).toBe(false);
      stale.onCancel();
    });
    expect(screen.getByRole("button", { name: "Row editor b" })).toBeTruthy();
    expect(closed).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });
});
