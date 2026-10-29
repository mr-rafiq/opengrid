import type { ComponentType } from "react";
import { MULTI_FILTER_LIMITS } from "@opengrid/core";
import type { ColumnFilterProps } from "./filter-components.js";

export interface MultiFilterDefinition<T> {
  readonly id: string;
  readonly label: string;
  readonly component: ComponentType<ColumnFilterProps<T>>;
}
/** Own configuration metadata without invoking/fixing/freezing application components. */
export function prepareMultiFilterDefinitions<T>(
  input: readonly MultiFilterDefinition<T>[],
): readonly MultiFilterDefinition<T>[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    !input.length ||
    input.length > MULTI_FILTER_LIMITS.maxFilters
  )
    throw new TypeError(
      "MultiFilter requires one to four ordinary child definitions",
    );
  if (Reflect.ownKeys(input).length !== input.length + 1)
    throw new TypeError(
      "MultiFilter definitions require dense arrays without extra properties",
    );
  const ids = new Set<string>();
  return Object.freeze(
    Array.from({ length: input.length }, (_, index) => {
      const entry = Object.getOwnPropertyDescriptor(input, String(index));
      if (!entry || !("value" in entry))
        throw new TypeError(
          "MultiFilter definition entries cannot use accessors",
        );
      const value: unknown = entry.value;
      if (
        !value ||
        typeof value !== "object" ||
        (Object.getPrototypeOf(value) !== Object.prototype &&
          Object.getPrototypeOf(value) !== null)
      )
        throw new TypeError("MultiFilter definitions must be ordinary records");
      const keys = Reflect.ownKeys(value),
        fields = new Map<string, unknown>();
      for (const key of keys) {
        if (
          typeof key !== "string" ||
          !["id", "label", "component"].includes(key)
        )
          throw new TypeError("Unknown MultiFilter definition field");
        const field = Object.getOwnPropertyDescriptor(value, key)!;
        if (!("value" in field))
          throw new TypeError(
            "MultiFilter definition fields cannot use accessors",
          );
        fields.set(key, field.value);
      }
      const id = fields.get("id"),
        label = fields.get("label"),
        component = fields.get("component");
      if (
        typeof id !== "string" ||
        !id ||
        id.length > MULTI_FILTER_LIMITS.maxIdLength ||
        ids.has(id)
      )
        throw new TypeError(
          "MultiFilter child IDs must be unique nonempty strings of at most 128 characters",
        );
      if (typeof label !== "string" || !label.trim() || label.length > 256)
        throw new TypeError(
          "MultiFilter labels require one to 256 text characters",
        );
      if (
        typeof component !== "function" &&
        (!component || typeof component !== "object")
      )
        throw new TypeError(
          "MultiFilter children require React component types",
        );
      ids.add(id);
      return Object.freeze({
        id,
        label,
        component: component as ComponentType<ColumnFilterProps<T>>,
      });
    }),
  );
}
export function sameMultiFilterSchema<T>(
  left: readonly MultiFilterDefinition<T>[],
  right: readonly MultiFilterDefinition<T>[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (child, index) =>
        child.id === right[index].id &&
        child.component === right[index].component,
    )
  );
}
