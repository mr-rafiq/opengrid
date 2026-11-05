import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`provided header groups ${width} ${theme}`, async ({ page }, info) => {
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
      await grid
        .getByRole("button", { name: "Expand Planning", exact: true })
        .click();
      await expect(
        grid.getByRole("button", { name: "Sort Raw amount", exact: true }),
      ).toHaveCount(0);
      const open = grid.getByRole("button", { name: /Expand.*Values/i });
      await open.focus();
      await open.press("Enter");
      await expect(
        grid.getByRole("button", { name: "Sort Raw amount", exact: true }),
      ).toBeVisible();
      await expect(
        grid.getByRole("button", { name: /Collapse.*Values/i }),
      ).toBeFocused();
      const raw = grid.locator('[data-row-id="A"][data-column-id="amountRaw"]');
      await expect(raw).toContainText("80");
      await grid.evaluate((node) => {
        node.scrollLeft = node.scrollWidth - node.clientWidth;
      });
      await expect(raw).toBeInViewport();
      await lab.screenshot({
        path: info.outputPath(`source-headers-open-${width}-${theme}.png`),
      });
      await grid
        .getByRole("button", { name: /Collapse.*Values/i })
        .press("Enter");
      await expect(
        grid.getByRole("button", { name: "Sort Raw amount", exact: true }),
      ).toHaveCount(0);
      await lab
        .locator("summary")
        .filter({ hasText: "Source header group example" })
        .click();
      await lab
        .getByRole("button", { name: "Show value details", exact: true })
        .click();
      await expect(
        grid.getByRole("button", { name: "Sort Raw amount", exact: true }),
      ).toBeVisible();
      await lab
        .getByRole("button", { name: "Reset source headers", exact: true })
        .click();
      await expect(
        grid.getByRole("button", { name: "Sort Raw amount", exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await lab.screenshot({
        path: info.outputPath(`source-headers-${width}-${theme}.png`),
      });
      expect(errors).toEqual([]);
    });
