import { describe, expect, it, vi } from "vitest";
import * as core from "./index.js";
import { createGrid, getBuiltinRowReorderReason } from "./index.js";
import type {
  GridOptions,
  RowReorderBlockReason,
  RowReorderStatus,
} from "./types.js";

type Item = { id: string; group: string; value: number };
function grid(options: Partial<GridOptions<Item>> = {}) {
  return createGrid({
    rows: [{ id: "a", group: "A", value: 1 }],
    columns: [
      { id: "group", field: "group" },
      { id: "value", field: "value", type: "number" },
    ],
    getRowId: (row) => row.id,
    ...options,
  });
}

describe("built-in row-reorder status origin", () => {
  const cases: {
    reason: RowReorderBlockReason;
    message: string;
    options: Partial<GridOptions<Item>>;
  }[] = [
    {
      reason: "tree-data",
      message: "Row reordering is unavailable for tree data",
      options: { getTreePath: (row) => [row.id] },
    },
    {
      reason: "grouping",
      message: "Clear grouping before reordering rows",
      options: { initialState: { groupBy: ["group"] } },
    },
    {
      reason: "sorting",
      message: "Clear sorting before reordering rows",
      options: {
        initialState: { sorting: [{ columnId: "value", direction: "asc" }] },
      },
    },
    {
      reason: "filtering",
      message: "Clear filters before reordering rows",
      options: {
        initialState: { filters: { value: { op: "equals", value: 1 } } },
      },
    },
    {
      reason: "external-filter",
      message: "Clear the external filter before reordering rows",
      options: { externalFilter: () => true },
    },
  ];
  it.each(cases)(
    "recognizes the exact frozen built-in $reason status without changing its shape",
    ({ reason, message, options }) => {
      const status = grid(options).getRowReorderStatus();
      expect(status).toEqual({ allowed: false, reason, message });
      expect(Object.isFrozen(status)).toBe(true);
      expect(Object.keys(status).sort()).toEqual([
        "allowed",
        "message",
        "reason",
      ]);
      expect(Object.getOwnPropertySymbols(status)).toEqual([]);
      expect(getBuiltinRowReorderReason(status)).toBe(reason);
      expect(getBuiltinRowReorderReason(status)).toBe(reason);
      expect(getBuiltinRowReorderReason({ ...status })).toBeUndefined();
      expect(
        getBuiltinRowReorderReason(Object.freeze({ ...status })),
      ).toBeUndefined();
      expect(
        getBuiltinRowReorderReason(
          JSON.parse(JSON.stringify(status)) as RowReorderStatus,
        ),
      ).toBeUndefined();
    },
  );
  it("marks quick and advanced filters but leaves allowed statuses unmarked", () => {
    expect(
      getBuiltinRowReorderReason(
        grid({ initialState: { quickFilter: "A" } }).getRowReorderStatus(),
      ),
    ).toBe("filtering");
    const advanced = grid({
      initialState: {
        advancedFilter: {
          kind: "condition",
          columnId: "value",
          filter: { op: "equals", value: 1 },
        },
      },
    });
    expect(getBuiltinRowReorderReason(advanced.getRowReorderStatus())).toBe(
      "filtering",
    );
    expect(
      getBuiltinRowReorderReason(grid().getRowReorderStatus()),
    ).toBeUndefined();
    expect(
      getBuiltinRowReorderReason(Object.freeze({ allowed: true })),
    ).toBeUndefined();
  });
  it.each(cases)(
    "keeps custom $reason statuses authoritative even when their reason or English text matches",
    ({ reason, message }) => {
      expect(
        getBuiltinRowReorderReason(
          Object.freeze({
            allowed: false,
            reason,
            message: "Blocked:" + reason,
          }),
        ),
      ).toBeUndefined();
      expect(
        getBuiltinRowReorderReason({ allowed: false, reason, message }),
      ).toBeUndefined();
    },
  );
  it("does not invoke getters or proxy traps on unowned status objects", () => {
    const getter = vi.fn(() => {
      throw new Error("must not read");
    });
    const custom = Object.defineProperties(
      {},
      {
        allowed: { get: getter },
        reason: { get: getter },
        message: { get: getter },
      },
    ) as RowReorderStatus;
    expect(getBuiltinRowReorderReason(custom)).toBeUndefined();
    const owned = grid({
      initialState: { sorting: [{ columnId: "value", direction: "asc" }] },
    }).getRowReorderStatus();
    expect(
      getBuiltinRowReorderReason(new Proxy(owned, { get: getter })),
    ).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
  });
  it("leaves remote read-only statuses and invalid runtime values unmarked", () => {
    expect(
      getBuiltinRowReorderReason(
        Object.freeze({
          allowed: false,
          reason: "read-only",
          message: "Provider controlled",
        }),
      ),
    ).toBeUndefined();
    for (const value of [null, undefined, 1, "sorting"])
      expect(
        getBuiltinRowReorderReason(value as unknown as RowReorderStatus),
      ).toBeUndefined();
  });
  it("does not expose the internal producer through the package barrel", () => {
    expect("createBuiltinRowReorderStatus" in core).toBe(false);
    expect(typeof core.getBuiltinRowReorderReason).toBe("function");
  });
});
