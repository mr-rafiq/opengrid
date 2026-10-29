import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createSetFilterIndex,
  type Filter,
  type GridModel,
  type SetFilterEntry,
  type SetFilterIndex,
} from "@opengrid/core";
import type { ColumnFilterProps } from "./filter-components.js";
import { gridMessage, useGridLocale, type GridMessage } from "./locale.js";

export interface SetListFilterProps<T> extends ColumnFilterProps<T> {
  /** A resident client-side model; remote/list-loading adapters are outside this component's contract. */
  model?: GridModel<T>;
  /** Number of checkbox choices mounted at once, 10..200. Default 50. */
  pageSize?: number;
}
type Mode = "all" | "explicit" | "unsupported";
interface Draft {
  mode: Mode;
  keys: Set<string>;
  baselineSelection: string;
  baselineFilter: string;
  conflict: boolean;
  removed: number;
}
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
const selectionKey = (mode: Mode, keys: ReadonlySet<string>) =>
  mode === "explicit" ? `in:${JSON.stringify([...keys].sort())}` : mode;
class FilterReadError extends Error {}

/** Bounded structural fingerprint for unsupported filters; never stringify BigInt or invoke accessors. */
function stable(
  value: unknown,
  budget = { nodes: 20000, text: 4000000 },
  depth = 0,
): string {
  if (--budget.nodes < 0 || depth > 32) throw new FilterReadError();
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "number")
    return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    budget.text -= value.length;
    if (budget.text < 0) throw new FilterReadError();
    return `string:${JSON.stringify(value)}`;
  }
  if (value instanceof Date)
    return `date:${Date.prototype.getTime.call(value)}`;
  if (typeof value !== "object") throw new FilterReadError();
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== null &&
    prototype !== Object.prototype
  )
    throw new FilterReadError();
  const keys = Reflect.ownKeys(value);
  if (keys.length > budget.nodes || keys.some((key) => typeof key !== "string"))
    throw new FilterReadError();
  const ordered = (keys as string[]).sort();
  return `${Array.isArray(value) ? "array" : "record"}:{${ordered
    .map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new FilterReadError();
      return `${stable(key, budget, depth + 1)}:${stable(descriptor.value, budget, depth + 1)}`;
    })
    .join(",")}}`;
}
function currentFilter(filter: Filter | undefined, index: SetFilterIndex) {
  if (!filter)
    return {
      mode: "all" as const,
      keys: new Set<string>(),
      fingerprint: "all",
      removed: 0,
    };
  if (filter.op !== "in" || !Array.isArray(filter.value))
    return {
      mode: "unsupported" as const,
      keys: new Set<string>(),
      fingerprint: `other:${stable(filter)}`,
      removed: 0,
    };
  if (filter.value.length > 10000) throw new FilterReadError();
  const allKeys = new Set<string>();
  for (let i = 0; i < filter.value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(filter.value, String(i));
    if (!descriptor || !("value" in descriptor)) throw new FilterReadError();
    allKeys.add(index.keyOf(descriptor.value));
  }
  const available = new Set(index.entries.map((entry) => entry.key));
  const keys = new Set([...allKeys].filter((key) => available.has(key)));
  return {
    mode: "explicit" as const,
    keys,
    fingerprint: selectionKey("explicit", allKeys),
    removed: allKeys.size - keys.size,
  };
}
function initialDraft(
  filter: Filter | undefined,
  index: SetFilterIndex,
): Draft {
  const value = currentFilter(filter, index);
  return {
    mode: value.mode,
    keys: value.keys,
    baselineSelection: selectionKey(value.mode, value.keys),
    baselineFilter: value.fingerprint,
    conflict: false,
    removed: value.removed,
  };
}

/** Staged resident-value filtering. Only Apply calls the controlled filter callbacks. */
export function SetListFilter<T>({
  model,
  column,
  filter,
  label,
  onFilterChange,
  onClear,
  pageSize = 50,
}: SetListFilterProps<T>) {
  const { t, locale, resolveMessage } = useGridLocale();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [notice, setNotice] = useState<GridMessage | string>("");
  const launcher = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null);
  const openRef = useRef(false),
    context = useRef({ model, id: column.id });
  const lifecycleClose = useRef(false);
  const titleId = useId(),
    helpId = useId(),
    errorId = useId();
  const state = useSyncExternalStore<ReturnType<
    GridModel<T>["getState"]
  > | null>(
    model?.subscribe ?? emptySubscribe,
    model?.getState ?? emptySnapshot,
    model?.getState ?? emptySnapshot,
  );
  const size = Number.isSafeInteger(pageSize)
    ? Math.max(10, Math.min(200, pageSize))
    : 50;
  const result = useMemo<{
    index?: SetFilterIndex;
    error?: GridMessage | string;
  }>(() => {
    if (!open) return {};
    if (!model) return { error: gridMessage("setList.modelRequired") };
    try {
      return { index: createSetFilterIndex(model, column.id) };
    } catch (reason) {
      return {
        error:
          reason instanceof Error
            ? reason.message
            : gridMessage("setList.indexFailed"),
      };
    }
  }, [open, model, column.id, state]);
  const index = result.index;
  const parsed = useMemo<{
    value?: ReturnType<typeof currentFilter>;
    error?: GridMessage | string;
  }>(() => {
    if (!index) return {};
    try {
      return { value: currentFilter(filter, index) };
    } catch {
      return { error: gridMessage("setList.readFailed") };
    }
  }, [index, filter]);
  const error = result.error ?? parsed.error ?? notice;
  function close() {
    if (!openRef.current) return;
    openRef.current = false;
    lifecycleClose.current = true;
    const node = dialog.current;
    if (node?.open && typeof node.close === "function") node.close();
    else node?.removeAttribute("open");
    setOpen(false);
    if (launcher.current?.isConnected)
      launcher.current.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    if (context.current.model !== model || context.current.id !== column.id) {
      context.current = { model, id: column.id };
      close();
      setDraft(null);
    }
  }, [model, column.id]);
  useLayoutEffect(() => {
    if (!open) return;
    const node = dialog.current;
    if (!node) return;
    lifecycleClose.current = false;
    if (typeof node.showModal === "function") node.showModal();
    else node.setAttribute("open", "");
    search.current?.focus({ preventScroll: true });
    return () => {
      lifecycleClose.current = true;
      if (node.open && typeof node.close === "function") node.close();
      else node.removeAttribute("open");
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !index || !parsed.value) return;
    setDraft((previous) => {
      if (!previous) return initialDraft(filter, index);
      const dirty =
        selectionKey(previous.mode, previous.keys) !==
        previous.baselineSelection;
      if (parsed.value!.fingerprint !== previous.baselineFilter) {
        if (!dirty && !previous.conflict) return initialDraft(filter, index);
      }
      const available = new Set(index.entries.map((entry) => entry.key));
      const keys = new Set(
        [...previous.keys].filter((key) => available.has(key)),
      );
      const removed =
        previous.mode === "explicit" ? previous.keys.size - keys.size : 0;
      const conflict =
        previous.conflict ||
        (dirty && parsed.value!.fingerprint !== previous.baselineFilter);
      if (!removed && conflict === previous.conflict) return previous;
      return {
        ...previous,
        keys,
        removed: previous.removed + removed,
        conflict,
      };
    });
  }, [open, index, parsed.value?.fingerprint]);
  const choices = useMemo(() => {
    const needle = query.toLocaleLowerCase(locale);
    return (
      index?.entries.filter((entry) =>
        (entry.blank ? t("setList.blank") : entry.label)
          .toLocaleLowerCase(locale)
          .includes(needle),
      ) ?? []
    );
  }, [index, query, locale, t]);
  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of index?.entries ?? []) {
      const text = entry.blank ? t("setList.blank") : entry.label;
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    return counts;
  }, [index, t]);
  const identityHint = (entry: SetFilterEntry) =>
    !entry.blank && (labelCounts.get(entry.label) ?? 0) > 1
      ? t("setList.choiceIdentity", {
          type: t(
            column.type === "date"
              ? "setList.typeDate"
              : typeof entry.value === "bigint"
                ? "setList.typeBigInt"
                : typeof entry.value === "number"
                  ? "setList.typeNumber"
                  : typeof entry.value === "boolean"
                    ? "setList.typeBoolean"
                    : "setList.typeText",
          ),
          value: Object.is(entry.value, -0) ? "-0" : String(entry.value),
        })
      : "";
  const pages = Math.ceil(choices.length / size),
    currentPage = Math.min(page, Math.max(0, pages - 1));
  const visible = choices.slice(currentPage * size, (currentPage + 1) * size);
  const selected = (key: string) =>
    draft?.mode === "all" || !!draft?.keys.has(key);
  const selectedMatches = choices.reduce(
    (sum, entry) => sum + (selected(entry.key) ? 1 : 0),
    0,
  );
  const selectedCount =
    draft?.mode === "all"
      ? (index?.entries.length ?? 0)
      : (draft?.keys.size ?? 0);
  function updateKeys(change: (keys: Set<string>) => void) {
    if (!index) return;
    setDraft((previous) => {
      if (!previous || previous.mode === "unsupported" || previous.conflict)
        return previous;
      const keys =
        previous.mode === "all"
          ? new Set(index.entries.map((entry) => entry.key))
          : new Set(previous.keys);
      change(keys);
      return { ...previous, mode: "explicit", keys };
    });
    setNotice("");
  }
  function reload() {
    if (!index) return;
    try {
      setDraft(initialDraft(filter, index));
      setNotice("");
    } catch {
      setNotice(gridMessage("setList.readFailed"));
    }
  }
  function apply() {
    if (
      !draft ||
      !index ||
      result.error ||
      parsed.error ||
      draft.conflict ||
      draft.mode === "unsupported"
    )
      return;
    try {
      // Fence an external update even if the reconciliation effect has not run yet.
      if (currentFilter(filter, index).fingerprint !== draft.baselineFilter) {
        setDraft({ ...draft, conflict: true });
        return;
      }
      if (draft.mode === "all") onClear();
      else
        onFilterChange({ op: "in", value: [...index.values([...draft.keys])] });
      close();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : gridMessage("setList.applyFailed"),
      );
    }
  }
  return (
    <div className="og-set-list-filter" lang={locale}>
      <button
        ref={launcher}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (openRef.current) return;
          openRef.current = true;
          setDraft(null);
          setQuery("");
          setPage(0);
          setNotice("");
          setOpen(true);
        }}
      >
        {t("setList.values")}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="og-set-list-dialog"
          aria-labelledby={titleId}
          aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
          aria-modal="true"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={(event) => {
            if (!lifecycleClose.current && !event.currentTarget.open) close();
          }}
          style={{
            maxWidth: "min(460px, calc(100vw - 24px))",
            maxHeight: "min(640px, calc(100dvh - 24px))",
            width: 420,
            overflow: "auto",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            border: "1px solid var(--og-border)",
            borderRadius: 10,
            padding: 16,
            background: "var(--og-bg)",
            color: "var(--og-text)",
          }}
        >
          <h2 dir="auto" id={titleId}>
            {t("setList.title", { column: column.header ?? column.id })}
          </h2>
          <p dir="auto" id={helpId}>
            {t("setList.help")}
          </p>
          {error && (
            <p dir="auto" id={errorId} role="alert">
              {resolveMessage(error)}
            </p>
          )}
          {draft?.conflict && (
            <p dir="auto" role="alert">
              {t("setList.conflict")}
            </p>
          )}
          {draft?.mode === "unsupported" && (
            <p dir="auto" role="status">
              {t("setList.unsupported")}
            </p>
          )}
          {!!draft?.removed && (
            <p dir="auto" role="status">
              {t("setList.removed", { count: draft.removed })}
            </p>
          )}
          <label>
            {t("setList.search")}{" "}
            <input
              type="text"
              ref={search}
              dir="auto"
              aria-label={t("setList.search")}
              value={query}
              maxLength={256}
              disabled={!index}
              onChange={(event) => {
                if (event.target.value.length > 256) {
                  setNotice(gridMessage("setList.searchLimit"));
                  return;
                }
                setQuery(event.target.value);
                setPage(0);
                setNotice("");
              }}
            />
          </label>
          <fieldset
            disabled={
              !draft ||
              !index ||
              draft.mode === "unsupported" ||
              !!draft.conflict
            }
            style={{ border: 0, padding: 0 }}
          >
            <legend>{t("setList.choices")}</legend>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 32,
              }}
            >
              <input
                type="checkbox"
                aria-label={t("setList.selectMatches")}
                disabled={!choices.length}
                checked={!!choices.length && selectedMatches === choices.length}
                ref={(node) => {
                  if (node)
                    node.indeterminate =
                      selectedMatches > 0 && selectedMatches < choices.length;
                }}
                onChange={(event) => {
                  const checked = event.target.checked;
                  updateKeys((keys) => {
                    for (const entry of choices)
                      if (checked) keys.add(entry.key);
                      else keys.delete(entry.key);
                  });
                }}
              />
              {t("setList.selectMatches")}
            </label>
            {visible.map((entry) => (
              <label
                key={entry.key}
                data-set-filter-key={entry.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 32,
                }}
              >
                <input
                  type="checkbox"
                  aria-label={[
                    entry.blank ? t("setList.blank") : entry.label,
                    t("setList.entryCount", { count: entry.count }),
                    identityHint(entry),
                    entry.invalidCount > 0
                      ? t("setList.invalidHint", { count: entry.invalidCount })
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  checked={selected(entry.key)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    updateKeys((keys) => {
                      if (checked) keys.add(entry.key);
                      else keys.delete(entry.key);
                    });
                  }}
                />
                <span dir="auto">
                  {entry.blank ? t("setList.blank") : entry.label}
                </span>
                <span dir="auto">
                  {t("setList.entryCount", { count: entry.count })}
                </span>
                {identityHint(entry) && (
                  <span dir="auto">{identityHint(entry)}</span>
                )}
                {entry.invalidCount > 0 && (
                  <span dir="auto">
                    {t("setList.invalidHint", { count: entry.invalidCount })}
                  </span>
                )}
              </label>
            ))}
          </fieldset>
          {index && !choices.length && (
            <p dir="auto" role="status">
              {t("setList.empty")}
            </p>
          )}
          {index && (
            <p dir="auto" role="status">
              {t("setList.summary", {
                selected: selectedCount,
                total: index.entries.length,
                rows: index.rowCount,
              })}
            </p>
          )}
          <nav
            aria-label={t("setList.pages")}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <button
              type="button"
              disabled={currentPage <= 0}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("common.previous")}
            </button>
            <span dir="auto">
              {t("setList.page", { page: pages ? currentPage + 1 : 0, pages })}
            </span>
            <button
              type="button"
              disabled={currentPage >= pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("common.next")}
            </button>
          </nav>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
          >
            <button type="button" disabled={!index} onClick={reload}>
              {t("setList.reload")}
            </button>
            <button
              type="button"
              disabled={!draft || !index}
              onClick={() => {
                if (draft) setDraft({ ...draft, mode: "all", keys: new Set() });
                setNotice("");
              }}
            >
              {t("common.clear")}
            </button>
            <button type="button" onClick={close}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={
                !draft ||
                !index ||
                !!result.error ||
                !!parsed.error ||
                draft.mode === "unsupported" ||
                draft.conflict
              }
              onClick={apply}
            >
              {t("setList.apply")}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
