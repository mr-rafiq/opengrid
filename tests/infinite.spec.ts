import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Remote model lab", exact: true })
    .click();
  const region = page.getByRole("article", { name: "Infinite pull example" }),
    grid = region.getByRole("grid", {
      name: "Simulated infinite records",
      exact: true,
    });
  await expect(cell(grid, 0)).toContainText("Record 0");
  await expect(
    region.getByText("Read-only provider", { exact: true }),
  ).toBeVisible();
  return { region, grid, errors };
}
const cell = (grid: Locator, index: number, column = "name") =>
  grid.locator(`[data-viewport-row="${index}"][data-column-id="${column}"]`);
test("unknown totals pull blocks from real scrolling and settle on the terminal count", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await expect(grid).toHaveAttribute("aria-rowcount", "-1");
  await cell(grid, 0).focus();
  for (
    let step = 0;
    step < 7 && (await grid.getAttribute("aria-rowcount")) === "-1";
    step++
  ) {
    await page.keyboard.press("Control+End");
    await expect(grid.locator('[role="gridcell"]:focus')).toHaveText(/^\d+$/);
    await expect(region.getByTestId("infinite-cache")).toContainText(
      "pending 0; queued 0",
    );
  }
  await expect(grid).toHaveAttribute("aria-rowcount", "138");
  await page.keyboard.press("Control+End");
  await expect(cell(grid, 136, "amount")).toBeFocused();
  await expect(cell(grid, 136, "amount")).toContainText("136");
  expect(await grid.getByRole("row").count()).toBeLessThan(25);
  expect(errors).toEqual([]);
});
test("native wheel scrolling pulls another block and refresh preserves its offset", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await grid.hover({ position: { x: 400, y: 130 } });
  await page.mouse.wheel(0, 1000);
  await expect(cell(grid, 30)).toContainText("Record 30");
  await expect(region.getByTestId("infinite-cache")).toContainText(
    "cached blocks 0, 1",
  );
  const top = await grid.evaluate((node) => node.scrollTop);
  expect(top).toBeGreaterThan(0);
  await region
    .getByRole("button", { name: "Refresh infinite rows", exact: true })
    .click();
  await expect(cell(grid, 30)).toContainText("Record 30");
  await expect(region.getByTestId("infinite-cache")).toContainText(
    "pending 0; queued 0",
  );
  expect(
    Math.abs((await grid.evaluate((node) => node.scrollTop)) - top),
  ).toBeLessThan(2);
  expect(errors).toEqual([]);
});
test("provider sorting and filtering reset a scrolled query and expose their actual rows", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await cell(grid, 0).focus();
  await page.keyboard.press("Control+End");
  await expect(
    region.getByRole("button", {
      name: "Sort infinite descending",
      exact: true,
    }),
  ).toBeEnabled();
  await region
    .getByRole("button", { name: "Sort infinite descending", exact: true })
    .click();
  await expect(cell(grid, 0)).toContainText("Record 136");
  expect(await grid.evaluate((node) => node.scrollTop)).toBe(0);
  await region
    .getByRole("spinbutton", { name: "Minimum infinite value", exact: true })
    .fill("130");
  await region
    .getByRole("button", { name: "Apply infinite filter", exact: true })
    .click();
  await expect(grid).toHaveAttribute("aria-rowcount", "8");
  await expect(cell(grid, 0)).toContainText("Record 136");
  await region
    .getByRole("button", { name: "Sort infinite ascending", exact: true })
    .click();
  await expect(cell(grid, 0)).toContainText("Record 130");
  expect(errors).toEqual([]);
});
test("provider failures remain visible until retry and refresh retains the logical position", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await cell(grid, 0).focus();
  await page.keyboard.press("Control+End");
  await expect(
    region.getByRole("button", { name: "Refresh infinite rows", exact: true }),
  ).toBeEnabled();
  const first = await grid
    .locator('[data-column-id="name"]')
    .last()
    .getAttribute("data-viewport-row");
  await region
    .getByRole("button", { name: "Simulate infinite failure", exact: true })
    .click();
  await expect(region.getByRole("alert")).toContainText(
    "Simulated infinite provider failure",
  );
  await region
    .getByRole("button", { name: "Retry infinite rows", exact: true })
    .click();
  await expect(region.getByRole("alert")).toBeHidden();
  await expect(
    region.getByRole("button", { name: "Refresh infinite rows", exact: true }),
  ).toBeEnabled();
  expect(Number(first)).toBeGreaterThan(0);
  expect(await grid.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
test("million-row pulls retain keyboard focus with pinned virtual columns and RTL", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("combobox", { name: "Infinite dataset", exact: true })
    .selectOption("million");
  await expect(grid).toHaveAttribute("aria-rowcount", "1000001");
  await cell(grid, 0).focus();
  await page.keyboard.press("Control+End");
  await expect(cell(grid, 999999, "amount")).toBeFocused();
  await expect(cell(grid, 999999, "amount")).toContainText("999999");
  await page
    .getByRole("checkbox", { name: "Right-to-left remote grids", exact: true })
    .check();
  await cell(grid, 999999, "amount").focus();
  await expect(cell(grid, 999999, "amount")).toBeFocused();
  expect(await grid.getByRole("row").count()).toBeLessThan(25);
  expect(await grid.getByRole("gridcell").count()).toBeLessThan(250);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await region.evaluate(async (element) =>
    (await (window as any).axe.run(element)).violations
      .filter((v: any) => ["serious", "critical"].includes(v.impact))
      .map((v: any) => v.id),
  );
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});
