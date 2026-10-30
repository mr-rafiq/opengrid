import type { Column, Edit, GridOptions, GridState } from "./types.js";

/** Package-internal factory seam; deliberately absent from the public barrel/options. */
export interface GridExtensionContext<T> {
  getRawValue(row: T, columnId: string): unknown;
  getRows(): readonly T[];
  getRow(rowId: string): T | undefined;
  getState(): GridState;
}
export interface GridExtension<T> {
  initialize(context: GridExtensionContext<T>): void;
  resolveValue(row: T, column: Column<T>, raw: () => unknown): unknown;
  beforeColumns?(columns: readonly Column<T>[]): string | undefined;
  beforeBatch?(edits: readonly Edit<T>[]): string | undefined;
  validateBatch?(
    rows: readonly T[],
    edits: readonly Edit<T>[],
  ): string | undefined;
  equalValue?(
    columnId: string,
    left: unknown,
    right: unknown,
  ): boolean | undefined;
  validateRows?(rows: readonly T[]): readonly T[];
}
const extensions = new WeakMap<object, unknown>();
export function attachGridExtension<T>(
  options: GridOptions<T>,
  extension: GridExtension<T>,
): void {
  extensions.set(options, extension);
}
export function takeGridExtension<T>(
  options: GridOptions<T>,
): GridExtension<T> | undefined {
  const extension = extensions.get(options) as GridExtension<T> | undefined;
  extensions.delete(options);
  return extension;
}
