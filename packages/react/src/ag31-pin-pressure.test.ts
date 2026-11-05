import { expect, it } from "vitest";
import { planAg31PinPressure } from "./ag31-pin-pressure.js";
it("matches the measured two-band source pin-pressure cases without changing input or repinning", () => {
  for (const width of [320, 390, 556])
    for (const treeWidth of [300, 394, 600]) {
      const columns = [
        { colId: "tree", pinned: "left" as const, width: treeWidth },
        { colId: "middle", pinned: null, width: 150 },
        { colId: "total", pinned: "right" as const, width: 240 },
      ];
      const before = structuredClone(columns),
        actual = planAg31PinPressure(columns, width);
      const expected = treeWidth > width - 50 ? ["total", "tree"] : ["total"];
      expect(actual).toEqual(expected);
      expect(columns).toEqual(before);
      const released = columns.map((c) =>
        actual.includes(c.colId) ? { ...c, pinned: null } : c,
      );
      expect(planAg31PinPressure(released, 1200)).toEqual([]);
    }
  expect(
    planAg31PinPressure(
      [
        { colId: "tree", pinned: "left", width: 300 },
        { colId: "total", pinned: "right", width: 240 },
      ],
      1200,
    ),
  ).toEqual([]);
  expect(planAg31PinPressure([], 0)).toEqual([]);
});
