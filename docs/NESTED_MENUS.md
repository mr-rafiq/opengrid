# Nested command menus

Cell and header command providers can return bounded nested menus. The existing defaults remain flat; applications can regroup those real actions or supply their own callbacks. Both surfaces share the same metadata, keyboard, cancellation and native-popover implementation.

```tsx
import { DataGrid, type GridContextMenuOptions } from "@opengrid/react";

type Order = { id: string; customer: string; reviewed: boolean };
const contextMenu: GridContextMenuOptions<Order> = {
  getItems(_context, defaults) {
    return [
      {
        kind: "submenu",
        id: "recordCommands",
        label: "Record",
        items: defaults.filter((item) =>
          ["edit", "note", "selectRow"].includes(item.id),
        ),
      },
      {
        kind: "submenu",
        id: "sharingCommands",
        label: "Share",
        items: [
          {
            kind: "submenu",
            id: "documents",
            label: "Documents",
            items: defaults.filter((item) => item.id === "exportCsv"),
          },
        ],
      },
    ];
  },
};

// `model` is the stable createGrid<Order>(...) instance owned by your app.
<DataGrid model={model} contextMenu={contextMenu} />;
```

The equivalent header provider is `GridColumnMenuOptions<T>.getItems`. Its context remains a column context, without a synthetic row. Nested built-in leaves retain their existing validation, source, clipboard, editing/history, filter, chooser and sizing contracts. A menu provider runs on explicit invocation, not render/SSR.

## Owned tree contract

`GridContextMenuSubmenu<T>` and `GridColumnMenuSubmenu<T>` contain only:

```ts
import type { GridContextMenuItem, GridMessage } from "@opengrid/react";

type Submenu<T> = {
  readonly kind: "submenu";
  readonly id: string;
  readonly label: string | GridMessage;
  readonly disabled?: boolean;
  readonly items: readonly GridContextMenuItem<T>[];
};
```

A submenu cannot also carry an action, checked state or shortcut. It must contain at least one non-separator item; all-disabled choices are allowed and leave its menu container keyboard-focusable. A branch with its own `disabled: true` cannot open.

The public preparation functions own and freeze every branch, child array and label descriptor without calling/freezing borrowed action functions. Both public limit objects now include `maxDepth: 4`: **four menu levels including the root**. The **48-item budget covers the entire tree**, counting parents, leaves and separators together. IDs must be globally unique across all branches, including separator IDs. IDs/shortcuts retain their 128-code-unit limits and literal labels retain their 1,024-code-unit limit. Message descriptors retain the shared catalog bounds.

Cycles, excessive depth/count, sparse/custom arrays, unknown fields, accessors, invalid flags and mixed item kinds reject before rendering actions. An empty root array still suppresses a grid-owned popup; an empty submenu is rejected. Reusing the same default action in multiple branches requires a distinct copied ID for each occurrence. Prototype-like IDs are safe because indexes and ownership use maps rather than object-property lookup.

## Input and focus

Enter, Space, click or tap opens a branch and focuses its first enabled choice. Forward arrow opens it; reverse arrow closes the current child and restores its parent item. Forward/reverse mirror in RTL. Up/Down, Home/End and prefix typing operate only within the current level, skipping disabled choices and separators. Escape closes one child at a time, then closes the root to its invocation point. Tab closes the entire stack before native navigation.

Mouse hover opens a branch after 150 milliseconds and closes unrelated descendants. Hover resumes after actual mouse movement; stationary entry events caused by keyboard scrolling do not steal the keyboard target. Keyboard navigation scrolls only the owned popup to reveal an offscreen item. Scrolling a parent popup closes its descendants. Actual invocation-ancestor/page scrolling and viewport changes dismiss the complete stack, restoring owned keyboard focus to its invocation point while preserving connected intentional outside focus. Equivalent grid RTL scroll-sign changes retain the stack.

Each child is a DOM descendant of its parent popover and has its own labeled `menu`, parent `aria-haspopup`, `aria-expanded` and controls relationship. Native popovers provide a separate top layer for each open level. Positioning prefers the forward side, flips when it fits better and clamps to the viewport. Narrow layouts can overlap parent panels; reverse arrow/Escape or outside input returns/cancels. Without the Popover API, hidden attributes are removed and commands/keyboard behavior remain available; equivalent clipping/stacking in older engines is not guaranteed.

## Async ownership and errors

One root lifecycle owns the full open path and at most one pending action. Every leaf uses the authoritative source predicate. Model/policy/provider changes close grid-owned work. An async callback receives the same cooperative `AbortSignal` as a flat action and must check it after awaits before effects.

While pending, choices are locked. Escape or native light dismissal of its child cancels the complete stack and aborts the task. Old continuations cannot unlock a later task. A rejection retains the child path and focuses the re-enabled failed leaf for retry; root notices resolve in the current language. External side effects already performed by application code cannot be rolled back by menu cancellation.

Language/direction/theme updates preserve the same focused leaf when source ownership and provider identity remain stable. Literal application labels remain application-owned; typed `gridMessage` labels and built-in actions retranslate. Existing clipboard view-order fences still apply: a direction change during a pending paste cannot redirect that paste into a new displayed order.

## Demo and support boundary

Open **Nested commands lab** in the [public demo](https://mr-rafiq.github.io/opengrid/demo/). It regroups actual row/header defaults, supports four-level application review commands with shared undo, a 24-choice saved-query branch, real clipboard and CSV, physical pinning, cancellable work and source replacement. Ctrl+Shift+L/D/T changes language/direction/theme; U sends an incoming record. Group names are application labels.

Named checks cover metadata/resource ownership, four-level mouse hover, current-level keyboard/RTL, failed retry and async aborts, existing row/header edits, native top-layer edge geometry, narrow scrolling, touch header taps, fallback commands and composed axe. Executed results belong in [verification](VERIFICATION.md). No physical-device, manual screen-reader, throughput or all-browser certification is inferred.

Custom React menu-item components, arbitrary interactive children, aggregate/group/full-width/remote targets, cut, complete export/chart menu integration, aggregation/calculated authoring and full panel lifecycle remain separate gaps. The [menu families remain Partial](FEATURE_PARITY.md); this is not full AG Grid menu/API parity.

Feature references reviewed against AG Grid 36.2.0: [menu item components](https://www.ag-grid.com/react-data-grid/component-menu-item/), [column menu](https://www.ag-grid.com/react-data-grid/column-menu/) and [context menu](https://www.ag-grid.com/react-data-grid/context-menu/). Keyboard/ARIA behavior was checked against the [W3C menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/). OpenGrid’s implementation is original.
