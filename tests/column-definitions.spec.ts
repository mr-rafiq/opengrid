import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", {
      name: "Runtime column definitions lab",
      exact: true,
    })
    .click();
  const article = page.getByRole("article", {
    name: "Runtime column definitions example",
    exact: true,
  });
  const grid = article.getByRole("grid", {
    name: "Runtime columns",
    exact: true,
  });
  await expect(cell(grid)).toContainText("Shared current");
  return { article, grid, errors };
}
const cell = (grid: Locator, row = "schema-1", column = "name") =>
  grid.locator(
    `[role="gridcell"][data-row-id="${row}"][data-column-id="${column}"]`,
  );
test("same-ID field replacement cancels a focused draft, then fresh editing and history use the new field", async ({
  page,
}) => {
  const { article, grid, errors } = await setup(page);
  await cell(grid).dblclick();
  const editor = grid.getByRole("textbox", { name: /Edit Current record/ });
  await editor.fill("Uncommitted old field");
  // Programmatic definition updates can occur while the old editor owns focus.
  await article
    .getByRole("button", { name: "Replace record field", exact: true })
    .dispatchEvent("click");
  await expect(editor).toHaveCount(0);
  await expect(cell(grid)).toContainText("Alternate 1");
  await expect(
    article.locator('output[aria-label="Column source values"]'),
  ).toHaveText("Shared current | Alternate 1");
  await cell(grid).dblclick();
  const next = grid.getByRole("textbox", { name: /Edit Alternate record/ });
  await next.fill("Fresh alternate");
  await next.press("Enter");
  await expect(
    article.locator('output[aria-label="Column source values"]'),
  ).toHaveText("Shared current | Fresh alternate");
  await article.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cell(grid)).toContainText("Alternate 1");
  expect(errors).toEqual([]);
});
test("replacement preserves resized pinned layout and selection while new and removed IDs have clean defaults", async ({
  page,
}) => {
  const { article, grid, errors } = await setup(page);
  await article
    .getByRole("button", { name: "Pin record column", exact: true })
    .click();
  await article
    .getByRole("button", { name: "Widen record column", exact: true })
    .click();
  const before = await cell(grid).boundingBox();
  await expect
    .poll(async () => (await cell(grid).boundingBox())!.width)
    .toBe(280);
  const select = grid.getByRole("checkbox", {
    name: "Select row schema-1",
    exact: true,
  });
  await select.check();
  await article
    .getByRole("button", { name: "Replace record field", exact: true })
    .click();
  await expect
    .poll(async () => (await cell(grid).boundingBox())!.width)
    .toBe(before!.width);
  expect(await cell(grid).evaluate((el) => getComputedStyle(el).position)).toBe(
    "sticky",
  );
  await expect(select).toBeChecked();
  await article
    .getByRole("button", { name: "Remove amount column", exact: true })
    .click();
  await expect(cell(grid, "schema-1", "amount")).toHaveCount(0);
  await expect(grid).toHaveAttribute("aria-colcount", "3");
  await article
    .getByRole("button", { name: "Add amount column", exact: true })
    .click();
  await expect(cell(grid, "schema-1", "amount")).toContainText("1");
  await expect(select).toBeChecked();
  expect(errors).toEqual([]);
});
test("rejected definitions retain a draft and accepted updates preserve intentional outside focus", async ({
  page,
}) => {
  const { article, grid, errors } = await setup(page);
  await cell(grid).dblclick();
  const editor = grid.getByRole("textbox", { name: /Edit Current record/ });
  await editor.fill("Retained draft");
  await article
    .getByRole("button", { name: "Try invalid definitions", exact: true })
    .dispatchEvent("click");
  await expect(article.getByRole("alert")).toContainText("Column width");
  await expect(editor).toHaveValue("Retained draft");
  await expect(editor).toBeFocused();
  await expect(
    article.locator('output[aria-label="Column definition revision"]'),
  ).toHaveText("0");
  await editor.press("Escape");
  const outside = article.getByRole("button", {
    name: "Outside column definitions",
    exact: true,
  });
  await outside.click();
  await article
    .getByRole("button", { name: "Replace record field", exact: true })
    .dispatchEvent("click");
  await expect(outside).toBeFocused();
  await expect(article.getByRole("alert")).toHaveCount(0);
  await expect(cell(grid)).toContainText("Alternate 1");
  expect(errors).toEqual([]);
});
test("same-ID span topology rebuilds through RTL and Spanish with accessible real cells", async ({
  page,
}) => {
  const { article, grid, errors } = await setup(page);
  await article
    .getByRole("button", { name: "Toggle record row spans", exact: true })
    .click();
  await expect(cell(grid)).toHaveAttribute("aria-rowspan", "2");
  await expect(cell(grid, "schema-2")).toHaveCount(0);
  await article
    .getByRole("checkbox", { name: "RTL column definitions", exact: true })
    .check();
  await article
    .getByRole("checkbox", { name: "Spanish column definitions", exact: true })
    .check();
  await article
    .getByRole("button", { name: "Replace record field", exact: true })
    .click();
  await expect(cell(grid)).not.toHaveAttribute("aria-rowspan");
  await expect(cell(grid, "schema-2")).toContainText("Alternate 2");
  await cell(grid).click();
  await cell(grid).press("ArrowDown");
  await expect(cell(grid, "schema-2")).toBeFocused();
  await expect(grid).toHaveAttribute("dir", "rtl");
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await article.evaluate(async (el) =>
    (await (window as any).axe.run(el)).violations
      .filter((v: any) => ["serious", "critical"].includes(v.impact))
      .map((v: any) => ({
        id: v.id,
        nodes: v.nodes.map((n: any) => n.failureSummary),
      })),
  );
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("an empty schema has a real accessible placeholder and restores source rows", async ({
  page,
}) => {
  const { article, grid, errors } = await setup(page);
  await article
    .getByRole("button", { name: "Toggle empty column view", exact: true })
    .click();
  await expect(grid).toHaveAttribute("aria-rowcount", "1");
  await expect(grid.getByRole("columnheader")).toHaveText("No visible columns");
  await expect(grid.getByRole("gridcell")).toHaveCount(0);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await article.evaluate(async (el) =>
    (await (window as any).axe.run(el)).violations
      .filter((v: any) => ["serious", "critical"].includes(v.impact))
      .map((v: any) => v.id),
  );
  expect(violations).toEqual([]);
  await article
    .getByRole("button", { name: "Toggle empty column view", exact: true })
    .click();
  await expect(cell(grid)).toContainText("Shared current");
  await expect(grid).toHaveAttribute("aria-rowcount", "243");
  expect(errors).toEqual([]);
});
