// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import { GridSidePanel } from "./side-panel.js";
afterEach(cleanup);
it("omits protected utility fields only from Columns and retains independent filters", () => {
  const model = createGrid({
    rows: [{ id: "1", value: 2 }],
    getRowId: (r) => r.id,
    columns: [
      { id: "tree", field: "id", header: "Tree", columnsPanel: false },
      { id: "value", field: "value", header: "Amount", lockVisible: true },
    ],
  });
  render(<GridSidePanel model={model} />);
  expect(screen.queryByRole("checkbox", { name: "Tree" })).toBeNull();
  expect(
    (screen.getByRole("checkbox", { name: "Amount" }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
  expect(screen.getByText("Tree")).toBeTruthy();
});
