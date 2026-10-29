import { describe, expect, it, vi } from "vitest";
import { createGrid } from "./index";
import { createRowEditSession } from "./row-edit";
import type { Column, GridOptions } from "./types";

interface Product {
  id: string;
  name: string;
  quantity: number;
  price: number;
  active: boolean;
  minimum: number;
  maximum: number;
  when: Date;
  large: bigint;
  code: string;
}
const original: Product = {
  id: "a",
  name: "Apple",
  quantity: 5,
  price: 10,
  active: true,
  minimum: 5,
  maximum: 10,
  when: new Date("2026-01-01T00:00:00.123Z"),
  large: 9007199254740993n,
  code: "LOCKED",
};
const columns: Column<Product>[] = [
  { id: "id", field: "id", editable: true },
  {
    id: "name",
    field: "name",
    editable: true,
    valueParser: (value) => String(value).trim(),
    validate: (value) => (value === "" ? "Name required" : undefined),
    valueFormatter: (value) => `Label: ${value}`,
  },
  {
    id: "quantity",
    field: "quantity",
    type: "number",
    editable: true,
    validate: (value) =>
      Number(value) < 0 ? "Quantity cannot be negative" : undefined,
  },
  { id: "price", field: "price", type: "number", editable: true },
  { id: "active", field: "active", type: "boolean", editable: true },
  {
    id: "minimum",
    field: "minimum",
    type: "number",
    editable: true,
    validate: (value, row) =>
      Number(value) > row.maximum ? "Minimum exceeds maximum" : undefined,
  },
  {
    id: "maximum",
    field: "maximum",
    type: "number",
    editable: true,
    validate: (value, row) =>
      Number(value) < row.minimum ? "Maximum below minimum" : undefined,
  },
  { id: "when", field: "when", type: "date", editable: true },
  { id: "large", field: "large", type: "bigint", editable: true },
  { id: "code", field: "code" },
  {
    id: "calculated",
    editable: true,
    valueGetter: (row) => row.quantity * row.price,
  },
  { id: "action", editable: true },
];
function grid(patch: Partial<GridOptions<Product>> = {}) {
  return createGrid({
    rows: [original, { ...original, id: "b", name: "Banana" }],
    columns,
    getRowId: (row) => row.id,
    ...patch,
  });
}

describe("local row drafts", () => {
  it("captures raw editable fields only without calling value getters or subscribing to the model", () => {
    const getter = vi.fn((row: Product) => row.quantity * row.price),
      model = grid({
        columns: columns.map((column) =>
          column.id === "calculated"
            ? { ...column, valueGetter: getter }
            : column,
        ),
      });
    const subscribe = vi.spyOn(model, "subscribe"),
      session = createRowEditSession(model, "a"),
      snapshot = session.getSnapshot();
    expect(snapshot.rowId).toBe("a");
    expect(snapshot.status).toBe("editing");
    expect(snapshot.values.name).toBe("Apple");
    expect(snapshot.values.quantity).toBe(5);
    expect(Object.keys(snapshot.values)).toEqual([
      "id",
      "name",
      "quantity",
      "price",
      "active",
      "minimum",
      "maximum",
      "when",
      "large",
    ]);
    expect(snapshot.dirtyColumns).toEqual([]);
    expect(getter).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("stages several fields locally and publishes frozen stable snapshots", () => {
    const model = grid(),
      listener = vi.fn(),
      session = createRowEditSession(model, "a");
    session.subscribe(listener);
    const before = session.getSnapshot();
    expect(session.getSnapshot()).toBe(before);
    session.setValue("quantity", "20");
    session.setValue("name", " New name ");
    expect(model.getRow("a")).toBe(original);
    expect(session.getSnapshot().values).toMatchObject({
      quantity: "20",
      name: " New name ",
    });
    expect(session.getSnapshot().dirtyColumns).toEqual(["name", "quantity"]);
    expect(Object.isFrozen(session.getSnapshot())).toBe(true);
    expect(Object.isFrozen(session.getSnapshot().values)).toBe(true);
    expect(Object.isFrozen(session.getSnapshot().dirtyColumns)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("marks only changed raw values dirty and clears dirty flags when restored", () => {
    const model = grid(),
      session = createRowEditSession(model, "a"),
      before = session.getSnapshot();
    session.setValue("quantity", 5);
    session.setValue("when", new Date(original.when.getTime()));
    session.setValue("large", 9007199254740993n);
    expect(session.getSnapshot()).toBe(before);
    session.setValue("quantity", 7);
    expect(session.getSnapshot().dirtyColumns).toEqual(["quantity"]);
    session.setValue("quantity", 5);
    expect(session.getSnapshot().dirtyColumns).toEqual([]);
  });
  it("rejects unknown, read-only, computed and fieldless columns without changing drafts", () => {
    const session = createRowEditSession(grid(), "a");
    for (const id of ["missing", "code", "calculated", "action"]) {
      expect(session.setValue(id, "bad")).toMatch(/Unknown column|read only/);
      expect(session.getSnapshot().dirtyColumns).toEqual([]);
      expect(session.getSnapshot().values.name).toBe("Apple");
    }
    session.setValue("name", "Good");
    expect(session.getSnapshot().error).toBeUndefined();
  });
  it("keeps Date input and returned snapshot Date mutations out of the internal draft", () => {
    const model = grid(),
      session = createRowEditSession(model, "a"),
      next = new Date("2026-02-01T00:00:00.456Z");
    session.setValue("when", next);
    next.setUTCFullYear(2040);
    (session.getSnapshot().values.when as Date).setUTCFullYear(2050);
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")?.when.toISOString()).toBe(
      "2026-02-01T00:00:00.456Z",
    );
    expect(original.when.toISOString()).toBe("2026-01-01T00:00:00.123Z");
  });
  it("supports column IDs that differ from fields and prototype-like IDs safely", () => {
    const model = grid({
        columns: [{ id: "__proto__", field: "name", editable: true }],
      }),
      session = createRowEditSession(model, "a");
    expect(Object.hasOwn(session.getSnapshot().values, "__proto__")).toBe(true);
    session.setValue("__proto__", "Updated");
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")?.name).toBe("Updated");
    expect({}).not.toHaveProperty("Updated");
  });
});

describe("atomic commit and lifecycle", () => {
  it("commits parsed edits in one batch, one model notification and one undo unit", () => {
    const model = grid(),
      batch = vi.spyOn(model, "batchEdit"),
      changed = vi.fn();
    model.subscribe(changed);
    const session = createRowEditSession(model, "a");
    session.setValue("name", " Pear ");
    session.setValue("quantity", "20");
    session.setValue("active", "false");
    expect(session.commit()).toBeUndefined();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(model.getRow("a")).toMatchObject({
      name: "Pear",
      quantity: 20,
      active: false,
    });
    expect(session.getSnapshot()).toMatchObject({
      status: "committed",
      dirtyColumns: [],
      values: { name: "Pear", quantity: 20, active: false },
    });
    expect(model.undo()).toBe(true);
    expect(model.getRow("a")).toBe(original);
    expect(model.undo()).toBe(false);
  });
  it("validates cross-field constraints against the complete final row independent of staging order", () => {
    const model = grid(),
      session = createRowEditSession(model, "a");
    session.setValue("minimum", "20");
    session.setValue("maximum", "30");
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")).toMatchObject({ minimum: 20, maximum: 30 });
    const next = createRowEditSession(model, "a");
    next.setValue("maximum", "40");
    next.setValue("minimum", "35");
    expect(next.commit()).toBeUndefined();
    expect(model.getRow("a")).toMatchObject({ minimum: 35, maximum: 40 });
  });
  it("retains the draft on final-row validation failure without writes, notifications or history", () => {
    const model = grid(),
      session = createRowEditSession(model, "a"),
      changed = vi.fn();
    model.subscribe(changed);
    session.setValue("minimum", 40);
    session.setValue("maximum", 30);
    expect(session.commit()).toBe("Minimum exceeds maximum");
    expect(session.getSnapshot()).toMatchObject({
      status: "editing",
      values: { minimum: 40, maximum: 30 },
      error: "Minimum exceeds maximum",
    });
    expect(model.getRow("a")).toBe(original);
    expect(changed).not.toHaveBeenCalled();
    expect(model.undo()).toBe(false);
    session.setValue("maximum", 50);
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")).toMatchObject({ minimum: 40, maximum: 50 });
  });
  it("surfaces parser failures and retries after correction without partially applying other fields", () => {
    const parser = vi.fn((value: unknown) => {
      if (value === "bad") throw new Error("Parser rejected");
      return String(value).trim();
    });
    const model = grid({
        columns: columns.map((column) =>
          column.id === "name" ? { ...column, valueParser: parser } : column,
        ),
      }),
      session = createRowEditSession(model, "a");
    session.setValue("quantity", 99);
    session.setValue("name", "bad");
    expect(session.commit()).toBe("Parser rejected");
    expect(model.getRow("a")).toBe(original);
    expect(model.undo()).toBe(false);
    session.setValue("name", " Good ");
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")).toMatchObject({ name: "Good", quantity: 99 });
  });
  it("does not mutate or create history for unchanged or parser-normalized no-op commits", () => {
    const model = grid(),
      changed = vi.fn();
    model.subscribe(changed);
    const batch = vi.spyOn(model, "batchEdit"),
      session = createRowEditSession(model, "a"),
      before = model.getState();
    expect(session.commit()).toBeUndefined();
    expect(batch).not.toHaveBeenCalled();
    expect(session.getSnapshot().status).toBe("committed");
    expect(model.getState()).toBe(before);
    const normalized = createRowEditSession(model, "a");
    normalized.setValue("quantity", "5");
    expect(normalized.commit()).toBeUndefined();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(model.getRow("a")).toBe(original);
    expect(changed).not.toHaveBeenCalled();
    expect(model.undo()).toBe(false);
  });
  it("cancels locally, restores draft baseline and closes the session permanently", () => {
    const model = grid(),
      batch = vi.spyOn(model, "batchEdit"),
      session = createRowEditSession(model, "a");
    session.setValue("name", "Draft");
    session.cancel();
    const cancelled = session.getSnapshot();
    expect(cancelled).toMatchObject({
      status: "cancelled",
      values: { name: "Apple" },
      dirtyColumns: [],
    });
    expect(session.commit()).toContain("cancelled");
    expect(session.setValue("name", "Other")).toContain("cancelled");
    session.cancel();
    expect(session.getSnapshot()).toBe(cancelled);
    expect(model.getRow("a")).toBe(original);
    expect(batch).not.toHaveBeenCalled();
    expect(model.undo()).toBe(false);
  });
  it("rejects changes/commits after successful commit and ignores later cancellation", () => {
    const session = createRowEditSession(grid(), "a");
    session.setValue("name", "New");
    session.commit();
    const committed = session.getSnapshot();
    expect(session.setValue("name", "Other")).toContain("committed");
    expect(session.commit()).toContain("committed");
    session.cancel();
    expect(session.getSnapshot()).toBe(committed);
  });
  it("preserves row ID protection", () => {
    const model = grid(),
      session = createRowEditSession(model, "a");
    session.setValue("id", "new");
    expect(session.commit()).toContain("row ID");
    expect(model.getRow("a")).toBe(original);
    expect(model.getRow("new")).toBeUndefined();
  });
  it("maintains filter, pinning, ordering and selection state while editing a filtered-out row", () => {
    const model = grid();
    model.pinColumn("quantity", "left");
    model.hideColumn("price", true);
    model.moveColumn("name", 0);
    model.setQuickFilter("Banana");
    model.selectRows(["a"]);
    const before = model.getState();
    const session = createRowEditSession(model, "a");
    session.setValue("quantity", "12");
    expect(session.commit()).toBeUndefined();
    expect(model.getState()).toEqual(before);
    expect(model.getFilteredRows().map((row) => row.id)).toEqual(["b"]);
    expect(model.getRow("a")?.quantity).toBe(12);
  });
  it("supports model rows with no editable fields as a no-op closed session", () => {
    const model = grid({ columns: [{ id: "name", field: "name" }] }),
      session = createRowEditSession(model, "a");
    expect(session.getSnapshot().values).toEqual({});
    expect(session.commit()).toBeUndefined();
    expect(session.getSnapshot().status).toBe("committed");
    expect(model.undo()).toBe(false);
  });
});

describe("concurrency and stable identity", () => {
  it("rejects changed dirty fields by default and leaves the external value intact", () => {
    const model = grid(),
      session = createRowEditSession(model, "a");
    session.setValue("quantity", "20");
    model.editCell("a", "quantity", 99);
    const batch = vi.spyOn(model, "batchEdit");
    expect(session.commit()).toContain("changed externally");
    expect(session.getSnapshot().status).toBe("editing");
    expect(model.getRow("a")?.quantity).toBe(99);
    expect(batch).not.toHaveBeenCalled();
  });
  it("merges external changes to untouched fields and displays current committed values", () => {
    const model = grid(),
      session = createRowEditSession(model, "a");
    session.setValue("quantity", "20");
    model.editCell("a", "name", "External");
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")).toMatchObject({ name: "External", quantity: 20 });
    expect(session.getSnapshot().values).toMatchObject({
      name: "External",
      quantity: 20,
    });
  });
  it("overwrites only dirty fields when explicitly requested", () => {
    const model = grid(),
      session = createRowEditSession(model, "a", {
        conflictPolicy: "overwrite",
      });
    session.setValue("quantity", 20);
    model.batchEdit([
      { rowId: "a", columnId: "quantity", value: 99 },
      { rowId: "a", columnId: "name", value: "External" },
    ]);
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")).toMatchObject({ quantity: 20, name: "External" });
  });
  it("compares Date timestamps and BigInt values precisely when checking conflicts", () => {
    const model = grid(),
      session = createRowEditSession(model, "a");
    session.setValue("when", new Date("2026-02-01T00:00:00Z"));
    session.setValue("large", 9007199254740994n);
    model.applyTransaction({
      update: [{ ...original, when: new Date(original.when.getTime()) }],
    });
    expect(session.commit()).toBeUndefined();
    expect(model.getRow("a")?.large).toBe(9007199254740994n);
    const next = createRowEditSession(model, "a");
    next.setValue("large", 9007199254740995n);
    model.editCell("a", "large", 9007199254740996n);
    expect(next.commit()).toContain("changed externally");
  });
  it("rejects deleted rows including unchanged drafts and overwrite mode", () => {
    const model = grid(),
      plain = createRowEditSession(model, "a"),
      overwrite = createRowEditSession(model, "a", {
        conflictPolicy: "overwrite",
      });
    overwrite.setValue("quantity", 9);
    model.applyTransaction({ remove: ["a"] });
    expect(plain.commit()).toContain("deleted");
    expect(overwrite.commit()).toContain("deleted");
    expect(model.getRow("a")).toBeUndefined();
    expect(overwrite.getSnapshot().status).toBe("editing");
  });
  it("keeps same-field aliases coherent and applies the last edited alias parser once", () => {
    const parser = vi.fn((value: unknown) => Number(value) + 1),
      model = grid({
        columns: [
          { id: "quantity", field: "quantity", editable: true },
          {
            id: "alias",
            field: "quantity",
            editable: true,
            valueParser: parser,
          },
        ],
      }),
      session = createRowEditSession(model, "a");
    session.setValue("quantity", 9);
    session.setValue("alias", 10);
    expect(session.getSnapshot().values).toEqual({ quantity: 10, alias: 10 });
    expect(session.commit()).toBeUndefined();
    expect(parser).toHaveBeenCalledTimes(1);
    expect(model.getRow("a")?.quantity).toBe(11);
    expect(session.getSnapshot().values).toEqual({ quantity: 11, alias: 11 });
  });
  it("supports local subscriptions and unsubscribe without eagerly observing model changes", () => {
    const model = grid(),
      session = createRowEditSession(model, "a"),
      listener = vi.fn(),
      unsubscribe = session.subscribe(listener),
      before = session.getSnapshot();
    model.editCell("a", "price", 99);
    expect(session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    session.setValue("name", "New");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    session.cancel();
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("rejects missing rows and unsupported conflict-policy configuration at creation", () => {
    const model = grid();
    expect(() => createRowEditSession(model, "missing")).toThrow(/missing row/);
    expect(() =>
      createRowEditSession(model, "a", {
        conflictPolicy: "unknown" as "reject",
      }),
    ).toThrow(TypeError);
  });
});
