import type { CellPosition } from "@opengrid/core";
import type { Ag31LeafColumn } from "./ag31-leaf-columns.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
import type { Ag31Event } from "./ag31-events.js";
import type { GridCellEditingController } from "./grid-view.js";

export interface Ag31EditingCell<T> {
  readonly token: object;
  readonly position: Readonly<CellPosition>;
  readonly node: Ag31RowNode<T>;
  readonly data: T | undefined;
  readonly column: Ag31LeafColumn<T>;
  readonly oldValue: unknown;
  readonly value: unknown;
  readonly eventKey?: string;
}
export interface Ag31EditingOptions<T> {
  alive(): boolean;
  resolve(position: CellPosition):
    | {
        node: Ag31RowNode<T>;
        column: Ag31LeafColumn<T>;
      }
    | undefined;
  read(node: Ag31RowNode<T>, column: Ag31LeafColumn<T>): unknown;
  write(
    node: Ag31RowNode<T>,
    column: Ag31LeafColumn<T>,
    value: unknown,
  ): boolean;
  enableGroupEdit(): boolean;
  emit(event: Ag31Event): void;
}
/** Source editor state borrows source values. It never creates a native undo
 * transaction or treats a promise-returning application setter as an ACK. */
export function createAg31EditingServices<T>(options: Ag31EditingOptions<T>) {
  let cell: Ag31EditingCell<T> | null = null;
  let alive = true;
  let parser: { token: object; read(value: unknown): unknown } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const live = () => alive && options.alive();
  const owned = (current: Ag31EditingCell<T>) => {
    const resolved = options.resolve(current.position);
    return (
      live() &&
      resolved?.node === current.node &&
      resolved.column === current.column &&
      (current.node.group || current.node.data === current.data)
    );
  };
  function editable(position: CellPosition) {
    if (!live()) return false;
    const resolved = options.resolve(position);
    return (
      !!resolved &&
      (!resolved.node.group || options.enableGroupEdit()) &&
      resolved.column.isCellEditable(resolved.node)
    );
  }
  function event(current: Ag31EditingCell<T>, type: string) {
    return {
      type,
      node: current.node,
      data: current.node.data,
      column: current.column,
      colDef: current.column.getColDef(),
      rowIndex: current.node.rowIndex,
      rowPinned: null,
    };
  }
  function stop(cancel = false, token?: object): boolean {
    const current = cell;
    if (!current || (token !== undefined && token !== current.token))
      return false;
    const parse = parser?.token === current.token ? parser.read : undefined;
    cell = null;
    parser = null;
    if (!owned(current)) {
      notify();
      return false;
    }
    let changed = false;
    try {
      const oldValue = options.read(current.node, current.column);
      const value = cancel
        ? undefined
        : parse
          ? parse(current.value)
          : current.value;
      if (!cancel && oldValue !== value)
        changed = options.write(current.node, current.column, value);
      if (live())
        options.emit({
          ...event(current, "cellEditingStopped"),
          oldValue,
          newValue: value,
          value: options.read(current.node, current.column),
          valueChanged: changed,
        });
    } finally {
      notify();
    }
    return true;
  }
  const controller: GridCellEditingController = {
    isCellEditable: editable,
    getEditingCell: () => (cell && owned(cell) ? cell.position : null),
    startEditingCell(position, editOptions = {}) {
      if (!editable(position)) return false;
      if (
        cell?.position.rowId === position.rowId &&
        cell.position.columnId === position.columnId
      )
        return true;
      if (cell) stop();
      if (!editable(position)) return false;
      const { node, column } = options.resolve(position)!;
      const value = options.read(node, column);
      parser = null;
      cell = {
        token: {},
        position: Object.freeze({ ...position }),
        node,
        data: node.data,
        column,
        oldValue: value,
        value,
        eventKey: editOptions.initialText,
      };
      options.emit({ ...event(cell, "cellEditingStarted"), value });
      notify();
      return true;
    },
    stopEditing: (editOptions = {}) => !cell || stop(editOptions.cancel),
  };
  return Object.freeze({
    controller,
    getSnapshot: () => cell,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setValue(token: object, value: unknown) {
      if (!cell || cell.token !== token || !owned(cell)) return false;
      cell = { ...cell, value };
      notify();
      return true;
    },
    prepareValue(token: object, read: (value: unknown) => unknown) {
      const next = { token, read };
      if (cell?.token === token) parser = next;
      return () => {
        if (parser === next) parser = null;
      };
    },
    stop,
    reconcile() {
      if (cell && !owned(cell)) {
        cell = null;
        notify();
      }
    },
    destroy() {
      alive = false;
      cell = null;
      notify();
      listeners.clear();
    },
  });
}
