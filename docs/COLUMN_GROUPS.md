# Nested column-header groups

`computeHeaderGroups(columns)` and `HeaderGroupRows` provide original grouped-header geometry and rendering. A column's `groupPath` names up to eight nested groups, from outermost to innermost. Labels are exact nonblank strings; they are not interpreted as expressions or HTML.

```tsx
const columns = [
  {
    id: "actual",
    header: "Actual",
    width: 120,
    groupPath: ["Revenue", "Current year"],
  },
  {
    id: "budget",
    header: "Budget",
    width: 120,
    groupPath: ["Revenue", "Current year"],
  },
  {
    id: "previous",
    header: "Previous",
    width: 120,
    groupPath: ["Revenue", "Prior year"],
  },
];
const rows = computeHeaderGroups(columns);
const depth = rows.length; // 2
```

The caller supplies the **visible leaf columns in final logical order**, after hidden columns are removed and pinning/order state is applied. A group only merges contiguous columns sharing the same path prefix and pin region. Reordering `A / B / A` creates three cells rather than spanning the intervening B group. Omitting B from the visible schema allows the remaining contiguous A columns to merge. Left, center and right pin regions never share a cell, even when their labels match.

All group rows have full logical width. Columns with no group, or with a shallower path than their neighbors, receive blank cells at the missing depths. This avoids incorrect row-spans or shifting leaf/filter headers. Blank cells have an empty label and no collapse button.

## Metadata

`computeHeaderGroups` returns `HeaderGroupCell[][]`, with one array per zero-based group depth. Every cell contains:

| Field          | Meaning                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `key`          | Distinct key for this contiguous segment and depth                                                      |
| `label`        | Group name at this depth, or empty string for a blank segment                                           |
| `path`         | Path prefix through this depth; blank descendants retain their existing ancestor prefix                 |
| `depth`        | Zero-based group row                                                                                    |
| `start`, `end` | Logical leaf-column interval; `end` is exclusive                                                        |
| `width`        | Sum of the interval's leaf widths                                                                       |
| `pinned`       | `left`, `right` or `null`                                                                               |
| `leftOffset`   | Width of preceding left-pinned leaves, excluding the row-selection gutter; present only for left groups |
| `rightOffset`  | Width of following right-pinned leaves; present only for right groups                                   |
| `leafIds`      | Ordered IDs of all leaves in this segment                                                               |

IDs must be nonempty and unique. Widths may be zero or fractional, but must be finite and nonnegative; accumulated width must remain numerically safe. Invalid paths, pin regions, duplicate IDs and unsafe dimensions throw. Returned path arrays are copied from the supplied paths.

## Rendering and virtualization

`HeaderGroupRows` props are `columns`, optional `entries` from `getColumnWindow`, `leadingWidth` (default 0), `rowHeight` (default 38), `onToggle`, `collapsedPaths`, `ariaLabel` and `className`. The component renders a rowgroup intended to be placed **inside the grid and before its leaf-header and filter rows**.

Group rows use ARIA row indices `1 … depth`. Leaf-header/filter rows should therefore use `depth + 1` and `depth + 2`, and the first data row `depth + 3`. The parent must add group depth to its total ARIA row count and sticky-header/viewport geometry. With 38-pixel group and ordinary header rows, header height is `(depth + 2) * 38`.

Cells keep full logical `aria-colindex` and `aria-colspan`, even when only some children are virtually mounted. A positive leading gutter occupies logical column 1; group indices then shift by one. Whole group cells are rendered if they intersect any mounted leaf index, or are pinned. Other complete groups become ARIA-hidden spacers, keeping DOM group counts bounded for wide schemas. A retained group spanning many virtual leaves keeps its whole width and span; it is not falsely divided into unrelated groups. Pin offsets remain based on the full logical schema, not just mounted cells.

The component uses CSS custom properties for grid colors, with readable light fallbacks. It does not own horizontal scrolling, measure widths, resize groups, rearrange leaves, or filter the column schema. Column/group focus belongs to the parent grid's keyboard implementation.

## Optional collapse interaction

A toggle button appears only when `onToggle(path)` is supplied and a cell has a nonblank label. Buttons support standard keyboard activation, have descriptive Expand/Collapse labels and expose collapsed state via `aria-pressed`. `collapsedPaths` uses complete path arrays, not ambiguous concatenated strings. The callback receives a copied path.

The parent owns collapsed state and the visibility policy. It must keep a representative leaf or other visible representation when collapsing a group; removing all leaves also removes its header and its expand button. Collapse controls alone do not implement automatic column visibility, AG Grid's columnGroupShow semantics, married children, group resize distribution, or group drag/drop. Those remain separate integration responsibilities.
