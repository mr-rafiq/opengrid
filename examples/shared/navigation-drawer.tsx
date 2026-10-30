import { useEffect, useRef, type ReactNode } from "react";
import { GridIcon } from "@opengrid/react";
/** Native modal navigation: browser focus containment, inert background and Escape support. */
export function NavigationDrawer({
  open,
  onClose,
  label,
  id,
  children,
  desktopWidth = 1000,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  id: string;
  children: ReactNode;
  desktopWidth?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    const resize = () => {
      if (window.innerWidth > desktopWidth) close.current();
    };
    window.addEventListener("resize", resize);
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      window.removeEventListener("resize", resize);
      if (previous?.isConnected && previous.getClientRects().length)
        previous.focus();
      else
        [...document.querySelectorAll<HTMLElement>("header a, main a, .rail a")]
          .find((element) => element.getClientRects().length)
          ?.focus();
    };
  }, [open, desktopWidth]);
  return (
    <dialog
      ref={dialog}
      id={id}
      className="navigation-drawer"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="drawer-heading">
        <strong>{label}</strong>
        <button onClick={onClose} aria-label={`Close ${label.toLowerCase()}`}>
          <GridIcon name="close" />
        </button>
      </div>
      <div className="drawer-content">{children}</div>
    </dialog>
  );
}
