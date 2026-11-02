import { test, expect } from "@playwright/test";
import { createParticipants } from "../src/participant-data";
const records = createParticipants(1000);
const participants = records.filter((row) => row.country === "United Kingdom");
const sum = participants.reduce((total, row) => total + row.balance, 0);
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
for (const mode of ["light", "dark"]) {
  test(`aggregate currency, average and count remain meaningful in ${mode} mode`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("showcase/");
    await page
      .getByRole("combobox", { name: "Demo appearance", exact: true })
      .selectOption(mode);
    await page
      .getByRole("combobox", { name: "Grid style" })
      .selectOption("material");
    let grid = page.getByRole("grid", { name: "Participant showcase" });
    await grid
      .getByRole("button", { name: "Column menu for Record", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Pin left", exact: true }).click();
    const groups = page.locator(".showcase-grid > .og-root > .og-group-panel");
    await groups.getByRole("combobox").selectOption("country");
    await groups
      .getByRole("button", { name: "Add group", exact: true })
      .click();
    grid = page.getByRole("treegrid", { name: "Participant showcase" });
    await grid.evaluate((node) => {
      node.scrollLeft = 800;
    });
    const group = grid.getByRole("row").filter({
      has: page.getByRole("button", {
        name: "Expand United Kingdom",
        exact: true,
      }),
    });
    const cell = group.locator('[data-column-id="balance"]');
    await expect(cell).toHaveText(money.format(sum));
    const values = page
      .getByRole("complementary", { name: "Grid tools" })
      .getByRole("combobox", { name: "Values: Bank balance", exact: true });
    await values.selectOption("avg");
    await expect(cell).toHaveText(money.format(sum / participants.length));
    await values.selectOption("count");
    await expect(cell).toHaveText(String(participants.length));
    await page.screenshot({
      path: info.outputPath(`aggregate-count-${mode}.png`),
      fullPage: true,
    });
    await values.selectOption("sum");
    await expect(cell).toHaveText(money.format(sum));
    await page.screenshot({
      path: info.outputPath(`aggregate-currency-${mode}.png`),
      fullPage: true,
    });
    await group
      .getByRole("button", { name: "Expand United Kingdom", exact: true })
      .click();
    const source = grid.locator(
      '[data-row-id="participant-1"][data-column-id="balance"]',
    );
    await expect(source).toHaveText(money.format(records[0].balance));
    await page
      .getByRole("searchbox", { name: "Search participants" })
      .fill("no-matching-participant");
    await expect(grid.locator(".og-cell")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("portfolio grouped price and market value use their currency formatters", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("demo/");
  await page
    .getByRole("button", { name: "Group by sector", exact: true })
    .click();
  const grid = page.getByRole("treegrid", { name: "Portfolio holdings" });
  await grid.evaluate((node) => {
    node.scrollLeft = 600;
  });
  for (const column of ["price", "value"]) {
    const cells = grid.locator(`.og-cell[data-column-id="${column}"]`);
    expect(await cells.count()).toBeGreaterThan(0);
    for (const cell of await cells.all())
      await expect(cell).toHaveText(/^\$[\d,]+\.\d{2}$/);
  }
  await page.screenshot({
    path: info.outputPath("portfolio-aggregate-currency.png"),
    fullPage: true,
  });
});
