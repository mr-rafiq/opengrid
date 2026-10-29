import { describe, expect, it, vi } from "vitest";
import { CellNotesStore, createCellNotesStore } from "./notes";
const p = (rowId: string, columnId: string) => ({ rowId, columnId });
const document = (notes: unknown[], version = 1) =>
  JSON.stringify({ version, notes });
describe("cell notes", () => {
  it("stores, updates and deletes plain text by stable cell identity", () => {
    const notes = createCellNotesStore();
    notes.set(p("a", "x"), "First");
    expect(notes.get(p("a", "x"))).toBe("First");
    notes.set(p("a", "x"), "Updated");
    expect(notes.getSnapshot().notes).toEqual([
      { rowId: "a", columnId: "x", text: "Updated" },
    ]);
    expect(notes.delete(p("a", "x"))).toBe(true);
    expect(notes.get(p("a", "x"))).toBeUndefined();
    expect(notes.delete(p("a", "x"))).toBe(false);
  });
  it("does not collide delimiter-bearing or prototype-like IDs", () => {
    const notes = new CellNotesStore();
    notes.set(p("a|b", "c"), "One");
    notes.set(p("a", "b|c"), "Two");
    notes.set(p("__proto__", "constructor"), "Safe");
    expect(notes.get(p("a|b", "c"))).toBe("One");
    expect(notes.get(p("a", "b|c"))).toBe("Two");
    expect(notes.get(p("__proto__", "constructor"))).toBe("Safe");
    expect({}.constructor).toBe(Object);
  });
  it("keeps old snapshots immutable and stable until a real change", () => {
    const notes = createCellNotesStore();
    const empty = notes.getSnapshot();
    expect(notes.getSnapshot()).toBe(empty);
    notes.set(p("a", "x"), "First");
    const first = notes.getSnapshot();
    notes.set(p("a", "x"), "First");
    expect(notes.getSnapshot()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.notes)).toBe(true);
    expect(Object.isFrozen(first.notes[0])).toBe(true);
    notes.set(p("a", "x"), "Second");
    expect(first.notes[0].text).toBe("First");
    expect(empty.notes).toEqual([]);
  });
  it("does not expose mutable backing maps as JavaScript properties", () => {
    const notes = createCellNotesStore();
    notes.set(p("a", "x"), "Text");
    expect(Object.values(notes).some((value) => value instanceof Map)).toBe(
      false,
    );
    expect((notes as unknown as { values?: unknown }).values).toBeUndefined();
  });
  it("notifies once per mutation and not on idempotent operations", () => {
    const notes = createCellNotesStore();
    const listener = vi.fn();
    const stop = notes.subscribe(listener);
    notes.set(p("a", "x"), "First");
    notes.set(p("a", "x"), "First");
    notes.delete(p("missing", "x"));
    expect(listener).toHaveBeenCalledTimes(1);
    notes.clear();
    notes.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    notes.set(p("a", "x"), "After");
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("preserves markup, multiline text, quotes and formulas as inert strings", () => {
    const notes = createCellNotesStore();
    const text =
      '<script>globalThis.alert(1)</script>\n<img src=x onerror=alert(1)>\n=SUM(1,2)\t"quoted"';
    notes.set(p("a", "x"), text);
    const restored = createCellNotesStore();
    restored.importJson(notes.exportJson());
    expect(restored.get(p("a", "x"))).toBe(text);
    expect(restored.getSnapshot().notes[0].text).toBe(text);
  });
  it("supports an empty note separately from deletion", () => {
    const notes = createCellNotesStore();
    notes.set(p("a", "x"), "");
    expect(notes.get(p("a", "x"))).toBe("");
    expect(notes.getSnapshot().notes).toHaveLength(1);
  });
  it.each([
    { rowId: "", columnId: "x" },
    { rowId: "a", columnId: "" },
    { rowId: 1, columnId: "x" },
    { rowId: "a", columnId: null },
  ])("rejects invalid cell identity %j", (position) => {
    const notes = createCellNotesStore();
    expect(() =>
      notes.set(
        position as unknown as { rowId: string; columnId: string },
        "text",
      ),
    ).toThrow();
    expect(notes.getSnapshot().notes).toEqual([]);
  });
  it("bounds IDs, text and count atomically while permitting updates at capacity", () => {
    const notes = createCellNotesStore({
      maxNotes: 1,
      maxTextLength: 5,
      maxIdLength: 3,
    });
    notes.set(p("a", "x"), "First");
    expect(() => notes.set(p("b", "y"), "Other")).toThrow("count");
    expect(() => notes.set(p("a", "x"), "Too long")).toThrow("character");
    expect(() => notes.set(p("long", "x"), "Text")).toThrow("ID length");
    expect(() => notes.set(p("a", "x"), 12 as unknown as string)).toThrow(
      TypeError,
    );
    expect(notes.get(p("a", "x"))).toBe("First");
    notes.set(p("a", "x"), "Next");
    expect(notes.get(p("a", "x"))).toBe("Next");
  });
  it("accounts for escaped JSON characters in the serialization bound", () => {
    const value = { rowId: "a", columnId: "x", text: '\n"\\' };
    const size = document([value]).length;
    const notes = createCellNotesStore({ maxSerializedLength: size });
    notes.set(p("a", "x"), value.text);
    expect(notes.exportJson()).toHaveLength(size);
    expect(() => notes.set(p("a", "x"), value.text + "!")).toThrow(
      "serialized",
    );
    expect(notes.get(p("a", "x"))).toBe(value.text);
    notes.delete(p("a", "x"));
    notes.set(p("b", "y"), value.text);
    expect(notes.exportJson()).toHaveLength(size);
  });
  it("round-trips a versioned snapshot and replaces existing notes in one notification", () => {
    const notes = createCellNotesStore();
    notes.set(p("old", "x"), "Old");
    const listener = vi.fn();
    notes.subscribe(listener);
    const json = document([
      { rowId: "a", columnId: "x", text: "One" },
      { rowId: "b", columnId: "y", text: "Two" },
    ]);
    notes.importJson(json);
    expect(notes.get(p("old", "x"))).toBeUndefined();
    expect(JSON.parse(notes.exportJson())).toEqual(JSON.parse(json));
    expect(listener).toHaveBeenCalledTimes(1);
    notes.importJson(json);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it.each([
    "not JSON",
    "null",
    "[]",
    JSON.stringify({ notes: [] }),
    document([], 2),
    JSON.stringify({ version: 1, notes: {} }),
    JSON.stringify({ version: 1, notes: [], extra: true }),
    document([null]),
    document([{ rowId: "a", columnId: "x", text: 4 }]),
    document([{ rowId: "a", columnId: "x", text: "One", html: true }]),
    document([
      { rowId: "a", columnId: "x", text: "One" },
      { rowId: "a", columnId: "x", text: "Two" },
    ]),
  ])("rejects malformed/unsupported imports atomically: %s", (json) => {
    const notes = createCellNotesStore();
    notes.set(p("existing", "x"), "Keep");
    const snapshot = notes.getSnapshot();
    const listener = vi.fn();
    notes.subscribe(listener);
    expect(() => notes.importJson(json)).toThrow();
    expect(notes.getSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });
  it("validates all imported entries before committing any of them", () => {
    const notes = createCellNotesStore({ maxTextLength: 4 });
    notes.set(p("a", "x"), "Keep");
    const before = notes.getSnapshot();
    expect(() =>
      notes.importJson(
        document([
          { rowId: "b", columnId: "y", text: "Good" },
          { rowId: "c", columnId: "z", text: "Too long" },
        ]),
      ),
    ).toThrow();
    expect(notes.getSnapshot()).toBe(before);
  });
  it("rejects count and serialized-length excesses before replacing notes", () => {
    const notes = createCellNotesStore({
      maxNotes: 1,
      maxSerializedLength: 120,
    });
    notes.set(p("a", "x"), "Keep");
    const before = notes.getSnapshot();
    expect(() =>
      notes.importJson(
        document([
          { rowId: "b", columnId: "x", text: "One" },
          { rowId: "c", columnId: "x", text: "Two" },
        ]),
      ),
    ).toThrow("count");
    expect(() => notes.importJson(" ".repeat(121))).toThrow("serialized");
    expect(notes.getSnapshot()).toBe(before);
  });
  it("allows prototype-looking IDs on import without merging object properties", () => {
    const notes = createCellNotesStore();
    notes.importJson(
      document([{ rowId: "__proto__", columnId: "toString", text: "Literal" }]),
    );
    expect(notes.get(p("__proto__", "toString"))).toBe("Literal");
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "text")).toBe(
      false,
    );
  });
  it("prunes only on explicit request and notifies once", () => {
    const notes = createCellNotesStore();
    notes.set(p("a", "x"), "Keep");
    notes.set(p("b", "x"), "Removed row");
    notes.set(p("a", "y"), "Removed column");
    const listener = vi.fn();
    notes.subscribe(listener);
    expect(notes.prune(["a"], ["x"])).toBe(2);
    expect(notes.getSnapshot().notes).toEqual([
      { rowId: "a", columnId: "x", text: "Keep" },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(notes.prune(["a"], ["x"])).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("validates pruning inputs before deleting existing notes", () => {
    const notes = createCellNotesStore();
    notes.set(p("a", "x"), "Keep");
    expect(() => notes.prune(["a", 1 as unknown as string], ["x"])).toThrow();
    expect(notes.get(p("a", "x"))).toBe("Keep");
    expect(() => notes.prune("a", ["x"])).toThrow("collections");
    expect(notes.get(p("a", "x"))).toBe("Keep");
  });
  it.each([
    { maxNotes: 0 },
    { maxTextLength: -1 },
    { maxIdLength: NaN },
    { maxSerializedLength: 10 },
    { maxNotes: 1.5 },
  ])("rejects invalid configuration %j", (options) =>
    expect(() => createCellNotesStore(options)).toThrow(RangeError),
  );
});
