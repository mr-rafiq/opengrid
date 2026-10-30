import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
for (const width of [320, 375, 834, 1440]) {
  test(`minimal playground fits ${width}px and its navigation remains usable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("grid", { name: "Portfolio holdings" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(page.locator(".view-options")).not.toHaveAttribute("open");
    await page.getByText("Columns", { exact: true }).click();
    const chooser = page.locator(".og-chooser-panel");
    await expect(chooser).toBeVisible();
    if (width <= 375)
      await expect(
        chooser.getByRole("combobox", { name: "Pin Company", exact: true }),
      ).toHaveValue("");
    const bounds = await chooser.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await chooser.getByRole("checkbox").first().focus();
    await page.keyboard.press("Escape");
    await expect(chooser).not.toBeVisible();
    if (width <= 375) {
      const grid = page.getByRole("grid", { name: "Portfolio holdings" });
      await grid.evaluate((element) => {
        element.scrollLeft = 600;
      });
      const price = grid.locator('[data-row-id="1"][data-column-id="price"]');
      await price.dblclick();
      await expect(
        page.getByRole("spinbutton", { name: "Edit Price row 1" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }

    await page.getByText("View options", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Wide schema", exact: true }),
    ).toBeVisible();
    if (width <= 1000) {
      const trigger = page.getByRole("button", {
        name: "Open playground navigation",
      });
      await trigger.click();
      await expect(
        page.getByRole("dialog", { name: "Playground navigation" }),
      ).toBeVisible();
      expect(
        await page
          .locator("#playground-navigation")
          .evaluate((e) => e.matches(":modal")),
      ).toBe(true);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(
        "hidden",
      );
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Examples", exact: true })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(page.locator("#examples")).toBeInViewport();
    } else {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(page.locator(".rail")).toHaveClass(/collapsed/);
      await page.getByRole("button", { name: "Expand sidebar" }).click();
      await expect(page.locator(".rail")).not.toHaveClass(/collapsed/);
    }
  });
}
test("system appearance, persistence and secondary grids share a single theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-og-theme", "dark");
  await page
    .getByRole("button", {
      name: "Runtime column definitions lab",
      exact: true,
    })
    .click();
  expect(
    await page
      .locator(".og-root")
      .evaluateAll((es) =>
        es.every(
          (e) => getComputedStyle(e).backgroundColor === "rgb(23, 28, 37)",
        ),
      ),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "Color theme" })
    .selectOption("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-og-theme", "light");
  await page
    .getByRole("combobox", { name: "Color theme" })
    .selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-og-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-og-theme", "light");
});
for (const theme of ["light", "dark"])
  test(`minimal ${theme} UI has no serious accessibility violations`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Color theme" })
      .selectOption(theme);
    await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () =>
      (
        await (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.filter((v: any) =>
        ["critical", "serious"].includes(v.impact),
      ),
    );
    expect(violations).toEqual([]);
  });
