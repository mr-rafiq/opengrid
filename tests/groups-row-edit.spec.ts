import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("nested grouped headers collapse and restore pinned and virtual columns", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Column groups", exact: true })
    .click();
  const grid = page.getByRole("grid", { name: "Portfolio holdings" });
  await expect(grid).toHaveAttribute("aria-rowcount", "104");
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: () => Promise<{ violations: { id: string; impact: string }[] }>;
        };
      }
    ).axe.run();
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id);
  });
  expect(violations).toEqual([]);
  const position = page.getByRole("button", {
    name: "Collapse column group Portfolio / Position",
    exact: true,
  });
  await position.click();
  await expect(
    grid.getByRole("button", { name: "Sort Shares", exact: true }),
  ).toHaveCount(0);
  await expect(
    grid.getByRole("button", { name: "Sort Price", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Expand column group Portfolio / Position",
      exact: true,
    })
    .click();
  await expect(
    grid.getByRole("button", { name: "Sort Shares", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wide schema", exact: true }).click();
  const viewport = grid;
  await viewport.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(
    page.locator('[data-row-id="1"][data-column-id="metric120"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-row-id="1"][data-column-id="company"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-row-id="1"][data-column-id="trend"]'),
  ).toBeVisible();
});

test("row editing commits an atomic draft with validation and one undo", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Row editing", exact: true }).click();
  const company = page.locator('[data-row-id="1"][data-column-id="company"]');
  await company.focus();
  await company.press("F2");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Edit Company", exact: true })
    .fill("Edited portfolio");
  await dialog
    .getByRole("spinbutton", { name: "Edit Price", exact: true })
    .fill("-1");
  await dialog.getByRole("button", { name: "Save row", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Price must be positive",
  );
  await expect(company).toContainText("Northstar Labs");
  await dialog
    .getByRole("spinbutton", { name: "Edit Price", exact: true })
    .fill("200");
  await dialog.getByRole("button", { name: "Save row", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(company).toHaveText("Edited portfolio");
  await expect(company).toBeFocused();
  await expect(
    page.locator('[data-row-id="1"][data-column-id="price"]'),
  ).toHaveText("$200.00");
  await page
    .getByRole("button", { name: /Undo/, exact: false })
    .first()
    .click();
  await expect(company).toHaveText("Northstar Labs");
  await expect(
    page.locator('[data-row-id="1"][data-column-id="price"]'),
  ).toHaveText("$42.00");
});
