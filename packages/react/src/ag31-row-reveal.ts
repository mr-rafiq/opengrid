import type { Ag31RowNode } from "./ag31-row-nodes.js";
import type { DataGridViewController } from "./grid-view.js";

export type Ag31RowRevealPosition = "top" | "middle" | "bottom" | null;
interface RowRevealPort {
  view: Pick<
    DataGridViewController,
    "isActive" | "getScrollPosition" | "scrollTo"
  >;
  bodyHeight: number;
}
interface RowRevealAttachment {
  read(): RowRevealPort | null;
}

/** Resident displayed-row geometry only. Revealing does not focus, select,
 * expand, load data or change the horizontal scroll position. */
export function createAg31RowReveal<T>(options: {
  count(): number;
  row(index: number): Ag31RowNode<T> | undefined;
}) {
  let alive = true;
  let attachment: RowRevealAttachment | null = null;
  let pending: {
    node: Ag31RowNode<T>;
    position?: Ag31RowRevealPosition;
    owner: RowRevealAttachment;
  } | null = null;
  function apply(
    node: Ag31RowNode<T>,
    position?: Ag31RowRevealPosition,
  ): boolean {
    const port = alive ? attachment?.read() : null;
    if (!port?.view.isActive()) return false;
    const scroll = port.view.getScrollPosition(),
      top = node.rowTop,
      height = node.rowHeight,
      visible = port.bodyHeight;
    if (
      !scroll ||
      top == null ||
      !Number.isFinite(top) ||
      height == null ||
      !Number.isFinite(height) ||
      height <= 0 ||
      !Number.isFinite(visible) ||
      visible <= 0
    )
      return false;
    let next: number | undefined;
    if (position === "top") next = top;
    else if (position === "bottom") next = top + height - visible;
    else if (position === "middle")
      next = top - Math.max(0, (visible - height) / 2);
    else if (top < scroll.top) next = top;
    else if (top + height > scroll.top + visible) next = top + height - visible;
    return next === undefined || port.view.scrollTo({ top: Math.max(0, next) });
  }
  function reveal(node: Ag31RowNode<T>, position?: Ag31RowRevealPosition) {
    if (!attachment) return;
    pending = null;
    if (!apply(node, position)) pending = { node, position, owner: attachment };
  }
  function flush() {
    const request = pending;
    if (!alive || !request || request.owner !== attachment) return;
    const index = request.node.rowIndex;
    if (index == null || options.row(index) !== request.node) pending = null;
    else if (apply(request.node, request.position)) pending = null;
  }
  function ensureIndexVisible(index: number, position?: Ag31RowRevealPosition) {
    if (
      !alive ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= options.count()
    )
      return;
    const node = options.row(index);
    if (node) reveal(node, position);
  }
  function ensureNodeVisible(
    target: Ag31RowNode<T> | T | ((node: Ag31RowNode<T>) => boolean),
    position?: Ag31RowRevealPosition,
  ) {
    if (!alive) return;
    const count = options.count();
    for (let index = 0; index < count; index++) {
      const node = options.row(index);
      if (
        node &&
        (typeof target === "function"
          ? (target as (node: Ag31RowNode<T>) => boolean)(node)
          : target === node || target === node.data)
      ) {
        reveal(node, position);
        return;
      }
    }
  }
  return Object.freeze({
    ensureIndexVisible,
    ensureNodeVisible,
    flush,
    attach(read: () => RowRevealPort | null) {
      if (!alive) return () => {};
      const next = { read };
      attachment = next;
      pending = null;
      return () => {
        if (attachment === next) {
          attachment = null;
          pending = null;
        }
      };
    },
    destroy() {
      alive = false;
      attachment = null;
      pending = null;
    },
  });
}
