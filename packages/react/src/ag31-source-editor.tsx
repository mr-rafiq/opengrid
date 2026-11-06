import {
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import type { createAg31ClientController } from "./ag31-client-controller.js";
import type { Ag31EditingCell } from "./ag31-editing.js";

type Owner<T> = ReturnType<typeof createAg31ClientController<T>>;
function TextEditor(props: any) {
  const [value, setValue] = useState(() =>
    props.eventKey?.length === 1
      ? props.eventKey
      : props.eventKey === "Backspace" || props.eventKey === "Delete"
        ? ""
        : String(props.value ?? ""),
  );
  useLayoutEffect(() => {
    if (props.eventKey)
      props.onValueChange(
        props.number ? (value === "" ? null : Number(value)) : value,
      );
  }, []);
  return (
    <input
      autoFocus
      aria-label="Cell editor"
      className="og-editor"
      type={props.number ? "number" : "text"}
      value={value}
      onFocus={(event) => {
        if (!props.eventKey) event.currentTarget.select();
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setValue(raw);
        const value = props.number ? (raw === "" ? null : Number(raw)) : raw;
        props.onValueChange(value);
      }}
    />
  );
}
/** Reactive source editors get their original typed values and owned API objects. */
export function Ag31SourceEditor<T>({
  owner,
  cell,
  components,
}: {
  owner: Owner<T>;
  cell: Ag31EditingCell<T>;
  components?: Readonly<Record<string, ComponentType<any>>>;
}) {
  const { column, node, token } = cell;
  const colDef = column.getColDef();
  const params = {
    ...owner.cellValues!.params(node, column),
    initialValue: cell.oldValue,
    value: cell.value,
    eventKey: cell.eventKey,
    cellStartedEdit: true,
    onValueChange: (value: unknown) => owner.editing.setValue(token, value),
    // Editor stopEditing(true) suppresses navigation. API stopEditing(true) cancels.
    stopEditing: (_suppressNavigateAfterEdit?: boolean) => {
      if (owner.editing.getSnapshot()?.token === token)
        owner.api.stopEditing(false);
    },
    parseValue: (value: unknown) =>
      owner.cellValues!.parse(node, column, value),
    formatValue: (value: unknown) =>
      typeof colDef.valueFormatter === "function"
        ? colDef.valueFormatter({
            ...owner.cellValues!.params(node, column),
            value,
          })
        : undefined,
  };
  const selected = useMemo(
    () =>
      typeof colDef.cellEditorSelector === "function"
        ? colDef.cellEditorSelector(params)
        : undefined,
    [token],
  );
  const editor = selected?.component ?? colDef.cellEditor;
  const builtin =
    editor == null ||
    editor === "agTextCellEditor" ||
    editor === "agNumberCellEditor";
  useLayoutEffect(
    () =>
      builtin
        ? owner.editing.prepareValue(token, (value) =>
            owner.cellValues!.parse(node, column, value),
          )
        : undefined,
    [owner, token, builtin, node, column],
  );
  const extra = useMemo(
    () => ({
      ...(typeof colDef.cellEditorParams === "function"
        ? colDef.cellEditorParams(params)
        : (colDef.cellEditorParams as object)),
      ...selected?.params,
    }),
    [token],
  );
  if (selected?.popup || colDef.cellEditorPopup)
    throw new TypeError(
      "Source popup editors require an explicit popup lifecycle adapter",
    );
  let Editor: ComponentType<any>;
  if (builtin) Editor = TextEditor;
  else {
    const resolved = typeof editor === "string" ? components?.[editor] : editor;
    if (
      typeof resolved !== "function" &&
      !(typeof resolved === "object" && resolved?.$$typeof)
    )
      throw new TypeError(
        "The source editor requires a registered reactive React component",
      );
    Editor = resolved as ComponentType<any>;
  }
  return (
    <span data-og-source-editor style={{ display: "contents" }}>
      <Editor
        {...params}
        {...(extra as object)}
        number={editor === "agNumberCellEditor"}
      />
    </span>
  );
}

export function sourceEditorKey<T>(
  owner: Owner<T>,
  event: KeyboardEvent<HTMLDivElement>,
  position: { rowId: string; columnId: string },
  backspace: boolean,
) {
  const node = owner.nodes.getRowNodeByNativeId(position.rowId),
    column = owner.columns.getColumn(position.columnId);
  if (!node || !column) return true;
  const editing =
    event.target instanceof Element &&
    !!event.target.closest("[data-og-source-editor]");
  const params = {
    ...owner.cellValues!.params(node, column),
    event: event.nativeEvent,
    editing,
  };
  owner.api.dispatchEvent({
    ...params,
    type: "cellKeyDown",
    value: owner.schema.read(node, column),
    rowIndex: node.rowIndex,
    rowPinned: null,
  });
  const suppress = column.getColDef().suppressKeyboardEvent;
  if (typeof suppress === "function" && suppress(params)) return true;
  if (editing) {
    if (event.key === "Escape") {
      event.preventDefault();
      owner.api.stopEditing(true);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      owner.api.stopEditing();
      return true;
    }
    return true;
  }
  if (
    backspace &&
    event.key === "Backspace" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    owner.editing.controller.isCellEditable(position)
  ) {
    event.preventDefault();
    owner.editing.controller.startEditingCell(position, {
      initialText: "Backspace",
    });
    return true;
  }
  return false;
}
