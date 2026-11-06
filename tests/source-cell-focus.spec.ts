import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`source numeric focus ${width}px ${theme}: no implicit reveal, keyboard and selection ownership`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .click();
      await page
        .locator("summary")
        .filter({ hasText: "Source scroll restoration example" })
        .click();
      const lab = page.getByRole("region", {
          name: "Source scroll restoration example",
          exact: true,
        }),
        grid = lab.getByRole("grid"),
        status = lab.getByLabel("Source focused cell"),
        set = lab.getByRole("button", {
          name: "Set cell focus 251",
          exact: true,
        });
      await expect(status).toHaveText("No source cell focus");
      await grid
        .getByRole("checkbox", { name: "Select 1", exact: true })
        .check();
      const before = await grid.evaluate((element) => ({
        top: element.scrollTop,
        left: element.scrollLeft,
      }));
      await set.click();
      await expect(status).toHaveText("Displayed index 250; item");
      await expect(set).toBeFocused();
      expect(
        await grid.evaluate((element) => ({
          top: element.scrollTop,
          left: element.scrollLeft,
        })),
      ).toEqual(before);
      const reveal = lab.getByRole("button", {
        name: "Reveal displayed row 250",
        exact: true,
      });
      await reveal.click();
      await grid.scrollIntoViewIfNeeded();
      const cell = grid.locator('[data-row-id="251"][data-column-id="item"]');
      await expect(cell).toBeInViewport();
      await expect(reveal).toBeFocused();
      await set.click();
      await expect(cell).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(
        grid.locator('[data-row-id="252"][data-column-id="item"]'),
      ).toBeFocused();
      await expect(status).toHaveText("Displayed index 251; item");
      await lab
        .getByRole("button", { name: "Clear cell focus", exact: true })
        .click();
      await expect(status).toHaveText("No source cell focus");
      await lab.screenshot({
        path: info.outputPath(`numeric-focus-${width}-${theme}.png`),
      });
      await lab
        .getByRole("button", { name: "Scroll to start", exact: true })
        .click();
      await expect(
        grid.getByRole("checkbox", { name: "Select 1", exact: true }),
      ).toBeChecked();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
