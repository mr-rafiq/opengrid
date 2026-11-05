import { useLayoutEffect, useRef } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";
import type { CellPosition } from "@opengrid/core";

const key = (position: CellPosition) =>
  JSON.stringify([position.rowId, position.columnId]);
const interactive =
  'dialog,[role="dialog"],button,input,select,textarea,a,summary,[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="combobox"],[role="switch"],[data-og-no-edit]';
interface InputTime {
  at: number;
  stamp: number | undefined;
}
function inputStamp(event: { timeStamp: number }): number | undefined {
  return Number.isFinite(event.timeStamp) && event.timeStamp >= 0
    ? event.timeStamp
    : undefined;
}
function inputTime(event: { timeStamp: number }): InputTime {
  return { at: Date.now(), stamp: inputStamp(event) };
}
function recent(
  previous: InputTime | null,
  event: { timeStamp: number },
  maximum: number,
): boolean {
  if (!previous) return false;
  const stamp = inputStamp(event);
  // Input timestamps describe the gesture; handler wall time includes rendering delays.
  const elapsed =
    stamp !== undefined && previous.stamp !== undefined
      ? stamp - previous.stamp
      : Date.now() - previous.at;
  return elapsed >= 0 && elapsed <= maximum;
}
/** Recognizes completed touch clicks without capturing or cancelling native pan/pinch. */
export function useTouchTaps({
  viewport,
  model,
  viewKey,
  direction,
  onTap,
  onDoubleTap,
}: {
  viewport: RefObject<HTMLElement | null>;
  model: unknown;
  viewKey: unknown;
  direction: "ltr" | "rtl";
  onTap(position: CellPosition): void;
  onDoubleTap(position: CellPosition): void;
}) {
  const callbacks = useRef({ onTap, onDoubleTap });
  callbacks.current = { onTap, onDoubleTap };
  const active = useRef<{
    id: number;
    position: CellPosition;
    x: number;
    y: number;
    clock: InputTime;
    top: number;
    left: number;
  } | null>(null);
  const previous = useRef<(InputTime & { position: CellPosition }) | null>(
    null,
  );
  const pending = useRef<
    (InputTime & { id: number; position: CellPosition; double: boolean }) | null
  >(null);
  const lastTouch = useRef<InputTime | null>(null);
  const blockedContacts = useRef(new Set<number>());
  function cancel() {
    active.current = null;
    previous.current = null;
    pending.current = null;
  }
  function positionAt(target: EventTarget | null): CellPosition | undefined {
    if (!(target instanceof Element) || target.closest(interactive)) return;
    const owner = target.closest('[role="grid"],[role="treegrid"]');
    if (owner !== viewport.current) return;
    const cell = target.closest<HTMLElement>("[data-row-id][data-column-id]");
    if (
      cell?.dataset.rowId !== undefined &&
      cell.dataset.columnId !== undefined
    )
      return { rowId: cell.dataset.rowId, columnId: cell.dataset.columnId };
  }
  useLayoutEffect(() => {
    cancel();
    blockedContacts.current.clear();
    const node = viewport.current;
    const secondContact = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      if (blockedContacts.current.size) {
        blockedContacts.current.add(event.pointerId);
        return;
      }
      if (active.current && event.pointerId !== active.current.id) {
        blockedContacts.current.add(active.current.id);
        blockedContacts.current.add(event.pointerId);
        lastTouch.current = inputTime(event);
        cancel();
      }
    };
    const released = (event: globalThis.PointerEvent) =>
      blockedContacts.current.delete(event.pointerId);
    const blur = () => cancel();
    const resetContacts = () => {
      cancel();
      blockedContacts.current.clear();
    };
    window.addEventListener("pointerdown", secondContact, true);
    window.addEventListener("pointerup", released, true);
    window.addEventListener("pointercancel", released, true);
    window.addEventListener("blur", resetContacts);
    node?.addEventListener("scroll", blur, { passive: true });
    return () => {
      cancel();
      blockedContacts.current.clear();
      window.removeEventListener("pointerdown", secondContact, true);
      window.removeEventListener("pointerup", released, true);
      window.removeEventListener("pointercancel", released, true);
      window.removeEventListener("blur", resetContacts);
      node?.removeEventListener("scroll", blur);
    };
  }, [viewport, model, viewKey, direction]);
  return {
    cancel,
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== "touch") {
        cancel();
        lastTouch.current = null;
        return;
      }
      lastTouch.current = inputTime(event);
      const position = positionAt(event.target),
        node = viewport.current;
      if (
        !position ||
        !node ||
        event.isPrimary === false ||
        blockedContacts.current.size ||
        active.current ||
        !Number.isFinite(event.pointerId)
      ) {
        cancel();
        return;
      }
      active.current = {
        id: event.pointerId,
        position,
        x: event.clientX,
        y: event.clientY,
        clock: inputTime(event),
        top: node.scrollTop,
        left: node.scrollLeft,
      };
      pending.current = null;
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const contact = active.current;
      if (
        contact?.id === event.pointerId &&
        Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 10
      )
        cancel();
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const contact = active.current;
      if (!contact || contact.id !== event.pointerId) return;
      active.current = null;
      const now = inputTime(event),
        node = viewport.current,
        position = positionAt(event.target);
      if (
        !node ||
        !position ||
        event.isPrimary === false ||
        key(position) !== key(contact.position) ||
        !recent(contact.clock, event, 500) ||
        Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 10 ||
        node.scrollTop !== contact.top ||
        node.scrollLeft !== contact.left
      ) {
        cancel();
        return;
      }
      const double =
        !!previous.current &&
        key(previous.current.position) === key(position) &&
        recent(previous.current, event, 350);
      pending.current = { position, ...now, id: contact.id, double };
      previous.current = double ? null : { position, ...now };
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === "touch") {
        lastTouch.current = inputTime(event);
        cancel();
      }
    },
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      if (active.current?.id === event.pointerId) cancel();
    },
    onContextMenu: cancel,
    consumeClick(event: MouseEvent<HTMLElement>, position: CellPosition) {
      if (event.detail === 0) return false;
      const native = event.nativeEvent as globalThis.PointerEvent,
        nativeType = native.pointerType;
      const completion = pending.current;
      const touch =
        nativeType === "touch" ||
        (!nativeType && recent(lastTouch.current, event, 800));
      if (!touch) return false;
      pending.current = null;
      if (
        !completion ||
        !recent(completion, event, 500) ||
        (Number.isFinite(native.pointerId) &&
          native.pointerId >= 0 &&
          native.pointerId !== completion.id) ||
        key(completion.position) !== key(position) ||
        !positionAt(event.target)
      )
        return true;
      callbacks.current.onTap(position);
      if (completion.double) callbacks.current.onDoubleTap(position);
      return true;
    },
    suppressDoubleClick(event: MouseEvent<HTMLElement>) {
      return (
        (event.nativeEvent as globalThis.PointerEvent).pointerType !==
          "mouse" && recent(lastTouch.current, event, 800)
      );
    },
  };
}
