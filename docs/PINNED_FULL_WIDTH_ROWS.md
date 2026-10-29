# Pinned and full-width row projection

This milestone uses existing model row identities and a current-view move
projection. It does not create duplicate body copies or synthetic editable rows.
The pure `createRowProjection` helper is implemented first; the DataGrid adapter
integration is a separate step and must be verified before it is advertised as
available in the grid component.

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

## Shared identity and range domain

Each immutable descriptor records its source index, visual index, region and
index within its region. `getById` and `indexOf` use a private ID map so consumers
cannot mutate the lookup index. The normal data rows in `rangeRowIds` are ordered
as top, body and bottom. Groups and full-width rows are excluded because their
ordinary column cells are not present.

The adapter must use the same projection for rendering, focus, keyboard movement,
range and Find callbacks, and ARIA row indices. Internal focus and DOM references
must use logical row IDs rather than treating an old visual index as identity.
Pinning or unpinning then moves the focused row without assigning its focus to
another record. Core `CellPosition` remains an existing row ID and column ID.

## Full-width rendering contract

`isFullWidthRow(node)` classifies each source row once. Full-width classification
is metadata at this stage; the projection helper does not render React content.
The planned `renderFullWidthRow` context contains `node`, `rowId`, `rowPinned`
(`"top"`, `"bottom"` or `null`) and `viewportWidth`.

A full-width adapter row must render one gridcell spanning the logical columns,
using its existing declared row height. It remains a row-navigation target but
does not invent a column identity for range selection. Its interactive renderer
content owns its internal controls. Sorting and filtering remain model actions.
This slice will not automatically measure renderer content or duplicate it into
left, middle and right column sections.

The forthcoming adapter integration must also verify sticky-band geometry,
native keyboard and modal focus restoration, nested-grid ownership isolation,
variable-height body virtualization, ARIA ordinals and real-browser positioning.
The projection unit tests alone do not establish those behaviors.
