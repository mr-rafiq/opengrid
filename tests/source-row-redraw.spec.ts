import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`source row redraw ${width}px ${theme}: actual renderer remount and editor ownership`, async ({
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
      const bridge = page.getByRole("article", {
        name: "Experimental legacy React bridge",
      });
      await bridge
        .locator("summary")
        .filter({ hasText: "Source row redraw example" })
        .click();
      const lab = page.getByRole("article", {
          name: "Source row redraw contracts",
        }),
        grid = lab.getByRole("treegrid");
      const counter = (name: string, count: number) =>
        grid.getByRole("button", {
          name: `Increment ${name} (${count})`,
          exact: true,
        });
      await counter("Line A", 0).click();
      await counter("Line B", 0).click();
      await counter("Planning", 0).click();
      await lab
        .getByRole("button", { name: "Refresh row cells", exact: true })
        .click();
      await expect(counter("Line A", 1)).toBeVisible();
      await expect(counter("Line B", 1)).toBeVisible();
      await lab
        .getByRole("button", { name: "Redraw Planning group", exact: true })
        .click();
      await expect(counter("Planning", 0)).toBeVisible();
      await expect(counter("Line A", 1)).toBeVisible();
      await grid
        .getByRole("checkbox", { name: "Select A", exact: true })
        .check();
      await lab
        .getByRole("button", { name: "Redraw selected rows", exact: true })
        .click();
      await expect(counter("Line A", 0)).toBeVisible();
      await expect(counter("Line B", 1)).toBeVisible();
      await expect(
        grid.getByRole("checkbox", { name: "Select A", exact: true }),
      ).toBeChecked();
      const amount = grid.locator('[data-row-id="A"][data-column-id="amount"]');
      await amount.scrollIntoViewIfNeeded();
      await amount.dblclick();
      const editor = lab.getByRole("spinbutton", { name: "Cell editor" });
      await expect(editor).toBeVisible();
      await editor.fill("888");
      await lab
        .getByRole("button", { name: "Redraw Planning group", exact: true })
        .click();
      await expect(editor).toHaveValue("888");
      await lab
        .getByRole("button", { name: "Redraw selected rows", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      await expect(amount).toHaveText("888");
      await expect(
        lab.getByRole("status", { name: "Source redraw summary" }),
      ).toContainText("1 selected; A amount 888; original records intact");
      await lab
        .getByRole("button", { name: "Redraw all rows", exact: true })
        .click();
      await expect(counter("Line B", 0)).toBeAttached();
      await expect(amount).toHaveText("888");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await lab.screenshot({
        path: info.outputPath(`source-redraw-${width}-${theme}.png`),
      });
    });
