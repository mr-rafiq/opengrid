import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const runtimeErrors = new WeakMap<object, string[]>();
test.afterEach(async ({ page }) => {
  expect(
    runtimeErrors.get(page) ?? [],
    "No runtime or hydration errors",
  ).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("showcase/");
  await expect(
    page.getByRole("grid", { name: "Participant showcase" }),
  ).toBeVisible();
});
test("physical showcase route, native model controls, synthetic renderers and source docs", async ({
  page,
  request,
}, info) => {
  const response = await request.get("showcase/");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("Room to explore.");
  const sidebar = page.getByRole("complementary", { name: "Grid tools" });
  const grid = page.getByRole("grid", { name: "Participant showcase" });
  await expect(
    grid.getByRole("button", { name: "Sort Name", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search participants" })
    .fill("Avery Morgan");
  await expect(
    grid.locator('[data-row-id="participant-1"][data-column-id="name"]'),
  ).toContainText("Avery Morgan");
  await sidebar
    .getByRole("checkbox", { name: "Language", exact: true })
    .uncheck();
  await expect(
    grid.getByRole("button", { name: "Sort Language", exact: true }),
  ).toHaveCount(0);
  await sidebar.getByRole("searchbox").fill("game");
  await expect(
    sidebar.getByRole("checkbox", { name: "Game name", exact: true }),
  ).toBeVisible();
  await sidebar.getByRole("searchbox").clear();
  await sidebar
    .getByRole("combobox", { name: "Values: Bank balance" })
    .selectOption("avg");
  const groups = sidebar.getByRole("region", { name: "Columns: Row groups" });
  await groups.getByRole("combobox").selectOption("country");
  await groups.getByRole("button", { name: "Add group", exact: true }).click();
  await expect(
    page
      .getByRole("treegrid", { name: "Participant showcase" })
      .getByRole("button", { name: "Expand United Kingdom", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(
    grid.getByRole("button", { name: "Sort Language", exact: true }),
  ).toBeVisible();
  const name = grid.locator(
    '[data-row-id="participant-1"][data-column-id="name"]',
  );
  await name.dblclick();
  await page
    .getByRole("textbox", { name: "Edit Name row participant-1", exact: true })
    .fill("Original demo edit");
  await page.keyboard.press("Enter");
  await page
    .getByRole("combobox", { name: "Grid style" })
    .selectOption("material");
  await expect(name).toHaveText("Original demo edit");
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
    document
      .querySelectorAll(".og-side-body, .og-side-tree")
      .forEach((node) => {
        node.scrollTop = 0;
      });
  });
  await page.screenshot({
    path: info.outputPath("participant-desktop-material-light.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "How this demo works" }).click();
  await expect(
    page.getByRole("heading", { name: "Participant showcase", exact: true }),
  ).toBeVisible();
});
test("standalone Material keeps explicit local light and dark overrides under a dark system preference", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => {
    delete document.documentElement.dataset.ogTheme;
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="og-light"><div id="local-material-light" class="og-preset-material" style="background:var(--og-bg)">Local light</div></div><div id="self-material-light" class="og-preset-material og-light" style="background:var(--og-bg)">Self light</div><div id="self-material-dark" class="og-preset-material og-dark" style="background:var(--og-bg)">Self dark</div>';
    document.body.append(host);
  });
  await expect(page.locator("#local-material-light")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("#self-material-light")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("#self-material-dark")).toHaveCSS(
    "background-color",
    "rgb(23, 28, 37)",
  );
});
test("sidebar filters use real typed conditions and roving keyboard tabs", async ({
  page,
}) => {
  const sidebar = page.getByRole("complementary", { name: "Grid tools" });
  await sidebar.getByRole("tab", { name: "Columns", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    sidebar.getByRole("tab", { name: "Filters", exact: true }),
  ).toBeFocused();
  const trigger = sidebar.getByRole("button", {
    name: "Filters: Name",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Name/ });
  await dialog
    .getByRole("combobox", { name: "Operator for condition 1", exact: true })
    .selectOption("contains");
  await dialog
    .getByRole("textbox", { name: "Value for condition 1", exact: true })
    .fill("Avery Morgan");
  await dialog
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(trigger).toBeFocused();
  const grid = page.getByRole("grid", { name: "Participant showcase" });
  await expect(
    grid.locator('[data-row-id="participant-1"][data-column-id="name"]'),
  ).toBeVisible();
  await expect(grid.locator('[data-row-id="participant-2"]')).toHaveCount(0);
});
for (const width of [320, 375, 834]) {
  test(`responsive ${width}px tools drawer, nested dialog, Escape and focus return`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
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
    await open.click();
    const drawer = page.getByRole("dialog", {
      name: "Grid tools",
      exact: true,
    });
    await expect(drawer).toBeVisible();
    await drawer
      .getByRole("checkbox", { name: "Language", exact: true })
      .uncheck();
    await drawer.getByRole("tab", { name: "Filters", exact: true }).click();
    await drawer
      .getByRole("button", { name: "Filters: Name", exact: true })
      .click();
    const conditions = page.getByRole("dialog", { name: /Name/ });
    await expect(conditions).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(conditions).not.toBeVisible();
    await expect(drawer).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`participant-${width}-material-dark-sidebar.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(open).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Grid style" }),
    ).toHaveValue("material");
    await expect(
      page.getByRole("combobox", { name: "Demo appearance", exact: true }),
    ).toHaveValue("dark");
  });
}
test("100k source rows are virtualized, scrollable, sortable and filterable", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const start = Date.now();
  await page
    .getByRole("combobox", { name: "Data size" })
    .selectOption("100000");
  await expect(page.locator(".showcase-status")).toContainText(
    "100,000 records",
    { timeout: 45000 },
  );
  const grid = page.getByRole("grid", { name: "Participant showcase" });
  const loadMs = Date.now() - start;
  expect(await grid.locator(".og-row").count()).toBeLessThan(80);
  expect(await grid.locator(".og-cell").count()).toBeLessThan(1000);
  const sortStart = Date.now();
  await grid.getByRole("button", { name: "Sort Name", exact: true }).click();
  await expect(
    grid.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: "Sort Name", exact: true }),
    }),
  ).toHaveAttribute("aria-sort", "ascending");
  const sortMs = Date.now() - sortStart;
  const filterStart = Date.now();
  await page
    .getByRole("searchbox", { name: "Search participants" })
    .fill("Avery Morgan");
  await expect(
    grid.locator('[data-row-id="participant-1"][data-column-id="name"]'),
  ).toBeVisible();
  const filterMs = Date.now() - filterStart;
  await page.getByRole("searchbox", { name: "Search participants" }).clear();
  await grid.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.scrollLeft = node.scrollWidth;
  });
  await expect
    .poll(() => grid.locator('[data-column-id="online"]').count())
    .toBeGreaterThan(0);
  expect(await grid.locator(".og-row").count()).toBeLessThan(80);
  expect(errors).toEqual([]);
  await info.attach("local-100k-observation.json", {
    body: JSON.stringify({
      loadMs,
      sortMs,
      filterMs,
      note: "One local Chromium run, not a general benchmark",
    }),
    contentType: "application/json",
  });
});
test("Material is visually distinct, keeps native checked contrast, and passes automated accessibility", async ({
  page,
}, info) => {
  await page
    .getByRole("combobox", { name: "Grid style" })
    .selectOption("material");
  for (const mode of ["light", "dark"]) {
    await page
      .getByRole("combobox", { name: "Demo appearance", exact: true })
      .selectOption(mode);
    const cell = page.locator(
      '.showcase-grid [data-row-id="participant-1"][data-column-id="name"]',
    );
    await expect(cell).toHaveCSS("border-right-width", "0px");
    await expect(page.locator(".showcase-grid .og-row").first()).toHaveCSS(
      "height",
      "48px",
    );
    await expect(page.locator(".showcase-workbench")).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(255, 255, 255)" : "rgb(23, 28, 37)",
    );
    await expect(
      page
        .getByRole("complementary", { name: "Grid tools" })
        .getByRole("checkbox", { name: "Name", exact: true }),
    ).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(194, 24, 91)" : "rgb(255, 128, 171)",
    );
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(
      async () =>
        (
          await (
            window as unknown as {
              axe: {
                run: () => Promise<{
                  violations: {
                    id: string;
                    impact: string;
                    nodes: { target: string[] }[];
                  }[];
                }>;
              };
            }
          ).axe.run()
        ).violations,
    );
    expect(
      violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`participant-desktop-material-${mode}.png`),
      fullPage: true,
    });
  }
});
