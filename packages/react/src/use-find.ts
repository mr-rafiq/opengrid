import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createFindModel,
  type FindModel,
  type FindSnapshot,
  type GridModel,
} from "@opengrid/core";
const empty: FindSnapshot = Object.freeze({
  query: "",
  matches: Object.freeze([]),
  activeIndex: -1,
});
const subscribeEmpty = () => () => {};
export function useFind<T>(model: GridModel<T>, rowIds: string[]) {
  const rows = useRef(rowIds);
  rows.current = rowIds;
  const [controller, setController] = useState<FindModel | null>(null);
  useLayoutEffect(() => {
    const next = createFindModel(model, { getRowIds: () => rows.current });
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
