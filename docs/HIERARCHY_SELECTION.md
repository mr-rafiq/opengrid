# Hierarchy selection

Client `DataGrid` can select resident source subtrees, including collapsed and
off-page descendants, with one model selection update. Native checkboxes expose
checked, unchecked and mixed states. Selection remains distinct from cell ranges
and data edit history. The row-selection/grouping families remain Partial in the
[feature ledger](FEATURE_PARITY.md).

```tsx
<DataGrid
  model={model}
  selectionMode="multiple"
  hierarchySelection="filteredSubtree"
/>
```

`hierarchySelection` accepts these original OpenGrid modes:

| Mode              | Action scope                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `self` (default)  | Existing individual source-row selection. Generated group rows have no checkbox.                                                                                     |
| `subtree`         | All source records under the chosen node, including its own record if it is a data-bearing tree parent. Filters, collapse and pagination do not trim that subtree.   |
| `filteredSubtree` | Only those source records in the subtree that pass current quick, column, advanced and external filters. Existing selections outside that eligible set are retained. |

The option applies only to `selectionMode="multiple"`. Single and none retain
their existing behavior. This is an original source-subtree contract: a real
record at a tree parent participates when eligible. It is not a compatibility
alias for AG Grid's group selection API. Synthetic group IDs never enter model
selection. A selected ancestor that is retained only to display a filtered tree
path is not mistaken for a matching source row.

## Checkboxes, keyboard and pages

A node is checked when all of its eligible source records are selected, mixed
when some are selected, and unchecked otherwise. Zero-target nodes are disabled.
Clicking a mixed node selects its remaining eligible records. Clicking a checked
node clears its eligible records. Space in a grid cell or full-width row uses
the same action; normal arrow expansion and cell navigation remain available.

The header checkbox is labelled Select page subtrees. It acts on the union of
subtrees represented by the current page/projection, including unique pinned
rows. An expanded ancestor and its displayed children are counted only once.
A collapsed group on the page can therefore select source rows that are not
displayed on that page. Other pages' selections survive. In `filteredSubtree`,
the action further intersects that union with the current matching source set.
The ordinary `self` header keeps its existing page-row scope and now also
exposes a native mixed state.

Selection updates are atomic and make no data undo entry. Existing edit history
survives. Filtering, collapse, sorting, page movement and language/direction
changes do not clear selection automatically. Mixed state is derived again
from the current source hierarchy and selected IDs; it is not stored as another
selection model. Data replacement/removal follows normal model ID cleanup.

Each action reads authoritative model state immediately before planning and
again before publishing. Concurrent state changes reject the stale action
instead of replacing newer selection. Planning/resource failures disable affected
controls and display a translated notice; there is no fallback to selecting only
the parent. Application/core error details remain plain text, capped to 1,024
display characters. Library notices retranslate through the shared provider.

## Headless API

```ts
const plan = model.getHierarchySelectionPlan({ filtered: true });
const selection = plan.resolve(model.getState().selected);
const status = selection.getState(groupId);
const next = selection.toggle([groupId]);
if (next !== selection.selection) model.selectRows([...next]);
```

`getHierarchySelectionPlan` defaults `filtered` to true. It reconstructs the
complete resident source hierarchy using current group-by/path definitions,
independent of expansion and page rows. The eligible set comes from actual
matching source identities, including computed values and every active filter.
Unfiltered plans preserve source preorder rather than display sort order when
appending newly selected IDs. Reads and resolution do not publish model state.
Application value/path callbacks must obey the model's existing pure callback
contract; they can run while a hierarchy is constructed. Selection projections
omit aggregate calculations and per-ancestor leaf lists because selection needs
membership rather than display aggregates. Ordinary displayed groups retain
their aggregate behavior.

For another hierarchy host, use
`createHierarchySelectionPlan(nodes, { eligibleRowIds? })` with a forest of
`RowNode` roots. Do not pass a flattened list that repeats nodes already present
under an ancestor. The plan snapshots IDs/kinds/children without reading row data
or value getters. Optional eligible IDs must name source `row` nodes in that
forest; an omitted list includes all source records. Borrowed metadata and data
are not frozen or mutated.

The immutable plan exposes `rowIds` (eligible source preorder), `nodeCount`,
`getRowIds(nodeId)` and `resolve(selected)`. Unknown node IDs return undefined
from `getRowIds`/`getState`. Resolved selection exposes:

- `selection`: an owned, frozen, de-duplicated selected-ID snapshot.
- `getState(nodeId)`: frozen `{ total, selected, checked, mixed }` counts.
- `getUnionState(nodeIds)`: the same counts over an overlap-free union.
- `toggle(nodeIds, checked?)`: a frozen next selection; explicit true/false sets
  or clears the union. Omit it to toggle all versus not-all. Unknown targets
  reject the action. No-op actions return the same `selection` reference.

Selections outside a plan's eligible set survive its actions. Newly selected
IDs append once in source preorder; existing selected order remains stable.
Plans and resolved snapshots do not follow later model or input mutations.
Always prepare from fresh state before writing, as the React adapter does.

## Resource and lifecycle boundaries

`HIERARCHY_SELECTION_LIMITS` caps a plan at 200,000 structural nodes, 100,000
source rows and structural depth 128 from a zero-based root. IDs must be nonempty
strings of at most 4,096 code units, with 16,000,000 total ID units per input
collection. Eligibility and selected arrays are limited to 100,000 entries;
target-node arrays to 200,000. A result cannot exceed 100,000 selected IDs.
Limits include filtered-out source rows and all collapsed descendants.

The model rejects source-row/group-depth excess before construction and enforces
node/ID budgets as the source hierarchy is built. `maxProjectionWork` additionally
caps construction at 1,000,000 grouped-row visits or tree path-segment visits
across its path passes. Tree path depth is checked before allocating branches.
That projection counter does not include ordinary filter/sort processing or work
inside application callbacks. The standalone forest planner uses its supplied
metadata and does not invoke those callbacks.

Dense ordinary arrays and plain/null-prototype node records are required.
Relevant metadata and array entries must be own data properties. Duplicate IDs,
cycles, malformed/accessor metadata and resource excess throw
`HierarchySelectionError` with `code` (`SHAPE`, `DUPLICATE`, `CYCLE`, `LIMIT`) and
`path`. All validation occurs before a result or selection write is published.

Internally, one preorder source array and compact node intervals avoid storing
a descendant list for every ancestor. A resolved snapshot uses prefix counts;
union targets merge overlapping intervals before visiting their source IDs.
The adapter may rebuild plans after model changes. These are resource bounds
and functional behavior, not a latency or memory benchmark.

## Remaining scope and verification

This workflow covers resident client groups and path trees. Server-wide/global
selection, remote group rules, disabled-row eligibility callbacks, shift-row
ranges, nested/self-referential tree adapters and tree drag/reparenting remain
open. Reference-specific checkbox placement, selection configuration/lifecycle
and header policies are not implemented. No manual screen-reader or physical
device certification is claimed.

The **Hierarchy selection lab** demonstrates 600 grouped records and source-backed
tree parents. Unit and component checks cover intervals/unions, input budgets,
independent set oracles, matching tree ancestors, native mixed state, fresh-state
fences and language changes. Real browser flows cover collapsed/page scopes,
keyboard and filtered selection, native mixed properties and RTL/localization.
Executed results belong in the [verification record](VERIFICATION.md).

The public AG Grid [hierarchy selection guide](https://www.ag-grid.com/react-data-grid/grouping-row-selection/)
informed the feature inventory. OpenGrid's data-parent participation, bounded
planner, API and implementation are original.
