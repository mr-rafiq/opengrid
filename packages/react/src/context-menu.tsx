import { gridMessage } from "./locale.js";
import { GridCommandMenu } from "./command-menu.js";
import type {
  GridContextMenuContext,
  GridContextMenuItem,
} from "./context-menu-items.js";
export interface GridContextMenuProps<T> {
  context: GridContextMenuContext<T>;
  items: readonly GridContextMenuItem<T>[];
  point: Readonly<{ x: number; y: number }>;
  returnFocus: HTMLElement | null;
  /** Read authoritative ownership immediately before an action, including after awaits. */
  isCurrent: () => boolean;
  onClose: () => void;
  onRestoreFocus?: () => void;
}

/** Real-row wrapper over the shared bounded native command surface. */
export function GridContextMenu<T>(props: GridContextMenuProps<T>) {
  return (
    <GridCommandMenu
      {...props}
      title={gridMessage("contextMenu.title", {
        column: props.context.column.header ?? props.context.column.id,
        rowId: props.context.position.rowId,
      })}
    />
  );
}
