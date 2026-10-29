# Right-to-left layout

Set `direction="rtl"` on `DataGrid`, `ServerDataGrid` or `LiveViewportDataGrid`. Direction is an explicit presentation choice, independent of `GridLocaleProvider`: choosing Spanish does not change direction, and choosing RTL does not translate application data or controls.

```tsx
<DataGrid model={model} direction="rtl" />
```

The default is `"ltr"`. The [direction lab](https://mr-rafiq.github.io/opengrid/demo/) demonstrates asymmetric pins, wide virtualization, editor-preserving direction changes and independent column/row spans. Its Ctrl/Cmd+Shift+D shortcut changes direction without leaving an editor. Changing its layout example creates a fresh model; changing direction preserves the current model.

## Columns, pins and input

`pinned: "left"` and `pinned: "right"` retain their physical meanings. RTL renders the right-pinned region first, then center columns, then left-pinned columns. Ordering within each region follows the model order. The selection/row-control gutter occupies inline start: the right edge in RTL. Header groups, filters, merged owners and row-span anchor skeletons use the same geometry.

Horizontal arrow keys move in their physical directions. Home/End and editor Tab follow displayed inline order. Resize handles occupy inline end, and dragging left increases a column's width in RTL. Ranges, clipboard columns and Find follow the displayed order, including crossings between pin regions. Core model column state and standalone export ordering remain unchanged; view ordering is explicitly supplied to range/Find controllers.

A runtime direction change retains stable cell IDs, active drafts, range endpoints, selection, model state and existing remote subscriptions. It preserves the positive distance scrolled from inline start, clamped to the new content bounds, and reveals a focused unpinned cell when necessary. It does not recreate a model or restart a provider merely because direction changed.

## Scroll and geometry helpers

The React package exports `GridDirection`, `normalizeScrollLeft`, `denormalizeScrollLeft`, `getInlineColumnOrder` and `createDirectionLayout`. Window/span helpers accept `direction`; their `scrollLeft` option is a positive **inline offset**, not the browser's native RTL value. Supplied leaf arrays must already follow the appropriate pin-region order. Source indices refer to the supplied array and are not silently reversed.

The default native RTL convention is zero at the right edge and negative toward the left. Explicit `negative`, `positive-from-start` and `positive-from-end` endpoint conventions are available to helper callers; this is not automatic browser detection. Scroll normalization clamps elastic overscroll and preserves fractional pixels. Physical intervals and sticky offsets remain measured from physical edges. A viewport entirely covered by pins has an empty unobscured center.

```ts
const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
const inline = normalizeScrollLeft(viewport.scrollLeft, maximum, "rtl");
viewport.scrollLeft = denormalizeScrollLeft(inline + 100, maximum, "rtl");
```

## Scope and verification

The implementation targets client-grid layout and the existing read-only server/live React bindings. Direction is inherited by built-in child controls; application renderers, custom editors and nested grids own their own explicit direction decisions. It does not add Arabic/Hebrew catalogs, locale-aware parsers, bidirectional export layout, chart-axis mirroring or touch gestures. Independent horizontal/vertical spans retain their documented limits; combined two-dimensional spans and merged clipboard operations remain unsupported.

The [verification record](VERIFICATION.md) records executed checks. Browser automation does not establish physical-device, manual screen-reader or cross-browser conformance. The feature ledger remains Partial for the broader localization/RTL/touch family.

Public reference behavior was reviewed against [AG Grid RTL documentation, v36.2.0](https://www.ag-grid.com/react-data-grid/rtl/) and the [CSSOM View editor's draft](https://drafts.csswg.org/cssom-view/#dom-element-scrollleft). OpenGrid uses original implementation code and its own API.
