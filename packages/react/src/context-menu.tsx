import { useLayoutEffect, useRef, useState } from "react";
import { FilterPopup } from "./filter-popup.js";
import { gridMessage, useGridLocale, type GridMessage } from "./locale.js";
import {
  GridContextMenuError,
  prepareContextMenuItems,
  type GridContextMenuContext,
  type GridContextMenuItem,
  type GridContextMenuAction,
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

/** Flat, bounded modeless menu; native popovers supply the unclipped browser top layer. */
export function GridContextMenu<T>({
  context,
  items,
  point,
  returnFocus,
  isCurrent,
  onClose,
  onRestoreFocus,
}: GridContextMenuProps<T>) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError(
      "Context menu points require finite viewport coordinates",
    );
  const { t, resolveMessage, locale } = useGridLocale();
  const prepared = prepareContextMenuItems(items);
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const live = useRef(false),
    running = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<GridMessage | string | null>(null);
  const latest = useRef({ isCurrent, onClose, onRestoreFocus });
  useLayoutEffect(() => {
    latest.current = { isCurrent, onClose, onRestoreFocus };
  }, [isCurrent, onClose, onRestoreFocus]);
  const prefix = useRef({ text: "", time: 0 });
  const failedAction = useRef<string | null>(null);
  const enabled = () =>
    [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>(
        'button[role^="menuitem"]',
      ) ?? []),
    ].filter((button) => !button.disabled);
  useLayoutEffect(() => {
    if (pending || !error || !failedAction.current) return;
    const node = menu.current,
      active = node?.ownerDocument.activeElement;
    if (active === node || active === node?.ownerDocument.body)
      (
        enabled().find(
          (button) => button.dataset.ogMenuId === failedAction.current,
        ) ??
        enabled()[0] ??
        node
      )?.focus({ preventScroll: true });
  }, [pending, error]);
  function scheduleRestore(node: HTMLElement | null) {
    queueMicrotask(() => {
      if (live.current) return;
      const document = node?.ownerDocument ?? returnFocus?.ownerDocument,
        active = document?.activeElement;
      if (
        active &&
        active !== document?.body &&
        active.isConnected &&
        !node?.contains(active)
      )
        return;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else latest.current.onRestoreFocus?.();
    });
  }
  function finish(restore = true) {
    if (!live.current) return;
    live.current = false;
    running.current?.abort();
    const node = root.current;
    latest.current.onClose();
    if (restore) scheduleRestore(node);
  }
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    live.current = true;
    running.current = null;
    failedAction.current = null;
    setPending(false);
    setError(null);
    const document = node.ownerDocument,
      view = document.defaultView;
    const beforeViewport = view
      ? [
          view.scrollX,
          view.scrollY,
          view.innerWidth,
          view.innerHeight,
          view.visualViewport?.offsetLeft,
          view.visualViewport?.offsetTop,
          view.visualViewport?.width,
          view.visualViewport?.height,
        ]
      : [];
    const ancestors = new Map<Element, readonly [number, number]>();
    for (
      let element = returnFocus?.parentElement;
      element;
      element = element.parentElement
    )
      ancestors.set(element, [element.scrollLeft, element.scrollTop]);
    let cleanup = false;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !node.contains(event.target))
        finish(false);
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && node.contains(event.target)) return;
      if (returnFocus && view) {
        const now = [
          view.scrollX,
          view.scrollY,
          view.innerWidth,
          view.innerHeight,
          view.visualViewport?.offsetLeft,
          view.visualViewport?.offsetTop,
          view.visualViewport?.width,
          view.visualViewport?.height,
        ];
        const sameViewport = now.every((value, index) =>
          Object.is(value, beforeViewport[index]),
        );
        const before =
          event.target instanceof Element
            ? ancestors.get(event.target)
            : undefined;
        // Opening can follow a browser auto-scroll whose event is still queued.
        // Only a changed invocation ancestor/viewport invalidates this menu.
        if (
          sameViewport &&
          (!before ||
            (event.target instanceof Element &&
              event.target.scrollLeft === before[0] &&
              event.target.scrollTop === before[1]))
        )
          return;
      }
      finish(false);
    };
    const toggle = (event: Event) => {
      if (!cleanup && (event as ToggleEvent).newState === "closed") finish();
    };
    node.addEventListener("toggle", toggle);
    if (typeof node.showPopover === "function") node.showPopover();
    else node.removeAttribute("popover");
    const place = () => {
      if (!view) return;
      const box = node.getBoundingClientRect(),
        viewport = view.visualViewport;
      const left = viewport?.offsetLeft ?? 0,
        top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? view.innerWidth,
        height = viewport?.height ?? view.innerHeight;
      node.style.left = `${Math.max(left + 4, Math.min(point.x, left + width - box.width - 4))}px`;
      node.style.top = `${Math.max(top + 4, Math.min(point.y, top + height - box.height - 4))}px`;
      node.style.maxHeight = `${Math.max(40, height - 8)}px`;
      node.style.maxWidth = `${Math.max(40, width - 8)}px`;
    };
    place();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    observer?.observe(node);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("scroll", scroll, true);
    view?.addEventListener("resize", scroll);
    view?.visualViewport?.addEventListener("resize", scroll);
    (enabled()[0] ?? menu.current)?.focus({ preventScroll: true });
    return () => {
      cleanup = true;
      const shouldRestore = live.current;
      live.current = false;
      running.current?.abort();
      running.current = null;
      observer?.disconnect();
      node.removeEventListener("toggle", toggle);
      if (
        typeof node.hidePopover === "function" &&
        node.matches(":popover-open")
      )
        node.hidePopover();
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("scroll", scroll, true);
      view?.removeEventListener("resize", scroll);
      view?.visualViewport?.removeEventListener("resize", scroll);
      if (shouldRestore) scheduleRestore(node);
    };
  }, [context, point, returnFocus]);
  async function execute(item: GridContextMenuAction<T>) {
    if (!live.current || running.current || item.disabled) return;
    try {
      if (!latest.current.isCurrent()) {
        finish();
        return;
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof GridContextMenuError
          ? reason.notice
          : gridMessage("contextMenu.failed"),
      );
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setPending(true);
    setError(null);
    menu.current?.focus({ preventScroll: true });
    try {
      await item.action(context, controller.signal);
      if (live.current && !controller.signal.aborted) finish();
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        finish();
        return;
      }
      if (live.current && !controller.signal.aborted) {
        failedAction.current = item.id;
        const message =
          reason instanceof GridContextMenuError
            ? reason.notice
            : reason instanceof Error && reason.message
              ? reason.message.slice(0, 1024)
              : gridMessage("contextMenu.failed");
        setError(message);
      }
    } finally {
      if (running.current === controller) running.current = null;
      if (live.current && !controller.signal.aborted) {
        setPending(false);
      }
    }
  }
  return (
    <FilterPopup>
      <div
        ref={root}
        popover="auto"
        className="og-context-menu-popup"
        lang={locale}
      >
        {error && (
          <p role="alert" dir="auto">
            {resolveMessage(error)}
          </p>
        )}
        {pending && (
          <p role="status" dir="auto">
            {t("contextMenu.running")}
          </p>
        )}
        <div
          ref={menu}
          role="menu"
          tabIndex={-1}
          aria-busy={pending || undefined}
          aria-label={t("contextMenu.title", {
            column: context.column.header ?? context.column.id,
            rowId: context.position.rowId,
          })}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              finish();
              return;
            }
            if (event.key === "Tab") {
              // Restore the invocation point before the browser performs ordinary Tab navigation.
              returnFocus?.focus({ preventScroll: true });
              finish(false);
              return;
            }
            const buttons = enabled(),
              index = buttons.indexOf(event.target as HTMLButtonElement);
            let next: number | undefined;
            if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
            else if (event.key === "ArrowUp")
              next =
                index < 0
                  ? buttons.length - 1
                  : (index - 1 + buttons.length) % buttons.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = buttons.length - 1;
            else if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              event.key !== " "
            ) {
              const now = Date.now(),
                character = event.key.toLocaleLowerCase(locale);
              const before = prefix.current;
              const search =
                now - before.time < 700 && before.text !== character
                  ? before.text + character
                  : character;
              prefix.current = { text: search, time: now };
              for (let offset = 1; offset <= buttons.length; offset++) {
                const at = (index + offset) % buttons.length;
                if (
                  (buttons[at].dataset.ogMenuLabel ?? "")
                    .toLocaleLowerCase(locale)
                    .startsWith(search)
                ) {
                  next = at;
                  break;
                }
              }
              event.preventDefault();
            }
            if (next !== undefined) {
              event.preventDefault();
              buttons[next]?.focus({ preventScroll: true });
            }
          }}
        >
          {prepared.map((item) =>
            item.kind === "separator" ? (
              <div key={item.id} role="separator" />
            ) : (
              <button
                key={item.id}
                type="button"
                role={
                  item.checked === undefined ? "menuitem" : "menuitemcheckbox"
                }
                aria-checked={item.checked}
                disabled={pending || item.disabled}
                tabIndex={-1}
                data-og-menu-id={item.id}
                data-og-menu-label={resolveMessage(item.label)}
                onClick={() => void execute(item)}
              >
                <span aria-hidden="true" className="og-context-menu-check">
                  {item.checked === "mixed" ? "−" : item.checked ? "✓" : ""}
                </span>
                <span dir="auto">{resolveMessage(item.label)}</span>
                {item.shortcut && (
                  <span
                    aria-hidden="true"
                    className="og-context-menu-shortcut"
                    dir="ltr"
                  >
                    {item.shortcut}
                  </span>
                )}
              </button>
            ),
          )}
          {!prepared.some((item) => item.kind === "action") && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => finish()}
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </div>
    </FilterPopup>
  );
}
