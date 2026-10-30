import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { GridModel, GridState, RowNode } from "@opengrid/core";
import type { RowProjectionEntry } from "./row-projection.js";
import type { RowSpanRun } from "./row-spans.js";
import { AutoHeightController } from "./auto-height-controller.js";
import {
  allocateAutoRowHeights,
  AUTO_ROW_HEIGHT_LIMITS,
  type AutoRowHeightOptions,
  type AutoRowHeightConstraint,
  type DataGridRowHeightController,
} from "./auto-row-heights.js";

interface Context<T> {
  epoch: object;
  model: GridModel<T>;
  state: GridState;
  rows: readonly RowNode<T>[];
  entries: readonly RowProjectionEntry<T>[];
  signature: readonly unknown[];
}
interface Options<T> {
  enabled: boolean;
  model: GridModel<T>;
  state: GridState;
  rows: readonly RowNode<T>[];
  entries: readonly RowProjectionEntry<T>[];
  signature: readonly unknown[];
  compatibleState: (previous: GridState, next: GridState) => boolean;
  limits?: AutoRowHeightOptions;
}
const empty: readonly never[] = Object.freeze([]);
const zero = () => 0;
const subscribeNone = () => () => {};
function sameRows<T>(
  previous: Context<T>,
  rows: readonly RowNode<T>[],
  entries: readonly RowProjectionEntry<T>[],
) {
  return (
    previous.rows.length === rows.length &&
    previous.entries.length === entries.length &&
    rows.every((row, index) => {
      const old = previous.rows[index],
        a = previous.entries[index],
        b = entries[index];
      return (
        old.id === row.id &&
        old.data === row.data &&
        old.kind === row.kind &&
        old.depth === row.depth &&
        Boolean(old.children?.length) === Boolean(row.children?.length) &&
        a.region === b.region &&
        a.fullWidth === b.fullWidth
      );
    })
  );
}

/** Read cached estimates during rendering; commit source/observer ownership only in layout effects. */
export function useAutoRowHeight<T>({
  enabled,
  model,
  state,
  rows,
  entries,
  signature,
  compatibleState,
  limits,
}: Options<T>) {
  if (enabled && rows.length > AUTO_ROW_HEIGHT_LIMITS.maxRows)
    throw new RangeError(
      "Automatic row height supports at most 100000 projected rows",
    );
  const maxCachedCells = limits?.maxCachedCells ?? 10_000;
  const maxConnectedCells =
    limits?.maxConnectedCells ?? Math.min(2_048, maxCachedCells);
  const controller = useMemo(
    () =>
      enabled
        ? new AutoHeightController({ maxCachedCells, maxConnectedCells })
        : null,
    [model, enabled, maxCachedCells, maxConnectedCells],
  );
  const version = useSyncExternalStore(
    controller?.subscribe ?? subscribeNone,
    controller?.getSnapshot ?? zero,
    controller?.getSnapshot ?? zero,
  );
  const committed = useRef<Context<T> | null>(null);
  const old = committed.current;
  const currentRows = enabled ? rows : empty,
    currentEntries = enabled ? entries : empty,
    currentSignature = enabled ? signature : empty;
  const reusable =
    old?.model === model &&
    compatibleState(old.state, state) &&
    old.signature.length === currentSignature.length &&
    old.signature.every((value, index) =>
      Object.is(value, currentSignature[index]),
    ) &&
    sameRows(old, currentRows, currentEntries);
  const context: Context<T> = {
    epoch: reusable ? old!.epoch : {},
    model,
    state,
    rows: currentRows,
    entries: currentEntries,
    signature: currentSignature,
  };
  useLayoutEffect(() => {
    committed.current = context;
    controller?.commitEpoch(context.epoch);
    controller?.refresh();
  });
  useLayoutEffect(() => controller?.connect(), [controller]);
  const api = useMemo<DataGridRowHeightController>(
    () => ({ reset: () => controller?.clear() }),
    [controller],
  );
  function adjust(baseHeights: readonly number[]): readonly number[] {
    if (!controller) return baseHeights;
    const indices = new Map(currentRows.map((row, index) => [row.id, index]));
    const constraints: AutoRowHeightConstraint[] = [];
    for (const metric of controller.measurements(context.epoch)) {
      const start = indices.get(metric.rowId),
        last = indices.get(metric.endRowId);
      if (
        start === undefined ||
        last === undefined ||
        last < start ||
        last - start + 1 !== metric.rowCount ||
        currentRows[start].data !== metric.data ||
        currentRows[start].kind !== "row" ||
        currentEntries[start].fullWidth ||
        currentEntries[last].fullWidth ||
        currentEntries[start].region !== currentEntries[last].region
      )
        continue;
      constraints.push({
        startRow: start,
        endRow: last + 1,
        height: metric.height,
      });
    }
    return constraints.length
      ? allocateAutoRowHeights(baseHeights, constraints)
      : baseHeights;
  }
  function cellRef(rowIndex: number, columnId: string, span?: RowSpanRun) {
    if (!controller) return;
    const row = currentRows[rowIndex],
      end = currentRows[span ? span.end - 1 : rowIndex];
    if (
      !row ||
      !end ||
      row.kind !== "row" ||
      currentEntries[rowIndex].fullWidth ||
      (span && span.ownerIndex !== rowIndex)
    )
      return;
    const cell = {
      epoch: context.epoch,
      rowId: row.id,
      columnId,
      endRowId: end.id,
      rowCount: span?.span ?? 1,
      data: row.data,
      isCurrent: () =>
        committed.current === context && model.getState() === state,
    };
    const token = {};
    return (element: HTMLSpanElement | null) =>
      controller.register(element, cell, token);
  }
  return { enabled, version, epoch: context.epoch, adjust, cellRef, api };
}
