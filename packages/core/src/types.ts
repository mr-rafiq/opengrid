export type RowId = string;
export type Pin = "left" | "right" | null;
export type Aggregate =
  "sum" | "avg" | "min" | "max" | "count" | ((values: unknown[]) => unknown);
export interface Column<T> {
  id: string;
  field?: keyof T & string;
  header?: string;
  groupPath?: readonly string[];
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  hidden?: boolean;
  pinned?: Pin;
  sortable?: boolean;
  filterable?: boolean;
  editable?: boolean;
  type?: "text" | "number" | "boolean" | "date" | "bigint";
  valueGetter?: (row: T) => unknown;
  valueFormatter?: (value: unknown, row: T) => string;
  valueParser?: (value: unknown, row: T) => unknown;
  validate?: (value: unknown, row: T) => string | undefined;
  compare?: (a: unknown, b: unknown) => number;
  aggregate?: Aggregate;
}
export interface Sort {
  columnId: string;
  direction: "asc" | "desc";
}
export type Filter = {
  op:
    | "contains"
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
};
export type FilterExpression =
  | { kind: "condition"; columnId: string; filter: Filter }
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
}
export interface RowNode<T> {
  id: string;
  kind: "row" | "group";
  data?: T;
  depth: number;
  label?: string;
  children?: RowNode<T>[];
  aggregates?: Record<string, unknown>;
  leafCount?: number;
}
export interface GridOptions<T> {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  initialState?: Partial<GridState>;
  getTreePath?: (row: T) => string[];
  historyLimit?: number;
  externalFilter?: (row: T) => boolean;
  valueCache?: boolean;
  valueCacheMaxEntries?: number;
}
export interface Edit<T> {
  rowId: string;
  columnId: string;
  value: unknown;
}
export interface Transaction<T> {
  add?: T[];
  update?: T[];
  remove?: string[];
}
export interface GridModel<T> {
  getState(): GridState;
  setState(state: Partial<GridState>): void;
  subscribe(listener: () => void): () => void;
  getRows(): T[];
  getRow(rowId: RowId): T | undefined;
  setRows(rows: T[]): void;
  getColumns(): Column<T>[];
  getValue(row: T, columnId: string): unknown;
  expireValueCache(): void;
  getFilteredRows(): T[];
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
