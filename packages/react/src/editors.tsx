import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ComponentType,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from "react";
import type { Column } from "@opengrid/core";

export type EditorType =
  "text" | "number" | "date" | "boolean" | "select" | "largeText";
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
  /** A supplied handler owns all keyboard policy, including Enter, Escape and Tab. */
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  autoFocus?: boolean;
}
export type CellEditorRenderer<T> = (context: CellEditorProps<T>) => ReactNode;
export type CellEditorComponent<T> = ComponentType<CellEditorProps<T>>;

interface OptionState {
  loading: boolean;
  options: readonly EditorOption[];
  error?: string;
}
const validOptions = (value: unknown): value is readonly EditorOption[] =>
  Array.isArray(value) &&
  value.every(
    (option) =>
      option &&
      typeof option.value === "string" &&
      typeof option.label === "string",
  );

/** Native editors with a shared text-value contract and cancellable asynchronous choices. */
export function CellEditor<T>({
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
          throw new TypeError("Options provider returned invalid choices");
        setRemote({ loading: false, options: loaded });
      })
      .catch((reason) => {
        if (!active || version !== request.current || controller.signal.aborted)
          return;
        setRemote({
          loading: false,
          options: [],
          error:
            reason instanceof Error ? reason.message : "Unable to load choices",
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
          <option value={value}>{value || "Choose a value"}</option>
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
          Loading choices...
        </span>
      )}
      {type === "select" && remote.error && (
        <div id={loadErrorId} role="alert" className="og-editor-load-error">
          <span>Could not load choices: {remote.error}</span>{" "}
          <button
            type="button"
            onClick={() => setRetry((attempt) => attempt + 1)}
          >
            Retry choices
          </button>
        </div>
      )}
    </div>
  );
}
