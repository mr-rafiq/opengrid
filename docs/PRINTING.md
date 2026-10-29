# Static print snapshots

`GridPrintView` renders a separate, bounded HTML table from an OpenGrid model. It does not print the virtualized interactive grid or automatically open a browser dialog. Values are captured as detached plain-text strings, and a **Refresh print snapshot** button deliberately captures a new version. Later grid edits, filters, sorts and selection/layout changes mark the snapshot stale without changing its captured cells.

```tsx
import { GridPrintView } from "@opengrid/react";

<GridPrintView
  model={model}
  scope="page"
  title="Portfolio holdings"
  caption="Current page snapshot"
  maxRows={1000}
  pageSize="A4"
  orientation="landscape"
/>;
```

Changing `model`, `scope`, `maxRows` or `maxCells` also recaptures the snapshot. The panel reports its scope, row/column counts and stale status. A stale snapshot can still be printed deliberately; click Refresh first when current grid values are required.

## Scopes and formatting

| Scope                | Included rows                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `filtered` (default) | All sorted/filtered data rows, regardless of pagination or collapsed group/tree descendants; no synthetic group rows                     |
| `view`               | Currently flattened/expanded row-model nodes, including visible groups, aggregates and tree depths                                       |
| `page`               | Current flattened page nodes, including groups/tree nodes where present                                                                  |
| `selected`           | Selected data rows intersected with the current filtered results, in current sorted/filtered order; filtered-out selections are excluded |
| `all`                | Every source row in input order; explicitly bypasses filtering, sorting, pagination and expansion                                        |

Only visible columns are included, in current logical order including left/right pin partitions. The printed table itself uses ordinary table layout; columns do not remain sticky or virtualized. Data rows use `model.getValue` and the column formatter. Synthetic group aggregate values use plain text because a data-row formatter cannot safely be called without a real row. Group labels/counts occupy the first printed column. View/page rows retain depth through indentation and accessible row-header labels.

Cells, headers, captions and titles render through React text nodes. HTML-like values are printed as text, not interpreted as HTML. The projection never mutates borrowed rows, column definitions, selection, filters or expansion. Its own column/row/cell arrays and objects are frozen.

## Bounds and errors

`maxRows` defaults to **1,000** and must be an integer from 1 through the hard maximum **10,000**. `maxCells` defaults to **100,000** and has a hard maximum **1,000,000**. The cell budget includes the column-header row: `(rowCount + 1) * visibleColumnCount`. These explicit limits protect a nonvirtualized table from accidentally expanding a very large grid.

Exceeding a limit produces an error and disables printing; rows are **never silently truncated**. Use page/selected scope or deliberately raise the limit within its hard bound. Formatter errors likewise produce an explicit error rather than partial output. No visible columns produces a status message and disabled print button. Empty data with visible columns can print its title/header and an empty-scope message.

The pure `buildGridPrintSnapshot(model, options)` export returns the same immutable string-only `GridPrintSnapshot` for application-specific report rendering. It throws on invalid scope, limits, exceeded budgets or formatter errors.

## Browser print behavior

The **Print snapshot** button is the only operation that calls `window.print()`. It marks this snapshot as the print target and temporarily marks its ancestor chain so print-only CSS can remove unrelated siblings and reset scrolling/virtual-layout containers. Only one instance is targeted at a time, even when a page contains multiple print views. Metadata/listeners are restored after `afterprint`, on unmount, when a new target takes over, or if printing throws. Screen layout is never hidden by these print rules: all isolation and ancestor resets are inside `@media print` and require the active target marker.

The component uses a uniquely named `@page` rule. `pageSize` is `auto` (default), `A4` or `letter`; `orientation` is `portrait` (default) or `landscape`; margins request 12 mm. `repeatHeaders` defaults to true and requests a repeated `<thead>`. `avoidRowBreaks` defaults to true and requests `break-inside: avoid` for rows. `showPrintButton={false}` hides the action while retaining the snapshot/refresh view.

Paper size, margins, repeating headers and page-break avoidance remain subject to browser/printer support and user settings. A row larger than a physical page may still split or overflow. Extremely wide tables may be scaled, wrapped or clipped by the browser; choose visible columns and landscape orientation explicitly. This component does not measure physical paper, place page numbers, guarantee printer color fidelity, reproduce nested detail renderers or create a dedicated print window. It assumes a normal HTML ancestor chain; shadow-root/portal isolation requires separate application integration.

**This is browser printing, not native PDF export.** A browser's Save as PDF option is a browser feature and does not establish OpenGrid PDF-export parity. No PDF bytes, paid service, upload or deployment is involved. Automated component/browser checks are separate from manual print-dialog, physical-printer, assistive-technology or cross-browser certification.
