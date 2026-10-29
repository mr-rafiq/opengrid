import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("projects pivot percentages and ordered totals without changing grid values", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Pivot summary/ }).click();
  const table = page
    .getByRole("heading", { name: "Shares by sector and region", exact: true })
    .locator("..")
    .getByRole("table");
  const raw = await table
    .locator("tbody tr")
    .first()
    .locator("td")
    .allTextContents();
  await page
    .getByLabel("Show pivot values as")
    .selectOption("percentOfRowTotal");
  const percentages = await table
    .locator("tbody tr")
    .first()
    .locator("td")
    .allTextContents();
  expect(
    percentages.reduce((sum, text) => sum + Number(text.replace("%", "")), 0),
  ).toBeCloseTo(100, 1);
  await page.getByLabel("Show pivot values as").selectOption("runningTotal");
  const running = await table
    .locator("tbody tr")
    .first()
    .locator("td")
    .allTextContents();
  expect(Number(running.at(-1)!.replaceAll(",", ""))).toBe(
    raw.reduce((sum, text) => sum + Number(text.replaceAll(",", "")), 0),
  );
  await expect(
    page.locator('[data-row-id="1"][data-column-id="shares"]'),
  ).toHaveText("50");
  await page
    .getByRole("textbox", { name: "Search all rows" })
    .fill("no matching holding");
  await expect(table.locator("tbody tr")).toHaveCount(0);
});

test("captures refreshable print data and isolates the browser print layout", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Print view", exact: true }).click();
  const view = page.getByRole("region", {
      name: "Portfolio print snapshot",
      exact: true,
    }),
    table = view.getByRole("table");
  await expect(table.locator("tbody tr")).toHaveCount(100);
  const price = page.locator('[data-row-id="1"][data-column-id="price"]');
  await price.dblclick();
  await price.getByRole("spinbutton").fill("88");
  await price.getByRole("spinbutton").press("Enter");
  await expect(view.getByRole("status")).toContainText("Grid changed");
  await expect(table.locator("tbody tr").first()).toContainText("$42.00");
  await view.getByRole("button", { name: "Refresh print snapshot" }).click();
  await expect(table.locator("tbody tr").first()).toContainText("$88.00");
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: () => Promise<{ violations: { id: string; impact: string }[] }>;
        };
      }
    ).axe.run();
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id);
  });
  expect(violations).toEqual([]);
  await page.evaluate(() => {
    window.print = () => {};
  });
  await view
    .getByRole("button", { name: "Print snapshot", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-og-print-target",
    /og-print/,
  );
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("heading", { name: "Your data. Your possibilities." }),
  ).toBeHidden();
  await expect(table).toBeVisible();
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1000);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-og-print-target",
  );
  await page.emulateMedia({ media: "screen" });
  await expect(
    page.getByRole("heading", { name: "Your data. Your possibilities." }),
  ).toBeVisible();
});

test("aligns shared column controls while each grid retains independent sorting", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Aligned columns lab", exact: true })
    .click();
  const left = page.getByRole("grid", { name: "Aligned left", exact: true }),
    right = page.getByRole("grid", { name: "Aligned right", exact: true });
  const leftRoot = left.locator("..");
  await leftRoot.getByText("Columns", { exact: true }).click();
  await leftRoot
    .getByRole("checkbox", { name: "Show Region", exact: true })
    .uncheck();
  await expect(
    left.getByRole("button", { name: "Sort Region", exact: true }),
  ).toHaveCount(0);
  await expect(
    right.getByRole("button", { name: "Sort Region", exact: true }),
  ).toHaveCount(0);
  await left.getByRole("button", { name: "Sort Amount", exact: true }).click();
  await expect(left.locator('[data-column-id="amount"]').first()).toHaveText(
    "180",
  );
  await expect(right.locator('[data-column-id="amount"]').first()).toHaveText(
    "320",
  );
});
