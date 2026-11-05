import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const mode of ["light", "dark"] as const)
    test(`source column reset retains independent state ${width} ${mode}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: mode });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .click();
      const lab = page.getByRole("article", {
          name: "Experimental legacy React bridge",
        }),
        grid = lab.locator('[role="grid"], [role="treegrid"]'),
        summary = lab.getByRole("status", { name: "Source summary" });
      await lab
        .getByRole("button", { name: "Load source records", exact: true })
        .click();
      await grid
        .getByRole("button", { name: "Expand Planning", exact: true })
        .click();
      await grid
        .getByRole("checkbox", { name: "Select A", exact: true })
        .check();
      await expect(summary).toContainText("1 selected");
      await lab
        .locator("summary")
        .filter({ hasText: "Source filter model example" })
        .click();
      await lab
        .getByRole("button", {
          name: "Apply Planning source filter",
          exact: true,
        })
        .click();
      await lab
        .locator("summary")
        .filter({ hasText: "Source filter model example" })
        .click();
      await grid.getByRole("button", { name: /Expand.*Values/ }).click();
      await lab
        .locator("summary")
        .filter({ hasText: "Source column reset example" })
        .click();
      await lab
        .getByRole("button", { name: "Apply sample layout", exact: true })
        .click();
      await expect(
        grid.getByRole("button", { name: "Sort Phase", exact: true }),
      ).toBeVisible();
      await expect(
        grid.getByRole("button", { name: "Expand Planning", exact: true }),
      ).toHaveCount(0);
      await expect(grid.getByText("Line A", { exact: true })).toBeVisible();
      await expect(grid.getByText("Line B", { exact: true })).toBeVisible();
      await expect(grid.getByText("Line C", { exact: true })).toHaveCount(0);
      const reset = lab.getByRole("button", {
        name: "Reset source columns",
        exact: true,
      });
      await reset.focus();
      await reset.press("Enter");
      await expect(reset).toBeFocused();
      await expect(
        grid.getByRole("button", { name: "Sort Phase", exact: true }),
      ).toHaveCount(0);
      await expect(
        grid.getByRole("button", { name: /Collapse Planning/ }),
      ).toBeVisible();
      await expect(
        grid.getByRole("checkbox", { name: "Select A", exact: true }),
      ).toBeChecked();
      await expect(
        grid.getByRole("button", { name: "Sort Raw amount", exact: true }),
      ).toBeAttached();
      await expect(summary).toContainText("1 selected");
      await expect(grid.getByText("Line C", { exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await lab.screenshot({
        path: info.outputPath(`source-column-reset-${width}-${mode}.png`),
      });
      expect(errors).toEqual([]);
    });
