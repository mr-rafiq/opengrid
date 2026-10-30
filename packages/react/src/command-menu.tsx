import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { FilterPopup } from "./filter-popup.js";
import { CommandSubmenu, isRtlMenu } from "./command-submenu.js";
import { gridMessage, useGridLocale, type GridMessage } from "./locale.js";
import {
  GridContextMenuError,
  prepareCommandMenuItems,
  type CommandMenuItem,
  type CommandMenuAction,
} from "./command-menu-items.js";

export interface GridCommandMenuProps<Context> {
  context: Context;
  title: string | GridMessage;
  /** Internal grid popup ownership, shared with header filter retention. */
  ownerColumnId?: string;
  items: readonly CommandMenuItem<Context>[];
  point: Readonly<{ x: number; y: number }>;
  returnFocus: HTMLElement | null;
  /** Read authoritative ownership immediately before an action, including after awaits. */
  isCurrent: () => boolean;
  onClose: () => void;
  onRestoreFocus?: () => void;
}

/** Bounded modeless command tree; native popovers supply the unclipped browser top layer. */
export function GridCommandMenu<Context>({
  context,
  items,
  title,
  ownerColumnId,
  point,
  returnFocus,
  isCurrent,
  onClose,
  onRestoreFocus,
}: GridCommandMenuProps<Context>) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError(
      "Context menu points require finite viewport coordinates",
    );
  const { t, resolveMessage, locale } = useGridLocale();
  const prepared = prepareCommandMenuItems(items);
  const menuId = useId();
  const indices = new Map<string, number>();
  function indexItems(items: readonly CommandMenuItem<Context>[]) {
    for (const item of items) {
      indices.set(item.id, indices.size);
      if (item.kind === "submenu") indexItems(item.items);
    }
  }
  indexItems(prepared);
  const itemId = (id: string) => `${menuId}-item-${indices.get(id)}`;
  const childId = (id: string) => `${menuId}-menu-${indices.get(id)}`;
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const live = useRef(false),
    running = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<GridMessage | string | null>(null);
  const [openPath, setOpenPath] = useState<readonly string[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const pathRef = useRef(openPath),
    buttons = useRef(new Map<string, HTMLButtonElement>()),
    levels = useRef(new Map<string, HTMLDivElement>());
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputMode = useRef<"keyboard" | "pointer">("keyboard");
  const pointerPosition = useRef<readonly [number, number] | null>(null);
  const activePath: string[] = [];
  let levelItems = prepared;
  for (const id of openPath) {
    const branch = levelItems.find(
      (item) => item.kind === "submenu" && item.id === id && !item.disabled,
    );
    if (!branch || branch.kind !== "submenu") break;
    activePath.push(id);
    levelItems = branch.items;
  }
  useLayoutEffect(() => {
    pathRef.current = activePath;
    if (activePath.length !== openPath.length) setOpenPath(activePath);
  });
  const latest = useRef({ isCurrent, onClose, onRestoreFocus });
  useLayoutEffect(() => {
    latest.current = { isCurrent, onClose, onRestoreFocus };
  }, [isCurrent, onClose, onRestoreFocus]);
  const prefix = useRef(
    new Map<string | null, { text: string; time: number }>(),
  );
  const failedAction = useRef<string | null>(null);
  const enabled = (scope: HTMLElement | null = menu.current) =>
    [
      ...(scope?.querySelectorAll<HTMLButtonElement>(
        'button[role^="menuitem"]',
      ) ?? []),
    ].filter(
      (button) => !button.disabled && button.closest('[role="menu"]') === scope,
    );
  function focusItem(element: HTMLElement | null | undefined) {
    if (!element) return;
    element.focus({ preventScroll: true });
    const popup = element.closest<HTMLElement>(".og-context-menu-popup");
    if (!popup || !popup.clientHeight) return;
    const box = element.getBoundingClientRect(),
      container = popup.getBoundingClientRect();
    const top = container.top + popup.clientTop,
      bottom = top + popup.clientHeight;
    if (box.top < top) popup.scrollTop -= top - box.top;
    else if (box.bottom > bottom) popup.scrollTop += box.bottom - bottom;
  }
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const target = levels.current.get(focusRequest.id);
    if (target) focusItem(enabled(target)[0] ?? target);
    setFocusRequest(null);
  }, [focusRequest, openPath]);
  useLayoutEffect(() => {
    if (pending || !error || !failedAction.current) return;
    const document = root.current?.ownerDocument,
      active = document?.activeElement;
    const target = buttons.current.get(failedAction.current);
    if (
      active === document?.body ||
      (active instanceof Element &&
        active.getAttribute("role") === "menu" &&
        root.current?.contains(active))
    )
      focusItem(
        target && !target.disabled ? target : (enabled()[0] ?? menu.current),
      );
  }, [pending, error]);
  function stopHover() {
    if (hover.current !== null) {
      clearTimeout(hover.current);
      hover.current = null;
    }
  }
  function current() {
    try {
      if (live.current && latest.current.isCurrent()) return true;
      finish();
    } catch (reason: unknown) {
      setError(
        reason instanceof GridContextMenuError
          ? reason.notice
          : gridMessage("contextMenu.failed"),
      );
    }
    return false;
  }
  function openBranch(id: string, parent: readonly string[], focus: boolean) {
    stopHover();
    if (running.current || !current()) return;
    prefix.current.delete(id);
    if (focus) inputMode.current = "keyboard";
    setOpenPath([...parent, id]);
    setFocusRequest(focus ? { id } : null);
  }
  function closeBranch(
    id: string,
    parent: readonly string[],
    restore: boolean,
  ) {
    if (
      !live.current ||
      pathRef.current[parent.length] !== id ||
      parent.some((value, index) => pathRef.current[index] !== value)
    )
      return;
    stopHover();
    if (running.current) {
      finish(restore);
      return;
    }
    setOpenPath(parent);
    if (restore) focusItem(buttons.current.get(id));
  }
  function hoverItem(
    item: CommandMenuItem<Context>,
    path: readonly string[],
    target: HTMLButtonElement,
    pointerType: string,
  ) {
    if (pointerType !== "mouse" || inputMode.current !== "pointer") return;
    stopHover();
    if (item.kind === "separator" || item.disabled || running.current) return;
    if (item.kind === "submenu")
      hover.current = setTimeout(() => {
        hover.current = null;
        if (target.isConnected) {
          openBranch(item.id, path, false);
          focusItem(target);
        }
      }, 150);
    else {
      setOpenPath(path);
      focusItem(target);
    }
  }
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
      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
        const next = document?.activeElement;
        if (
          next === returnFocus ||
          (next &&
            next !== document?.body &&
            next.isConnected &&
            !node?.contains(next))
        )
          return;
      }
      latest.current.onRestoreFocus?.();
    });
  }
  function finish(restore = true) {
    if (!live.current) return;
    live.current = false;
    stopHover();
    running.current?.abort();
    const node = root.current;
    latest.current.onClose();
    if (restore) scheduleRestore(node);
  }
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    live.current = true;
    inputMode.current = "keyboard";
    pointerPosition.current = null;
    setOpenPath([]);
    setFocusRequest(null);
    prefix.current.clear();
    running.current = null;
    failedAction.current = null;
    setPending(false);
    setError(null);
    const document = node.ownerDocument,
      view = document.defaultView;
    const pointerMove = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType !== "mouse") return;
      const previous = pointerPosition.current;
      if (
        !previous ||
        pointer.clientX !== previous[0] ||
        pointer.clientY !== previous[1]
      )
        inputMode.current = "pointer";
      pointerPosition.current = [pointer.clientX, pointer.clientY];
    };
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
    const scrollPosition = (element: Element): readonly [number, number] => [
      // DataGrid uses the modern negative RTL scroll model. Its direction switch
      // preserves the inline offset even though the native horizontal sign flips.
      element.matches('[role="grid"],[role="treegrid"]') &&
      element.getAttribute("dir") === "rtl"
        ? -element.scrollLeft
        : element.scrollLeft,
      element.scrollTop,
    ];
    const ancestors = new Map<Element, readonly [number, number]>();
    for (
      let element = returnFocus?.parentElement;
      element;
      element = element.parentElement
    )
      ancestors.set(element, scrollPosition(element));
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
              scrollPosition(event.target)[0] === before[0] &&
              scrollPosition(event.target)[1] === before[1]))
        )
          return;
      }
      finish();
    };
    const toggle = (event: Event) => {
      if (!cleanup && (event as ToggleEvent).newState === "closed") finish();
    };
    node.addEventListener("toggle", toggle);
    if (typeof node.showPopover === "function") node.showPopover();
    else node.removeAttribute("popover");
    const place = () => {
      if (!view) return;
      const viewport = view.visualViewport;
      const left = viewport?.offsetLeft ?? 0,
        top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? view.innerWidth,
        height = viewport?.height ?? view.innerHeight;
      node.style.minWidth = `${Math.min(240, Math.max(40, width - 8))}px`;
      node.style.maxHeight = `${Math.max(40, height - 8)}px`;
      node.style.maxWidth = `${Math.max(40, width - 8)}px`;
      const box = node.getBoundingClientRect();
      node.style.left = `${Math.max(left + 4, Math.min(point.x, left + width - box.width - 4))}px`;
      node.style.top = `${Math.max(top + 4, Math.min(point.y, top + height - box.height - 4))}px`;
    };
    place();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    observer?.observe(node);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("scroll", scroll, true);
    view?.addEventListener("resize", scroll);
    view?.visualViewport?.addEventListener("resize", scroll);
    (enabled()[0] ?? menu.current)?.focus({ preventScroll: true });
    return () => {
      cleanup = true;
      stopHover();
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
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("scroll", scroll, true);
      view?.removeEventListener("resize", scroll);
      view?.visualViewport?.removeEventListener("resize", scroll);
      if (shouldRestore) scheduleRestore(node);
    };
  }, [context, point, returnFocus]);
  async function execute(
    item: CommandMenuAction<Context>,
    scope: HTMLElement | null,
  ) {
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
    scope?.focus({ preventScroll: true });
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
  function renderMenu(
    entries: readonly CommandMenuItem<Context>[],
    path: readonly string[],
    labelledBy?: string,
  ) {
    const level = path.at(-1) ?? null;
    function keyDown(event: KeyboardEvent<HTMLDivElement>) {
      inputMode.current = "keyboard";
      stopHover();
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        if (level !== null && !running.current)
          closeBranch(level, path.slice(0, -1), true);
        else finish();
        return;
      }
      if (event.key === "Tab") {
        returnFocus?.focus({ preventScroll: true });
        finish(false);
        return;
      }
      if (running.current) {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
            " ",
            "Enter",
          ].includes(event.key)
        )
          event.preventDefault();
        return;
      }
      const scope = event.currentTarget,
        choices = enabled(scope),
        index = choices.indexOf(event.target as HTMLButtonElement);
      const rtl = isRtlMenu(scope);
      const forward = rtl ? "ArrowLeft" : "ArrowRight",
        backward = rtl ? "ArrowRight" : "ArrowLeft";
      if (event.key === forward || event.key === backward) {
        event.preventDefault();
        if (event.key === backward && level !== null)
          closeBranch(level, path.slice(0, -1), true);
        else if (event.key === forward) {
          const entry = entries.find(
            (item) => item.id === choices[index]?.dataset.ogMenuId,
          );
          if (entry?.kind === "submenu" && !entry.disabled)
            openBranch(entry.id, path, true);
        }
        return;
      }
      let next: number | undefined;
      if (event.key === "ArrowDown") next = (index + 1) % choices.length;
      else if (event.key === "ArrowUp")
        next =
          index < 0
            ? choices.length - 1
            : (index - 1 + choices.length) % choices.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = choices.length - 1;
      else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key !== " "
      ) {
        const now = Date.now(),
          character = event.key.toLocaleLowerCase(locale),
          before = prefix.current.get(level) ?? { text: "", time: 0 };
        const search =
          now - before.time < 700 && before.text !== character
            ? before.text + character
            : character;
        prefix.current.set(level, { text: search, time: now });
        for (let offset = 1; offset <= choices.length; offset++) {
          const at = (index + offset) % choices.length;
          if (
            (choices[at].dataset.ogMenuLabel ?? "")
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
        stopHover();
        setOpenPath(path);
        focusItem(choices[next]);
      }
    }
    return (
      <div
        ref={(element) => {
          if (level === null) menu.current = element;
          else if (element) levels.current.set(level, element);
          else levels.current.delete(level);
        }}
        id={level === null ? undefined : childId(level)}
        role="menu"
        tabIndex={-1}
        aria-busy={pending || undefined}
        aria-label={level === null ? resolveMessage(title) : undefined}
        aria-labelledby={labelledBy}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={keyDown}
      >
        {entries.map((item) => {
          if (item.kind === "separator")
            return <div key={item.id} role="separator" />;
          const checked = item.kind === "action" ? item.checked : undefined;
          const expanded =
            item.kind === "submenu" && activePath[path.length] === item.id;
          return (
            <Fragment key={item.id}>
              <button
                ref={(element) => {
                  if (element) buttons.current.set(item.id, element);
                  else buttons.current.delete(item.id);
                }}
                id={itemId(item.id)}
                type="button"
                role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={checked}
                aria-haspopup={item.kind === "submenu" ? "menu" : undefined}
                aria-expanded={item.kind === "submenu" ? expanded : undefined}
                aria-controls={expanded ? childId(item.id) : undefined}
                disabled={pending || item.disabled}
                tabIndex={-1}
                data-og-menu-id={item.id}
                data-og-menu-label={resolveMessage(item.label)}
                onPointerEnter={(event) =>
                  hoverItem(item, path, event.currentTarget, event.pointerType)
                }
                onPointerMove={(event) =>
                  hoverItem(item, path, event.currentTarget, event.pointerType)
                }
                onPointerLeave={stopHover}
                onClick={(event) => {
                  stopHover();
                  if (item.kind === "submenu") openBranch(item.id, path, true);
                  else
                    void execute(
                      item,
                      event.currentTarget.closest<HTMLElement>('[role="menu"]'),
                    );
                }}
              >
                <span aria-hidden="true" className="og-context-menu-check">
                  {checked === "mixed" ? "-" : checked ? "\u2713" : ""}
                </span>
                <span dir="auto">{resolveMessage(item.label)}</span>
                {item.kind === "submenu" ? (
                  <span
                    aria-hidden="true"
                    className="og-context-menu-shortcut og-context-menu-chevron"
                  >
                    {"\u25b8"}
                  </span>
                ) : (
                  item.shortcut && (
                    <span
                      aria-hidden="true"
                      className="og-context-menu-shortcut"
                      dir="ltr"
                    >
                      {item.shortcut}
                    </span>
                  )
                )}
              </button>
              {item.kind === "submenu" && expanded && (
                <CommandSubmenu
                  anchor={buttons.current.get(item.id) ?? null}
                  onDismiss={(restore) => closeBranch(item.id, path, restore)}
                >
                  {renderMenu(item.items, [...path, item.id], itemId(item.id))}
                </CommandSubmenu>
              )}
            </Fragment>
          );
        })}
        {!entries.some((item) => item.kind !== "separator") && (
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
    );
  }
  return (
    <FilterPopup>
      <div
        ref={root}
        popover="auto"
        className="og-context-menu-popup"
        data-og-filter-column={ownerColumnId}
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
        {renderMenu(prepared, [])}
      </div>
    </FilterPopup>
  );
}
