// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { DataGrid } from "./data-grid.js";
import { GridLocaleProvider, esES } from "./locale.js";

afterEach(cleanup);
const model = (rows: { id: string; name: string }[]) =>
  createGrid({
    rows,
    getRowId: (row) => row.id,
    columns: [{ id: "name", field: "name", header: "Name" }],
  });

it("announces an empty client view outside the grid without adding a logical data row", () => {
  render(<DataGrid model={model([])} ariaLabel="Empty records" />);
  const grid = screen.getByRole("grid", { name: "Empty records" }),
    status = screen.getByText("No matching rows");
  expect(status.getAttribute("role")).toBe("status");
  expect(grid.contains(status)).toBe(false);
  expect(grid.querySelector('[role="status"]')).toBeNull();
  expect(grid.getAttribute("aria-rowcount")).toBe("2");
  expect(grid.querySelector("[data-og-row-id]")).toBeNull();
});

it("keeps translated empty results outside the grid through filtering while preserving outside focus", () => {
  const grid = model([{ id: "one", name: "Original" }]);
  render(
    <GridLocaleProvider locale={esES}>
      <button type="button">Outside empty results</button>
      <DataGrid model={grid} ariaLabel="Filtered records" />
    </GridLocaleProvider>,
  );
  const outside = screen.getByRole("button", { name: "Outside empty results" });
  outside.focus();
  act(() => grid.setQuickFilter("missing"));
  const status = screen.getByText("No hay filas coincidentes"),
    viewport = screen.getByRole("grid", { name: "Filtered records" });
  expect(viewport.contains(status)).toBe(false);
  expect(viewport.getAttribute("aria-rowcount")).toBe("2");
  expect(document.activeElement).toBe(outside);
  act(() => grid.setQuickFilter(""));
  expect(screen.queryByText("No hay filas coincidentes")).toBeNull();
  expect(viewport.getAttribute("aria-rowcount")).toBe("3");
  expect(document.activeElement).toBe(outside);
});
