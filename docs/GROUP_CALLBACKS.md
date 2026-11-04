# Domain objects and generated groups

OpenGrid 0.12 adds explicit grouping keys and generated-group values to the native client model. These callbacks preserve original class instances; they do not implement an AG Grid compatibility component.

[Try the keyed class grouping lab](https://mr-rafiq.github.io/opengrid/demo/#keyed-groups). Open **Keyed class grouping lab**, filter the work items and sort Budget to order the filtered totals. Distinct Department objects form three groups by code. The example uses original synthetic classes, European currency and the shared light/dark theme.

## Separate identity from values

`Column.groupKeyGetter(value, row)` returns a stable string identity. `valueGetter` continues to return the original value for display, filtering, export and aggregation. Objects with the same key share a group without cloning or changing the source rows. Changing a source object's key through a host transaction moves its row into the corresponding group.

```tsx
import type { Column } from "@opengrid/core";

class Department {
  constructor(
    public code: string,
    private caption: string,
  ) {}
  label() {
    return this.caption;
  }
}
interface WorkItem {
  department: Department;
  caption(): string;
}

const departmentColumn: Column<WorkItem> = {
  id: "department",
  valueGetter: (row) => row.department,
  groupKeyGetter: (value) => (value as Department).code,
  valueFormatter: (value) => (value as Department).label(),
};
```

Keys must be strings of at most 4,096 characters. A non-string result or thrown callback rejects projection/state changes. Without this callback, existing native grouping identity remains unchanged. Choose keys that are unique within the grouped field; display captions can change independently. The representative raw value and source order come from the full source group, so filtering out its first row does not move or rename the group unexpectedly.

## Give generated groups their own values

`Column.groupValueGetter(node)` receives `GridHierarchyNode<T>`, with group identity, original representative value, frozen child metadata and aggregates. Generated groups have no source `T`. The callback may return a typed class instance or `undefined`; it does not create an aggregation or alter the original rows.

```tsx
const workColumn: Column<WorkItem> = {
  id: "work",
  valueGetter: (row) => row.caption(),
  groupValueGetter: (node) => (node.groupValue as Department).label(),
  aggregateFormatter: (value) => String(value ?? ""),
};
```

The generated value participates in client display, group sorting and captured HTML printing. `aggregateFormatter(value, context)` formats it without a fabricated source row. Subtotals and grand totals retain their ordinary aggregate path. A custom comparator can set `compareBlankValues: true` when it must order blank/undefined values using real row/group metadata; the default blank-last behavior otherwise remains unchanged.

## Read complete hierarchy metadata

`model.getRowHierarchy?.("source" | "filtered" | "sorted")` returns a bounded, frozen forest independent of expansion, pagination and subtotal placement. `source` retains all resident rows and declaration order; `filtered` prunes that source forest; `sorted` applies the current group and leaf ordering. Child arrays and aggregate dictionaries are frozen, while source rows and raw values remain borrowed application references. Never mutate them through the projection.

This is a client model contract. Older custom models may omit it. It does not fetch remote rows or supply AG-shaped RowNodes. Existing hierarchy selection limits bound depth, node count and work. Callbacks must be synchronous and side-effect free.

Provider React bindings reject `groupKeyGetter` and `groupValueGetter`: a remote result wrapper is not a resident source row. Implement provider grouping keys, aggregate values and formatting in the provider's documented contracts instead.

## Compatibility boundaries

Internal row/column/callback adapters are under development and have original tests. They are not exported as `AgGridReact`, do not translate arbitrary expressions, and do not certify custom application panels, filters, saved views, backend writes, group business editing or authenticated UI replacement. Keep an existing application integration unchanged until its actual contracts and deployment have been verified. See the [readiness matrix](CALCULATION_WORKSPACES.md) and [verification record](VERIFICATION.md).
