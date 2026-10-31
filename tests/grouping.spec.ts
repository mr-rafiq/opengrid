import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"])
  test(`resident group panel, totals and aggregate sorting work in ${theme}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Color theme" })
      .selectOption(theme);
    await page
      .getByRole("button", { name: "Grouping lab", exact: true })
      .click();
    const lab = page.getByRole("region", { name: "Resident grouping example" });
    const panel = lab.getByRole("region", { name: "Row groups" });
    await lab
      .getByRole("button", { name: "Sort Team", exact: true })
      .dragTo(panel);
    await expect(
      panel.getByRole("button", { name: "Sort groups by Team" }),
    ).toBeVisible();
    const grid = lab.getByRole("treegrid", { name: "Grouped orders" });
    await expect(
      grid.locator(".og-group-row [data-column-id=name] .og-cell-content"),
    ).toHaveText(["A 2", "B 2"]);
    await lab.getByRole("button", { name: "Sort Amount", exact: true }).click();
    await expect(
      grid.locator(".og-group-row [data-column-id=name] .og-cell-content"),
    ).toHaveText(["B 2", "A 2"]);
    await lab
      .getByRole("button", { name: "Expand all groups", exact: true })
      .click();
    await expect(
      grid.locator(".og-total-row [data-column-id=amount]"),
    ).toHaveText(["8", "10", "18"]);
    await lab
      .getByRole("combobox", { name: "Subtotal position" })
      .selectOption("top");
    await lab
      .getByRole("combobox", { name: "Grand total position" })
      .selectOption("top");
    await expect(grid.locator(".og-row").first()).toHaveClass(/og-total-row/);
    await lab
      .getByRole("textbox", { name: "Filter Area", exact: true })
      .fill("West");
    await expect(grid.getByText("Grand total", { exact: true })).toBeVisible();
    await expect(
      grid.locator(".og-total-row [data-column-id=amount]").first(),
    ).toHaveText("1");
    await lab
      .getByRole("textbox", { name: "Filter Area", exact: true })
      .fill("");
    await panel.getByRole("button", { name: "Add group", exact: true }).click();
    await panel
      .getByRole("button", { name: "Move grouping Area earlier" })
      .click();
    await expect(panel.locator("[data-group-focus]")).toHaveText([
      "Area",
      "Team",
    ]);
    await expect(
      panel.getByRole("button", { name: "Sort groups by Area" }),
    ).toBeFocused();
    await panel.getByRole("button", { name: "Remove grouping Area" }).click();
    await expect(
      panel.getByRole("button", { name: "Sort groups by Team" }),
    ).toBeFocused();
  });
test("phone touch and keyboard grouping controls fit without dragging", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Grouping lab", exact: true }).tap();
  const lab = page.getByRole("region", { name: "Resident grouping example" });
  const panel = lab.getByRole("region", { name: "Row groups" });
  await panel.getByRole("button", { name: "Add group", exact: true }).tap();
  await panel.getByRole("button", { name: "Add group", exact: true }).tap();
  await panel.getByRole("button", { name: "Move grouping Area earlier" }).tap();
  await expect(panel.locator("[data-group-focus]")).toHaveText([
    "Area",
    "Team",
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  const button = panel.getByRole("button", { name: "Remove grouping Area" });
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    panel.getByRole("button", { name: "Sort groups by Team" }),
  ).toBeFocused();
  await context.close();
});
