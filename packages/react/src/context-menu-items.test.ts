import { describe, expect, it, vi } from "vitest";
import { gridMessage } from "./locale.js";
import {
  prepareContextMenuItems,
  CONTEXT_MENU_LIMITS,
  type GridContextMenuItem,
} from "./context-menu-items.js";
const action = () => ({
  kind: "action" as const,
  id: "copy",
  label: "Copy cell",
  action: vi.fn(),
});
describe("context menu metadata ownership", () => {
  it("copies and freezes metadata without invoking or freezing borrowed callbacks", () => {
    const input = action(),
      separator = { kind: "separator" as const, id: "separator" },
      items = [input, separator],
      result = prepareContextMenuItems(items);
    input.label = "Changed";
    items.pop();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ label: "Copy cell" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.action)).toBe(false);
    expect(input.action).not.toHaveBeenCalled();
  });
  it("owns language-independent descriptors and retains checkable/disabled metadata", () => {
    const params = { column: "Amount" },
      message = { key: "multiFilter.title" as const, params };
    const result = prepareContextMenuItems([
      {
        ...action(),
        label: message,
        disabled: true,
        checked: false,
        shortcut: "Shift+F10",
      },
    ]);
    params.column = "Changed";
    expect(result[0]).toMatchObject({
      label: gridMessage("multiFilter.title", { column: "Amount" }),
      disabled: true,
      checked: false,
      shortcut: "Shift+F10",
    });
    expect(Object.isFrozen((result[0] as { label: object }).label)).toBe(true);
  });
  it("permits empty lists and exact special IDs while rejecting duplicate IDs", () => {
    expect(prepareContextMenuItems([])).toEqual([]);
    expect(
      prepareContextMenuItems([
        { ...action(), id: "__proto__" },
        { ...action(), id: "constructor" },
      ]),
    ).toHaveLength(2);
    expect(() => prepareContextMenuItems([action(), action()])).toThrow(
      TypeError,
    );
  });
  it.each(
    [
      null,
      {},
      new Array(1),
      Array.from({ length: 49 }, (_, i) => ({ ...action(), id: String(i) })),
      [{ ...action(), kind: "submenu" }],
      [{ ...action(), id: " " }],
      [{ ...action(), id: "x".repeat(129) }],
      [{ ...action(), label: "" }],
      [{ ...action(), label: "x".repeat(1025) }],
      [{ ...action(), disabled: "yes" }],
      [{ ...action(), checked: undefined }],
      [{ ...action(), shortcut: "x".repeat(129) }],
      [{ ...action(), action: undefined }],
      [{ kind: "separator", id: "s", label: "Ignored" }],
      [{ ...action(), label: { key: "unknown" } }],
      [
        {
          ...action(),
          label: { key: "common.cancel", params: { unknown: "x" } },
        },
      ],
    ].map((candidate) => [candidate]),
  )(
    "rejects malformed, unsupported or over-budget metadata %#",
    (candidate) => {
      expect(() =>
        prepareContextMenuItems(
          candidate as unknown as GridContextMenuItem<unknown>[],
        ),
      ).toThrow(TypeError);
    },
  );
  it("rejects all metadata accessors before reading them", () => {
    const getter = vi.fn(() => "Copy"),
      item = { ...action() };
    Object.defineProperty(item, "label", { get: getter, enumerable: true });
    expect(() => prepareContextMenuItems([item])).toThrow(TypeError);
    const values = [action()];
    Object.defineProperty(values, "0", { get: getter });
    expect(() => prepareContextMenuItems(values)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects unknown/symbol properties and nonordinary array/record prototypes", () => {
    const unknown = { ...action(), extra: true },
      symbol = { ...action(), [Symbol("hidden")]: true };
    for (const candidate of [
      [unknown],
      [symbol],
      [Object.assign(Object.create({}), action())],
      Object.setPrototypeOf([action()], null),
    ])
      expect(() =>
        prepareContextMenuItems(candidate as GridContextMenuItem<unknown>[]),
      ).toThrow(TypeError);
    expect(Object.isFrozen(CONTEXT_MENU_LIMITS)).toBe(true);
  });
});
