import { test, expect } from "@playwright/test";
test("server binding drills provider routes, pages, and applies authoritative query controls", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Remote model lab", exact: true })
    .click();
  const grid = page.getByRole("grid", {
    name: "Mock server orders",
    exact: true,
  });
  await expect(grid).toBeVisible();
  await grid
    .getByRole("button", { name: "Open group Americas", exact: true })
    .click();
  await expect(page.getByLabel("Mock server orders group path")).toContainText(
    "Americas",
  );
  await expect(grid).toContainText("Order ");
  await page
    .getByRole("button", { name: "Next server page", exact: true })
    .click();
  await expect(page.getByText(/Server page 2 of/)).toBeVisible();
  await grid.getByRole("button", { name: "Sort Revenue", exact: true }).click();
  await expect(
    grid.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: "Sort Revenue", exact: true }),
    }),
  ).toHaveAttribute("aria-sort", "ascending");
  await grid
    .getByRole("textbox", { name: "Filter Order", exact: true })
    .fill("1");
  await expect(grid).toContainText("Order ");
});
test("live viewport uses bounded DOM at a million rows and receives live pushes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Remote model lab", exact: true })
    .click();
  const grid = page.getByRole("grid", {
    name: "Simulated live orders",
    exact: true,
  });
  await expect(grid).toHaveAttribute("aria-rowcount", "1000001");
  const first = grid.locator('[data-viewport-row="0"][data-column-id="name"]');
  await expect(first).toContainText("Live order 1");
  await first.focus();
  await first.press("Control+End");
  const last = grid.locator(
    '[data-viewport-row="999999"][data-column-id="year"]',
  );
  await expect(last).toBeFocused();
  await expect(
    grid.locator('[data-viewport-row="999999"][data-column-id="name"]'),
  ).toContainText("Live order 1,000,000");
  expect(await grid.getByRole("row").count()).toBeLessThan(35);
  const price = grid.locator(
    '[data-viewport-row="999999"][data-column-id="price"]',
  );
  const before = await price.textContent();
  await expect
    .poll(() => price.textContent(), { timeout: 5000 })
    .not.toBe(before);
});
