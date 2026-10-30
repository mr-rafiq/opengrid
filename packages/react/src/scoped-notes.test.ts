import { describe, expect, it, vi } from "vitest";
import { CellNotesStore } from "@opengrid/core";
import { ScopedNotesStore } from "./scoped-notes.js";
const cell = (rowId = "same", columnId = "name") => ({ rowId, columnId });
const root = (options: ConstructorParameters<typeof CellNotesStore>[0] = {}) =>
  new CellNotesStore({ maxIdLength: 16_000_000, ...options });
const json = (notes: { rowId: string; columnId: string; text: string }[]) =>
  JSON.stringify({ version: 1, notes });
describe("bounded namespace views for notes", () => {
  it("isolates identical public IDs and restores annotations when a scope is revisited", () => {
    const parent = root(),
      first = new ScopedNotesStore(parent, "root"),
      second = new ScopedNotesStore(parent, "East");
    first.set(cell(), "Root note");
    expect(second.get(cell())).toBeUndefined();
    second.set(cell(), "East note");
    expect(first.get(cell())).toBe("Root note");
    expect(second.get(cell())).toBe("East note");
    expect(new ScopedNotesStore(parent, "root").get(cell())).toBe("Root note");
    expect(first.getSnapshot().notes).toEqual([
      { ...cell(), text: "Root note" },
    ]);
  });
  it("uses collision-safe tuples for quoted scopes and prototype-like public IDs", () => {
    const parent = root(),
      a = new ScopedNotesStore(parent, '["x","y"]'),
      b = new ScopedNotesStore(parent, '["x,y"]');
    const position = cell("__proto__", 'constructor["x"]');
    a.set(position, "A");
    b.set(position, "B");
    expect(a.get(position)).toBe("A");
    expect(b.get(position)).toBe("B");
    const c = new ScopedNotesStore(parent, 'quote"\\\n');
    c.set(cell("\ud800"), "C");
    expect(c.get(cell("\ud800"))).toBe("C");
    expect(parent.getSnapshot().notes).toHaveLength(3);
  });
  it("enforces one global count quota without removing either scope on rejection", () => {
    const parent = root({ maxNotes: 2 }),
      a = new ScopedNotesStore(parent, "A"),
      b = new ScopedNotesStore(parent, "B");
    a.set(cell(), "A");
    b.set(cell(), "B");
    const before = parent.getSnapshot(),
      changed = vi.fn();
    parent.subscribe(changed);
    expect(() => a.set(cell("other"), "Excess")).toThrow(/count limit/);
    expect(parent.getSnapshot()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    expect(a.get(cell())).toBe("A");
    expect(b.get(cell())).toBe("B");
  });
  it("counts encoded namespaces toward the shared serialized quota", () => {
    const parent = root({ maxSerializedLength: 256 }),
      a = new ScopedNotesStore(parent, "A".repeat(100)),
      b = new ScopedNotesStore(parent, "B".repeat(100));
    a.set(cell(), "A");
    const before = parent.getSnapshot();
    expect(parent.exportJson().length).toBeLessThanOrEqual(256);
    expect(() => b.set(cell(), "B")).toThrow(/serialized/);
    expect(parent.getSnapshot()).toBe(before);
    expect(a.get(cell())).toBe("A");
    expect(b.get(cell())).toBeUndefined();
  });
  it("atomically replaces only the selected scope and leaves other snapshot identities intact", () => {
    const parent = root(),
      a = new ScopedNotesStore(parent, "A"),
      b = new ScopedNotesStore(parent, "B");
    a.set(cell(), "Old A");
    b.set(cell(), "B");
    const other = b.getSnapshot();
    a.importJson(json([{ ...cell("new"), text: "New A" }]));
    expect(a.get(cell())).toBeUndefined();
    expect(a.get(cell("new"))).toBe("New A");
    expect(b.get(cell())).toBe("B");
    expect(b.getSnapshot()).toBe(other);
  });
  it("rejects an over-quota scoped import before publishing a partial replacement", () => {
    const parent = root({ maxNotes: 3 }),
      a = new ScopedNotesStore(parent, "A"),
      b = new ScopedNotesStore(parent, "B");
    a.set(cell(), "Old A");
    b.set(cell(), "B");
    const before = parent.getSnapshot(),
      changed = vi.fn();
    parent.subscribe(changed);
    expect(() =>
      a.importJson(
        json(
          [0, 1, 2].map((index) => ({ ...cell(String(index)), text: "New" })),
        ),
      ),
    ).toThrow(/count limit/);
    expect(parent.getSnapshot()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    expect(a.get(cell())).toBe("Old A");
    expect(b.get(cell())).toBe("B");
  });
  it("rejects duplicate or oversized imports without touching the global store", () => {
    const parent = root({ maxSerializedLength: 512 }),
      a = new ScopedNotesStore(parent, "A");
    a.set(cell(), "Old");
    const before = parent.getSnapshot();
    expect(() =>
      a.importJson(
        json([
          { ...cell(), text: "One" },
          { ...cell(), text: "Two" },
        ]),
      ),
    ).toThrow(/Duplicate/);
    expect(() => a.importJson(" ".repeat(513))).toThrow(/serialized/);
    expect(parent.getSnapshot()).toBe(before);
  });
  it("clear and prune preserve other namespaces and publish at most one change", () => {
    const parent = root(),
      a = new ScopedNotesStore(parent, "A"),
      b = new ScopedNotesStore(parent, "B");
    a.set(cell("one"), "One");
    a.set(cell("two"), "Two");
    b.set(cell(), "B");
    const changed = vi.fn();
    parent.subscribe(changed);
    expect(a.prune(["one"], ["name"])).toBe(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(a.get(cell("one"))).toBe("One");
    expect(a.get(cell("two"))).toBeUndefined();
    a.clear();
    expect(changed).toHaveBeenCalledTimes(2);
    a.clear();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(b.get(cell())).toBe("B");
  });
  it("has frozen stable snapshots and releases delegated subscriptions", () => {
    const parent = root(),
      a = new ScopedNotesStore(parent, "A"),
      b = new ScopedNotesStore(parent, "B"),
      initial = a.getSnapshot(),
      changed = vi.fn(),
      stop = a.subscribe(changed);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.notes)).toBe(true);
    b.set(cell(), "B");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(a.getSnapshot()).toBe(initial);
    stop();
    a.set(cell(), "A");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(a.getSnapshot()).not.toBe(initial);
    expect(Object.isFrozen(a.getSnapshot().notes[0])).toBe(true);
  });
  it("exports original IDs and imports that document into another independent scope", () => {
    const parent = root(),
      a = new ScopedNotesStore(parent, "A"),
      b = new ScopedNotesStore(parent, "B");
    a.set(cell("__proto__"), "A");
    expect(JSON.parse(a.exportJson())).toEqual({
      version: 1,
      notes: [{ ...cell("__proto__"), text: "A" }],
    });
    b.importJson(a.exportJson());
    expect(b.get(cell("__proto__"))).toBe("A");
    a.delete(cell("__proto__"));
    expect(b.get(cell("__proto__"))).toBe("A");
  });
  it("preserves unrelated non-encoded entries in a supplied backing store", () => {
    const parent = root();
    parent.set(cell("outside"), "Outside");
    const a = new ScopedNotesStore(parent, "A");
    a.set(cell(), "A");
    a.clear();
    expect(parent.get(cell("outside"))).toBe("Outside");
    expect(a.getSnapshot().notes).toEqual([]);
  });
  it("keeps unreadable oversized namespaces silent until an attempted write", () => {
    const parent = root({ maxIdLength: 128 }),
      a = new ScopedNotesStore(parent, "A".repeat(200)),
      before = parent.getSnapshot();
    expect(a.get(cell())).toBeUndefined();
    expect(a.delete(cell())).toBe(false);
    expect(a.getSnapshot().notes).toEqual([]);
    expect(() => a.set(cell(), "A")).toThrow(/scope.*limit/);
    expect(parent.getSnapshot()).toBe(before);
  });
  it("retains normal public ID and text limits instead of exposing encoded storage limits", () => {
    const parent = root(),
      a = new ScopedNotesStore(parent, "A");
    expect(a.maxIdLength).toBe(1024);
    expect(() => a.get(cell("x".repeat(1025)))).toThrow(/ID length/);
    expect(() => a.set(cell(), "x".repeat(10001))).toThrow(/character limit/);
    expect(parent.getSnapshot().notes).toEqual([]);
  });
  it("does not republish an identical scoped import", () => {
    const parent = root(),
      a = new ScopedNotesStore(parent, "A");
    a.set(cell(), "A");
    const before = parent.getSnapshot(),
      changed = vi.fn();
    parent.subscribe(changed);
    a.importJson(a.exportJson());
    expect(parent.getSnapshot()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
  });
});
