import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("custom range filters preserve valid state across invalid drafts and component remounts", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Custom filters", exact: true })
    .click();
  const minimum = page.getByRole("textbox", {
      name: "Filter Price minimum",
      exact: true,
    }),
    maximum = page.getByRole("textbox", {
      name: "Filter Price maximum",
      exact: true,
    });
  await minimum.fill("100");
  await maximum.fill("150");
  const grid = page.getByRole("grid", { name: "Portfolio holdings" });
  const prices = await grid
    .locator('[data-row-id][data-column-id="price"]')
    .allTextContents();
  expect(prices.length).toBeGreaterThan(0);
  expect(
    prices.every((text) => {
      const value = Number(text.replace(/[^\d.-]/g, ""));
      return value >= 100 && value <= 150;
    }),
  ).toBe(true);
  const count = await page.locator(".og-statusbar").textContent();
  await maximum.fill("90");
  await expect(page.getByRole("alert")).toContainText(/minimum.*maximum/i);
  await expect(page.locator(".og-statusbar")).toHaveText(count!);
  await page
    .getByRole("button", { name: "Custom filters", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Custom filters", exact: true })
    .click();
  await expect(minimum).toHaveValue("100");
  await expect(maximum).toHaveValue("150");
  await page
    .getByRole("button", { name: "Clear Filter Price", exact: true })
    .click();
  await expect(minimum).toHaveValue("");
  await expect(maximum).toHaveValue("");
  await expect(page.locator(".og-statusbar")).toContainText("1,000 rows");
});

test("retains native and custom filter focus through horizontal virtualization", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Wide schema", exact: true }).click();
  const grid = page.getByRole("grid", { name: "Portfolio holdings" }),
    native = page.getByRole("textbox", { name: "Filter Sector", exact: true });
  await native.focus();
  await grid.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(native).toBeFocused();
  await page
    .getByRole("button", { name: "Custom filters", exact: true })
    .click();
  await grid.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const minimum = page.getByRole("textbox", {
    name: "Filter Price minimum",
    exact: true,
  });
  await minimum.focus();
  await grid.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(minimum).toBeFocused();
  await minimum.fill("100");
  await expect(minimum).toHaveValue("100");
});

test("calculated values update through base edits, filters, sorting and schema application", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Calculated columns lab", exact: true })
    .click();
  const grid = page.getByRole("grid", { name: "Calculated inventory" }),
    cell = (id: string, col: string) =>
      grid.locator(`[data-row-id="${id}"][data-column-id="${col}"]`);
  await expect(cell("stock1", "total")).toHaveText("$96.00");
  await cell("stock1", "price").dblclick();
  await cell("stock1", "price").getByRole("spinbutton").fill("20");
  await cell("stock1", "price").getByRole("spinbutton").press("Enter");
  await expect(cell("stock1", "total")).toHaveText("$160.00");
  await grid
    .getByRole("textbox", { name: "Filter Total value", exact: true })
    .fill("160");
  await expect(
    grid.locator('[data-column-id="item"][data-row-id]'),
  ).toHaveCount(1);
  await grid
    .getByRole("textbox", { name: "Filter Total value", exact: true })
    .clear();
  await grid
    .getByRole("button", { name: "Sort Total value", exact: true })
    .click();
  await expect(
    grid.locator('[data-column-id="item"][data-row-id]').first(),
  ).toHaveText("Pencil set");
  await page
    .getByRole("textbox", { name: "Calculated column expression", exact: true })
    .fill("[price] * [quantity] * 1.1");
  await page
    .getByRole("button", { name: "Apply calculated definition", exact: true })
    .click();
  await expect(cell("stock1", "total")).toHaveText("$176.00");
  await expect(cell("stock1", "price")).toHaveText("$20.00");
  await page
    .getByRole("combobox", {
      name: "Calculated column definition",
      exact: true,
    })
    .selectOption("");
  await page
    .getByRole("textbox", { name: "Calculated column ID", exact: true })
    .fill("tax");
  await page
    .getByRole("textbox", { name: "Calculated column label", exact: true })
    .fill("Tax");
  await page
    .getByRole("textbox", { name: "Calculated column expression", exact: true })
    .fill("[total] * 0.2");
  await page
    .getByRole("button", { name: "Apply calculated definition", exact: true })
    .click();
  await expect(cell("stock1", "tax")).toContainText("35.2");
  await cell("stock1", "tax").focus();
  await cell("stock1", "tax").press("F2");
  await expect(cell("stock1", "tax").getByRole("textbox")).toHaveCount(0);
  await expect(cell("stock1", "tax").getByRole("spinbutton")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Group by calculated status", exact: true })
    .click();
  const grouped = page.getByRole("treegrid", { name: "Calculated inventory" });
  await expect(
    grouped.getByRole("button", { name: "Expand Low", exact: true }),
  ).toBeVisible();
  const sums = await grouped
    .locator('[data-column-id="total"][data-row-id]')
    .allTextContents();
  expect(
    sums.map(Number).some((value) => Math.abs(value - 413.6) < 0.000001),
  ).toBe(true);
});

test("calculated authoring rejects invalid programs and reports runtime cycles without changing raw data", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Calculated columns lab", exact: true })
    .click();
  const grid = page.getByRole("grid", { name: "Calculated inventory" }),
    total = grid.locator('[data-row-id="stock1"][data-column-id="total"]');
  await page
    .getByRole("textbox", { name: "Calculated column expression", exact: true })
    .fill("A1");
  await page
    .getByRole("button", { name: "Apply calculated definition", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(total).toHaveText("$96.00");
  await page
    .getByRole("textbox", { name: "Calculated column expression", exact: true })
    .fill("[total]");
  await page
    .getByRole("button", { name: "Apply calculated definition", exact: true })
    .click();
  await expect(total).toHaveText("#CYCLE!");
  await expect(
    page.getByRole("status").filter({ hasText: "calculation errors" }),
  ).toContainText("CYCLE");
  await expect(
    grid.locator('[data-row-id="stock1"][data-column-id="price"]'),
  ).toHaveText("$12.00");
  await page
    .getByRole("textbox", { name: "Calculated column expression", exact: true })
    .fill("[price] * [quantity]");
  await page
    .getByRole("button", { name: "Apply calculated definition", exact: true })
    .click();
  await expect(total).toHaveText("$96.00");
  await page
    .getByRole("button", { name: "Custom filters", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Filter Price minimum", exact: true })
    .fill("100");
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
});
