# Automatic detail-panel height

Client `DataGrid` can opt into measuring its mounted detail regions with `autoDetailHeight`. This is independent of column `autoHeight`; a grid with no measured columns can still measure details.

```tsx
<DataGrid
  model={accounts}
  autoDetailHeight
  detailHeight={80}
  defaultExpandedDetailRows={["account-1"]}
  renderDetail={({ row, rowId }) => <AccountDetails account={row} id={rowId} />}
/>
```

Use the source packages and stylesheet in the [quick start](../README.md#react-quick-start). `AccountDetails` is an application component with naturally measurable block content. The grid does not fetch detail records or create their models for you.

## Sizing and ownership

`detailHeight` retains its existing number/callback contract: finite declarations clamp to 40–2,000 pixels; invalid declarations fall back to 180. With automatic detail height these values are minimum estimates. Mounted content can grow beyond 2,000 pixels up to the measurement resource cap. Without `autoDetailHeight`, the declared detail remains fixed and its content scrolls inside it.

The existing inner detail region becomes a flow root so its natural block contains child margins and floats. The observer reads that inner content and its parent cell's vertical padding/borders, rather than measuring the assigned outer detail height. Nested grids with explicit viewport heights can therefore change their enclosing detail height when the application changes those heights. Automatic measurement does not put a nested grid into an unbounded all-rows rendering mode. Give that child its own appropriate height and virtualization policy.

Cell and detail measurements share one bounded controller, observer batch, cache and reset lifecycle, with separate internal identity namespaces. An application column named `detail` cannot collide with the same row's detail region. The pure merged-cell allocator only receives ordinary cell constraints; measured detail height is added separately before prefix layouts are built. Expanded details still break adjacent row-span runs. Pinned and full-width masters can own measured details while retaining their own separately declared minimum row heights.

ResizeObserver detects mounted asynchronous content growth, shrinkage and reflow. Viewport width, renderer/view/data and expansion ownership invalidate incompatible estimates. Detached callbacks cannot revive a collapsed detail or apply to a replacement model with reused IDs. React Strict Mode replay and server rendering follow the same ownership contract as [automatic cell heights](AUTO_ROW_HEIGHT.md). SSR emits minimum estimates and performs no DOM reads. Without ResizeObserver, mounted layout/window-resize measurements and an explicit `rowHeightRef.current?.reset()` are available; asynchronous content alone needs that reset.

The application owns each nested component/model's persistence. Collapsing, filtering or virtualizing away a detail may unmount it; use controlled application storage when records or state must survive. Observation does not synchronize nested row selection, history, filtering or remote refresh. Source-position anchoring uses the parent body/detail origin, preserves intentional outside focus and does not promise an unchanged screen pixel for every descendant whose own layout changes.

## Bounds and unsupported layouts

The [shared height limits](AUTO_ROW_HEIGHT.md#bounds-and-remaining-work) apply: 100,000 projected parent rows, a default 10,000 cached and 2,048 connected owners, tightening through `autoRowHeight`, and a 1,000,000-pixel measured-owner cap. Each mounted detail consumes one cache/connection slot, alongside measured cell owners. Connected capacity must fit the cache. Hidden/unreadable/oversized measurements retain the last valid estimate. Untouched or evicted offscreen details keep their minimum estimate until mounted again.

Custom content must have a natural block height. A descendant that derives its height from the assigned parent detail height can create application-level feedback; retain explicit detail sizing for that design. Percentage/fixed positioning, arbitrary custom CSS, large media, browser pixel limits and manual assistive technology are not certified. Stable scrollbar space is reserved in the observed detail cell to avoid wrap/scrollbar feedback.

Automatic full-width master/header/group sizing, remote detail loading/refresh/write lifecycle, nested-model persistence and detail-aware document export remain open. The master/detail, row-height and virtualization families remain Partial. The public [AG Grid 36.2 detail-height documentation](https://www.ag-grid.com/react-data-grid/master-detail-height/) supplies the reference capability; OpenGrid's bounded observer integration is original MIT code with its own API.

Try **Automatic height lab → Details follow their nested content** in the [interactive demo](https://mr-rafiq.github.io/opengrid/demo/). Add/remove nested records, switch automatic sizing off/on, and use Alt+Enter on the master cell to collapse/reopen. Its nested models belong to their mounted details and reset after unmount. Global Spanish UI, RTL and dark controls preserve a mounted nested model.
