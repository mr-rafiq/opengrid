import { useLayoutEffect, useRef, useState } from "react";
import type { Column, GridModel, GridState, RowNode } from "@opengrid/core";
import {
  GridColumnMenu,
  prepareColumnMenuItems,
  type GridColumnMenuContext,
  type GridColumnMenuItem,
  type GridColumnMenuOptions,
} from "./column-menu.js";
import { GridContextMenuError } from "./command-menu-items.js";
import { gridMessage, type GridMessage } from "./locale.js";
import type { DataGridSizingController } from "./column-sizing.js";

const TREE_LIMITS = Object.freeze({
  nodes: 200000,
  references: 1000000,
  expandedIds: 200000,
  idText: 16000000,
});
function expandedIds<T>(
  roots: readonly RowNode<T>[],
  previous: readonly string[],
): string[] {
  const limit = () => {
    throw new GridContextMenuError(gridMessage("columnMenu.groupLimit"));
  };
  if (
    roots.length > TREE_LIMITS.nodes ||
    previous.length > TREE_LIMITS.expandedIds
  )
    limit();
  const result = new Set<string>(),
    seen = new WeakSet<object>(),
    pending: RowNode<T>[] = [];
  let text = 0,
    references = roots.length,
    nodes = 0;
  const add = (id: string) => {
    if (typeof id !== "string")
      throw new GridContextMenuError(gridMessage("columnMenu.unavailable"));
    if (result.has(id)) return;
    text += id.length;
    if (result.size >= TREE_LIMITS.expandedIds || text > TREE_LIMITS.idText)
      limit();
    result.add(id);
  };
  previous.forEach(add);
  for (let index = roots.length - 1; index >= 0; index--)
    pending.push(roots[index]);
  while (pending.length) {
    const node = pending.pop()!;
    if (!node || typeof node !== "object")
      throw new GridContextMenuError(gridMessage("columnMenu.unavailable"));
    if (seen.has(node)) continue;
    seen.add(node);
    if (++nodes > TREE_LIMITS.nodes) limit();
    const children = node.children;
    if (!children?.length) continue;
    if (!Array.isArray(children))
      throw new GridContextMenuError(gridMessage("columnMenu.unavailable"));
    add(node.id);
    references += children.length;
    if (references > TREE_LIMITS.references) limit();
    for (let index = children.length - 1; index >= 0; index--)
      pending.push(children[index]);
  }
  return [...result];
}
interface Session<T> {
  context: GridColumnMenuContext<T>;
  state: GridState;
  members: ReadonlySet<string>;
  provider: GridColumnMenuOptions<T>["getItems"];
  canChoose: boolean;
  items: readonly GridColumnMenuItem<T>[];
  point: Readonly<{ x: number; y: number }>;
  anchor: HTMLElement;
}
export function useColumnMenu<T>({
  model,
  state,
  columns,
  setting,
  blocked,
  getBusy,
  getSizing,
  onFocus,
  onRestoreFocus,
  onFilter,
  canChoose,
  onChoose,
  onMessage,
}: {
  model: GridModel<T>;
  state: GridState;
  columns: readonly Column<T>[];
  setting: boolean | GridColumnMenuOptions<T>;
  blocked: boolean;
  getBusy: () => boolean;
  getSizing: () => DataGridSizingController | null;
  onFocus: (columnId: string, anchor: HTMLElement) => void;
  onRestoreFocus: (columnId: string) => void;
  onFilter: (columnId: string) => void;
  canChoose: boolean;
  onChoose: () => void;
  onMessage: (message: GridMessage | string, error?: boolean) => void;
}) {
  const [session, setSession] = useState<Session<T> | null>(null);
  const provider = typeof setting === "object" ? setting.getItems : undefined;
  const latest = useRef({
    model,
    columns,
    setting,
    blocked,
    getBusy,
    getSizing,
    onRestoreFocus,
    onFilter,
    canChoose,
    onChoose,
    onMessage,
    provider,
  });
  useLayoutEffect(() => {
    latest.current = {
      model,
      columns,
      setting,
      blocked,
      getBusy,
      getSizing,
      onRestoreFocus,
      onFilter,
      canChoose,
      onChoose,
      onMessage,
      provider,
    };
  }, [
    model,
    columns,
    setting,
    blocked,
    getBusy,
    getSizing,
    onRestoreFocus,
    onFilter,
    canChoose,
    onChoose,
    onMessage,
    provider,
  ]);
  const sameMembers = (
    owned: ReadonlySet<string>,
    visible: readonly Column<T>[],
  ) =>
    owned.size === visible.length &&
    visible.every((column) => owned.has(column.id));
  function fresh(candidate: Session<T>) {
    const current = latest.current;
    return (
      current.model === candidate.context.model &&
      current.setting !== false &&
      !current.blocked &&
      !current.getBusy() &&
      current.provider === candidate.provider &&
      current.canChoose === candidate.canChoose &&
      current.model.getState() === candidate.state &&
      sameMembers(candidate.members, current.columns)
    );
  }
  const active =
    session &&
    session.context.model === model &&
    session.state === state &&
    setting !== false &&
    !blocked &&
    session.provider === provider &&
    session.canChoose === canChoose &&
    sameMembers(session.members, columns)
      ? session
      : null;
  useLayoutEffect(() => {
    if (session && !active) setSession(null);
  }, [session, active]);
  function open(
    column: Column<T>,
    anchor: HTMLElement,
    origin: GridColumnMenuContext<T>["origin"],
    point: Readonly<{ x: number; y: number }>,
  ) {
    if (setting === false || blocked || getBusy()) return false;
    try {
      const expected = model.getState();
      if (expected !== state || !columns.some((item) => item.id === column.id))
        throw new GridContextMenuError(gridMessage("contextMenu.changed"));
      onFocus(column.id, anchor);
      const context = Object.freeze({ model, column, origin }),
        candidate: Session<T> = {
          context,
          state: expected,
          members: new Set(columns.map((item) => item.id)),
          provider,
          canChoose,
          items: [],
          point: Object.freeze({
            x: Number.isFinite(point.x) ? point.x : 0,
            y: Number.isFinite(point.y) ? point.y : 0,
          }),
          anchor,
        };
      const assertFresh = (signal: AbortSignal) => {
        if (signal.aborted || !fresh(candidate))
          throw new DOMException("Column command source changed", "AbortError");
      };
      const complete = (signal: AbortSignal) => {
        if (!signal.aborted && latest.current.model === model)
          latest.current.onMessage(
            gridMessage("columnMenu.applied", {
              column: column.header ?? column.id,
            }),
          );
      };
      const sizing = () => {
        const controller = latest.current.getSizing();
        if (!controller)
          throw new GridContextMenuError(gridMessage("columnMenu.unavailable"));
        return controller;
      };
      const size = async (
        ids: readonly string[] | undefined,
        signal: AbortSignal,
      ) => {
        assertFresh(signal);
        const report = await sizing().autoSizeColumns(ids, { signal });
        if (signal.aborted) return;
        if (report.cancelled)
          throw new GridContextMenuError(
            gridMessage("columnMenu.sizingCancelled"),
          );
        if (!report.measured.length && !report.unchanged.length)
          throw new GridContextMenuError(gridMessage("columnMenu.noSamples"));
        complete(signal);
      };
      const sort = state.sorting.find((item) => item.columnId === column.id),
        grouped = state.groupBy.includes(column.id),
        hasGroups = model
          .getRowModel()
          .some((node) => Boolean(node.children?.length));
      const label = column.header ?? column.id;
      const actions: GridColumnMenuItem<T>[] = [
        {
          kind: "action",
          id: "sortAsc",
          label: gridMessage("columnMenu.sortAsc"),
          disabled: column.sortable === false || sort?.direction === "asc",
          action: (_, signal) => {
            assertFresh(signal);
            model.setSort(column.id, "asc");
            complete(signal);
          },
        },
        {
          kind: "action",
          id: "sortDesc",
          label: gridMessage("columnMenu.sortDesc"),
          disabled: column.sortable === false || sort?.direction === "desc",
          action: (_, signal) => {
            assertFresh(signal);
            model.setSort(column.id, "desc");
            complete(signal);
          },
        },
        {
          kind: "action",
          id: "sortClear",
          label: gridMessage("columnMenu.sortClear"),
          disabled: column.sortable === false || !sort,
          action: (_, signal) => {
            assertFresh(signal);
            model.setSort(column.id, null, true);
            complete(signal);
          },
        },
        { kind: "separator", id: "pinning" },
        {
          kind: "action",
          id: "pinLeft",
          label: gridMessage("grid.pinLeft"),
          disabled: column.pinned === "left",
          action: (_, signal) => {
            assertFresh(signal);
            model.pinColumn(column.id, "left");
            complete(signal);
          },
        },
        {
          kind: "action",
          id: "pinRight",
          label: gridMessage("grid.pinRight"),
          disabled: column.pinned === "right",
          action: (_, signal) => {
            assertFresh(signal);
            model.pinColumn(column.id, "right");
            complete(signal);
          },
        },
        {
          kind: "action",
          id: "unpin",
          label: gridMessage("columnMenu.unpin"),
          disabled: column.pinned == null,
          action: (_, signal) => {
            assertFresh(signal);
            model.pinColumn(column.id, null);
            complete(signal);
          },
        },
        { kind: "separator", id: "grouping" },
        {
          kind: "action",
          id: grouped ? "ungroup" : "group",
          label: gridMessage(
            grouped ? "columnMenu.ungroup" : "columnMenu.group",
            { column: label },
          ),
          action: (_, signal) => {
            assertFresh(signal);
            model.setState({
              groupBy: grouped
                ? expected.groupBy.filter((id) => id !== column.id)
                : [...expected.groupBy, column.id],
              expanded: [],
              page: 0,
            });
            complete(signal);
          },
        },
        {
          kind: "action",
          id: "expand",
          label: gridMessage("columnMenu.expand"),
          disabled: !hasGroups,
          action: (_, signal) => {
            assertFresh(signal);
            const ids = expandedIds(model.getRowModel(), expected.expanded);
            assertFresh(signal);
            if (
              ids.length !== expected.expanded.length ||
              ids.some((id, index) => id !== expected.expanded[index])
            )
              model.setState({ expanded: ids });
            complete(signal);
          },
        },
        {
          kind: "action",
          id: "collapse",
          label: gridMessage("columnMenu.collapse"),
          disabled: !expected.expanded.length,
          action: (_, signal) => {
            assertFresh(signal);
            model.setState({ expanded: [] });
            complete(signal);
          },
        },
        { kind: "separator", id: "sizing" },
        {
          kind: "action",
          id: "autoSize",
          label: gridMessage("columnMenu.autoSize"),
          action: (_, signal) => size([column.id], signal),
        },
        {
          kind: "action",
          id: "autoSizeRendered",
          label: gridMessage("columnMenu.autoSizeRendered"),
          action: (_, signal) => size(undefined, signal),
        },
        {
          kind: "action",
          id: "fit",
          label: gridMessage("columnMenu.fit"),
          action: (_, signal) => {
            assertFresh(signal);
            const report = sizing().sizeColumnsToFit();
            if (report.cancelled)
              throw new GridContextMenuError(
                gridMessage("columnMenu.sizingCancelled"),
              );
            complete(signal);
          },
        },
        {
          kind: "action",
          id: "resetWidth",
          label: gridMessage("columnMenu.resetWidth"),
          disabled: !Object.hasOwn(expected.columnWidths, column.id),
          action: (_, signal) => {
            assertFresh(signal);
            sizing().resetWidths([column.id]);
            complete(signal);
          },
        },
        { kind: "separator", id: "visibility" },
        {
          kind: "action",
          id: "filter",
          label: gridMessage("columnMenu.filter"),
          disabled: column.filterable === false,
          action: (_, signal) => {
            assertFresh(signal);
            latest.current.onFilter(column.id);
          },
        },
        {
          kind: "action",
          id: "chooser",
          label: gridMessage("columnMenu.chooser"),
          disabled: !canChoose,
          action: (_, signal) => {
            assertFresh(signal);
            latest.current.onChoose();
          },
        },
        {
          kind: "action",
          id: "hide",
          label: gridMessage("columnMenu.hide", { column: label }),
          disabled: columns.length <= 1,
          action: (_, signal) => {
            assertFresh(signal);
            model.hideColumn(column.id, true);
            complete(signal);
          },
        },
      ];
      const defaults = prepareColumnMenuItems(actions);
      candidate.items = provider
        ? prepareColumnMenuItems(provider(context, defaults))
        : defaults;
      if (!fresh(candidate))
        throw new GridContextMenuError(gridMessage("contextMenu.changed"));
      latest.current.onMessage("");
      if (candidate.items.length) setSession(candidate);
    } catch (reason: unknown) {
      onMessage(
        reason instanceof GridContextMenuError
          ? reason.notice
          : reason instanceof Error && reason.message
            ? reason.message
            : gridMessage("contextMenu.failed"),
        true,
      );
    }
    return true;
  }
  return {
    open,
    columnId: active?.context.column.id,
    render: active ? (
      <GridColumnMenu
        context={active.context}
        items={active.items}
        point={active.point}
        returnFocus={active.anchor}
        isCurrent={() => fresh(active)}
        onClose={() => setSession(null)}
        onRestoreFocus={() =>
          latest.current.onRestoreFocus(active.context.column.id)
        }
      />
    ) : null,
  };
}
