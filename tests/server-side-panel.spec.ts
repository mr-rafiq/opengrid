import { test, expect } from "@playwright/test";
const failures = new WeakMap<object, string[]>();
const entry = process.env.GRID_BASE_PATH ?? "/";
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));
for (const preset of ["minimal", "material"])
  for (const mode of ["light", "dark"])
    test(`provider sidebar: real drags, nested queries, filters and formats in ${preset} ${mode}`, async ({
      page,
    }, info) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(entry);
      await page
        .getByRole("combobox", { name: "Color theme", exact: true })
        .selectOption(mode);
      await page
        .getByRole("button", { name: "Server grouping lab", exact: true })
        .click();
      const lab = page.getByRole("region", {
        name: "Remote grouping example",
        exact: true,
      });
      await lab
        .getByRole("combobox", { name: "Server grid style", exact: true })
        .selectOption(preset);
      const side = lab.getByRole("complementary", {
        name: "Server sidebar",
        exact: true,
      });
      let grid = lab.getByRole("treegrid", {
        name: "Simultaneous server groups",
        exact: true,
      });
      await expect(grid.getByText("$15.00", { exact: true })).toBeVisible();
      const group = side.getByRole("region", {
        name: "Server Row groups",
        exact: true,
      });
      await grid
        .getByRole("button", { name: "Sort Order", exact: true })
        .dragTo(group.locator(".og-group-append-target"));
      await expect(
        group.getByRole("button", {
          name: "Sort groups by Order",
          exact: true,
        }),
      ).toBeVisible();
      await grid
        .getByRole("button", { name: "Expand Team A", exact: true })
        .click();
      await expect(
        grid.getByRole("button", {
          name: "Expand Order: Remote A 1",
          exact: true,
        }),
      ).toBeVisible();
      await group
        .getByRole("button", {
          name: "Move grouping Order earlier",
          exact: true,
        })
        .click();
      await expect(group.locator("[data-group-focus]")).toHaveText([
        "Order",
        "Team",
      ]);
      await expect(
        grid.getByRole("button", {
          name: "Expand Order: Remote A 1",
          exact: true,
        }),
      ).toBeVisible();
      await group
        .getByRole("button", { name: "Remove grouping Order", exact: true })
        .click();
      await expect(
        grid.getByRole("button", { name: "Expand Team A", exact: true }),
      ).toBeVisible();
      await group
        .getByRole("button", { name: "Remove grouping Team", exact: true })
        .click();
      grid = lab.getByRole("grid", {
        name: "Simultaneous server groups",
        exact: true,
      });
      await expect(grid.getByText("Remote A 1", { exact: true })).toBeVisible();
      await side
        .getByRole("button", { name: "Group by Team", exact: true })
        .dragTo(group.locator(".og-group-append-target"));
      grid = lab.getByRole("treegrid", {
        name: "Simultaneous server groups",
        exact: true,
      });
      await expect(
        grid.getByRole("button", { name: "Expand Team A", exact: true }),
      ).toBeVisible();
      const values = side.getByRole("combobox", {
        name: "Values: Amount",
        exact: true,
      });
      await values.selectOption("avg");
      await expect(grid.getByText("$5.00", { exact: true })).toBeVisible();
      await expect(grid.getByText("$5.33", { exact: true })).toBeVisible();
      await values.selectOption("count");
      await expect(
        grid.locator('.og-group-row [data-column-id="amount"]'),
      ).toHaveText(["3", "3"]);
      await values.selectOption("sum");
      await expect(grid.getByText("$15.00", { exact: true })).toBeVisible();
      const header = grid
        .getByRole("button", { name: "Sort Amount", exact: true })
        .locator("..");
      const resize = grid.getByRole("separator", {
        name: "Resize Amount",
        exact: true,
      });
      await resize.focus();
      await page.keyboard.press("ArrowRight");
      const width = (await header.boundingBox())!.width;
      await side.getByRole("checkbox", { name: "Team", exact: true }).check();
      await expect(
        grid.getByRole("button", { name: "Sort Team", exact: true }),
      ).toBeVisible();
      expect((await header.boundingBox())!.width).toBeCloseTo(width, 0);
      await side.getByRole("tab", { name: "Filters", exact: true }).click();
      await expect(
        side.getByRole("button", { name: "Filters: Amount", exact: true }),
      ).toHaveCSS("border-top-width", "0px");
      await side
        .getByRole("button", { name: "Filters: Amount", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Conditions for Amount",
        exact: true,
      });
      await dialog
        .getByRole("combobox", { name: "Operator for condition 1" })
        .selectOption("gte");
      await dialog
        .getByRole("textbox", { name: "Value for condition 1" })
        .fill("5");
      await dialog
        .getByRole("button", { name: "Apply conditions", exact: true })
        .click();
      await expect(grid.getByText("$14.00", { exact: true })).toBeVisible();
      await expect(grid.getByText("$8.00", { exact: true })).toBeVisible();
      await lab.screenshot({
        path: info.outputPath(`server-sidebar-${preset}-${mode}.png`),
      });
      await side
        .getByRole("button", { name: "Filters: Amount", exact: true })
        .click();
      await dialog.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(grid.getByText("$15.00", { exact: true })).toBeVisible();
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      const violations = await lab.evaluate(async (node) =>
        (await (window as any).axe.run(node)).violations
          .filter((item: any) => ["serious", "critical"].includes(item.impact))
          .map((item: any) => item.id),
      );
      expect(violations).toEqual([]);
    });
test("provider sidebar responsive screenshots keep actions contained across six widths and four themes", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  for (const width of [320, 375, 390, 556, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(entry);
    await page
      .getByRole("button", { name: "Server grouping lab", exact: true })
      .click();
    const lab = page.getByRole("region", {
      name: "Remote grouping example",
      exact: true,
    });
    for (const preset of ["minimal", "material"])
      for (const mode of ["light", "dark"]) {
        await page
          .getByRole("combobox", { name: "Color theme", exact: true })
          .selectOption(mode);
        await lab
          .getByRole("combobox", { name: "Server grid style", exact: true })
          .selectOption(preset);
        await expect(
          lab.getByRole("button", { name: "Expand Team A", exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await lab.screenshot({
          path: info.outputPath(`remote-${width}-${preset}-${mode}.png`),
        });
        if (width < 1000) {
          const open = lab.getByRole("button", {
            name: "Server columns & filters",
            exact: true,
          });
          await open.click();
          const drawer = page.getByRole("dialog", {
            name: "Server tools",
            exact: true,
          });
          await expect(drawer).toBeVisible();
          const chip = drawer.getByRole("button", {
            name: "Sort groups by Team",
            exact: true,
          });
          expect((await chip.boundingBox())!.height).toBeLessThanOrEqual(44);
          await expect(
            drawer.getByRole("button", { name: "Group by Order", exact: true }),
          ).toHaveCSS("border-top-width", "0px");

          await expect(
            drawer.getByRole("region", {
              name: "Server Row groups",
              exact: true,
            }),
          ).toBeVisible();
          await page.screenshot({
            path: info.outputPath(
              `remote-drawer-${width}-${preset}-${mode}.png`,
            ),
          });
          await page.keyboard.press("Escape");
          await expect(drawer).not.toBeVisible();
          await expect(open).toBeFocused();
        }
      }
  }
});
test.describe("provider sidebar touch alternatives", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("touch adds/removes groups, nested conditions own Escape and landscape close remains reachable", async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(entry);
      await page
        .getByRole("button", { name: "Server grouping lab", exact: true })
        .tap();
      const lab = page.getByRole("region", {
        name: "Remote grouping example",
        exact: true,
      });
      await lab
        .getByRole("combobox", { name: "Server grid style", exact: true })
        .selectOption("material");
      const open = lab.getByRole("button", {
        name: "Server columns & filters",
        exact: true,
      });
      await open.tap();
      const drawer = page.getByRole("dialog", {
        name: "Server tools",
        exact: true,
      });
      const group = drawer.getByRole("region", {
        name: "Server Row groups",
        exact: true,
      });
      await group.getByRole("combobox").selectOption("name");
      await group.getByRole("button", { name: "Add group", exact: true }).tap();
      await expect(
        group.getByRole("button", {
          name: "Remove grouping Order",
          exact: true,
        }),
      ).toBeVisible();
      await group
        .getByRole("button", { name: "Remove grouping Order", exact: true })
        .tap();
      await drawer.getByRole("tab", { name: "Filters", exact: true }).tap();
      const launcher = drawer.getByRole("button", {
        name: "Filters: Amount",
        exact: true,
      });
      await launcher.tap();
      await expect(
        page.getByRole("dialog", {
          name: "Conditions for Amount",
          exact: true,
        }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeVisible();
      await expect(launcher).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
      await expect(open).toBeFocused();
      await page.setViewportSize({ width: 844, height: 390 });
      await open.tap();
      const close = drawer.getByRole("button", {
        name: "Close server tools",
        exact: true,
      });
      const bounds = (await close.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: info.outputPath(`remote-touch-landscape-${width}.png`),
      });
      await close.tap();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
});
