import { useMemo, useState } from "react";
import type { GridModel, GridState, RowNode } from "@opengrid/core";
import { gridMessage, type GridMessage } from "./locale.js";

export type HierarchySelectionMode = "self" | "subtree" | "filteredSubtree";
interface Failure {
  notice: GridMessage;
  detail?: string;
}
class ChangedHierarchy extends Error {}
function failure(reason: unknown): Failure {
  return reason instanceof ChangedHierarchy
    ? { notice: gridMessage("hierarchy.changed") }
    : {
        notice: gridMessage("hierarchy.unavailable"),
        detail:
          reason instanceof Error && typeof reason.message === "string"
            ? reason.message.slice(0, 1024)
            : undefined,
      };
}
function readPlan<T>(
  model: GridModel<T>,
  mode: HierarchySelectionMode,
  expected: GridState,
) {
  if (model.getState() !== expected) throw new ChangedHierarchy();
  const plan = model.getHierarchySelectionPlan({
    filtered: mode === "filteredSubtree",
  });
  if (model.getState() !== expected) throw new ChangedHierarchy();
  return plan;
}

/** Each action reads authoritative state again; late React mirrors cannot overwrite selection. */
export function useHierarchySelection<T>(
  model: GridModel<T>,
  state: GridState,
  mode: HierarchySelectionMode,
  multiple: boolean,
  visibleNodes: readonly RowNode<T>[],
) {
  if (!["self", "subtree", "filteredSubtree"].includes(mode))
    throw new TypeError("Unknown hierarchy selection mode");
  const enabled = multiple && mode !== "self";
  const prepared = useMemo(() => {
    if (!enabled)
      return { resolved: undefined, pageState: undefined, error: undefined };
    try {
      const resolved = readPlan(model, mode, state).resolve(state.selected);
      const pageState = resolved.getUnionState(
        visibleNodes.map((node) => node.id),
      );
      return { resolved, pageState, error: undefined };
    } catch (reason: unknown) {
      return {
        resolved: undefined,
        pageState: undefined,
        error: failure(reason),
      };
    }
  }, [model, state, mode, enabled, visibleNodes]);
  const [commandError, setCommandError] = useState<{
    model: GridModel<T>;
    mode: HierarchySelectionMode;
    value: Failure;
  } | null>(null);
  return {
    enabled,
    resolved: prepared.resolved,
    pageState: prepared.pageState,
    error:
      prepared.error ??
      (enabled && commandError?.model === model && commandError.mode === mode
        ? commandError.value
        : undefined),
    toggle(nodeIds: readonly string[], checked?: boolean) {
      if (!enabled) return false;
      try {
        const expected = model.getState(),
          resolved = readPlan(model, mode, expected).resolve(expected.selected),
          next = resolved.toggle(nodeIds, checked);
        if (model.getState() !== expected) throw new ChangedHierarchy();
        if (next !== resolved.selection) model.selectRows([...next]);
        setCommandError(null);
        return true;
      } catch (reason: unknown) {
        setCommandError({ model, mode, value: failure(reason) });
        return false;
      }
    },
  };
}
