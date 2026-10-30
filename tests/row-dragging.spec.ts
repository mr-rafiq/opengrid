import { gridRoot } from "./grid-root.js";
import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
const ids = (grid: Locator) =>
  grid
    .locator(".og-row[data-row-key]")
    .evaluateAll((elements) =>
      elements
        .slice(0, 4)
        .map((element) => element.getAttribute("data-row-key")),
    );
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Row dragging", exact: true }).click();
});

test("native row drops move once, retain selection and undo or redo atomically", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Portfolio holdings" });
  await grid
    .getByRole("checkbox", { name: "Select row 2", exact: true })
    .check();
  const handle = grid.getByRole("button", { name: "Drag row 1", exact: true }),
    target = grid.locator('.og-row[data-row-key="4"]');
  await handle.dragTo(target, { targetPosition: { x: 180, y: 29 } });
  await expect.poll(() => ids(grid)).toEqual(["2", "3", "4", "1"]);
  await expect(
    grid.getByRole("checkbox", { name: "Select row 2", exact: true }),
  ).toBeChecked();
  const cell = grid.locator('[data-row-id="1"][data-column-id="company"]');
  await expect(cell).toBeFocused();
  await cell.press("Control+z");
  await expect.poll(() => ids(grid)).toEqual(["1", "2", "3", "4"]);
  await cell.press("Control+y");
  await expect.poll(() => ids(grid)).toEqual(["2", "3", "4", "1"]);
  await expect(grid).toHaveAttribute("aria-colcount", "11");
  await expect(cell).toHaveAttribute("aria-colindex", "2");
});

test("keyboard and toolbar movement retain focus and explicit guards disable transformed views", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Portfolio holdings" }),
    root = gridRoot(grid),
    cell = grid.locator('[data-row-id="1"][data-column-id="price"]');
  await cell.focus();
  await cell.press("Alt+ArrowDown");
  await expect.poll(() => ids(grid)).toEqual(["2", "1", "3", "4"]);
  await expect(cell).toBeFocused();
  await root
    .getByRole("button", { name: "Move focused row down", exact: true })
    .click();
  await expect.poll(() => ids(grid)).toEqual(["2", "3", "1", "4"]);
  await expect(cell).toBeFocused();
  await cell.press("Control+z");
  await cell.press("Control+z");
  await expect.poll(() => ids(grid)).toEqual(["1", "2", "3", "4"]);
  await grid.getByRole("button", { name: "Sort Company", exact: true }).click();
  await expect(root.locator(".og-row-move-help")).toContainText(/sort/i);
  await expect(
    grid.getByRole("button", { name: /^Drag row / }).first(),
  ).toBeDisabled();
  await grid.getByRole("button", { name: "Sort Company", exact: true }).click();
  await grid.getByRole("button", { name: "Sort Company", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search all rows", exact: true })
    .fill("Northstar");
  await expect(root.locator(".og-row-move-help")).toContainText(/filter/i);
  await expect(
    grid.getByRole("button", { name: "Drag row 1", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Search all rows", exact: true })
    .clear();
  await page.getByRole("button", { name: "Pinned rows", exact: true }).click();
  await expect(root.locator(".og-row-move-help")).toContainText(/pinned/i);
  await expect(
    grid.getByRole("button", { name: "Drag row 1", exact: true }),
  ).toBeDisabled();
});

test("native body-edge auto-scroll stops outside the grid and cancelled dragging does not write", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Portfolio holdings" });
  await grid.scrollIntoViewIfNeeded();
  // Keep the grid edge away from the browser edge: otherwise native document
  // auto-scroll can compete with the grid's own drag-scroll loop on Linux.
  await grid.evaluate((element) =>
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    }),
  );
  const source = (await grid
      .getByRole("button", { name: "Drag row 1", exact: true })
      .boundingBox())!,
    bounds = (await grid.boundingBox())!,
    height = await grid.evaluate((element) => element.clientHeight),
    x = bounds.x + 360,
    y = bounds.y + height - 10;
  expect(await grid.evaluate((element) => element.scrollTop)).toBe(0);
  expect(y).toBeLessThan(page.viewportSize()!.height - 30);
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2 + 8,
    source.y + source.height / 2 + 10,
    { steps: 3 },
  );
  await expect(grid.locator('[data-row-dragging="true"]')).toHaveCount(1);
  await page.mouse.move(x, y, { steps: 10 });
  // Native dragover is not guaranteed after a single move on every platform.
  await page.mouse.move(x, y);
  await expect
    .poll(() => grid.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.mouse.move(1, 1, { steps: 5 });
  await page.mouse.move(1, 1);
  await page.waitForTimeout(100);
  const stopped = await grid.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(250);
  expect(await grid.evaluate((element) => element.scrollTop)).toBe(stopped);
  await page.mouse.up();
  await expect(grid.locator('[data-row-dragging="true"]')).toHaveCount(0);
  await grid.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => ids(grid)).toEqual(["1", "2", "3", "4"]);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: () => Promise<{
            violations: {
              id: string;
              impact: string;
              nodes: { html: string; failureSummary?: string }[];
            }[];
          }>;
        };
      }
    ).axe.run();
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          html: n.html,
          summary: n.failureSummary,
        })),
      }));
  });
  expect(violations).toEqual([]);
});
