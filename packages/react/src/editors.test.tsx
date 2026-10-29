// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Column } from "../../core/src/types";
import { CellEditor } from "./editors";
import type { CellEditorProps, EditorOption } from "./editors";

afterEach(cleanup);
type Row = { id: string; value: unknown };
const row: Row = { id: "a", value: "Ada" };
const column: Column<Row> = { id: "value", field: "value", editable: true };
const options: EditorOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];
function props(
  extra: Partial<CellEditorProps<Row>> = {},
): CellEditorProps<Row> {
  return {
    row,
    column,
    value: "Ada",
    label: "Edit value",
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    ...extra,
  };
}
function StatefulEditor({
  initial = "Ada",
  ...rest
}: Omit<CellEditorProps<Row>, "value" | "onChange"> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <CellEditor {...rest} value={value} onChange={setValue} />;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("CellEditor native controls", () => {
  it("focuses text on mount, preserves the draft and delegates parsing to the model", () => {
    const config = props();
    render(<CellEditor {...config} />);
    const input = screen.getByRole("textbox", { name: "Edit value" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Grace" } });
    expect(config.onChange).toHaveBeenCalledWith("Grace");
    expect(config.onCommit).not.toHaveBeenCalled();
  });

  it("renders number and date controls without converting draft strings", () => {
    const config = props({ editorType: "number", value: "12.50" });
    const view = render(<CellEditor {...config} />);
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "18.25" },
    });
    expect(config.onChange).toHaveBeenCalledWith("18.25");
    view.rerender(
      <CellEditor {...config} editorType="date" value="2026-10-29" />,
    );
    const date = screen.getByLabelText("Edit value") as HTMLInputElement;
    expect(date.type).toBe("date");
    expect(date.value).toBe("2026-10-29");
  });

  it("retains BigInt digits as text instead of coercing them through Number", () => {
    const config = props({
      column: { ...column, type: "bigint" },
      editorType: "number",
      value: "900719925474099312345",
    });
    render(<CellEditor {...config} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("900719925474099312345");
    expect(input.inputMode).toBe("numeric");
  });

  it("uses textual boolean values compatible with core parsers", () => {
    const config = props({
      column: { ...column, type: "boolean" },
      value: "true",
    });
    render(<CellEditor {...config} />);
    const input = screen.getByRole("checkbox", {
      name: "Edit value",
    }) as HTMLInputElement;
    expect(input.checked).toBe(true);
    fireEvent.click(input);
    expect(config.onChange).toHaveBeenCalledWith("false");
  });

  it("maps choices by value, keeps unknown current values and respects disabled options", () => {
    const config = props({
      editorType: "select",
      options: [
        ...options,
        { value: "c", label: "Unavailable", disabled: true },
      ],
      value: "legacy",
    });
    render(<CellEditor {...config} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("legacy");
    expect(
      (screen.getByRole("option", { name: "Unavailable" }) as HTMLOptionElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(select, { target: { value: "b" } });
    expect(config.onChange).toHaveBeenCalledWith("b");
  });

  it("commits Enter, cancels Escape and prevents invalid Tab exits", () => {
    const config = props({ onCommit: vi.fn(() => false) });
    render(<CellEditor {...config} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(config.onCommit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(config.onCancel).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
  });

  it("leaves multiline Enter for newlines and commits Control Enter", () => {
    const config = props({ editorType: "largeText", value: "first\nsecond" });
    render(<CellEditor {...config} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.tagName).toBe("TEXTAREA");
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
    expect(config.onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(config.onCommit).toHaveBeenCalledTimes(1);
  });

  it("does not automatically commit again when accepted Tab or cancellation causes blur", () => {
    const config = props();
    render(<CellEditor {...config} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.blur(input);
    expect(config.onCommit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(config.onCommit).toHaveBeenCalledTimes(1);
    expect(config.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "A fresh draft" } });
    fireEvent.blur(input);
    expect(config.onCommit).toHaveBeenCalledTimes(2);
  });

  it("allows the parent to own keyboard navigation without duplicate commits", () => {
    const onKeyDown = vi.fn();
    const config = props({ onKeyDown });
    render(<CellEditor {...config} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(config.onCommit).not.toHaveBeenCalled();
    expect(config.onCancel).not.toHaveBeenCalled();
  });

  it("associates validation messages and respects explicit blur handling", () => {
    const config = props({ error: "Invalid amount", onBlur: vi.fn() });
    render(<CellEditor {...config} />);
    const input = screen.getByRole("textbox");
    const alert = screen.getByRole("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
    fireEvent.blur(input);
    expect(config.onBlur).toHaveBeenCalledTimes(1);
    expect(config.onCommit).not.toHaveBeenCalled();
  });

  it("preserves external validation semantics without duplicating the host alert", () => {
    render(
      <>
        <CellEditor
          {...props({
            editorType: "number",
            error: "Invalid amount",
            errorId: "host-error",
            inlineValidation: false,
          })}
        />
        <div role="alert" id="host-error">
          Invalid amount
        </div>
      </>,
    );
    const input = screen.getByRole("spinbutton");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("host-error");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(
      input.closest("[data-editor-type]")?.getAttribute("data-editor-type"),
    ).toBe("number");
  });

  it("does not steal focus or selection on draft updates", () => {
    render(<StatefulEditor {...props()} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    input.setSelectionRange(3, 3);
    fireEvent.change(input, { target: { value: "AdaX Lovelace" } });
    expect(input.value).toBe("AdaX Lovelace");
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
  });
});

describe("CellEditor asynchronous choices", () => {
  it("shows a loading state, supplies cancellation and preserves the selected draft", async () => {
    const result = deferred<readonly EditorOption[]>();
    const provider = vi.fn((_signal?: AbortSignal) => result.promise);
    const config = props({
      editorType: "select",
      value: "b",
      asyncOptions: provider,
    });
    const view = render(<CellEditor {...config} />);
    expect(screen.getByRole("status").textContent).toContain("Loading choices");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("b");
    await act(async () => result.resolve(options));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("option", { name: "Beta" })).toBeTruthy();
    expect(config.onChange).not.toHaveBeenCalled();
    const signal = provider.mock.calls[0]?.[0] as AbortSignal | undefined;
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("discards stale resolutions after the provider changes", async () => {
    const old = deferred<readonly EditorOption[]>();
    const next = deferred<readonly EditorOption[]>();
    const first = vi.fn(() => old.promise);
    const second = vi.fn(() => next.promise);
    const config = props({
      editorType: "select",
      value: "",
      asyncOptions: first,
    });
    const view = render(<CellEditor {...config} />);
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    view.rerender(<CellEditor {...config} asyncOptions={second} />);
    await act(async () =>
      next.resolve([{ value: "new", label: "Current choice" }]),
    );
    await act(async () =>
      old.resolve([{ value: "old", label: "Outdated choice" }]),
    );
    expect(screen.getByRole("option", { name: "Current choice" })).toBeTruthy();
    expect(
      screen.queryByRole("option", { name: "Outdated choice" }),
    ).toBeNull();
  });

  it("reports provider errors, retries and avoids committing when focus moves to Retry", async () => {
    const provider = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(options);
    const config = props({ editorType: "select", asyncOptions: provider });
    render(<CellEditor {...config} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Offline");
    const retry = screen.getByRole("button", { name: "Retry choices" });
    fireEvent.blur(screen.getByRole("combobox"), { relatedTarget: retry });
    expect(config.onCommit).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await screen.findByRole("option", { name: "Alpha" });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turns malformed provider results into a recoverable error", async () => {
    const provider = vi
      .fn()
      .mockResolvedValue([{ value: 123, label: "Invalid" }]);
    render(
      <CellEditor
        {...props({ editorType: "select", asyncOptions: provider })}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "invalid choices",
    );
    expect(screen.getByRole("button", { name: "Retry choices" })).toBeTruthy();
  });

  it("ignores requests that settle after the editor is unmounted", async () => {
    const result = deferred<readonly EditorOption[]>();
    const provider = vi.fn(() => result.promise);
    const view = render(
      <CellEditor
        {...props({ editorType: "select", asyncOptions: provider })}
      />,
    );
    await waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => result.reject(new Error("Late error")));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
