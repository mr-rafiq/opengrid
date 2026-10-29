import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("grid").waitFor();
});
test("copies a rectangular range and pastes a validated atomic transaction", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const cell = (row: string, column: string) =>
    page.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
  await cell("1", "price").click();
  await cell("2", "shares").click({ modifiers: ["Shift"] });
  await expect(page.getByRole("gridcell", { selected: true })).toHaveCount(4);
  await cell("2", "shares").press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "42\t50",
  );
  await page.evaluate(() =>
    navigator.clipboard.writeText("100\t200\n300\t400"),
  );
  await cell("2", "shares").press("Control+v");
  await expect(cell("1", "price")).toContainText("$100.00");
  await expect(cell("2", "shares")).toContainText("400");
  await cell("2", "shares").press("Control+z");
  await expect(cell("1", "price")).toContainText("$42.00");
  await expect(cell("2", "shares")).toContainText("87");
  await page.evaluate(() => navigator.clipboard.writeText("100\t200\n-1\t400"));
  await cell("2", "shares").press("Control+v");
  await expect(page.getByRole("alert")).toContainText("positive");
  await expect(cell("1", "price")).toContainText("$42.00");
});
test("extends ranges through virtual rows, fills with keyboard and undoes once", async ({
  page,
}) => {
  const cell = (row: string) =>
    page.locator(`[data-row-id="${row}"][data-column-id="price"]`);
  await cell("1").click();
  await cell("1").press("Shift+ArrowDown");
  await cell("2").press("Shift+ArrowDown");
  await expect(page.getByRole("gridcell", { selected: true })).toHaveCount(3);
  await cell("3").press("Control+d");
  await expect(cell("2")).toContainText("$42.00");
  await expect(cell("3")).toContainText("$42.00");
  await cell("3").press("Control+z");
  await expect(cell("2")).toContainText("$59.13");
  await cell("3").press("Shift+PageDown");
  await expect(page.locator(".og-statusbar")).toContainText("cells selected");
});
test("drag fill extends a numeric series and keeps one undo transaction", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const cell = (row: string) =>
    page.locator(`[data-row-id="${row}"][data-column-id="price"]`);
  await cell("1").click();
  await page.evaluate(() => navigator.clipboard.writeText("20\n25"));
  await cell("1").press("Control+v");
  const handle = page.getByRole("button", {
    name: "Drag to fill cells; Alt-drag extends a numeric series",
  });
  await cell("4").scrollIntoViewIfNeeded();
  const start = await handle.boundingBox(),
    target = await cell("4").boundingBox();
  expect(start).not.toBeNull();
  expect(target).not.toBeNull();
  await page.keyboard.down("Alt");
  await page.mouse.move(start!.x + 4, start!.y + 4);
  await page.mouse.down();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(cell("3")).toContainText("$30.00");
  await expect(cell("4")).toContainText("$35.00");
  await cell("4").click();
  await cell("4").press("Control+z");
  await expect(cell("3")).toContainText("$76.26");
  await expect(cell("1")).toContainText("$20.00");
});
test("bounds the wide DOM while preserving pinning and logical keyboard focus", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Wide schema", exact: true }).click();
  const grid = page.getByRole("grid");
  await expect(grid).toHaveAttribute("aria-colcount", "131");
  expect(await page.getByRole("columnheader").count()).toBeLessThan(22);
  const company = page.locator('[data-row-id="1"][data-column-id="company"]'),
    trend = page.locator('[data-row-id="1"][data-column-id="trend"]');
  await expect(company).toHaveCSS("position", "sticky");
  await expect(trend).toHaveCSS("position", "sticky");
  const before = await company.boundingBox();
  await grid.evaluate((el) => {
    el.scrollLeft = 12800;
  });
  await expect(
    page.getByRole("button", { name: "Sort Metric 100", exact: true }),
  ).toBeVisible();
  expect((await company.boundingBox())!.x).toBeCloseTo(before!.x, 0);
  expect(await page.getByRole("columnheader").count()).toBeLessThan(24);
  await company.focus();
  await company.press("End");
  await expect(trend).toBeFocused();
  await trend.press("ArrowLeft");
  await expect(
    page.locator('[data-row-id="1"][data-column-id="metric120"]'),
  ).toBeFocused();
  await expect(
    page.locator('[data-row-id="1"][data-column-id="metric120"]'),
  ).toHaveAttribute("aria-colindex", "130");
});
