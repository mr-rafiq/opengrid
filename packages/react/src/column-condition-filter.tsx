import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { FilterPopup } from "./filter-popup.js";
import type { Filter, GridModel, ScalarFilter } from "@opengrid/core";
import type { ColumnFilterProps } from "./filter-components.js";
import { RangeFilterMessageError } from "./filter-value-parsing.js";
import { gridMessage, useGridLocale, type GridMessage } from "./locale.js";
import {
  buildColumnConditionFilter,
  columnFilterFingerprint,
  ConditionFilterDraftError,
  createConditionDraft,
  getConditionOperators,
  normalizeConditionLimit,
  readColumnConditionDraft,
  type ColumnConditionDraft,
  type ConditionLogic,
} from "./column-condition-draft.js";

export interface ColumnConditionFilterProps<T> extends ColumnFilterProps<T> {
  /** Default four keeps common conditions compact. Values outside 1..16 are rejected. */
  maxConditions?: number;
}
interface ConditionRow extends ColumnConditionDraft {
  id: number;
}
interface SourceFence {
  fingerprint: string | undefined;
  sourceKey?: string;
  controlledKey?: string;
  mirrorMatchesSource?: boolean;
  source: unknown;
  controlled: unknown;
  state: unknown;
  unreadable?: boolean;
  error?: GridMessage | string;
}
interface Draft {
  logic: ConditionLogic;
  conditions: ConditionRow[];
  fence: SourceFence;
  baselineDraft: string;
  unsupported: boolean;
  conflict: boolean;
}
const noSubscribe = () => () => {};
const noSnapshot = () => null;
const operatorKeys = {
  contains: "filter.contains",
  notContains: "filter.notContains",
  equals: "filter.equals",
  notEqual: "filter.notEqual",
  startsWith: "filter.startsWith",
  endsWith: "filter.endsWith",
  gt: "filter.gt",
  gte: "filter.gte",
  lt: "filter.lt",
  lte: "filter.lte",
  in: "filter.in",
  between: "filter.between",
  blank: "filter.blank",
  notBlank: "filter.notBlank",
} as const;
const draftKey = (
  logic: ConditionLogic,
  conditions: readonly ColumnConditionDraft[],
) =>
  JSON.stringify([
    logic,
    conditions.map(({ op, value, upper }) => [op, value, upper]),
  ]);
function sameFence(a: SourceFence, b: SourceFence) {
  if (a.unreadable || b.unreadable) return false;
  return a.fingerprint !== undefined && b.fingerprint !== undefined
    ? a.sourceKey === b.sourceKey &&
        (a.controlledKey === b.controlledKey || !!a.mirrorMatchesSource)
    : a.source === b.source &&
        a.controlled === b.controlled &&
        a.state === b.state;
}
function noticeFor(error: unknown): GridMessage | string {
  return error instanceof ConditionFilterDraftError ||
    error instanceof RangeFilterMessageError
    ? error.notice
    : error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : gridMessage("conditionFilter.failed");
}

/** A single column's staged scalar/AND/OR conditions. Cancel never publishes a draft. */
export function ColumnConditionFilter<T>({
  column,
  model,
  filter,
  getFilter,
  label,
  onFilterChange,
  onClear,
  maxConditions = 4,
}: ColumnConditionFilterProps<T>) {
  const { t, locale, resolveMessage } = useGridLocale();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<GridMessage | string>("");
  const launcher = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const opened = useRef(false),
    lifecycleClose = useRef(false),
    sequence = useRef(0);
  const context = useRef({
    model,
    columnId: column.id,
    type: column.type,
    maxConditions,
  });
  const rootId = useId(),
    errorId = `${rootId}-error`,
    titleId = `${rootId}-title`,
    helpId = `${rootId}-help`;
  const state = useSyncExternalStore<ReturnType<
    GridModel<T>["getState"]
  > | null>(
    model?.subscribe ?? noSubscribe,
    model?.getState ?? noSnapshot,
    model?.getState ?? noSnapshot,
  );
  let limit = 4,
    limitError = false;
  try {
    limit = normalizeConditionLimit(maxConditions);
  } catch {
    limitError = true;
  }
  function sourceFence(): SourceFence {
    let live: ReturnType<GridModel<T>["getState"]> | undefined;
    let source: Filter | undefined;
    try {
      live = model?.getState();
      source = getFilter
        ? getFilter()
        : live
          ? Object.hasOwn(live.filters, column.id)
            ? live.filters[column.id]
            : undefined
          : filter;
    } catch (reason) {
      return {
        fingerprint: undefined,
        source: undefined,
        controlled: filter,
        state: live,
        unreadable: true,
        error: noticeFor(reason) || gridMessage("conditionFilter.failed"),
      };
    }
    let fingerprint: string | undefined;
    let sourceKey: string | undefined,
      controlledKey: string | undefined,
      mirrorMatchesSource = false;
    try {
      sourceKey = columnFilterFingerprint(source);
      controlledKey =
        source === filter ? sourceKey : columnFilterFingerprint(filter);
      fingerprint = `${sourceKey.length}:${sourceKey}${controlledKey}`;
      mirrorMatchesSource = sourceKey === controlledKey;
      if (
        !mirrorMatchesSource &&
        source !== undefined &&
        filter !== undefined
      ) {
        try {
          const sourceDraft = readColumnConditionDraft(source, column.type, 16),
            mirrorDraft = readColumnConditionDraft(filter, column.type, 16);
          mirrorMatchesSource =
            columnFilterFingerprint(
              buildColumnConditionFilter(
                sourceDraft.logic,
                sourceDraft.conditions,
                column.type,
              ),
            ) ===
            columnFilterFingerprint(
              buildColumnConditionFilter(
                mirrorDraft.logic,
                mirrorDraft.conditions,
                column.type,
              ),
            );
        } catch {
          /* Unrepresentable mirrors require an exact structural match. */
        }
      }
    } catch {
      /* Unsafe sources are never traversed by the editor. */
    }
    return {
      fingerprint,
      sourceKey,
      controlledKey,
      mirrorMatchesSource,
      source,
      controlled: filter,
      state: live,
    };
  }
  const current = open ? sourceFence() : undefined;
  function read(fence: SourceFence): Draft {
    try {
      if (fence.unreadable)
        throw new ConditionFilterDraftError(
          gridMessage("conditionFilter.failed"),
        );
      if (limitError)
        throw new ConditionFilterDraftError(
          gridMessage("conditionFilter.limit"),
        );
      const parsed = readColumnConditionDraft(fence.source, column.type, limit);
      return {
        logic: parsed.logic,
        conditions: parsed.conditions.map((item) => ({
          ...item,
          id: ++sequence.current,
        })),
        fence,
        baselineDraft: draftKey(parsed.logic, parsed.conditions),
        unsupported: false,
        conflict: false,
      };
    } catch {
      return {
        logic: "and",
        conditions: [],
        fence,
        baselineDraft: "",
        unsupported: true,
        conflict: false,
      };
    }
  }
  function close() {
    if (!opened.current) return;
    opened.current = false;
    lifecycleClose.current = true;
    const node = dialog.current;
    if (node?.open && typeof node.close === "function") node.close();
    else node?.removeAttribute("open");
    setOpen(false);
    if (launcher.current?.isConnected)
      launcher.current.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    const previous = context.current;
    if (
      previous.model !== model ||
      previous.columnId !== column.id ||
      previous.type !== column.type ||
      previous.maxConditions !== maxConditions
    ) {
      context.current = {
        model,
        columnId: column.id,
        type: column.type,
        maxConditions,
      };
      close();
      setDraft(null);
    }
  }, [model, column.id, column.type, maxConditions]);
  useLayoutEffect(() => {
    if (!open) return;
    const node = dialog.current;
    if (!node) return;
    lifecycleClose.current = false;
    if (typeof node.showModal === "function") node.showModal();
    else node.setAttribute("open", "");
    node
      .querySelector<HTMLElement>("[data-condition-initial],button")
      ?.focus({ preventScroll: true });
    return () => {
      lifecycleClose.current = true;
      if (node.open && typeof node.close === "function") node.close();
      else node.removeAttribute("open");
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !draft || !current || current.unreadable) return;
    if (sameFence(current, draft.fence)) {
      if (current.fingerprint !== draft.fence.fingerprint)
        setDraft({ ...draft, fence: current });
      return;
    }
    const dirty =
      draftKey(draft.logic, draft.conditions) !== draft.baselineDraft;
    if (!dirty && !draft.conflict && !draft.unsupported)
      setDraft(read(current));
    else if (!draft.conflict) setDraft({ ...draft, conflict: true });
  }, [open, filter, state, current?.fingerprint, current?.unreadable]);
  function update(id: number, patch: Partial<ColumnConditionDraft>) {
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          conditions: previous.conditions.map((row) =>
            row.id === id ? { ...row, ...patch } : row,
          ),
        },
    );
    setNotice("");
  }
  function reload() {
    const latest = sourceFence();
    if (latest.unreadable) {
      setNotice(latest.error ?? gridMessage("conditionFilter.failed"));
      return;
    }
    setDraft(read(latest));
    setNotice("");
  }
  function replace() {
    if (!draft || limitError) return;
    const fence = sourceFence();
    if (fence.unreadable) {
      setNotice(fence.error ?? gridMessage("conditionFilter.failed"));
      return;
    }
    setDraft({
      ...draft,
      fence,
      conditions: draft.unsupported
        ? [{ ...createConditionDraft(column.type), id: ++sequence.current }]
        : draft.conditions,
      baselineDraft: "",
      unsupported: false,
      conflict: false,
    });
    setNotice("");
  }
  function apply() {
    if (!draft || draft.unsupported || draft.conflict || limitError) return;
    const latest = sourceFence();
    if (latest.unreadable) {
      setNotice(latest.error ?? gridMessage("conditionFilter.failed"));
      return;
    }
    if (!sameFence(latest, draft.fence)) {
      setDraft({ ...draft, conflict: true });
      return;
    }
    if (draftKey(draft.logic, draft.conditions) === draft.baselineDraft) {
      close();
      return;
    }
    try {
      const next: Filter = buildColumnConditionFilter(
        draft.logic,
        draft.conditions,
        column.type,
      );
      // Validation may call application code in future adapters; fence again before publication.
      const finalFence = sourceFence();
      if (finalFence.unreadable) {
        setNotice(finalFence.error ?? gridMessage("conditionFilter.failed"));
        return;
      }
      if (!sameFence(finalFence, draft.fence)) {
        setDraft({ ...draft, conflict: true });
        return;
      }
      onFilterChange(next);
      close();
    } catch (error) {
      setNotice(noticeFor(error));
    }
  }
  function clear() {
    try {
      const latest = sourceFence();
      if (latest.unreadable) {
        setNotice(latest.error ?? gridMessage("conditionFilter.failed"));
        return;
      }
      onClear();
      close();
    } catch (error) {
      setNotice(noticeFor(error));
    }
  }
  const error = resolveMessage(
    current?.error ||
      (limitError
        ? gridMessage("conditionFilter.limit")
        : draft?.conflict
          ? gridMessage("conditionFilter.conflict")
          : notice ||
            (draft?.unsupported
              ? gridMessage("conditionFilter.unsupported")
              : "")),
  );
  const locked =
    !!draft?.unsupported ||
    !!draft?.conflict ||
    !!current?.unreadable ||
    limitError;
  function operandControl(row: ConditionRow, index: number, upper = false) {
    const key = upper ? "upper" : "value",
      value = row[key];
    const inputId = `${rootId}-${row.id}-${key}`;
    const valueLabel = t(
      upper ? "conditionFilter.upper" : "conditionFilter.value",
      { index },
    );
    if (column.type === "boolean" && row.op !== "in")
      return (
        <label htmlFor={inputId}>
          {valueLabel}
          <select
            id={inputId}
            value={value}
            disabled={locked}
            onChange={(event) => update(row.id, { [key]: event.target.value })}
          >
            <option value="true">{t("common.true")}</option>
            <option value="false">{t("common.false")}</option>
          </select>
        </label>
      );
    return (
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <label htmlFor={inputId}>{valueLabel}</label>
        <input
          id={inputId}
          type="text"
          value={value}
          disabled={locked}
          dir="auto"
          inputMode={
            row.op === "in"
              ? undefined
              : column.type === "bigint"
                ? "numeric"
                : column.type === "number"
                  ? "decimal"
                  : undefined
          }
          aria-invalid={notice ? true : undefined}
          aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
          onChange={(event) => update(row.id, { [key]: event.target.value })}
        />
        {column.type === "date" && row.op !== "in" && (
          <label>
            {t("conditionFilter.calendar", { index })}
            {upper ? ` — ${valueLabel}` : ""}
            <input
              type="date"
              value={/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ""}
              disabled={locked}
              aria-describedby={helpId}
              onChange={(event) => {
                if (event.target.value)
                  update(row.id, {
                    [key]: `${event.target.value}T00:00:00.000Z`,
                  });
              }}
            />
          </label>
        )}
      </div>
    );
  }
  return (
    <div className="og-condition-filter" lang={locale}>
      <button
        type="button"
        ref={launcher}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (opened.current) return;
          opened.current = true;
          setDraft(read(sourceFence()));
          setNotice("");
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && draft && (
        <FilterPopup>
          <dialog
            data-og-filter-column={column.id}
            ref={dialog}
            className="og-condition-dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={helpId}
            lang={locale}
            style={{
              maxWidth: "min(680px,calc(100vw - 32px))",
              width: "min(680px,calc(100vw - 32px))",
              maxHeight: "calc(100vh - 32px)",
              overflow: "auto",
              boxSizing: "border-box",
            }}
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
            onClose={(event) => {
              if (!lifecycleClose.current && !event.currentTarget.open) close();
            }}
          >
            <h2 id={titleId} dir="auto">
              {t("conditionFilter.title", {
                column: column.header ?? column.id,
              })}
            </h2>
            <div id={helpId}>
              <p dir="auto">{t("conditionFilter.help")}</p>
              {column.type === "date" && (
                <p dir="auto">{t("conditionFilter.dateHelp")}</p>
              )}
              <p dir="auto">{t("conditionFilter.membershipHelp")}</p>
            </div>
            {error && (
              <p id={errorId} role="alert" dir="auto">
                {error}
              </p>
            )}
            {!draft.unsupported && (
              <>
                <label>
                  {t("conditionFilter.logic")}
                  <select
                    data-condition-initial
                    value={draft.logic}
                    disabled={locked}
                    onChange={(event) => {
                      setDraft({
                        ...draft,
                        logic: event.target.value as ConditionLogic,
                      });
                      setNotice("");
                    }}
                  >
                    <option value="and">{t("conditionFilter.and")}</option>
                    <option value="or">{t("conditionFilter.or")}</option>
                  </select>
                </label>
                {draft.conditions.map((row, offset) => {
                  const index = offset + 1;
                  return (
                    <fieldset
                      className="og-condition-row"
                      key={row.id}
                      disabled={locked}
                      style={{
                        marginBlock: 12,
                        minWidth: 0,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <legend>
                        {t("conditionFilter.condition", { index })}
                      </legend>
                      <label>
                        {t("conditionFilter.operator", { index })}
                        <select
                          value={row.op}
                          onChange={(event) => {
                            const op = event.target.value as ScalarFilter["op"];
                            update(row.id, {
                              op,
                              value:
                                op === "in"
                                  ? "[]"
                                  : row.op === "in"
                                    ? column.type === "boolean"
                                      ? "true"
                                      : ""
                                    : row.value,
                            });
                          }}
                        >
                          {getConditionOperators(column.type).map((op) => (
                            <option key={op} value={op}>
                              {t(operatorKeys[op])}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.op !== "blank" &&
                        row.op !== "notBlank" &&
                        operandControl(row, index)}
                      {row.op === "between" && operandControl(row, index, true)}
                      <button
                        type="button"
                        disabled={locked || draft.conditions.length <= 1}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            conditions: draft.conditions.filter(
                              (item) => item.id !== row.id,
                            ),
                          });
                          setNotice("");
                        }}
                      >
                        {t("conditionFilter.remove", { index })}
                      </button>
                    </fieldset>
                  );
                })}
                <button
                  type="button"
                  disabled={locked || draft.conditions.length >= limit}
                  onClick={() => {
                    setDraft({
                      ...draft,
                      conditions: [
                        ...draft.conditions,
                        {
                          ...createConditionDraft(column.type),
                          id: ++sequence.current,
                        },
                      ],
                    });
                    setNotice("");
                  }}
                >
                  {t("conditionFilter.add")}
                </button>
              </>
            )}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBlockStart: 16,
              }}
            >
              <button type="button" disabled={locked} onClick={apply}>
                {t("conditionFilter.apply")}
              </button>
              {(draft.conflict || draft.unsupported || current?.unreadable) && (
                <>
                  <button type="button" onClick={reload}>
                    {t("conditionFilter.reload")}
                  </button>
                  <button
                    type="button"
                    disabled={limitError || current?.unreadable}
                    onClick={replace}
                  >
                    {t("conditionFilter.replace")}
                  </button>
                </>
              )}
              <button type="button" onClick={clear}>
                {t("common.clear")}
              </button>
              <button type="button" onClick={close}>
                {t("common.cancel")}
              </button>
            </div>
          </dialog>
        </FilterPopup>
      )}
    </div>
  );
}
