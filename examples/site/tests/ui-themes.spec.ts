import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
for (const theme of ["light", "dark"])
  test(`responsive ${theme} documentation sidebar and keyboard flow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("docs/themes/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Color theme" })
      .selectOption(theme);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Menu", exact: true }),
    ).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("data-og-theme", theme);
    await page.getByRole("button", { name: "Browse docs" }).click();
    const drawer = page.getByRole("dialog", { name: "Documentation menu" });
    expect(await drawer.evaluate((e) => e.matches(":modal"))).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await expect(
      drawer.getByRole("link", { name: "Themes & appearance" }),
    ).toHaveAttribute("aria-current", "page");
    await page.addScriptTag({ content: axe });
    expect(
      await page.evaluate(async () =>
        (
          await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.filter((v: any) =>
          ["serious", "critical"].includes(v.impact),
        ),
      ),
    ).toEqual([]);
    await page.keyboard.press("Tab");
    expect(
      await drawer.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Browse docs" }),
    ).toBeFocused();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-og-theme", theme);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(375);
  });
test("docs stays within a small viewport with doubled text and reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("docs/getting-started/");
  const originalTextSize = await page
    .locator(".prose p")
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  await page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll<HTMLElement>(
        ".prose p, .prose li, .prose h1, .prose h2",
      ),
    ];
    const sizes = nodes.map((node) =>
      parseFloat(getComputedStyle(node).fontSize),
    );
    nodes.forEach((node, index) => {
      node.style.fontSize = `${sizes[index] * 2}px`;
    });
  });
  expect(
    await page
      .locator(".prose p")
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeCloseTo(originalTextSize * 2, 2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(720);
  await page.getByRole("button", { name: "Browse docs" }).click();
  await page.getByRole("button", { name: "Close documentation menu" }).click();
  await expect(page.getByRole("button", { name: "Browse docs" })).toBeFocused();
});

test("one saved preference follows documentation and the bundled playground", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("combobox", { name: "Color theme" })
    .selectOption("dark");
  await page.goto("demo/");
  await expect(
    page.getByRole("grid", { name: "Portfolio holdings" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-og-theme", "dark");
  expect(
    await page
      .locator(".og-root")
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(23, 28, 37)");
  await page
    .getByRole("combobox", { name: "Color theme" })
    .selectOption("light");
  await page.goto("docs/themes/");
  await expect(page.locator("html")).toHaveAttribute("data-og-theme", "light");
});

test("theme selector works when storage access is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", {
      value() {
        throw new Error("blocked");
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      value() {
        throw new Error("blocked");
      },
    });
  });
  await page.goto("docs/themes/");
  await page
    .getByRole("combobox", { name: "Color theme" })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-og-theme", "dark");
});

test("mobile drawer closes when desktop navigation returns and restores a visible focus target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("docs/themes/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole("dialog", { name: "Main navigation" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "OpenGrid home", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
