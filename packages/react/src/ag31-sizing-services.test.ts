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
