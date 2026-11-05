import { expect, it, vi } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import type { DataGridSizingController } from "./column-sizing.js";

function fixture() {
  const definitions = [{ field: "id" }, { field: "name" }];
  const owner = createAg31ClientController({
    rows: [{ id: "a", name: "First" }],
    definitions,
    getRowId: (row) => row.id,
  });
  const autoSizeColumns = vi
    .fn<DataGridSizingController["autoSizeColumns"]>()
    .mockResolvedValue({
      measured: [],
      unchanged: [],
      skipped: [],
      cancelled: false,
    });
  const port: DataGridSizingController = {
    autoSizeColumns,
    sizeColumnsToFit: vi.fn(),
    getWidths: () => ({}),
    resetWidths() {},
  };
  return { owner, definitions, autoSizeColumns, port };
}
it("resolves real source identities, deduplicates keys and forwards the measured header policy", async () => {
  const f = fixture();
  f.owner.sizingServices.attach(() => f.port);
  const column = f.owner.api.getColumn("name")!;
  await f.owner.api.autoSizeColumns(
    ["name", column, f.definitions[1], "missing"],
    true,
  );
  expect(f.autoSizeColumns).toHaveBeenCalledExactlyOnceWith(["name"], {
    contentMode: "rendered-dom",
    extraPadding: 20,
    includeHeader: false,
    signal: expect.any(AbortSignal),
  });
  await f.owner.columnApi.autoSizeAllColumns();
  expect(f.autoSizeColumns).toHaveBeenLastCalledWith(["id", "name"], {
    contentMode: "rendered-dom",
    extraPadding: 20,
    includeHeader: true,
    signal: expect.any(AbortSignal),
  });
  f.owner.api.destroy();
});
it("binds fit to the mounted port, preserves suppressed ownership and revokes retired views", () => {
  const owner = createAg31ClientController({
    rows: [{ id: "a" }],
    definitions: [
      { field: "id", suppressSizeToFit: true },
      { colId: "value", flex: 1 },
    ],
    getRowId: (row) => row.id,
  });
  const fit = vi
    .fn<DataGridSizingController["sizeColumnsToFit"]>()
    .mockReturnValue({ cancelled: false, changedColumnIds: [] });
  expect(owner.api.sizeColumnsToFit().cancelReason).toBe("unavailable");
  const detach = owner.sizingServices.attach(() => ({
    sizeColumnsToFit: fit,
    autoSizeColumns: vi.fn(),
    getWidths: () => ({}),
    resetWidths() {},
  }));
  owner.api.sizeColumnsToFit();
  expect(fit).toHaveBeenCalledExactlyOnceWith({
    availableWidth: undefined,
    excludeColumnIds: ["id"],
    roundToPixels: true,
    freezeExcluded: false,
    skipIfAlreadyFits: true,
  });
  owner.api.sizeColumnsToFit(600);
  expect(fit).toHaveBeenLastCalledWith(
    expect.objectContaining({ availableWidth: 600 }),
  );
  expect(owner.api.sizeColumnsToFit(0).cancelReason).toBe("unavailable");
  expect(fit).toHaveBeenCalledTimes(2);
  detach();
  expect(owner.api.sizeColumnsToFit().cancelReason).toBe("unavailable");
  owner.api.destroy();
  expect(owner.api.sizeColumnsToFit().cancelReason).toBe("disposed");
});
it("uses the source default minimum and reports manual flex ownership", () => {
  const owner = createAg31ClientController({
    rows: [],
    definitions: [{ field: "id", flex: 1 }],
    getRowId: () => "",
  });
  expect(owner.model.getColumnDefinitions()[0].minWidth).toBe(20);
  expect(owner.api.getColumnState()![0].flex).toBe(1);
  owner.model.resizeColumn("id", 100);
  expect(owner.api.getColumnState()![0].flex).toBeNull();
  owner.api.destroy();
});
it("revokes detached and destroyed sizing without a fake width publication", async () => {
  const f = fixture();
  expect((await f.owner.api.autoSizeAllColumns()).cancelReason).toBe("view");
  const detach = f.owner.sizingServices.attach(() => f.port);
  f.owner.sizingServices.attach(() => f.port);
  detach();
  await f.owner.api.autoSizeAllColumns();
  expect(f.autoSizeColumns).toHaveBeenCalledTimes(1);
  f.owner.api.destroy();
  f.owner.sizingServices.attach(() => f.port);
  expect((await f.owner.api.autoSizeAllColumns()).cancelReason).toBe(
    "disposed",
  );
  expect(f.autoSizeColumns).toHaveBeenCalledTimes(1);
});
it("rejects accessor and unbounded requests before invoking the mounted port", () => {
  const f = fixture();
  f.owner.sizingServices.attach(() => f.port);
  const getter = vi.fn(() => "name");
  const keys: string[] = [];
  Object.defineProperty(keys, "0", { get: getter });
  expect(() => f.owner.api.autoSizeColumns(keys)).toThrow(/accessors/);
  expect(() => f.owner.api.autoSizeColumns(new Array(4097))).toThrow(/4096/);
  expect(() => f.owner.api.autoSizeColumns(["id"], null as never)).toThrow(
    /boolean/,
  );
  expect(getter).not.toHaveBeenCalled();
  expect(f.autoSizeColumns).not.toHaveBeenCalled();
  f.owner.api.destroy();
});
it("aborts an in-flight owned request synchronously on destroy, before React can unmount", async () => {
  const f = fixture();
  let signal: AbortSignal | undefined;
  f.autoSizeColumns.mockImplementation(async (_ids, options) => {
    signal = options?.signal;
    return {
      measured: [],
      unchanged: [],
      skipped: [],
      cancelled: signal?.aborted ?? false,
    };
  });
  f.owner.sizingServices.attach(() => f.port);
  const pending = f.owner.api.autoSizeAllColumns();
  f.owner.api.destroy();
  expect(signal?.aborted).toBe(true);
  await pending;
});
it("revokes replaced and detached requests while an old cleanup cannot cancel the new owner", async () => {
  const f = fixture();
  const signals: AbortSignal[] = [];
  f.autoSizeColumns.mockImplementation(async (_ids, options) => {
    signals.push(options!.signal!);
    return { measured: [], unchanged: [], skipped: [], cancelled: false };
  });
  const oldDetach = f.owner.sizingServices.attach(() => f.port);
  const old = f.owner.api.autoSizeAllColumns();
  const detach = f.owner.sizingServices.attach(() => f.port);
  expect(signals[0].aborted).toBe(true);
  const current = f.owner.api.autoSizeAllColumns();
  oldDetach();
  expect(signals[1].aborted).toBe(false);
  expect(() => f.owner.api.autoSizeColumns(["id"], null as never)).toThrow();
  expect(signals[1].aborted).toBe(false);
  detach();
  expect(signals[1].aborted).toBe(true);
  await Promise.all([old, current]);
  f.owner.api.destroy();
});

it("reports mounted flex widths while immediate manual widths win over a previous React commit", () => {
  const owner = createAg31ClientController({
    rows: [],
    definitions: [{ field: "id", flex: 1 }],
    getRowId: () => "",
  });
  const detach = owner.sizingServices.attach(() => ({
    getWidths: () => ({ id: 439 }),
    sizeColumnsToFit: vi.fn(),
    autoSizeColumns: vi.fn(),
    resetWidths() {},
  }));
  expect(owner.api.getColumn("id")!.getActualWidth()).toBe(439);
  expect(owner.api.getColumnState()![0].width).toBe(439);
  owner.model.resizeColumn("id", 123);
  expect(owner.api.getColumnState()![0].width).toBe(123);
  detach();
  expect(owner.sizingServices.getRenderedWidth("id")).toBeUndefined();
  owner.api.destroy();
  expect(owner.sizingServices.getRenderedWidth("id")).toBeUndefined();
});
