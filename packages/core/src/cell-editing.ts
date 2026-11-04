import type { Column } from "./types.js";

/** Shared write eligibility for cells, range operations and row-edit sessions. */
export function isCellEditable<T>(
  column: Column<T> | undefined,
  row: T | undefined,
): column is Column<T> & { field: keyof T & string };
export function isCellEditable<T>(
  column: Column<T> | undefined,
  row: T | undefined,
  options: { writeMode?: "local" | "request" },
): boolean;
export function isCellEditable<T>(
  column: Column<T> | undefined,
  row: T | undefined,
  options: { writeMode?: "local" | "request" } = {},
): boolean {
  if (
    !column ||
    row == null ||
    (options.writeMode !== "request" &&
      (!column.field || (column.valueGetter && !column.valueSetter)))
  )
    return false;
  try {
    return typeof column.editable === "function"
      ? column.editable(row) === true
      : column.editable === true;
  } catch {
    return false;
  }
}
