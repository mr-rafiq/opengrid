import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import type { Filter } from "@opengrid/core";
import type { ColumnFilterProps } from "./filter-components.js";
import { FilterPopup } from "./filter-popup.js";
import { useNestedDialogFocus } from "./use-nested-dialog-focus.js";
import { gridMessage, useGridLocale, type GridMessage } from "./locale.js";
import {
  prepareMultiFilterDefinitions,
  sameMultiFilterSchema,
  type MultiFilterDefinition,
} from "./multi-filter-definitions.js";
import {
  createMultiFilterDraft,
  stageMultiFilterChild,
  replaceMultiFilterDraft,
  rebaseMultiFilterDraft,
  buildMultiFilterDraft,
  isMultiFilterSourceCurrent,
  type MultiFilterDraft,
} from "./multi-filter-draft.js";

export type { MultiFilterDefinition } from "./multi-filter-definitions.js";
export interface MultiFilterProps<T> extends ColumnFilterProps<T> {
  definitions: readonly MultiFilterDefinition<T>[];
}
interface Session {
  owner: object;
  draft: MultiFilterDraft | null;
  conflict: boolean;
  unreadable: boolean;
}
interface Notice {
  message: GridMessage;
  detail?: string;
}
const noSubscribe = () => () => {},
  noSnapshot = () => null;
const detail = (reason: unknown) =>
  reason instanceof Error && typeof reason.message === "string"
    ? reason.message.slice(0, 1024)
    : undefined;

/** Configure once outside rendering; metadata is owned while application components remain borrowed. */
export function createMultiFilter<T>(
  definitions: readonly MultiFilterDefinition<T>[],
): ComponentType<ColumnFilterProps<T>> {
  const owned = prepareMultiFilterDefinitions(definitions);
  function ConfiguredMultiFilter(props: ColumnFilterProps<T>) {
    return <MultiFilter {...props} definitions={owned} />;
  }
  ConfiguredMultiFilter.displayName = "OpenGridMultiFilter";
  return ConfiguredMultiFilter;
}

/** Independently staged child models with one guarded root publication. */
export function MultiFilter<T>({
  column,
  model,
  filter,
  getFilter,
  label,
  onFilterChange,
  onClear,
  definitions,
}: MultiFilterProps<T>) {
  const { t, locale, resolveMessage } = useGridLocale();
  const owned = useMemo(
    () => prepareMultiFilterDefinitions(definitions),
    [definitions],
  );
  const committedSchema = useRef({ definitions: owned, key: {} });
  const schemaKey = sameMultiFilterSchema(
    committedSchema.current.definitions,
    owned,
  )
    ? committedSchema.current.key
    : {};
  useLayoutEffect(() => {
    committedSchema.current = { definitions: owned, key: schemaKey };
  }, [owned, schemaKey]);
  const owner = useMemo(
    () => ({
      model,
      column: column.id,
      type: column.type,
      field: column.field,
      schemaKey,
    }),
    [model, column.id, column.type, column.field, schemaKey],
  );
  const sourceState = useSyncExternalStore(
    model?.subscribe ?? noSubscribe,
    model?.getState ?? noSnapshot,
    model?.getState ?? noSnapshot,
  );
  const [session, setSession] = useState<Session | null>(null),
    [notice, setNotice] = useState<Notice | null>(null),
    [issues, setIssues] = useState<ReadonlyMap<string, string | undefined>>(
      new Map(),
    ),
    [epoch, setEpoch] = useState(0);
  const active = session?.owner === owner ? session : null;
  const live = useRef<Session | null>(null),
    launcher = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    lifecycle = useRef(false);
  function publishSession(next: Session | null) {
    live.current = next;
    setSession(next);
  }
  const issueRef = useRef<ReadonlyMap<string, string | undefined>>(new Map()),
    applying = useRef(false);
  function publishIssues(next: ReadonlyMap<string, string | undefined>) {
    issueRef.current = next;
    setIssues(next);
  }
  const id = useId(),
    titleId = `${id}-title`,
    helpId = `${id}-help`,
    noticeId = `${id}-notice`;
  useLayoutEffect(() => {
    if (session && !active) {
      publishSession(null);
      setNotice(null);
      publishIssues(new Map());
    }
  }, [session, active]);
  const readSource = () => (getFilter ? getFilter() : filter);
  function load(): Session {
    try {
      const draft = createMultiFilterDraft(
        readSource(),
        owned.map((child) => child.id),
      );
      setNotice(null);
      return { owner, draft, conflict: false, unreadable: false };
    } catch (reason: unknown) {
      setNotice({
        message: gridMessage("multiFilter.unreadable"),
        detail: detail(reason),
      });
      return { owner, draft: null, conflict: false, unreadable: true };
    }
  }
  function begin() {
    if (!active) {
      publishIssues(new Map());
      publishSession(load());
    }
  }
  function close() {
    live.current = null;
    lifecycle.current = true;
    const node = dialog.current;
    if (node?.open && typeof node.close === "function") node.close();
    else node?.removeAttribute("open");
    publishSession(null);
    setNotice(null);
    publishIssues(new Map());
    queueMicrotask(() => {
      const button = launcher.current;
      if (!button?.isConnected) return;
      const focus = button.ownerDocument.activeElement;
      if (
        focus === button ||
        focus === button.ownerDocument.body ||
        (focus && node?.contains(focus))
      )
        button.focus({ preventScroll: true });
    });
  }
  useLayoutEffect(() => {
    if (!active) return;
    const node = dialog.current;
    if (!node) return;
    lifecycle.current = false;
    if (typeof node.showModal === "function") node.showModal();
    else node.setAttribute("open", "");
    node
      .querySelector<HTMLElement>("button,input,select,textarea,[tabindex]")
      ?.focus({ preventScroll: true });
    return () => {
      lifecycle.current = true;
      if (node.open && typeof node.close === "function") node.close();
      else node.removeAttribute("open");
    };
  }, [active?.owner]);
  useNestedDialogFocus(dialog, active?.owner ?? null, live);
  useLayoutEffect(() => {
    if (!active?.draft) return;
    try {
      if (
        !isMultiFilterSourceCurrent(active.draft, readSource()) &&
        !active.conflict
      ) {
        publishSession({ ...active, conflict: true });
        setNotice({ message: gridMessage("multiFilter.conflict") });
      }
    } catch (reason: unknown) {
      if (!active.unreadable) {
        publishSession({ ...active, unreadable: true });
        setNotice({
          message: gridMessage("multiFilter.unreadable"),
          detail: detail(reason),
        });
      }
    }
  }, [active, filter, getFilter, sourceState]);
  const locked = !active?.draft || active.conflict || active.unreadable;
  function stage(childId: string, candidate?: Filter) {
    const current = live.current;
    if (!current?.draft || current.owner !== owner) return;
    try {
      const draft = stageMultiFilterChild(current.draft, childId, candidate);
      const next = { ...current, draft };
      publishSession(next);
      const nextIssues = new Map(issueRef.current);
      nextIssues.delete(childId);
      publishIssues(nextIssues);
      if (!current.conflict && !current.unreadable) setNotice(null);
    } catch (reason: unknown) {
      publishIssues(new Map(issueRef.current).set(childId, detail(reason)));
    }
  }
  function childFilter(childId: string): Filter | undefined {
    const current = live.current;
    return current?.owner === owner
      ? current.draft?.filters.find((child) => child.id === childId)?.filter
      : undefined;
  }
  function reset(action: "reload" | "replace" | "clear" | "keep") {
    const current = live.current;
    if (current?.owner !== owner) return;
    try {
      let next: Session;
      if (action === "reload") next = load();
      else if (action === "replace") {
        const fresh = createMultiFilterDraft(
          readSource(),
          owned.map((child) => child.id),
        );
        next = {
          owner,
          draft: replaceMultiFilterDraft(fresh),
          conflict: false,
          unreadable: false,
        };
      } else if (action === "keep" && current.draft?.supported) {
        next = {
          owner,
          draft: rebaseMultiFilterDraft(current.draft, readSource()),
          conflict: false,
          unreadable: false,
        };
      } else if (
        action === "clear" &&
        current.draft?.supported &&
        !current.conflict &&
        !current.unreadable
      ) {
        next = { ...current, draft: replaceMultiFilterDraft(current.draft) };
      } else return;
      publishSession(next);
      publishIssues(new Map());
      setEpoch((value) => value + 1);
      if (!next.unreadable) setNotice(null);
    } catch (reason: unknown) {
      setNotice({
        message: gridMessage("multiFilter.unreadable"),
        detail: detail(reason),
      });
    }
  }
  function apply() {
    const current = live.current;
    if (
      applying.current ||
      current?.owner !== owner ||
      !current.draft?.supported ||
      current.conflict ||
      current.unreadable ||
      issueRef.current.size
    )
      return;
    applying.current = true;
    try {
      if (!isMultiFilterSourceCurrent(current.draft, readSource())) {
        const next = { ...current, conflict: true };
        publishSession(next);
        setNotice({ message: gridMessage("multiFilter.conflict") });
        return;
      }
      const prepared = buildMultiFilterDraft(current.draft);
      if (prepared === undefined) onClear();
      else onFilterChange(prepared);
      close();
    } catch (reason: unknown) {
      setNotice({
        message: gridMessage("multiFilter.failed"),
        detail: detail(reason),
      });
    } finally {
      applying.current = false;
    }
  }
  return (
    <div
      className="og-multi-filter"
      data-og-filter-column={column.id}
      lang={locale}
    >
      <button
        ref={launcher}
        type="button"
        className="og-condition-launcher"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={Boolean(active)}
        onClick={begin}
      >
        {label}
      </button>
      {active && (
        <FilterPopup>
          <dialog
            ref={dialog}
            className="og-multi-filter-dialog"
            lang={locale}
            data-og-filter-column={column.id}
            aria-labelledby={titleId}
            aria-describedby={`${helpId}${notice ? ` ${noticeId}` : ""}`}
            onCancel={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              event.stopPropagation();
              close();
            }}
            onClose={(event) => {
              if (
                event.target === event.currentTarget &&
                !lifecycle.current &&
                !event.currentTarget.open
              )
                close();
            }}
            onKeyDown={(event) => {
              if (
                !(event.target instanceof Element) ||
                event.target.closest("dialog") !== event.currentTarget
              )
                return;
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
          >
            <h2 id={titleId} dir="auto">
              {t("multiFilter.title", { column: column.header ?? column.id })}
            </h2>
            <p id={helpId} dir="auto">
              {t("multiFilter.help")}
            </p>
            {notice && (
              <div id={noticeId} role="alert" dir="auto">
                <p>{resolveMessage(notice.message)}</p>
                {notice.detail && <p>{notice.detail}</p>}
              </div>
            )}
            {active.draft && !active.draft.supported && (
              <p dir="auto">{t("multiFilter.unsupported")}</p>
            )}
            {(active.conflict || active.unreadable) && (
              <div className="og-multi-filter-actions">
                <button type="button" onClick={() => reset("reload")}>
                  {t("multiFilter.reload")}
                </button>
                {active.draft?.supported && (
                  <button type="button" onClick={() => reset("keep")}>
                    {t("multiFilter.keep")}
                  </button>
                )}
              </div>
            )}
            {active.draft && !active.draft.supported && (
              <button type="button" onClick={() => reset("replace")}>
                {t("multiFilter.replace")}
              </button>
            )}
            {owned.map((definition) => {
              const Component = definition.component,
                child = active.draft?.filters.find(
                  (slot) => slot.id === definition.id,
                ),
                problem = issues.get(definition.id),
                invalid = issues.has(definition.id);
              return (
                <fieldset
                  key={`${definition.id}:${epoch}`}
                  disabled={locked || !active.draft?.supported}
                  aria-invalid={invalid || undefined}
                  className="og-multi-filter-child"
                >
                  <legend dir="auto">{definition.label}</legend>
                  <Component
                    column={column}
                    model={model}
                    filter={child?.filter}
                    getFilter={() => childFilter(definition.id)}
                    label={t("multiFilter.child", { label: definition.label })}
                    onFilterChange={(candidate) =>
                      stage(definition.id, candidate)
                    }
                    onClear={() => stage(definition.id, undefined)}
                  />
                  {invalid && (
                    <div role="alert" dir="auto">
                      <p>
                        {t("multiFilter.childFailed", {
                          label: definition.label,
                        })}
                      </p>
                      {problem && <p>{problem}</p>}
                    </div>
                  )}
                </fieldset>
              );
            })}
            <p role="status" dir="auto">
              {t("multiFilter.count", {
                count:
                  active.draft?.filters.filter(
                    (child) => child.filter !== undefined,
                  ).length ?? 0,
                total: owned.length,
              })}
            </p>
            {active.draft?.dirty && (
              <p dir="auto">{t("multiFilter.pending")}</p>
            )}
            <div className="og-multi-filter-actions">
              <button type="button" onClick={close}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={locked || !active.draft?.supported}
                onClick={() => reset("clear")}
              >
                {t("multiFilter.clearDraft")}
              </button>
              <button
                type="button"
                disabled={locked || !active.draft?.supported || issues.size > 0}
                onClick={apply}
              >
                {t("multiFilter.apply")}
              </button>
            </div>
          </dialog>
        </FilterPopup>
      )}
    </div>
  );
}
