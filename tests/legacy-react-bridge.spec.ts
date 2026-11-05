import { test, expect } from "@playwright/test";

for (const width of [320, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`public resident bridge ${width}px ${theme}: nullable rows, source methods, filters, ref selection and teardown`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("./#legacy-react-bridge");
      const launcher = page.getByRole("button", {
        name: "Legacy React bridge lab",
        exact: true,
      });
      await launcher.click();
      const lab = page.getByRole("article", {
        name: "Experimental legacy React bridge",
      });
      const grid = lab.locator('[role="grid"], [role="treegrid"]');
      await expect(grid).toBeVisible();
      await expect(
        lab.getByRole("status", { name: "Source summary" }),
      ).toContainText("0 displayed rows");
      await lab.getByRole("button", { name: "Load source records" }).click();
      await expect(
        lab.getByRole("status", { name: "Source summary" }),
      ).toContainText("2 displayed rows");
      await grid.getByRole("checkbox", { name: /select all/i }).check();
      await expect(
        lab.getByRole("status", { name: "Source summary" }),
      ).toContainText("3 selected");
      await lab.getByRole("button", { name: "Clear selection" }).click();
      await expect(
        lab.getByRole("status", { name: "Source summary" }),
      ).toContainText("0 selected");
      await grid
        .getByRole("button", { name: "Expand Planning", exact: true })
        .first()
        .click();
      await expect(grid.getByText("Line A", { exact: true })).toBeVisible();
      const changedCell = grid.locator(
        '[data-row-id="B"][data-column-id="amount"]',
      );
      const changedRow = grid.locator('[data-og-row-id="B"]');
      await lab
        .getByRole("button", { name: "Highlight sample changes" })
        .click();
      await expect(changedCell).toHaveClass(/legacy-source-change/);
      await expect(changedCell).toHaveAttribute("title", /Line B: .*240,00/);
      await expect(changedRow).toHaveCSS("font-weight", "600");
      await lab
        .getByRole("button", { name: "Highlight sample changes" })
        .click();
      await expect(changedCell).not.toHaveClass(/legacy-source-change/);
      const amount = grid.locator('[data-row-id="A"][data-column-id="amount"]');
      await expect(amount).toContainText("80,00");
      const amountBox = await amount.boundingBox(),
        viewportBox = await grid.boundingBox();
      expect(amountBox!.x + amountBox!.width).toBeLessThanOrEqual(
        viewportBox!.x + viewportBox!.width + 1,
      );
      await lab
        .getByRole("button", { name: "Amounts at least EUR 100" })
        .click();
      await expect(grid.getByText("Line A", { exact: true })).toHaveCount(0);
      await expect(grid.getByText("Line B", { exact: true })).toBeVisible();
      await lab
        .getByRole("button", { name: "Amounts at least EUR 100" })
        .click();
      await expect(grid.getByText("Line A", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await lab.screenshot({
        path: info.outputPath(`resident-bridge-${width}-${theme}.png`),
      });
      await lab.getByRole("button", { name: "Clear records" }).click();
      await expect(
        lab.getByRole("status", { name: "Source summary" }),
      ).toContainText("0 displayed rows");
      await launcher.click();
      await launcher.click();
      await expect(
        lab.getByRole("status", { name: "Source summary" }),
      ).toContainText("0 displayed rows");
      expect(errors).toEqual([]);
    });
  }
}
