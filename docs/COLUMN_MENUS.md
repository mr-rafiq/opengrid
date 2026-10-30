# Column header commands

OpenGrid’s React `DataGrid` provides a bounded command menu with flat defaults and customizable nested branches for visible leaf headers. It operates on the existing model, filter controls, chooser and sizing controller. It is an original API; it does not implement every AG Grid column-menu option.

Open a header’s three-dot button, press ArrowDown on that button, press Shift+F10 or ContextMenu while a header control has focus, or right-click a leaf header. Ctrl+right-click preserves the browser menu. Native touch taps activate the button; long-press browser menus remain native. Set `columnMenu={false}` to remove this feature.

## Built-in actions

| Action                    | Behavior and bounds                                                                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sort ascending/descending | Normal single-column sort replaces existing priorities. Current direction and non-sortable definitions are disabled.                                                                                                                                                                                            |
| Clear this sort           | Removes only this column from a multi-sort.                                                                                                                                                                                                                                                                     |
| Pin left/right/unpin      | Uses physical sides, including in RTL. Current choice is disabled.                                                                                                                                                                                                                                              |
| Group/remove grouping     | Appends/removes the selected column’s grouping, clears expansion and returns to page zero.                                                                                                                                                                                                                      |
| Expand/collapse groups    | Uses the actual client hierarchy, preserving existing expansion IDs when expanding. Traversal is iterative and bounded to 200,000 distinct nodes/roots/output IDs, 1,000,000 references and 16,000,000 output ID characters. A limit rejects the whole operation before publication. Collapse clears expansion. |
| Size this column          | Measures the current rendered default text for that column.                                                                                                                                                                                                                                                     |
| Size rendered columns     | Measures only rendered eligible columns, within the sizing controller’s limits; it does not measure every virtual/offscreen column or scan source rows.                                                                                                                                                         |
| Fit columns to grid       | Invokes the existing proportional fit controller with the current usable viewport width. Constraints and pinned/leading widths retain their documented semantics.                                                                                                                                               |
| Reset this width          | Clears this column’s manual width override. Other layout state remains intact.                                                                                                                                                                                                                                  |
| Focus column filter       | Focuses the first usable registered filter control. A native button explicitly advertising `aria-haspopup="dialog"` is activated to open its existing filter dialog. Other custom buttons are focused without clicking them.                                                                                    |
| Choose columns            | Opens and focuses the existing toolbar chooser. Disabled with `toolbar={false}`. The chooser is not a new virtualized tool panel.                                                                                                                                                                               |
| Hide column               | Hides this leaf and moves focus to another connected header button. The last visible leaf cannot be hidden through this command.                                                                                                                                                                                |

These are layout/query operations, not data-edit undo entries. Filter and chooser actions retain their own focus. Menus are disabled during cell/row/note editing, active resizing, managed dragging and range gestures.

## Custom items

```tsx
import { DataGrid, type GridColumnMenuOptions } from "@opengrid/react";

type Product = { id: string; name: string; price: number };
const columnMenu: GridColumnMenuOptions<Product> = {
  getItems(context, defaults) {
    return [
      ...defaults,
      { kind: "separator", id: "application" },
      {
        kind: "action",
        id: "inspect",
        label: "Inspect column",
        action(current, signal) {
          if (signal.aborted) return;
          console.log(current.column.id, current.origin);
        },
      },
    ];
  },
};

// `model` is the stable createGrid<Product>(...) instance owned by your app.
<DataGrid model={model} columnMenu={columnMenu} />;
```

`GridColumnMenuContext<T>` contains only `{ model, column, origin }`; no synthetic data row is created. `origin` is `button`, `keyboard` or `context`. Context and prepared menu descriptors are frozen. The column/model are borrowed application objects. `getItems` runs on explicit invocation, never during render/SSR; it receives frozen defaults. Keep the callback identity stable if open menus should survive unrelated renders. The options wrapper itself may be recreated.

`GridColumnMenuItem<T>` is an action, separator or submenu, with the same metadata rules as [cell context commands](CONTEXT_MENUS.md). `prepareColumnMenuItems` and `COLUMN_MENU_LIMITS` expose the bounded preparation contract: at most 48 total items across four menu levels, 128 characters per ID/shortcut and 1,024 per literal label, no duplicate IDs, holes, accessors or unknown fields. Labels can be typed `gridMessage` descriptors. Arbitrary HTML, React children and callback-backed getters are unsupported. `GridContextMenuError` is shared by both command surfaces and carries a translatable notice.

The standalone `GridColumnMenu` accepts the typed context, prepared items, point, return-focus element, `isCurrent`, `onClose` and optional `onRestoreFocus`. It uses the same original keyboard/popover surface as cell commands. Standalone consumers own source freshness and appropriate popup/theme context.

## Lifecycle and cancellation

Arrow keys, Home/End and type-ahead navigate enabled actions. Escape closes one child at a time; at the root or while pending it closes the stack and restores a connected invocation point, with a grid-owned fallback if that header disappears or becomes disabled. Tab follows native navigation after returning to the invocation point. Outside pointer input, changed invocation-ancestor scrolling and viewport changes dismiss the popup. A queued unchanged scroll event from opening does not cancel it.

Changing the model state, visible leaf membership, provider, enabled/editing policy or toolbar availability invalidates the open menu. A stable language/direction/theme update keeps the same popup and active item. Async callbacks receive an `AbortSignal`; cancellation is cooperative. An application callback must check it after awaited work and before writes. OpenGrid cannot undo an external side effect already performed by custom code. Rejections show a bounded notice and focus the failed item for retry.

Autosizing accepts an operation-specific `AutoSizeOptions.signal`. A pre-aborted request returns `cancelReason: "aborted"` without reading the view or superseding valid pending work. Cancellation detaches its listener and cannot cancel a later sizing request. Escape passes that cancellation through the header action, preventing a delayed measured width from publishing. See [column sizing](COLUMN_SIZING.md) for measurement, font, sample, custom-renderer and stale-source limits.

The menu has English and Spanish message coverage, popup-host direction/theme inheritance, viewport clamping and header focus retention across column virtualization. Automated Chromium geometry/keyboard and axe checks are recorded in [verification](VERIFICATION.md); they do not establish manual screen-reader or physical-device certification.

## Example and remaining gaps

Open **Column commands lab** in the [demo](https://mr-rafiq.github.io/opengrid/demo/). It uses 180 records, 34 columns, pinned edges, real condition filtering, state inspection, a cancellable application command and live language/RTL/dark updates. Ctrl+Shift+L/D/T exercise those updates while the popup remains open.

Remaining reference capabilities include custom React menu components, aggregation authoring, absolute-sort modes, header renaming, calculated-column authoring, per-column menu precedence, empty-header-space invocation, full layout reset, complete chooser/tool-panel lifecycle and virtualization, and dedicated group/remote header commands. Group expansion is a bounded resident-model operation; this is not a server request for unloaded groups. `ServerDataGrid` disables resident header menus so their grouping/expansion actions cannot mutate a loaded-page facade; its existing provider-authoritative sort/filter and layout controls remain available. The broad menu/tool-panel family remains **Partial** in the [parity ledger](FEATURE_PARITY.md).

Specification reference: [AG Grid 36.2.0 column menu](https://www.ag-grid.com/react-data-grid/column-menu/), reviewed 2026-10-30. No AG Grid implementation code is used.
