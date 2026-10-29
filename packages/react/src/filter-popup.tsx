import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Grid-owned, theme/direction-inheriting host outside movable virtual headers. */
export const GridPopupHostContext = createContext<HTMLElement | null>(null);

export function FilterPopup({ children }: { children: ReactNode }) {
  const host = useContext(GridPopupHostContext);
  return host ? createPortal(children, host) : children;
}

export function ownsFilterPopup(
  target: EventTarget | null,
  host: HTMLElement | null,
  columnId: string,
): boolean {
  if (!(target instanceof Element) || !host) return false;
  const popup = target.closest<HTMLElement>("[data-og-filter-column]");
  return (
    popup?.dataset.ogFilterColumn === columnId &&
    popup.closest(".og-root") === host
  );
}
