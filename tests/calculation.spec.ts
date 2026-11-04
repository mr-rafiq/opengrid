import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#calculation");
  const launcher = page.getByRole("button", {
    name: "Calculation workspace lab",
    exact: true,
  });
  if ((await launcher.getAttribute("aria-expanded")) !== "true")
    await launcher.click();
  const article = page.getByRole("article", {
    name: "Calculation workspace example",
  });
  const grid = article.getByRole("treegrid", { name: "Synthetic estimate" });
  await expect(grid).toBeVisible();
  return { article, grid, errors };
}
test("nested edits update computed amounts and header totals, undo, and protected rows reject editors", async ({
  page,
}) => {
  const { article, grid, errors } = await setup(page);
  const cell = (id: string, column: string) =>
    grid.locator(
      `[role="gridcell"][data-row-id="${id}"][data-column-id="${column}"]`,
    );
  await cell("est-1", "quantity").dblclick();
  const editor = grid.getByRole("spinbutton");
  await expect(editor).toHaveValue("8");
  await editor.fill("10");
  await editor.press("Enter");
  await expect(article.getByLabel("Estimate source values")).toContainText(
    "est-1:10:54",
  );
  await expect(cell("est-1", "amount")).toHaveText("€540.00");
  await article.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cell("est-1", "amount")).toHaveText("€432.00");
  await cell("est-2", "quantity").dblclick();
  await expect(grid.getByRole("spinbutton")).toHaveCount(0);
  await expect(cell("est-2", "quantity")).toHaveAttribute(
    "aria-readonly",
    "true",
  );
  await article
    .getByRole("checkbox", { name: "Read only", exact: true })
    .check();
  await expect(
    article.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect(
    article.getByRole("button", { name: "Paste cells", exact: true }),
  ).toBeDisabled();
  await expect(
    article.getByRole("button", {
      name: "Fill down selected cells",
      exact: true,
    }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
test("session views and independent project panels preserve application state", async ({
  page,
}) => {
  const { article, errors } = await setup(page);
  await article.getByRole("tab", { name: "Saved view", exact: true }).click();
  await article.getByRole("button", { name: "Save current view" }).click();
  const search = article.getByRole("searchbox", { name: "Search estimate" });
  await search.fill("amount > 1000");
  await expect(article.getByLabel("Filtered estimate total")).toHaveText(
    "Filtered estimate: €3,668.00",
  );
  await article.getByRole("tab", { name: "Project note", exact: true }).click();
  await article
    .getByRole("textbox", { name: "Estimate note" })
    .fill("Review quantities");
  await article.getByRole("tab", { name: "Help", exact: true }).click();
  await article.getByRole("tab", { name: "Project note", exact: true }).click();
  await expect(
    article.getByRole("textbox", { name: "Estimate note" }),
  ).toHaveValue("Review quantities");
  await search.fill("amount > invalid");
  await expect(article.getByRole("alert")).toContainText("last valid filter");
  await article.getByRole("tab", { name: "Saved view", exact: true }).click();
  await article.getByRole("button", { name: "Restore saved view" }).click();
  await expect(search).toHaveValue("");
  await expect(article.getByLabel("Filtered estimate total")).toHaveText(
    "Filtered estimate: €5,300.00",
  );
  expect(errors).toEqual([]);
});
for (const width of [320, 390, 768, 1440])
  test(`responsive calculation panels and grid scrolling at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { article, grid, errors } = await setup(page);
    if (width === 390)
      await page
        .getByRole("combobox", { name: "Color theme", exact: true })
        .selectOption("dark");
    if (width <= 1024) {
      const launch = article.getByRole("button", { name: "Open grid panels" });
      await launch.click();
      const drawer = page.getByRole("dialog", {
        name: "Grid panels",
        exact: true,
      });
      await expect(drawer).toBeVisible();
      await drawer
        .getByRole("tab", { name: "Saved view", exact: true })
        .click();
      await drawer.getByRole("button", { name: "Save current view" }).click();
      await article.screenshot({
        path: info.outputPath(`calculation-${width}-drawer.png`),
      });
      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
      await expect(launch).toBeFocused();
    }
    await grid.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await article.screenshot({
      path: info.outputPath(`calculation-${width}.png`),
    });
    expect(errors).toEqual([]);
  });
test("touch users can edit an eligible value and dismiss the workspace drawer", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const { article, grid, errors } = await setup(page);
    const quantity = grid.locator(
      '[role="gridcell"][data-row-id="est-1"][data-column-id="quantity"]',
    );
    await grid.evaluate((node) => {
      node.scrollLeft = 300;
    });
    await quantity.tap();
    await quantity.tap();
    const editor = grid.getByRole("spinbutton");
    await expect(editor).toBeVisible();
    await editor.fill("9");
    await editor.press("Enter");
    await expect(article.getByLabel("Estimate source values")).toContainText(
      "est-1:9:54",
    );
    const launcher = article.getByRole("button", { name: "Open grid panels" });
    await launcher.tap();
    const drawer = page.getByRole("dialog", {
      name: "Grid panels",
      exact: true,
    });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Close grid panels" }).tap();
    await expect(drawer).not.toBeVisible();
    await expect(launcher).toBeFocused();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
test("workspace tabs and modal panels retain keyboard relationships and have no serious automated accessibility findings", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const { article, errors } = await setup(page);
    if (width === 390)
      await article.getByRole("button", { name: "Open grid panels" }).click();
    const columns = article.getByRole("tab", {
      name: "Columns & filters",
      exact: true,
    });
    await columns.focus();
    await columns.press("ArrowDown");
    await expect(
      article.getByRole("tab", { name: "Saved view", exact: true }),
    ).toBeFocused();
    await page.addScriptTag({ content: axeSource });
    for (const mode of ["light", "dark"]) {
      if (width === 390) {
        await page.keyboard.press("Escape");
        await page
          .getByRole("combobox", { name: "Color theme", exact: true })
          .selectOption(mode);
        await article.getByRole("button", { name: "Open grid panels" }).click();
      } else
        await page
          .getByRole("combobox", { name: "Color theme", exact: true })
          .selectOption(mode);
      const violations = await page.evaluate(async () => {
        const target =
          document.querySelector("dialog.og-workspace-drawer[open]") ??
          document.querySelector(
            'article[aria-label="Calculation workspace example"]',
          )!;
        const axe = (
          window as unknown as {
            axe: {
              run: (element: Element) => Promise<{
                violations: {
                  id: string;
                  impact: string;
                  nodes: { html: string; target: string[] }[];
                }[];
              }>;
            };
          }
        ).axe;
        return (await axe.run(target)).violations
          .filter((item) => ["serious", "critical"].includes(item.impact))
          .map((item) => ({ id: item.id, nodes: item.nodes }));
      });
      expect(violations).toEqual([]);
    }
    expect(errors).toEqual([]);
  }
});
