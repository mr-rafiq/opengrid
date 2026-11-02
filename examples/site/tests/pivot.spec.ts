import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { createParticipants } from "../src/participant-data";
const records = createParticipants(1000);
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
test("pivot uses weighted source aggregates, refreshes filters and exports real totals", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("showcase/");
  await page.getByRole("button", { name: "Pivot table", exact: true }).click();
  const grid = page.getByRole("grid", {
    name: "Participant pivot table",
    exact: true,
  });
  await expect(grid).toBeVisible();
  await expect(grid.locator(".og-filter-row")).toHaveCount(0);
  const rows = records.filter(
    (row) => row.country === "United Kingdom" && row.game === "Starfall Rally",
  );
  const sum = rows.reduce((total, row) => total + row.balance, 0);
  await expect(
    grid.getByText(money.format(sum), { exact: true }),
  ).toBeVisible();
  const side = page.getByRole("complementary", { name: "Grid tools" });
  await side
    .getByRole("combobox", { name: "Aggregation: Bank balance", exact: true })
    .selectOption("avg");
  await expect(
    grid.getByText(money.format(sum / rows.length), { exact: true }),
  ).toBeVisible();
  await side
    .getByRole("combobox", { name: "Aggregation: Bank balance", exact: true })
    .selectOption("count");
  await page
    .getByRole("searchbox", { name: "Search participants" })
    .fill("United Kingdom");
  await expect(
    page.getByText(/1 result rows.*167 filtered records/),
  ).toBeVisible();
  await expect(grid.getByText("Grand total", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pivot CSV", exact: true }).click();
  const download = await downloadPromise;
  const csv = await fs.readFile((await download.path())!, "utf8");
  expect(csv).toContain("Starfall Rally / Count Bank balance");
  expect(csv).toContain("Grand total");
  expect(csv).toContain("United Kingdom");
  await page.screenshot({
    path: info.outputPath("pivot-filtered-count.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(
    page.getByRole("grid", { name: "Participant showcase", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search participants" }),
  ).toHaveValue("United Kingdom");
  expect(errors).toEqual([]);
});
test("real pointer field drag and chip reorder have equivalent native controls", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("showcase/");
  await page.getByRole("button", { name: "Pivot table", exact: true }).click();
  const side = page.getByRole("complementary", { name: "Grid tools" });
  await side.getByText("Available fields", { exact: true }).click();
  await side.getByRole("searchbox", { name: "Search fields" }).fill("Language");
  const source = side.locator('[data-pivot-source="language"]');
  await source.dragTo(side.locator('[data-pivot-zone="rows"] h3'));
  await expect(
    side.getByRole("button", { name: "Remove: Language (Rows)", exact: true }),
  ).toBeVisible();
  const country = side
    .locator('[data-pivot-zone="rows"] li')
    .filter({ hasText: "Country" });
  const language = side
    .locator('[data-pivot-zone="rows"] li')
    .filter({ hasText: "Language" });
  await language.dragTo(country);
  await expect(
    side.locator('[data-pivot-zone="rows"] li').first(),
  ).toContainText("Language");
  await side
    .getByRole("button", { name: "Move later: Language (Rows)", exact: true })
    .click();
  await expect(
    side.locator('[data-pivot-zone="rows"] li').first(),
  ).toContainText("Country");
  await side
    .getByRole("button", { name: "Remove: Language (Rows)", exact: true })
    .click();
  await side.getByRole("button", { name: "Clear fields", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a value to summarize" }),
  ).toBeVisible();
  await side
    .getByRole("combobox", { name: "Values field", exact: true })
    .selectOption("balance");
  await side
    .getByRole("button", { name: "Add values field", exact: true })
    .click();
  await expect(
    page.getByRole("grid", { name: "Participant pivot table", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("pivot-summary.png"),
    fullPage: true,
  });
});
test("pivot rejects excessive output without replacing the current matrix", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("showcase/");
  await page.getByRole("button", { name: "Pivot table", exact: true }).click();
  const side = page.getByRole("complementary", { name: "Grid tools" });
  await side
    .getByRole("combobox", { name: "Columns field", exact: true })
    .selectOption("name");
  await side
    .getByRole("button", { name: "Add columns field", exact: true })
    .click();
  await expect(side.getByRole("alert")).toContainText("exceeds 256 columns");
  await expect(
    side.getByRole("button", { name: "Remove: Name (Columns)", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("grid", { name: "Participant pivot table", exact: true }),
  ).toBeVisible();
});
test("pivot stays contained across phone, tablet and desktop themes", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  for (const width of [320, 375, 390, 556, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("showcase/");
    await page
      .getByRole("button", { name: "Pivot table", exact: true })
      .click();
    for (const style of ["minimal", "material"])
      for (const mode of ["light", "dark"]) {
        await page
          .getByRole("combobox", { name: "Grid style", exact: true })
          .selectOption(style);
        await page
          .getByRole("combobox", { name: "Demo appearance", exact: true })
          .selectOption(mode);
        const grid = page.getByRole("grid", {
          name: "Participant pivot table",
          exact: true,
        });
        await expect(grid).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`pivot-${width}-${style}-${mode}.png`),
          fullPage: true,
        });
        if (width < 1000) {
          const open = page.getByRole("button", {
            name: "Pivot fields",
            exact: true,
          });
          await open.click();
          const drawer = page.getByRole("dialog", {
            name: "Grid tools",
            exact: true,
          });
          await expect(drawer).toBeVisible();
          await drawer
            .getByRole("combobox", {
              name: "Aggregation: Bank balance",
              exact: true,
            })
            .selectOption("avg");
          await page.screenshot({
            path: info.outputPath(`pivot-panel-${width}-${style}-${mode}.png`),
            fullPage: true,
          });
          await page.keyboard.press("Escape");
          await expect(drawer).not.toBeVisible();
          await expect(open).toBeFocused();
        }
        if (width < 540) {
          await grid.evaluate((node) => {
            node.scrollLeft = 190;
          });
          const value = grid
            .locator(".og-row:not(.og-pinned-row)")
            .first()
            .locator('.og-cell[data-column-id^="pivot:value:"]')
            .first();
          await expect(value).toBeVisible();
          const viewport = (await grid.boundingBox())!;
          const bounds = (await value.boundingBox())!;
          expect(bounds.x).toBeGreaterThanOrEqual(viewport.x - 1);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(
            viewport.x + viewport.width + 1,
          );
          await page.screenshot({
            path: info.outputPath(
              `pivot-value-readable-${width}-${style}-${mode}.png`,
            ),
            fullPage: true,
          });
          await grid.evaluate((node) => {
            node.scrollLeft = 0;
          });
        }
      }
  }
});
test("the 100,000-record source produces a bounded matrix with exact source totals", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("showcase/");
  await page
    .getByRole("combobox", { name: "Data size", exact: true })
    .selectOption("100000");
  await expect(
    page.getByRole("combobox", { name: "Data size", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "Pivot table", exact: true }).click();
  const grid = page.getByRole("grid", {
    name: "Participant pivot table",
    exact: true,
  });
  await expect(grid).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByText(/6 result rows.*100,000 filtered records/),
  ).toBeVisible();
  const sum = createParticipants(100000)
    .filter(
      (row) =>
        row.country === "United Kingdom" && row.game === "Starfall Rally",
    )
    .reduce((total, row) => total + row.balance, 0);
  await expect(
    grid.getByText(money.format(sum), { exact: true }),
  ).toBeVisible();
  expect(await grid.locator(".og-row").count()).toBeLessThan(12);
});
test("pivot fields and matrix have no serious or critical automated accessibility findings in either color mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("showcase/");
  await page.getByRole("button", { name: "Pivot table", exact: true }).click();
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  for (const mode of ["light", "dark"]) {
    await page
      .getByRole("combobox", { name: "Demo appearance", exact: true })
      .selectOption(mode);
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: () => Promise<{
              violations: { id: string; impact: string }[];
            }>;
          };
        }
      ).axe;
      return (await axe.run()).violations
        .filter((item) => ["serious", "critical"].includes(item.impact))
        .map((item) => item.id);
    });
    expect(violations).toEqual([]);
  }
});
test.describe("touch pivot controls", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("configures fields with touch alternatives and navigates result cells", async ({
    page,
  }, info) => {
    await page.goto("showcase/");
    await page.getByRole("button", { name: "Pivot table", exact: true }).tap();
    await page.getByRole("button", { name: "Pivot fields", exact: true }).tap();
    const drawer = page.getByRole("dialog", {
      name: "Grid tools",
      exact: true,
    });
    await drawer
      .getByRole("combobox", { name: "Rows field", exact: true })
      .selectOption("language");
    await drawer
      .getByRole("button", { name: "Add rows field", exact: true })
      .tap();
    await expect(
      drawer.getByRole("button", {
        name: "Remove: Language (Rows)",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("pivot-touch-fields.png"),
      fullPage: true,
    });
    await drawer
      .getByRole("button", { name: "Close grid tools", exact: true })
      .tap();
    const grid = page.getByRole("grid", {
      name: "Participant pivot table",
      exact: true,
    });
    await grid.getByRole("gridcell").first().tap();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(grid.locator('[role="gridcell"]:focus')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole("button", { name: "Pivot fields", exact: true }).tap();
    await drawer.getByLabel("Grand total", { exact: true }).uncheck();
    const close = drawer.getByRole("button", {
      name: "Close grid tools",
      exact: true,
    });
    const bounds = await close.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
    await close.tap();
    await expect(grid.getByText("Grand total", { exact: true })).toHaveCount(0);
  });
});
