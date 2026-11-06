import {
  normalizeAg31CustomFilterModel,
  type Ag31CustomFilterValue,
} from "./ag31-custom-filter-model.js";
import type { Ag31ColumnFilterModel } from "./ag31-filter-models.js";
import type { Ag31LeafColumn } from "./ag31-leaf-columns.js";
import { isAg31CustomFilter } from "./ag31-custom-filters.js";
export type Ag31SourceFilterValue =
  Ag31ColumnFilterModel | Ag31CustomFilterValue;
export type Ag31SourceFilterModel = Record<string, Ag31SourceFilterValue>;
/** Validate the entire opaque input before requesting React components. */
export function partitionAg31FilterModel<T>(
  input: unknown,
  column: (key: unknown) => Ag31LeafColumn<T> | null,
) {
  const provided: Record<string, unknown> = {},
    custom = new Map<string, Ag31CustomFilterValue>();
  if (input == null) return { provided, custom };
  if (
    typeof input !== "object" ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Reflect.ownKeys(input).length > 1000
  )
    throw new TypeError(
      "Source filter models require a bounded plain column record",
    );
  const budget = { nodes: 50_000, characters: 4_000_000 };
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !key || key.length > 4096)
      throw new TypeError("Source filter column IDs must be bounded text");
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!("value" in descriptor))
      throw new TypeError("Source filter model accessors are unsupported");
    const owner = column(key),
      definition = owner?.getColDef();
    if (!owner || !definition?.filter || descriptor.value == null) continue;
    if (isAg31CustomFilter(definition.filter)) {
      budget.characters -= key.length;
      custom.set(
        owner.colId,
        normalizeAg31CustomFilterModel(descriptor.value, budget),
      );
    } else
      Object.defineProperty(provided, owner.colId, {
        value: descriptor.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return { provided, custom };
}
