import type {
  ServerBlockAddress,
  ServerNode,
  ServerSideSnapshot,
} from "./server-side.js";
export const SERVER_TREE_LIMITS = Object.freeze({
  maxDepth: 32,
  maxBlocks: 128,
  maxRows: 100000,
});
export type ServerTreeEntry<T> = Readonly<
  {
    id: string;
    groupKeys: readonly string[];
    depth: number;
    blockIndex: number;
  } & (
    | { kind: "node"; node: ServerNode<T>; expanded: boolean }
    | { kind: "loading" | "error" | "more" | "empty"; message?: string }
  )
>;
export interface ServerTreePlan<T> {
  readonly entries: readonly ServerTreeEntry<T>[];
  readonly addresses: readonly ServerBlockAddress[];
  readonly routes: readonly string[];
}
export const serverRouteKey = (route: readonly string[]) =>
  JSON.stringify(route);
export const serverNodeId = (route: readonly string[], id: string) =>
  `server-node:${JSON.stringify([route, id])}`;
/** Pure bounded resident expansion projection. Provider order/aggregates stay authoritative. */
export function projectServerTree<T>(
  snapshot: ServerSideSnapshot<T>,
  blockSize: number,
  expanded: ReadonlySet<string>,
  pageCounts: ReadonlyMap<string, number> = new Map(),
  failures: ReadonlyMap<string, string> = new Map(),
): ServerTreePlan<T> {
  if (
    !Number.isSafeInteger(blockSize) ||
    blockSize < 1 ||
    blockSize > SERVER_TREE_LIMITS.maxRows
  )
    throw new RangeError("Invalid tree block size");
  const entries: ServerTreeEntry<T>[] = [],
    addresses: ServerBlockAddress[] = [],
    routes: string[] = [];
  const blocks = new Map(
    snapshot.blocks.map((block) => [
      JSON.stringify([block.groupKeys, block.blockIndex]),
      block,
    ]),
  );
  const errors = new Map(
    snapshot.errors.map((error) => [
      JSON.stringify([error.groupKeys, error.blockIndex]),
      error.message,
    ]),
  );
  function add(entry: ServerTreeEntry<T>) {
    if (entries.length >= SERVER_TREE_LIMITS.maxRows)
      throw new RangeError("Expanded server tree row limit exceeded");
    entries.push(Object.freeze(entry));
  }
  function visit(route: readonly string[]) {
    const routeKey = serverRouteKey(route);
    routes.push(routeKey);
    const pages = pageCounts.get(routeKey) ?? 1;
    if (
      !Number.isSafeInteger(pages) ||
      pages < 1 ||
      pages > SERVER_TREE_LIMITS.maxBlocks
    )
      throw new RangeError("Invalid server tree page count");
    for (let index = 0; index < pages; index++) {
      if (addresses.length >= SERVER_TREE_LIMITS.maxBlocks)
        throw new RangeError("Expanded server tree block limit exceeded");
      const groupKeys = Object.freeze([...route]);
      const address = Object.freeze({ groupKeys, blockIndex: index });
      addresses.push(address);
      const key = JSON.stringify([route, index]),
        block = blocks.get(key),
        message = failures.get(key) ?? errors.get(key);
      const status = (
        kind: "loading" | "error" | "more" | "empty",
        blockIndex = index,
        message?: string,
      ) =>
        add({
          id: `server-status:${JSON.stringify([route, blockIndex, kind])}`,
          kind,
          groupKeys,
          depth: route.length,
          blockIndex,
          message,
        });
      if (!block) {
        status(message ? "error" : "loading", index, message);
        break;
      }
      for (const node of block.response.nodes) {
        const childKey =
          node.kind === "group" ? serverRouteKey([...route, node.key]) : "";
        const isExpanded =
          node.kind === "group" &&
          node.childCount !== 0 &&
          expanded.has(childKey) &&
          route.length < SERVER_TREE_LIMITS.maxDepth;
        add({
          id: serverNodeId(route, node.id),
          kind: "node",
          node,
          groupKeys,
          depth: route.length,
          blockIndex: index,
          expanded: isExpanded,
        });
        if (isExpanded)
          visit([
            ...route,
            (node as Extract<ServerNode<T>, { kind: "group" }>).key,
          ]);
      }
      if (message) status("error", index, message);
      if (index === 0 && block.response.rowCount === 0) status("empty");
      if ((index + 1) * blockSize >= block.response.rowCount) break;
      if (index === pages - 1) status("more", index + 1);
    }
  }
  visit([]);
  return Object.freeze({
    entries: Object.freeze(entries),
    addresses: Object.freeze(addresses),
    routes: Object.freeze(routes),
  });
}
