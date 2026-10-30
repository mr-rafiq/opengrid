import { gridRoot } from "./grid-root.js";
import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
const cell = (grid: Locator, row: string, column: string) =>
  grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
async function openLab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "RTL direction lab", exact: true })
    .click();
  const grid = page.getByRole("grid", { name: "Direction records" });
  await grid.scrollIntoViewIfNeeded();
  return grid;
}
test("RTL pins, virtual scrolling, navigation, resizing and live editor direction changes", async ({
  page,
}) => {
  const grid = await openLab(page),
    root = gridRoot(grid),
    name = cell(grid, "rtl1", "name"),
    team = cell(grid, "rtl1", "team");
  await expect(grid).toHaveAttribute("dir", "rtl");
  const before = (await name.boundingBox())!,
    right = (await team.boundingBox())!;
  expect(before.x).toBeLessThan(right.x);
  await grid.evaluate((element) => {
    element.scrollLeft = -1500;
  });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollLeft))
    .toBe(-1500);
  expect((await name.boundingBox())!.x).toBeCloseTo(before.x, 0);
  expect((await team.boundingBox())!.x).toBeCloseTo(right.x, 0);
  expect(await grid.getByRole("columnheader").count()).toBeLessThan(18);
  await team.focus();
  await team.press("ArrowLeft");
  await expect(cell(grid, "rtl1", "status")).toBeFocused();
  await cell(grid, "rtl1", "status").press("ArrowLeft");
  const amount = cell(grid, "rtl1", "amount");
  await expect(amount).toBeFocused();
  await amount.press("End");
  await expect(cell(grid, "rtl1", "region")).toBeFocused();
  await cell(grid, "rtl1", "region").press("Home");
  await expect(team).toBeFocused();
  const resize = grid.getByRole("separator", {
    name: "Resize Team",
    exact: true,
  });
  const width = (await team.boundingBox())!.width;
  await resize.press("ArrowLeft");
  expect((await team.boundingBox())!.width).toBeCloseTo(width + 10, 0);
  await name.focus();
  await name.press("F2");
  const editor = name.getByRole("textbox");
  await editor.fill("RTL preserved draft");
  const handle = await editor.elementHandle();
  await editor.press("Control+Shift+d");
  await expect(grid).toHaveAttribute("dir", "ltr");
  await expect(editor).toBeFocused();
  expect(
    await handle!.evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await expect(editor).toHaveValue("RTL preserved draft");
  await editor.press("Enter");
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(name).toContainText("Record 1");
});
test("RTL ranges copy inline order and paste/fill remain atomic", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const grid = await openLab(page);
  await cell(grid, "rtl1", "team").click();
  await cell(grid, "rtl2", "amount").click({ modifiers: ["Shift"] });
  await expect(grid.getByRole("gridcell", { selected: true })).toHaveCount(6);
  await cell(grid, "rtl2", "amount").press("Control+c");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
  ).toBe("Atlas\tReady\t10\nAtlas\tReady\t11");
  await cell(grid, "rtl1", "amount").click();
  await page.evaluate(() => navigator.clipboard.writeText("55\n60"));
  await cell(grid, "rtl1", "amount").press("Control+v");
  await expect(cell(grid, "rtl2", "amount")).toContainText("60");
  await cell(grid, "rtl2", "amount").press("Control+z");
  await expect(cell(grid, "rtl1", "amount")).toContainText("10");
  await cell(grid, "rtl1", "amount").click();
  await cell(grid, "rtl1", "amount").press("Shift+ArrowDown");
  await cell(grid, "rtl2", "amount").press("Control+d");
  await expect(cell(grid, "rtl2", "amount")).toContainText("10");
  await cell(grid, "rtl2", "amount").press("Control+z");
  await expect(cell(grid, "rtl2", "amount")).toContainText("11");
});
test("RTL merged columns and retained row-span owners keep pin geometry and ARIA", async ({
  page,
}) => {
  const grid = await openLab(page);
  await page
    .getByRole("combobox", { name: "Direction layout" })
    .selectOption("columns");
  const team = cell(grid, "rtl1", "team");
  await expect(team).toHaveAttribute("aria-colspan", "2");
  expect((await team.boundingBox())!.width).toBeCloseTo(225, 0);
  await expect(cell(grid, "rtl1", "status")).toHaveCount(0);
  const merged = cell(grid, "rtl1", "metric1");
  await expect(merged).toHaveAttribute("aria-colspan", "6");
  await merged.focus();
  await merged.press("ArrowLeft");
  await expect(cell(grid, "rtl1", "metric7")).toBeFocused();
  await cell(grid, "rtl1", "metric7").press("ArrowRight");
  await expect(merged).toBeFocused();
  await grid.evaluate((element) => {
    element.scrollLeft = -400;
  });
  await expect(merged).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Direction layout" })
    .selectOption("rows");
  const region = cell(grid, "rtl1", "region");
  await expect(region).toHaveAttribute("aria-rowspan", "120");
  await grid.evaluate((element) => {
    element.scrollTop = 1200;
    element.scrollLeft = -900;
  });
  await expect(
    grid.locator('[data-row-span-anchor-only="true"]').first(),
  ).toBeVisible();
  expect((await region.boundingBox())!.height).toBeCloseTo(4560, 0);
  await region.focus();
  await region.press("ArrowDown");
  await expect(cell(grid, "rtl121", "region")).toBeFocused();
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () =>
    (
      await (
        window as unknown as {
          axe: {
            run(): Promise<{ violations: { id: string; impact: string }[] }>;
          };
        }
      ).axe.run()
    ).violations
      .filter(
        (value) => value.impact === "serious" || value.impact === "critical",
      )
      .map((value) => value.id),
  );
  expect(violations).toEqual([]);
});
test("server route controls and million-row live navigation work in RTL", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Remote model lab", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Right-to-left remote grids", exact: true })
    .check();
  const server = page.getByRole("grid", {
    name: "Mock server orders",
    exact: true,
  });
  await expect(server).toHaveAttribute("dir", "rtl");
  await server
    .getByRole("button", { name: "Open group Americas", exact: true })
    .click();
  await expect(server).toContainText("Order ");
  const live = page.getByRole("grid", {
    name: "Simulated live orders",
    exact: true,
  });
  await expect(live).toHaveAttribute("dir", "rtl");
  const first = live.locator(
    '[data-viewport-row="0"][data-column-id="region"]',
  );
  await first.focus();
  await first.press("ArrowLeft");
  await expect(
    live.locator('[data-viewport-row="0"][data-column-id="price"]'),
  ).toBeFocused();
  await live
    .locator('[data-viewport-row="0"][data-column-id="price"]')
    .press("Control+End");
  await expect(
    live.locator('[data-viewport-row="999999"][data-column-id="name"]'),
  ).toBeFocused();
  expect(await live.getByRole("row").count()).toBeLessThan(35);
});
