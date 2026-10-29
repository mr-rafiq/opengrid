import {
  prepareMultiFilter,
  type ColumnFilterSlot,
  type Filter,
  type MultiColumnFilter,
  type ScalarFilter,
  type CompoundFilter,
} from "@opengrid/core";
import { columnFilterFingerprint } from "./column-condition-draft.js";

export class MultiFilterDraftError extends Error {
  constructor(
    readonly code: "unreadable" | "unsupported" | "unknownChild",
    cause?: unknown,
  ) {
    super(`Multi-filter draft ${code}`, { cause });
    this.name = "MultiFilterDraftError";
  }
}
export interface MultiFilterDraft {
  readonly filters: readonly ColumnFilterSlot[];
  readonly sourceKey: string;
  readonly baselineKey: string;
  readonly supported: boolean;
  readonly dirty: boolean;
}
function fingerprint(source: unknown): string {
  try {
    return columnFilterFingerprint(source);
  } catch (cause: unknown) {
    throw new MultiFilterDraftError("unreadable", cause);
  }
}
const model = (filters: readonly ColumnFilterSlot[]): MultiColumnFilter =>
  prepareMultiFilter({ op: "multi", filters });

/** Snapshot only recognized slots. Unsupported sources stay applied until explicit replacement. */
export function createMultiFilterDraft(
  source: unknown,
  ids: readonly string[],
): MultiFilterDraft {
  const empty = model(ids.map((id) => ({ id }))).filters,
    sourceKey = fingerprint(source);
  let filters = empty,
    supported = source === undefined;
  if (source && typeof source === "object") {
    const op = Object.getOwnPropertyDescriptor(source, "op");
    if (op && "value" in op && op.value === "multi") {
      try {
        const prepared = prepareMultiFilter(source),
          known = new Set(ids);
        if (prepared.filters.every((child) => known.has(child.id))) {
          const byId = new Map(
            prepared.filters.map((child) => [child.id, child]),
          );
          filters = model(
            empty.map((child) => byId.get(child.id) ?? child),
          ).filters;
          supported = true;
        }
      } catch {
        /* Preserve malformed external sources until explicit replacement. */
      }
    }
  }
  return Object.freeze({
    filters,
    sourceKey,
    baselineKey: supported ? fingerprint(model(filters)) : sourceKey,
    supported,
    dirty: false,
  });
}

export function stageMultiFilterChild(
  draft: MultiFilterDraft,
  id: string,
  candidate?: Filter,
): MultiFilterDraft {
  if (!draft.supported) throw new MultiFilterDraftError("unsupported");
  if (!draft.filters.some((child) => child.id === id))
    throw new MultiFilterDraftError("unknownChild");
  const filters = model(
    draft.filters.map((child) =>
      child.id === id
        ? candidate === undefined
          ? { id }
          : { id, filter: candidate as ScalarFilter | CompoundFilter }
        : child,
    ),
  ).filters;
  const nextKey = fingerprint(model(filters));
  if (nextKey === fingerprint(model(draft.filters))) return draft;
  return Object.freeze({
    ...draft,
    filters,
    dirty: nextKey !== draft.baselineKey,
  });
}

/** Keep the source fence while deliberately replacing its schema with known empty slots. */
export function replaceMultiFilterDraft(
  draft: MultiFilterDraft,
): MultiFilterDraft {
  const filters = model(
    draft.filters.map((child) => ({ id: child.id })),
  ).filters;
  return Object.freeze({
    ...draft,
    filters,
    supported: true,
    dirty:
      fingerprint(model(filters)) !== draft.baselineKey || !draft.supported,
  });
}
export function buildMultiFilterDraft(
  draft: MultiFilterDraft,
): MultiColumnFilter | undefined {
  if (!draft.supported) throw new MultiFilterDraftError("unsupported");
  const prepared = model(draft.filters);
  return prepared.filters.some((child) => child.filter !== undefined)
    ? prepared
    : undefined;
}
export function isMultiFilterSourceCurrent(
  draft: MultiFilterDraft,
  source: unknown,
): boolean {
  return draft.sourceKey === fingerprint(source);
}
/** Explicitly acknowledge a fresh source while retaining the user's staged child models. */
export function rebaseMultiFilterDraft(
  draft: MultiFilterDraft,
  source: unknown,
): MultiFilterDraft {
  if (!draft.supported) throw new MultiFilterDraftError("unsupported");
  const current = createMultiFilterDraft(
    source,
    draft.filters.map((child) => child.id),
  );
  return Object.freeze({
    ...draft,
    sourceKey: current.sourceKey,
    baselineKey: current.baselineKey,
    dirty: fingerprint(model(draft.filters)) !== current.baselineKey,
  });
}
