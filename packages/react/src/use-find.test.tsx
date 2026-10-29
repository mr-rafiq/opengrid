// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createGrid, type CellPosition } from "@opengrid/core";
import { useFind } from "./use-find.js";
afterEach(cleanup);

it("refreshes a stable Find controller with the latest presentation predicate through StrictMode", () => {
  const model = createGrid({
    rows: [{ id: "a", x: "Alpha", y: "Alpha" }],
    columns: [
      { id: "x", field: "x" },
      { id: "y", field: "y" },
    ],
    getRowId: (row) => row.id,
  });
  const { result, rerender } = renderHook(
    ({ searchable }: { searchable?: (position: CellPosition) => boolean }) =>
      useFind(model, ["a"], searchable),
    {
      initialProps: {
        searchable: ((position: CellPosition) => position.columnId === "x") as
          ((position: CellPosition) => boolean) | undefined,
      },
      wrapper: StrictMode,
    },
  );
  const controller = result.current.controller!;
  act(() => controller.setQuery("Alpha"));
  expect(result.current.snapshot.matches).toEqual([
    { rowId: "a", columnId: "x" },
  ]);
  rerender({ searchable: (position) => position.columnId === "y" });
  expect(result.current.controller).toBe(controller);
  expect(result.current.snapshot.matches).toEqual([
    { rowId: "a", columnId: "y" },
  ]);
  rerender({ searchable: undefined });
  expect(result.current.controller).toBe(controller);
  expect(result.current.snapshot.matches).toHaveLength(2);
});
