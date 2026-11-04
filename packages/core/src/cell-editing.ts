import type { Column } from "./types.js";

/** Shared write eligibility for cells, range operations and row-edit sessions. */
export function isCellEditable<T>(
  column: Column<T> | undefined,
  row: T | undefined,
): column is Column<T> & { field: keyof T & string } {
  if (
    !column ||
    row == null ||
    !column.field ||
    (column.valueGetter && !column.valueSetter)
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
