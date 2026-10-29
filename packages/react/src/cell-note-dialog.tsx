import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CellNotesStore, CellPosition } from "@opengrid/core";
import { gridMessage, useGridLocale } from "./locale.js";
import type { GridMessage } from "./locale.js";

export interface CellNoteDialogProps {
  store: CellNotesStore;
  position: CellPosition;
  columnLabel?: string;
  onClose: () => void;
}
interface InitialNote {
  draft: string;
  existing: boolean;
  error: GridMessage | string;
}
function readNote(store: CellNotesStore, position: CellPosition): InitialNote {
  try {
    const note = store.get(position);
    return { draft: note ?? "", existing: note !== undefined, error: "" };
  } catch (reason) {
    return {
      draft: "",
      existing: false,
      error:
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : gridMessage("note.readFailed"),
    };
  }
}

/** A plain-text note editor. Its host restores grid focus after the dialog unmounts. */
export function CellNoteDialog({
  store,
  position,
  columnLabel,
  onClose,
}: CellNoteDialogProps) {
  const { t, resolveMessage, locale } = useGridLocale();
  const [{ draft, existing, error: notice }, setNote] = useState<InitialNote>(
    () => readNote(store, position),
  );
  const error = resolveMessage(notice);
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const closeRequested = useRef(false);
  const titleId = useId();
  const contextId = useId();
  const helpId = useId();
  const errorId = useId();
  useEffect(() => {
    closeRequested.current = false;
    setNote(readNote(store, position));
    textarea.current?.focus({ preventScroll: true });
  }, [store, position.rowId, position.columnId]);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") {
      try {
        element.showModal();
      } catch {
        element.setAttribute("open", "");
      }
    } else element.setAttribute("open", "");
    textarea.current?.focus({ preventScroll: true });
    return () => {
      if (!element.open) return;
      if (typeof element.close === "function") {
        try {
          element.close();
        } catch {
          element.removeAttribute("open");
        }
      } else element.removeAttribute("open");
    };
  }, []);
  function requestClose() {
    if (closeRequested.current) return;
    closeRequested.current = true;
    onClose();
  }
  function save(remove = false) {
    try {
      if (remove || draft.length === 0) store.delete(position);
      else store.set(position, draft);
    } catch (reason) {
      setNote((current) => ({
        ...current,
        error:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : gridMessage("note.saveFailed"),
      }));
      textarea.current?.focus({ preventScroll: true });
      return;
    }
    requestClose();
  }
  return (
    <dialog
      ref={dialog}
      className="og-note-dialog"
      lang={locale}
      aria-labelledby={titleId}
      aria-describedby={`${contextId}${error ? ` ${errorId}` : ""}`}
      aria-modal="true"
      style={{
        width: "min(560px, calc(100vw - 32px))",
        padding: 24,
        border: "1px solid var(--og-border, #dce4e9)",
        borderRadius: 12,
        color: "var(--og-text, #182733)",
        background: "var(--og-bg, white)",
      }}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }
      }}
    >
      <h3 id={titleId} style={{ marginTop: 0 }}>
        {t("note.title")}
      </h3>
      <p id={contextId}>
        {t("note.context", {
          column: columnLabel ?? position.columnId,
          rowId: position.rowId,
        })}
      </p>
      <label style={{ display: "block", fontWeight: 600 }}>
        {t("note.text")}
        <textarea
          ref={textarea}
          aria-label={t("note.text")}
          aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={error ? true : undefined}
          rows={8}
          value={draft}
          style={{
            display: "block",
            width: "100%",
            resize: "vertical",
            marginTop: 8,
            padding: 10,
            font: "inherit",
            color: "inherit",
            background: "inherit",
            border: "1px solid var(--og-border, #aebdc5)",
            borderRadius: 6,
          }}
          onChange={(event) =>
            setNote((current) => ({
              ...current,
              draft: event.target.value,
              error: "",
            }))
          }
        />
      </label>
      <p id={helpId} style={{ fontSize: 12 }}>
        {t("note.help", {
          current: draft.length,
          maximum: store.maxTextLength,
        })}
      </p>
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "flex-end",
        }}
      >
        {existing && (
          <button type="button" onClick={() => save(true)}>
            {t("note.delete")}
          </button>
        )}
        <button type="button" onClick={requestClose}>
          {t("common.cancel")}
        </button>
        <button type="button" onClick={() => save()}>
          {t("note.save")}
        </button>
      </div>
    </dialog>
  );
}
