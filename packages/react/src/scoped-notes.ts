import {
  CellNotesStore,
  type CellNote,
  type CellNotesSnapshot,
  type CellPosition,
} from "@opengrid/core";

const TAG = "opengrid-server-notes-v1";
const EMPTY_SIZE = JSON.stringify({ version: 1, notes: [] }).length;
const sameNotes = (first: readonly CellNote[], second: readonly CellNote[]) =>
  first.length === second.length &&
  first.every(
    (note, index) =>
      note.rowId === second[index].rowId &&
      note.columnId === second[index].columnId &&
      note.text === second[index].text,
  );

/** Private view over one globally bounded store; public row IDs never acquire a UI namespace. */
export class ScopedNotesStore extends CellNotesStore {
  private seen: CellNotesSnapshot | undefined;
  private snapshot: CellNotesSnapshot = Object.freeze({
    version: 1,
    notes: Object.freeze([]),
  });
  constructor(
    private readonly parent: CellNotesStore,
    private readonly scope: string,
  ) {
    super({
      maxNotes: parent.maxNotes,
      maxTextLength: parent.maxTextLength,
      maxSerializedLength: parent.maxSerializedLength,
    });
    if (typeof scope !== "string" || !scope.length)
      throw new TypeError("A nonempty notes scope is required");
  }
  private position(position: CellPosition): CellPosition {
    if (!position || typeof position !== "object")
      throw new TypeError("A cell position is required");
    const rowId = position.rowId,
      columnId = position.columnId;
    for (const [name, value] of Object.entries({ rowId, columnId })) {
      if (typeof value !== "string" || !value.length)
        throw new TypeError(`${name} must be a nonempty string`);
      if (value.length > this.maxIdLength)
        throw new RangeError(`${name} exceeds the ID length limit`);
    }
    return { rowId, columnId };
  }
  private encode(position: CellPosition): CellPosition | undefined {
    const original = this.position(position);
    if (
      this.scope.length + original.rowId.length + TAG.length + 10 >
      this.parent.maxIdLength
    )
      return;
    const rowId = JSON.stringify([TAG, this.scope, original.rowId]);
    if (rowId.length > this.parent.maxIdLength) return;
    return { rowId, columnId: original.columnId };
  }
  private decode(note: CellNote): CellNote | undefined {
    if (!note.rowId.startsWith("[")) return;
    try {
      const tuple: unknown = JSON.parse(note.rowId);
      if (
        !Array.isArray(tuple) ||
        tuple.length !== 3 ||
        tuple[0] !== TAG ||
        tuple[1] !== this.scope ||
        typeof tuple[2] !== "string" ||
        !tuple[2].length ||
        tuple[2].length > this.maxIdLength ||
        note.columnId.length > this.maxIdLength
      )
        return;
      return Object.freeze({
        rowId: tuple[2],
        columnId: note.columnId,
        text: note.text,
      });
    } catch {
      return;
    }
  }
  override getSnapshot = (): CellNotesSnapshot => {
    const parent = this.parent.getSnapshot();
    if (parent === this.seen) return this.snapshot;
    const notes: CellNote[] = [];
    for (const note of parent.notes) {
      const decoded = this.decode(note);
      if (decoded) notes.push(decoded);
    }
    this.seen = parent;
    if (!sameNotes(this.snapshot.notes, notes))
      this.snapshot = Object.freeze({
        version: 1,
        notes: Object.freeze(notes),
      });
    return this.snapshot;
  };
  override subscribe = (listener: () => void) =>
    this.parent.subscribe(listener);
  override get(position: CellPosition): string | undefined {
    const encoded = this.encode(position);
    return encoded ? this.parent.get(encoded) : undefined;
  }
  override set(position: CellPosition, text: string): void {
    const encoded = this.encode(position);
    if (!encoded)
      throw new RangeError("The notes scope exceeds the storage ID limit");
    this.parent.set(encoded, text);
  }
  override delete(position: CellPosition): boolean {
    const encoded = this.encode(position);
    return encoded ? this.parent.delete(encoded) : false;
  }
  private temporary(): CellNotesStore {
    return new CellNotesStore({
      maxNotes: this.maxNotes,
      maxTextLength: this.maxTextLength,
      maxIdLength: this.maxIdLength,
      maxSerializedLength: this.maxSerializedLength,
    });
  }
  private replace(notes: readonly CellNote[]) {
    if (sameNotes(this.getSnapshot().notes, notes)) return;
    const candidate: CellNote[] = [];
    let entrySize = 0;
    const append = (note: CellNote) => {
      const count = candidate.length + 1;
      if (count > this.parent.maxNotes)
        throw new RangeError("Notes exceed the note count limit");
      entrySize += JSON.stringify(note).length;
      if (
        EMPTY_SIZE + entrySize + Math.max(0, count - 1) >
        this.parent.maxSerializedLength
      )
        throw new RangeError("Notes exceed the serialized character limit");
      candidate.push(note);
    };
    for (const note of this.parent.getSnapshot().notes)
      if (!this.decode(note)) append(note);
    for (const note of notes) {
      const encoded = this.encode(note);
      if (!encoded)
        throw new RangeError("The notes scope exceeds the storage ID limit");
      append({
        rowId: encoded.rowId,
        columnId: encoded.columnId,
        text: note.text,
      });
    }
    this.parent.importJson(JSON.stringify({ version: 1, notes: candidate }));
  }
  override clear(): void {
    this.replace([]);
  }
  override importJson(json: string): void {
    const candidate = this.temporary();
    candidate.importJson(json);
    this.replace(candidate.getSnapshot().notes);
  }
  override prune(
    validRows: Iterable<string>,
    validColumns: Iterable<string>,
  ): number {
    const candidate = this.temporary();
    candidate.importJson(this.exportJson());
    const removed = candidate.prune(validRows, validColumns);
    if (removed) this.replace(candidate.getSnapshot().notes);
    return removed;
  }
}
