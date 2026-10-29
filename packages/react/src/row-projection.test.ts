import { describe, expect, it, vi } from "vitest";
import type { RowNode } from "../../core/src/types";
import { createRowProjection, MAX_PINNED_ROW_REQUESTS } from "./row-projection";
type Data = { name: string };
const leaf = (id: string, depth = 0): RowNode<Data> => ({
  id,
  kind: "row",
  data: { name: id },
  depth,
});
const source = [leaf("a"), leaf("b"), leaf("c"), leaf("d")];

describe("current-view row projection", () => {
  it("preserves ordinary row order and identity when no pins are requested", () => {
    const projection = createRowProjection(source);
    expect(projection.rows.map((row) => row.node.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(projection.top).toEqual([]);
    expect(projection.bottom).toEqual([]);
    expect(projection.body.map((row) => row.sourceIndex)).toEqual([0, 1, 2, 3]);
    expect(projection.body[0].node).toBe(source[0]);
    expect(projection.rangeRowIds).toEqual(["a", "b", "c", "d"]);
  });

  it("moves requested rows into explicit top/bottom order exactly once", () => {
    const projection = createRowProjection(source, {
      pinnedTopRowIds: ["c", "a"],
      pinnedBottomRowIds: ["d"],
    });
    expect(projection.top.map((row) => row.node.id)).toEqual(["c", "a"]);
    expect(projection.body.map((row) => row.node.id)).toEqual(["b"]);
    expect(projection.bottom.map((row) => row.node.id)).toEqual(["d"]);
    expect(projection.rows.map((row) => row.node.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
    expect(projection.rows.map((row) => row.visualIndex)).toEqual([0, 1, 2, 3]);
    expect(projection.top.map((row) => row.regionIndex)).toEqual([0, 1]);
    expect(projection.body[0].regionIndex).toBe(0);
    expect(projection.rangeRowIds).toEqual(["c", "a", "b", "d"]);
    expect(new Set(projection.rows.map((row) => row.node.id)).size).toBe(
      source.length,
    );
  });

  it("deduplicates pin lists and gives top precedence over bottom", () => {
    const projection = createRowProjection(source, {
      pinnedTopRowIds: ["c", "c", "a"],
      pinnedBottomRowIds: ["a", "d", "d", "c"],
    });
    expect(projection.top.map((row) => row.node.id)).toEqual(["c", "a"]);
    expect(projection.bottom.map((row) => row.node.id)).toEqual(["d"]);
    expect(projection.body.map((row) => row.node.id)).toEqual(["b"]);
    expect(projection.ignoredPins).toEqual([]);
  });

  it("resolves only the supplied visible page without inventing missing rows", () => {
    const projection = createRowProjection([source[1], source[2]], {
      pinnedTopRowIds: ["a", "c"],
      pinnedBottomRowIds: ["d"],
    });
    expect(projection.rows.map((row) => row.node.id)).toEqual(["c", "b"]);
    expect(projection.ignoredPins).toEqual([
      { rowId: "a", region: "top", reason: "not-visible" },
      { rowId: "d", region: "bottom", reason: "not-visible" },
    ]);
    const nextPage = createRowProjection([source[0], source[3]], {
      pinnedTopRowIds: ["a", "c"],
      pinnedBottomRowIds: ["d"],
    });
    expect(nextPage.top.map((row) => row.node.id)).toEqual(["a"]);
    expect(nextPage.bottom.map((row) => row.node.id)).toEqual(["d"]);
  });

  it("keeps group rows and tree parents in the body and reports ineligible pins", () => {
    const parent: RowNode<Data> = {
      ...leaf("parent"),
      children: [leaf("child", 1)],
    };
    const group: RowNode<Data> = {
      id: "group",
      kind: "group",
      depth: 0,
      label: "Group",
      children: [leaf("child", 1)],
    };
    const missing: RowNode<Data> = {
      id: "missing-data",
      kind: "row",
      depth: 0,
    };
    const projection = createRowProjection(
      [group, parent, leaf("child", 1), missing],
      { pinnedTopRowIds: ["group", "parent", "child", "missing-data"] },
    );
    expect(projection.top.map((row) => row.node.id)).toEqual(["child"]);
    expect(projection.body.map((row) => row.node.id)).toEqual([
      "group",
      "parent",
      "missing-data",
    ]);
    expect(projection.ignoredPins.map((pin) => pin.reason)).toEqual([
      "not-data-row",
      "non-leaf",
      "not-data-row",
    ]);
    expect(parent.children).toHaveLength(1);
    expect(group.children).toHaveLength(1);
  });

  it("classifies full-width rows once per source row and excludes their absent cells from ranges", () => {
    const predicate = vi.fn(
      (node: RowNode<Data>) => node.id === "b" || node.id === "d",
    );
    const projection = createRowProjection(source, {
      pinnedTopRowIds: ["d"],
      pinnedBottomRowIds: ["a"],
      isFullWidthRow: predicate,
    });
    expect(predicate).toHaveBeenCalledTimes(source.length);
    expect(projection.top[0].fullWidth).toBe(true);
    expect(projection.rows.map((row) => row.node.id)).toEqual([
      "d",
      "b",
      "c",
      "a",
    ]);
    expect(projection.rangeRowIds).toEqual(["c", "a"]);
  });

  it("preserves logical lookup identities after pin changes", () => {
    const before = createRowProjection(source),
      after = createRowProjection(source, { pinnedTopRowIds: ["d"] });
    expect(before.indexOf("d")).toBe(3);
    expect(after.indexOf("d")).toBe(0);
    expect(after.getById("d")?.node).toBe(before.getById("d")?.node);
    expect(after.getById("missing")).toBeUndefined();
    expect(after.indexOf("missing")).toBe(-1);
  });

  it("does not mutate source rows or caller pin arrays and freezes projection metadata", () => {
    const top = Object.freeze(["c"]);
    const bottom = Object.freeze(["d"]);
    const rows = Object.freeze([...source]);
    const projection = createRowProjection(rows, {
      pinnedTopRowIds: top,
      pinnedBottomRowIds: bottom,
    });
    expect(top).toEqual(["c"]);
    expect(bottom).toEqual(["d"]);
    expect(rows).toEqual(source);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.rows)).toBe(true);
    expect(Object.isFrozen(projection.top[0])).toBe(true);
    expect(() => (projection.rows as unknown[]).push({})).toThrow();
  });

  it("supports special string IDs without object-prototype lookups or delimiter collisions", () => {
    const ids = ["__proto__", "constructor", '["a","b"]', "a,b"];
    const projection = createRowProjection(
      ids.map((id) => leaf(id)),
      {
        pinnedTopRowIds: ["__proto__", "constructor"],
        pinnedBottomRowIds: ["a,b"],
      },
    );
    expect(projection.rows.map((row) => row.node.id)).toEqual([
      "__proto__",
      "constructor",
      '["a","b"]',
      "a,b",
    ]);
    expect(projection.getById("__proto__")?.region).toBe("top");
  });

  it("rejects ambiguous source identities and malformed pin lists", () => {
    expect(() => createRowProjection([leaf("a"), leaf("a")])).toThrow(
      "Duplicate projected row ID",
    );
    expect(() => createRowProjection([leaf("")])).toThrow("nonempty strings");
    expect(() =>
      createRowProjection(source, { pinnedTopRowIds: [""] }),
    ).toThrow("nonempty strings");
    expect(() =>
      createRowProjection(source, {
        pinnedTopRowIds: [1] as unknown as string[],
      }),
    ).toThrow("nonempty strings");
    expect(() =>
      createRowProjection(source, {
        pinnedBottomRowIds: "a" as unknown as string[],
      }),
    ).toThrow("must be arrays");
  });

  it("bounds the total input request budget before resolving or calling render predicates", () => {
    const predicate = vi.fn(() => false);
    expect(() =>
      createRowProjection(source, {
        pinnedTopRowIds: Array.from(
          { length: MAX_PINNED_ROW_REQUESTS },
          () => "a",
        ),
        pinnedBottomRowIds: ["b"],
        isFullWidthRow: predicate,
      }),
    ).toThrow("At most 1000");
    expect(predicate).not.toHaveBeenCalled();
    const projection = createRowProjection(source, {
      pinnedTopRowIds: Array.from(
        { length: MAX_PINNED_ROW_REQUESTS },
        () => "a",
      ),
    });
    expect(projection.top).toHaveLength(1);
  });

  it("handles empty views and all-pinned/full-width views without phantom cells", () => {
    const empty = createRowProjection<Data>([], { pinnedTopRowIds: ["a"] });
    expect(empty.rows).toEqual([]);
    expect(empty.rangeRowIds).toEqual([]);
    const projection = createRowProjection(source, {
      pinnedTopRowIds: ["a", "b"],
      pinnedBottomRowIds: ["c", "d"],
      isFullWidthRow: () => true,
    });
    expect(projection.body).toEqual([]);
    expect(projection.rangeRowIds).toEqual([]);
    expect(projection.rows).toHaveLength(4);
  });
});
