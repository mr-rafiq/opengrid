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
  columnIds?: readonly string[],
) {
  const rows = useRef(rowIds);
  rows.current = rowIds;
  const columns = useRef(columnIds);
  columns.current = columnIds;
  const searchable = useRef(isCellSearchable);
  searchable.current = isCellSearchable;
  const [controller, setController] = useState<FindModel | null>(null);
  useLayoutEffect(() => {
    const next = createFindModel(model, {
      getRowIds: () => rows.current,
      getColumnIds: () => {
        const definitions = model.getColumns();
        if (columns.current === undefined)
          return definitions
            .filter((column) => !column.hidden)
            .map((column) => column.id);
        const hidden = new Set(
          definitions
            .filter((column) => column.hidden)
            .map((column) => column.id),
        );
        return columns.current.filter((id) => !hidden.has(id));
      },
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
