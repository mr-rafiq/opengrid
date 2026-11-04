// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GridWorkspace } from "./grid-workspace.js";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps tab relationships and keyboard navigation correct when panels change", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const panels = [
    { id: "views", label: "Saved views", content: <button>Save view</button> },
    {
      id: "notes",
      label: "Notes",
      content: <textarea aria-label="Project note" />,
    },
  ];
  const view = render(
    <GridWorkspace panels={panels}>
      <p>Grid content</p>
    </GridWorkspace>,
  );
  const first = screen.getByRole("tab", { name: "Saved views" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Notes" }),
  );
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
    document.activeElement!.id,
  );
  expect(screen.getByRole("textbox", { name: "Project note" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save view" })).toBeNull();
  view.rerender(
    <GridWorkspace panels={[panels[0]]}>
      <p>Grid content</p>
    </GridWorkspace>,
  );
  expect(
    screen
      .getByRole("tab", { name: "Saved views" })
      .getAttribute("aria-selected"),
  ).toBe("true");
});
