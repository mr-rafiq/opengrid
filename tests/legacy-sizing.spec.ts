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
        const amount = grid.locator(
          '[data-row-id="a"][data-column-id="amount"]',
        );
        const previousAmount = (await amount.boundingBox())?.width;
        await lab
          .getByRole("button", { name: "Fit available width", exact: true })
          .click();
        await expect(status).toContainText("Fit complete");
        await expect
          .poll(async () => (await amount.boundingBox())?.width)
          .toBe(previousAmount);
        await expect(action).toHaveText("Action 1");
        const body = lab.locator(".og-viewport");
        const layout = await body.evaluate((element) => ({
          client: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        const fittedItem = (await cell.boundingBox())!,
          fittedAction = (await action.boundingBox())!;
        expect(fittedItem.width).toBeGreaterThanOrEqual(140);
        expect(fittedAction.x).toBeGreaterThanOrEqual(fittedItem.x);
        expect(fittedAction.x + fittedAction.width).toBeLessThanOrEqual(
          fittedItem.x + fittedItem.width + 1,
        );
        expect(fittedAction.y + fittedAction.height).toBeLessThanOrEqual(
          fittedItem.y + fittedItem.height + 1,
        );
        expect(layout.scroll).toBeLessThanOrEqual(
          Math.max(
            layout.client,
            Math.ceil(fittedItem.width + previousAmount!),
          ) + 1,
        );
        if (width === 320) await action.tap();
        else await action.click();
        await expect(action).toHaveText("Action 2");
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
