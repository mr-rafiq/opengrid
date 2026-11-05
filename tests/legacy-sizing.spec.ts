import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${width}px ${theme} sizing`, () => {
      test.use({ hasTouch: width === 320, isMobile: width === 320 });
      test(`source renderer sizing ${width}px ${theme}: natural widths, headings, state and deferred reset`, async ({
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
          .getByText("Source rendered sizing example", { exact: true })
          .click();
        const lab = page.getByRole("region", {
            name: "Source rendered sizing example",
          }),
          grid = lab.getByRole("grid"),
          status = lab.getByRole("status", { name: "Source sizing result" });
        const cell = grid.locator('[data-row-id="a"][data-column-id="item"]');
        await expect(
          lab.getByRole("button", { name: "Size mounted values", exact: true }),
        ).toBeEnabled();
        const action = grid.getByRole("button", {
          name: "Local action for Local assembly with a longer label",
        });
        if (width === 320) await action.tap();
        else await action.click();
        await expect(action).toHaveText("Action 1");
        await lab
          .getByRole("button", { name: "Size mounted values", exact: true })
          .click();
        await expect(status).toContainText(/item: \d+px/);
        const valueWidth = (await cell.boundingBox())!.width;
        expect(valueWidth).toBeGreaterThan(180);
        await expect(action).toHaveText("Action 1");
        await lab
          .getByRole("button", { name: "Size with headings", exact: true })
          .click();
        await expect
          .poll(async () => (await cell.boundingBox())!.width)
          .toBeGreaterThan(valueWidth + 50);
        await expect(action).toHaveText("Action 1");
        await lab
          .getByRole("button", { name: "Restore declared widths", exact: true })
          .click();
        await expect
          .poll(async () => (await cell.boundingBox())!.width)
          .toBe(180);
        await lab
          .getByRole("button", { name: "Deferred sizing reset", exact: true })
          .click();
        await expect
          .poll(async () => (await cell.boundingBox())!.width)
          .toBe(valueWidth);
        await expect(action).toHaveText("Action 1");
        await expect(status).not.toContainText(/cancelled|failed/i);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await lab.screenshot({
          path: info.outputPath(`sizing-${width}-${theme}.png`),
        });
        await page
          .getByText("Source rendered sizing example", { exact: true })
          .click();
        await expect(grid).toHaveCount(0);
        expect(errors).toEqual([]);
      });
    });
  }
