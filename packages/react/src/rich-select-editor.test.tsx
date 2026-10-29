// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { RichSelectEditor } from "./rich-select-editor";
import { GridLocaleProvider, enUS, esES } from "./locale";
import type { EditorOption } from "./editors";
const choices = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "disabled", label: "Disabled", disabled: true },
];
const applyButton = () => screen.getByRole("button", { name: "Apply choice" });
const searchBox = () =>
  screen.getByRole("combobox", { name: "Search Market choices" });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("staged virtual rich choices", () => {
  it("does no source work while closed, including SSR", () => {
    const provider = vi.fn(),
      getter = vi.fn(() => "Alpha");
    const record = { value: "a" };
    Object.defineProperty(record, "label", { get: getter });
    render(
      <RichSelectEditor
        value="a"
        label="Market"
        options={[record] as EditorOption[]}
        asyncOptions={provider}
        onApply={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(provider).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
    const html = renderToString(
      <RichSelectEditor
        value="a"
        label="Market"
        options={[record] as EditorOption[]}
        asyncOptions={provider}
        autoOpen
        onApply={vi.fn()}
      />,
    );
    expect(html).not.toContain("<dialog");
    expect(provider).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
  it("stages search/selection, retains rejected values and invokes cancel once", async () => {
    const apply = vi.fn((_value: string) => false),
      cancel = vi.fn(),
      open = vi.fn();
    render(
      <RichSelectEditor
        value="a"
        label="Market"
        options={choices}
        autoOpen
        onApply={apply}
        onCancel={cancel}
        onOpenChange={open}
      />,
    );
    fireEvent.change(searchBox(), { target: { value: "Beta" } });
    expect(apply).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(applyButton());
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0]).toBe("b");
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be applied",
    );
    expect((searchBox() as HTMLInputElement).value).toBe("Beta");
    fireEvent.keyDown(searchBox(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(open.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });
  it("bounds a 10000-choice DOM and preserves active-descendant identity through scrolling", () => {
    const options = Array.from({ length: 10000 }, (_, i) => ({
      value: String(i),
      label: `Choice ${i}`,
    }));
    render(
      <RichSelectEditor
        value="9000"
        label="Market"
        options={options}
        autoOpen
        onApply={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(13);
    const input = searchBox(),
      active = input.getAttribute("aria-activedescendant")!;
    expect(document.getElementById(active)?.textContent).toBe("Choice 9000");
    expect(document.getElementById(active)?.getAttribute("aria-posinset")).toBe(
      "9001",
    );
    expect(document.getElementById(active)?.getAttribute("aria-setsize")).toBe(
      "10000",
    );
    const list = screen.getByRole("listbox");
    fireEvent.scroll(list, { target: { scrollTop: 9990 * 36 } });
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(13);
    expect(document.getElementById(active)).not.toBeNull();
    fireEvent.keyDown(input, { key: "End" });
    const end = document.getElementById(
      input.getAttribute("aria-activedescendant")!,
    );
    expect(end?.textContent).toBe("Choice 9999");
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(13);
  });
  it("skips disabled choices and applies the exact empty identifier", async () => {
    const apply = vi.fn();
    render(
      <RichSelectEditor
        value="disabled"
        label="Market"
        options={[...choices, { value: "", label: "Empty identifier" }]}
        autoOpen
        onApply={apply}
      />,
    );
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(searchBox(), { key: "End" });
    await act(async () => {
      fireEvent.keyDown(searchBox(), { key: "Enter" });
    });
    expect(apply).toHaveBeenCalledWith(
      "",
      expect.objectContaining({
        reason: "enter",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("retains unavailable values until an explicit available choice is made", () => {
    render(
      <RichSelectEditor
        value="missing"
        label="Market"
        options={choices}
        autoOpen
        onApply={vi.fn()}
      />,
    );
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/current choice is unavailable/)).not.toBeNull();
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(searchBox(), { target: { value: "Disabled" } });
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("option").getAttribute("aria-disabled")).toBe(
      "true",
    );
  });
  it("keeps the search DOM, draft and focus while changing language and direction", () => {
    const apply = vi.fn();
    const view = render(
      <GridLocaleProvider locale={enUS}>
        <div dir="ltr">
          <RichSelectEditor
            value="a"
            label="Market"
            options={choices}
            autoOpen
            onApply={apply}
          />
        </div>
      </GridLocaleProvider>,
    );
    const input = searchBox();
    fireEvent.change(input, { target: { value: "Al" } });
    input.focus();
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <div dir="rtl">
          <RichSelectEditor
            value="a"
            label="Market"
            options={choices}
            autoOpen
            onApply={apply}
          />
        </div>
      </GridLocaleProvider>,
    );
    const translated = screen.getByRole("combobox", {
      name: "Buscar opciones de Market",
    });
    expect(translated).toBe(input);
    expect((translated as HTMLInputElement).value).toBe("Al");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("dialog").getAttribute("lang")).toBe("es-ES");
  });
  it.each(["context", "disabled"] as const)(
    "closes replaced %s work without resurrecting it",
    (change) => {
      const apply = vi.fn(),
        cancel = vi.fn(),
        key = {},
        other = {};
      const view = render(
        <RichSelectEditor
          value="a"
          label="Market"
          options={choices}
          contextKey={key}
          autoOpen
          onApply={apply}
          onCancel={cancel}
        />,
      );
      view.rerender(
        <RichSelectEditor
          value="a"
          label="Market"
          options={choices}
          contextKey={change === "context" ? other : key}
          disabled={change === "disabled"}
          autoOpen
          onApply={apply}
          onCancel={cancel}
        />,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      view.rerender(
        <RichSelectEditor
          value="a"
          label="Market"
          options={choices}
          contextKey={key}
          autoOpen
          onApply={apply}
          onCancel={cancel}
        />,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(apply).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    },
  );
  it("aborts cancelled apply work and ignores late completion", async () => {
    let finish!: (value: boolean) => void, signal!: AbortSignal;
    const apply = vi.fn((_value: string, context: { signal: AbortSignal }) => {
      signal = context.signal;
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    });
    const cancel = vi.fn();
    render(
      <RichSelectEditor
        value="a"
        label="Market"
        options={choices}
        autoOpen
        onApply={apply}
        onCancel={cancel}
      />,
    );
    fireEvent.click(applyButton());
    fireEvent.click(applyButton());
    expect(apply).toHaveBeenCalledTimes(1);
    expect((searchBox() as HTMLInputElement).readOnly).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(true));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("replaces async providers safely, owns results and does not refetch on locale change", async () => {
    let first!: (options: readonly EditorOption[]) => void,
      second!: (options: readonly EditorOption[]) => void;
    const signals: AbortSignal[] = [];
    const old = vi.fn((signal?: AbortSignal) => {
      signals.push(signal!);
      return new Promise<readonly EditorOption[]>((resolve) => {
        first = resolve;
      });
    });
    const latest = vi.fn(
      () =>
        new Promise<readonly EditorOption[]>((resolve) => {
          second = resolve;
        }),
    );
    const apply = vi.fn(),
      view = render(
        <GridLocaleProvider locale={enUS}>
          <RichSelectEditor
            value="a"
            label="Market"
            autoOpen
            asyncOptions={old}
            onApply={apply}
          />
        </GridLocaleProvider>,
      );
    await waitFor(() => expect(old).toHaveBeenCalledTimes(1));
    view.rerender(
      <GridLocaleProvider locale={enUS}>
        <RichSelectEditor
          value="a"
          label="Market"
          autoOpen
          asyncOptions={latest}
          onApply={apply}
        />
      </GridLocaleProvider>,
    );
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(signals[0].aborted).toBe(true);
    await act(async () => first([{ value: "old", label: "Old response" }]));
    expect(screen.queryByText("Old response")).toBeNull();
    const response = [{ value: "a", label: "New response" }];
    await act(async () => second(response));
    response[0].label = "Borrowed mutation";
    expect(screen.getByRole("option").textContent).toBe("New response");
    view.rerender(
      <GridLocaleProvider locale={esES}>
        <RichSelectEditor
          value="a"
          label="Market"
          autoOpen
          asyncOptions={latest}
          onApply={apply}
        />
      </GridLocaleProvider>,
    );
    expect(latest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("option").textContent).toBe("New response");
  });
  it("surfaces undefined rejections and retries a fresh source request", async () => {
    const provider = vi
      .fn()
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce(choices);
    render(
      <RichSelectEditor
        value="a"
        label="Market"
        autoOpen
        asyncOptions={provider}
        onApply={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole("alert")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Retry choices" }));
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("does not start a queued provider after an immediate cancellation", async () => {
    const provider = vi.fn(async () => choices);
    render(
      <RichSelectEditor
        value="a"
        label="Market"
        autoOpen
        asyncOptions={provider}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {});
    expect(provider).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
