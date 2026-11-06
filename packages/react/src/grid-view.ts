import type { CellPosition } from "@opengrid/core";

export interface GridViewFocusOptions {
  takeFocus?: boolean;
  extendRange?: boolean;
}
export interface GridViewEditOptions {
  initialText?: string;
}
/** An external owner may render its own editors while the grid owns geometry,
 * focus and keyboard entry. Native owned-row writes remain isolated. */
export interface GridCellEditingController {
  isCellEditable(position: CellPosition): boolean;
  getEditingCell(): Readonly<CellPosition> | null;
  startEditingCell(
    position: CellPosition,
    options?: GridViewEditOptions,
  ): boolean;
  stopEditing(options?: { cancel?: boolean }): boolean;
}
export interface GridViewScrollPosition {
  readonly top: number;
  readonly left: number;
}
/** Commands target the mounted, committed client view. Missing/hidden/collapsed cells return false. */
export interface DataGridViewController {
  isActive(): boolean;
  getFocusedCell(): Readonly<CellPosition> | null;
  focusCell(position: CellPosition, options?: GridViewFocusOptions): boolean;
  revealCell(position: CellPosition): boolean;
  revealRow(rowId: string): boolean;
  getScrollPosition(): GridViewScrollPosition | null;
  /** left is the normalized direction-relative offset; browser geometry clamps both axes. */
  scrollTo(position: Partial<GridViewScrollPosition>): boolean;
  getEditingCell(): Readonly<CellPosition> | null;
  /** Cell mode only; this does not open a full-row modal. */
  startEditingCell(
    position: CellPosition,
    options?: GridViewEditOptions,
  ): boolean;
  stopEditing(options?: { cancel?: boolean }): boolean;
}
export type GridViewPort = Omit<DataGridViewController, "isActive">;
const cell = (value: CellPosition) =>
  value != null &&
  typeof value === "object" &&
  typeof value.rowId === "string" &&
  !!value.rowId &&
  typeof value.columnId === "string" &&
  !!value.columnId;
const flag = (value: unknown) =>
  value === undefined || typeof value === "boolean";
const snapshot = (value: CellPosition | null) =>
  value && Object.freeze({ rowId: value.rowId, columnId: value.columnId });

/** Internal port indirection keeps the handle stable while committed view geometry changes. */
export function createDataGridViewController(
  read: () => GridViewPort | undefined,
): DataGridViewController {
  return Object.freeze({
    isActive: () => !!read(),
    getFocusedCell: () => snapshot(read()?.getFocusedCell() ?? null),
    focusCell: (position: CellPosition, options: GridViewFocusOptions = {}) =>
      cell(position) &&
      !!options &&
      flag(options.takeFocus) &&
      flag(options.extendRange) &&
      (read()?.focusCell(position, options) ?? false),
    revealCell: (position: CellPosition) =>
      cell(position) && (read()?.revealCell(position) ?? false),
    revealRow: (rowId: string) =>
      typeof rowId === "string" &&
      !!rowId &&
      (read()?.revealRow(rowId) ?? false),
    getScrollPosition: () => {
      const value = read()?.getScrollPosition();
      return value ? Object.freeze({ top: value.top, left: value.left }) : null;
    },
    scrollTo: (position: Partial<GridViewScrollPosition>) => {
      if (
        !position ||
        typeof position !== "object" ||
        (position.top === undefined && position.left === undefined)
      )
        return false;
      for (const value of [position.top, position.left])
        if (
          value !== undefined &&
          (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        )
          return false;
      return read()?.scrollTo(position) ?? false;
    },
    getEditingCell: () => snapshot(read()?.getEditingCell() ?? null),
    startEditingCell: (
      position: CellPosition,
      options: GridViewEditOptions = {},
    ) =>
      cell(position) &&
      !!options &&
      (options.initialText === undefined ||
        typeof options.initialText === "string") &&
      (read()?.startEditingCell(position, options) ?? false),
    stopEditing: (options: { cancel?: boolean } = {}) =>
      !!options &&
      flag(options.cancel) &&
      (read()?.stopEditing(options) ?? false),
  });
}
