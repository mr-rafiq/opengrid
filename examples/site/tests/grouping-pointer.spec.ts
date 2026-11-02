import { test, expect } from "@playwright/test";

test("the component playground exposes the participant showcase without page overflow", async ({
  page,
}) => {
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("demo/");
    if (width < 1000)
      await page
        .getByRole("button", {
          name: "Open playground navigation",
          exact: true,
        })
        .click();
    await expect(
      page
        .getByRole("link", { name: "Participant showcase", exact: false })
        .first(),
    ).toHaveAttribute("href", "https://mr-rafiq.github.io/opengrid/showcase/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test.describe("touch grouping alternatives", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 812 },
  });
  test("six grouping chips remain reachable in a compact native tools drawer", async ({
    page,
  }, info) => {
    await page.goto("showcase/");
    await page
      .getByRole("combobox", { name: "Grid style" })
      .selectOption("material");
    await page
      .getByRole("combobox", { name: "Demo appearance", exact: true })
      .selectOption("dark");
    const open = page.getByRole("button", {
      name: "Columns & filters",
      exact: true,
    });
    await open.tap();
    const drawer = page.getByRole("dialog", {
      name: "Grid tools",
      exact: true,
    });
    const groups = drawer.getByRole("region", { name: "Columns: Row groups" });
    for (const column of [
      "name",
      "country",
      "language",
      "game",
      "bought",
      "online",
    ]) {
      await groups.getByRole("combobox").selectOption(column);
      await groups
        .getByRole("button", { name: "Add group", exact: true })
        .tap();
    }
    await expect(groups.locator("[data-group-focus]")).toHaveCount(6);
    const bounds = await groups.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(812);
    await groups
      .getByRole("button", { name: "Remove grouping Online", exact: true })
      .tap();
    await expect(groups.locator("[data-group-focus]")).toHaveCount(5);
    await page.screenshot({
      path: info.outputPath("grouping-touch-dark.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(open).toBeFocused();
  });
});

for (const source of ["header", "sidebar"] as const) {
  for (const destination of ["top", "sidebar"] as const) {
    test(`real pointer ${source} to ${destination}: nested groups, chip reorder and removal`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 1600, height: 1050 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("showcase/");
      await page
        .getByRole("combobox", { name: "Grid style" })
        .selectOption("material");
      const top = page.locator(".showcase-grid > .og-root > .og-group-panel");
      const side = page.getByRole("complementary", { name: "Grid tools" });
      const sideZone = side.getByRole("region", {
        name: "Columns: Row groups",
      });
      const drop = (destination === "top" ? top : sideZone).locator(
        ".og-group-drop-target",
      );
      for (const [columnId, name] of [
        ["country", "Country"],
        ["game", "Game name"],
      ]) {
        if (source === "sidebar") await side.getByRole("searchbox").fill(name);
        const origin =
          source === "header"
            ? page.getByRole("button", { name: `Sort ${name}`, exact: true })
            : side.locator(`[data-group-drag-column="${columnId}"]`);
        // Playwright dragTo drives native mouse input and the browser's DataTransfer.
        await origin.dragTo(drop.locator(".og-group-append-target"));
        await expect(
          top.getByRole("button", {
            name: `Remove grouping ${name}`,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          sideZone.getByRole("button", {
            name: `Remove grouping ${name}`,
            exact: true,
          }),
        ).toBeVisible();
      }
      await side.getByRole("searchbox").clear();
      await expect(
        side.getByRole("checkbox", { name: "Country", exact: true }),
      ).toBeChecked();
      const grid = page.getByRole("treegrid", { name: "Participant showcase" });
      await grid
        .getByRole("button", { name: "Expand United Kingdom", exact: true })
        .click();
      await expect(
        grid.getByRole("button", {
          name: "Expand Starfall Rally",
          exact: true,
        }),
      ).toBeVisible();
      await expect(grid.locator('[data-column-id="record"]').first()).toHaveCSS(
        "width",
        "220px",
      );
      const gameChip = top.locator("li").filter({
        has: page.getByRole("button", {
          name: "Sort groups by Game name",
          exact: true,
        }),
      });
      const countryChip = top.locator("li").filter({
        has: page.getByRole("button", {
          name: "Sort groups by Country",
          exact: true,
        }),
      });
      await gameChip.dragTo(countryChip);
      await expect(top.locator("[data-group-focus]")).toHaveText([
        "Game name",
        "Country",
      ]);
      await expect(sideZone.locator("[data-group-focus]")).toHaveText([
        "Game name",
        "Country",
      ]);
      await sideZone
        .getByRole("button", { name: "Remove grouping Country", exact: true })
        .click();
      await expect(top.locator("[data-group-focus]")).toHaveText(["Game name"]);
      await page.screenshot({
        path: info.outputPath(`grouping-${source}-${destination}.png`),
        fullPage: true,
      });
      await top
        .getByRole("button", { name: "Remove grouping Game name", exact: true })
        .click();
      await expect(
        page.getByRole("grid", { name: "Participant showcase" }),
      ).toBeVisible();
      await expect(
        page.locator(
          '.showcase-grid [data-row-id="participant-1"][data-column-id="record"]',
        ),
      ).toHaveCSS("width", "95px");
      expect(errors).toEqual([]);
    });
  }
}
test("sidebar destinations stay visible while column categories scroll and grips offer keyboard alternatives", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("showcase/");
  const side = page.getByRole("complementary", { name: "Grid tools" });
  const zone = side.getByRole("region", { name: "Columns: Row groups" });
  const before = await zone.boundingBox();
  await side.locator(".og-side-tree").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect((await zone.boundingBox())?.y).toBe(before?.y);
  await expect(zone.locator(".og-group-drop-target")).toBeVisible();
  await side.getByRole("searchbox").fill("Name");
  const grip = side.getByRole("button", { name: "Group by Name", exact: true });
  await grip.focus();
  await page.keyboard.press("Enter");
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("treegrid", { name: "Participant showcase" }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "false");
  await expect(
    side.getByRole("checkbox", { name: "Name", exact: true }),
  ).toBeChecked();
});
