import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Column commands lab", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Column commands example",
    exact: true,
  });
  const grid = region.locator(
    '[role="grid"][aria-label="Column command inventory"],[role="treegrid"][aria-label="Column command inventory"]',
  );
  return { region, grid, errors };
}
const trigger = (grid: Locator, column = "Customer") =>
  grid.getByRole("button", { name: `Column menu for ${column}`, exact: true });
async function open(page: Page, grid: Locator, column = "Customer") {
  await trigger(grid, column).click();
  const menu = page.getByRole("menu", {
    name: `Column commands for ${column}`,
    exact: true,
  });
  await expect(menu).toBeVisible();
  return menu;
}
const snapshot = async (region: Locator) =>
  JSON.parse((await region.getByTestId("column-command-data").textContent())!);
async function choose(menu: Locator, name: string) {
  await menu.getByRole("menuitem", { name, exact: true }).click();
}
test("header native popovers support keyboard, context origins, sort and physical pinning", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await trigger(grid).focus();
  await trigger(grid).press("ArrowDown");
  let menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: "Sort ascending", exact: true }),
  ).toBeFocused();
  expect(
    await page
      .locator(".og-context-menu-popup")
      .evaluate((node) => node.matches(":popover-open")),
  ).toBe(true);
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", { name: "Delayed amount sort", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger(grid)).toBeFocused();
  const sort = grid.getByRole("button", { name: "Sort Customer", exact: true });
  await sort.press("Shift+F10");
  await choose(page.getByRole("menu"), "Inspect column");
  await expect(region.getByLabel("Last column app action")).toHaveText(
    "Inspected name from keyboard",
  );
  await sort.click({ button: "right" });
  await choose(page.getByRole("menu"), "Inspect column");
  await expect(region.getByLabel("Last column app action")).toHaveText(
    "Inspected name from context",
  );
  await sort.click({ button: "right", modifiers: ["Control"] });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  menu = await open(page, grid, "Amount");
  await choose(menu, "Sort ascending");
  expect((await snapshot(region)).sorting).toEqual([
    { columnId: "amount", direction: "asc" },
  ]);
  expect((await snapshot(region)).rows[0].id).toBe("head180");
  menu = await open(page, grid);
  await choose(menu, "Pin right");
  expect((await snapshot(region)).pinned.name).toBe("right");
  menu = await open(page, grid);
  await choose(menu, "Unpin column");
  expect((await snapshot(region)).pinned.name).toBeNull();
  expect(errors).toEqual([]);
});
test("header grouping, expansion, hiding and chooser operate on real state with connected focus", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  let menu = await open(page, grid, "Team");
  await choose(menu, "Group by Team");
  expect((await snapshot(region)).groupBy).toEqual(["team"]);
  expect(
    (await snapshot(region)).rows.every(
      (row: { kind: string }) => row.kind === "group",
    ),
  ).toBe(true);
  menu = await open(page, grid, "Team");
  await choose(menu, "Expand groups");
  expect((await snapshot(region)).expanded).toHaveLength(3);
  expect(
    (await snapshot(region)).rows.some(
      (row: { kind: string }) => row.kind === "row",
    ),
  ).toBe(true);
  menu = await open(page, grid, "Team");
  await choose(menu, "Collapse groups");
  expect((await snapshot(region)).expanded).toEqual([]);
  menu = await open(page, grid, "Team");
  await choose(menu, "Remove Team grouping");
  menu = await open(page, grid);
  await choose(menu, "Hide Customer");
  await expect(trigger(grid)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      document.activeElement?.matches(".og-column-menu-trigger"),
    ),
  ).toBe(true);
  menu = await open(page, grid, "Record");
  await choose(menu, "Choose columns");
  await expect(region.locator(".og-chooser")).toHaveAttribute("open", "");
  await region
    .locator(".og-chooser")
    .getByRole("checkbox", { name: "Show Customer", exact: true })
    .check();
  await expect(trigger(grid)).toBeVisible();
  expect(errors).toEqual([]);
});
test("header filter command transfers focus to the existing condition dialog and preserves its query", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await choose(await open(page, grid), "Focus column filter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await dialog.getByRole("textbox").first().fill("Customer 12");
  await dialog
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await snapshot(region)).rows.length).toBeLessThan(60);
  expect(errors).toEqual([]);
});
test("header sizing uses actual text, restores defaults and cancels before a same-event publication", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await choose(await open(page, grid), "Size this column");
  const sized = (await snapshot(region)).widths.name;
  expect(sized).toBeGreaterThan(80);
  expect(sized).not.toBe(240);
  await choose(await open(page, grid), "Reset this width");
  expect((await snapshot(region)).widths.name).toBeUndefined();
  await open(page, grid);
  await page
    .getByRole("menuitem", { name: "Size this column", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      button.closest('[role="menu"]')!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await snapshot(region)).widths.name).toBeUndefined();
  await choose(await open(page, grid), "Size rendered columns");
  expect((await snapshot(region)).widths.name).toBeGreaterThan(80);
  expect((await snapshot(region)).widths.metric30).toBeUndefined();
  await choose(await open(page, grid), "Fit columns to grid");
  const fitted = (await snapshot(region)).widths;
  expect(Object.keys(fitted).length).toBeGreaterThan(20);
  expect(
    Object.values(fitted).every(
      (width) => Number.isFinite(width) && Number(width) >= 40,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test.describe("native header touch activation", () => {
  test.use({ hasTouch: true });
  test("tap opens and activates the header menu and the existing filter dialog", async ({
    page,
  }) => {
    const { region, grid, errors } = await setup(page);
    await trigger(grid, "Amount").tap();
    await page
      .getByRole("menuitem", { name: "Sort ascending", exact: true })
      .tap();
    expect((await snapshot(region)).sorting).toEqual([
      { columnId: "amount", direction: "asc" },
    ]);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await trigger(grid).tap();
    await page
      .getByRole("menuitem", { name: "Focus column filter", exact: true })
      .tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
test("cancelled async header commands cannot sort after their delayed continuation", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const menu = await open(page, grid);
  await choose(menu, "Delayed amount sort");
  await expect(menu).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(trigger(grid)).toBeFocused();
  // Pass the cancelled task's original delay before checking for a late write.
  await page.waitForTimeout(1100);
  await choose(await open(page, grid), "Inspect column");
  await expect(region.getByLabel("Last column app action")).toHaveText(
    "Inspected name from button",
  );
  expect((await snapshot(region)).sorting).toEqual([]);
  expect(errors).toEqual([]);
});
test("header menus retain language, RTL and dark theme with windowed columns and accessible markup", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await grid.evaluate((node) => {
    node.scrollLeft = 3000;
    node.dispatchEvent(new Event("scroll"));
  });
  await expect(
    grid.getByRole("button", {
      name: "Column menu for Metric 25",
      exact: true,
    }),
  ).toBeVisible();
  expect(await grid.getByRole("columnheader").count()).toBeLessThan(34);
  await open(page, grid, "Amount");
  const menu = page.getByRole("menu"),
    original = await menu
      .getByRole("menuitem", { name: "Sort ascending", exact: true })
      .elementHandle();
  await page.keyboard.press("Control+Shift+L");
  await page.keyboard.press("Control+Shift+D");
  await page.keyboard.press("Control+Shift+T");
  const translated = menu.getByRole("menuitem", {
    name: "Ordenar de forma ascendente",
    exact: true,
  });
  await expect(translated).toBeFocused();
  expect(
    await translated.evaluate((node, previous) => node === previous, original),
  ).toBe(true);
  await expect(menu).toHaveAccessibleName("Acciones de columna de Amount");
  await expect(region.locator(".og-root")).toHaveClass(/og-dark/);
  const popup = page.locator(".og-context-menu-popup"),
    box = (await popup.boundingBox())!,
    viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  expect(
    await page.evaluate(async () => {
      const runner = (
        window as unknown as {
          axe: {
            run(
              root: Element,
            ): Promise<{ violations: { id: string; impact: string | null }[] }>;
          };
        }
      ).axe;
      const root = document
        .querySelector('[role="grid"][aria-label="Column command inventory"]')!
        .closest(".og-root")!;
      return (await runner.run(root)).violations
        .filter(
          (item) => item.impact === "serious" || item.impact === "critical",
        )
        .map((item) => item.id);
    }),
  ).toEqual([]);
  await popup.screenshot({ path: ".npm-cache/column-menu-spanish-rtl.png" });
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(() =>
      document.activeElement?.matches(".og-column-menu-trigger"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
