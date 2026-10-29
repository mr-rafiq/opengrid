import { useLayoutEffect, type RefObject } from "react";

/** Native child close cannot restore a launcher that became disabled while open. */
export function useNestedDialogFocus(
  dialog: RefObject<HTMLDialogElement | null>,
  owner: object | null,
  live: Readonly<{ current: { owner: object } | null }>,
) {
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!owner || !node) return;
    const document = node.ownerDocument;
    let cancelled = false,
      scheduled = false;
    function recover() {
      if (cancelled || scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (cancelled || live.current?.owner !== owner || !node!.open) return;
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        for (const candidate of node!.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,[tabindex]",
        )) {
          if (
            candidate.matches(":disabled") ||
            candidate.tabIndex < 0 ||
            candidate.closest("[hidden]")
          )
            continue;
          candidate.focus({ preventScroll: true });
          const next = document.activeElement;
          if (next && next !== document.body && next.isConnected) break;
        }
      });
    }
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.removedNodes].some(
            (removed) =>
              removed instanceof Element &&
              (removed.tagName === "DIALOG" || removed.querySelector("dialog")),
          ),
        )
      )
        recover();
    });
    observer.observe(node, { childList: true, subtree: true });
    if (node.parentElement)
      observer.observe(node.parentElement, { childList: true });
    const onClose = (event: Event) => {
      if (event.target instanceof HTMLDialogElement && event.target !== node)
        recover();
    };
    document.addEventListener("close", onClose, true);
    recover();
    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("close", onClose, true);
    };
  }, [dialog, owner, live]);
}
