import { useLayoutEffect, useRef, type ReactNode } from "react";

export function isRtlMenu(element: HTMLElement): boolean {
  const direction =
    element.ownerDocument.defaultView?.getComputedStyle(element).direction;
  return direction
    ? direction === "rtl"
    : element.closest("[dir]")?.getAttribute("dir") === "rtl";
}

/** A DOM descendant of its parent popover, so native light dismissal preserves the stack. */
export function CommandSubmenu({
  anchor,
  onDismiss,
  children,
}: {
  anchor: HTMLButtonElement | null;
  onDismiss(restoreFocus: boolean): void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    latest = useRef(onDismiss),
    place = useRef(() => {});
  useLayoutEffect(() => {
    latest.current = onDismiss;
  }, [onDismiss]);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || !anchor?.isConnected) {
      latest.current(false);
      return;
    }
    const document = node.ownerDocument,
      view = document.defaultView;
    let disposed = false;
    const restore = () =>
      document.activeElement === document.body ||
      Boolean(document.activeElement && node.contains(document.activeElement));
    const toggle = (event: Event) => {
      if (
        !disposed &&
        event.target === node &&
        (event as ToggleEvent).newState === "closed"
      )
        latest.current(restore());
    };
    const parentScroll = () => {
      if (!disposed) latest.current(restore());
    };
    const parent = anchor.closest(".og-context-menu-popup");
    node.addEventListener("toggle", toggle);
    try {
      if (typeof node.showPopover === "function") node.showPopover();
      else node.removeAttribute("popover");
    } catch {
      node.removeEventListener("toggle", toggle);
      latest.current(false);
      return;
    }
    place.current = () => {
      if (disposed || !view) return;
      if (!anchor.isConnected) {
        latest.current(false);
        return;
      }
      const viewport = view.visualViewport;
      const left = viewport?.offsetLeft ?? 0,
        top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? view.innerWidth,
        height = viewport?.height ?? view.innerHeight;
      node.style.minWidth = `${Math.min(240, Math.max(40, width - 8))}px`;
      node.style.maxWidth = `${Math.max(40, width - 8)}px`;
      node.style.maxHeight = `${Math.max(40, height - 8)}px`;
      const box = node.getBoundingClientRect(),
        origin = anchor.getBoundingClientRect();
      const rtl = isRtlMenu(anchor);
      const forward = rtl ? origin.left - box.width : origin.right;
      const reverse = rtl ? origin.right : origin.left - box.width;
      const fits = (x: number) =>
        x >= left + 4 && x + box.width <= left + width - 4;
      const x = fits(forward) ? forward : fits(reverse) ? reverse : forward;
      node.style.left = `${Math.max(left + 4, Math.min(x, left + width - box.width - 4))}px`;
      node.style.top = `${Math.max(top + 4, Math.min(origin.top, top + height - box.height - 4))}px`;
    };
    place.current();
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => place.current())
        : null;
    observer?.observe(node);
    observer?.observe(anchor);
    parent?.addEventListener("scroll", parentScroll);
    return () => {
      disposed = true;
      place.current = () => {};
      observer?.disconnect();
      parent?.removeEventListener("scroll", parentScroll);
      node.removeEventListener("toggle", toggle);
      if (
        typeof node.hidePopover === "function" &&
        node.matches(":popover-open")
      )
        node.hidePopover();
    };
  }, [anchor]);
  // Direction/translation can change position without resizing either box.
  useLayoutEffect(() => {
    place.current();
  });
  return (
    <div
      ref={root}
      popover="auto"
      className="og-context-menu-popup og-context-submenu-popup"
    >
      {children}
    </div>
  );
}
