import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { EditorOption } from "./editors.js";
import { FilterPopup } from "./filter-popup.js";
import { gridMessage, useGridLocale, type GridMessage } from "./locale.js";
import {
  RICH_SELECT_LIMITS,
  RichSelectOptionsError,
  type RichSelectSearchMode,
} from "./rich-select-options.js";
import { useRichSelectSource } from "./use-rich-select-source.js";

export interface RichSelectApplyContext {
  readonly signal: AbortSignal;
  readonly reason: "apply" | "enter";
}
export interface RichSelectEditorProps {
  value: string;
  label: string;
  description?: string;
  displayValue?: string;
  options?: readonly EditorOption[];
  asyncOptions?: (signal?: AbortSignal) => Promise<readonly EditorOption[]>;
  searchMode?: RichSelectSearchMode;
  autoOpen?: boolean;
  disabled?: boolean;
  /** A replaced editing owner closes old work; remount to auto-open a new owner. */
  contextKey?: unknown;
  error?: string;
  onApply: (
    value: string,
    context: RichSelectApplyContext,
  ) => boolean | void | Promise<boolean | void>;
  onCancel?: () => void;
  onOpenChange?: (open: boolean) => void;
}
interface OpenKey {
  readonly owner: unknown;
}
interface ApplyRequest {
  readonly abort: AbortController;
  readonly source: object;
  readonly key: OpenKey;
}
const ROW_HEIGHT = 36,
  VISIBLE_ROWS = 8,
  OVERSCAN = 2;

/** A staged string-choice picker; owner callbacks decide whether Apply saves or stages a field. */
export function RichSelectEditor({
  value,
  label,
  description,
  displayValue,
  options,
  asyncOptions,
  searchMode = "contains",
  autoOpen = false,
  disabled = false,
  contextKey,
  error,
  onApply,
  onCancel,
  onOpenChange,
}: RichSelectEditorProps) {
  const { t, resolveMessage, locale } = useGridLocale();
  const id = useId(),
    titleId = `${id}-title`,
    helpId = `${id}-help`,
    descriptionId = `${id}-description`,
    listId = `${id}-choices`,
    errorId = `${id}-error`;
  const launcher = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null);
  const autoOpened = useRef(false),
    lifecycleClose = useRef(false),
    disposed = useRef(false),
    reportedOpen = useRef(false);
  const openListener = useRef(onOpenChange);
  useLayoutEffect(() => {
    openListener.current = onOpenChange;
  });
  const request = useRef<ApplyRequest | null>(null);
  const [open, setOpen] = useState<OpenKey | null>(null);
  const [query, setQuery] = useState(""),
    [activeValue, setActiveValue] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0),
    [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<GridMessage | string>("");
  const [chosenLabel, setChosenLabel] = useState<{
    value: string;
    label: string;
  } | null>(null);
  const effective =
    open && Object.is(open.owner, contextKey) && !disabled ? open : null;
  const source = useRichSelectSource({
    openKey: effective,
    options,
    asyncOptions,
    locale,
  });
  const results = useMemo(() => {
    if (!source.index) return [];
    return source.index.search(query, searchMode);
  }, [source.index, query, searchMode]);
  const choices = source.index?.options;
  const suggested =
    activeValue === null && query.trim()
      ? results.find((index) => !choices?.[index].disabled)
      : undefined;
  const selectedIndex =
    activeValue === null ? suggested : source.index?.indexOf(activeValue);
  const activePosition =
    selectedIndex === undefined ? -1 : results.indexOf(selectedIndex);
  const selected =
    selectedIndex === undefined ? undefined : choices?.[selectedIndex];
  const available = Boolean(
    selected && !selected.disabled && activePosition >= 0,
  );
  const live = useRef({ key: effective, source: source.identity });
  useLayoutEffect(() => {
    live.current = { key: effective, source: source.identity };
  });
  useLayoutEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      request.current?.abort.abort();
      request.current = null;
    };
  }, []);
  function reportOpen(next: boolean) {
    if (reportedOpen.current === next) return;
    reportedOpen.current = next;
    openListener.current?.(next);
  }
  function begin() {
    if (disabled || effective) return;
    request.current?.abort.abort();
    request.current = null;
    setQuery("");
    setActiveValue(value);
    setScrollTop(0);
    setNotice("");
    setApplying(false);
    setOpen({ owner: contextKey });
    reportOpen(true);
  }
  function close(cancelled: boolean) {
    request.current?.abort.abort();
    request.current = null;
    source.cancel();
    lifecycleClose.current = true;
    const node = dialog.current;
    if (node?.open && typeof node.close === "function") node.close();
    else node?.removeAttribute("open");
    setApplying(false);
    setOpen(null);
    reportOpen(false);
    if (cancelled) onCancel?.();
    queueMicrotask(() => {
      const button = launcher.current;
      if (!button?.isConnected) return;
      const active = button.ownerDocument.activeElement;
      if (
        active === button ||
        active === button.ownerDocument.body ||
        (active && node?.contains(active))
      )
        button.focus({ preventScroll: true });
    });
  }
  useLayoutEffect(() => {
    if (open && !effective) {
      setOpen(null);
      setApplying(false);
      reportOpen(false);
    }
  }, [open, effective]);
  useLayoutEffect(() => {
    if (!autoOpen || disabled || autoOpened.current) return;
    autoOpened.current = true;
    begin();
  }, [autoOpen, disabled]);
  useLayoutEffect(() => {
    if (!effective) return;
    const node = dialog.current;
    if (!node) return;
    lifecycleClose.current = false;
    if (typeof node.showModal === "function") node.showModal();
    else node.setAttribute("open", "");
    search.current?.focus({ preventScroll: true });
    return () => {
      lifecycleClose.current = true;
      request.current?.abort.abort();
      request.current = null;
      source.cancel();
      if (node.open && typeof node.close === "function") node.close();
      else node.removeAttribute("open");
      reportOpen(false);
    };
  }, [effective]);
  useLayoutEffect(() => {
    const current = request.current;
    if (
      current &&
      (current.key !== effective || current.source !== source.identity)
    ) {
      current.abort.abort();
      request.current = null;
      setApplying(false);
      if (effective) setNotice(gridMessage("richSelect.changed"));
    }
  }, [effective, source.identity]);
  useLayoutEffect(() => {
    if (activePosition < 0 || !list.current) return;
    const element = list.current,
      top = activePosition * ROW_HEIGHT,
      bottom = top + ROW_HEIGHT,
      height = element.clientHeight || VISIBLE_ROWS * ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + height)
      element.scrollTop = bottom - height;
    setScrollTop(element.scrollTop);
  }, [effective, activePosition]);
  function changeQuery(next: string) {
    if (
      source.loading ||
      applying ||
      next.length > RICH_SELECT_LIMITS.maxQueryLength
    )
      return;
    setQuery(next);
    setNotice("");
    setScrollTop(0);
    if (list.current) list.current.scrollTop = 0;
    const matches = source.index?.search(next, searchMode) ?? [];
    const first = matches.find((index) => !choices?.[index].disabled);
    setActiveValue(first === undefined ? null : choices![first].value);
  }
  function navigate(direction: number, edge?: "first" | "last") {
    if (!choices || source.loading || applying) return;
    const enabled = results.filter((index) => !choices[index].disabled);
    if (!enabled.length) return;
    const current =
      selectedIndex === undefined ? -1 : enabled.indexOf(selectedIndex);
    const position =
      edge === "first"
        ? 0
        : edge === "last"
          ? enabled.length - 1
          : current < 0
            ? direction < 0
              ? enabled.length - 1
              : 0
            : Math.max(0, Math.min(enabled.length - 1, current + direction));
    setActiveValue(choices[enabled[position]].value);
    setNotice("");
  }
  async function apply(reason: RichSelectApplyContext["reason"]) {
    if (
      !effective ||
      request.current ||
      !available ||
      !selected ||
      source.loading ||
      source.failed
    )
      return;
    const current: ApplyRequest = {
      abort: new AbortController(),
      source: source.identity,
      key: effective,
    };
    request.current = current;
    setApplying(true);
    setNotice("");
    try {
      const accepted = await onApply(selected.value, {
        signal: current.abort.signal,
        reason,
      });
      if (
        disposed.current ||
        request.current !== current ||
        current.abort.signal.aborted ||
        live.current.key !== current.key ||
        live.current.source !== current.source
      )
        return;
      request.current = null;
      setApplying(false);
      if (accepted === false) {
        setNotice(gridMessage("richSelect.rejected"));
        return;
      }
      setChosenLabel({ value: selected.value, label: selected.label });
      close(false);
    } catch (reason: unknown) {
      if (
        disposed.current ||
        request.current !== current ||
        current.abort.signal.aborted
      )
        return;
      request.current = null;
      setApplying(false);
      setNotice(
        reason instanceof Error && reason.message
          ? reason.message
          : typeof reason === "string" && reason
            ? reason
            : gridMessage("richSelect.failed"),
      );
    }
  }
  function keys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    event.stopPropagation();
    if (event.nativeEvent.isComposing || applying) return;
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(event.key)) {
      event.preventDefault();
      navigate(
        event.key === "ArrowUp"
          ? -1
          : event.key === "PageUp"
            ? -VISIBLE_ROWS
            : event.key === "PageDown"
              ? VISIBLE_ROWS
              : 1,
      );
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      ["Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      navigate(0, event.key === "Home" ? "first" : "last");
    } else if (event.key === "Enter") {
      event.preventDefault();
      void apply("enter");
    }
  }
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN),
    end = Math.min(results.length, first + VISIBLE_ROWS + OVERSCAN * 2);
  const mounted = Array.from(
    { length: Math.max(0, end - first) },
    (_, offset) => first + offset,
  );
  if (activePosition >= 0 && !mounted.includes(activePosition))
    mounted.push(activePosition);
  mounted.sort((left, right) => left - right);
  const sourceMessage = source.failed
    ? source.error instanceof RichSelectOptionsError
      ? t("richSelect.invalidOptions")
      : t("editor.loadError", {
          error:
            source.error instanceof Error
              ? source.error.message
              : typeof source.error === "string"
                ? source.error
                : t("editor.loadFailed"),
        })
    : "";
  const problem = error || (notice ? resolveMessage(notice) : "");
  const caption =
    displayValue ?? (chosenLabel?.value === value ? chosenLabel.label : value);
  const visibleList = !source.loading && !source.failed && results.length > 0;
  return (
    <div
      className="og-rich-select-editor"
      data-editor-type="richSelect"
      lang={locale}
    >
      <button
        ref={launcher}
        type="button"
        className="og-rich-select-launcher"
        disabled={disabled}
        aria-label={t("richSelect.open", { label })}
        aria-haspopup="dialog"
        aria-expanded={Boolean(effective)}
        onClick={begin}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ")
            event.stopPropagation();
        }}
      >
        <span dir="auto">{caption || t("richSelect.blank")}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {effective && (
        <FilterPopup>
          <dialog
            ref={dialog}
            className="og-rich-select-dialog"
            lang={locale}
            aria-labelledby={titleId}
            aria-describedby={[description ? descriptionId : "", helpId]
              .filter(Boolean)
              .join(" ")}
            aria-busy={applying || source.loading || undefined}
            onCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }}
            onClose={(event) => {
              event.stopPropagation();
              if (!lifecycleClose.current) close(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              } else event.stopPropagation();
            }}
          >
            <h3 id={titleId} dir="auto">
              {t("richSelect.title", { label })}
            </h3>
            {description && (
              <p id={descriptionId} dir="auto">
                {description}
              </p>
            )}
            <p id={helpId} dir="auto">
              {t("richSelect.help")}
            </p>
            <label htmlFor={`${id}-search`} dir="auto">
              {t("richSelect.search", { label })}
            </label>
            <input
              id={`${id}-search`}
              ref={search}
              type="search"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-expanded={visibleList}
              aria-controls={listId}
              aria-activedescendant={
                activePosition >= 0
                  ? `${id}-option-${selectedIndex}`
                  : undefined
              }
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? errorId : helpId}
              readOnly={applying || source.loading}
              maxLength={RICH_SELECT_LIMITS.maxQueryLength}
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={keys}
            />
            <p role="status" dir="auto" className="og-rich-select-status">
              {applying
                ? t("richSelect.applying")
                : source.loading
                  ? t("editor.loading")
                  : t("richSelect.count", { count: results.length })}
            </p>
            {source.failed && (
              <div role="alert" className="og-rich-select-error">
                <p dir="auto">{sourceMessage}</p>
                <button
                  type="button"
                  disabled={applying}
                  onClick={source.retry}
                >
                  {t("editor.retry")}
                </button>
              </div>
            )}
            {!source.loading && !source.failed && !results.length && (
              <p role="status" dir="auto">
                {t("richSelect.noMatches")}
              </p>
            )}
            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-label={t("richSelect.choices", { label })}
              hidden={!visibleList}
              className="og-rich-select-list"
              onKeyDown={keys}
              style={{
                height: Math.min(VISIBLE_ROWS, results.length) * ROW_HEIGHT,
              }}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            >
              <div
                role="presentation"
                style={{
                  height: results.length * ROW_HEIGHT,
                  position: "relative",
                }}
              >
                {mounted.map((position) => {
                  const index = results[position],
                    option = choices?.[index];
                  if (!option) return null;
                  return (
                    <div
                      key={option.value}
                      id={`${id}-option-${index}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={position === activePosition}
                      aria-disabled={option.disabled || undefined}
                      aria-posinset={position + 1}
                      aria-setsize={results.length}
                      data-rich-option-index={index}
                      className={`og-rich-select-option ${position === activePosition ? "og-rich-select-active" : ""}`}
                      style={{
                        position: "absolute",
                        top: position * ROW_HEIGHT,
                        height: ROW_HEIGHT,
                        width: "100%",
                      }}
                      title={
                        option.label || option.value || t("richSelect.blank")
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!option.disabled && !applying) {
                          setActiveValue(option.value);
                          setNotice("");
                          search.current?.focus({ preventScroll: true });
                        }
                      }}
                    >
                      <span dir="auto">
                        {option.label || option.value || t("richSelect.blank")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {source.index &&
              !source.loading &&
              !source.failed &&
              !available &&
              results.length > 0 && (
                <p dir="auto" className="og-rich-select-notice">
                  {t("richSelect.unavailable")}
                </p>
              )}
            {problem && (
              <p
                id={errorId}
                role="alert"
                dir="auto"
                className="og-rich-select-error"
              >
                {problem}
              </p>
            )}
            <div className="og-rich-select-actions">
              <button type="button" onClick={() => close(true)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={
                  !available || applying || source.loading || source.failed
                }
                onClick={() => void apply("apply")}
              >
                {t("richSelect.apply")}
              </button>
            </div>
          </dialog>
        </FilterPopup>
      )}
    </div>
  );
}
