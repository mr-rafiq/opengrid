import { memo } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  prepareMultiFilterDefinitions,
  sameMultiFilterSchema,
} from "./multi-filter-definitions.js";
const Component = () => null;
describe("owned multi-filter definitions", () => {
  it("owns labels/IDs without invoking or freezing borrowed components and arrays", () => {
    const component = vi.fn(() => null),
      input = [
        { id: "__proto__", label: "Conditions", component },
        { id: "constructor", label: "Values", component: memo(Component) },
      ];
    const owned = prepareMultiFilterDefinitions(input);
    input[0].label = "Changed";
    expect(owned[0].label).toBe("Conditions");
    expect(owned[0].component).toBe(component);
    expect(component).not.toHaveBeenCalled();
    expect(Object.isFrozen(owned)).toBe(true);
    expect(Object.isFrozen(owned[0])).toBe(true);
    expect(Object.isFrozen(component)).toBe(false);
    expect(Object.isFrozen(input)).toBe(false);
  });
  it("keeps schema identity through label changes while recognizing component/ID/order changes", () => {
    const original = prepareMultiFilterDefinitions([
      { id: "a", label: "A", component: Component },
      { id: "b", label: "B", component: Component },
    ]);
    expect(
      sameMultiFilterSchema(
        original,
        original.map((item) => ({ ...item, label: "Translated" })),
      ),
    ).toBe(true);
    expect(sameMultiFilterSchema(original, [...original].reverse())).toBe(
      false,
    );
    expect(
      sameMultiFilterSchema(original, [
        { ...original[0], component: () => null },
        original[1],
      ]),
    ).toBe(false);
  });
  it.each([
    [],
    new Array(1),
    Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      label: "A",
      component: Component,
    })),
    [
      { id: "x", label: "A", component: Component },
      { id: "x", label: "B", component: Component },
    ],
    [{ id: "", label: "A", component: Component }],
    [{ id: "x", label: " ", component: Component }],
    [{ id: "x", label: "A", component: "div" }],
    [{ id: "x", label: "A", component: Component, unknown: true }],
  ])("rejects malformed configuration: %j", (input) => {
    expect(() => prepareMultiFilterDefinitions(input as never)).toThrow(
      TypeError,
    );
  });
  it("does not execute configuration entry/field accessors", () => {
    const read = vi.fn(() => "A"),
      record = { id: "a", component: Component };
    Object.defineProperty(record, "label", { get: read, enumerable: true });
    expect(() => prepareMultiFilterDefinitions([record] as never)).toThrow(
      TypeError,
    );
    expect(read).not.toHaveBeenCalled();
    const array: unknown[] = [];
    Object.defineProperty(array, "0", { get: read });
    expect(() => prepareMultiFilterDefinitions(array as never)).toThrow(
      TypeError,
    );
    expect(read).not.toHaveBeenCalled();
  });
});
