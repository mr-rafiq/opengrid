import {
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent } from "react";
import { createRowEditSession } from "@opengrid/core";
import type {
  GridModel,
  RowEditSession,
  RowEditSnapshot,
} from "@opengrid/core";
import type { EditorConfig } from "./data-grid.js";
import { CellEditor } from "./editors.js";
import type { CellEditorProps, CellEditorRenderer } from "./editors.js";
import { gridMessage, useGridLocale } from "./locale.js";
import type { GridMessage } from "./locale.js";

export interface RowEditDialogProps<T> {
  model: GridModel<T>;
  rowId: string;
  editorOptions?: Record<string, EditorConfig>;
  renderEditor?: CellEditorRenderer<T>;
  initialColumnId?: string;
  conflictPolicy?: "reject" | "overwrite";
  onClose: () => void;
  onCommit?: (rowId: string) => void;
}
interface SessionInfo<T> {
  session: RowEditSession | null;
  row: T | null;
  error: GridMessage | string;
}
const emptySnapshot: RowEditSnapshot = Object.freeze({
  rowId: "",
  status: "cancelled",
  values: Object.freeze({}),
  dirtyColumns: Object.freeze([]),
});
const emptySubscribe = () => () => {};
const readEmpty = () => emptySnapshot;
const noop = () => {};
function newSession<T>(
  model: GridModel<T>,
  rowId: string,
  conflictPolicy: "reject" | "overwrite",
): SessionInfo<T> {
  try {
    const session = createRowEditSession(model, rowId, { conflictPolicy });
    return { session, row: model.getRow(rowId) ?? null, error: "" };
  } catch (reason) {
    return {
      session: null,
      row: null,
      error:
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : gridMessage("rowEdit.startFailed"),
    };
  }
}
function draftText(value: unknown, date: boolean): string {
  if (value instanceof Date)
    return Number.isFinite(value.getTime())
      ? date
        ? value.toISOString().slice(0, 10)
        : value.toISOString()
      : String(value);
  return value == null ? "" : String(value);
}

/** Atomic whole-row editing in a modal. This intentionally has an explicit Save workflow. */
export function RowEditDialog<T>({
  model,
  rowId,
  editorOptions = {},
  renderEditor,
  initialColumnId,
  conflictPolicy = "reject",
  onClose,
  onCommit,
}: RowEditDialogProps<T>) {
  const { t, resolveMessage, locale } = useGridLocale();
  const [generation, reload] = useReducer((version: number) => version + 1, 0);
  const [info, setInfo] = useState<SessionInfo<T>>({
    session: null,
    row: null,
    error: "",
  });
  const snapshot = useSyncExternalStore(
    info.session?.subscribe ?? emptySubscribe,
    info.session?.getSnapshot ?? readEmpty,
    info.session?.getSnapshot ?? readEmpty,
  );
  const [, renderModelChanges] = useReducer(
    (version: number) => version + 1,
    0,
  );
  useEffect(() => model.subscribe(renderModelChanges), [model]);
  const columns = info.session
    ? model
        .getColumns()
        .filter(
          (column) =>
            !column.hidden &&
            Object.prototype.hasOwnProperty.call(snapshot.values, column.id),
        )
    : [];
  const [localError, setLocalError] = useState<GridMessage | string>("");
  const [confirmReload, setConfirmReload] = useState(false);
  const errorNotice =
    localError ||
    snapshot.error ||
    info.error ||
    (info.session && columns.length === 0
      ? gridMessage("rowEdit.noFields")
      : "");
  const error = resolveMessage(errorNotice);
  const dialog = useRef<HTMLDialogElement>(null);
  const controls = useRef(new Map<string, HTMLDivElement>());
  const closeRequested = useRef(false);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const reloadId = useId();

  useLayoutEffect(() => {
    const next = newSession(model, rowId, conflictPolicy);
    setInfo(next);
    closeRequested.current = false;
    setLocalError("");
    setConfirmReload(false);
    return () => next.session?.cancel();
  }, [model, rowId, conflictPolicy, generation]);
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
  useLayoutEffect(() => {
    const ids = [initialColumnId, ...columns.map((column) => column.id)].filter(
      (id): id is string => !!id,
    );
    for (const id of ids) {
      const field = controls.current
        .get(id)
        ?.querySelector<HTMLElement>(
          'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"]),button:not([disabled])',
        );
      if (field) {
        field.focus({ preventScroll: true });
        return;
      }
    }
    cancelButton.current?.focus({ preventScroll: true });
  }, [info, initialColumnId]);
  useEffect(() => {
    if (localError || snapshot.error)
      errorElement.current?.focus({ preventScroll: true });
  }, [localError, snapshot.error]);

  function close() {
    if (closeRequested.current) return;
    closeRequested.current = true;
    info.session?.cancel();
    onClose();
  }
  function save(): boolean {
    if (
      !info.session ||
      columns.length === 0 ||
      snapshot.status !== "editing" ||
      confirmReload
    )
      return false;
    try {
      const message = info.session.commit();
      if (message) {
        setLocalError(message);
        return false;
      }
    } catch (reason) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : gridMessage("rowEdit.saveFailed"),
      );
      return false;
    }
    setLocalError("");
    onCommit?.(rowId);
    close();
    return true;
  }
  function keyDown(event: KeyboardEvent<HTMLElement>, largeText: boolean) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (
      event.key === "Enter" &&
      (!largeText || event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
    // Tab and blur intentionally retain drafts; native dialog navigation handles focus.
  }
  return (
    <dialog
      ref={dialog}
      className="og-row-edit-dialog"
      lang={locale}
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
      aria-modal="true"
      style={{
        width: "min(680px, calc(100vw - 32px))",
        maxHeight: "calc(100vh - 48px)",
        overflow: "auto",
        padding: 24,
        border: "1px solid var(--og-border, #dce4e9)",
        borderRadius: 12,
        color: "var(--og-text, #182733)",
        background: "var(--og-bg, white)",
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <h3 id={titleId} style={{ marginTop: 0 }}>
        {t("rowEdit.title", { rowId })}
      </h3>
      <p id={descriptionId}>{t("rowEdit.help")}</p>
      <div style={{ display: "grid", gap: 18 }}>
        {columns.map((column) => {
          const config = editorOptions[column.id];
          const largeText = config?.type === "largeText";
          const context: CellEditorProps<T> = {
            row: info.row!,
            column,
            value: draftText(
              snapshot.values[column.id],
              config?.type === "date" || column.type === "date",
            ),
            label: t("rowEdit.fieldLabel", {
              column: column.header ?? column.id,
            }),
            editorType: config?.type,
            displayValue:
              config?.type === "richSelect" && column.valueFormatter
                ? column.valueFormatter(snapshot.values[column.id], info.row!)
                : undefined,
            options: config?.options,
            asyncOptions: config?.asyncOptions,
            autoFocus: false,
            onBlur: noop,
            error: error || undefined,
            errorId,
            inlineValidation: false,
            editingContext: "row",
            contextKey: info.session,
            searchMode: config?.searchMode,
            onChange: (value) => {
              const message = info.session?.setValue(column.id, value);
              setLocalError(message ?? "");
            },
            onCommit: save,
            onApplyValue: (value, context) => {
              if (context.signal.aborted || !info.session) return false;
              const message = info.session.setValue(column.id, value);
              setLocalError(message ?? "");
              return !message;
            },
            onCancel: close,
            onKeyDown: (event) =>
              keyDown(
                event,
                largeText ||
                  event.currentTarget.tagName === "TEXTAREA" ||
                  event.target instanceof HTMLTextAreaElement,
              ),
          };
          return (
            <div
              key={column.id}
              ref={(element) => {
                if (element) controls.current.set(column.id, element);
                else controls.current.delete(column.id);
              }}
              className="og-row-edit-field"
            >
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                {column.header ?? column.id}
              </p>
              <div
                style={
                  largeText
                    ? { minHeight: 130, height: 150 }
                    : { minHeight: 34 }
                }
              >
                {renderEditor ? (
                  renderEditor(context)
                ) : (
                  <CellEditor {...context} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p id={errorId} ref={errorElement} role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      {confirmReload && (
        <div
          role="group"
          aria-labelledby={reloadId}
          style={{
            border: "1px solid var(--og-border, #dce4e9)",
            borderRadius: 6,
            padding: 12,
            marginTop: 16,
          }}
        >
          <p id={reloadId}>{t("rowEdit.confirmReload")}</p>
          <button
            type="button"
            onClick={() => {
              setLocalError("");
              setConfirmReload(false);
              reload();
            }}
          >
            {t("rowEdit.discardReload")}
          </button>{" "}
          <button type="button" onClick={() => setConfirmReload(false)}>
            {t("rowEdit.keepEditing")}
          </button>
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 24,
        }}
      >
        <button
          type="button"
          onClick={() => setConfirmReload(true)}
          disabled={confirmReload}
        >
          {t("rowEdit.reload")}
        </button>
        <button type="button" ref={cancelButton} onClick={close}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={
            !info.session ||
            columns.length === 0 ||
            snapshot.status !== "editing" ||
            confirmReload
          }
        >
          {t("rowEdit.save")}
        </button>
      </div>
    </dialog>
  );
}
