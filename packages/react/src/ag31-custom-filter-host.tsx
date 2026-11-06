import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Ag31ReactiveFilterBody } from "./ag31-filter-hook.js";
import type {
  createAg31CustomFilters,
  Ag31CustomFilterEntry,
} from "./ag31-custom-filters.js";
import type { Ag31LeafColumn } from "./ag31-leaf-columns.js";
type Filters<T> = ReturnType<typeof createAg31CustomFilters<T>>;

function RetainedFilter<T>({
  entry,
  open,
  anchor,
  filters,
  host,
  params,
}: {
  entry: Ag31CustomFilterEntry<T>;
  open: boolean;
  anchor: HTMLElement | null;
  filters: Filters<T>;
  host: RefObject<HTMLDivElement | null>;
  params: Readonly<Record<string, unknown>>;
}) {
  const lastFocus = useRef<HTMLElement | null>(null);
  const popup = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 8, top: 8, width: 280 });
  useLayoutEffect(() => {
    if (!open || !popup.current) return;
    const element = popup.current,
      doc = element.ownerDocument,
      win = doc.defaultView!;
    const returnTarget =
      doc.activeElement instanceof HTMLElement &&
      doc.activeElement !== doc.body &&
      !element.contains(doc.activeElement)
        ? doc.activeElement
        : null;
    const header = [
      ...(host.current?.querySelectorAll<HTMLElement>(
        "[data-og-size-column-id]",
      ) ?? []),
    ].find((element) => element.dataset.ogSizeColumnId === entry.column.colId);
    const buttons = header?.querySelectorAll<HTMLElement>("button");
    const trigger =
      anchor && host.current?.contains(anchor)
        ? anchor
        : (buttons?.[buttons.length - 1] ?? header ?? null);
    let live = true,
      tabIntent = false;
    const canFocus = (target: HTMLElement) =>
      target.isConnected &&
      !target.matches(':disabled,[aria-disabled="true"]') &&
      target.tabIndex >= 0 &&
      !target.closest("[hidden]") &&
      target.getClientRects().length > 0;
    const recoverFocus = () => {
      if (
        !live ||
        filters.isDestroyed() ||
        !element.isConnected ||
        element.contains(doc.activeElement)
      )
        return;
      if (
        doc.activeElement !== doc.body &&
        doc.activeElement !== doc.documentElement &&
        doc.activeElement !== trigger &&
        doc.activeElement !== returnTarget
      )
        return;
      const previous = lastFocus.current;
      const target =
        previous && element.contains(previous) && canFocus(previous)
          ? previous
          : [
              ...element.querySelectorAll<HTMLElement>(
                "input,select,textarea,button,[tabindex]",
              ),
            ].find(canFocus);
      target?.focus({ preventScroll: true });
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && element.contains(event.target)) {
        tabIntent = false;
        return;
      }
      if (tabIntent) {
        tabIntent = false;
        filters.hide();
        return;
      }
      recoverFocus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") tabIntent = true;
    };
    const place = () => {
      if (trigger && !trigger.isConnected) {
        filters.hide();
        return;
      }
      const rect = (trigger ?? host.current)?.getBoundingClientRect();
      const preferred =
        Number.parseFloat(
          win.getComputedStyle(element).getPropertyValue("--ag-menu-min-width"),
        ) || 280;
      const width = Math.max(0, Math.min(preferred, win.innerWidth - 16));
      const next = {
        width,
        left: Math.max(
          8,
          Math.min(rect?.left ?? 8, win.innerWidth - width - 8),
        ),
        top: Math.max(
          8,
          Math.min(
            rect?.bottom ?? 8,
            win.innerHeight - Math.min(element.scrollHeight, 320) - 8,
          ),
        ),
      };
      setPosition((old) =>
        old.left === next.left &&
        old.top === next.top &&
        old.width === next.width
          ? old
          : next,
      );
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !element.contains(target)) filters.hide();
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(place);
    observer?.observe(element);
    const contentObserver = new MutationObserver(recoverFocus);
    contentObserver.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "hidden", "style", "tabindex"],
    });
    win.addEventListener("resize", place);
    win.addEventListener("scroll", place, true);
    doc.addEventListener("pointerdown", outside, true);
    doc.addEventListener("focusin", onFocus, true);
    doc.addEventListener("keydown", onKey, true);
    place();
    void entry.filter.whenReady().then((ready) => {
      if (live && ready) {
        entry.filter.attach({ hidePopup: filters.hide, suppressFocus: false });
        recoverFocus();
      }
    });
    recoverFocus();
    return () => {
      live = false;
      observer?.disconnect();
      contentObserver.disconnect();
      win.removeEventListener("resize", place);
      win.removeEventListener("scroll", place, true);
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("focusin", onFocus, true);
      doc.removeEventListener("keydown", onKey, true);
      if (
        doc.activeElement instanceof HTMLElement &&
        element.contains(doc.activeElement)
      )
        lastFocus.current = doc.activeElement;
      entry.filter.detach();
      if (element.contains(doc.activeElement)) {
        const target =
          returnTarget?.isConnected &&
          !returnTarget.matches(":disabled") &&
          returnTarget.getClientRects().length
            ? returnTarget
            : trigger;
        if (target?.isConnected && !target.matches(":disabled"))
          target.focus({ preventScroll: true });
      }
    };
  }, [entry, open, anchor, filters, host]);
  const name = String(
    entry.column.getColDef().headerName ?? entry.column.colId,
  );
  return (
    <div
      ref={popup}
      role={open ? "dialog" : undefined}
      aria-label={open ? `Filter ${name}` : undefined}
      aria-hidden={!open}
      hidden={!open}
      data-og-source-filter={entry.column.colId}
      data-og-filter-column={entry.column.colId}
      style={{
        display: open ? "block" : "none",
        position: "fixed",
        zIndex: 1000,
        ...position,
        maxHeight: "min(320px, calc(100dvh - 16px))",
        overflow: "auto",
        background: "var(--ag-background-color, var(--og-bg, white))",
        color: "var(--ag-foreground-color, var(--og-text, #172033))",
        border: "1px solid var(--ag-border-color, var(--og-border, #d6dce5))",
        borderRadius: 4,
        boxShadow: "0 2px 5px #0003",
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          filters.hide();
        }
      }}
    >
      <div data-og-source-component>
        <Ag31ReactiveFilterBody
          filter={entry.filter}
          component={entry.component}
          params={params}
        />
      </div>
    </div>
  );
}

/** Parked bodies stay mounted while their popup is closed, preserving the
 * source component's local search/selection state without taking focus. */
export function Ag31CustomFilterHost<T>({
  filters,
  host,
  resolveComponent,
  getParams,
}: {
  filters: Filters<T>;
  host: RefObject<HTMLDivElement | null>;
  resolveComponent(column: Ag31LeafColumn<T>): unknown;
  getParams(column: Ag31LeafColumn<T>): Readonly<Record<string, unknown>>;
}) {
  const resolver = useRef(resolveComponent);
  resolver.current = resolveComponent;
  useLayoutEffect(
    () => filters.attachHost((column) => resolver.current(column)),
    [filters],
  );
  const snapshot = useSyncExternalStore(
    filters.subscribe,
    filters.getSnapshot,
    filters.getSnapshot,
  );
  const content = (
    <>
      {snapshot.entries.map((entry) => (
        <RetainedFilter
          key={entry.column.colId}
          entry={entry}
          open={snapshot.open === entry}
          anchor={snapshot.anchor}
          filters={filters}
          host={host}
          params={getParams(entry.column)}
        />
      ))}
    </>
  );
  const target = host.current?.querySelector<HTMLElement>(".og-root");
  return target ? createPortal(content, target) : content;
}
