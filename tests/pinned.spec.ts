import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByText("View options", { exact: true }).click();
});

test("keeps unique top and bottom rows sticky while body scrolls and editing stays functional", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Pinned rows", exact: true }).click();
  const grid = page.getByRole("grid", { name: "Portfolio holdings" });
  await grid.scrollIntoViewIfNeeded();
  const cell = (row: string, column: string) =>
    grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
  const header = (await grid.locator(".og-header").boundingBox())!,
    bounds = (await grid.boundingBox())!;
  const bottomRow = grid.locator(
    '.og-row[data-row-key="100"][data-row-region="bottom"]',
  );
  const top = (await cell("1", "company").boundingBox())!,
    bottom = (await bottomRow.boundingBox())!,
    clientHeight = await grid.evaluate((element) => element.clientHeight);
  expect(top.y).toBeCloseTo(bounds.y + header.height, 0);
  expect(bottom.y + bottom.height).toBeCloseTo(bounds.y + clientHeight, 0);
  await grid.evaluate((element) => {
    element.scrollTop = 1200;
  });
  await expect
    .poll(async () => (await cell("1", "company").boundingBox())!.y)
    .toBeCloseTo(top.y, 0);
  expect((await bottomRow.boundingBox())!.y).toBeCloseTo(bottom.y, 0);
  await expect(cell("1", "company")).toHaveCount(1);
  await expect(cell("100", "company")).toHaveCount(1);
  await expect(grid).toHaveAttribute("aria-rowcount", "102");
  await cell("1", "price").focus();
  await cell("1", "price").press("F2");
  await cell("1", "price").getByRole("spinbutton").fill("66");
  await cell("1", "price").getByRole("spinbutton").press("Enter");
  await expect(cell("1", "price")).toHaveText("$66.00");
  await cell("1", "price").press("Control+z");
  await expect(cell("1", "price")).toHaveText("$42.00");
  await cell("1", "price").press("Control+End");
  await expect(cell("100", "trend")).toBeFocused();
});

test("navigates full-width content and copies or pastes across pin bands without synthetic cells", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Pinned rows", exact: true }).click();
  await page
    .getByRole("button", { name: "Full-width rows", exact: true })
    .click();
  const grid = page.getByRole("grid", { name: "Portfolio holdings" }),
    full = grid.locator('[data-full-width-row-id="3"]');
  await expect(full).toHaveAttribute("aria-colspan", "11");
  await expect(grid.locator('[data-row-id="3"][data-column-id]')).toHaveCount(
    0,
  );
  const toggle = grid.getByRole("button", {
    name: "Toggle holding information",
    exact: true,
  });
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toBeFocused();
  await expect(full).toContainText("124 shares");
  await full.focus();
  await full.press("ArrowDown");
  await expect(
    grid.locator('[data-row-id="4"][data-column-id="company"]'),
  ).toBeFocused();
  const cell = (row: string, column: string) =>
    grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
  await cell("1", "price").click();
  await cell("4", "shares").click({ modifiers: ["Shift"] });
  await expect(grid.getByRole("gridcell", { selected: true })).toHaveCount(6);
  await cell("4", "shares").press("Control+c");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r",
      "",
    ),
  ).toBe("42\t50\n59.13\t87\n93.39\t161");
  await page.evaluate(() =>
    navigator.clipboard.writeText("100\t200\n300\t400\n500\t600"),
  );
  await cell("4", "shares").press("Control+v");
  await expect(cell("4", "price")).toHaveText("$500.00");
  await expect(full).toContainText("124 shares");
  await cell("4", "shares").press("Control+z");
  await expect(cell("4", "shares")).toHaveText("161");
});

test("combines grouped headers, pins, full-width detail geometry and accessible hierarchy", async ({
  page,
}) => {
  for (const name of [
    "Column groups",
    "Pinned rows",
    "Full-width rows",
    "Detail rows",
  ])
    await page.getByRole("button", { name, exact: true }).click();
  const grid = page.getByRole("treegrid", { name: "Portfolio holdings" }),
    full = grid.locator('[data-full-width-row-id="3"]');
  await full.focus();
  await full.press("Alt+Enter");
  await expect(
    page.getByRole("region", { name: "Details for row 3", exact: true }),
  ).toBeVisible();
  await expect(grid).toHaveAttribute("aria-rowcount", "105");
  const next = grid.locator('[data-row-id="4"][data-column-id="company"]');
  expect(
    (await next.boundingBox())!.y - (await full.boundingBox())!.y,
  ).toBeCloseTo(452, 0);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: () => Promise<{
            violations: {
              id: string;
              impact: string;
              nodes: { html: string; failureSummary?: string }[];
            }[];
          }>;
        };
      }
    ).axe.run();
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          html: n.html,
          summary: n.failureSummary,
        })),
      }));
  });
  expect(violations).toEqual([]);
  await full.focus();
  await full.press("Alt+Enter");
  await expect(
    page.getByRole("region", { name: "Details for row 3", exact: true }),
  ).toHaveCount(0);
});
