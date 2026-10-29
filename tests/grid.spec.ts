import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("grid", { name: "Portfolio holdings" }),
  ).toBeVisible();
});
test("renders live demo and sorts, filters, selects and exports", async ({
  page,
}) => {
  const grid = page.getByRole("grid");
  await expect(
    grid.locator('[data-row-id="1"][data-column-id="company"]'),
  ).toContainText("Northstar Labs");
  await page.getByRole("button", { name: "Sort Price", exact: true }).click();
  await expect(
    page.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: "Sort Price", exact: true }),
    }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page
    .getByRole("textbox", { name: "Search all rows" })
    .fill("Northstar");
  await expect(page.getByText("125 rows", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Select row 1", exact: true })
    .check();
  await expect(
    page.getByText(
      "1 selected · Double-click or Enter to edit · Shift-click headers for multi-sort",
    ),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("opengrid.csv");
});
test("validates cell edits, commits and undoes in a real browser", async ({
  page,
}) => {
  const cell = page.locator('[data-row-id="1"][data-column-id="price"]');
  await cell.dblclick();
  const editor = page.getByRole("textbox", { name: "Edit Price row 1" });
  await editor.fill("-5");
  await editor.press("Enter");
  await expect(page.getByRole("alert")).toContainText("positive");
  await editor.fill("123.45");
  await editor.press("Enter");
  await expect(cell).toContainText("$123.45");
  await page
    .locator(".og-toolbar")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(cell).toContainText("$42.00");
});
test("keeps keyboard focus on offscreen rows and pinned columns", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Rows per page" })
    .selectOption("100");
  const first = page.locator('[data-row-id="1"][data-column-id="company"]');
  await first.focus();
  await first.press("Control+End");
  const last = page.locator('[data-row-id="100"][data-column-id="trend"]');
  await expect(last).toBeFocused();
  await last.press("Home");
  const pinned = page.locator('[data-row-id="100"][data-column-id="company"]');
  await expect(pinned).toBeFocused();
  await pinned.press("Control+Home");
  await expect(first).toBeFocused();
  expect(await page.locator('[data-column-id="company"]').count()).toBeLessThan(
    35,
  );
});
test("supports accessible column visibility, pinning, resize and reorder", async ({
  page,
}) => {
  await page.locator(".og-chooser summary").click();
  await page
    .getByRole("checkbox", { name: "Show Ticker", exact: true })
    .uncheck();
  await expect(
    page.getByRole("button", { name: "Sort Ticker", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Pin Price", exact: true })
    .selectOption("right");
  const cell = page.locator('[data-row-id="1"][data-column-id="price"]');
  await expect(cell).toHaveCSS("position", "sticky");
  await page
    .getByRole("button", { name: "Move Sector left", exact: true })
    .click();
  await page.locator(".og-chooser summary").click();
  const resize = page.getByRole("separator", {
    name: "Resize Company",
    exact: true,
  });
  const before = Number(await resize.getAttribute("aria-valuenow"));
  await resize.focus();
  await resize.press("ArrowRight");
  await expect(resize).toHaveAttribute("aria-valuenow", String(before + 10));
});
test("expands groups and trees, and renders pivot summary", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Group by sector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand Technology", exact: true })
    .click();
  await expect(
    page.locator('[data-row-id="1"][data-column-id="company"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Region tree", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Americas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand Technology", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Σ Pivot summary", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
});
test("keeps the DOM bounded at 100,000 rows and filters after scrolling", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Dataset size" })
    .selectOption("100000");
  await page
    .getByRole("button", { name: "Group by sector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand Technology", exact: true })
    .click();
  await page.getByRole("treegrid").evaluate((el) => {
    el.scrollTop = 100000;
  });
  await page
    .getByRole("textbox", { name: "Search all rows" })
    .fill("Northstar Labs 10000");
  await expect(page.getByRole("treegrid")).toContainText("Technology");
  expect(await page.locator('[data-column-id="company"]').count()).toBeLessThan(
    40,
  );
});
for (const variant of ["flat", "dark", "grouped"] as const) {
  test(`has no serious or critical accessibility violations in ${variant} view`, async ({
    page,
  }) => {
    if (variant === "dark")
      await page.getByRole("button", { name: "Toggle dark theme" }).click();
    if (variant === "grouped") {
      await page
        .getByRole("button", { name: "Group by sector", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Expand Technology", exact: true })
        .click();
    }
    await page.addScriptTag({
      content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
    });
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: () => Promise<{
              violations: { impact: string; id: string; nodes: unknown[] }[];
            }>;
          };
        }
      ).axe;
      return (await axe.run()).violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({ id: v.id, count: v.nodes.length }));
    });
    expect(violations).toEqual([]);
  });
}
