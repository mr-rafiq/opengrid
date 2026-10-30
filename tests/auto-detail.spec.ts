import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Automatic height lab", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Automatic row height example",
    exact: true,
  });
  const article = region.getByRole("article", {
    name: "Automatic detail content example",
    exact: true,
  });
  const master = article.getByRole("treegrid", {
    name: "Automatic detail masters",
    exact: true,
  });
  const nested = article.getByRole("grid", {
    name: "Calls grid detail0",
    exact: true,
  });
  await expect(nested).toBeVisible();
  const detail = master.locator('.og-detail-row[data-og-row-id="detail0"]');
  await expect.poll(() => height(detail)).toBeGreaterThan(200);
  return { region, article, master, nested, detail, errors };
}
const height = async (target: Locator) => (await target.boundingBox())!.height;
const first = (grid: Locator) =>
  grid.locator(
    '[role="gridcell"][data-row-id="detail0"][data-column-id="name"]',
  );

test("nested content grows and shrinks the detail, explicit mode remains fixed and Alt Enter restores the master", async ({
  page,
}) => {
  const { article, master, nested, detail, errors } = await setup(page);
  const initial = await height(detail);
  await article
    .getByRole("button", { name: "Add detail record", exact: true })
    .click();
  await expect.poll(() => height(detail)).toBeGreaterThan(initial);
  await expect(
    nested.locator('[data-row-id="detail0-call3"][data-column-id="name"]'),
  ).toContainText("Review call 4");
  await article
    .getByRole("button", { name: "Remove detail record", exact: true })
    .click();
  await expect.poll(() => height(detail)).toBe(initial);
  const toggle = article.getByRole("checkbox", {
    name: "Automatic detail height",
    exact: true,
  });
  await toggle.uncheck();
  await expect.poll(() => height(detail)).toBe(80);
  await toggle.check();
  await expect.poll(() => height(detail)).toBe(initial);
  await first(master).focus();
  await first(master).press("Alt+Enter");
  await expect(detail).toHaveCount(0);
  await expect(first(master)).toBeFocused();
  await first(master).press("Alt+Enter");
  await expect.poll(() => height(detail)).toBe(initial);
  await expect(first(master)).toBeFocused();
  expect(errors).toEqual([]);
});

test("nested records and intentional outside focus survive Spanish RTL and dark remeasurement", async ({
  page,
}) => {
  const { region, article, master, nested, detail, errors } = await setup(page);
  await article
    .getByRole("button", { name: "Add detail record", exact: true })
    .click();
  const last = nested.locator(
    '[data-row-id="detail0-call3"][data-column-id="name"]',
  );
  await expect(last).toContainText("Review call 4");
  await region
    .getByRole("checkbox", {
      name: "Spanish automatic-row labels",
      exact: true,
    })
    .check();
  await region
    .getByRole("checkbox", {
      name: "Right-to-left automatic rows",
      exact: true,
    })
    .check();
  const dark = region.getByRole("checkbox", {
    name: "Dark automatic-row theme",
    exact: true,
  });
  await dark.check();
  await expect(master).toHaveAttribute("dir", "rtl");
  await expect(nested).toHaveAttribute("dir", "rtl");
  await expect(last).toContainText("Review call 4");
  await expect.poll(() => height(detail)).toBeGreaterThan(200);
  await expect(dark).toBeFocused();
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await article.evaluate(async (element) =>
    (await (window as any).axe.run(element)).violations
      .filter((item: any) => ["serious", "critical"].includes(item.impact))
      .map((item: any) => ({
        id: item.id,
        nodes: item.nodes.map((node: any) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
  );
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("viewport reflow remeasures details while preserving nested cell focus", async ({
  page,
}) => {
  const { master, nested, detail, errors } = await setup(page);
  const initial = await height(detail);
  const initialWidth = await master.evaluate((element) => element.clientWidth);
  const cell = nested.locator(
    '[data-row-id="detail0-call0"][data-column-id="name"]',
  );
  await cell.focus();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect
    .poll(() => master.evaluate((element) => element.clientWidth))
    .toBeLessThan(initialWidth);
  await expect.poll(() => height(detail)).toBeGreaterThan(initial);
  await expect(cell).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => height(detail)).toBe(initial);
  await expect(cell).toBeFocused();
  expect(errors).toEqual([]);
});
