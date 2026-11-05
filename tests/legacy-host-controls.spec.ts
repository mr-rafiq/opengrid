import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const) {
    test.describe(`source host controls ${width}px ${theme}`, () => {
      test.use({ hasTouch: width === 320, isMobile: width === 320 });
      test("padded header and source checkbox states retain pointer and keyboard operation", async ({
        page,
      }, info) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto("./#legacy-react-bridge");
        await page
          .getByRole("button", { name: "Legacy React bridge lab", exact: true })
          .click();
        await page
          .getByText("Source host layout example", { exact: true })
          .click();
        const lab = page.getByRole("region", {
          name: "Source host layout example",
        });
        await lab.getByLabel("Host grid palette").selectOption(theme);
        await expect(lab.locator(".og-source-client")).toHaveAttribute(
          "data-og-host-theme",
          "",
        );
        const grid = lab.getByRole("grid"),
          all = grid.getByRole("checkbox", {
            name: "Select all rows",
            exact: true,
          }),
          row = grid.getByRole("checkbox", { name: "Select 1", exact: true });
        const header = grid.locator(
          '[role="columnheader"][data-og-size-column-id="item"]',
        );
        const inputBox = (await all.boundingBox())!,
          headerBox = (await header.boundingBox())!;
        expect(inputBox.x - headerBox.x).toBeGreaterThanOrEqual(12);
        expect(inputBox.x + inputBox.width).toBeLessThan(
          headerBox.x + headerBox.width,
        );
        await expect(all).toHaveCSS("appearance", "none");
        if (width === 320) await all.tap();
        else await all.click();
        await expect(row).toBeChecked();
        if (width === 320) await row.tap();
        else await row.click();
        await expect(row).not.toBeChecked();
        await expect(all).toHaveAttribute("aria-checked", "mixed");
        await row.focus();
        await page.keyboard.press("Space");
        await expect(row).toBeChecked();
        await expect(all).toBeChecked();
        await lab.screenshot({
          path: info.outputPath(`host-controls-${width}-${theme}.png`),
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
      });
    });
  }
