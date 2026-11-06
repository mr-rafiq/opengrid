import type { Ag31Event } from "./ag31-events.js";
import type {
  Ag31LeafColumn,
  Ag31ColumnCellParams,
} from "./ag31-leaf-columns.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";

export interface Ag31CellValueEvent<T> extends Ag31Event {
  node: Ag31RowNode<T>;
  data: T | undefined;
  column: Ag31LeafColumn<T>;
  colDef: ReturnType<Ag31LeafColumn<T>["getColDef"]>;
  rowIndex: number | null;
  rowPinned: null;
  oldValue: unknown;
  newValue: unknown;
  value?: unknown;
  source: string | undefined;
}
export interface Ag31CellValueParams<T> extends Ag31ColumnCellParams<T> {
  oldValue: unknown;
  newValue: unknown;
  getValue(key: unknown): unknown;
}
export interface Ag31CellValueServicesOptions<T> {
  alive(): boolean;
  owns(node: Ag31RowNode<T>): boolean;
  column(key: unknown): Ag31LeafColumn<T> | null | undefined;
  read(node: Ag31RowNode<T>, column: Ag31LeafColumn<T>): unknown;
  common(): { api: object; columnApi?: object; context?: unknown };
  readOnlyEdit(): boolean;
  prepareWrite?(node: Ag31RowNode<T>): boolean;
  request(event: Ag31CellValueEvent<T>): void;
  changed(event: Ag31CellValueEvent<T>, params: Ag31CellValueParams<T>): void;
  rowChanged(event: Ag31CellValueEvent<T>): void;
  refresh(): void;
}

/** Source writes borrow the original objects. A truthy setter result is not an
 * asynchronous persistence acknowledgement or a native owned-row undo entry. */
export function createAg31CellValueServices<T>(
  options: Ag31CellValueServicesOptions<T>,
) {
  function fieldWrite(
    row: T | undefined,
    field: unknown,
    value: unknown,
  ): boolean {
    if (row == null || typeof field !== "string" || !field) return false;
    const path = field.split(".");
    if (
      path.length > 32 ||
      path.some((key) =>
        ["__proto__", "prototype", "constructor"].includes(key),
      )
    )
      throw new TypeError(
        "The source write field is outside its data boundary",
      );
    let parent: unknown = row;
    for (const part of path.slice(0, -1)) {
      if (parent == null || typeof parent !== "object") return false;
      parent = (parent as Record<string, unknown>)[part];
    }
    if (parent == null || typeof parent !== "object") return false;
    const target = parent as Record<string, unknown>,
      key = path.at(-1)!;
    if (target[key] === value) return false;
    target[key] = value;
    return true;
  }
  function params(node: Ag31RowNode<T>, column: Ag31LeafColumn<T>) {
    return {
      ...options.common(),
      node,
      data: node.data,
      column,
      colDef: column.getColDef(),
      getValue: (key: unknown) => {
        const other = options.column(key);
        return other ? options.read(node, other) : undefined;
      },
    };
  }
  function parse(node: Ag31RowNode<T>, key: unknown, newValue: unknown) {
    const column = options.column(key);
    if (!options.alive() || !options.owns(node) || !column)
      throw new Error("An owned live source cell is required");
    const parser = column.getColDef().valueParser;
    if (parser == null) return newValue;
    if (typeof parser !== "function")
      throw new TypeError("Source valueParser expressions are unsupported");
    return parser({
      ...params(node, column),
      oldValue: options.read(node, column),
      newValue,
    });
  }
  function write(
    node: Ag31RowNode<T>,
    key: unknown,
    newValue: unknown,
    source?: string,
  ): boolean {
    if (!options.alive() || !options.owns(node)) return false;
    const column = options.column(key);
    if (!column)
      throw new TypeError("Source cell writes require an existing column");
    const readOnly = options.readOnlyEdit();
    if (!readOnly && options.prepareWrite && !options.prepareWrite(node))
      return false;
    const oldValue = options.read(node, column),
      event: Ag31CellValueEvent<T> = {
        type: "cellValueChanged",
        node,
        data: node.data,
        column,
        colDef: column.getColDef(),
        rowIndex: node.rowIndex,
        rowPinned: null,
        oldValue,
        newValue,
        source,
      };
    if (readOnly) {
      options.request({ ...event, type: "cellEditRequest", value: newValue });
      return false;
    }
    const setter = column.getColDef().valueSetter;
    const setterParams = { ...params(node, column), oldValue, newValue };
    let changed: boolean;
    if (setter != null) {
      if (typeof setter !== "function")
        throw new TypeError("Source valueSetter expressions are unsupported");
      const result = setter(setterParams);
      // Installed AG31 treats undefined as successful and promises as truthy.
      // The application owns asynchronous completion and error handling.
      changed = result === undefined || Boolean(result);
    } else changed = fieldWrite(node.data, column.getColDef().field, newValue);
    if (!options.alive() || !options.owns(node)) return changed;
    if (changed) {
      setterParams.newValue = options.read(node, column);
      options.changed(
        {
          ...event,
          newValue: setterParams.newValue,
          value: setterParams.newValue,
        },
        setterParams,
      );
    }
    // Row-level notifications carry the submitted value, including false/no-op writes.
    try {
      options.rowChanged({ ...event, type: "cellChanged" });
    } finally {
      options.refresh();
    }
    return changed;
  }
  return Object.freeze({ write, parse, params });
}
