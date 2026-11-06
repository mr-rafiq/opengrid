import type { Ag31RowNode } from "./ag31-row-nodes.js";

export interface Ag31RedrawRowsParams<T> {
  rowNodes?: readonly Ag31RowNode<T>[] | null;
}

/** Remount presentation, without rebuilding resident records or query stages. */
export function createAg31RowRendering<T>(options: {
  alive(): boolean;
  nativeId(node: Ag31RowNode<T>): string | undefined;
  node(id: string): Ag31RowNode<T> | undefined;
  editingNode(): Ag31RowNode<T> | undefined;
  stopEditing(): void;
  captureFocus(): (() => void) | undefined;
  refresh(): void;
}) {
  let sequence = 0,
    all = 0;
  let revisions = new WeakMap<Ag31RowNode<T>, number>();
  let pendingFocus: (() => void) | undefined;
  function redrawRows(params?: Ag31RedrawRowsParams<T> | null) {
    if (!options.alive()) return;
    if (params != null && (typeof params !== "object" || Array.isArray(params)))
      throw new TypeError(
        "Source redraw requires a row-nodes parameter object",
      );
    const requested = params?.rowNodes;
    if (
      requested != null &&
      (!Array.isArray(requested) || requested.length > 50000)
    )
      throw new RangeError("Source redraw requires a bounded row-node array");
    const targets =
      requested == null
        ? null
        : [...new Set(requested)].filter(
            (node) => options.nativeId(node) !== undefined,
          );
    if (targets?.length === 0) return;
    if (sequence === Number.MAX_SAFE_INTEGER)
      throw new RangeError("Source row redraw revision limit reached");
    const restore = targets === null ? options.captureFocus() : undefined;
    const editing = options.editingNode();
    if (editing && (targets === null || targets.includes(editing)))
      options.stopEditing();
    if (!options.alive()) return;
    const revision = ++sequence;
    if (targets === null) {
      all = revision;
      revisions = new WeakMap();
    } else {
      for (const node of targets)
        if (options.nativeId(node) !== undefined) revisions.set(node, revision);
    }
    if (restore) pendingFocus = restore;
    options.refresh();
  }
  return Object.freeze({
    redrawRows,
    key(id: string) {
      const node = options.node(id);
      return `${id}:${all}:${node ? (revisions.get(node) ?? 0) : 0}`;
    },
    flush() {
      const restore = pendingFocus;
      pendingFocus = undefined;
      if (options.alive()) restore?.();
    },
    destroy() {
      pendingFocus = undefined;
      revisions = new WeakMap();
    },
  });
}
