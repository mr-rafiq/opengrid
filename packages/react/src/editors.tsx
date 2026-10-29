import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ComponentType,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from "react";
import type { Column } from "@opengrid/core";
import { gridMessage, useGridLocale } from "./locale.js";
import type { GridMessage } from "./locale.js";
import { RichCellEditorBridge } from "./rich-cell-editor-bridge.js";
import type { RichSelectApplyContext } from "./rich-select-editor.js";
import type { RichSelectSearchMode } from "./rich-select-options.js";

export type EditorType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "largeText"
  | "richSelect";
export interface EditorOption {
  value: string;
  label: string;
  disabled?: boolean;
  name?: string;
}
export interface CellEditorProps<T> {
  row: T;
  column: Column<T>;
  /** Editors preserve text; the grid model parses and validates committed values. */
  value: string;
  /** Optional formatted caption for controls with a closed picker launcher. */
  displayValue?: string;
  onChange: (value: string) => void;
  onCommit: () => boolean | void;
  onCancel: () => void;
  label: string;
  editorType?: EditorType;
  options?: readonly EditorOption[];
  /** Providers may ignore the signal; stale and unmounted results are still discarded. */
  asyncOptions?: (signal?: AbortSignal) => Promise<readonly EditorOption[]>;
  error?: string;
  errorId?: string;
  /** Set false when the host renders the validation alert identified by errorId. */
  inlineValidation?: boolean;
  onBlur?: () => void;
  /** Native controls delegate keyboard policy here; rich pickers use explicit Apply/Cancel. */
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  autoFocus?: boolean;
  /** Picker integration distinguishes immediate cell saves from staged row fields. */
  editingContext?: "cell" | "row";
  contextKey?: unknown;
  searchMode?: RichSelectSearchMode;
  onApplyValue?: (
    value: string,
    context: RichSelectApplyContext,
  ) => boolean | void | Promise<boolean | void>;
}
export type CellEditorRenderer<T> = (context: CellEditorProps<T>) => ReactNode;
export type CellEditorComponent<T> = ComponentType<CellEditorProps<T>>;

interface OptionState {
  loading: boolean;
  options: readonly EditorOption[];
  error?: GridMessage | string;
}
class EditorMessageError extends Error {
  constructor(readonly notice: GridMessage) {
    super();
  }
}
const validOptions = (value: unknown): value is readonly EditorOption[] =>
  Array.isArray(value) &&
  value.every(
    (option) =>
      option &&
      typeof option.value === "string" &&
      typeof option.label === "string",
  );

/** Native inputs and staged rich choices share the host's string-draft contract. */
export function CellEditor<T>(props: CellEditorProps<T>) {
  return props.editorType === "richSelect" ? (
    <RichCellEditorBridge {...props} />
  ) : (
    <NativeCellEditor {...props} />
  );
}

function NativeCellEditor<T>({
  row: _row,
  column,
  value,
  onChange,
  onCommit,
  onCancel,
  label,
  editorType,
  options = [],
  asyncOptions,
  error,
  errorId,
  inlineValidation = true,
  onBlur,
  onKeyDown,
  autoFocus = true,
}: CellEditorProps<T>) {
  const { t, resolveMessage, locale } = useGridLocale();
  const type =
    editorType ??
    (column.type === "number"
      ? "number"
      : column.type === "date"
        ? "date"
        : column.type === "boolean"
          ? "boolean"
          : "text");
  const generatedId = useId();
  const validationId = errorId ?? `${generatedId}-validation`;
  const loadingId = `${generatedId}-loading`;
  const loadErrorId = `${generatedId}-load-error`;
  const control = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(null);
  const shell = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const skipAutomaticBlurCommit = useRef(false);
  const [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState<OptionState>({
    loading: false,
    options: [],
  });

  useLayoutEffect(() => {
    if (!autoFocus) return;
    const element = control.current;
    element?.focus();
    if (
      element instanceof HTMLInputElement &&
      ["text", "number"].includes(element.type)
    )
      element.select();
    if (element instanceof HTMLTextAreaElement) element.select();
  }, [autoFocus, type]);

  useEffect(() => {
    if (type !== "select" || !asyncOptions) {
      setRemote({ loading: false, options: [] });
      return;
    }
    const version = ++request.current;
    const controller = new AbortController();
    let active = true;
    setRemote({ loading: true, options: [] });
    Promise.resolve()
      .then(() => asyncOptions(controller.signal))
      .then((loaded) => {
        if (!active || version !== request.current || controller.signal.aborted)
          return;
        if (!validOptions(loaded))
          throw new EditorMessageError(gridMessage("editor.invalidChoices"));
        setRemote({ loading: false, options: loaded });
      })
      .catch((reason) => {
        if (!active || version !== request.current || controller.signal.aborted)
          return;
        setRemote({
          loading: false,
          options: [],
          error:
            reason instanceof EditorMessageError
              ? reason.notice
              : reason instanceof Error
                ? reason.message
                : typeof reason === "string"
                  ? reason
                  : gridMessage("editor.loadFailed"),
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [type, asyncOptions, retry]);

  const choices =
    asyncOptions && type === "select" && !remote.loading && !remote.error
      ? remote.options
      : options;
  const missingValue = !choices.some((option) => option.value === value);
  const describedBy =
    [
      error ? validationId : "",
      type === "select" && remote.loading ? loadingId : "",
      type === "select" && remote.error ? loadErrorId : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const common = {
    "aria-label": label,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
    className: "og-editor",
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (onKeyDown) {
        onKeyDown(event);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        skipAutomaticBlurCommit.current = true;
        onCancel();
      } else if (
        event.key === "Enter" &&
        (type !== "largeText" || event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        skipAutomaticBlurCommit.current = onCommit() !== false;
      } else if (event.key === "Tab") {
        const accepted = onCommit() !== false;
        skipAutomaticBlurCommit.current = accepted;
        if (!accepted) event.preventDefault();
      }
    },
  };
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    )
      return;
    if (onBlur) onBlur();
    else if (!skipAutomaticBlurCommit.current) onCommit();
    skipAutomaticBlurCommit.current = false;
  }
  function change(next: string) {
    skipAutomaticBlurCommit.current = false;
    onChange(next);
  }
  let editor: ReactNode;
  if (type === "select")
    editor = (
      <select
        {...common}
        ref={control as React.RefObject<HTMLSelectElement>}
        value={value}
        aria-busy={remote.loading || undefined}
        onChange={(event) => change(event.target.value)}
      >
        {missingValue && (
          <option value={value}>{value || t("editor.choose")}</option>
        )}
        {choices.map((option, index) => (
          <option
            key={`${option.value}:${index}`}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  else if (type === "largeText")
    editor = (
      <textarea
        {...common}
        ref={control as React.RefObject<HTMLTextAreaElement>}
        rows={4}
        style={{ height: "100%", minHeight: 28, resize: "none" }}
        value={value}
        onChange={(event) => change(event.target.value)}
      />
    );
  else if (type === "boolean")
    editor = (
      <input
        {...common}
        ref={control as React.RefObject<HTMLInputElement>}
        type="checkbox"
        checked={value === "true" || value === "1"}
        onChange={(event) => change(event.target.checked ? "true" : "false")}
      />
    );
  else
    editor = (
      <input
        {...common}
        ref={control as React.RefObject<HTMLInputElement>}
        type={
          type === "number" && column.type !== "bigint"
            ? "number"
            : type === "date"
              ? "date"
              : "text"
        }
        step={type === "number" ? "any" : undefined}
        inputMode={column.type === "bigint" ? "numeric" : undefined}
        value={value}
        onChange={(event) => change(event.target.value)}
      />
    );

  return (
    <div
      ref={shell}
      className="og-editor-shell"
      lang={locale}
      data-editor-type={type}
      style={{ width: "100%", height: "100%" }}
      onBlur={handleBlur}
    >
      {editor}
      {error && inlineValidation && (
        <span id={validationId} role="alert" className="og-editor-validation">
          {error}
        </span>
      )}
      {type === "select" && remote.loading && (
        <span id={loadingId} role="status" className="og-editor-loading">
          {t("editor.loading")}
        </span>
      )}
      {type === "select" && remote.error && (
        <div id={loadErrorId} role="alert" className="og-editor-load-error">
          <span>
            {t("editor.loadError", { error: resolveMessage(remote.error) })}
          </span>{" "}
          <button
            type="button"
            onClick={() => setRetry((attempt) => attempt + 1)}
          >
            {t("editor.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
