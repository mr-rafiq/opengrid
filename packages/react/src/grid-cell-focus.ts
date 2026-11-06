import {
  useCallback,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CellPosition } from "@opengrid/core";

export interface GridCellFocusController {
  getSnapshot(): Readonly<CellPosition> | null;
  subscribe(listener: () => void): () => void;
  setFocusedCell(position: CellPosition | null): void;
}
const empty: CellPosition = Object.freeze({ rowId: "", columnId: "" });
const subscribeEmpty = () => () => {};
const readEmpty = () => null;
/** Optional external identity ownership; native grids retain their existing local state. */
export function useGridCellFocus(
  initial: CellPosition,
  controller?: GridCellFocusController,
): [Readonly<CellPosition>, Dispatch<SetStateAction<CellPosition>>] {
  const [local, setLocal] = useState(initial);
  const external = useSyncExternalStore(
    controller?.subscribe ?? subscribeEmpty,
    controller?.getSnapshot ?? readEmpty,
    controller?.getSnapshot ?? readEmpty,
  );
  const set = useCallback<Dispatch<SetStateAction<CellPosition>>>(
    (value) => {
      if (!controller) return setLocal(value);
      const current = controller.getSnapshot() ?? empty;
      const next = typeof value === "function" ? value({ ...current }) : value;
      controller.setFocusedCell(next.rowId && next.columnId ? next : null);
    },
    [controller],
  );
  return [controller ? (external ?? empty) : local, set];
}
