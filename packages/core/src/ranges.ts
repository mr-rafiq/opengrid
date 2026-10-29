import type { Column, Edit, GridModel } from "./types.js";

export interface CellPosition {
  readonly rowId: string;
  readonly columnId: string;
}
export interface CellRange {
  readonly anchor: CellPosition;
  readonly focus: CellPosition;
}
export interface CellRangeSnapshot {
  readonly range: CellRange | null;
}
export interface CellRangeOptions {
  getRowIds?: () => string[];
  maxCells?: number;
}
export interface CellRangeModel<T> {
  getSnapshot(): CellRangeSnapshot;
  subscribe(listener: () => void): () => void;
  setRange(anchor: CellPosition, focus?: CellPosition): void;
  extend(focus: CellPosition): void;
  clear(): void;
  contains(rowId: string, columnId: string): boolean;
  getCells(range?: CellRange): CellPosition[];
  copy(options?: { formatted?: boolean }): string;
  paste(tsv: string, anchor?: CellPosition): string | undefined;
  fill(direction: "down" | "right"): string | undefined;
  fillRange(
    source: CellRange,
    target: CellRange,
    mode?: "copy" | "series",
  ): string | undefined;
  refresh(): void;
  dispose(): void;
}

const DEFAULT_MAX_CELLS = 100_000;
const MAX_TEXT_LENGTH = 10_000_000;
const spreadsheetFormula = /^[\s\u0000-\u001f]*[=+\-@]/u;

/** Quote TSV fields losslessly; neutralize formula-like strings, never numeric negatives. */
export function serializeTsv(
  rows: readonly (readonly unknown[])[],
  options: { neutralizeFormulas?: boolean } = {},
): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let result = value == null ? "" : String(value);
          if (
            options.neutralizeFormulas !== false &&
            typeof value === "string" &&
            (spreadsheetFormula.test(value) || /^[\t\r\n]/u.test(value))
          )
            result = "'" + result;
          return /[\t\r\n"]/u.test(result)
            ? '"' + result.replaceAll('"', '""') + '"'
            : result;
        })
        .join("\t"),
    )
    .join("\r\n");
}

/** Strict quoted TSV parser. A final line terminator does not create a phantom row. */
export function parseTsv(
  input: string,
  options: { maxCells?: number } = {},
): string[][] {
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  if (!Number.isInteger(maxCells) || maxCells < 1)
    throw new RangeError("maxCells must be a positive integer");
  if (input.length > MAX_TEXT_LENGTH)
    throw new RangeError(
      "Clipboard text exceeds the 10 million character limit",
    );
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    state: "start" | "plain" | "quoted" | "closed" = "start",
    count = 0,
    finalNewline = false;
  function cell() {
    if (++count > maxCells)
      throw new RangeError("Clipboard exceeds the cell limit");
    row.push(value);
    value = "";
    state = "start";
  }
  function line() {
    cell();
    rows.push(row);
    row = [];
    finalNewline = true;
  }
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    finalNewline = false;
    if (state === "quoted") {
      if (char === '"') {
        if (input[index + 1] === '"') {
          value += '"';
          index++;
        } else state = "closed";
      } else value += char;
      continue;
    }
    if (char === "\t") {
      cell();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && input[index + 1] === "\n") index++;
      line();
      continue;
    }
    if (state === "closed")
      throw new Error("Unexpected text after a quoted clipboard cell");
    if (char === '"') {
      if (state !== "start")
        throw new Error("Quote in an unquoted clipboard cell");
      state = "quoted";
      continue;
    }
    value += char;
    state = "plain";
  }
  if (state === "quoted") throw new Error("Unterminated quoted clipboard cell");
  if (!finalNewline) {
    cell();
    rows.push(row);
  }
  return rows;
}

interface Bounds {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
}
function freezeRange(range: CellRange | null): CellRangeSnapshot {
  return Object.freeze({
    range: range
      ? Object.freeze({
          anchor: Object.freeze({ ...range.anchor }),
          focus: Object.freeze({ ...range.focus }),
        })
      : null,
  });
}
function sameRange(left: CellRange | null, right: CellRange | null): boolean {
  return (
    left === right ||
    Boolean(
      left &&
      right &&
      left.anchor.rowId === right.anchor.rowId &&
      left.anchor.columnId === right.anchor.columnId &&
      left.focus.rowId === right.focus.rowId &&
      left.focus.columnId === right.focus.columnId,
    )
  );
}

/** Rectangles use visible data rows and columns in current visual order. Group headers are excluded. */
export function createCellRangeModel<T>(
  grid: GridModel<T>,
  options: CellRangeOptions = {},
): CellRangeModel<T> {
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  if (!Number.isInteger(maxCells) || maxCells < 1)
    throw new RangeError("maxCells must be a positive integer");
  let rowIds: string[] = [],
    columns: Column<T>[] = [],
    data = new Map<string, T>(),
    rowIndex = new Map<string, number>(),
    columnIndex = new Map<string, number>();
  let snapshot = freezeRange(null),
    signature = "",
    disposed = false;
  let observedState = grid.getState();
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  function notify() {
    for (const listener of [...listeners]) listener();
  }
  function bounds(range: CellRange | null): Bounds | undefined {
    if (!range) return;
    const a = rowIndex.get(range.anchor.rowId),
      b = rowIndex.get(range.focus.rowId),
      x = columnIndex.get(range.anchor.columnId),
      y = columnIndex.get(range.focus.columnId);
    if (
      a === undefined ||
      b === undefined ||
      x === undefined ||
      y === undefined
    )
      return;
    return {
      rowStart: Math.min(a, b),
      rowEnd: Math.max(a, b),
      columnStart: Math.min(x, y),
      columnEnd: Math.max(x, y),
    };
  }
  function checkSize(area: Bounds) {
    if (
      (area.rowEnd - area.rowStart + 1) *
        (area.columnEnd - area.columnStart + 1) >
      maxCells
    )
      throw new RangeError("Selection exceeds the cell limit");
  }
  function refresh() {
    if (disposed) return;
    observedState = grid.getState();
    const visible = grid
      .getRowModel()
      .filter((node) => node.kind === "row" && node.data !== undefined);
    data = new Map(visible.map((node) => [node.id, node.data!]));
    rowIds = [
      ...new Set(
        options.getRowIds
          ? options.getRowIds()
          : visible.map((node) => node.id),
      ),
    ].filter((id) => data.has(id));
    columns = grid.getColumns().filter((column) => !column.hidden);
    rowIndex = new Map(rowIds.map((id, index) => [id, index]));
    columnIndex = new Map(columns.map((column, index) => [column.id, index]));
    const nextSignature = JSON.stringify([
      rowIds,
      columns.map((column) => column.id),
    ]);
    const range = bounds(snapshot.range) ? snapshot.range : null;
    if (signature !== nextSignature || !sameRange(snapshot.range, range)) {
      signature = nextSignature;
      snapshot = freezeRange(range);
      notify();
    }
  }
  function ensureFresh() {
    if (observedState !== grid.getState()) refresh();
  }
  function setRange(anchor: CellPosition, focus: CellPosition = anchor) {
    refresh();
    const proposed = { anchor, focus };
    const range = bounds(proposed) ? proposed : null;
    if (!sameRange(snapshot.range, range)) {
      snapshot = freezeRange(range);
      notify();
    }
  }
  function clear() {
    if (snapshot.range) {
      snapshot = freezeRange(null);
      notify();
    }
  }
  function editsFor(matrix: unknown[][], top: number, left: number): Edit<T>[] {
    const width = matrix[0]?.length ?? 0;
    if (!width || !matrix.length || matrix.some((row) => row.length !== width))
      throw new Error("Clipboard rows must form a rectangle");
    if (matrix.length * width > maxCells)
      throw new RangeError("Clipboard exceeds the cell limit");
    if (
      top < 0 ||
      left < 0 ||
      top + matrix.length > rowIds.length ||
      left + width > columns.length
    )
      throw new Error("Clipboard data does not fit within the visible grid");
    return matrix.flatMap((row, y) =>
      row.map((value, x) => {
        const column = columns[left + x];
        if (!column.editable || !column.field || column.valueGetter)
          throw new Error(`Column ${column.header ?? column.id} is read only`);
        return { rowId: rowIds[top + y], columnId: column.id, value };
      }),
    );
  }
  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Range operation failed";
  }
  function fillRange(
    source: CellRange,
    target: CellRange,
    mode: "copy" | "series" = "copy",
  ): string | undefined {
    try {
      refresh();
      const from = bounds(source),
        to = bounds(target);
      if (!from || !to) return "Fill endpoints must be visible data cells";
      checkSize(to);
      const down =
        from.columnStart === to.columnStart &&
        from.columnEnd === to.columnEnd &&
        from.rowStart === to.rowStart &&
        to.rowEnd >= from.rowEnd;
      const right =
        from.rowStart === to.rowStart &&
        from.rowEnd === to.rowEnd &&
        from.columnStart === to.columnStart &&
        to.columnEnd >= from.columnEnd;
      if (!down && !right)
        return "Fill supports a downward or rightward extension on one axis";
      if (from.rowEnd === to.rowEnd && from.columnEnd === to.columnEnd) {
        setRange(target.anchor, target.focus);
        return;
      }
      const sourceHeight = from.rowEnd - from.rowStart + 1,
        sourceWidth = from.columnEnd - from.columnStart + 1;
      const values = Array.from({ length: sourceHeight }, (_, y) =>
        Array.from({ length: sourceWidth }, (_, x) =>
          grid.getValue(
            data.get(rowIds[from.rowStart + y])!,
            columns[from.columnStart + x].id,
          ),
        ),
      );
      function seriesGenerator(seed: unknown[]): (distance: number) => unknown {
        const first = seed[0];
        if (typeof first !== "number" && typeof first !== "bigint")
          return (distance) => seed[distance % seed.length];
        if (
          seed.some(
            (value) =>
              typeof value !== typeof first ||
              (typeof value === "number" && !Number.isFinite(value)),
          )
        )
          throw new Error("Series seeds must use one finite numeric type");
        if (typeof first === "bigint") {
          const numbers = seed as bigint[];
          const step = numbers.length > 1 ? numbers[1] - first : 1n;
          if (
            numbers.some(
              (value, index) => value !== first + step * BigInt(index),
            )
          )
            throw new Error("Series seeds must form an arithmetic progression");
          return (distance) => first + step * BigInt(distance);
        }
        const numbers = seed as number[];
        const step = numbers.length > 1 ? numbers[1] - first : 1;
        if (
          numbers.some(
            (value, index) =>
              Math.abs(value - (first + step * index)) >
              1e-10 * Math.max(1, Math.abs(value)),
          )
        )
          throw new Error("Series seeds must form an arithmetic progression");
        return (distance) => {
          const value = first + step * distance;
          if (!Number.isFinite(value))
            throw new Error("Series result is not finite");
          return value;
        };
      }
      const generators =
        mode === "series"
          ? down
            ? Array.from({ length: sourceWidth }, (_, x) =>
                seriesGenerator(values.map((row) => row[x])),
              )
            : values.map(seriesGenerator)
          : [];
      const edits: Edit<T>[] = [];
      for (let y = to.rowStart; y <= to.rowEnd; y++)
        for (let x = to.columnStart; x <= to.columnEnd; x++) {
          if (
            y >= from.rowStart &&
            y <= from.rowEnd &&
            x >= from.columnStart &&
            x <= from.columnEnd
          )
            continue;
          const column = columns[x];
          if (!column.editable || !column.field || column.valueGetter)
            return `Column ${column.header ?? column.id} is read only`;
          const dy = y - from.rowStart,
            dx = x - from.columnStart;
          const value =
            mode === "series"
              ? down
                ? generators[dx](dy)
                : generators[dy](dx)
              : values[dy % sourceHeight][dx % sourceWidth];
          edits.push({ rowId: rowIds[y], columnId: column.id, value });
        }
      const error = grid.batchEdit(edits);
      if (!error) setRange(target.anchor, target.focus);
      return error;
    } catch (error) {
      return errorMessage(error);
    }
  }
  refresh();
  return {
    getSnapshot() {
      ensureFresh();
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      if (!unsubscribe) unsubscribe = grid.subscribe(refresh);
      ensureFresh();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribe?.();
          unsubscribe = undefined;
        }
      };
    },
    setRange,
    extend(focus) {
      if (snapshot.range) setRange(snapshot.range.anchor, focus);
      else setRange(focus);
    },
    clear,
    contains(rowId, columnId) {
      ensureFresh();
      const area = bounds(snapshot.range),
        y = rowIndex.get(rowId),
        x = columnIndex.get(columnId);
      return Boolean(
        area &&
        y !== undefined &&
        x !== undefined &&
        y >= area.rowStart &&
        y <= area.rowEnd &&
        x >= area.columnStart &&
        x <= area.columnEnd,
      );
    },
    getCells(range = snapshot.range ?? undefined) {
      ensureFresh();
      const area = bounds(range ?? null);
      if (!area) return [];
      checkSize(area);
      return rowIds
        .slice(area.rowStart, area.rowEnd + 1)
        .flatMap((rowId) =>
          columns
            .slice(area.columnStart, area.columnEnd + 1)
            .map((column) => ({ rowId, columnId: column.id })),
        );
    },
    copy(copyOptions = {}) {
      refresh();
      const area = bounds(snapshot.range);
      if (!area) return "";
      checkSize(area);
      return serializeTsv(
        rowIds.slice(area.rowStart, area.rowEnd + 1).map((id) =>
          columns.slice(area.columnStart, area.columnEnd + 1).map((column) => {
            const row = data.get(id)!;
            const value = grid.getValue(row, column.id);
            return copyOptions.formatted && column.valueFormatter
              ? column.valueFormatter(value, row)
              : value;
          }),
        ),
      );
    },
    paste(tsv, anchor) {
      try {
        refresh();
        const area = bounds(snapshot.range);
        const start =
          anchor ??
          (area
            ? {
                rowId: rowIds[area.rowStart],
                columnId: columns[area.columnStart].id,
              }
            : undefined);
        if (!start) return "Select a destination cell before pasting";
        const top = rowIndex.get(start.rowId),
          left = columnIndex.get(start.columnId);
        if (top === undefined || left === undefined)
          return "Paste destination must be a visible data cell";
        const matrix = parseTsv(tsv, { maxCells });
        const edits = editsFor(matrix, top, left);
        const end = {
          rowId: rowIds[top + matrix.length - 1],
          columnId: columns[left + matrix[0].length - 1].id,
        };
        const error = grid.batchEdit(edits);
        if (!error) setRange(start, end);
        return error;
      } catch (error) {
        return errorMessage(error);
      }
    },
    fill(direction) {
      refresh();
      const range = snapshot.range,
        area = bounds(range);
      if (!range || !area) return "Select a range before filling";
      const source: CellRange = {
        anchor: {
          rowId: rowIds[area.rowStart],
          columnId: columns[area.columnStart].id,
        },
        focus: {
          rowId: rowIds[direction === "down" ? area.rowStart : area.rowEnd],
          columnId:
            columns[direction === "right" ? area.columnStart : area.columnEnd]
              .id,
        },
      };
      return fillRange(source, range);
    },
    fillRange,
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      listeners.clear();
    },
  };
}
