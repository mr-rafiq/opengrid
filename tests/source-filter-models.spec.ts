import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const) {
    test(`source filter models combine with external predicates ${width}px ${theme}`, async ({
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
      await grid
        .getByRole("button", { name: "Expand Planning", exact: true })
        .click();
      await lab
        .locator("summary")
        .filter({ hasText: "Source filter model example" })
        .click();
      await lab
        .getByRole("button", { name: "Apply Planning source filter" })
        .click();
      await expect(grid.getByText("Line A", { exact: true })).toBeVisible();
      await expect(grid.getByText("Build", { exact: true })).toHaveCount(0);
      await lab
        .getByRole("button", { name: "Amounts at least EUR 100", exact: true })
        .click();
      await expect(grid.getByText("Line A", { exact: true })).toHaveCount(0);
      await expect(grid.getByText("Line B", { exact: true })).toBeVisible();
      await lab
        .getByRole("button", { name: "Amounts at least EUR 100", exact: true })
        .click();
      await expect(grid.getByText("Line A", { exact: true })).toBeVisible();
      const amountFilter = lab.getByRole("button", {
        name: "Apply source amount filter",
      });
      await amountFilter.focus();
      await amountFilter.press("Enter");
      await expect(grid.getByText("Line A", { exact: true })).toHaveCount(0);
      await expect(grid.getByText("Build", { exact: true })).toBeVisible();
      await lab
        .getByRole("button", { name: "Clear source filter model" })
        .click();
      await expect(grid.getByText("Line A", { exact: true })).toBeVisible();
      await lab
        .getByRole("button", { name: "Apply Planning source filter" })
        .click();
      await lab
        .getByRole("button", { name: "Clear records", exact: true })
        .click();
      await lab
        .getByRole("button", { name: "Load source records", exact: true })
        .click();
      await expect(grid.getByText("Build", { exact: true })).toBeVisible();
      await lab
        .getByRole("button", { name: "Stage Planning filter", exact: true })
        .click();
      await expect(
        lab.getByRole("status", { name: "Staged source filter" }),
      ).toContainText('"values":["Planning"]');
      await expect(grid.getByText("Build", { exact: true })).toBeVisible();
      const apply = lab.getByRole("button", {
        name: "Apply staged filters",
        exact: true,
      });
      await apply.focus();
      await apply.press("Enter");
      await expect(grid.getByText("Build", { exact: true })).toHaveCount(0);
      await lab
        .getByRole("button", { name: "Stage phase filter clear", exact: true })
        .click();
      await expect(
        lab.getByRole("status", { name: "Staged source filter" }),
      ).toContainText("Staged: {}");
      await expect(grid.getByText("Build", { exact: true })).toHaveCount(0);
      await apply.click();
      await expect(grid.getByText("Build", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await lab.screenshot({
        path: info.outputPath(`source-filter-models-${width}-${theme}.png`),
      });
      expect(errors).toEqual([]);
    });
  }
