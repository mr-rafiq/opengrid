import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createFindModel,
  type FindModel,
  type FindSnapshot,
  type GridModel,
  type CellPosition,
} from "@opengrid/core";
const empty: FindSnapshot = Object.freeze({
  query: "",
  matches: Object.freeze([]),
  activeIndex: -1,
});
const subscribeEmpty = () => () => {};
export function useFind<T>(
  model: GridModel<T>,
  rowIds: string[],
  isCellSearchable?: (position: CellPosition) => boolean,
) {
  const rows = useRef(rowIds);
  rows.current = rowIds;
  const searchable = useRef(isCellSearchable);
  searchable.current = isCellSearchable;
  const [controller, setController] = useState<FindModel | null>(null);
  useLayoutEffect(() => {
    const next = createFindModel(model, {
      getRowIds: () => rows.current,
      isCellSearchable: (position) => searchable.current?.(position) ?? true,
    });
    setController(next);
    return () => next.dispose();
  }, [model]);
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? subscribeEmpty,
    controller?.getSnapshot ?? (() => empty),
    controller?.getSnapshot ?? (() => empty),
  );
  useLayoutEffect(() => {
    controller?.refresh();
  });
  return { controller, snapshot };
}
