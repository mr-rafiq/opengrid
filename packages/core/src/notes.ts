import type { CellPosition } from "./ranges.js";

export interface CellNote extends CellPosition {
  readonly text: string;
}
export interface CellNotesSnapshot {
  readonly version: 1;
  readonly notes: readonly CellNote[];
}
export interface CellNotesOptions {
  maxNotes?: number;
  maxTextLength?: number;
  maxIdLength?: number;
  maxSerializedLength?: number;
}
const emptySerializedLength = JSON.stringify({ version: 1, notes: [] }).length;
const noteKey = (position: CellPosition) =>
  JSON.stringify([position.rowId, position.columnId]);

/** Plain-text annotations independent of row fields. IDs use collision-safe tuples, not object keys. */
export class CellNotesStore {
  readonly #values = new Map<string, CellNote>();
  readonly #listeners = new Set<() => void>();
  #snapshot: CellNotesSnapshot | undefined;
  #entryLength = 0;
  readonly maxNotes: number;
  readonly maxTextLength: number;
  readonly maxIdLength: number;
  readonly maxSerializedLength: number;
  constructor(options: CellNotesOptions = {}) {
    this.maxNotes = options.maxNotes ?? 100000;
    this.maxTextLength = options.maxTextLength ?? 10000;
    this.maxIdLength = options.maxIdLength ?? 1024;
    this.maxSerializedLength = options.maxSerializedLength ?? 16000000;
    for (const [name, value] of Object.entries({
      maxNotes: this.maxNotes,
      maxTextLength: this.maxTextLength,
      maxIdLength: this.maxIdLength,
      maxSerializedLength: this.maxSerializedLength,
    }))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new RangeError(`${name} must be a positive safe integer`);
    if (this.maxSerializedLength < emptySerializedLength)
      throw new RangeError(
        "maxSerializedLength cannot hold an empty notes document",
      );
  }
  private validatePosition(position: CellPosition): void {
    if (!position || typeof position !== "object")
      throw new TypeError("A cell position is required");
    for (const [name, value] of Object.entries({
      rowId: position.rowId,
      columnId: position.columnId,
    })) {
      if (typeof value !== "string" || !value.length)
        throw new TypeError(`${name} must be a nonempty string`);
      if (value.length > this.maxIdLength)
        throw new RangeError(`${name} exceeds the ID length limit`);
    }
  }
  private validateText(text: string): void {
    if (typeof text !== "string")
      throw new TypeError("Note text must be a string");
    if (text.length > this.maxTextLength)
      throw new RangeError("Note text exceeds the character limit");
  }
  private validateSize(entryLength: number, count: number): void {
    if (count > this.maxNotes)
      throw new RangeError("Notes exceed the note count limit");
    if (
      emptySerializedLength + entryLength + Math.max(0, count - 1) >
      this.maxSerializedLength
    )
      throw new RangeError("Notes exceed the serialized character limit");
  }
  private changed() {
    this.#snapshot = undefined;
    for (const listener of [...this.#listeners]) listener();
  }
  getSnapshot = (): CellNotesSnapshot => {
    if (!this.#snapshot)
      this.#snapshot = Object.freeze({
        version: 1 as const,
        notes: Object.freeze([...this.#values.values()]),
      });
    return this.#snapshot;
  };
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  get(position: CellPosition): string | undefined {
    this.validatePosition(position);
    return this.#values.get(noteKey(position))?.text;
  }
  set(position: CellPosition, text: string): void {
    this.validatePosition(position);
    this.validateText(text);
    const key = noteKey(position),
      previous = this.#values.get(key);
    if (previous?.text === text) return;
    const note = Object.freeze({
      rowId: position.rowId,
      columnId: position.columnId,
      text,
    });
    const entryLength =
      this.#entryLength -
      (previous ? JSON.stringify(previous).length : 0) +
      JSON.stringify(note).length;
    this.validateSize(entryLength, this.#values.size + (previous ? 0 : 1));
    this.#values.set(key, note);
    this.#entryLength = entryLength;
    this.changed();
  }
  delete(position: CellPosition): boolean {
    this.validatePosition(position);
    const key = noteKey(position),
      previous = this.#values.get(key);
    if (!previous) return false;
    this.#values.delete(key);
    this.#entryLength -= JSON.stringify(previous).length;
    this.changed();
    return true;
  }
  clear(): void {
    if (!this.#values.size) return;
    this.#values.clear();
    this.#entryLength = 0;
    this.changed();
  }
  exportJson(): string {
    return JSON.stringify(this.getSnapshot());
  }
  importJson(json: string): void {
    if (typeof json !== "string")
      throw new TypeError("Notes document must be JSON text");
    if (json.length > this.maxSerializedLength)
      throw new RangeError(
        "Notes document exceeds the serialized character limit",
      );
    let document: unknown;
    try {
      document = JSON.parse(json);
    } catch {
      throw new Error("Invalid notes JSON");
    }
    if (!document || typeof document !== "object" || Array.isArray(document))
      throw new Error("Notes document must be an object");
    const root = document as Record<string, unknown>;
    if (
      root.version !== 1 ||
      !Array.isArray(root.notes) ||
      Object.keys(root).some((key) => key !== "version" && key !== "notes")
    )
      throw new Error("Expected notes format version 1 with a notes array");
    if (root.notes.length > this.maxNotes)
      throw new RangeError("Notes exceed the note count limit");
    const next = new Map<string, CellNote>();
    let entryLength = 0;
    for (const item of root.notes) {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("Each note must be an object");
      const value = item as Record<string, unknown>;
      if (
        Object.keys(value).some(
          (key) => key !== "rowId" && key !== "columnId" && key !== "text",
        )
      )
        throw new Error("Note contains unsupported properties");
      const position = {
        rowId: value.rowId,
        columnId: value.columnId,
      } as CellPosition;
      this.validatePosition(position);
      this.validateText(value.text as string);
      const key = noteKey(position);
      if (next.has(key)) throw new Error("Duplicate note cell IDs");
      const note = Object.freeze({
        rowId: position.rowId,
        columnId: position.columnId,
        text: value.text as string,
      });
      next.set(key, note);
      entryLength += JSON.stringify(note).length;
    }
    this.validateSize(entryLength, next.size);
    const previous = [...this.#values.entries()],
      replacement = [...next.entries()];
    if (
      previous.length === replacement.length &&
      previous.every(
        ([key, note], index) =>
          key === replacement[index][0] &&
          note.text === replacement[index][1].text,
      )
    )
      return;
    this.#values.clear();
    for (const [key, note] of next) this.#values.set(key, note);
    this.#entryLength = entryLength;
    this.changed();
  }
  prune(validRows: Iterable<string>, validColumns: Iterable<string>): number {
    if (typeof validRows === "string" || typeof validColumns === "string")
      throw new TypeError(
        "Prune expects collections of IDs, not a single string",
      );
    const rows = new Set(validRows),
      columns = new Set(validColumns);
    for (const rowId of rows) this.validatePosition({ rowId, columnId: "_" });
    for (const columnId of columns)
      this.validatePosition({ rowId: "_", columnId });
    const removed = [...this.#values].filter(
      ([, note]) => !rows.has(note.rowId) || !columns.has(note.columnId),
    );
    if (!removed.length) return 0;
    for (const [key, note] of removed) {
      this.#values.delete(key);
      this.#entryLength -= JSON.stringify(note).length;
    }
    this.changed();
    return removed.length;
  }
}
export function createCellNotesStore(
  options: CellNotesOptions = {},
): CellNotesStore {
  return new CellNotesStore(options);
}
