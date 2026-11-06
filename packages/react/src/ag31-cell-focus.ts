import type { CellPosition } from "@opengrid/core";
import type { Ag31Event } from "./ag31-events.js";
import type { Ag31LeafColumn } from "./ag31-leaf-columns.js";

export interface Ag31FocusedCell<T> {
  readonly rowIndex: number;
  readonly rowPinned: null;
  readonly column: Ag31LeafColumn<T>;
}
export interface Ag31CellFocusPort {
  focus(position: CellPosition, preventScroll: boolean): boolean;
  ownsBrowserFocus(): boolean;
  canRestoreBrowserFocus?(): boolean;
}
interface CellFocusAttachment {
  read(): Ag31CellFocusPort | null;
}

/** Source numeric coordinates are independent of native row identity and reveal. */
export function createAg31CellFocus<T>(options: {
  column(key: unknown): Ag31LeafColumn<T> | null;
  position(index: number, column: Ag31LeafColumn<T>): CellPosition | null;
  locate(
    position: CellPosition,
  ): { index: number; column: Ag31LeafColumn<T> } | null;
  subscribe(listener: () => void): () => void;
  emit(event: Ag31Event): void;
}) {
  let alive = true;
  let logical: Ag31FocusedCell<T> | null = null;
  let snapshot: Readonly<CellPosition> | null = null;
  let attachment: CellFocusAttachment | null = null;
  const listeners = new Set<() => void>();
  function reconcile() {
    if (!alive) return;
    const next = logical && options.position(logical.rowIndex, logical.column);
    if (
      next?.rowId === snapshot?.rowId &&
      next?.columnId === snapshot?.columnId
    )
      return;
    snapshot = next
      ? Object.freeze({ rowId: next.rowId, columnId: next.columnId })
      : null;
    for (const listener of [...listeners]) listener();
  }
  const unsubscribe = options.subscribe(reconcile);
  function focused(forceBrowserFocus: boolean) {
    if (!logical) return;
    options.emit({
      type: "cellFocused",
      ...logical,
      isFullWidthCell: false,
      forceBrowserFocus,
      preventScrollOnBrowserFocus: false,
      floating: null,
    });
  }
  function clearFocusedCell() {
    if (!alive || !logical) return;
    const previous = logical;
    logical = null;
    reconcile();
    options.emit({
      type: "cellFocusCleared",
      ...previous,
      isFullWidthCell: false,
    });
  }
  function setFocusedCell(rowIndex: number, colKey: unknown, rowPinned?: null) {
    if (!alive) return;
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 0)
      throw new TypeError(
        "Source focus requires a nonnegative integer row index",
      );
    if (rowPinned != null)
      throw new TypeError("Pinned source focus is not supported");
    const column = options.column(colKey);
    if (!column) {
      logical = null;
      reconcile();
      return;
    }
    logical = Object.freeze({ rowIndex, rowPinned: null, column });
    reconcile();
    focused(true);
    if (!snapshot) return;
    attachment?.read()?.focus(snapshot, false);
  }
  function setFromView(position: CellPosition | null) {
    if (!alive) return;
    if (!position) return clearFocusedCell();
    const target = options.locate(position);
    if (!target) return;
    if (logical?.rowIndex === target.index && logical.column === target.column)
      return;
    logical = Object.freeze({
      rowIndex: target.index,
      rowPinned: null,
      column: target.column,
    });
    reconcile();
    focused(false);
  }
  return Object.freeze({
    getFocusedCell: () =>
      alive && logical ? Object.freeze({ ...logical }) : null,
    setFocusedCell,
    clearFocusedCell,
    controller: Object.freeze({
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        if (!alive) return () => {};
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      setFocusedCell: setFromView,
    }),
    reconcile,
    /** All-row redraw restores an owned non-editor cell once after DOM commit. */
    captureRedrawFocus(): (() => void) | undefined {
      const owner = attachment,
        previous = logical;
      const port = owner?.read();
      if (!alive || !previous || !snapshot || !port?.ownsBrowserFocus())
        return undefined;
      let pending = true;
      return () => {
        if (!pending) return;
        pending = false;
        if (!alive || logical !== previous || attachment !== owner || !snapshot)
          return;
        const current = owner?.read();
        if (current?.canRestoreBrowserFocus?.()) current.focus(snapshot, true);
      };
    },
    flush() {
      if (!alive || !snapshot) return;
      const port = attachment?.read();
      if (!port) return;
      if (port.ownsBrowserFocus()) port.focus(snapshot, true);
    },
    attach(read: () => Ag31CellFocusPort | null) {
      if (!alive) return () => {};
      const next = { read };
      attachment = next;
      return () => {
        if (attachment === next) {
          attachment = null;
        }
      };
    },
    destroy() {
      if (!alive) return;
      alive = false;
      unsubscribe();
      logical = null;
      snapshot = null;
      attachment = null;
      listeners.clear();
    },
  });
}
