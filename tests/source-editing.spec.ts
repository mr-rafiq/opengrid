import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const) {
    test(`source editing ${width}px ${theme}: typed values, requests, groups and cancellation`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Source editing contracts lab",
          exact: true,
        })
        .click();
      const lab = page.getByRole("article", {
        name: "Source editing contracts",
        exact: true,
      });
      const grid = lab.getByRole("grid", { name: "Source editing sample" });
      await expect(grid).toBeVisible();
      await lab
        .getByRole("button", { name: "Edit first displayed label" })
        .click();
      const editor = lab.getByRole("textbox", { name: "Source label editor" });
      await expect(editor).toBeFocused();
      await editor.fill("Updated survey");
      await editor.press("Enter");
      await expect(
        lab.getByRole("status", { name: "Source edit outcome" }),
      ).toHaveText("Committed label; original classes: true");
      await expect(
        grid.getByRole("gridcell", { name: "Updated survey", exact: true }),
      ).toBeVisible();
      await lab
        .getByRole("checkbox", { name: "Request changes without mutation" })
        .check();
      await lab
        .getByRole("button", { name: "Edit first displayed label" })
        .click();
      await editor.fill("Request only");
      await editor.press("Enter");
      await expect(
        lab.getByRole("status", { name: "Source edit outcome" }),
      ).toContainText("Requested label: Request only; data unchanged");
      await expect(
        grid.getByRole("gridcell", { name: "Updated survey", exact: true }),
      ).toBeVisible();
      await lab
        .getByRole("checkbox", { name: "Request changes without mutation" })
        .uncheck();
      await lab.getByRole("button", { name: "Group by phase" }).click();
      await lab
        .getByRole("button", { name: "Edit first displayed label" })
        .click();
      await editor.fill("Planning group");
      await editor.press("Enter");
      await expect(
        lab.getByRole("status", { name: "Source edit outcome" }),
      ).toHaveText("Committed label; original classes: true");
      const tree = lab.getByRole("treegrid", { name: "Source editing sample" });
      await expect(
        tree.getByRole("gridcell", { name: "Planning group", exact: true }),
      ).toHaveCount(1);
      await lab
        .getByRole("checkbox", { name: "Cancel on editing start" })
        .check();
      await lab
        .getByRole("button", { name: "Edit first displayed label" })
        .click();
      await expect(editor).toHaveCount(0);
      await expect(
        tree.getByRole("gridcell", { name: "Planning group", exact: true }),
      ).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await lab.screenshot({
        path: info.outputPath(`source-editing-${width}-${theme}.png`),
      });
      expect(errors).toEqual([]);
    });
  }
