import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByText("View options", { exact: true }).click();
  await page.getByRole("grid", { name: "Portfolio holdings" }).waitFor();
});
test("Find reveals offscreen cells without changing the filtered row count", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Find", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Find in current view" });
  await input.fill("Northstar Labs 10");
  const match = page.locator('[data-row-id="73"][data-column-id="company"]');
  await expect(match).toHaveClass(/og-find-active/);
  await expect(input).toBeFocused();
  await expect(page.locator(".og-statusbar")).toContainText("1,000 rows");
  await page.getByRole("button", { name: "Next find match" }).click();
  await expect(match).toBeFocused();
  await match.press("Control+f");
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(match).toBeFocused();
});
test("notes survive filter changes, render as plain text, and support keyboard editing", async ({
  page,
}) => {
  const cell = page.locator('[data-row-id="1"][data-column-id="company"]');
  await cell.focus();
  await cell.press("Alt+n");
  const dialog = page.getByRole("dialog", { name: "Cell note" });
  await dialog
    .getByRole("textbox", { name: "Note text" })
    .fill("<img src=x> review this holding");
  await dialog.getByRole("button", { name: "Save note" }).click();
  await expect(cell).toBeFocused();
  const indicator = page.getByRole("button", {
    name: "Edit note for Company row 1",
  });
  await expect(indicator).toHaveAttribute(
    "title",
    "<img src=x> review this holding",
  );
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search all rows" })
    .fill("Evergreen");
  await page.getByRole("textbox", { name: "Search all rows" }).clear();
  await expect(indicator).toBeVisible();
  await indicator.click();
  await dialog.getByRole("button", { name: "Delete note" }).click();
  await expect(indicator).toHaveCount(0);
});
test("applies nested advanced conditions and restores the source view when cleared", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Advanced filter", exact: true })
    .click();
  await page.getByRole("button", { name: "Add AND group root" }).click();
  await page
    .getByRole("button", { name: "Add condition 1", exact: true })
    .click();
  await page.getByLabel("Column 1.1", { exact: true }).selectOption("price");
  await page.getByLabel("Operator 1.1", { exact: true }).selectOption("gt");
  await page.getByLabel("Value 1.1", { exact: true }).fill("400");
  await page
    .getByRole("button", { name: "Add OR group 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add condition 1.2", exact: true })
    .click();
  await page.getByLabel("Column 1.2.1", { exact: true }).selectOption("sector");
  await page.getByLabel("Value 1.2.1", { exact: true }).fill("Technology");
  await page
    .getByRole("button", { name: "Add condition 1.2", exact: true })
    .click();
  await page.getByLabel("Column 1.2.2", { exact: true }).selectOption("region");
  await page.getByLabel("Value 1.2.2", { exact: true }).fill("Europe");
  await page.getByRole("button", { name: "Apply filter" }).click();
  const prices = await page
    .locator('[data-column-id="price"]')
    .allTextContents();
  expect(prices.length).toBeGreaterThan(0);
  expect(
    prices.every((value) => Number(value.replace(/[^\d.-]/g, "")) > 400),
  ).toBe(true);
  await expect(page.locator(".og-statusbar")).not.toContainText("1,000 rows");
  await page
    .getByRole("button", { name: "Advanced filter", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear draft" }).click();
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.locator(".og-statusbar")).toContainText("1,000 rows");
});
test("detail rows align the virtual layout and expose correct hierarchy semantics", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Detail rows", exact: true }).click();
  const grid = page.getByRole("treegrid", { name: "Portfolio holdings" });
  await page
    .getByRole("button", { name: "Expand details row 1", exact: true })
    .click();
  await expect(grid).toHaveAttribute("aria-rowcount", "103");
  await expect(
    page.getByRole("region", { name: "Details for row 1" }),
  ).toContainText("Northstar Labs position details");
  const first = page.locator('[data-row-id="1"][data-column-id="company"]'),
    second = page.locator('[data-row-id="2"][data-column-id="company"]');
  expect(
    (await second.boundingBox())!.y - (await first.boundingBox())!.y,
  ).toBeCloseTo(398, 0);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const serious = await page.evaluate(async () => {
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
  expect(serious).toEqual([]);
  await first.focus();
  await first.press("Alt+Enter");
  await expect(
    page.getByRole("region", { name: "Details for row 1" }),
  ).toHaveCount(0);
});
