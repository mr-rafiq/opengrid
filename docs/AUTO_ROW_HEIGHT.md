# Automatic content row height

Client `DataGrid` can measure mounted content owners. Set `wrapText: true` for multiline text and `autoHeight: true` on the columns that determine row height. These flags are independent: wrapping alone clips within the declared row height; automatic height alone measures the existing content layout. Import the package stylesheet.

```tsx
import { createRef } from "react";
import { createGrid } from "@opengrid/core";
import { DataGrid, type DataGridRowHeightController } from "@opengrid/react";
import "@opengrid/react/styles.css";

const model = createGrid({
  rows: [
    { id: "review", notes: "Review the delivery window and dependencies." },
  ],
  getRowId: (row) => row.id,
  columns: [
    {
      id: "notes",
      field: "notes",
      header: "Notes",
      width: 220,
      wrapText: true,
      autoHeight: true,
      editable: true,
    },
  ],
});
const heights = createRef<DataGridRowHeightController>();
const grid = (
  <DataGrid
    model={model}
    rowHeight={36}
    rowHeightRef={heights}
    autoRowHeight={{ maxCachedCells: 10000, maxConnectedCells: 2048 }}
  />
);
// After an application-owned content/style change:
heights.current?.reset();
```

The example uses the source packages described in the [quick start](../README.md#react-quick-start); no published npm package is promised. In a component, retain the model and ref across renders.

## Measurement and geometry

`rowHeight` and `getRowHeight(node)` provide minimum heights. The largest measured ordinary cell determines its row's height. A vertical merged owner measures one content element; any height exceeding its covered rows' combined minimum goes into the final row. Other columns share that added height, so overlapping constraints do not each add their full deficit. Horizontal combined owners use their actual resolved width. OpenGrid's combined rectangles are an independent extension beyond the reference column-spanning constraints.

Measurements include content height and cell vertical padding/borders. They round upward to whole pixels. ResizeObserver notifications and layout commits schedule bounded animation-frame batches. Width, direction, data/view, renderer and span changes invalidate incompatible estimates; selection alone preserves them. Native editing temporarily retains the display estimate; committing or undoing remeasures the resulting display content. Asynchronous mounted content changes are observed. Without ResizeObserver, mount/layout and window-resize measurements remain available; asynchronous content alone requires `reset()`.

All configured visible automatic-height columns stay rendered horizontally so their mounted row contents can be measured, including a column outside the normal horizontal window. Other columns retain normal horizontal virtualization. Vertical virtualization remains enabled: unrendered cells have minimum-height estimates, and inactive cached estimates can be evicted. Scroll extent can therefore change as rows are encountered. Geometry changes preserve the visible focused source-row point, or the first visible source-row point, when the source ordering is unchanged. They do not move intentional focus outside the grid. The viewport reserves its vertical scrollbar space to avoid flex-width/height feedback.

Current-view pinned bands participate in ordinary-cell measurement. Anchoring uses body coordinates below the sticky top band: when that band grows, the same body source point stays below its new edge rather than at a fixed screen pixel. Groups, full-width renderers and headers retain explicit heights. Detail blocks can opt into [automatic detail sizing](AUTO_DETAIL_HEIGHT.md); otherwise they retain declared heights. The core model, row data, selection and undo history are unchanged by measurement. Construction and server rendering perform no DOM reads; server HTML contains estimates. Measurement ownership is scoped to committed model/view generations, and stale observer/cleanup callbacks cannot apply to a replacement model.

## Bounds and remaining work

`AUTO_ROW_HEIGHT_LIMITS` exposes fixed resource caps: 100,000 projected rows, eight configured automatic-height columns (including hidden definitions), 100,000 cached cells, 8,192 concurrently connected content cells and 1,000,000 pixels per measured content owner. The default cache is 10,000 cells; default connected capacity is the smaller of 2,048 and the cache. `autoRowHeight.maxCachedCells` and `maxConnectedCells` are positive integer caps; connected capacity cannot exceed cache capacity. Connected cells are pinned in the cache. Exceeding a configured row/column/connection budget throws rather than silently ignoring content. Invalid/unreadable DOM measurements retain the last valid estimate. Base/prefix geometry must remain numerically safe.

Custom rendered content must have a measurable natural block height. Layouts that make content height depend on its assigned row height can create application-level feedback; use explicit heights for those layouts. The implementation does not certify arbitrary custom CSS, large-image loading, physical devices, browser pixel limits or manual assistive technology. Cache eviction and first visits can change estimates. This is not an eager measurement of the entire dataset or an unlimited-size scroll strategy.

Automatic full-width/header/group sizing, remote server/infinite/viewport variable heights and a core persisted height state remain open. Remote sparse rows can wrap within their fixed height; the client-only automatic contract is not enabled by those adapters. The broad row-height, merged-layout and virtualization ledger entries remain Partial.

Try **Automatic height lab** in the [interactive demo](https://mr-rafiq.github.io/opengrid/demo/): ordinary edits and width reflow, three-row merged owners, flex resizing, RTL, Spanish UI and dark styling. The public [AG Grid row-height](https://www.ag-grid.com/react-data-grid/row-height/) and [row-span automatic-height](https://www.ag-grid.com/react-data-grid/row-spanning/#auto-height-and-row-spanning) documentation specify the reference capability; OpenGrid's implementation is original MIT code.
