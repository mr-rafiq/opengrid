import { useId, useRef } from "react";
import { CellEditor, type CellEditorProps } from "./editors.js";
import { useGridLocale } from "./locale.js";

export type FormulaEditMode = "literal" | "formula";
export interface FormulaCellEditorProps<T> extends CellEditorProps<T> {
  /** Controlled by the host editing session. Changing mode never changes text here. */
  mode: FormulaEditMode;
  onModeChange(mode: FormulaEditMode): void;
}

/** Explicit formula/literal editing chrome. Model reads, commits and raw seeding belong to the host. */
export function FormulaCellEditor<T>({
  mode,
  onModeChange,
  onBlur,
  ...editor
}: FormulaCellEditorProps<T>) {
  const { t, locale } = useGridLocale();
  const helpId = useId();
  const selector = useRef<HTMLSelectElement>(null),
    inputArea = useRef<HTMLDivElement>(null);
  function focusInput() {
    inputArea.current
      ?.querySelector<HTMLElement>(
        "input,textarea,select,[contenteditable=true]",
      )
      ?.focus({ preventScroll: true });
  }
  return (
    <div
      className="og-formula-cell-editor"
      lang={locale}
      aria-describedby={helpId}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        minWidth: 0,
        height: "100%",
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        onBlur?.();
      }}
      onKeyDownCapture={(event) => {
        if (
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.key.toLowerCase() === "m"
        ) {
          event.preventDefault();
          event.stopPropagation();
          selector.current?.focus({ preventScroll: true });
        } else if (
          event.target === selector.current &&
          event.key === "Escape"
        ) {
          event.preventDefault();
          event.stopPropagation();
          editor.onCancel();
        } else if (event.target === selector.current && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          focusInput();
        }
      }}
    >
      <select
        ref={selector}
        aria-label={t("formula.mode")}
        aria-describedby={helpId}
        aria-keyshortcuts="Alt+M"
        value={mode}
        onChange={(event) =>
          onModeChange(event.target.value === "formula" ? "formula" : "literal")
        }
        style={{ flex: "0 0 auto", maxWidth: "45%", padding: "3px 4px" }}
      >
        <option value="literal">{t("formula.literal")}</option>
        <option value="formula">{t("formula.formula")}</option>
      </select>
      <div
        ref={inputArea}
        style={{ flex: "1 1 0", minWidth: 0, height: "100%" }}
      >
        <CellEditor
          {...editor}
          editorType="text"
          options={undefined}
          asyncOptions={undefined}
          onBlur={() => {}}
        />
      </div>
      <span id={helpId} className="og-sr-only">
        {t("formula.modeHelp")}
      </span>
    </div>
  );
}
