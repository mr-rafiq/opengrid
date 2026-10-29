import { describe, expect, it, vi } from "vitest";
import { ColumnFilterValidationError, type Filter } from "@opengrid/core";
import {
  createMultiFilterDraft,
  stageMultiFilterChild,
  replaceMultiFilterDraft,
  buildMultiFilterDraft,
  isMultiFilterSourceCurrent,
  MultiFilterDraftError,
} from "./multi-filter-draft.js";
const ids = ["conditions", "values"];
describe("independent multi-filter drafts", () => {
  it("stages children independently, returns the original for no-ops and clears only on build", () => {
    const initial = createMultiFilterDraft(undefined, ids);
    expect(initial.supported).toBe(true);
    expect(initial.dirty).toBe(false);
    expect(buildMultiFilterDraft(initial)).toBeUndefined();
    expect(stageMultiFilterChild(initial, "values", undefined)).toBe(initial);
    const one = stageMultiFilterChild(initial, "conditions", {
      op: "contains",
      value: "north",
    });
    expect(one.dirty).toBe(true);
    expect(one.filters[1].filter).toBeUndefined();
    const two = stageMultiFilterChild(one, "values", {
      op: "in",
      value: ["north", "south"],
    });
    expect(buildMultiFilterDraft(two)?.filters).toEqual([
      { id: "conditions", filter: { op: "contains", value: "north" } },
      { id: "values", filter: { op: "in", value: ["north", "south"] } },
    ]);
    const cleared = replaceMultiFilterDraft(two);
    expect(buildMultiFilterDraft(cleared)).toBeUndefined();
    expect(cleared.dirty).toBe(false);
    expect(initial.filters.every((child) => child.filter === undefined)).toBe(
      true,
    );
  });
  it("orders known source slots by schema without losing IDs or child OR semantics", () => {
    const source = {
      op: "multi",
      filters: [
        { id: "values", filter: { op: "in", value: ["north"] } },
        {
          id: "conditions",
          filter: {
            op: "or",
            conditions: [
              { op: "contains", value: "north" },
              { op: "contains", value: "south" },
            ],
          },
        },
      ],
    };
    const draft = createMultiFilterDraft(source, ids);
    expect(draft.supported).toBe(true);
    expect(draft.dirty).toBe(false);
    expect(draft.filters.map((child) => child.id)).toEqual(ids);
    expect(draft.filters[0].filter?.op).toBe("or");
    expect(isMultiFilterSourceCurrent(draft, source)).toBe(true);
    expect(
      isMultiFilterSourceCurrent(draft, {
        ...source,
        filters: [...source.filters].reverse(),
      }),
    ).toBe(false);
  });
  it("fills missing known slots and retains the initial fence after staging", () => {
    const source = {
      op: "multi",
      filters: [{ id: "values", filter: { op: "in", value: ["north"] } }],
    };
    const draft = createMultiFilterDraft(source, ids),
      next = stageMultiFilterChild(draft, "conditions", { op: "notBlank" });
    expect(draft.filters[0].filter).toBeUndefined();
    expect(next.sourceKey).toBe(draft.sourceKey);
    expect(isMultiFilterSourceCurrent(next, source)).toBe(true);
    expect(isMultiFilterSourceCurrent(next, undefined)).toBe(false);
  });
  it.each([
    { op: "contains", value: "old" },
    { op: "multi", filters: [{ id: "unknown", filter: { op: "blank" } }] },
    { op: "multi", filters: [] },
    null,
  ])(
    "preserves unsupported source until explicit replacement: %j",
    (source) => {
      const draft = createMultiFilterDraft(source, ids);
      expect(draft.supported).toBe(false);
      expect(() =>
        stageMultiFilterChild(draft, "values", { op: "blank" }),
      ).toThrow(MultiFilterDraftError);
      expect(() => buildMultiFilterDraft(draft)).toThrow(MultiFilterDraftError);
      const replaced = replaceMultiFilterDraft(draft);
      expect(replaced.supported).toBe(true);
      expect(replaced.dirty).toBe(true);
      expect(isMultiFilterSourceCurrent(replaced, source)).toBe(true);
      const edited = stageMultiFilterChild(replaced, "conditions", {
          op: "contains",
          value: "new",
        }),
        cleared = stageMultiFilterChild(edited, "conditions", undefined);
      expect(cleared.dirty).toBe(true);
      expect(buildMultiFilterDraft(cleared)).toBeUndefined();
    },
  );
  it("owns nested data, freezes draft snapshots and leaves caller arrays mutable", () => {
    const values = ["north"],
      source = {
        op: "multi",
        filters: [{ id: "values", filter: { op: "in", value: values } }],
      },
      draft = createMultiFilterDraft(source, ids);
    values.push("south");
    expect(draft.filters[1].filter?.value).toEqual(["north"]);
    expect(isMultiFilterSourceCurrent(draft, source)).toBe(false);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.filters)).toBe(true);
    expect(Object.isFrozen(draft.filters[1].filter?.value)).toBe(true);
    expect(Object.isFrozen(values)).toBe(false);
  });
  it("rejects unknown children, nested multis and aggregate budget excess without changing a good draft", () => {
    const initial = stageMultiFilterChild(
      createMultiFilterDraft(undefined, ids),
      "values",
      { op: "in", value: Array.from({ length: 6000 }, (_, index) => index) },
    );
    expect(() =>
      stageMultiFilterChild(initial, "unknown", { op: "blank" }),
    ).toThrow(MultiFilterDraftError);
    expect(() =>
      stageMultiFilterChild(initial, "conditions", {
        op: "multi",
        filters: [{ id: "nested" }],
      } as Filter),
    ).toThrow(ColumnFilterValidationError);
    expect(() =>
      stageMultiFilterChild(initial, "conditions", {
        op: "in",
        value: Array.from({ length: 5000 }, (_, index) => index),
      }),
    ).toThrow(ColumnFilterValidationError);
    expect((initial.filters[1].filter?.value as unknown[]).length).toBe(6000);
    expect(initial.filters[0].filter).toBeUndefined();
  });
  it("rejects unreadable source fingerprints without invoking source getters", () => {
    const getter = vi.fn(() => "contains"),
      source = {};
    Object.defineProperty(source, "op", { get: getter, enumerable: true });
    expect(() => createMultiFilterDraft(source, ids)).toThrow(
      MultiFilterDraftError,
    );
    expect(getter).not.toHaveBeenCalled();
    const draft = createMultiFilterDraft(undefined, ids);
    expect(() => isMultiFilterSourceCurrent(draft, source)).toThrow(
      MultiFilterDraftError,
    );
    expect(getter).not.toHaveBeenCalled();
  });
});
