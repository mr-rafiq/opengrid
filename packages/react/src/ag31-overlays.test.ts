import { expect, it, vi } from "vitest";
import { createAg31Overlays, assertAg31LocaleText } from "./ag31-overlays";
import { createAg31ClientController } from "./ag31-client-controller";
it("tracks manual, automatic, suppressed and destroyed overlay states independently", () => {
  const flags = { suppressLoadingOverlay: false, suppressNoRowsOverlay: false },
    overlay = createAg31Overlays({
      rowCount: 0,
      initiallyLoading: true,
      flags: () => flags,
    }),
    changed = vi.fn();
  overlay.subscribe(changed);
  const service = overlay.service;
  expect(overlay.getSnapshot().kind).toBe("loading");
  overlay.showLoading();
  expect(changed).not.toHaveBeenCalled();
  overlay.hide();
  expect(overlay.getSnapshot().kind).toBeNull();
  overlay.dataUpdated(2);
  overlay.showLoading();
  expect(overlay.getSnapshot().kind).toBe("loading");
  overlay.dataUpdated(0);
  expect(overlay.getSnapshot().kind).toBe("noRows");
  flags.suppressLoadingOverlay = true;
  overlay.showLoading();
  expect(overlay.getSnapshot().kind).toBe("noRows");
  flags.suppressNoRowsOverlay = true;
  overlay.hide();
  overlay.showNoRows();
  expect(overlay.getSnapshot().kind).toBeNull();
  overlay.dataUpdated(0);
  expect(overlay.getSnapshot().kind).toBeNull();
  const calls = changed.mock.calls.length;
  overlay.destroy();
  expect(service.isAlive()).toBe(false);
  overlay.showLoading();
  overlay.invalidate();
  expect(changed).toHaveBeenCalledTimes(calls);
});
it("keeps null and undefined data options resident while an explicit empty array clears rows", () => {
  vi.useFakeTimers();
  const rows = [
      { id: "a", value: 8 },
      { id: "b", value: 2 },
    ],
    controller = createAg31ClientController({
      rows,
      rowData: rows,
      definitions: [{ field: "value" }],
      getRowId: (r) => r.id,
    }),
    { api, model, overlays } = controller;
  try {
    const node = api.getRowNode("a"),
      updated = vi.fn();
    vi.runOnlyPendingTimers();
    api.addEventListener("rowDataUpdated", updated);
    model.selectRows(["a"]);
    api.showLoadingOverlay();
    const state = model.getState(),
      projection = model.getRowModel();
    api.setGridOption("rowData", null);
    api.setGridOption("rowData", undefined);
    expect(api.getGridOption("rowData")).toBeUndefined();
    expect(model.getState()).toBe(state);
    expect(model.getRowModel()).toEqual(projection);
    expect(api.getRowNode("a")).toBe(node);
    expect(api.getSelectedRows()).toEqual([rows[0]]);
    expect(overlays.getSnapshot().kind).toBe("loading");
    vi.runOnlyPendingTimers();
    expect(updated).not.toHaveBeenCalled();
    api.setGridOption("rowData", []);
    expect(api.getDisplayedRowCount()).toBe(0);
    expect(overlays.getSnapshot().kind).toBe("noRows");
    vi.runOnlyPendingTimers();
    expect(updated).toHaveBeenCalledTimes(1);
    api.hideOverlay();
    expect(overlays.getSnapshot().kind).toBeNull();
    api.destroy();
    expect(api.overlayService.isAlive()).toBe(false);
  } finally {
    api.destroy();
    vi.useRealTimers();
  }
});
it("requires bounded plain locale messages and never evaluates accessors", () => {
  const read = vi.fn();
  expect(() =>
    assertAg31LocaleText(
      Object.defineProperty({}, "loadingOoo", { get: read, enumerable: true }),
    ),
  ).toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(() =>
    assertAg31LocaleText({ loadingOoo: "Loading synthetic data" }),
  ).not.toThrow();
  expect(() => assertAg31LocaleText({ noRowsToShow: 123 })).toThrow();
});
