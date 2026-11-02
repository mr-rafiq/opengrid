import { test, expect } from "@playwright/test";

for (const width of [1440, 768, 375]) {
  test(`column controls retain clear states and native actions at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 950 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("showcase/");
    const grid = page.getByRole("grid", { name: "Participant showcase" });
    for (const preset of ["minimal", "material"]) {
      await page
        .getByRole("combobox", { name: "Grid style" })
        .selectOption(preset);
      for (const mode of ["light", "dark"]) {
        await page
          .getByRole("combobox", { name: "Demo appearance", exact: true })
          .selectOption(mode);
        const group = grid.getByRole("button", {
          name: "Collapse column group Participant",
          exact: true,
        });
        await expect(group.locator("svg")).toHaveCount(1);
        await expect(group).toHaveText("Participant");
        await group.focus();
        await page.keyboard.press("Enter");
        const expand = grid.getByRole("button", {
          name: "Expand column group Participant",
          exact: true,
        });
        await expect(expand).toBeFocused();
        await expect(
          grid.getByRole("button", { name: "Sort Language", exact: true }),
        ).toHaveCount(0);
        await page.keyboard.press("Enter");
        await expect(group).toBeFocused();
        const sort = grid.getByRole("button", {
          name: "Sort Name",
          exact: true,
        });
        await expect(sort.locator(".og-sort-indicator")).toHaveCount(0);
        await sort.click();
        await expect(sort.locator(".og-sort-indicator svg")).toHaveCount(1);
        const menu = grid.getByRole("button", {
          name: "Column menu for Name",
          exact: true,
        });
        await menu.scrollIntoViewIfNeeded();
        const button = await menu.boundingBox();
        const header = await menu.locator("..").boundingBox();
        expect(
          Math.abs(
            button!.y + button!.height / 2 - header!.y - header!.height / 2,
          ),
        ).toBeLessThanOrEqual(1);
        expect(button!.height).toBeGreaterThanOrEqual(28);
        expect(button!.height).toBeLessThanOrEqual(header!.height);
        await menu.focus();
        await page.keyboard.press("ArrowDown");
        await expect(
          page.getByRole("menuitem", { name: "Sort ascending", exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole("menuitem", { name: "Sort descending", exact: true }),
        ).toBeFocused();
        await page
          .getByRole("menuitem", { name: "Sort descending", exact: true })
          .click();
        await expect(menu).toBeFocused();
        await expect(menu.locator("..")).toHaveAttribute(
          "aria-sort",
          "descending",
        );
        await grid.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await page.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: info.outputPath(
            `${width}-${preset}-${mode}-column-controls.png`,
          ),
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Reset view", exact: true })
          .click();
      }
    }
    expect(errors).toEqual([]);
  });
}

test.describe("column controls with touch", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 812 },
  });
  test("touch disclosures and filter states remain usable without repeated button boxes", async ({
    page,
  }, info) => {
    await page.goto("showcase/");
    await page
      .getByRole("combobox", { name: "Demo appearance", exact: true })
      .selectOption("dark");
    await page
      .getByRole("combobox", { name: "Grid style" })
      .selectOption("material");
    const grid = page.getByRole("grid", { name: "Participant showcase" });
    await grid
      .getByRole("button", {
        name: "Collapse column group Participant",
        exact: true,
      })
      .tap();
    await grid
      .getByRole("button", {
        name: "Expand column group Participant",
        exact: true,
      })
      .tap();
    const tools = page.getByRole("button", {
      name: "Columns & filters",
      exact: true,
    });
    await tools.tap();
    const drawer = page.getByRole("dialog", {
      name: "Grid tools",
      exact: true,
    });
    await drawer.getByRole("tab", { name: "Filters", exact: true }).tap();
    const trigger = drawer.getByRole("button", {
      name: "Filters: Name",
      exact: true,
    });
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: /Name/ });
    await dialog
      .getByRole("textbox", { name: "Value for condition 1", exact: true })
      .fill("Avery Morgan");
    await dialog
      .getByRole("button", { name: "Apply conditions", exact: true })
      .tap();
    await expect(trigger).toBeFocused();
    await expect(trigger.locator("../..")).toHaveAttribute(
      "data-filter-active",
      "true",
    );
    await page.screenshot({
      path: info.outputPath("375-material-dark-active-filter-controls.png"),
    });
    await page.keyboard.press("Escape");
    await expect(tools).toBeFocused();
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    await tools.tap();
    await expect(trigger.locator("../..")).toHaveAttribute(
      "data-filter-active",
      "false",
    );
    await page.keyboard.press("Escape");
  });
});
