import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Column, GridModel, GridState } from "@opengrid/core";
import { assertGridDirection, physicalToInlineDelta } from "./direction.js";
import type { GridDirection } from "./direction.js";

export interface ColumnResizePreview {
  readonly columnId: string;
  readonly width: number;
}
export interface UseColumnResizeOptions<T> {
  model: GridModel<T>;
  direction?: GridDirection;
  /** Stable identity for nonmodel view configuration. Never include the local preview. */
  viewKey?: unknown;
  enabled?: boolean;
  /** A pure latest-value guard; its function identity does not restart a gesture. */
  canResize?: () => boolean;
  onCommitError?: (reason: unknown) => void;
}
export interface ColumnResizeBinding<T> {
  readonly preview: ColumnResizePreview | null;
  isActive(): boolean;
  begin(
    event: ReactPointerEvent<HTMLElement>,
    column: Column<T>,
    width: number,
  ): void;
}
interface ActiveResize<T> {
  model: GridModel<T>;
  state: GridState;
  viewKey: unknown;
  direction: GridDirection;
  columnId: string;
  columnWidth: number | undefined;
  minimum: number;
  maximum: number;
  pinned: Column<T>["pinned"];
  target: HTMLElement;
  pointerId: number;
  pointerType: string;
  startX: number;
  startWidth: number;
  width: number;
  dispose: () => void;
}
const pointerId = (event: { pointerId?: number }) =>
  event.pointerId === undefined
    ? 0
    : Number.isSafeInteger(event.pointerId) && event.pointerId >= 0
      ? event.pointerId
      : null;
const safeCoordinate = (value: number) =>
  Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;

/** One primary-pointer resize. Moves only change local geometry; release writes at most once. */
export function useColumnResize<T>({
  model,
  direction = "ltr",
  viewKey,
  enabled = true,
  canResize,
  onCommitError,
}: UseColumnResizeOptions<T>): ColumnResizeBinding<T> {
  assertGridDirection(direction);
  const [preview, setPreview] = useState<ColumnResizePreview | null>(null);
  const active = useRef<ActiveResize<T> | null>(null);
  const mounted = useRef(true);
  const suppressedDowns = useRef(new WeakSet<Event>());
  const latest = useRef({
    model,
    direction,
    viewKey,
    enabled,
    canResize,
    onCommitError,
  });
  latest.current = {
    model,
    direction,
    viewKey,
    enabled,
    canResize,
    onCommitError,
  };
  function stop(render = true) {
    const gesture = active.current;
    if (!gesture) return;
    active.current = null;
    gesture.dispose();
    if (render && mounted.current) setPreview(null);
  }
  function valid(gesture: ActiveResize<T>) {
    const current = latest.current;
    try {
      return (
        current.model === gesture.model &&
        current.direction === gesture.direction &&
        Object.is(current.viewKey, gesture.viewKey) &&
        current.enabled &&
        current.canResize?.() !== false &&
        gesture.target.isConnected &&
        gesture.model.getState() === gesture.state
      );
    } catch {
      return false;
    }
  }
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop(false);
    };
  }, []);
  useLayoutEffect(() => {
    const gesture = active.current;
    if (gesture && !valid(gesture)) stop();
  });

  function begin(
    event: ReactPointerEvent<HTMLElement>,
    column: Column<T>,
    width: number,
  ) {
    if (suppressedDowns.current.has(event.nativeEvent)) return;
    if (active.current) {
      stop();
      return;
    }
    const current = latest.current,
      id = pointerId(event);
    if (
      !current.enabled ||
      id === null ||
      event.isPrimary === false ||
      (event.button !== undefined && event.button !== 0) ||
      !safeCoordinate(event.clientX) ||
      !safeCoordinate(width) ||
      width < 0
    )
      return;
    try {
      if (current.canResize?.() === false) return;
    } catch {
      return;
    }
    const target = event.currentTarget;
    if (!target.isConnected) return;
    const owner = target.ownerDocument.defaultView;
    if (!owner) return;
    let live: Column<T> | undefined, state: GridState;
    try {
      live = current.model
        .getColumns()
        .find((item) => item.id === column.id && !item.hidden);
      state = current.model.getState();
    } catch {
      return;
    }
    if (!live) return;
    const minimum = live.minWidth ?? 40,
      maximum = live.maxWidth ?? Infinity;
    if (
      !safeCoordinate(minimum) ||
      minimum < 0 ||
      typeof maximum !== "number" ||
      Number.isNaN(maximum) ||
      maximum < minimum
    )
      return;
    const constrained = Math.max(minimum, Math.min(maximum, width));
    if (!safeCoordinate(constrained)) return;
    event.preventDefault();
    let captured = false,
      unsubscribe: (() => void) | undefined;
    const gesture: ActiveResize<T> = {
      model: current.model,
      state,
      viewKey: current.viewKey,
      direction: current.direction,
      columnId: column.id,
      columnWidth: live.width,
      minimum,
      maximum,
      pinned: live.pinned,
      target,
      pointerId: id,
      pointerType: event.pointerType ?? "",
      startX: event.clientX,
      startWidth: width,
      width: constrained,
      dispose: () => {
        owner.removeEventListener("pointermove", move, true);
        owner.removeEventListener("pointerup", up, true);
        owner.removeEventListener("pointercancel", cancel, true);
        owner.removeEventListener("pointerdown", secondContact, true);
        owner.removeEventListener("keydown", key, true);
        owner.removeEventListener("blur", blur);
        target.removeEventListener("lostpointercapture", lostCapture);
        const disposeSubscription = unsubscribe;
        unsubscribe = undefined;
        try {
          disposeSubscription?.();
        } catch {
          /* Listener/capture cleanup must still finish if a custom unsubscribe rejects. */
        }
        if (captured) {
          captured = false;
          try {
            if (
              typeof target.releasePointerCapture === "function" &&
              (!target.hasPointerCapture || target.hasPointerCapture(id))
            )
              target.releasePointerCapture(id);
          } catch {
            /* The browser may already have released capture. */
          }
        }
      },
    };
    function matches(pointer: PointerEvent) {
      return pointerId(pointer) === id;
    }
    function move(pointer: PointerEvent) {
      if (active.current !== gesture || !matches(pointer)) return;
      if (
        pointer.isPrimary === false ||
        (gesture.pointerType &&
          pointer.pointerType &&
          gesture.pointerType !== pointer.pointerType) ||
        !valid(gesture) ||
        !safeCoordinate(pointer.clientX)
      ) {
        stop();
        return;
      }
      let next: number;
      try {
        next = Math.max(
          minimum,
          Math.min(
            maximum,
            gesture.startWidth +
              physicalToInlineDelta(
                pointer.clientX - gesture.startX,
                gesture.direction,
              ),
          ),
        );
      } catch {
        stop();
        return;
      }
      if (!safeCoordinate(next)) {
        stop();
        return;
      }
      if (pointer.cancelable) pointer.preventDefault();
      if (next !== gesture.width) {
        gesture.width = next;
        setPreview({ columnId: gesture.columnId, width: next });
      }
    }
    function up(pointer: PointerEvent) {
      if (active.current !== gesture || !matches(pointer)) return;
      let accepted =
        pointer.isPrimary !== false &&
        (!gesture.pointerType ||
          !pointer.pointerType ||
          gesture.pointerType === pointer.pointerType) &&
        valid(gesture);
      try {
        const latestColumn = gesture.model
          .getColumns()
          .find((item) => item.id === gesture.columnId);
        accepted =
          accepted &&
          !!latestColumn &&
          !latestColumn.hidden &&
          Object.is(latestColumn.width, gesture.columnWidth) &&
          (latestColumn.minWidth ?? 40) === minimum &&
          (latestColumn.maxWidth ?? Infinity) === maximum &&
          latestColumn.pinned === gesture.pinned;
      } catch {
        accepted = false;
      }
      const result = gesture.width;
      accepted = accepted && active.current === gesture && valid(gesture);
      // Release listeners/capture/subscription BEFORE a model write can notify subscribers.
      stop();
      if (accepted && valid(gesture) && result !== gesture.startWidth) {
        try {
          gesture.model.resizeColumn(gesture.columnId, result);
        } catch (reason) {
          latest.current.onCommitError?.(reason);
        }
      }
    }
    function cancel(pointer: PointerEvent) {
      if (active.current === gesture && matches(pointer)) stop();
    }
    function lostCapture(pointer: PointerEvent) {
      if (
        pointer.target === target &&
        active.current === gesture &&
        matches(pointer)
      )
        stop();
    }
    function secondContact(pointer: PointerEvent) {
      if (active.current === gesture) {
        suppressedDowns.current.add(pointer);
        stop();
      }
    }
    function key(keyboard: KeyboardEvent) {
      if (active.current === gesture && keyboard.key === "Escape") {
        if (keyboard.cancelable) keyboard.preventDefault();
        stop();
      }
    }
    function blur() {
      if (active.current === gesture) stop();
    }
    active.current = gesture;
    owner.addEventListener("pointermove", move, {
      capture: true,
      passive: false,
    });
    owner.addEventListener("pointerup", up, true);
    owner.addEventListener("pointercancel", cancel, true);
    owner.addEventListener("pointerdown", secondContact, true);
    owner.addEventListener("keydown", key, true);
    owner.addEventListener("blur", blur);
    target.addEventListener("lostpointercapture", lostCapture);
    // Legacy/synthetic MouseEvent pointer events have no browser-owned pointer to capture.
    if (
      event.pointerId !== undefined &&
      typeof target.setPointerCapture === "function"
    ) {
      try {
        target.setPointerCapture(id);
        captured = true;
      } catch {
        stop();
        return;
      }
    }
    try {
      const dispose = current.model.subscribe(() => {
        if (active.current === gesture) stop();
      });
      if (active.current === gesture) unsubscribe = dispose;
      else {
        dispose();
        return;
      }
    } catch {
      stop();
      return;
    }
    if (!valid(gesture)) {
      stop();
      return;
    }
    setPreview({ columnId: gesture.columnId, width: constrained });
  }
  return {
    // A render can replace the owning model/view before layout cleanup cancels.
    preview: active.current && valid(active.current) ? preview : null,
    begin,
    isActive: () => active.current !== null,
  };
}
