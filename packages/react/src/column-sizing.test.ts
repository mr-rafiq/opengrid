// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrid, type Column } from "../../core/src/index";
import {
  createColumnSizingController,
  type ColumnSizingSnapshot,
} from "./column-sizing";

type Row = { id: string; value: string };
const dispose: (() => void)[] = [];
let factor = 8;
function rect(width: number, height = 20): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    right: width,
    top: 0,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  };
}
function layout() {
  factor = 8;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
    function (this: HTMLElement) {
      const visible = this.style.display !== "none" && !this.hidden;
      return Object.assign(visible ? [rect(100)] : [], {
        item: (index: number) => (visible && index === 0 ? rect(100) : null),
      }) as unknown as DOMRectList;
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.style.position === "fixed" && this.style.left === "-100000px")
        return rect((this.textContent?.length ?? 0) * factor);
      return rect(
        Number(
          this.dataset.testWidth ??
            (this.getAttribute("role") === "grid" ? 500 : 100),
        ),
      );
    },
  );
}
function fixture(
  columns: Column<Row>[] = [{ id: "value", field: "value", width: 160 }],
) {
  layout();
  const model = createGrid({
    rows: [{ id: "row", value: "source must not be read" }],
    columns,
    getRowId: (row) => row.id,
  });
  const root = document.createElement("div");
  root.setAttribute("role", "grid");
  root.lang = "en-US";
  document.body.append(root);
  let token = 1,
    viewport: HTMLElement | null = root,
    busy = false,
    customRenderer = false;
  function snapshot(): ColumnSizingSnapshot<Row> {
    const state = model.getState(),
      definitions = model.getColumns();
    const widths = Object.create(null) as Record<string, number>;
    for (const column of definitions)
      if (!column.hidden)
        Object.defineProperty(widths, column.id, {
          value: Object.hasOwn(state.columnWidths, column.id)
            ? state.columnWidths[column.id]
            : (column.width ?? 160),
          enumerable: true,
        });
    return {
      model,
      viewport,
      columns: definitions,
      widths,
      viewToken: token,
      busy,
      customRenderer,
    };
  }
  const controller = createColumnSizingController(snapshot);
  dispose.push(() => {
    controller.dispose();
    root.remove();
  });
  function sample(
    id: string,
    text: string,
    kind: "cell" | "header" = "cell",
    parent: HTMLElement = root,
  ) {
    const owner = document.createElement("div");
    owner.dataset.columnId = id;
    owner.setAttribute("role", kind === "cell" ? "gridcell" : "columnheader");
    owner.style.padding = "0 8px";
    owner.style.borderInlineEnd = "1px solid black";
    const label = document.createElement("span");
    label.dataset.ogSizeText = kind;
    label.textContent = text;
    label.style.fontFamily = "serif";
    label.style.fontSize = "13px";
    owner.append(label);
    parent.append(owner);
    return { owner, label };
  }
  return {
    model,
    root,
    controller,
    sample,
    changeView: () => {
      token++;
    },
    setRoot: (value: HTMLElement | null) => {
      viewport = value;
    },
    busy: () => {
      busy = true;
    },
    custom: () => {
      customRenderer = true;
    },
  };
}
afterEach(() => {
  for (const close of dispose.splice(0)) close();
  vi.restoreAllMocks();
});

describe("explicit size-to-fit controller", () => {
  function setup() {
    const f = fixture([
      { id: "a", field: "value", width: 100, pinned: "left", editable: true },
      { id: "b", field: "value", width: 200, flex: 9 },
      { id: "c", field: "value", width: 300, pinned: "right" },
      { id: "hidden", field: "value", width: 200, hidden: true },
    ]);
    vi.spyOn(f.root, "clientWidth", "get").mockReturnValue(1200);
    return f;
  }
  it("publishes all visible widths atomically, preserves hidden state and is repeatable", () => {
    const f = setup();
    f.model.setState({ columnWidths: { a: 900, hidden: 250 } });
    const notifications = vi.fn();
    f.model.subscribe(notifications);
    const report = f.controller.sizeColumnsToFit();
    expect(report.cancelled).toBe(false);
    expect(report.allocation!.widths).toEqual({ a: 200, b: 400, c: 600 });
    expect(report.changedColumnIds).toEqual(["a", "b", "c"]);
    expect(f.model.getState().columnWidths).toEqual({
      a: 200,
      b: 400,
      c: 600,
      hidden: 250,
    });
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.changedColumnIds)).toBe(true);
    expect(f.controller.sizeColumnsToFit().changedColumnIds).toEqual([]);
    expect(notifications).toHaveBeenCalledTimes(1);
    f.controller.resetWidths();
    expect(f.model.getState().columnWidths).toEqual({});
  });
  it("holds excluded flex geometry and supports an explicit target width", () => {
    const f = setup();
    f.model.resizeColumn("b", 150);
    const result = f.controller.sizeColumnsToFit({
      availableWidth: 650,
      excludeColumnIds: ["b"],
    });
    expect(result.allocation!.widths).toEqual({ a: 125, b: 150, c: 375 });
    expect(result.allocation!.excludedColumnIds).toEqual(["b"]);
    expect(f.model.getState().columnWidths).toEqual({ a: 125, b: 150, c: 375 });
  });
  it("adds ownership even when pixels are unchanged, and leaves data history intact", () => {
    const f = setup();
    expect(
      f.controller.sizeColumnsToFit({ availableWidth: 600 }).changedColumnIds,
    ).toEqual(["a", "b", "c"]);
    expect(f.model.getState().columnWidths).toEqual({ a: 100, b: 200, c: 300 });
    expect(f.model.undo()).toBe(false);
  });
  it("cancels pending text work before any competing width publication", async () => {
    const f = setup();
    f.sample("b", "Pending text");
    const pending = f.controller.autoSizeColumns(["b"]);
    const fit = f.controller.sizeColumnsToFit();
    expect(fit.cancelled).toBe(false);
    expect((await pending).cancelReason).toBe("superseded");
    expect(f.model.getState().columnWidths.b).toBe(400);
  });
  it("preserves an existing edit undo/redo transaction through layout changes", () => {
    const f = setup();
    expect(f.model.editCell("row", "a", "edited")).toBeUndefined();
    f.controller.sizeColumnsToFit();
    expect(f.model.undo()).toBe(true);
    expect(f.model.getRow("row")!.value).toBe("source must not be read");
    expect(f.model.getState().columnWidths).toEqual({ a: 200, b: 400, c: 600 });
    expect(f.model.redo()).toBe(true);
    expect(f.model.getRow("row")!.value).toBe("edited");
  });
  it("does not write during busy or disposed contexts", () => {
    const f = setup(),
      write = vi.spyOn(f.model, "setState");
    f.busy();
    expect(f.controller.sizeColumnsToFit().cancelReason).toBe("busy");
    f.controller.dispose();
    expect(f.controller.sizeColumnsToFit().cancelReason).toBe("disposed");
    expect(write).not.toHaveBeenCalled();
  });
  it("leaves a valid pending text command running after invalid fit input", async () => {
    const f = setup();
    f.sample("b", "Pending text");
    const pending = f.controller.autoSizeColumns(["b"]);
    expect(() =>
      f.controller.sizeColumnsToFit({ excludeColumnIds: ["unknown"] }),
    ).toThrow();
    expect((await pending).cancelled).toBe(false);
  });
  it("requires a connected visible positive-width viewport even with an explicit target", () => {
    const f = setup(),
      write = vi.spyOn(f.model, "setState");
    vi.spyOn(f.root, "clientWidth", "get").mockReturnValue(0);
    expect(
      f.controller.sizeColumnsToFit({ availableWidth: 900 }).cancelReason,
    ).toBe("unavailable");
    f.root.remove();
    expect(f.controller.sizeColumnsToFit().cancelReason).toBe("unavailable");
    f.setRoot(null);
    expect(f.controller.sizeColumnsToFit().cancelReason).toBe("unavailable");
    expect(write).not.toHaveBeenCalled();
  });
  it("rejects invalid commands before state publication", () => {
    const f = setup(),
      write = vi.spyOn(f.model, "setState");
    expect(() =>
      f.controller.sizeColumnsToFit({ availableWidth: NaN }),
    ).toThrow();
    expect(() =>
      f.controller.sizeColumnsToFit({ excludeColumnIds: ["unknown"] }),
    ).toThrow();
    expect(() =>
      f.controller.sizeColumnsToFit({ excludeColumnIds: ["a", "a"] }),
    ).toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it("guards view replacement, model updates and resize during synchronous planning", () => {
    for (const change of ["view", "model", "resize"] as const) {
      const f = setup();
      let reads = 0;
      const controller = createColumnSizingController(() => {
        reads++;
        if (reads === 2) {
          if (change === "model") f.model.setQuickFilter("source changed");
          if (change === "resize")
            vi.spyOn(f.root, "clientWidth", "get").mockReturnValue(800);
        }
        return {
          model: f.model,
          viewport: f.root,
          columns: f.model.getColumns(),
          widths: { a: 100, b: 200, c: 300 },
          leadingWidth: 44,
          viewToken: change === "view" && reads === 2 ? 2 : 1,
        };
      });
      dispose.push(() => controller.dispose());
      const write = vi.spyOn(f.model, "setState");
      expect(controller.sizeColumnsToFit().cancelReason).toBe("stale");
      expect(write).not.toHaveBeenCalled();
    }
  });
});

describe("bounded rendered default-text sizing", () => {
  it("skips transformed or zoomed ancestor metrics instead of mixing CSS and viewport pixels", async () => {
    const f = fixture();
    f.sample("value", "Visible text");
    const write = vi.spyOn(f.model, "setState");
    for (const style of ["transform:scale(.5)", "scale: .75", "zoom: 1.25"]) {
      f.root.setAttribute("style", style);
      const report = await f.controller.autoSizeColumns(["value"]);
      expect(report.skipped).toEqual([
        { columnId: "value", reason: "not-measurable" },
      ]);
      expect(report.measured).toEqual([]);
    }
    expect(write).not.toHaveBeenCalled();
  });
  it("measures existing text, includes box reservation, batches overrides and returns a frozen report", async () => {
    const f = fixture([
      { id: "value", field: "value", width: 160 },
      { id: "other", field: "value", width: 100, maxWidth: 90 },
    ]);
    f.sample("value", "Long rendered text");
    f.sample("other", "Extremely long rendered text");
    const write = vi.spyOn(f.model, "setState"),
      read = vi.spyOn(f.model, "getValue");
    const report = await f.controller.autoSizeColumns();
    expect(read).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(report.measured.map((item) => item.columnId)).toEqual([
      "value",
      "other",
    ]);
    expect(report.measured[0].width).toBeGreaterThan(
      "Long rendered text".length * factor,
    );
    expect(report.measured[1].width).toBe(90);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.measured[0])).toBe(true);
    const again = await f.controller.autoSizeColumns();
    expect(again.unchanged).toHaveLength(2);
    expect(write).toHaveBeenCalledTimes(1);
    expect(
      f.root.ownerDocument.querySelector('[style*="-100000px"]'),
    ).toBeNull();
  });
  it("optionally includes leaf headers and reserves sibling controls without cloning them", async () => {
    const f = fixture();
    f.sample("value", "x");
    const header = f.sample("value", "A much longer header", "header");
    const control = document.createElement("button");
    control.dataset.testWidth = "25";
    control.textContent = "sort";
    header.owner.append(control);
    const copied = vi.spyOn(control, "cloneNode"),
      click = vi.fn();
    control.onclick = click;
    const withHeader = await f.controller.autoSizeColumns(["value"]);
    expect(withHeader.measured[0].headerSamples).toBe(1);
    expect(copied).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    const bodyOnly = await f.controller.autoSizeColumns(["value"], {
      includeHeader: false,
    });
    expect(bodyOnly.measured[0].width).toBeLessThan(
      withHeader.measured[0].width,
    );
    expect(bodyOnly.measured[0].headerSamples).toBe(0);
  });
  it("skips unknown, hidden, unrendered, custom-rendered and multicolumn cells", async () => {
    const f = fixture([
      { id: "value", field: "value" },
      { id: "hidden", field: "value", hidden: true },
      { id: "offscreen", field: "value" },
    ]);
    const merged = f.sample("value", "Spanning text");
    merged.owner.setAttribute("aria-colspan", "2");
    const report = await f.controller.autoSizeColumns([
      "unknown",
      "hidden",
      "offscreen",
      "value",
    ]);
    expect(report.skipped).toEqual([
      { columnId: "unknown", reason: "unknown" },
      { columnId: "hidden", reason: "hidden" },
      { columnId: "offscreen", reason: "unrendered" },
      { columnId: "value", reason: "unrendered" },
    ]);
    f.custom();
    const custom = await f.controller.autoSizeColumns(["value"]);
    expect(custom.skipped[0].reason).toBe("custom-renderer");
  });
  it("isolates nested grids and excludes full-width, detail and synthetic group text", async () => {
    const f = fixture();
    const nested = document.createElement("div");
    nested.setAttribute("role", "grid");
    f.root.append(nested);
    f.sample("value", "nested".repeat(50), "cell", nested);
    for (const className of ["og-group-row", "og-detail-row"]) {
      const container = document.createElement("div");
      container.className = className;
      f.root.append(container);
      f.sample("value", "ignored", "cell", container);
    }
    const full = document.createElement("div");
    full.dataset.fullWidth = "true";
    f.root.append(full);
    f.sample("value", "ignored", "cell", full);
    f.sample("value", "actual");
    const report = await f.controller.autoSizeColumns();
    expect(report.measured[0].cellSamples).toBe(1);
  });
  it("cancels atomically on column, sample and text budgets without partial writes", async () => {
    const f = fixture();
    f.sample("value", "good");
    const write = vi.spyOn(f.model, "setState");
    const tooMany = await f.controller.autoSizeColumns(
      Array.from({ length: 65 }, (_, index) => String(index)),
    );
    expect(tooMany.cancelReason).toBe("limits");
    const huge = f.sample("value", "x".repeat(1000001));
    const text = await f.controller.autoSizeColumns();
    expect(text.cancelReason).toBe("limits");
    huge.owner.remove();
    for (let index = 0; index < 2000; index++) f.sample("value", "x");
    const samples = await f.controller.autoSizeColumns();
    expect(samples.cancelReason).toBe("limits");
    expect(write).not.toHaveBeenCalled();
  });
  it("cancels on a same-event model notification and on a changed view token", async () => {
    const f = fixture();
    f.sample("value", "rendered");
    const write = vi.spyOn(f.model, "setState");
    const pending = f.controller.autoSizeColumns();
    f.model.selectRows(["row"]);
    expect((await pending).cancelReason).toBe("model");
    expect(write).not.toHaveBeenCalled();
    const next = f.controller.autoSizeColumns();
    f.changeView();
    expect((await next).cancelReason).toBe("view");
    expect(write).not.toHaveBeenCalled();
  });
  it("cancels on DOM changes and never writes text from a detached old root", async () => {
    const f = fixture();
    const sample = f.sample("value", "before");
    const write = vi.spyOn(f.model, "setState");
    const pending = f.controller.autoSizeColumns();
    sample.label.textContent = "after";
    expect((await pending).cancelReason).toBe("view");
    const next = f.controller.autoSizeColumns();
    f.root.remove();
    expect((await next).cancelReason).toBe("view");
    expect(write).not.toHaveBeenCalled();
  });
  it("supersedes prior work, cancels on disposal and permits a fresh StrictMode setup", async () => {
    const f = fixture();
    f.sample("value", "rendered");
    const first = f.controller.autoSizeColumns(),
      second = f.controller.autoSizeColumns();
    expect((await first).cancelReason).toBe("superseded");
    expect((await second).cancelled).toBe(false);
    const pending = f.controller.autoSizeColumns();
    f.controller.dispose();
    expect((await pending).cancelReason).toBe("disposed");
    expect((await f.controller.autoSizeColumns()).cancelReason).toBe(
      "disposed",
    );
    const fresh = createColumnSizingController<Row>(() => ({
      model: f.model,
      viewport: f.root,
      columns: f.model.getColumns(),
      widths: f.controller.getWidths(),
      viewToken: 1,
    }));
    dispose.push(() => fresh.dispose());
    expect((await fresh.autoSizeColumns()).cancelled).toBe(false);
  });
  it("reads the viewport at command time and falls back safely for hidden or SSR roots", async () => {
    const f = fixture();
    f.sample("value", "rendered");
    f.setRoot(null);
    expect((await f.controller.autoSizeColumns(["value"])).skipped).toEqual([
      { columnId: "value", reason: "unavailable" },
    ]);
    f.setRoot(f.root);
    expect((await f.controller.autoSizeColumns()).measured).toHaveLength(1);
    f.root.style.display = "none";
    expect(
      (await f.controller.autoSizeColumns(["value"])).skipped[0].reason,
    ).toBe("unavailable");
  });
  it("uses actual typography and nearest language as part of cached metrics", async () => {
    const f = fixture();
    const sample = f.sample("value", "rendered");
    const first = await f.controller.autoSizeColumns();
    factor = 12;
    sample.label.lang = "tr";
    const language = await f.controller.autoSizeColumns();
    expect(language.measured[0].width).toBeGreaterThan(first.measured[0].width);
    factor = 16;
    sample.label.style.fontWeight = "700";
    const font = await f.controller.autoSizeColumns();
    expect(font.measured[0].width).toBeGreaterThan(language.measured[0].width);
  });
  it("clears idle font metrics and cancels when fonts begin loading", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(document, "fonts");
    const fonts = new EventTarget() as EventTarget & { status: string };
    fonts.status = "loaded";
    Object.defineProperty(document, "fonts", {
      value: fonts,
      configurable: true,
    });
    try {
      const f = fixture();
      f.sample("value", "rendered");
      const first = await f.controller.autoSizeColumns();
      factor = 12;
      fonts.dispatchEvent(new Event("loadingdone"));
      const next = await f.controller.autoSizeColumns();
      expect(next.measured[0].width).toBeGreaterThan(first.measured[0].width);
      const pending = f.controller.autoSizeColumns();
      fonts.status = "loading";
      fonts.dispatchEvent(new Event("loading"));
      expect((await pending).cancelReason).toBe("fonts");
      expect((await f.controller.autoSizeColumns()).cancelReason).toBe("fonts");
    } finally {
      if (descriptor) Object.defineProperty(document, "fonts", descriptor);
      else Reflect.deleteProperty(document, "fonts");
    }
  });
  it("snapshots safe own-property widths and resets manual overrides with one publication", async () => {
    const f = fixture([
      { id: "__proto__", field: "value", width: 160 },
      { id: "value", field: "value", width: 160 },
    ]);
    f.sample("__proto__", "own");
    f.sample("value", "own");
    await f.controller.autoSizeColumns();
    const snapshot = f.controller.getWidths();
    expect(Object.hasOwn(snapshot, "__proto__")).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    const write = vi.spyOn(f.model, "setState");
    f.controller.resetWidths(["__proto__"]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(f.model.getState().columnWidths, "__proto__")).toBe(
      false,
    );
    expect(Object.hasOwn(f.model.getState().columnWidths, "value")).toBe(true);
    f.controller.resetWidths();
    expect(Object.keys(f.model.getState().columnWidths)).toEqual([]);
  });
  it("cancels while busy and rejects malformed target arrays before any width write", async () => {
    const f = fixture();
    f.sample("value", "rendered");
    f.busy();
    const write = vi.spyOn(f.model, "setState");
    expect((await f.controller.autoSizeColumns()).cancelReason).toBe("busy");
    await expect(
      f.controller.autoSizeColumns(["value", "value"]),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it("keeps literal markup as text and cancels pending measurements when overrides are reset", async () => {
    const f = fixture();
    f.sample("value", "<img src=x onerror=alert(1)>");
    await f.controller.autoSizeColumns();
    expect(document.querySelector("img")).toBeNull();
    const write = vi.spyOn(f.model, "setState"),
      pending = f.controller.autoSizeColumns();
    f.controller.resetWidths();
    const report = await pending;
    expect(report.cancelReason).toBe("view");
    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.keys(f.model.getState().columnWidths)).toEqual([]);
  });
});
