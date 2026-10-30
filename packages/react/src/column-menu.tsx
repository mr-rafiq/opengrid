import type { Column, GridModel } from "@opengrid/core";
import { GridCommandMenu } from "./command-menu.js";
import {
  prepareCommandMenuItems,
  type CommandMenuAction,
  type CommandMenuSeparator,
  type CommandMenuSubmenu,
} from "./command-menu-items.js";
import { gridMessage } from "./locale.js";
export { COMMAND_MENU_LIMITS as COLUMN_MENU_LIMITS } from "./command-menu-items.js";
export interface GridColumnMenuContext<T> {
  readonly model: GridModel<T>;
  readonly column: Column<T>;
  readonly origin: "button" | "keyboard" | "context";
}
export interface GridColumnMenuAction<T> extends CommandMenuAction<
  GridColumnMenuContext<T>
> {}
export interface GridColumnMenuSeparator extends CommandMenuSeparator {}
export interface GridColumnMenuSubmenu<T> extends CommandMenuSubmenu<
  GridColumnMenuContext<T>
> {}
export type GridColumnMenuItem<T> =
  GridColumnMenuAction<T> | GridColumnMenuSeparator | GridColumnMenuSubmenu<T>;
export interface GridColumnMenuOptions<T> {
  readonly getItems?: (
    context: GridColumnMenuContext<T>,
    defaults: readonly GridColumnMenuItem<T>[],
  ) => readonly GridColumnMenuItem<T>[];
}
export function prepareColumnMenuItems<T>(
  input: readonly GridColumnMenuItem<T>[],
): readonly GridColumnMenuItem<T>[] {
  return prepareCommandMenuItems<GridColumnMenuContext<T>>(input);
}
export interface GridColumnMenuProps<T> {
  context: GridColumnMenuContext<T>;
  items: readonly GridColumnMenuItem<T>[];
  point: Readonly<{ x: number; y: number }>;
  returnFocus: HTMLElement | null;
  isCurrent: () => boolean;
  onClose: () => void;
  onRestoreFocus?: () => void;
}
/** Header-only context; no artificial data row is constructed. */
export function GridColumnMenu<T>(props: GridColumnMenuProps<T>) {
  return (
    <GridCommandMenu
      {...props}
      title={gridMessage("columnMenu.title", {
        column: props.context.column.header ?? props.context.column.id,
      })}
      ownerColumnId={props.context.column.id}
    />
  );
}
