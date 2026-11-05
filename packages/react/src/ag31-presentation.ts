import type { CSSProperties } from "react";
import type { createAg31ClientController } from "./ag31-client-controller.js";
import type { Ag31RowNode } from "./ag31-row-nodes.js";
import type { Ag31ValueParams } from "./ag31-value-columns.js";

export interface Ag31RowStyleParams<T> {
  api: object;
  columnApi: object;
  context: unknown;
  node: Ag31RowNode<T>;
  data: T | undefined;
  rowIndex: number | null;
}
export type Ag31RowStyleCallback<T> = (
  params: Ag31RowStyleParams<T>,
) => CSSProperties | null | undefined;

function style(value: unknown): CSSProperties | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Source styles must be property records");
  const copy: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!descriptor.enumerable) continue;
    if (!("value" in descriptor))
      throw new TypeError("Source styles cannot contain accessors");
    Object.defineProperty(copy, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy as CSSProperties;
}

function classNames(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((name) => typeof name === "string"))
    return value.join(" ");
  throw new TypeError("Source cell classes must be strings or string arrays");
}

/** Source presentation reads owned nodes/columns and current context; it never changes source data. */
export function createAg31Presentation<T>(
  owner: ReturnType<typeof createAg31ClientController<T>>,
) {
  const common = () => ({
    api: owner.api,
    columnApi: owner.columnApi,
    context: owner.api.getGridOption("context"),
  });
  function definition(id: string) {
    const column = owner.columns.getColumn(id);
    if (!column)
      throw new TypeError("Source decoration requires an owned column");
    return column.getColDef();
  }
  function cellParams(
    node: Ag31RowNode<T>,
    id: string,
  ): Ag31ValueParams<T> & { valueFormatted: unknown; rowIndex: number | null } {
    const column = owner.columns.getColumn(id);
    if (!column)
      throw new TypeError("Source decoration requires an owned column");
    return {
      ...common(),
      column,
      colDef: column.getColDef(),
      node,
      data: node.data,
      value: owner.schema.read(node, column),
      valueFormatted: owner.schema.getValueFormatted(node, column),
      rowIndex: node.rowIndex,
      getValue: (key) => owner.api.getValue(key, node),
    };
  }
  return {
    rowStyle(node: Ag31RowNode<T>) {
      const callback = owner.api.getGridOption("getRowStyle") as
        Ag31RowStyleCallback<T> | undefined;
      return style(
        callback?.({
          ...common(),
          node,
          data: node.data,
          rowIndex: node.rowIndex,
        }),
      );
    },
    cellStyle(node: Ag31RowNode<T>, id: string) {
      const input = definition(id).cellStyle;
      return style(
        typeof input === "function" ? input(cellParams(node, id)) : input,
      );
    },
    cellClass(node: Ag31RowNode<T>, id: string) {
      const record = definition(id);
      if (
        record.cellClassRules != null &&
        (typeof record.cellClassRules !== "object" ||
          Array.isArray(record.cellClassRules))
      )
        throw new TypeError(
          "Source cell class rules require a callback record",
        );
      const rules = Object.entries(record.cellClassRules ?? {}).map(
        ([name, rule]) => {
          if (typeof rule !== "function")
            throw new TypeError(
              "Source class expressions require a separate expression adapter",
            );
          return [name, rule] as const;
        },
      );
      const params =
        typeof record.cellClass === "function" || rules.length
          ? cellParams(node, id)
          : undefined;
      const names = [
        classNames(
          typeof record.cellClass === "function"
            ? record.cellClass(params)
            : record.cellClass,
        ),
      ];
      for (const [name, rule] of rules) if (rule(params)) names.push(name);
      return names.filter(Boolean).join(" ");
    },
    tooltip(node: Ag31RowNode<T>, id: string) {
      const record = definition(id);
      let value: unknown;
      if (record.tooltipValueGetter != null) {
        if (typeof record.tooltipValueGetter !== "function")
          throw new TypeError("Source tooltipValueGetter must be a function");
        value = record.tooltipValueGetter(cellParams(node, id));
      } else if (record.tooltipField != null) {
        if (
          typeof record.tooltipField !== "string" ||
          !record.tooltipField ||
          record.tooltipField.length > 4096
        )
          throw new TypeError(
            "Source tooltipField requires a bounded field path",
          );
        value = node.data;
        for (const part of record.tooltipField.split("."))
          value =
            value == null
              ? undefined
              : (value as Record<string, unknown>)[part];
      }
      return value == null ? "" : String(value);
    },
  };
}
