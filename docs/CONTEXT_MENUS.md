# Contextual cell commands

Client `DataGrid` provides a flat context menu on real data cells. Right-click a cell, press the ContextMenu key, or use Shift+F10. Ctrl+right-click retains the browser menu. Interactive renderer controls and touch context events retain their native behavior. Set `contextMenu={false}` to disable the grid menu.

## Real commands

The default menu invokes existing library workflows:

| Command             | Behavior                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Copy cell           | Copies the formatted owner value as quoted, formula-neutralized TSV. BigInt digits remain exact.                                        |
| Copy selected cells | Copies the current rectangle in displayed row/column order. Invoking inside a rectangle preserves it; invoking outside starts one cell. |
| Paste cells         | Reads the browser clipboard and uses the atomic parser/validation/history pipeline at the invocation cell.                              |
| Edit cell           | Opens the actual editor, or the existing row form in row-edit mode.                                                                     |
| Note                | Opens the existing plain-text note dialog at the owner cell.                                                                            |
| Select row          | Reflects current selection, including mixed resident subtrees, and invokes the configured selection policy.                             |
| Undo / Redo         | Uses shared data history and announces an empty history without inventing an edit.                                                      |
| Export CSV          | Downloads the existing all-filtered-row CSV export, with its normal formula protection.                                                 |

Read-only cells disable editing/paste; disabled row selection and notes disable their commands. Configured merged spans still disable range clipboard/fill. **Copy cell** can copy an actual merged owner's value; this does not add merged range or document-export semantics. Generated aggregate/group cells and custom full-width rows do not yet have this menu.

Clipboard access depends on the browser's secure-context and permission rules. A failed read/write or invalid paste leaves the menu open with a literal error and a retryable action. Invalid paste changes no cells; a successful paste creates one undo transaction. Default cell and range copy neutralize formula-like strings rather than writing executable spreadsheet text.

## Customization

```tsx
import { DataGrid, type GridContextMenuOptions } from "@opengrid/react";

type Order = { id: string; reviewed: boolean };
const commands: GridContextMenuOptions<Order> = {
  getItems: (_context, defaults) => [
    ...defaults,
    { kind: "separator", id: "application" },
    {
      kind: "action",
      id: "review",
      label: "Mark reviewed",
      action: ({ model, position }) => {
        const error = model.editCell(position.rowId, "reviewed", true);
        if (error) throw new Error(error);
      },
    },
  ],
};

// The supplied model needs an editable reviewed column.
<DataGrid model={model} contextMenu={commands} />;
```

Define `getItems` outside render or memoize it when the menu must survive parent language/theme renders. A changed provider function closes old work; a new options wrapper with the same function preserves it. Provider changes do not invoke the new callback until another eligible opening.

`getItems(context, defaults)` runs synchronously on an eligible invocation, never merely because a grid renders or server-renders. Return a filtered/default/custom list; an empty list suppresses the grid popup. The context and position are frozen wrappers. The row, column and model remain borrowed application/model objects. Defaults and prepared item metadata are owned and frozen; action functions are neither called during preparation nor frozen.

An action has `kind: "action"`, unique `id`, `label`, optional `disabled`, `checked` (`true`, `false` or `"mixed"`), optional display-only `shortcut`, and `action(context, signal)`. A separator contains only `kind: "separator"` and `id`. Labels may be literal application strings or `gridMessage(...)` descriptors. Custom actions are normal callbacks, not React renderers; shortcuts displayed in this list do not install arbitrary application key bindings.

`prepareContextMenuItems` validates dense ordinary arrays and own data fields. `CONTEXT_MENU_LIMITS` bounds a list to **48 items**, IDs to **128 code units**, literal labels to **1,024** and shortcuts to **128**. IDs must be unique/nonblank; labels and shortcuts must be nonblank. Unknown fields, accessors, sparse arrays, unsupported kinds and malformed message descriptors are rejected. Message descriptors retain the shared catalog/parameter bounds; literal-label limits do not replace those catalog bounds.

## Ownership, cancellation and focus

Opening and executing check authoritative model state. A changed query/schema/data/selection, replaced model/controller, disabled menu, changed selection/hierarchy/editor/notes policy or newly active editor closes old work. Built-in commands resolve current callbacks and edit targets by stable row/column IDs, rather than retaining a projected column object. An async action receives an AbortSignal; unmount, Escape, dismissal and owner changes abort it. Application actions must check/cooperate with that signal before effects after an await. The menu cannot roll back side effects performed inside a custom callback or provider.

Pending actions cannot be invoked twice. Errors retain the menu and restore the failed item after its enabled state commits. Throw `new GridContextMenuError(gridMessage(...))` for a notice that retranslates with the active language. Raw Error text remains application-owned and renders literally.

Clipboard commands use a private range over the committed displayed view. After a clipboard read, paste rechecks source, range and row/column order before writing. Changing RTL while a read is pending cancels that paste; it cannot silently target a new inline order. A label/language change or a rebuilt equivalent range does not itself dismiss the menu. Source identity is based on model notifications; mutate external application objects through the supported refresh/update contracts.

Arrow keys, Home/End and prefix typing move among enabled items; separators/disabled items are skipped. Escape returns to the invoking cell. Tab closes before ordinary browser navigation. Connected intentional focus is preserved. If an incoming filter removes the invocation element, the grid restores a surviving logical cell or its grid fallback. Menu scrolling remains local. Actual ancestor/page scrolling or viewport resizing dismisses the popup; queued pre-opening scroll events are ignored when offsets have not changed.

## Rendering and limits

The exported `GridContextMenu` accepts prepared-compatible items, a context, finite viewport `point`, return-focus element, authoritative `isCurrent` predicate and close callback. `onRestoreFocus` supplies a fallback when the old element disappears. It aborts outstanding work on cleanup. A grid-owned host preserves theme, direction and language outside virtual rows and the ARIA grid tree. Native Popover API support supplies an unclipped modeless top layer; the fallback preserves commands/dismissal but does not guarantee the same clipping behavior in older engines.

Built-in messages use the shared English/Spanish locale schema. Application labels/values and raw diagnostics remain application-owned. This does not establish physical-device or manual assistive-technology conformance.

Submenus, custom menu-item React components, aggregate/group/full-width/remote context menus, cut, direct XLSX/PDF/chart menu integrations, full column menus and extensible aggregate status panels remain open. Applications can add export actions using the separate export package. The context-menu/status family remains **Partial** in the [ledger](FEATURE_PARITY.md).

Try **Context commands lab** for browser clipboard commands, atomic validation, history, notes, exact integers, cancellation, custom actions and live language/RTL/dark-theme transitions. See [verification](VERIFICATION.md) for executed checks. The feature requirements come from the public [AG Grid context-menu guide](https://www.ag-grid.com/react-data-grid/context-menu/); OpenGrid's item schema, actions and ownership rules are original.
