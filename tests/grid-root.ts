import type { Locator } from "@playwright/test";

/** The grid's widget owns its toolbar, status and dialogs across layout wrappers. */
export function gridRoot(grid: Locator): Locator {
  return grid.locator(
    "xpath=ancestor::section[contains(concat(' ', normalize-space(@class), ' '), ' og-root ')][1]",
  );
}
