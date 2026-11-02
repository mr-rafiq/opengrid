import { expect, it } from "vitest";
import type { ServerRequest } from "@opengrid/core";
import { serverGroupingResponse } from "../../../examples/demo/src/server-grouping-provider";
const request = (patch: Partial<ServerRequest> = {}): ServerRequest => ({
  startRow: 0,
  endRow: 2,
  groupKeys: [],
  rowGroupColumns: ["team"],
  valueColumns: [{ columnId: "amount", aggregate: "sum" }],
  pivotColumns: [],
  sorting: [],
  filters: {},
  signal: new AbortController().signal,
  ...patch,
});
it("executes nested configured groups with immediate child counts and leaf routes", () => {
  const root = serverGroupingResponse(
    request({ rowGroupColumns: ["team", "name"] }),
  );
  expect(
    root.nodes.map((node) => node.kind === "group" && node.childCount),
  ).toEqual([3, 3]);
  const children = serverGroupingResponse(
    request({ rowGroupColumns: ["team", "name"], groupKeys: ["A"] }),
  );
  expect(children.rowCount).toBe(3);
  expect(children.nodes[0]).toMatchObject({
    kind: "group",
    key: "Remote A 1",
    childCount: 1,
    aggregates: { amount: 1 },
  });
  const leaf = serverGroupingResponse(
    request({
      rowGroupColumns: ["team", "name"],
      groupKeys: ["A", "Remote A 1"],
    }),
  );
  expect(leaf.rowCount).toBe(1);
  expect(leaf.nodes[0]).toMatchObject({
    kind: "row",
    data: { name: "Remote A 1", amount: 1 },
  });
});
it("really applies average/count, conditions and aggregate sorting", () => {
  const average = serverGroupingResponse(
    request({ valueColumns: [{ columnId: "amount", aggregate: "avg" }] }),
  );
  expect(average.nodes[0]).toMatchObject({ aggregates: { amount: 5 } });
  const count = serverGroupingResponse(
    request({ valueColumns: [{ columnId: "amount", aggregate: "count" }] }),
  );
  expect(
    count.nodes.map((node) => node.kind === "group" && node.aggregates!.amount),
  ).toEqual([3, 3]);
  const filtered = serverGroupingResponse(
    request({ filters: { name: { op: "contains", value: "A 2" } } }),
  );
  expect(filtered.nodes).toHaveLength(1);
  expect(filtered.nodes[0]).toMatchObject({
    key: "A",
    aggregates: { amount: 9 },
    childCount: 1,
  });
  const sorted = serverGroupingResponse(
    request({ sorting: [{ columnId: "amount", direction: "desc" }] }),
  );
  expect(sorted.nodes[0]).toMatchObject({
    key: "B",
    aggregates: { amount: 16 },
  });
});
it("returns provider-ordered block windows when grouping is removed", () => {
  const result = serverGroupingResponse(
    request({
      rowGroupColumns: [],
      startRow: 2,
      endRow: 4,
      sorting: [{ columnId: "amount", direction: "desc" }],
    }),
  );
  expect(result.rowCount).toBe(6);
  expect(
    result.nodes.map((node) => node.kind === "row" && node.data.amount),
  ).toEqual([5, 4]);
});
it("rejects unsupported schema/routes/operations instead of exposing dummy query controls", () => {
  expect(() =>
    serverGroupingResponse(request({ rowGroupColumns: ["unknown"] })),
  ).toThrow(/Unknown demo field/);
  expect(() =>
    serverGroupingResponse(
      request({
        filters: JSON.parse('{"__proto__":{"op":"equals","value":"x"}}'),
      }),
    ),
  ).toThrow(/Unknown demo field/);
  expect(() =>
    serverGroupingResponse(
      request({ valueColumns: [{ columnId: "amount", aggregate: "median" }] }),
    ),
  ).toThrow(/Unsupported demo aggregation/);
  expect(() =>
    serverGroupingResponse(request({ groupKeys: ["A", "unexpected"] })),
  ).toThrow(/deeper/);
});
