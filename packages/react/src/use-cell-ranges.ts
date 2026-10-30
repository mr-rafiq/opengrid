import { gridMessage, type GridMessage } from "./locale.js";
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
    target.closest(
      'dialog,[role="dialog"],input,textarea,select,button,a,[contenteditable="true"]',
    ),
  );
const pointerId = (event: { pointerId?: number }) =>
  Number.isFinite(event.pointerId) ? event.pointerId! : 1;
const pointerType = (event: { pointerType?: string }) =>
  event.pointerType || "mouse";
type FillMode = "copy" | "series";
interface OwnedRangeDrag<T> {
  pointerId: number;
  pointerType: string;
  captureTarget: HTMLElement;
  captured: boolean;
  model: GridModel<T>;
  modelState: object;
  viewKey: string;
  direction: string;
  before: CellRange | null;
  source?: CellRange;
  fillMode: FillMode;
  last?: CellPosition;
  x: number;
  y: number;
}

/** Owns browser interaction only. Selection geometry and atomic data changes live in core. */
export function useCellRanges<T>({
  model,
  rowIds,
  columnIds,
  enabled,
  viewport,
  getFocusedCell,
  onMessage,
  headerHeight = 76,
  pinnedTopHeight = 0,
  pinnedBottomHeight = 0,
}: {
  model: GridModel<T>;
  rowIds: string[];
  columnIds?: readonly string[];
  enabled: boolean;
  viewport: RefObject<HTMLDivElement | null>;
  getFocusedCell: () => CellPosition | undefined;
  onMessage: (message: GridMessage | string, error?: boolean) => void;
  headerHeight?: number;
  pinnedTopHeight?: number;
  pinnedBottomHeight?: number;
}) {
  const ids = useRef(rowIds);
  ids.current = rowIds;
  const columnOrder = useRef(columnIds);
  columnOrder.current = columnIds;
  function currentColumnIds() {
    const definitions = model.getColumns();
    if (columnOrder.current === undefined)
      return definitions
        .filter((column) => !column.hidden)
        .map((column) => column.id);
    const visible = new Set(
      definitions.filter((column) => !column.hidden).map((column) => column.id),
    );
    // A model notification can precede the render that removes a newly hidden ID.
    return columnOrder.current.filter((id) => visible.has(id));
  }
  const focused = useRef(getFocusedCell);
  focused.current = getFocusedCell;
  const message = useRef(onMessage);
  message.current = onMessage;
  const [controller, setController] = useState<CellRangeModel<T> | null>(null);
  const [extendOnTap, setExtendOnTap] = useState(false);
  const [fillMode, setFillMode] = useState<FillMode>("copy");
  const mode = useRef(fillMode);
  mode.current = fillMode;
  const drag = useRef<OwnedRangeDrag<T> | null>(null);
  const contacts = useRef(new Set<number>());
  const blockStart = useRef(false);
  const cancelCurrent = useRef<() => void>(() => {});
  const currentModel = useRef(model);
  currentModel.current = model;
  useLayoutEffect(() => {
    if (!enabled) {
      setController(null);
      return;
    }
    const next = createCellRangeModel(model, {
      getRowIds: () => ids.current,
      getColumnIds: currentColumnIds,
    });
    setController(next);
    return () => {
      cancelCurrent.current();
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
      columns: new Map(currentColumnIds().map((id, index) => [id, index])),
    }),
    [model, gridState, rowIds, columnIds],
  );
  const currentIndices = useRef(indices);
  currentIndices.current = indices;
  const signature = useMemo(
    () =>
      JSON.stringify([
        rowIds,
        currentColumnIds(),
        headerHeight,
        pinnedTopHeight,
        pinnedBottomHeight,
      ]),
    [
      model,
      gridState,
      rowIds,
      columnIds,
      headerHeight,
      pinnedTopHeight,
      pinnedBottomHeight,
    ],
  );
  const viewKey = useRef(signature);
  viewKey.current = signature;
  function direction() {
    const container = viewport.current;
    return container
      ? `${container.closest("[dir]")?.getAttribute("dir") ?? ""}|${getComputedStyle(container).direction || "ltr"}`
      : "ltr";
  }
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
    const current = drag.current;
    if (
      current &&
      (current.model !== currentModel.current ||
        current.modelState !== current.model.getState() ||
        current.viewKey !== viewKey.current ||
        current.direction !== direction())
    )
      cancelCurrent.current();
    controller?.refresh();
  });
  useLayoutEffect(() => {
    if (!controller) return;
    let frame = 0;
    function restore(current: OwnedRangeDrag<T>) {
      try {
        if (current.before)
          controller!.setRange(current.before.anchor, current.before.focus);
        else controller!.clear();
      } catch {
        // Stale endpoints may no longer belong to the current view. Clearing is
        // safer than restoring a selection against another row/column schema.
        controller!.clear();
      }
    }
    function release(current: OwnedRangeDrag<T>) {
      if (!current.captured) return;
      current.captured = false;
      try {
        if (
          !current.captureTarget.hasPointerCapture ||
          current.captureTarget.hasPointerCapture(current.pointerId)
        )
          current.captureTarget.releasePointerCapture?.(current.pointerId);
      } catch {
        /* The browser may already have released a cancelled pointer. */
      }
    }
    function cancel() {
      const current = drag.current;
      drag.current = null;
      cancelAnimationFrame(frame);
      frame = 0;
      if (!current) return;
      if (contacts.current.size) blockStart.current = true;
      release(current);
      restore(current);
    }
    cancelCurrent.current = cancel;
    function isFresh(current: OwnedRangeDrag<T>) {
      return (
        current.model === currentModel.current &&
        current.modelState === current.model.getState() &&
        current.viewKey === viewKey.current &&
        current.direction === direction() &&
        current.captureTarget.isConnected
      );
    }
    function owns(event: PointerEvent, current: OwnedRangeDrag<T>) {
      return (
        pointerId(event) === current.pointerId &&
        (!event.pointerType || event.pointerType === current.pointerType)
      );
    }
    function positionAt(x: number, y: number): CellPosition | undefined {
      const element = document
        .elementFromPoint?.(x, y)
        ?.closest<HTMLElement>("[data-row-id][data-column-id]");
      if (!element || !viewport.current?.contains(element)) return;
      if (
        element.closest('[role="grid"],[role="treegrid"]') !== viewport.current
      )
        return;
      const rowId = element.dataset.rowId!,
        columnId = element.dataset.columnId!;
      if (
        !currentIndices.current.rows.has(rowId) ||
        !currentIndices.current.columns.has(columnId)
      )
        return;
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
      try {
        controller!.extend(position);
      } catch {
        cancel();
        return;
      }
      if (drag.current) drag.current.last = position;
    }
    function tick() {
      const current = drag.current,
        container = viewport.current;
      if (!current || !container) return;
      if (!isFresh(current)) {
        cancel();
        return;
      }
      const rect = container.getBoundingClientRect();
      const top = rect.top + headerHeight + pinnedTopHeight,
        bottom = rect.bottom - pinnedBottomHeight,
        left = rect.left,
        right = rect.right;
      const overPin =
        (pinnedTopHeight > 0 &&
          current.y >= rect.top + headerHeight &&
          current.y < top) ||
        (pinnedBottomHeight > 0 &&
          current.y > bottom &&
          current.y <= rect.bottom);
      const dy = overPin
        ? 0
        : current.y > bottom - 25
          ? 20
          : current.y < top + 25
            ? -20
            : 0;
      const dx = current.x > right - 25 ? 24 : current.x < left + 25 ? -24 : 0;
      if (dy || dx) {
        container.scrollTop += dy;
        // dx is physical screen direction. Native negative RTL scrollLeft already
        // moves leftward when dx is negative; do not invert it a second time.
        container.scrollLeft += dx;
        extendAt(
          Math.max(left + 2, Math.min(right - 2, current.x)),
          overPin
            ? current.y
            : Math.max(top + 2, Math.min(bottom - 2, current.y)),
        );
      }
      if (drag.current) frame = requestAnimationFrame(tick);
    }
    function move(event: PointerEvent) {
      const current = drag.current;
      if (!current || !owns(event, current)) return;
      if (
        event.isPrimary === false ||
        !isFresh(current) ||
        !Number.isFinite(event.clientX) ||
        !Number.isFinite(event.clientY)
      ) {
        cancel();
        return;
      }
      current.x = event.clientX;
      current.y = event.clientY;
      extendAt(event.clientX, event.clientY);
      if (drag.current && !frame) frame = requestAnimationFrame(tick);
    }
    function end(event: PointerEvent) {
      const current = drag.current;
      if (!current || !owns(event, current)) return;
      if (
        event.isPrimary === false ||
        (event.button !== undefined && event.button !== 0) ||
        (event.buttons !== undefined && event.buttons !== 0) ||
        blockStart.current ||
        !isFresh(current) ||
        !Number.isFinite(event.clientX) ||
        !Number.isFinite(event.clientY)
      ) {
        cancel();
        return;
      }
      const releasedAt = positionAt(event.clientX, event.clientY);
      if (current.source && !releasedAt) {
        cancel();
        return;
      }
      if (releasedAt) extendAt(event.clientX, event.clientY);
      if (drag.current !== current) return;
      drag.current = null;
      cancelAnimationFrame(frame);
      frame = 0;
      release(current);
      if (current.source) {
        const target = controller!.getSnapshot().range;
        if (!target) {
          restore(current);
          return;
        }
        const error = controller!.fillRange(
          current.source,
          target,
          current.pointerType !== "touch" && event.altKey
            ? "series"
            : current.fillMode,
        );
        if (error) {
          restore(current);
          message.current(error, true);
        } else message.current(gridMessage("range.filled"));
      }
    }
    function down(event: PointerEvent) {
      const id = pointerId(event),
        duplicate = contacts.current.has(id);
      contacts.current.add(id);
      if (contacts.current.size > 1 || event.isPrimary === false || duplicate)
        blockStart.current = true;
      if (drag.current) cancel();
    }
    function up(event: PointerEvent) {
      try {
        end(event);
      } finally {
        contacts.current.delete(pointerId(event));
        if (!contacts.current.size) blockStart.current = false;
      }
    }
    function cancelled(event: PointerEvent) {
      if (drag.current && owns(event, drag.current)) cancel();
      contacts.current.delete(pointerId(event));
      if (!contacts.current.size) blockStart.current = false;
    }
    function lost(event: PointerEvent) {
      if (
        drag.current &&
        owns(event, drag.current) &&
        event.target === drag.current.captureTarget
      )
        cancel();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    }
    function blurred() {
      cancel();
      contacts.current.clear();
      blockStart.current = false;
    }
    const stopModel = model.subscribe(() => {
      if (drag.current) cancel();
    });
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancelled, true);
    window.addEventListener("lostpointercapture", lost, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blurred);
    return () => {
      cancel();
      stopModel();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancelled, true);
      window.removeEventListener("lostpointercapture", lost, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blurred);
      contacts.current.clear();
      blockStart.current = false;
      if (cancelCurrent.current === cancel) cancelCurrent.current = () => {};
    };
  }, [
    controller,
    model,
    viewport,
    headerHeight,
    pinnedTopHeight,
    pinnedBottomHeight,
  ]);

  function select(position: CellPosition, extend?: boolean) {
    if (
      !controller ||
      !enabled ||
      !currentIndices.current.rows.has(position.rowId) ||
      !currentIndices.current.columns.has(position.columnId)
    )
      return;
    const extending = extend ?? extendOnTap;
    if (extending && controller.getSnapshot().range)
      controller.extend(position);
    else controller.setRange(position);
  }
  function ownDrag(
    event: ReactPointerEvent<HTMLElement>,
    before: CellRange | null,
    source?: CellRange,
    last?: CellPosition,
  ) {
    if (
      !controller ||
      !enabled ||
      event.defaultPrevented ||
      event.isPrimary === false ||
      event.button !== 0 ||
      (event.buttons !== undefined &&
        event.buttons !== 0 &&
        event.buttons !== 1) ||
      blockStart.current ||
      contacts.current.size > 1 ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    )
      return false;
    const target = viewport.current ?? event.currentTarget;
    const current: OwnedRangeDrag<T> = {
      pointerId: pointerId(event),
      pointerType: pointerType(event),
      captureTarget: target,
      captured: false,
      model,
      modelState: model.getState(),
      viewKey: viewKey.current,
      direction: direction(),
      before,
      source,
      fillMode: mode.current,
      last,
      x: event.clientX,
      y: event.clientY,
    };
    drag.current = current;
    try {
      // Capture only the dedicated fill gesture. Capturing ordinary cell clicks
      // on the viewport retargets click/dblclick away from their cell owners.
      // Mouse/pen range drags keep their ID guard and window listeners instead.
      if (source && typeof target.setPointerCapture === "function") {
        target.setPointerCapture(current.pointerId);
        current.captured = true;
      }
    } catch {
      cancelCurrent.current();
      return false;
    }
    return true;
  }
  function begin(
    event: ReactPointerEvent<HTMLElement>,
    position: CellPosition,
  ) {
    if (
      !controller ||
      !enabled ||
      pointerType(event) === "touch" ||
      event.defaultPrevented ||
      event.isPrimary === false ||
      blockStart.current ||
      event.button !== 0 ||
      interactive(event.target) ||
      !currentIndices.current.rows.has(position.rowId) ||
      !currentIndices.current.columns.has(position.columnId)
    )
      return;
    const before = controller.getSnapshot().range;
    event.currentTarget.focus({ preventScroll: true });
    if (!ownDrag(event, before, undefined, position)) return;
    event.preventDefault();
    try {
      select(position, event.shiftKey);
    } catch {
      cancelCurrent.current();
    }
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
    if (
      event.defaultPrevented ||
      (event.target instanceof Element &&
        event.target.closest('[role="grid"],[role="treegrid"]') !==
          event.currentTarget)
    )
      return;
    if (interactive(event.target) || !ensureRange()) return;
    try {
      const value = controller!.copy();
      event.clipboardData.setData("text/plain", value);
      event.preventDefault();
      message.current(gridMessage("range.copied"));
    } catch (error) {
      event.preventDefault();
      message.current(
        error instanceof Error
          ? error.message
          : gridMessage("range.copyFailed"),
        true,
      );
    }
  }
  function onPaste(event: ReactClipboardEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      (event.target instanceof Element &&
        event.target.closest('[role="grid"],[role="treegrid"]') !==
          event.currentTarget)
    )
      return;
    if (interactive(event.target) || !ensureRange()) return;
    event.preventDefault();
    const error = controller!.paste(event.clipboardData.getData("text/plain"));
    message.current(error ?? gridMessage("range.pasted"), Boolean(error));
  }
  function fill(direction: "down" | "right") {
    if (!ensureRange()) return;
    const error = controller!.fill(direction);
    message.current(error ?? gridMessage("range.filled"), Boolean(error));
  }
  function fillHandle(event: ReactPointerEvent<HTMLElement>) {
    if (!controller || !enabled || event.button !== 0) return;
    const source = controller.getSnapshot().range;
    if (!source) return;
    if (!ownDrag(event, source, source, source.focus)) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function selectAll() {
    if (!controller) return;
    const columns = currentColumnIds();
    const rows = ids.current;
    if (rows.length && columns.length)
      controller.setRange(
        { rowId: rows[0], columnId: columns[0] },
        { rowId: rows.at(-1)!, columnId: columns.at(-1)! },
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
      if (!navigator.clipboard?.writeText) {
        message.current(gridMessage("range.copyUnavailable"), true);
        return;
      }
      await navigator.clipboard.writeText(controller!.copy());
      message.current(gridMessage("range.copied"));
    } catch (error) {
      message.current(
        error instanceof Error
          ? error.message
          : gridMessage("range.writeFailed"),
        true,
      );
    }
  }
  async function pasteFromClipboard() {
    if (!ensureRange()) return;
    try {
      if (!navigator.clipboard?.readText) {
        message.current(gridMessage("range.pasteUnavailable"), true);
        return;
      }
      const revision = model.getColumnRevision();
      const contents = await navigator.clipboard.readText();
      if (revision !== model.getColumnRevision()) return;
      const error = controller!.paste(contents);
      message.current(error ?? gridMessage("range.pasted"), Boolean(error));
    } catch (error) {
      message.current(
        error instanceof Error
          ? error.message
          : gridMessage("range.readFailed"),
        true,
      );
    }
  }
  return {
    controller,
    range: snapshot.range,
    selectedCellCount,
    extendOnTap,
    setExtendOnTap,
    fillMode,
    setFillMode,
    cancelGesture: () => cancelCurrent.current(),
    isGestureActive: () => drag.current !== null,
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
