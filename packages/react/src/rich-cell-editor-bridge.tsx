import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CellEditorProps } from "./editors.js";
import {
  RichSelectEditor,
  type RichSelectApplyContext,
} from "./rich-select-editor.js";

interface Pending {
  value: string;
  owner: unknown;
  columnId: string;
  signal: AbortSignal;
  resolve(value: boolean): void;
  reject(reason: unknown): void;
}
/** Direct grid/session callbacks own applying; controlled fallbacks commit only
 * after a coherent render mirrors their requested draft. */
export function RichCellEditorBridge<T>(props: CellEditorProps<T>) {
  const owner = props.contextKey === undefined ? props.row : props.contextKey;
  const contextKey = useMemo(
    () => ({
      owner,
      column: props.column.id,
      field: props.column.field,
      scope: props.editingContext ?? "cell",
    }),
    [owner, props.column.id, props.column.field, props.editingContext],
  );
  const pending = useRef<Pending | null>(null);
  const [generation, renderAgain] = useState(0);
  useLayoutEffect(
    () => () => {
      pending.current?.resolve(false);
      pending.current = null;
    },
    [],
  );
  useLayoutEffect(() => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    if (
      current.signal.aborted ||
      current.owner !== contextKey ||
      current.columnId !== props.column.id ||
      current.value !== props.value
    ) {
      current.resolve(false);
      return;
    }
    try {
      current.resolve(props.onCommit() !== false);
    } catch (error: unknown) {
      current.reject(error);
    }
  }, [generation, props.value, contextKey, props.column.id, props.onCommit]);
  function apply(value: string, context: RichSelectApplyContext) {
    if (context.signal.aborted) return false;
    if (props.onApplyValue) return props.onApplyValue(value, context);
    if (props.editingContext === "row") {
      props.onChange(value);
      return true;
    }
    return new Promise<boolean>((resolve, reject) => {
      pending.current?.resolve(false);
      pending.current = {
        value,
        signal: context.signal,
        owner: contextKey,
        columnId: props.column.id,
        resolve,
        reject,
      };
      try {
        props.onChange(value);
        renderAgain((version) => version + 1);
      } catch (error: unknown) {
        pending.current = null;
        reject(error);
      }
    });
  }
  return (
    <RichSelectEditor
      value={props.value}
      displayValue={props.displayValue}
      label={props.column.header ?? props.column.id}
      description={props.label}
      options={props.options}
      asyncOptions={props.asyncOptions}
      searchMode={props.searchMode}
      contextKey={contextKey}
      error={props.error}
      autoOpen={props.editingContext !== "row" && props.autoFocus !== false}
      onApply={apply}
      onCancel={() => {
        if (props.editingContext !== "row") props.onCancel();
      }}
    />
  );
}
