export * from "./types.js";
export * from "./analytics.js";
export * from "./datasource.js";
export * from "./formulas.js";
export * from "./ranges.js";
export * from "./server-side.js";
export * from "./viewport.js";
export * from "./formula-engine.js";
export * from "./find.js";
export * from "./notes.js";
export * from "./row-edit.js";
export * from "./advanced-filters.js";
export * from "./value-transforms.js";
export * from "./aligned-columns.js";
export * from "./calculated-grid.js";
import { aggregateValues } from "./analytics.js";
import { planRowMove, replayRowMove } from "./row-order.js";
import type { RowMoveDelta } from "./row-order.js";
import {
  prepareAdvancedFilter,
  evaluateFilterExpression,
} from "./advanced-filters.js";
import type {
  Column,
  Edit,
  Filter,
  GridModel,
  GridOptions,
  GridState,
  RowNode,
  RowReorderStatus,
  Transaction,
} from "./types.js";

const blank = (value: unknown) =>
  value === null || value === undefined || value === "";
const text = (value: unknown) =>
  value == null ? "" : String(value).toLocaleLowerCase();
const own = <V>(record: Record<string, V>, key: string): V | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

function comparable(value: unknown, type?: Column<unknown>["type"]): unknown {
  if (blank(value)) return null;
  if (type === "bigint") {
    try {
      return BigInt(String(value));
    } catch {
      return null;
    }
  }
  if (type === "number") {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  if (type === "date") {
    const result =
      value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isFinite(result) ? result : null;
  }
  if (type === "boolean")
    return value === true || value === "true" || value === 1;
  return typeof value === "string" ? text(value) : value;
}

export function matchesFilter<T>(
  value: unknown,
  filter: Filter,
  column?: Column<T>,
): boolean {
  if (filter.op === "blank") return blank(value);
  if (filter.op === "notBlank") return !blank(value);
  if (filter.op === "contains") return text(value).includes(text(filter.value));
  if (filter.op === "startsWith")
    return text(value).startsWith(text(filter.value));
  if (filter.op === "endsWith") return text(value).endsWith(text(filter.value));
  const left = comparable(value, column?.type);
  const right = comparable(filter.value, column?.type);
  if (filter.op === "in")
    return (
      Array.isArray(filter.value) &&
      filter.value.some((item) =>
        Object.is(left, comparable(item, column?.type)),
      )
    );
  if (filter.op === "equals") return Object.is(left, right);
  if (filter.op === "notEqual") return !Object.is(left, right);
  if (left == null || right == null) return false;
  const a = left as string | number | bigint;
  const b = right as string | number | bigint;
  if (filter.op === "gt") return a > b;
  if (filter.op === "gte") return a >= b;
  if (filter.op === "lt") return a < b;
  if (filter.op === "lte") return a <= b;
  const end = comparable(filter.to, column?.type) as
    string | number | bigint | null;
  return filter.op === "between" && end != null && a >= b && a <= end;
}

/** RFC 4180 quoting with spreadsheet formula neutralisation enabled unconditionally. */
export function csvCell(value: unknown): string {
  let output = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(output) || /^[\t\r\n]/u.test(output))
    output = "'" + output;
  return '"' + output.replaceAll('"', '""') + '"';
}

export function createGrid<T>(options: GridOptions<T>): GridModel<T> {
  const columns = options.columns.map((column) => {
    if (
      column.valueCache !== undefined &&
      typeof column.valueCache !== "boolean"
    )
      throw new TypeError("Column valueCache must be a boolean");
    if (
      column.groupPath !== undefined &&
      (!Array.isArray(column.groupPath) ||
        Array.from(column.groupPath).some((part) => typeof part !== "string"))
    )
      throw new TypeError("Column groupPath must be an array of strings");
    return {
      ...column,
      ...(column.groupPath === undefined
        ? {}
        : { groupPath: Object.freeze([...column.groupPath]) }),
    };
  });
  const cacheEnabled =
    options.valueCache === undefined ? false : options.valueCache;
  if (typeof cacheEnabled !== "boolean")
    throw new TypeError("valueCache must be a boolean");
  const cacheMaximum =
    options.valueCacheMaxEntries === undefined
      ? 100000
      : options.valueCacheMaxEntries;
  if (
    !Number.isSafeInteger(cacheMaximum) ||
    cacheMaximum < 1 ||
    cacheMaximum > 1000000
  )
    throw new RangeError(
      "valueCacheMaxEntries must be a positive safe integer no greater than 1000000",
    );
  const byColumn = new Map(columns.map((column) => [column.id, column]));
  let externalFilter = options.externalFilter;
  if (externalFilter !== undefined && typeof externalFilter !== "function")
    throw new TypeError("externalFilter must be a function");
  if (byColumn.size !== columns.length || columns.some((column) => !column.id))
    throw new Error("Column IDs must be nonempty and unique");
  let rows = [...options.rows];
  let indexedRows: T[] | undefined;
  let rowsById: Map<string, T> | undefined;
  const idOf = options.getRowId;
  function getRow(rowId: string): T | undefined {
    if (indexedRows !== rows) {
      rowsById = new Map(rows.map((row) => [idOf(row), row]));
      indexedRows = rows;
    }
    return rowsById!.get(rowId);
  }
  const cachedValues = new Map<string, unknown>();
  let cachedRows = rows,
    cacheGeneration = 0;
  function clearValueCache() {
    cachedValues.clear();
    cachedRows = rows;
    cacheGeneration++;
  }
  function syncValueCache() {
    if (cachedRows !== rows) clearValueCache();
  }
  function assertRows(next: T[]) {
    const ids = next.map(idOf);
    if (
      ids.some((id) => typeof id !== "string" || !id) ||
      new Set(ids).size !== ids.length
    )
      throw new Error("Row IDs must be nonempty unique strings");
  }
  assertRows(rows);
  let state: GridState;
  const listeners = new Set<() => void>();
  type HistoryEntry = { kind: "snapshot"; rows: T[] } | RowMoveDelta;
  const undoStack: HistoryEntry[] = [],
    redoStack: HistoryEntry[] = [];
  function recordHistory(entry: HistoryEntry) {
    undoStack.push(entry);
    if (undoStack.length > (options.historyLimit ?? 100)) undoStack.shift();
    redoStack.length = 0;
  }
  const objectKeys = new Map<unknown, number>();
  let rowIdCache: Set<string> | undefined;
  let filteredCache: T[] | undefined, modelCache: RowNode<T>[] | undefined;
  function freezeSnapshot(snapshot: GridState): GridState {
    for (const filter of Object.values(snapshot.filters)) {
      if (Array.isArray(filter.value)) Object.freeze(filter.value);
      Object.freeze(filter);
    }
    for (const sort of snapshot.sorting) Object.freeze(sort);
    for (const value of Object.values(snapshot))
      if (value && typeof value === "object") Object.freeze(value);
    return Object.freeze(snapshot);
  }
  function emit() {
    syncValueCache();
    filteredCache = undefined;
    modelCache = undefined;
    rowIdCache = undefined;
    state = freezeSnapshot({ ...state });
    for (const listener of [...listeners]) listener();
  }
  function requireColumn(id: string) {
    const column = byColumn.get(id);
    if (!column) throw new Error(`Unknown column: ${id}`);
    return column;
  }
  function sanitize(next: GridState): GridState {
    if (!Number.isFinite(next.pageSize) || next.pageSize < 1)
      throw new RangeError("pageSize must be positive");
    const order = [
      ...new Set(next.columnOrder.filter((id) => byColumn.has(id))),
    ];
    order.push(
      ...columns.map((column) => column.id).filter((id) => !order.includes(id)),
    );
    const ids = new Set(rows.map(idOf));
    const result: GridState = {
      ...next,
      advancedFilter:
        next.advancedFilter === undefined
          ? undefined
          : prepareAdvancedFilter(next.advancedFilter, columns),
      sorting: next.sorting
        .filter(
          (sort) =>
            byColumn.has(sort.columnId) &&
            (sort.direction === "asc" || sort.direction === "desc") &&
            requireColumn(sort.columnId).sortable !== false,
        )
        .map((sort) => ({ ...sort })),
      filters: Object.fromEntries(
        Object.entries(next.filters)
          .filter(
            ([id]) =>
              byColumn.has(id) && requireColumn(id).filterable !== false,
          )
          .map(([id, filter]) => [
            id,
            {
              ...filter,
              value: Array.isArray(filter.value)
                ? [...filter.value]
                : filter.value,
            },
          ]),
      ),
      selected: [...new Set(next.selected.filter((id) => ids.has(id)))],
      columnOrder: order,
      columnWidths: { ...next.columnWidths },
      columnVisibility: { ...next.columnVisibility },
      columnPinning: { ...next.columnPinning },
      page: Math.max(0, Math.floor(Number.isFinite(next.page) ? next.page : 0)),
      pageSize: Math.floor(next.pageSize),
      groupBy: [...new Set(next.groupBy.filter((id) => byColumn.has(id)))],
      expanded: [...new Set(next.expanded)],
    };
    for (const column of columns) {
      const width = own(result.columnWidths, column.id);
      if (width !== undefined)
        result.columnWidths[column.id] = Math.max(
          column.minWidth ?? 40,
          Math.min(
            column.maxWidth ?? Infinity,
            Number.isFinite(width) ? width : (column.width ?? 160),
          ),
        );
      const pin = own(result.columnPinning, column.id);
      if (
        pin !== undefined &&
        pin !== null &&
        pin !== "left" &&
        pin !== "right"
      )
        delete result.columnPinning[column.id];
      if (
        own(result.columnVisibility, column.id) !== undefined &&
        typeof own(result.columnVisibility, column.id) !== "boolean"
      )
        delete result.columnVisibility[column.id];
    }
    return result;
  }
  state = sanitize({
    sorting: [],
    filters: {},
    quickFilter: "",
    selected: [],
    columnOrder: columns.map((column) => column.id),
    columnWidths: {},
    columnVisibility: {},
    columnPinning: {},
    page: 0,
    pageSize: 100,
    groupBy: [],
    expanded: [],
    ...options.initialState,
  });
  const getValue = (row: T, id: string): unknown => {
    const column = requireColumn(id);
    if (!column.valueGetter)
      return column.field
        ? row[column.field]
        : (row as Record<string, unknown>)[id];
    if (!cacheEnabled || column.valueCache === false)
      return column.valueGetter(row);
    syncValueCache();
    const rowId = idOf(row);
    if (typeof rowId !== "string" || getRow(rowId) !== row)
      return column.valueGetter(row);
    const key = JSON.stringify([rowId, id]);
    if (cachedValues.has(key)) {
      const value = cachedValues.get(key);
      cachedValues.delete(key);
      cachedValues.set(key, value);
      return value;
    }
    const currentRows = rows,
      generation = cacheGeneration;
    const value = column.valueGetter(row);
    // A getter must be pure, but a reentrant mutation/expiry must still never install
    // a result computed against the previous cache generation or resident row.
    if (
      rows === currentRows &&
      generation === cacheGeneration &&
      getRow(rowId) === row
    ) {
      cachedValues.set(key, value);
      while (cachedValues.size > cacheMaximum)
        cachedValues.delete(cachedValues.keys().next().value!);
    }
    return value;
  };
  function sortedFiltered() {
    if (filteredCache) return filteredCache;
    const terms = text(state.quickFilter).trim().split(/\s+/u).filter(Boolean);
    const filtered = rows.filter((row) => {
      if (
        !Object.entries(state.filters).every(([id, filter]) =>
          matchesFilter(getValue(row, id), filter, requireColumn(id)),
        )
      )
        return false;
      if (
        !evaluateFilterExpression(state.advancedFilter, (id, filter) =>
          matchesFilter(getValue(row, id), filter, requireColumn(id)),
        )
      )
        return false;
      if (externalFilter && !externalFilter(row)) return false;
      if (!terms.length) return true;
      const haystack = columns
        .map((column) => {
          const value = getValue(row, column.id);
          return text(
            column.valueFormatter ? column.valueFormatter(value, row) : value,
          );
        })
        .join(" ");
      return terms.every((term) => haystack.includes(term));
    });
    filteredCache = filtered
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        for (const sort of state.sorting) {
          const column = requireColumn(sort.columnId),
            left = getValue(a.row, column.id),
            right = getValue(b.row, column.id);
          if (blank(left) || blank(right)) {
            if (blank(left) && blank(right)) continue;
            return blank(left) ? 1 : -1;
          }
          const x = comparable(left, column.type) as string | number | bigint,
            y = comparable(right, column.type) as string | number | bigint;
          const order = column.compare
            ? column.compare(left, right)
            : x === y
              ? 0
              : x < y
                ? -1
                : 1;
          if (order) return (sort.direction === "asc" ? 1 : -1) * order;
        }
        return a.index - b.index;
      })
      .map((item) => item.row);
    return filteredCache;
  }
  function aggregates(groupRows: T[]) {
    return Object.fromEntries(
      columns
        .filter((column) => column.aggregate)
        .map((column) => [
          column.id,
          aggregateValues(
            groupRows.map((row) => getValue(row, column.id)),
            column.aggregate!,
          ),
        ]),
    );
  }
  function syntheticId(base: string): string {
    const rowIds = (rowIdCache ??= new Set(rows.map(idOf)));
    while (rowIds.has(base)) base += ":";
    return base;
  }
  function groupKey(value: unknown): unknown[] {
    if (
      (typeof value === "object" && value !== null) ||
      typeof value === "symbol" ||
      typeof value === "function"
    ) {
      if (!objectKeys.has(value)) objectKeys.set(value, objectKeys.size);
      return [typeof value, objectKeys.get(value)];
    }
    return [typeof value, String(value)];
  }
  function group(groupRows: T[], depth: number, path: unknown[]): RowNode<T>[] {
    if (depth >= state.groupBy.length)
      return groupRows.map((row) => ({
        id: idOf(row),
        kind: "row",
        data: row,
        depth,
      }));
    const id = state.groupBy[depth];
    const groups = new Map<unknown, T[]>();
    for (const row of groupRows) {
      const value = getValue(row, id);
      const existing = groups.get(value) ?? [];
      existing.push(row);
      groups.set(value, existing);
    }
    return [...groups].map(([value, children]) => {
      const next = [...path, groupKey(value)];
      return {
        id: syntheticId(`group:${JSON.stringify(next)}`),
        kind: "group",
        depth,
        label: blank(value) ? "(blank)" : String(value),
        children: group(children, depth + 1, next),
        leafCount: children.length,
        aggregates: aggregates(children),
      };
    });
  }
  function tree(filtered: T[]): RowNode<T>[] {
    interface Branch {
      path: string[];
      children: Map<string, Branch>;
      data?: T;
      leaves: T[];
    }
    const root: Branch = { path: [], children: new Map(), leaves: [] };
    const allByPath = new Map<string, T>();
    for (const row of rows) {
      const path = options.getTreePath!(row);
      if (!path.length) throw new Error("Tree paths must not be empty");
      const key = JSON.stringify(path);
      if (allByPath.has(key)) throw new Error(`Duplicate tree path: ${key}`);
      allByPath.set(key, row);
    }
    for (const row of filtered) {
      const path = options.getTreePath!(row);
      let branch = root;
      for (let index = 0; index < path.length; index++) {
        const part = path[index];
        if (!branch.children.has(part))
          branch.children.set(part, {
            path: path.slice(0, index + 1),
            children: new Map(),
            leaves: [],
          });
        branch = branch.children.get(part)!;
        branch.leaves.push(row);
        branch.data = allByPath.get(JSON.stringify(branch.path));
      }
    }
    const visit = (branch: Branch): RowNode<T>[] =>
      [...branch.children.values()].map((child) => ({
        id: child.data
          ? idOf(child.data)
          : syntheticId(`tree:${JSON.stringify(child.path)}`),
        kind: child.data ? "row" : "group",
        data: child.data,
        label: child.path.at(-1),
        depth: child.path.length - 1,
        children: child.children.size ? visit(child) : undefined,
        aggregates: child.children.size ? aggregates(child.leaves) : undefined,
        leafCount: child.leaves.length,
      }));
    return visit(root);
  }
  function rowModel() {
    if (modelCache) return modelCache;
    const filtered = sortedFiltered();
    const nodes = options.getTreePath ? tree(filtered) : group(filtered, 0, []);
    const expanded = new Set(state.expanded),
      flat: RowNode<T>[] = [];
    const visit = (items: RowNode<T>[]) => {
      for (const item of items) {
        flat.push(item);
        if (item.children && expanded.has(item.id)) visit(item.children);
      }
    };
    visit(nodes);
    modelCache = flat;
    return flat;
  }
  function updateState(patch: Partial<GridState>) {
    const candidate = sanitize({ ...state, ...patch });
    const previousState = state,
      previousFiltered = filteredCache,
      previousModel = modelCache,
      previousIds = rowIdCache;
    state = candidate;
    filteredCache = modelCache = undefined;
    try {
      state = {
        ...state,
        page: Math.min(
          state.page,
          Math.max(0, Math.ceil(rowModel().length / state.pageSize) - 1),
        ),
      };
    } catch (failure) {
      state = previousState;
      filteredCache = previousFiltered;
      modelCache = previousModel;
      rowIdCache = previousIds;
      throw failure;
    }
  }
  function setState(patch: Partial<GridState>) {
    updateState(patch);
    emit();
  }
  function editBatch(edits: Edit<T>[]): string | undefined {
    const pending = new Map(rows.map((row) => [idOf(row), row]));
    const originals = new Map(pending);
    const validationTargets = new Map<string, Map<string, Column<T>>>();
    for (const edit of edits) {
      const column = byColumn.get(edit.columnId),
        row = pending.get(edit.rowId);
      if (!column || !row) return "Unknown row or column";
      if (!column.editable || !column.field || column.valueGetter)
        return "Cell is read only";
      let value = edit.value;
      try {
        if (column.valueParser) value = column.valueParser(value, row);
        else if (column.type === "number" && value !== "") {
          value = Number(value);
          if (!Number.isFinite(value)) return "Enter a finite number";
        } else if (column.type === "bigint" && value !== "")
          value = BigInt(String(value));
        else if (column.type === "boolean") {
          if (
            value !== true &&
            value !== false &&
            value !== "true" &&
            value !== "false"
          )
            return "Enter true or false";
          value = value === true || value === "true";
        } else if (
          column.type === "date" &&
          value !== "" &&
          !Number.isFinite(Date.parse(String(value)))
        )
          return "Enter a valid date";
        const next = { ...row, [column.field]: value };
        if (idOf(next) !== edit.rowId)
          return "Editing a row ID is not supported";
        pending.set(edit.rowId, next);
        const targets =
          validationTargets.get(edit.rowId) ?? new Map<string, Column<T>>();
        targets.set(edit.columnId, column);
        validationTargets.set(edit.rowId, targets);
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid value";
      }
    }
    if (!edits.length) return;
    for (const [rowId, targets] of validationTargets) {
      const finalRow = pending.get(rowId)!;
      try {
        for (const column of targets.values()) {
          const error = column.validate?.(finalRow[column.field!], finalRow);
          if (error) return error;
        }
        if (idOf(finalRow) !== rowId)
          return "Editing a row ID is not supported";
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid value";
      }
    }
    const changed = [...validationTargets].some(([rowId, targets]) => {
      const before = originals.get(rowId)!,
        after = pending.get(rowId)!;
      return [...targets.values()].some((column) => {
        const left = before[column.field!],
          right = after[column.field!];
        return left instanceof Date && right instanceof Date
          ? !Object.is(left.getTime(), right.getTime())
          : !Object.is(left, right);
      });
    });
    if (!changed) return;
    recordHistory({ kind: "snapshot", rows });
    rows = rows.map((row) => pending.get(idOf(row))!);
    emit();
  }
  function getColumns() {
    const ordered = state.columnOrder.map((id) => ({
      ...requireColumn(id),
      ...(requireColumn(id).groupPath === undefined
        ? {}
        : { groupPath: [...requireColumn(id).groupPath!] }),
      width: own(state.columnWidths, id) ?? requireColumn(id).width ?? 160,
      hidden:
        own(state.columnVisibility, id) === undefined
          ? requireColumn(id).hidden
          : !own(state.columnVisibility, id),
      pinned:
        own(state.columnPinning, id) === undefined
          ? requireColumn(id).pinned
          : own(state.columnPinning, id),
    }));
    return [
      ...ordered.filter((column) => column.pinned === "left"),
      ...ordered.filter((column) => !column.pinned),
      ...ordered.filter((column) => column.pinned === "right"),
    ];
  }
  function getRowReorderStatus(): RowReorderStatus {
    if (options.getTreePath)
      return Object.freeze({
        allowed: false,
        reason: "tree-data",
        message: "Row reordering is unavailable for tree data",
      });
    if (state.groupBy.length)
      return Object.freeze({
        allowed: false,
        reason: "grouping",
        message: "Clear grouping before reordering rows",
      });
    if (state.sorting.length)
      return Object.freeze({
        allowed: false,
        reason: "sorting",
        message: "Clear sorting before reordering rows",
      });
    if (
      Object.keys(state.filters).length ||
      String(state.quickFilter).trim() ||
      state.advancedFilter != null
    )
      return Object.freeze({
        allowed: false,
        reason: "filtering",
        message: "Clear filters before reordering rows",
      });
    if (externalFilter)
      return Object.freeze({
        allowed: false,
        reason: "external-filter",
        message: "Clear the external filter before reordering rows",
      });
    return Object.freeze({ allowed: true });
  }
  state = freezeSnapshot(state);
  return {
    getState: () => state,
    setState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getRows: () => [...rows],
    getRow,
    getRowReorderStatus,
    moveRows(ids, targetId, position) {
      const status = getRowReorderStatus();
      if (!status.allowed) return status.message;
      const plan = planRowMove(rows, ids, targetId, position, idOf);
      if (plan.error) return plan.error;
      if (!plan.delta) return;
      recordHistory(plan.delta);
      rows = plan.next;
      emit();
    },
    setRows(next) {
      assertRows(next);
      rows = [...next];
      undoStack.length = redoStack.length = 0;
      state = sanitize({ ...state, page: 0 });
      emit();
    },
    getColumns,
    getValue,
    expireValueCache() {
      clearValueCache();
      emit();
    },
    getFilteredRows: () => [...sortedFiltered()],
    getRowModel: () => [...rowModel()],
    getPageRows() {
      const start =
        Math.min(
          state.page,
          Math.max(0, Math.ceil(rowModel().length / state.pageSize) - 1),
        ) * state.pageSize;
      return rowModel().slice(start, start + state.pageSize);
    },
    getPageCount: () =>
      Math.max(1, Math.ceil(rowModel().length / state.pageSize)),
    setSort(columnId, direction, multi = false) {
      const column = requireColumn(columnId);
      if (column.sortable === false) return;
      setState({
        sorting: [
          ...(multi
            ? state.sorting.filter((sort) => sort.columnId !== columnId)
            : []),
          ...(direction ? [{ columnId, direction }] : []),
        ],
        page: 0,
      });
    },
    setFilter(columnId, filter) {
      const column = requireColumn(columnId);
      if (column.filterable === false) return;
      const filters = filter
        ? { ...state.filters, [columnId]: filter }
        : { ...state.filters };
      if (!filter) delete filters[columnId];
      setState({ filters, page: 0 });
    },
    setAdvancedFilter: (advancedFilter) =>
      setState({ advancedFilter, page: 0 }),
    setExternalFilter(predicate) {
      if (predicate !== undefined && typeof predicate !== "function")
        throw new TypeError("externalFilter must be a function");
      const previous = externalFilter;
      externalFilter = predicate;
      try {
        updateState({ page: 0 });
      } catch (failure) {
        externalFilter = previous;
        throw failure;
      }
      emit();
    },
    setQuickFilter: (quickFilter) => setState({ quickFilter, page: 0 }),
    toggleSelection(id, multi = false) {
      if (!rows.some((row) => idOf(row) === id)) return;
      setState({
        selected: multi
          ? state.selected.includes(id)
            ? state.selected.filter((item) => item !== id)
            : [...state.selected, id]
          : state.selected.length === 1 && state.selected[0] === id
            ? []
            : [id],
      });
    },
    selectRows: (selected) => setState({ selected }),
    resizeColumn(id, width) {
      requireColumn(id);
      setState({ columnWidths: { ...state.columnWidths, [id]: width } });
    },
    moveColumn(id, toIndex) {
      requireColumn(id);
      const order = state.columnOrder.filter((item) => item !== id);
      order.splice(
        Math.max(0, Math.min(order.length, Math.floor(toIndex))),
        0,
        id,
      );
      setState({ columnOrder: order });
    },
    pinColumn(id, pin) {
      requireColumn(id);
      setState({ columnPinning: { ...state.columnPinning, [id]: pin } });
    },
    hideColumn(id, hidden) {
      requireColumn(id);
      setState({
        columnVisibility: { ...state.columnVisibility, [id]: !hidden },
      });
    },
    toggleExpanded(id) {
      setState({
        expanded: state.expanded.includes(id)
          ? state.expanded.filter((item) => item !== id)
          : [...state.expanded, id],
      });
    },
    editCell: (rowId, columnId, value) =>
      editBatch([{ rowId, columnId, value }]),
    batchEdit: editBatch,
    undo() {
      const previous = undoStack.at(-1);
      if (!previous) return false;
      const nextRows =
        previous.kind === "snapshot"
          ? previous.rows
          : replayRowMove(rows, previous, "undo", idOf);
      undoStack.pop();
      redoStack.push(
        previous.kind === "snapshot" ? { kind: "snapshot", rows } : previous,
      );
      rows = nextRows;
      emit();
      return true;
    },
    redo() {
      const next = redoStack.at(-1);
      if (!next) return false;
      const nextRows =
        next.kind === "snapshot"
          ? next.rows
          : replayRowMove(rows, next, "redo", idOf);
      redoStack.pop();
      undoStack.push(
        next.kind === "snapshot" ? { kind: "snapshot", rows } : next,
      );
      rows = nextRows;
      emit();
      return true;
    },
    applyTransaction(transaction: Transaction<T>) {
      const removed = new Set(transaction.remove ?? []),
        updates = new Map(
          (transaction.update ?? []).map((row) => [idOf(row), row]),
        );
      if (updates.size !== (transaction.update?.length ?? 0))
        throw new Error("Duplicate transaction updates");
      const existing = new Set(rows.map(idOf));
      for (const id of updates.keys())
        if (!existing.has(id))
          throw new Error(`Cannot update missing row: ${id}`);
      const next = [
        ...rows
          .filter((row) => !removed.has(idOf(row)))
          .map((row) => updates.get(idOf(row)) ?? row),
        ...(transaction.add ?? []),
      ];
      assertRows(next);
      rows = next;
      undoStack.length = redoStack.length = 0;
      state = sanitize(state);
      emit();
    },
    exportCsv(exportOptions = {}) {
      const visibleColumns = getColumns().filter((column) => !column.hidden);
      let exportRows = exportOptions.allRows ? [...rows] : sortedFiltered();
      if (exportOptions.selectedOnly) {
        const selected = new Set(state.selected);
        exportRows = exportRows.filter((row) => selected.has(idOf(row)));
      }
      return [
        visibleColumns
          .map((column) => csvCell(column.header ?? column.id))
          .join(","),
        ...exportRows.map((row) =>
          visibleColumns
            .map((column) => {
              const value = getValue(row, column.id);
              return csvCell(
                column.valueFormatter
                  ? column.valueFormatter(value, row)
                  : value,
              );
            })
            .join(","),
        ),
      ].join("\r\n");
    },
  };
}
