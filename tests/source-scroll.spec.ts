import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`source mounted scrolling ${width} ${theme}: both axes, selection, focus, resize and delayed restore`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("./#legacy-react-bridge");
      const launcher = page.getByRole("button", {
        name: "Legacy React bridge lab",
        exact: true,
      });
      await launcher.click();
      const article = page.getByRole("article", {
        name: "Experimental legacy React bridge",
      });
      await article
        .locator("summary")
        .filter({ hasText: "Source scroll restoration example" })
        .click();
      const example = article.getByRole("region", {
          name: "Source scroll restoration example",
        }),
        grid = example.getByRole("grid"),
        position = example.getByRole("status", {
          name: "Source viewport position",
        });
      const start = example.getByRole("button", {
          name: "Scroll to start",
          exact: true,
        }),
        middle = example.getByRole("button", {
          name: "Scroll to middle",
          exact: true,
        });
      await expect(middle).toBeEnabled();
      await grid
        .getByRole("checkbox", { name: "Select 1", exact: true })
        .check();
      await middle.focus();
      await page.keyboard.press("Enter");
      await expect(middle).toBeFocused();
      await expect.poll(() => grid.evaluate((e) => e.scrollTop)).toBe(800);
      await expect.poll(() => grid.evaluate((e) => e.scrollLeft)).toBe(140);
      await expect(position).toContainText("Top 800px; left 140px");
      await expect(
        grid.getByText("Synthetic line 21", { exact: true }),
      ).toBeVisible();
      await example
        .getByRole("button", { name: "Fractional sample offset", exact: true })
        .click();
      await expect
        .poll(() => grid.evaluate((e) => Math.abs(e.scrollTop - 140.5)))
        .toBeLessThanOrEqual(1);
      await expect
        .poll(() => grid.evaluate((e) => Math.abs(e.scrollLeft - 75.25)))
        .toBeLessThanOrEqual(1);
      await example
        .getByRole("button", { name: "Compact scroll host", exact: true })
        .click();
      await example
        .getByRole("button", { name: "Scroll to end", exact: true })
        .click();
      await expect(
        grid.getByText("Synthetic line 500", { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          grid.evaluate((e) =>
            Math.abs(e.scrollTop - (e.scrollHeight - e.clientHeight)),
          ),
        )
        .toBeLessThanOrEqual(1);
      await expect
        .poll(() =>
          grid.evaluate((e) =>
            Math.abs(e.scrollLeft - (e.scrollWidth - e.clientWidth)),
          ),
        )
        .toBeLessThanOrEqual(1);
      await start.click();
      await expect.poll(() => grid.evaluate((e) => e.scrollTop)).toBe(0);
      await expect.poll(() => grid.evaluate((e) => e.scrollLeft)).toBe(0);
      await expect(
        grid.getByRole("checkbox", { name: "Select 1", exact: true }),
      ).toBeChecked();
      const restore = example.getByRole("button", {
        name: "Restore sample scroll",
        exact: true,
      });
      await restore.focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => grid.evaluate((e) => e.scrollTop)).toBe(800);
      await expect.poll(() => grid.evaluate((e) => e.scrollLeft)).toBe(140);
      await expect(restore).toBeFocused();
      await expect(example.locator("[data-og-source-overlay]")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await example.screenshot({
        path: info.outputPath(`source-scroll-${width}-${theme}.png`),
      });
      await restore.click();
      await launcher.click();
      await expect(example).toHaveCount(0);
      await page.waitForTimeout(150);
      expect(errors).toEqual([]);
    });

for (const theme of ["light", "dark"] as const)
  test(`last source resize and menu stay usable with coarse touch ${theme}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 320, height: 1000 },
      hasTouch: true,
      isMobile: true,
      colorScheme: theme,
    });
    try {
      const page = await context.newPage();
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .tap();
      await page
        .locator("summary")
        .filter({ hasText: "Source scroll restoration example" })
        .tap();
      const example = page.getByRole("region", {
          name: "Source scroll restoration example",
        }),
        grid = example.getByRole("grid");
      await example
        .getByRole("button", { name: "Scroll to end", exact: true })
        .tap();
      const header = grid.locator('[data-og-size-column-id="note"]'),
        menu = header.locator(".og-column-menu-trigger"),
        separator = header.getByRole("separator");
      await expect(menu).toHaveAccessibleName(/Detail/);
      await menu.tap();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await separator.scrollIntoViewIfNeeded();
      const box = await separator.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(24);
      const session = await context.newCDPSession(page),
        x = box!.x + box!.width / 2,
        y = box!.y + box!.height / 2;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - 20, y, id: 1 }],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(separator).toHaveAttribute("aria-valuenow", "380");
      await example
        .getByRole("button", { name: "Scroll to end", exact: true })
        .tap();
      await expect
        .poll(() =>
          grid.evaluate((e) =>
            Math.abs(e.scrollLeft - (e.scrollWidth - e.clientWidth)),
          ),
        )
        .toBeLessThanOrEqual(1);
      await separator.focus();
      await page.keyboard.press("ArrowRight");
      await expect(separator).toHaveAttribute("aria-valuenow", "390");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await context.close();
    }
  });
