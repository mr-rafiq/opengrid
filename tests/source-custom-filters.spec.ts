import { test, expect } from "@playwright/test";

test("tabbing out of a custom popup preserves the next control's focus", async ({
  page,
}) => {
  await page.goto("./#legacy-react-bridge");
  await page
    .getByRole("button", { name: "Legacy React bridge lab", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Source custom filter example" })
    .click();
  const lab = page.getByRole("article", {
    name: "Reactive custom source filters",
    exact: true,
  });
  await lab
    .getByRole("button", { name: "Open Team filter", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "Filter Team", exact: true });
  await popup
    .getByRole("button", { name: "Include all teams", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(popup).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.activeElement !== document.body &&
        !document.activeElement?.closest("[data-og-source-filter]"),
    ),
  ).toBe(true);
  await expect(
    lab.getByRole("button", { name: "Open Team filter", exact: true }),
  ).not.toBeFocused();
});

test.describe("custom source filter touch layout", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 900 },
  });
  test("coarse targets and an open popup survive portrait to landscape", async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("./#legacy-react-bridge");
    await page
      .getByRole("button", { name: "Legacy React bridge lab", exact: true })
      .tap();
    await page
      .locator("summary")
      .filter({ hasText: "Source custom filter example" })
      .tap();
    const lab = page.getByRole("article", {
      name: "Reactive custom source filters",
      exact: true,
    });
    await lab
      .getByRole("button", { name: "Open Team filter", exact: true })
      .tap();
    const popup = page.getByRole("dialog", {
      name: "Filter Team",
      exact: true,
    });
    await expect(popup).toBeVisible();
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    const label = popup.getByText("Operations", { exact: true });
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await label.tap();
    await expect(
      lab.getByRole("status", { name: "Custom filter summary", exact: true }),
    ).toHaveText("2 displayed lines | original objects: yes");
    await page.setViewportSize({ width: 780, height: 320 });
    await expect
      .poll(async () => {
        const box = await popup.boundingBox();
        return (
          !!box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= 780 &&
          box.y + box.height <= 320
        );
      })
      .toBe(true);
    await popup
      .getByRole("button", { name: "Include all teams", exact: true })
      .tap();
    await expect(
      lab.getByRole("status", { name: "Custom filter summary", exact: true }),
    ).toHaveText("3 displayed lines | original objects: yes");
    await popup.screenshot({
      path: info.outputPath("custom-filter-touch-landscape.png"),
    });
    await lab
      .getByRole("button", { name: "Save custom filter", exact: true })
      .tap();
    await expect(popup).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
});
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`reactive custom filter model and focus ${width}px ${theme}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .click();
      await page
        .locator("summary")
        .filter({ hasText: "Source custom filter example" })
        .click();
      const lab = page.getByRole("article", {
          name: "Reactive custom source filters",
          exact: true,
        }),
        grid = lab.getByRole("grid", {
          name: "Custom source teams",
          exact: true,
        }),
        menu = grid.getByRole("button", {
          name: "Column menu for Team",
          exact: true,
        });
      await expect(
        lab.getByRole("status", { name: "Custom filter summary", exact: true }),
      ).toHaveText("3 displayed lines | original objects: yes");
      await menu.click();
      await page
        .getByRole("menuitem", { name: "Focus column filter", exact: true })
        .click();
      const popup = page.getByRole("dialog", {
        name: "Filter Team",
        exact: true,
      });
      await expect(popup).toBeVisible();
      await popup
        .getByRole("checkbox", { name: "Operations", exact: true })
        .uncheck();
      await expect(
        grid.getByRole("gridcell", { name: "Line Beta", exact: true }),
      ).toHaveCount(0);
      await expect(
        grid.getByRole("gridcell", { name: "Line Alpha", exact: true }),
      ).toBeVisible();
      const search = popup.getByRole("searchbox", {
        name: "Find a team",
        exact: true,
      });
      await search.fill("des");
      await expect(
        popup.getByRole("checkbox", { name: "Operations", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(menu).toBeFocused();
      await menu.press("Enter");
      await page
        .getByRole("menuitem", { name: "Focus column filter", exact: true })
        .click();
      await expect(search).toHaveValue("des");
      await expect
        .poll(() =>
          popup.evaluate((element) => element.contains(document.activeElement)),
        )
        .toBe(true);
      await search.fill("");
      await lab
        .getByRole("button", { name: "Save custom filter", exact: true })
        .click();
      await expect(popup).toHaveCount(0);
      await lab
        .getByRole("button", { name: "Clear custom filter", exact: true })
        .click();
      await expect(
        lab.getByRole("status", { name: "Custom filter summary", exact: true }),
      ).toHaveText("3 displayed lines | original objects: yes");
      await lab
        .getByRole("button", { name: "Restore custom filter", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await expect(
        lab.getByRole("status", { name: "Custom filter notice", exact: true }),
      ).toHaveText("Saved custom filter restored");
      await expect(
        lab.getByRole("status", { name: "Custom filter summary", exact: true }),
      ).toHaveText("2 displayed lines | original objects: yes");
      await lab
        .getByRole("button", { name: "Open Team filter", exact: true })
        .click();
      await expect(
        popup.getByRole("checkbox", { name: "Design", exact: true }),
      ).toBeChecked();
      await expect(
        popup.getByRole("checkbox", { name: "Operations", exact: true }),
      ).not.toBeChecked();
      await expect(popup).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await popup.screenshot({
        path: info.outputPath(`custom-filter-${width}-${theme}.png`),
      });
      await page.keyboard.press("Escape");
      expect(errors).toEqual([]);
    });
