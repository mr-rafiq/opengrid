import { test, expect, type Locator } from "@playwright/test";
import path from "node:path";
for (const [direction, theme, width, merged, utility] of [
  ["ltr", "light", 1200, false, false],
  ["rtl", "light", 1200, false, false],
  ["ltr", "dark", 700, true, true],
  ["rtl", "dark", 700, true, true],
] as const)
  test(`short pinned bands align every row in ${direction} ${theme} with merged=${merged} utility=${utility}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 800 });
    const params = new URLSearchParams({ direction, theme });
    if (merged) params.set("merged", "1");
    if (utility) params.set("utility", "1");
    await page.goto(
      `/@fs/${path.resolve("tests/fixtures/short-pins.html").replaceAll("\\", "/")}?${params}`,
    );
    const grid = page.getByRole("grid", { name: "Short pinned schema" });
    await expect(grid).toBeVisible();
    const endName = direction === "ltr" ? "Units" : "Code",
      endId = direction === "ltr" ? (merged ? "amount" : "units") : "id";
    const header = grid.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: `Sort ${endName}`, exact: true }),
    });
    const body = grid.locator(
      `[role="gridcell"][data-row-id="r1"][data-column-id="${endId}"]`,
    );
    const group = grid
      .locator(".og-header-group")
      .filter({ hasText: direction === "ltr" ? "Totals" : "Identity" });
    const distance = async (locator: Locator) => {
      const vb = (await grid.boundingBox())!,
        b = (await locator.boundingBox())!;
      return Math.abs(
        direction === "ltr" ? vb.x + vb.width - b.x - b.width : b.x - vb.x,
      );
    };
    const verify = async () => {
      await expect.poll(() => distance(header)).toBeLessThan(2);
      await expect.poll(() => distance(body)).toBeLessThan(2);
      await expect.poll(() => distance(group)).toBeLessThan(2);
      const index = await header.getAttribute("aria-colindex");
      await expect
        .poll(() =>
          distance(grid.locator(`.og-filter-row [aria-colindex="${index}"]`)),
        )
        .toBeLessThan(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    };
    await verify();
    await expect(grid).toHaveAttribute(
      "aria-colcount",
      String(4 + (utility ? 1 : 0)),
    );
    await body.click();
    await expect(body).toBeFocused();
    const toggle = page.getByRole("button", {
      name: "Toggle middle column",
      exact: true,
    });
    await toggle.click();
    await verify();
    await expect(toggle).toBeFocused();
    await expect(grid).toHaveAttribute(
      "aria-colcount",
      String(3 + (utility ? 1 : 0)),
    );
    await page.setViewportSize({
      width: width === 1200 ? 800 : 1000,
      height: 800,
    });
    await verify();
    await page.screenshot({
      path: info.outputPath(`short-pins-${direction}-${theme}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
