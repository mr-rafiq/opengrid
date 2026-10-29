import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import {
  createCellRangeModel,
  type CellPosition,
  type CellRange,
  type CellRangeModel,
  type CellRangeSnapshot,
  type GridModel,
} from "@opengrid/core";

const EMPTY: CellRangeSnapshot = Object.freeze({ range: null });
const emptySubscribe = () => () => {};
const emptySnapshot = () => EMPTY;
const interactive = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(
    target.closest('input,textarea,select,button,a,[contenteditable="true"]'),
  );

/** Owns browser interaction only. Selection geometry and atomic data changes live in core. */
export function useCellRanges<T>({
  model,
  rowIds,
  enabled,
  viewport,
  getFocusedCell,
  onMessage,
}: {
  model: GridModel<T>;
  rowIds: string[];
  enabled: boolean;
  viewport: RefObject<HTMLDivElement | null>;
  getFocusedCell: () => CellPosition | undefined;
  onMessage: (message: string, error?: boolean) => void;
}) {
  const ids = useRef(rowIds);
  ids.current = rowIds;
  const focused = useRef(getFocusedCell);
  focused.current = getFocusedCell;
  const message = useRef(onMessage);
  message.current = onMessage;
  const [controller, setController] = useState<CellRangeModel<T> | null>(null);
  const drag = useRef<{
    source?: CellRange;
    last?: CellPosition;
    x: number;
    y: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!enabled) {
      setController(null);
      return;
    }
    const next = createCellRangeModel(model, { getRowIds: () => ids.current });
    setController(next);
    return () => {
      next.dispose();
    };
  }, [model, enabled]);
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    controller?.getSnapshot ?? emptySnapshot,
  );
  const gridState = model.getState();
  const indices = useMemo(
    () => ({
      rows: new Map(rowIds.map((id, index) => [id, index])),
      columns: new Map(
        model
          .getColumns()
          .filter((c) => !c.hidden)
          .map((c, index) => [c.id, index]),
      ),
    }),
    [model, gridState, rowIds.length],
  );
  const range = snapshot.range;
  const bounds = range
    ? {
        startRow: indices.rows.get(range.anchor.rowId),
        endRow: indices.rows.get(range.focus.rowId),
        startColumn: indices.columns.get(range.anchor.columnId),
        endColumn: indices.columns.get(range.focus.columnId),
      }
    : null;
  const validBounds =
    bounds && Object.values(bounds).every((value) => value !== undefined)
      ? (bounds as {
          startRow: number;
          endRow: number;
          startColumn: number;
          endColumn: number;
        })
      : null;
  const selectedCellCount = validBounds
    ? (Math.abs(validBounds.endRow - validBounds.startRow) + 1) *
      (Math.abs(validBounds.endColumn - validBounds.startColumn) + 1)
    : 0;
  // View callbacks can change when pagination/grouping changes even before the model subscription runs.
  useLayoutEffect(() => {
    controller?.refresh();
  });
  useLayoutEffect(() => {
    if (!controller) return;
    let frame = 0;
    function positionAt(x: number, y: number): CellPosition | undefined {
      const element = document
        .elementFromPoint?.(x, y)
        ?.closest<HTMLElement>("[data-row-id][data-column-id]");
      if (!element || !viewport.current?.contains(element)) return;
      const rowId = element.dataset.rowId!,
        columnId = element.dataset.columnId!;
      if (!ids.current.includes(rowId)) return;
      return { rowId, columnId };
    }
    function extendAt(x: number, y: number) {
      const position = positionAt(x, y);
      if (!position) return;
      const previous = drag.current?.last;
      if (
        previous?.rowId === position.rowId &&
        previous.columnId === position.columnId
      )
        return;
      controller!.extend(position);
      if (drag.current) drag.current.last = position;
    }
    function tick() {
      const current = drag.current,
        container = viewport.current;
      if (!current || !container) return;
      const rect = container.getBoundingClientRect();
      const top = rect.top + 76,
        bottom = rect.bottom,
        left = rect.left,
        right = rect.right;
      const dy = current.y > bottom - 25 ? 20 : current.y < top + 25 ? -20 : 0;
      const dx = current.x > right - 25 ? 24 : current.x < left + 25 ? -24 : 0;
      if (dy || dx) {
        container.scrollTop += dy;
        container.scrollLeft += dx;
        extendAt(
          Math.max(left + 2, Math.min(right - 2, current.x)),
          Math.max(top + 2, Math.min(bottom - 2, current.y)),
        );
      }
      frame = requestAnimationFrame(tick);
    }
    function move(event: PointerEvent) {
      if (!drag.current) return;
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
      extendAt(event.clientX, event.clientY);
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function end(event: PointerEvent) {
      if (drag.current) extendAt(event.clientX, event.clientY);
      const current = drag.current;
      drag.current = null;
      cancelAnimationFrame(frame);
      frame = 0;
      if (current?.source) {
        const target = controller!.getSnapshot().range;
        if (!target) return;
        const error = controller!.fillRange(
          current.source,
          target,
          event.altKey ? "series" : "copy",
        );
        if (error) {
          controller!.setRange(current.source.anchor, current.source.focus);
          message.current(error, true);
        } else
          message.current("Range filled. Undo restores the previous values.");
      }
    }
    function cancel() {
      const source = drag.current?.source;
      drag.current = null;
      cancelAnimationFrame(frame);
      frame = 0;
      if (source) controller!.setRange(source.anchor, source.focus);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(frame);
      drag.current = null;
    };
  }, [controller, viewport]);

  function select(position: CellPosition, extend = false) {
    if (!controller || !ids.current.includes(position.rowId)) return;
    if (extend && controller.getSnapshot().range) controller.extend(position);
    else controller.setRange(position);
  }
  function begin(
    event: ReactPointerEvent<HTMLElement>,
    position: CellPosition,
  ) {
    if (
      !controller ||
      event.button !== 0 ||
      interactive(event.target) ||
      !ids.current.includes(position.rowId)
    )
      return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    select(position, event.shiftKey);
    drag.current = { last: position, x: event.clientX, y: event.clientY };
  }
  function ensureRange() {
    if (!controller) return false;
    if (!controller.getSnapshot().range) {
      const cell = focused.current();
      if (cell) controller.setRange(cell);
    }
    return Boolean(controller.getSnapshot().range);
  }
  function onCopy(event: ReactClipboardEvent<HTMLElement>) {
    if (interactive(event.target) || !ensureRange()) return;
    try {
      const value = controller!.copy();
      event.clipboardData.setData("text/plain", value);
      event.preventDefault();
      message.current("Selected cells copied.");
    } catch (error) {
      event.preventDefault();
      message.current(
        error instanceof Error ? error.message : "Unable to copy cells",
        true,
      );
    }
  }
  function onPaste(event: ReactClipboardEvent<HTMLElement>) {
    if (interactive(event.target) || !ensureRange()) return;
    event.preventDefault();
    const error = controller!.paste(event.clipboardData.getData("text/plain"));
    message.current(
      error ?? "Cells pasted. Undo restores the previous values.",
      Boolean(error),
    );
  }
  function fill(direction: "down" | "right") {
    if (!ensureRange()) return;
    const error = controller!.fill(direction);
    message.current(
      error ?? "Range filled. Undo restores the previous values.",
      Boolean(error),
    );
  }
  function fillHandle(event: ReactPointerEvent<HTMLElement>) {
    if (!controller || event.button !== 0) return;
    const source = controller.getSnapshot().range;
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = {
      source,
      last: source.focus,
      x: event.clientX,
      y: event.clientY,
    };
  }
  function selectAll() {
    if (!controller) return;
    const columns = model.getColumns().filter((c) => !c.hidden);
    const rows = ids.current;
    if (rows.length && columns.length)
      controller.setRange(
        { rowId: rows[0], columnId: columns[0].id },
        { rowId: rows.at(-1)!, columnId: columns.at(-1)!.id },
      );
  }
  function isEnd(position: CellPosition) {
    return Boolean(
      validBounds &&
      indices.rows.get(position.rowId) ===
        Math.max(validBounds.startRow, validBounds.endRow) &&
      indices.columns.get(position.columnId) ===
        Math.max(validBounds.startColumn, validBounds.endColumn),
    );
  }
  async function copyToClipboard() {
    if (!ensureRange()) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error(
          "Clipboard access is unavailable. Use the copy keyboard shortcut.",
        );
      await navigator.clipboard.writeText(controller!.copy());
      message.current("Selected cells copied.");
    } catch (error) {
      message.current(
        error instanceof Error ? error.message : "Clipboard write failed",
        true,
      );
    }
  }
  async function pasteFromClipboard() {
    if (!ensureRange()) return;
    try {
      if (!navigator.clipboard?.readText)
        throw new Error(
          "Clipboard access is unavailable. Use the paste keyboard shortcut.",
        );
      const error = controller!.paste(await navigator.clipboard.readText());
      message.current(
        error ?? "Cells pasted. Undo restores the previous values.",
        Boolean(error),
      );
    } catch (error) {
      message.current(
        error instanceof Error ? error.message : "Clipboard read failed",
        true,
      );
    }
  }
  return {
    controller,
    range: snapshot.range,
    selectedCellCount,
    select,
    begin,
    onCopy,
    onPaste,
    copyToClipboard,
    pasteFromClipboard,
    fill,
    fillHandle,
    selectAll,
    isEnd,
    clear: () => controller?.clear(),
    contains: (rowId: string, columnId: string) =>
      Boolean(controller?.contains(rowId, columnId)),
  };
}
