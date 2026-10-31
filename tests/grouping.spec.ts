import { readFileSync } from "node:fs";
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
    await expect(lab.getByRole("alert")).toHaveCount(0);
    const selectPage = grid.getByRole("checkbox", {
      name: "Select page subtrees",
    });
    await expect(selectPage).toBeEnabled();
    await selectPage.click();
    await expect(selectPage).toBeChecked();
    await selectPage.click();
    await expect(selectPage).not.toBeChecked();
    await expect(
      grid.locator(".og-total-row input[type=checkbox]"),
    ).toHaveCount(0);

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
  await expect(lab.locator("[data-column-id=name].og-pinned")).toHaveCount(0);
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

for (const width of [320, 375, 1440])
  test(`simultaneous server branches retain paging, retry and RTL at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Color theme" })
      .selectOption("dark");
    await page
      .getByRole("button", { name: "Server grouping lab", exact: true })
      .click();
    const lab = page.getByRole("region", { name: "Remote grouping example" });
    const grid = lab.getByRole("treegrid", {
      name: "Simultaneous server groups",
    });
    await grid
      .getByRole("button", { name: "Expand Team A", exact: true })
      .click();
    await expect(grid.getByText("Remote A 1", { exact: true })).toBeVisible();
    await grid
      .getByRole("button", { name: "Expand Team B", exact: true })
      .click();
    await expect(grid.getByText("Remote B 1", { exact: true })).toBeVisible();
    await expect(grid.getByText("Remote A 1", { exact: true })).toBeVisible();
    await grid
      .getByRole("button", { name: "Load more in this branch" })
      .first()
      .click();
    await expect(grid.getByText("Remote A 3", { exact: true })).toBeVisible();
    await expect(grid.getByText("Remote B 1", { exact: true })).toBeVisible();
    await lab.getByRole("button", { name: "Fail next Team A request" }).click();
    await expect(
      lab.getByText("Demo branch A is offline", { exact: true }),
    ).toBeVisible();
    await expect(grid.getByText("Remote B 1", { exact: true })).toBeVisible();
    const retry = grid.getByRole("button", { name: "Retry", exact: true });
    const retryBounds = await retry.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const cell = element
        .closest("[data-full-width-row-id]")!
        .getBoundingClientRect();
      return {
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        cellTop: cell.top,
        cellBottom: cell.bottom,
      };
    });
    expect(retryBounds.height).toBeGreaterThanOrEqual(44);
    expect(retryBounds.top).toBeGreaterThanOrEqual(retryBounds.cellTop);
    expect(retryBounds.bottom).toBeLessThanOrEqual(retryBounds.cellBottom);
    await retry.click();
    await expect(
      lab.getByText("Demo branch A is offline", { exact: true }),
    ).toHaveCount(0);
    await lab
      .getByRole("checkbox", { name: "Right-to-left server view" })
      .check();
    await expect(grid).toHaveAttribute("dir", "rtl");
    await expect(grid.getByText("Remote A 1", { exact: true })).toBeVisible();
    const first = grid.locator(".og-group-row [data-column-id=name]").first();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(grid.getByText("Remote A 1", { exact: true })).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await expect(grid.getByText("Remote A 1", { exact: true })).toBeVisible();
    await lab.getByRole("button", { name: "Collapse all branches" }).click();
    await expect(grid.getByText("Remote A 1", { exact: true })).toHaveCount(0);
    await expect(
      grid.getByRole("button", { name: "Expand Team A", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await grid
      .getByRole("button", { name: "Sort Amount", exact: true })
      .click();
    await grid
      .getByRole("button", { name: "Sort Amount", exact: true })
      .click();
    await expect(
      grid
        .locator(".og-group-row .og-cell-content")
        .filter({ hasText: /Team/ })
        .first(),
    ).toHaveText("Team B 3");
    await grid
      .getByRole("textbox", { name: "Filter Order", exact: true })
      .fill("Remote A 1");
    await expect(
      grid.getByRole("button", { name: "Expand Team B", exact: true }),
    ).toHaveCount(0);
    await grid
      .getByRole("button", { name: "Expand Team A", exact: true })
      .click();
    await expect(grid.getByText("Remote A 1", { exact: true })).toBeVisible();
    await expect(grid.getByText("Remote A 2", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

for (const theme of ["light", "dark"])
  test(`grouping controls have no serious accessibility violations in ${theme}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Color theme" })
      .selectOption(theme);
    await page
      .getByRole("button", { name: "Grouping lab", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Server grouping lab", exact: true })
      .click();
    const resident = page.getByRole("region", {
      name: "Resident grouping example",
    });
    await resident
      .getByRole("button", { name: "Add group", exact: true })
      .click();
    await resident
      .getByRole("button", { name: "Expand all groups", exact: true })
      .click();
    const remote = page.getByRole("region", {
      name: "Remote grouping example",
    });
    await remote
      .getByRole("button", { name: "Expand Team A", exact: true })
      .click();
    await expect(remote.getByText("Remote A 1", { exact: true })).toBeVisible();
    await page.addScriptTag({
      content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
    });
    const violations = await page.evaluate(async () =>
      (
        await (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.filter((value: any) =>
        ["critical", "serious"].includes(value.impact),
      ),
    );
    expect(violations).toEqual([]);
  });
