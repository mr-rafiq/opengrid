import { test, expect, type Locator, type Page } from "@playwright/test";

const grouping = (page: Page) =>
  page.locator(".showcase-grid > .og-root > .og-group-panel");

async function contained(control: Locator, width: number) {
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  // overflow:clip must not disguise controls extending outside their parent.
  expect(
    await control.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      for (
        let parent = node.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {
          const outer = parent.getBoundingClientRect();
          if (rect.left < outer.left - 1 || rect.right > outer.right + 1)
            return false;
        }
      }
      return true;
    }),
  ).toBe(true);
}

async function controlsFit(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    width,
  );
  for (const label of ["Data size", "Grid style", "Demo appearance"])
    await contained(
      page.getByRole("combobox", { name: label, exact: true }),
      width,
    );
  await contained(
    page.getByRole("searchbox", { name: "Search participants" }),
    width,
  );
  await contained(grouping(page).getByRole("combobox"), width);
  await contained(
    grouping(page).getByRole("button", { name: "Add group", exact: true }),
    width,
  );
  for (const chip of await grouping(page).locator(".og-group-chip").all())
    await contained(chip, width);
  if (width <= 1000)
    await contained(
      page.getByRole("button", { name: "Columns & filters", exact: true }),
      width,
    );
  if (width <= 700) {
    await contained(
      page.getByRole("button", { name: "Menu", exact: true }),
      width,
    );
    await contained(
      page.getByRole("button", { name: "Search docs", exact: true }),
      width,
    );
  }
}

for (const width of [320, 375, 390, 556, 768, 1440]) {
  test(`responsive showcase ${width}px: both presets and color modes, grouped and ungrouped`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("showcase/");
    for (const style of ["minimal", "material"]) {
      await page
        .getByRole("combobox", { name: "Grid style" })
        .selectOption(style);
      for (const mode of ["light", "dark"]) {
        await page
          .getByRole("combobox", { name: "Demo appearance", exact: true })
          .selectOption(mode);
        await controlsFit(page, width);
        for (const column of ["game", "country", "language"]) {
          await grouping(page).getByRole("combobox").selectOption(column);
          await grouping(page)
            .getByRole("button", { name: "Add group", exact: true })
            .click();
        }
        await expect(grouping(page).locator("[data-group-focus]")).toHaveCount(
          3,
        );
        await controlsFit(page, width);
        // This is deliberate grid scrolling; the document stays at its own width.
        const viewport = page.getByRole("treegrid", {
          name: "Participant showcase",
        });
        await viewport.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        expect(
          await viewport.evaluate((node) => node.scrollLeft),
        ).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.scrollX)).toBe(0);
        await viewport.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
          (document.activeElement as HTMLElement)?.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: info.outputPath(`${width}-${style}-${mode}-groups.png`),
          fullPage: true,
        });
        await grouping(page)
          .getByRole("button", { name: "Remove grouping Country", exact: true })
          .click();
        await expect(grouping(page).locator("[data-group-focus]")).toHaveCount(
          2,
        );
        await page
          .getByRole("button", { name: "Reset view", exact: true })
          .click();
      }
    }
    expect(errors).toEqual([]);
  });
}

test("wide-to-phone resize preserves groups and keyboard access without clipped header actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("showcase/");
  for (const column of ["game", "country"]) {
    await grouping(page).getByRole("combobox").selectOption(column);
    await grouping(page)
      .getByRole("button", { name: "Add group", exact: true })
      .click();
  }
  for (const width of [556, 320, 768, 390]) {
    await page.setViewportSize({ width, height: 812 });
    await expect(grouping(page).locator("[data-group-focus]")).toHaveCount(2);
    await controlsFit(page, width);
    const tools = page.getByRole("button", {
      name: "Columns & filters",
      exact: true,
    });
    await tools.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Grid tools", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tools).toBeFocused();
    if (width <= 700) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await menu.click();
      await expect(
        page.getByRole("dialog", { name: "Main navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await page
        .getByRole("button", { name: "Search docs", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Search documentation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
});

test.describe("touch and short landscape", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const width of [320, 390]) {
    test(`phone grouping touch targets remain usable at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("showcase/");
      await page
        .getByRole("combobox", { name: "Grid style" })
        .selectOption("material");
      await page
        .getByRole("combobox", { name: "Demo appearance", exact: true })
        .selectOption("dark");
      const groups = grouping(page);
      for (const column of ["game", "country", "language"]) {
        await groups.getByRole("combobox").selectOption(column);
        await groups
          .getByRole("button", { name: "Add group", exact: true })
          .tap();
      }
      await controlsFit(page, width);
      for (const button of await groups
        .locator(".og-group-chip button")
        .all()) {
        await contained(button, width);
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await groups
        .getByRole("button", {
          name: "Move grouping Country earlier",
          exact: true,
        })
        .tap();
      await expect(
        groups.locator("[data-group-focus]").first(),
      ).toHaveAttribute("data-group-focus", "country");
      await groups
        .getByRole("button", { name: "Remove grouping Country", exact: true })
        .tap();
      await expect(groups.locator("[data-group-focus]")).toHaveCount(2);
      await page.screenshot({
        path: info.outputPath(`${width}-portrait-touch-groups.png`),
        fullPage: true,
      });
    });
  }
  test("native phone swipe scrolls columns without moving the document sideways", async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("showcase/");
    const grid = page.getByRole("grid", { name: "Participant showcase" });
    await grid.scrollIntoViewIfNeeded();
    const box = await grid.boundingBox();
    const y = Math.min(730, Math.max(160, box!.y + 230));
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 320, y }],
    });
    for (const x of [290, 250, 210, 170, 130, 90, 50]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y }],
      });
      await page.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => grid.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(100);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(375);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await page.screenshot({ path: info.outputPath("375-native-swipe.png") });
    await session.detach();
  });
  for (const viewport of [
    { width: 556, height: 320 },
    { width: 812, height: 390 },
  ]) {
    test(`touch controls and drawer stay reachable ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      await page.goto("showcase/");
      await page
        .getByRole("combobox", { name: "Grid style" })
        .selectOption("material");
      await page
        .getByRole("combobox", { name: "Demo appearance", exact: true })
        .selectOption("dark");
      const tools = page.getByRole("button", {
        name: "Columns & filters",
        exact: true,
      });
      await tools.tap();
      const drawer = page.getByRole("dialog", {
        name: "Grid tools",
        exact: true,
      });
      const groups = drawer.getByRole("region", {
        name: "Columns: Row groups",
      });
      for (const column of ["game", "country", "language"]) {
        await groups.getByRole("combobox").selectOption(column);
        await groups
          .getByRole("button", { name: "Add group", exact: true })
          .tap();
      }
      await groups
        .getByRole("button", { name: "Remove grouping Country", exact: true })
        .tap();
      await expect(groups.locator("[data-group-focus]")).toHaveCount(2);
      await page.screenshot({
        path: info.outputPath(`${viewport.width}-landscape-drawer.png`),
      });
      const close = drawer.getByRole("button", {
        name: "Close grid tools",
        exact: true,
      });
      await expect(close).toBeInViewport();
      await close.tap();
      await expect(drawer).not.toBeVisible();
      await expect(tools).toBeFocused();
      await controlsFit(page, viewport.width);
      const grid = page.getByRole("treegrid", { name: "Participant showcase" });
      const box = await grid.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(260);
    });
  }
});

test("enlarged reading text keeps phone actions reachable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("showcase/");
  await page.addStyleTag({
    content:
      ".showcase-intro p, .showcase-help { font-size: 32px; line-height: 1.5; }",
  });
  await controlsFit(page, 390);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Columns & filters", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: info.outputPath("390-text-200.png"),
    fullPage: true,
  });
});
