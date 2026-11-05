import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const) {
    test(`resident selection retains refreshed class order ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .click();
      const lab = page.getByRole("article", {
          name: "Experimental legacy React bridge",
        }),
        grid = lab.locator('[role="treegrid"]');
      await lab.getByRole("button", { name: "Load source records" }).click();
      await lab
        .locator("summary")
        .filter({ hasText: "Retained-record refresh example" })
        .click();
      await lab
        .getByRole("button", { name: "Set sample A to EUR 300" })
        .click();
      const amount = grid.locator('[data-row-id="A"][data-column-id="amount"]');
      await expect(amount).toContainText("300,00");
      const order = () =>
        grid
          .locator(
            '[data-column-id="item"][data-row-id="A"], [data-column-id="item"][data-row-id="B"]',
          )
          .allTextContents();
      await expect.poll(order).toEqual(["Line A", "Line B"]);
      await grid
        .getByRole("checkbox", { name: "Select B", exact: true })
        .check();
      await expect.poll(order).toEqual(["Line A", "Line B"]);
      await lab.getByRole("button", { name: "Clear selection" }).click();
      await expect.poll(order).toEqual(["Line A", "Line B"]);
      await lab.getByRole("button", { name: "Reapply amount sort" }).click();
      await expect.poll(order).toEqual(["Line B", "Line A"]);
      await expect(amount).toContainText("300,00");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await lab.screenshot({
        path: info.outputPath(`selection-stage-${width}-${theme}.png`),
      });
      expect(errors).toEqual([]);
    });
  }
