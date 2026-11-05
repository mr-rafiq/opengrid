import { expect, it } from "vitest";
import { ag31DeclaredQuery } from "./ag31-column-defaults";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns";
const columns = [{ id: "a" }, { id: "b" }, { id: "c" }];
it("orders declared sorts and groups independently and preserves supplied definitions", () => {
  const defs: Ag31ColumnDefinition<unknown>[] = [
    { sort: "desc", sortIndex: 1, rowGroup: true, rowGroupIndex: 1 },
    { sort: "asc", sortIndex: 0, rowGroup: true, rowGroupIndex: 0 },
    { sort: "asc", rowGroup: true },
  ];
  const before = structuredClone(defs);
  expect(ag31DeclaredQuery(columns, defs)).toEqual({
    sorting: [
      { columnId: "b", direction: "asc" },
      { columnId: "a", direction: "desc" },
      { columnId: "c", direction: "asc" },
    ],
    groupBy: ["b", "a", "c"],
  });
  expect(defs).toEqual(before);
});
it("uses declared values before initial values and merges only defined leaf values", () => {
  expect(
    ag31DeclaredQuery(
      columns,
      [
        { sort: null, rowGroup: false },
        { sort: undefined, rowGroup: undefined },
        { initialSort: "desc", initialRowGroup: false },
      ],
      { initialSort: "asc", initialRowGroup: true },
    ),
  ).toEqual({
    sorting: [
      { columnId: "b", direction: "asc" },
      { columnId: "c", direction: "desc" },
    ],
    groupBy: ["b"],
  });
});
it("accepts signed safe sort indices while grouping indices remain nonnegative", () => {
  expect(
    ag31DeclaredQuery(columns, [
      { sort: "desc", sortIndex: 0 },
      { sort: "asc", sortIndex: -1 },
      {},
    ]).sorting,
  ).toEqual([
    { columnId: "b", direction: "asc" },
    { columnId: "a", direction: "desc" },
  ]);
  expect(() =>
    ag31DeclaredQuery(columns, [{ rowGroupIndex: -1 }, {}, {}]),
  ).toThrow();
});
it("rejects unbounded or ambiguous values before creating query state", () => {
  for (const patch of [
    { sort: "sideways" },
    { sortIndex: Infinity },
    { sortIndex: 0.5 },
    { rowGroup: "yes" },
    { rowGroupIndex: NaN },
  ])
    expect(() =>
      ag31DeclaredQuery(columns, [
        patch,
        {},
        {},
      ] as Ag31ColumnDefinition<unknown>[]),
    ).toThrow();
  expect(() => ag31DeclaredQuery(columns, [])).toThrow();
});
