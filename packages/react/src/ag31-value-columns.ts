import type { Column, GridHierarchyNode, GridModel } from "@opengrid/core";
import {
  createAg31LeafColumns,
  type Ag31ColumnCellParams,
  type Ag31ColumnDefinition,
} from "./ag31-leaf-columns.js";
import type { createAg31RowNodes, Ag31RowNode } from "./ag31-row-nodes.js";

export interface Ag31ValueParams<T> extends Ag31ColumnCellParams<T> {
  value?: unknown;
  getValue(columnKey: unknown): unknown;
}
export interface Ag31GetCellValueParams<T> {
  rowNode: Ag31RowNode<T>;
  colKey: unknown;
  useFormatter?: boolean;
}
interface ValueColumnOptions<T> {
  definitions: readonly Ag31ColumnDefinition<T>[];
  defaultColDef?: Ag31ColumnDefinition<T>;
  getRowId(row: T): string;
  commonParams(): { api: object; columnApi?: object; context?: unknown };
  suppressFieldDotNotation?: boolean;
}
type RowStore<T> = ReturnType<typeof createAg31RowNodes<T>>;
type ColumnStore<T> = ReturnType<typeof createAg31LeafColumns<T>>;
type Binding<T> = {
  model: GridModel<T>;
  nodes: RowStore<T>;
  columns: ColumnStore<T>;
};

/** Measured legacy scalar ordering: nullish first ascending, ordinary JS scalar comparisons, case-sensitive text. */
function scalarCompare(a: unknown, b: unknown): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1;
  // Assertions do not coerce source values; JS relational comparison also retains
  // the measured mixed numeric/text behavior instead of normalizing all text.
  return (a as string) > (b as string)
    ? 1
    : (a as string) < (b as string)
      ? -1
      : 0;
}

/** Internal data-column compiler; it does not compile AG components, filters or menus. */
export function createAg31ValueColumns<T>(options: ValueColumnOptions<T>) {
  let binding: Binding<T> | undefined;
  let destroyed = false;
  const flat: Ag31ColumnDefinition<T>[] = [];
  const definitions = new Map<string, Ag31ColumnDefinition<T>>();
  const nativeColumns: Column<T>[] = [];
  const stack: { node: Ag31RowNode<T>; id: string }[] = [];
  const definitionStack = new Set<Ag31ColumnDefinition<T>>();
  function merged(provided: Ag31ColumnDefinition<T>) {
    const result: Ag31ColumnDefinition<T> = {};
    for (const source of [options.defaultColDef ?? {}, provided])
      for (const [key, value] of Object.entries(source))
        if (value !== undefined)
          Object.defineProperty(result, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
    return result;
  }
  function runtime() {
    if (
      destroyed ||
      !binding ||
      binding.nodes.isDestroyed() ||
      binding.columns.isDestroyed()
    )
      throw new Error(
        "A live row/column binding is required for source callbacks",
      );
    return binding;
  }
  function leaf(row: T) {
    const node = runtime().nodes.getRowNode(options.getRowId(row));
    if (!node || node.data !== row)
      throw new Error(
        "The callback row is not the bound resident source object",
      );
    return node;
  }
  function owns(node: Ag31RowNode<T>) {
    return runtime().nodes.getRowNode(node.id) === node;
  }
  function currentDefinition(id: string) {
    return runtime().columns.getColumn(id)!.getColDef();
  }
  function params(
    node: Ag31RowNode<T>,
    id: string,
    value?: unknown,
  ): Ag31ValueParams<T> {
    const column = runtime().columns.getColumn(id);
    if (!column || !owns(node))
      throw new Error("An owned source node and column are required");
    return {
      ...options.commonParams(),
      column,
      colDef: column.getColDef(),
      node,
      data: node.data,
      value,
      getValue: (key) => read(node, key),
    };
  }
  function callback(definition: Ag31ColumnDefinition<T>, key: string) {
    const value = definition[key];
    if (value == null) return undefined;
    if (typeof value !== "function")
      throw new TypeError(
        `${key} expressions are not supported by the callback compiler`,
      );
    return value as (params: Ag31ValueParams<T>) => unknown;
  }
  function fieldValue(data: T | undefined, field: unknown) {
    if (typeof field !== "string" || data == null) return undefined;
    const path = options.suppressFieldDotNotation ? [field] : field.split(".");
    if (
      path.length > 32 ||
      path.some((key) =>
        ["__proto__", "prototype", "constructor"].includes(key),
      )
    )
      throw new TypeError(
        "The field path is outside the supported source-data boundary",
      );
    let value: unknown = data;
    for (const key of path) {
      if (value == null) return undefined;
      value = (Object(value) as Record<string, unknown>)[key];
    }
    return value;
  }
  function read(node: Ag31RowNode<T>, key: unknown): unknown {
    const column = runtime().columns.getColumn(key);
    if (!column || !owns(node)) return undefined;
    const id = column.colId;
    if (
      stack.length >= 64 ||
      stack.some((item) => item.node === node && item.id === id)
    )
      throw new Error(
        "A recursive source value getter exceeded its evaluation boundary",
      );
    stack.push({ node, id });
    try {
      // Measured in the installed runtime: generated display data wins over a value getter.
      if (node.group && node.groupData && Object.hasOwn(node.groupData, id))
        return node.groupData[id];
      if (node.aggData && Object.hasOwn(node.aggData, id))
        return node.aggData[id];
      const definition = column.getColDef(),
        getter = callback(definition, "valueGetter");
      return getter
        ? getter(params(node, id))
        : fieldValue(node.data, definition.field);
    } finally {
      stack.pop();
    }
  }
  function valueFormatted(node: Ag31RowNode<T>, id: string, value: unknown) {
    const formatter = callback(currentDefinition(id), "valueFormatter");
    return formatter
      ? formatter(params(node, id, value))
      : Array.isArray(value)
        ? value.join(", ")
        : null;
  }
  function formattedCellValue(
    node: Ag31RowNode<T>,
    id: string,
    value: unknown,
  ) {
    return (
      valueFormatted(node, id, value) ?? (value == null ? null : String(value))
    );
  }
  function format(node: Ag31RowNode<T>, id: string, value: unknown) {
    const output = formattedCellValue(node, id, value);
    return output == null ? "" : String(output);
  }
  function groupNode(node: GridHierarchyNode<T>) {
    const result = runtime().nodes.getRowNodeByNativeId(node.id);
    if (!result?.group)
      throw new Error("The generated source group is not bound");
    return result;
  }
  function visit(
    input: readonly Ag31ColumnDefinition<T>[],
    path: readonly string[],
    depth: number,
  ) {
    if (depth > 32)
      throw new RangeError("Column header nesting exceeds 32 levels");
    for (const provided of input) {
      if (
        !provided ||
        typeof provided !== "object" ||
        definitionStack.has(provided)
      )
        throw new TypeError(
          "Column definitions must be an acyclic object tree",
        );
      definitionStack.add(provided);
      try {
        if (provided.children !== undefined) {
          if (!Array.isArray(provided.children))
            throw new TypeError("Header children must be an array");
          const caption = provided.headerName ?? provided.colId ?? "";
          visit(provided.children, [...path, caption], depth + 1);
          continue;
        }
        if (flat.length >= 1000)
          throw new RangeError(
            "The callback compiler supports at most 1000 leaf columns",
          );
        const definition = merged(provided),
          id = definition.colId ?? definition.field;
        if (
          typeof id !== "string" ||
          !id ||
          id.length > 4096 ||
          definitions.has(id)
        )
          throw new TypeError(
            "Explicit unique bounded column IDs or fields are required",
          );
        for (const key of [
          "valueGetter",
          "valueFormatter",
          "filterValueGetter",
          "keyCreator",
        ])
          callback(definition, key);
        if (
          definition.comparator != null &&
          typeof definition.comparator !== "function"
        )
          throw new TypeError("The source comparator must be a function");
        if (definition.aggFunc != null)
          throw new TypeError(
            "Aggregate callback compilation is a separate contract",
          );
        definitions.set(id, definition);
        flat.push(provided);
        const number = (key: string) =>
          typeof definition[key] === "number"
            ? (definition[key] as number)
            : undefined;
        const column: Column<T> = {
          id,
          header: definition.headerName ?? definition.field ?? id,
          groupPath: path,
          width: number("width") ?? number("initialWidth") ?? 200,
          minWidth: number("minWidth"),
          maxWidth: number("maxWidth"),
          flex: number("flex"),
          hidden:
            definition.hide === true ||
            (definition.hide == null && definition.initialHide === true),
          pinned:
            definition.pinned === true
              ? "left"
              : definition.pinned === "left" || definition.pinned === "right"
                ? definition.pinned
                : null,
          lockPosition:
            definition.lockPosition === true
              ? "left"
              : definition.lockPosition === "left" ||
                  definition.lockPosition === "right"
                ? definition.lockPosition
                : undefined,
          lockVisible: definition.lockVisible === true,
          lockPinned: definition.lockPinned === true,
          movable: definition.suppressMovable !== true,
          columnsPanel: definition.suppressColumnsToolPanel !== true,
          groupable: definition.enableRowGroup === true,
          groupBlanksLast: true,
          sortable: definition.sortable !== false,
          filterable: definition.filter != null && definition.filter !== false,
          type:
            definition.cellDataType === "number"
              ? "number"
              : definition.cellDataType === "boolean"
                ? "boolean"
                : "text",
          editable: (row) =>
            runtime().columns.getColumn(id)!.isCellEditable(leaf(row)),
          valueGetter: (row) => read(leaf(row), id),
          valueFormatter: (value, row) => format(leaf(row), id, value),
          groupValueGetter: (node) => read(groupNode(node), id),
          aggregateFormatter: (value, context) => {
            const node = runtime().nodes.getRowNodeByNativeId(context.rowId);
            if (!node?.group)
              throw new Error(
                "Only bound source groups have a source formatter",
              );
            return format(node, id, value);
          },
          groupKeyGetter: (value, row) => {
            const creator = callback(currentDefinition(id), "keyCreator");
            const key = creator ? creator(params(leaf(row), id, value)) : value;
            return key == null ? "" : String(key);
          },
        };
        if (definition.filterValueGetter != null)
          column.filterValueGetter = (row) =>
            callback(currentDefinition(id), "filterValueGetter")!(
              params(leaf(row), id),
            );
        if (typeof definition.comparator === "function") {
          column.compareBlankValues = true;
          column.compare = (a, b, context) => {
            const store = runtime(),
              nodeA = context.rowA
                ? leaf(context.rowA)
                : context.nodeA &&
                  store.nodes.getRowNodeByNativeId(context.nodeA.id),
              nodeB = context.rowB
                ? leaf(context.rowB)
                : context.nodeB &&
                  store.nodes.getRowNodeByNativeId(context.nodeB.id);
            if (!nodeA || !nodeB)
              throw new Error("The source comparator requires both real nodes");
            const compare = currentDefinition(id).comparator as (
              a: unknown,
              b: unknown,
              aNode: Ag31RowNode<T>,
              bNode: Ag31RowNode<T>,
              descending: boolean,
            ) => number;
            // Custom display columns sort generated groups through the aggregate
            // slot, not through groupData or the display value getter.
            const customGroupDisplay =
              currentDefinition(id).showRowGroup === true ||
              typeof currentDefinition(id).showRowGroup === "string";
            return compare(
              nodeA.group && customGroupDisplay ? nodeA.aggData?.[id] : a,
              nodeB.group && customGroupDisplay ? nodeB.aggData?.[id] : b,
              nodeA,
              nodeB,
              store.model
                .getState()
                .sorting.find((sort) => sort.columnId === id)?.direction ===
                "desc",
            );
          };
        } else {
          column.compareBlankValues = true;
          column.compare = (a, b, context) => {
            const display = currentDefinition(id).showRowGroup;
            if (display === true || typeof display === "string") {
              const nodes = runtime().nodes;
              if (context.nodeA)
                a = nodes.getRowNodeByNativeId(context.nodeA.id)?.aggData?.[id];
              if (context.nodeB)
                b = nodes.getRowNodeByNativeId(context.nodeB.id)?.aggData?.[id];
            }
            return scalarCompare(a, b);
          };
        }
        nativeColumns.push(column);
      } finally {
        definitionStack.delete(provided);
      }
    }
  }
  visit(options.definitions, [], 0);
  return Object.freeze({
    columns: nativeColumns,
    leafDefinitions: flat,
    bind(next: Binding<T>) {
      if (destroyed || binding)
        throw new Error("A source value compiler can only be bound once");
      const actual = next.columns.getColumns();
      if (
        actual.length !== nativeColumns.length ||
        actual.some((column, index) => column.colId !== nativeColumns[index].id)
      )
        throw new Error(
          "The source column binding does not match the compiled schema",
        );
      binding = next;
    },
    groupIdentity(node: GridHierarchyNode<T>, parent: Ag31RowNode<T>) {
      const field = node.groupColumnId,
        key = String(node.groupKey ?? node.groupValue ?? "");
      const groupData: Record<string, unknown> = {};
      for (const [id, definition] of definitions)
        if (
          definition.showRowGroup === true ||
          definition.showRowGroup === field
        )
          Object.defineProperty(groupData, id, {
            value: node.groupValue,
            enumerable: true,
            writable: true,
            configurable: true,
          });
      return {
        id: `${parent.id === "ROOT_NODE_ID" ? "row-group" : parent.id}-${field}-${key}`,
        key,
        field,
        groupData,
      };
    },
    read,
    getCellValue: ({
      rowNode,
      colKey,
      useFormatter = false,
    }: Ag31GetCellValueParams<T>) => {
      const column = runtime().columns.getColumn(colKey);
      if (!column || !owns(rowNode)) return null;
      const value = read(rowNode, column);
      return useFormatter
        ? formattedCellValue(rowNode, column.colId, value)
        : value;
    },
    getValueFormatted: (node: Ag31RowNode<T>, key: unknown) => {
      const column = runtime().columns.getColumn(key);
      return column && owns(node)
        ? valueFormatted(node, column.colId, read(node, column))
        : null;
    },
    format: (node: Ag31RowNode<T>, key: unknown) => {
      const column = runtime().columns.getColumn(key);
      return column && owns(node)
        ? format(node, column.colId, read(node, column))
        : undefined;
    },
    destroy() {
      destroyed = true;
      binding = undefined;
      stack.length = 0;
    },
  });
}
