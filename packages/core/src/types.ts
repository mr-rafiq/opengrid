import type { HierarchySelectionPlan } from "./hierarchy-selection.js";
export type RowId = string;
export type Pin = "left" | "right" | null;
export type Aggregate =
  "sum" | "avg" | "min" | "max" | "count" | ((values: unknown[]) => unknown);
/** Aggregate display context deliberately has no fabricated source row. */
export interface AggregateFormatContext {
  readonly columnId: string;
  readonly rowId: RowId;
  readonly kind: "group" | "total";
  readonly aggregate: Aggregate | undefined;
  readonly total?: "group" | "grand";
  readonly groupLabel?: string;
  readonly leafCount?: number;
}
export interface Column<T> {
  id: string;
  field?: keyof T & string;
  header?: string;
  groupPath?: readonly string[];
  width?: number;
  flex?: number;
  minWidth?: number;
  maxWidth?: number;
  hidden?: boolean;
  pinned?: Pin;
  /** Anchor at the leading/trailing edge of the current pin band in declaration order. */
  lockPosition?: "left" | "right";
  lockPinned?: boolean;
  lockVisible?: boolean;
  movable?: boolean;
  /** Omit from column chooser/panel; filtering remains independently available. */
  columnsPanel?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  /** Synchronous row policy. Exceptions and non-boolean results deny editing. */
  editable?: boolean | ((row: T) => boolean);
  type?: "text" | "number" | "boolean" | "date" | "bigint";
  valueGetter?: (row: T) => unknown;
  /** Stable grouping identity, independent of the original display/filter/edit value. */
  groupKeyGetter?: (value: unknown, row: T) => string;
  /** Generated group values have hierarchy metadata, not a fabricated source row. */
  groupValueGetter?: (node: GridHierarchyNode<T>) => unknown;
  /** Column/advanced filters and set choices use this value; display, export and aggregates retain valueGetter. */
  filterValueGetter?: (row: T) => unknown;
  filterValueFormatter?: (value: unknown, row: T) => string;
  valueCache?: boolean;
  colSpan?: number | ((row: T) => number);
  spanRows?: boolean | ((previous: T, next: T) => boolean);
  wrapText?: boolean;
  autoHeight?: boolean;
  valueFormatter?: (value: unknown, row: T) => string;
  /** Display group/subtotal/grand-total values without changing aggregate math. */
  aggregateFormatter?: (
    value: unknown,
    context: AggregateFormatContext,
  ) => string;
  valueParser?: (value: unknown, row: T) => unknown;
  /** Synchronously return a complete row from an owned mutable draft. Requires a backing field. */
  valueSetter?: (value: unknown, row: T) => T;
  validate?: (value: unknown, row: T) => string | undefined;
  compare?: (
    a: unknown,
    b: unknown,
    context: { rowA?: T; rowB?: T; nodeA?: RowNode<T>; nodeB?: RowNode<T> },
  ) => number;
  /** Explicitly let the custom comparator order blanks; default blank-last behavior is retained otherwise. */
  compareBlankValues?: boolean;
  aggregate?: Aggregate;
  /** Allow this column in row grouping controls. Defaults to true. */
  groupable?: boolean;
}
export interface Sort {
  columnId: string;
  direction: "asc" | "desc";
}
export type ScalarFilter = {
  op:
    | "contains"
    | "notContains"
    | "equals"
    | "notEqual"
    | "startsWith"
    | "endsWith"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in"
    | "between"
    | "blank"
    | "notBlank";
  value?: unknown;
  to?: unknown;
  conditions?: never;
  filters?: never;
};
export interface CompoundFilter {
  op: "and" | "or";
  conditions: readonly ScalarFilter[];
  value?: never;
  to?: never;
  filters?: never;
}
export interface ColumnFilterSlot {
  readonly id: string;
  readonly filter?: ScalarFilter | CompoundFilter;
}
export interface MultiColumnFilter {
  op: "multi";
  readonly filters: readonly ColumnFilterSlot[];
  value?: never;
  to?: never;
  conditions?: never;
}
export type Filter = ScalarFilter | CompoundFilter | MultiColumnFilter;
export type FilterExpression =
  | { kind: "condition"; columnId: string; filter: ScalarFilter }
  | { kind: "and" | "or"; children: FilterExpression[] }
  | { kind: "not"; child: FilterExpression };
export interface GridState {
  sorting: Sort[];
  filters: Record<string, Filter>;
  quickFilter: string;
  advancedFilter?: FilterExpression | null;
  selected: RowId[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  columnVisibility: Record<string, boolean>;
  columnPinning: Record<string, Pin>;
  page: number;
  pageSize: number;
  groupBy: string[];
  expanded: string[];
  /** Totals use filtered source values and participate in ordinary row pagination. */
  groupTotalRow?: false | "top" | "bottom";
  grandTotalRow?: false | "top" | "bottom";
}
export interface RowNode<T> {
  id: string;
  kind: "row" | "group" | "total";
  total?: "group" | "grand";
  parentId?: string;
  data?: T;
  depth: number;
  label?: string;
  /** Group identity metadata; the original value is borrowed, never cloned. */
  groupColumnId?: string;
  groupValue?: unknown;
  groupKey?: unknown;
  children?: RowNode<T>[];
  aggregates?: Record<string, unknown>;
  leafCount?: number;
}
export type GridHierarchyStage = "source" | "filtered" | "sorted";
export type GridHierarchyNode<T> = Readonly<
  Omit<RowNode<T>, "children" | "aggregates">
> & {
  readonly children?: readonly GridHierarchyNode<T>[];
  readonly aggregates?: Readonly<Record<string, unknown>>;
};
export interface GridOptions<T> {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  initialState?: Partial<GridState>;
  getTreePath?: (row: T) => string[];
  historyLimit?: number;
  externalFilter?: (row: T) => boolean;
  /** Blocks user edit/history/reorder commands; host row synchronization remains available. */
  readOnly?: boolean;
  /** Submit validated edits to the host instead of changing source rows or cell history.
   * The host owns persistence, errors, ordering and acknowledgement via setRows/applyTransaction.
   * The callback must return synchronously; start asynchronous work inside it.
   */
  onEditRequest?: (request: GridEditRequest<T>) => undefined;
  valueCache?: boolean;
  valueCacheMaxEntries?: number;
}
export interface Edit<T> {
  rowId: string;
  columnId: string;
  value: unknown;
}
/** Frozen request metadata; row/value objects are borrowed application references. */
export interface GridEditRequest<T> {
  readonly id: number;
  readonly columnRevision: number;
  readonly edits: readonly Readonly<
    Edit<T> & { row: T; previousValue: unknown }
  >[];
}
export interface Transaction<T> {
  add?: T[];
  update?: T[];
  remove?: string[];
}
export type RowReorderBlockReason =
  | "sorting"
  | "filtering"
  | "grouping"
  | "tree-data"
  | "external-filter"
  | "read-only";
export type RowReorderStatus = Readonly<
  | { allowed: true }
  | { allowed: false; reason: RowReorderBlockReason; message: string }
>;
export interface GridModel<T> {
  /** Missing on older/custom models means local writes. */
  getWriteMode?(): "local" | "request";
  isReadOnly(): boolean;
  setReadOnly(value: boolean): void;
  getState(): GridState;
  setState(state: Partial<GridState>): void;
  subscribe(listener: () => void): () => void;
  getRows(): T[];
  getRow(rowId: RowId): T | undefined;
  setRows(rows: T[]): void;
  getRowReorderStatus(): RowReorderStatus;
  moveRows(
    ids: readonly RowId[],
    targetId: RowId,
    position: "before" | "after",
  ): string | undefined;
  getColumns(): Column<T>[];
  /** Owned definition copies in declaration order, without current layout overrides. */
  getColumnDefinitions(): Column<T>[];
  /** Atomic client definition replacement; preserves compatible ID-based state. */
  setColumns(columns: readonly Column<T>[]): void;
  /** Monotonic definition epoch; layout/state edits do not increment it. */
  getColumnRevision(): number;
  /** Frozen configured widths, independent of restored/manual layout state. */
  getColumnWidthDefaults(): Readonly<Record<string, number>>;
  getValue(row: T, columnId: string): unknown;
  expireValueCache(): void;
  getFilteredRows(): T[];
  /** Optional on older/custom models. Frozen forest, independent of expansion, pagination and totals. */
  getRowHierarchy?(stage?: GridHierarchyStage): readonly GridHierarchyNode<T>[];
  /** Plan source subtrees independently of collapsed/page rows; filtered defaults to true. */
  getHierarchySelectionPlan(options?: {
    filtered?: boolean;
  }): HierarchySelectionPlan;
  getRowModel(): RowNode<T>[];
  getPageRows(): RowNode<T>[];
  getPageCount(): number;
  setSort(
    columnId: string,
    direction: "asc" | "desc" | null,
    multi?: boolean,
  ): void;
  setFilter(columnId: string, filter?: Filter): void;
  setAdvancedFilter(expression: FilterExpression | null): void;
  setExternalFilter(predicate?: (row: T) => boolean): void;
  setQuickFilter(value: string): void;
  toggleSelection(id: string, multi?: boolean): void;
  selectRows(ids: string[]): void;
  resizeColumn(id: string, width: number): void;
  moveColumn(id: string, toIndex: number): void;
  pinColumn(id: string, pin: Pin): void;
  hideColumn(id: string, hidden: boolean): void;
  toggleExpanded(id: string): void;
  editCell(rowId: string, columnId: string, value: unknown): string | undefined;
  batchEdit(edits: Edit<T>[]): string | undefined;
  undo(): boolean;
  redo(): boolean;
  applyTransaction(transaction: Transaction<T>): void;
  exportCsv(options?: { allRows?: boolean; selectedOnly?: boolean }): string;
}
