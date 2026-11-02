// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
afterEach(cleanup);
const make = (name = "Original") =>
  createGrid({
    rows: [{ id: "one", name }],
    getRowId: (row) => row.id,
    columns: [{ id: "name", field: "name", editable: true }],
  });
const cell = () =>
  document.querySelector<HTMLElement>(
    '[data-row-id="one"][data-column-id="name"]',
  )!;
async function pendingClipboard(
  action: (
    resolve: (value: string) => void,
    reject: (error: Error) => void,
  ) => Promise<void>,
) {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<string>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: () => pending },
  });
  try {
    await action(resolve, reject);
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
}
it("does not mutate an old model when the toolbar clipboard read resolves after unmount", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make(),
      view = render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    view.unmount();
    await act(async () => {
      resolve("Unexpected old write");
      await Promise.resolve();
    });
    expect(model.getRow("one")!.name).toBe("Original");
    expect(model.undo()).toBe(false);
  });
});
it("does not write either model after a model replacement supersedes the pending clipboard read", async () => {
  await pendingClipboard(async (resolve) => {
    const old = make(),
      next = make("Replacement"),
      view = render(<DataGrid model={old} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    view.rerender(<DataGrid model={next} cellSelection />);
    fireEvent.click(cell());
    await act(async () => {
      resolve("Unexpected old write");
      await Promise.resolve();
    });
    expect(old.getRow("one")!.name).toBe("Original");
    expect(next.getRow("one")!.name).toBe("Replacement");
    expect(old.undo()).toBe(false);
    expect(next.undo()).toBe(false);
  });
});
it("still applies a pending clipboard read through a cosmetic direction update with the same owner", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make(),
      view = render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    view.rerender(<DataGrid model={model} cellSelection direction="rtl" />);
    await act(async () => {
      resolve("Intentional paste");
      await Promise.resolve();
    });
    expect(model.getRow("one")!.name).toBe("Intentional paste");
    expect(model.undo()).toBe(true);
    expect(model.getRow("one")!.name).toBe("Original");
  });
});

it("discards an old clipboard failure after a replacement model owns the mounted grid", async () => {
  await pendingClipboard(async (_resolve, reject) => {
    const old = make(),
      next = make("Replacement"),
      view = render(<DataGrid model={old} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    view.rerender(<DataGrid model={next} cellSelection />);
    await act(async () => {
      reject(new Error("Old clipboard failure"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(old.getRow("one")!.name).toBe("Original");
    expect(next.getRow("one")!.name).toBe("Replacement");
  });
});

it("discards a delayed read after same-model data replacement retains the selected ID", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    act(() => model.setRows([{ id: "one", name: "Fresh source" }]));
    await act(async () => resolve("Stale paste"));
    expect(model.getRow("one")!.name).toBe("Fresh source");
    expect(model.undo()).toBe(false);
  });
});

it("does not retarget a delayed paste when the selected range moves", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make();
    model.setRows([
      { id: "one", name: "Original" },
      { id: "two", name: "Other" },
    ]);
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    fireEvent.click(
      document.querySelector('[data-row-id="two"][data-column-id="name"]')!,
    );
    await act(async () => resolve("Stale paste"));
    expect(model.getRows().map((row) => row.name)).toEqual([
      "Original",
      "Other",
    ]);
    expect(model.undo()).toBe(false);
  });
});

it("cancels a delayed paste when model state changes before React commits its new projection", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    await act(async () => {
      model.setSort("name", "desc");
      resolve("Stale paste");
      await Promise.resolve();
    });
    expect(model.getRow("one")!.name).toBe("Original");
    expect(model.undo()).toBe(false);
  });
});

it.each(["old first", "new first"])(
  "lets only the newest toolbar paste request write when reads resolve %s",
  async (order) => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let first!: (value: string) => void, second!: (value: string) => void;
    const readText = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            first = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            second = resolve;
          }),
      );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText },
    });
    try {
      const model = make();
      render(<DataGrid model={model} cellSelection />);
      fireEvent.click(cell());
      fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
      fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
      if (order === "old first") {
        await act(async () => first("Old paste"));
        expect(model.getRow("one")!.name).toBe("Original");
        expect(model.undo()).toBe(false);
      }
      await act(async () => second("Latest paste"));
      if (order === "new first") await act(async () => first("Old paste"));
      expect(model.getRow("one")!.name).toBe("Latest paste");
      expect(model.undo()).toBe(true);
      expect(model.getRow("one")!.name).toBe("Original");
      expect(model.undo()).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  },
);

it("discards a pending read after cell selection is disabled", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make(),
      view = render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    view.rerender(<DataGrid model={model} cellSelection={false} />);
    await act(async () => resolve("Stale paste"));
    expect(model.getRow("one")!.name).toBe("Original");
    expect(model.undo()).toBe(false);
  });
});

it("cancels pending clipboard intent when a cell editor opens without changing model data", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    fireEvent.keyDown(cell(), { key: "F2" });
    const editor = screen.getByRole("textbox", { name: "Edit name row one" });
    fireEvent.change(editor, { target: { value: "Uncommitted draft" } });
    await act(async () => resolve("Stale paste"));
    expect(model.getRow("one")!.name).toBe("Original");
    expect((editor as HTMLInputElement).value).toBe("Uncommitted draft");
    expect(model.undo()).toBe(false);
  });
});

it.each(["row", "note"] as const)(
  "cancels pending clipboard intent when a %s dialog opens",
  async (kind) => {
    await pendingClipboard(async (resolve) => {
      const model = make();
      render(
        <DataGrid
          model={model}
          cellSelection
          editMode={kind === "row" ? "row" : "cell"}
        />,
      );
      fireEvent.click(cell());
      fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
      fireEvent.keyDown(
        cell(),
        kind === "row" ? { key: "F2" } : { key: "n", altKey: true },
      );
      const dialog = screen.getByRole("dialog");
      const editor = screen.getByRole("textbox", {
        name: kind === "row" ? "Edit name" : "Note text",
      });
      fireEvent.change(editor, { target: { value: "Uncommitted draft" } });
      await act(async () => resolve("Stale paste"));
      expect(model.getRow("one")!.name).toBe("Original");
      expect((editor as HTMLInputElement).value).toBe("Uncommitted draft");
      expect(dialog.isConnected).toBe(true);
      expect(model.undo()).toBe(false);
    });
  },
);

it("discards a pending read after runtime column definitions are replaced", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    act(() =>
      model.setColumns([
        { id: "name", field: "name", editable: true, header: "New schema" },
      ]),
    );
    await act(async () => resolve("Stale paste"));
    expect(model.getRow("one")!.name).toBe("Original");
    expect(model.undo()).toBe(false);
  });
});

it("suppresses a stale clipboard failure after same-model data changes", async () => {
  await pendingClipboard(async (_resolve, reject) => {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    act(() => model.setRows([{ id: "one", name: "Fresh source" }]));
    await act(async () => reject(new Error("Stale clipboard denial")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(model.getRow("one")!.name).toBe("Fresh source");
  });
});

it("reports current read failures and allows a fresh successful retry", async () => {
  await pendingClipboard(async (_resolve, reject) => {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    await act(async () => reject(new Error("Clipboard permission denied")));
    expect(screen.getByRole("alert").textContent).toContain(
      "Clipboard permission denied",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: () => Promise.resolve("Retry succeeds") },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Paste cells" })),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(model.getRow("one")!.name).toBe("Retry succeeds");
    expect(model.undo()).toBe(true);
    expect(model.getRow("one")!.name).toBe("Original");
  });
});

it("does not let a pending toolbar read overwrite a later native paste", async () => {
  await pendingClipboard(async (resolve) => {
    const model = make();
    render(<DataGrid model={model} cellSelection />);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Paste cells" }));
    fireEvent.paste(cell(), {
      clipboardData: { getData: () => "Native paste" },
    });
    await act(async () => resolve("Old toolbar paste"));
    expect(model.getRow("one")!.name).toBe("Native paste");
    expect(model.undo()).toBe(true);
    expect(model.getRow("one")!.name).toBe("Original");
    expect(model.undo()).toBe(false);
  });
});

it.each(["resolve", "reject"])(
  "does not announce a stale clipboard write %s after replacing its owner",
  async (outcome) => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let resolve!: () => void, reject!: (error: Error) => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((done, fail) => {
          resolve = done;
          reject = fail;
        }),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      const old = make(),
        next = make("Replacement"),
        view = render(<DataGrid model={old} cellSelection />);
      fireEvent.click(cell());
      fireEvent.click(
        screen.getByRole("button", { name: "Copy selected cells" }),
      );
      expect(writeText).toHaveBeenCalledExactlyOnceWith("Original");
      view.rerender(<DataGrid model={next} cellSelection />);
      await act(async () => {
        if (outcome === "resolve") resolve();
        else reject(new Error("Stale write failure"));
      });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText("Selected cells copied.")).toBeNull();
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  },
);
