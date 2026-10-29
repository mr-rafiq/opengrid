# Pinned and full-width row projection

This milestone uses existing model row identities and a current-view move
projection. It does not create duplicate body copies or synthetic editable rows.
`DataGrid` accepts `pinnedTopRowIds`, `pinnedBottomRowIds`, `isFullWidthRow` and
`renderFullWidthRow`. The pure `createRowProjection` helper supplies the same
projection to rendering, focus and range interactions.

## Current-view pin scope

The helper accepts the current visible page (or the full visible row model when
pagination is disabled), plus `pinnedTopRowIds` and `pinnedBottomRowIds`. Requested
rows are moved into top and bottom bands in the explicit supplied order. The
remaining body retains its source order. Duplicate requests are deduplicated;
top wins when an ID appears in both lists. A row appears exactly once.

Only visible leaf data rows are pinnable in this slice. Group nodes, tree
parents, data-less nodes and IDs absent from the supplied page are ignored and
reported in `ignoredPins`. Filtering, pagination and expansion determine the
supplied source view; pinning never fetches hidden, collapsed, filtered-out or
off-page records. The helper does not mutate the model, source nodes, page
counts, group aggregates or export behavior.

The combined pin lists may contain at most 1,000 entries, including duplicates
and unresolved IDs. Oversized or malformed requests are rejected before resolving
rows or invoking full-width predicates. Pinned rows are intended for small sets;
their bands will remain mounted rather than being vertically virtualized.
Pinned leaf rows are presented at tree depth zero without modifying their source
node or data. Pinning is current-view presentation state supplied by the host;
it is not added to the core model's persisted grid state.

Pinned bands share horizontal column scrolling, including pinned columns. Their
declared variable heights and expanded detail heights reduce the scrolling body
viewport. The requested `height` remains a minimum: if both bands and the header
would consume the viewport, it expands to leave at least 64 pixels for the body.
Body rows continue to use variable-height virtualization.

## Shared identity and range domain

Each immutable descriptor records its source index, visual index, region and
index within its region. `getById` and `indexOf` use a private ID map so consumers
cannot mutate the lookup index. The normal data rows in `rangeRowIds` are ordered
as top, body and bottom. Groups and full-width rows are excluded because their
ordinary column cells are not present.

The adapter uses this projection for rendering, focus, keyboard movement, range
and Find callbacks, and ARIA row indices. Internal focus and DOM references use
logical row IDs. Pinning or unpinning moves the focused row without assigning its
focus to another record, including when a whole-row edit dialog is open. Core
`CellPosition` remains an existing row ID and column ID. Copy, paste and fill
include ordinary cells across top, body and bottom in visual order. Pointer range
auto-scroll uses the body edges after subtracting both pinned bands; hovering a
pinned band retains its fixed target rather than scrolling the body underneath.

## Full-width rendering contract

`isFullWidthRow(node)` classifies each source row once. When supplying that
predicate, also supply `renderFullWidthRow`. Its context contains `node`, `rowId`, `rowPinned`
(`"top"`, `"bottom"` or `null`) and `viewportWidth`.

A full-width row renders one gridcell spanning the logical columns and the
viewport width, using its existing declared row height. It remains a navigation
target without inventing column cells for range selection or Find. Arrow keys
visit its wrapper; Shift range extension skips its absent column cells. Enter on
the wrapper focuses its first interactive descendant, and events from renderer
controls or nested grids remain owned by that content. F2 can open the whole-row
dialog when `editMode="row"`. Sorting and filtering remain model actions.
The grid does not automatically measure renderer content or duplicate it into
left, middle and right column sections.

Full-width and master/detail rendering can coexist on the same source row. The
full-width base keeps its own declared height; an expanded detail is a separate
row immediately below it. Alt+Enter on the full-width wrapper toggles that detail.
Both heights contribute to the band or body layout, and both rows are counted
once in ARIA ordinals. Renderer controls retain responsibility for their own
focus and keyboard behavior.

The rowgroup wrappers expose `data-row-region="top|body|bottom"`. Row wrappers
also expose `data-row-key`, and full-width rows have `data-full-width="true"`.
Their focusable cells have `data-full-width-row-id` for precise testing.

Automated component tests cover projection, focus, current-view scope, variable
geometry, editing, cross-band range operations, detail ARIA and nested grids.
Chromium checks verify stationary top/bottom bands through vertical scrolling,
full-width viewport alignment through horizontal scrolling, and actual pointer
auto-scroll boundaries. These checks do not claim screen-reader verification.
