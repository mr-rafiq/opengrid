import { useLayoutEffect, useRef, useState } from "react";
import {
  createCellRangeModel,
  serializeTsv,
  type CellPosition,
  type CellRange,
  type CellRangeModel,
  type Column,
  type GridModel,
  type GridState,
  type RowNode,
} from "@opengrid/core";
import { GridContextMenu } from "./context-menu.js";
import {
  GridContextMenuError,
  prepareContextMenuItems,
  type GridContextMenuContext,
  type GridContextMenuItem,
  type GridContextMenuOptions,
} from "./context-menu-items.js";
import { gridMessage, type GridMessage } from "./locale.js";
interface Session<T> {
  context: GridContextMenuContext<T>;
  state: GridState;
  policyKey: string;
  notesOwner: object | false;
  getItems: GridContextMenuOptions<T>["getItems"];
  range: CellRange | null;
  controller: CellRangeModel<T> | null;
  items: readonly GridContextMenuItem<T>[];
  point: Readonly<{ x: number; y: number }>;
  element: HTMLElement;
}
const rangeKey = (range: CellRange | null) =>
  range
    ? JSON.stringify([
        range.anchor.rowId,
        range.anchor.columnId,
        range.focus.rowId,
        range.focus.columnId,
      ])
    : "";
const equalIds = (left: readonly string[], right: readonly string[]) =>
  left === right ||
  (left.length === right.length &&
    left.every((id, index) => id === right[index]));
export function useGridContextMenu<T>({
  model,
  state,
  setting,
  policyKey,
  notesOwner,
  editing,
  controller,
  rowIds,
  columnIds,
  selectionMode,
  notes,
  onEdit,
  onNote,
  onSelect,
  onFocus,
  onRestoreFocus,
  onExportCsv,
  onMessage,
}: {
  model: GridModel<T>;
  state: GridState;
  setting: boolean | GridContextMenuOptions<T>;
  policyKey: string;
  notesOwner: object | false;
  editing: boolean;
  controller: CellRangeModel<T> | null;
  rowIds: string[];
  columnIds: readonly string[];
  selectionMode: "single" | "multiple" | "none";
  notes: boolean;
  onEdit: (node: RowNode<T>, column: Column<T>) => void;
  onNote: (position: CellPosition) => void;
  onSelect: (node: RowNode<T>) => void;
  onFocus: (position: CellPosition) => void;
  onRestoreFocus: (position: CellPosition) => void;
  onExportCsv: () => void;
  onMessage: (message: GridMessage | string, error?: boolean) => void;
}) {
  const [session, setSession] = useState<Session<T> | null>(null);
  const getItems = typeof setting === "object" ? setting.getItems : undefined;
  const latest = useRef({
    model,
    setting,
    policyKey,
    notesOwner,
    getItems,
    editing,
    controller,
    rowIds,
    columnIds,
    onRestoreFocus,
    onEdit,
    onNote,
    onSelect,
    onExportCsv,
    onMessage,
  });
  useLayoutEffect(() => {
    latest.current = {
      model,
      setting,
      policyKey,
      notesOwner,
      getItems,
      editing,
      controller,
      rowIds,
      columnIds,
      onRestoreFocus,
      onEdit,
      onNote,
      onSelect,
      onExportCsv,
      onMessage,
    };
  }, [
    model,
    setting,
    policyKey,
    notesOwner,
    getItems,
    editing,
    controller,
    rowIds,
    columnIds,
    onRestoreFocus,
    onEdit,
    onNote,
    onSelect,
    onExportCsv,
    onMessage,
  ]);
  function fresh(candidate: Session<T>): boolean {
    const current = latest.current;
    return (
      current.model === candidate.context.model &&
      current.setting !== false &&
      current.policyKey === candidate.policyKey &&
      current.notesOwner === candidate.notesOwner &&
      current.getItems === candidate.getItems &&
      !current.editing &&
      current.controller === candidate.controller &&
      candidate.context.model.getState() === candidate.state &&
      rangeKey(candidate.controller?.getSnapshot().range ?? null) ===
        rangeKey(candidate.range)
    );
  }
  const active =
    session &&
    setting !== false &&
    session.policyKey === policyKey &&
    session.notesOwner === notesOwner &&
    session.getItems === getItems &&
    !editing &&
    session.context.model === model &&
    session.state === state &&
    controller === session.controller &&
    rangeKey(controller?.getSnapshot().range ?? null) ===
      rangeKey(session.range)
      ? session
      : null;
  useLayoutEffect(() => {
    if (session && !active) setSession(null);
  }, [session, active]);
  function open(
    node: RowNode<T>,
    column: Column<T>,
    element: HTMLElement,
    point: Readonly<{ x: number; y: number }>,
    checked: boolean | "mixed",
  ) {
    if (
      setting === false ||
      editing ||
      node.kind !== "row" ||
      node.data == null
    )
      return false;
    try {
      const expected = model.getState();
      if (expected !== state)
        throw new GridContextMenuError(gridMessage("contextMenu.changed"));
      const position = Object.freeze({ rowId: node.id, columnId: column.id });
      onFocus(position);
      if (controller && !controller.contains(node.id, column.id))
        controller.setRange(position);
      const context: GridContextMenuContext<T> = Object.freeze({
        model,
        position,
        row: node.data,
        column,
        value: model.getValue(node.data, column.id),
      });
      const candidate: Session<T> = {
        context,
        state: expected,
        policyKey,
        notesOwner,
        getItems,
        controller,
        range: controller?.getSnapshot().range ?? null,
        items: [],
        point: Object.freeze({
          x: Number.isFinite(point.x) ? point.x : 0,
          y: Number.isFinite(point.y) ? point.y : 0,
        }),
        element,
      };
      const assertFresh = (signal: AbortSignal) => {
        if (signal.aborted || !fresh(candidate))
          throw new DOMException(
            "The menu command was cancelled because its source changed.",
            "AbortError",
          );
      };
      const actions: GridContextMenuItem<T>[] = [
        {
          kind: "action",
          id: "copyCell",
          label: gridMessage("contextMenu.copyCell"),
          action: async (_, signal) => {
            assertFresh(signal);
            if (!navigator.clipboard?.writeText)
              throw new GridContextMenuError(
                gridMessage("range.copyUnavailable"),
              );
            const value = column.valueFormatter
              ? column.valueFormatter(context.value, context.row)
              : context.value;
            await navigator.clipboard.writeText(serializeTsv([[value]]));
            if (!signal.aborted)
              latest.current.onMessage(gridMessage("range.copied"));
          },
        },
        {
          kind: "action",
          id: "copyRange",
          label: gridMessage("grid.copyLabel"),
          shortcut: "Ctrl+C",
          disabled: !controller,
          action: async (_, signal) => {
            assertFresh(signal);
            if (!navigator.clipboard?.writeText)
              throw new GridContextMenuError(
                gridMessage("range.copyUnavailable"),
              );
            // These arrays are immutable view projections owned by DataGrid. A private
            // range cannot observe speculative or later direction/order ref changes.
            const view = latest.current,
              range = controller!.getSnapshot().range!;
            const source = createCellRangeModel(model, {
              getRowIds: () => view.rowIds,
              getColumnIds: () => view.columnIds,
            });
            let contents: string;
            try {
              source.setRange(range.anchor, range.focus);
              contents = source.copy({ formatted: true });
            } finally {
              source.dispose();
            }
            await navigator.clipboard.writeText(contents);
            if (!signal.aborted)
              latest.current.onMessage(gridMessage("range.copied"));
          },
        },
        {
          kind: "action",
          id: "paste",
          label: gridMessage("grid.pasteLabel"),
          shortcut: "Ctrl+V",
          disabled: !controller || !column.editable,
          action: async (_, signal) => {
            assertFresh(signal);
            if (!navigator.clipboard?.readText)
              throw new GridContextMenuError(
                gridMessage("range.pasteUnavailable"),
              );
            const view = latest.current;
            const contents = await navigator.clipboard.readText();
            assertFresh(signal);
            if (
              !equalIds(view.rowIds, latest.current.rowIds) ||
              !equalIds(view.columnIds, latest.current.columnIds)
            )
              throw new DOMException(
                "Clipboard view order changed",
                "AbortError",
              );
            const source = createCellRangeModel(model, {
              getRowIds: () => view.rowIds,
              getColumnIds: () => view.columnIds,
            });
            let error: string | undefined;
            try {
              error = source.paste(contents, position);
            } finally {
              source.dispose();
            }
            if (error) throw new Error(error);
            latest.current.onMessage(gridMessage("range.pasted"));
          },
        },
        { kind: "separator", id: "editing" },
        {
          kind: "action",
          id: "edit",
          label: gridMessage("grid.editFocusedCell"),
          shortcut: "F2",
          disabled: !column.editable,
          action: () => latest.current.onEdit(node, column),
        },
        {
          kind: "action",
          id: "note",
          label: gridMessage("grid.note"),
          shortcut: "Alt+N",
          disabled: !notes,
          action: () => latest.current.onNote(position),
        },
        {
          kind: "action",
          id: "selectRow",
          label: gridMessage("grid.selectRow", { rowId: node.id }),
          checked,
          disabled: selectionMode === "none",
          action: () => latest.current.onSelect(node),
        },
        { kind: "separator", id: "history" },
        {
          kind: "action",
          id: "undo",
          label: gridMessage("grid.undo"),
          shortcut: "Ctrl+Z",
          action: () =>
            latest.current.onMessage(
              gridMessage(
                model.undo() ? "grid.changeUndone" : "grid.noHistory",
              ),
            ),
        },
        {
          kind: "action",
          id: "redo",
          label: gridMessage("grid.redo"),
          shortcut: "Ctrl+Y",
          action: () =>
            latest.current.onMessage(
              gridMessage(
                model.redo() ? "grid.changeRedone" : "grid.noHistory",
              ),
            ),
        },
        { kind: "separator", id: "export" },
        {
          kind: "action",
          id: "exportCsv",
          label: gridMessage("grid.exportCsv"),
          action: () => latest.current.onExportCsv(),
        },
      ];
      const defaults = prepareContextMenuItems(actions);
      candidate.items = getItems
        ? prepareContextMenuItems(getItems(context, defaults))
        : defaults;
      if (!fresh(candidate))
        throw new GridContextMenuError(gridMessage("contextMenu.changed"));
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
    position: active?.context.position,
    render: active ? (
      <GridContextMenu
        context={active.context}
        items={active.items}
        point={active.point}
        returnFocus={active.element}
        isCurrent={() => fresh(active)}
        onClose={() => setSession(null)}
        onRestoreFocus={() =>
          latest.current.onRestoreFocus(active.context.position)
        }
      />
    ) : null,
  };
}
