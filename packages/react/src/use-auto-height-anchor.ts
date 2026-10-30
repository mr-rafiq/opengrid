import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { GridModel, GridState } from "@opengrid/core";
import type { RowProjectionEntry } from "./row-projection.js";
import type { RowLayout } from "./row-layout.js";

interface Snapshot<T> {
  model: GridModel<T>;
  entries: readonly RowProjectionEntry<T>[];
  layout: RowLayout;
  baseHeights: readonly number[];
  bodyHeight: number;
  enabled: boolean;
}
interface Options<T> {
  enabled: boolean;
  model: GridModel<T>;
  state: GridState;
  entries: readonly RowProjectionEntry<T>[];
  layout: RowLayout;
  baseHeights: readonly number[];
  viewport: RefObject<HTMLDivElement | null>;
  height: number;
  inset: number;
  scrollTop: number;
  setScrollTop: (value: number) => void;
}
const gridSelector = '[role="grid"],[role="treegrid"]';
function focusedRow(container: HTMLElement) {
  let element =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (!element || !container.contains(element)) return;
  while (element && element !== container) {
    const rowId = element.getAttribute("data-og-row-id");
    if (rowId && element.closest(gridSelector) === container)
      return { rowId, detail: element.hasAttribute("data-og-detail-row") };
    element = element.parentElement;
  }
}

/** Keep a committed source-row point stable through lazy natural-height changes. */
export function useAutoHeightAnchor<T>({
  enabled,
  model,
  state,
  entries,
  layout,
  baseHeights,
  viewport,
  height,
  inset,
  scrollTop,
  setScrollTop,
}: Options<T>) {
  const previous = useRef<Snapshot<T> | null>(null);
  useLayoutEffect(() => {
    const old = previous.current,
      container = viewport.current;
    if (!enabled && !old?.enabled) {
      previous.current = null;
      return;
    }
    const bodyHeight = Math.max(1, (container?.clientHeight || height) - inset);
    previous.current = {
      enabled,
      model,
      entries,
      layout,
      baseHeights,
      bodyHeight,
    };
    if (
      !container ||
      !old ||
      old.model !== model ||
      old.layout === layout ||
      !entries.length ||
      old.entries.length !== entries.length ||
      !old.entries.every(
        (entry, index) => entry.node.id === entries[index].node.id,
      ) ||
      model.getState() !== state
    )
      return;
    const current = container.scrollTop;
    let index = old.layout.indexAt(current),
      detail = false,
      usedOwned = false;
    const owned = focusedRow(container);
    if (owned) {
      const candidate = old.entries.findIndex(
        (entry) => entry.node.id === owned.rowId,
      );
      if (candidate >= 0) {
        const top = old.layout.offset(candidate),
          base = old.baseHeights[old.entries[candidate].visualIndex];
        const visibleTop = top + (owned.detail ? base : 0),
          visibleEnd =
            top + (owned.detail ? old.layout.height(candidate) : base);
        if (visibleTop < current + old.bodyHeight && visibleEnd > current) {
          index = candidate;
          detail = owned.detail;
          usedOwned = true;
        }
      }
    }
    if (index < 0 || index >= entries.length) return;
    let oldPoint = old.layout.offset(index),
      newPoint = layout.offset(index);
    const oldBase = old.baseHeights[old.entries[index].visualIndex],
      newBase = baseHeights[entries[index].visualIndex];
    let within = current - oldPoint;
    const useDetail =
      detail ||
      (!usedOwned && within >= oldBase && old.layout.height(index) > oldBase);
    if (useDetail) {
      oldPoint += oldBase;
      newPoint += newBase;
      within = current - oldPoint;
    }
    const extent = useDetail ? layout.height(index) - newBase : newBase;
    if (within >= 0) within = Math.min(within, Math.max(0, extent - 1));
    const maximum = Math.max(0, layout.totalHeight - bodyHeight);
    const next = Math.min(maximum, Math.max(0, newPoint + within));
    if (model.getState() !== state || Math.abs(next - current) < 0.01) return;
    container.scrollTop = next;
    setScrollTop(container.scrollTop);
  }, [
    enabled,
    model,
    state,
    entries,
    layout,
    baseHeights,
    viewport,
    height,
    inset,
    scrollTop,
    setScrollTop,
  ]);
}
