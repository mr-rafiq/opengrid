import type { CellPosition, Column, GridModel } from "@opengrid/core";
import {
  prepareCommandMenuItems,
  type CommandMenuAction,
  type CommandMenuSeparator,
  type CommandMenuSubmenu,
} from "./command-menu-items.js";
export {
  COMMAND_MENU_LIMITS as CONTEXT_MENU_LIMITS,
  GridContextMenuError,
} from "./command-menu-items.js";
export interface GridContextMenuContext<T> {
  readonly model: GridModel<T>;
  readonly position: CellPosition;
  /** Application-owned row and column; neither is frozen by the menu. */
  readonly row: T;
  readonly column: Column<T>;
  readonly value: unknown;
}

export interface GridContextMenuAction<T> extends CommandMenuAction<
  GridContextMenuContext<T>
> {}
export interface GridContextMenuSeparator extends CommandMenuSeparator {}
export interface GridContextMenuSubmenu<T> extends CommandMenuSubmenu<
  GridContextMenuContext<T>
> {}
export type GridContextMenuItem<T> =
  | GridContextMenuAction<T>
  | GridContextMenuSeparator
  | GridContextMenuSubmenu<T>;
export interface GridContextMenuOptions<T> {
  readonly getItems?: (
    context: GridContextMenuContext<T>,
    defaults: readonly GridContextMenuItem<T>[],
  ) => readonly GridContextMenuItem<T>[];
}

/** Own bounded metadata without invoking or freezing borrowed action functions. */
export function prepareContextMenuItems<T>(
  input: readonly GridContextMenuItem<T>[],
): readonly GridContextMenuItem<T>[] {
  return prepareCommandMenuItems<GridContextMenuContext<T>>(input);
}
