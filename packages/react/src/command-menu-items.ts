import {
  gridMessage,
  type GridMessage,
  type GridMessageKey,
} from "./locale.js";
export interface CommandMenuAction<Context> {
  readonly kind: "action";
  readonly id: string;
  readonly label: string | GridMessage;
  readonly disabled?: boolean;
  readonly checked?: boolean | "mixed";
  readonly shortcut?: string;
  readonly action: (
    context: Context,
    signal: AbortSignal,
  ) => void | Promise<void>;
}
export interface CommandMenuSeparator {
  readonly kind: "separator";
  readonly id: string;
}
export type CommandMenuItem<Context> =
  CommandMenuAction<Context> | CommandMenuSeparator;
export const COMMAND_MENU_LIMITS = Object.freeze({
  maxItems: 48,
  maxIdLength: 128,
  maxLabelLength: 1024,
  maxShortcutLength: 128,
});
/** A translated command failure whose text is resolved in the currently active locale. */
export class GridContextMenuError extends Error {
  readonly notice: GridMessage;
  constructor(notice: GridMessage) {
    super("Context menu command failed");
    this.name = "GridContextMenuError";
    this.notice = label(notice) as GridMessage;
  }
}

function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError("Context menu metadata requires ordinary records");
  const owned: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError("Unknown context menu metadata field");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError("Context menu metadata cannot contain accessors");
    owned[key] = descriptor.value;
  }
  return owned;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new TypeError(
      "Context menu text is blank, unreadable or over budget",
    );
  return value;
}
function label(value: unknown): string | GridMessage {
  if (typeof value === "string")
    return text(value, COMMAND_MENU_LIMITS.maxLabelLength);
  const message = record(value, ["key", "params"]);
  // gridMessage validates the key/parameter schema and owns primitive parameters.
  const prepare = gridMessage as (
    key: GridMessageKey,
    params?: unknown,
  ) => GridMessage;
  return prepare(message.key as GridMessageKey, message.params);
}

/** Own bounded metadata without invoking or freezing borrowed action functions. */
export function prepareCommandMenuItems<Context>(
  input: readonly CommandMenuItem<Context>[],
): readonly CommandMenuItem<Context>[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length > COMMAND_MENU_LIMITS.maxItems ||
    Reflect.ownKeys(input).length !== input.length + 1
  )
    throw new TypeError(
      "Context menus require at most 48 dense ordinary items",
    );
  const ids = new Set<string>();
  return Object.freeze(
    Array.from({ length: input.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !("value" in descriptor))
        throw new TypeError(
          "Context menu items cannot contain holes or accessors",
        );
      const item = record(descriptor.value, [
        "kind",
        "id",
        "label",
        "disabled",
        "checked",
        "shortcut",
        "action",
      ]);
      const id = text(item.id, COMMAND_MENU_LIMITS.maxIdLength);
      if (ids.has(id))
        throw new TypeError("Context menu item IDs must be unique");
      ids.add(id);
      if (item.kind === "separator") {
        if (Object.keys(item).some((key) => key !== "kind" && key !== "id"))
          throw new TypeError("Separators cannot carry action metadata");
        return Object.freeze({ kind: "separator" as const, id });
      }
      if (item.kind !== "action" || typeof item.action !== "function")
        throw new TypeError("Context menu actions require an action function");
      for (const key of ["disabled", "checked"])
        if (Object.hasOwn(item, key) && typeof item[key] !== "boolean")
          if (key !== "checked" || item[key] !== "mixed")
            throw new TypeError(
              "Context menu state flags require booleans or a mixed check",
            );
      return Object.freeze({
        kind: "action" as const,
        id,
        label: label(item.label),
        ...(Object.hasOwn(item, "disabled")
          ? { disabled: item.disabled as boolean }
          : {}),
        ...(Object.hasOwn(item, "checked")
          ? { checked: item.checked as boolean | "mixed" }
          : {}),
        ...(Object.hasOwn(item, "shortcut")
          ? {
              shortcut: text(
                item.shortcut,
                COMMAND_MENU_LIMITS.maxShortcutLength,
              ),
            }
          : {}),
        action: item.action as CommandMenuAction<Context>["action"],
      });
    }),
  );
}
