import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const runtimeErrors = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|Minified React error|uncaught/i.test(message.text())
    )
      errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(
    runtimeErrors.get(page) ?? [],
    "No JavaScript or hydration errors",
  ).toEqual([]);
});

test("production prefix, SSR content, real grid and hosted portfolio", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get("./");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain("Make room");
  expect(html).toContain("/opengrid/assets/");
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Make room for your data." }),
  ).toBeVisible();
  const grid = page.getByRole("grid", { name: "Interactive project showcase" });
  await expect(grid).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("landing-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Live grid", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "React code", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "React example source" }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "Live grid", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Filter example projects" })
    .fill("Harbor");
  await expect(
    grid.locator('[data-row-id="project-2"][data-column-id="name"]'),
  ).toContainText("Harbor API");
  await expect(grid.locator('[data-row-id="project-1"]')).toHaveCount(0);
  await page.getByRole("textbox", { name: "Filter example projects" }).clear();
  await grid.getByRole("button", { name: "Sort Project", exact: true }).click();
  await expect(
    grid.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: "Sort Project", exact: true }),
    }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page
    .getByRole("textbox", { name: "Filter example projects" })
    .fill("Orbit database");
  const editCell = grid.locator(
    '[data-row-id="project-1"][data-column-id="name"]',
  );
  await editCell.dblclick();
  await page
    .getByRole("textbox", { name: "Edit Project row project-1", exact: true })
    .fill("My open project");
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Filter example projects" })
    .fill("My open project");
  await expect(
    grid.locator('[data-row-id="project-1"][data-column-id="name"]'),
  ).toContainText("My open project");
  await page.getByRole("link", { name: "Open full playground" }).click();
  await expect(page).toHaveURL(/\/opengrid\/demo\//);
  await expect(page.getByRole("grid").first()).toBeVisible();
});

test("physical docs deep routes, copied code, source links and anchors", async ({
  page,
  context,
  request,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const response = await request.get("docs/getting-started/");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("Run the example");
  await page.goto("docs/getting-started/");
  await expect(
    page.getByRole("heading", { name: "Getting started", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("documentation-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Copy code: bash" }).first().click();
  await expect(
    page.getByRole("status").filter({ hasText: "Code copied" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "git clone https://github.com/mr-rafiq/opengrid.git",
  );
  const internal = page.getByRole("link", { name: "Read the API guide" });
  await expect(internal).toHaveAttribute("href", "/opengrid/docs/api/");
  await internal.click();
  await expect(
    page.getByRole("heading", { name: "API guide", exact: true }),
  ).toBeVisible();
  await page.goto("docs/%61pi/");
  await expect(
    page.getByRole("heading", { name: "API guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('article a[href*="packages/core/src/types.ts"]'),
  ).toHaveAttribute(
    "href",
    "https://github.com/mr-rafiq/opengrid/blob/main/packages/core/src/types.ts",
  );
  await page
    .getByRole("navigation", { name: "On this page" })
    .getByRole("link", { name: "Creating a model", exact: true })
    .click();
  await expect(page).toHaveURL(/#creating-a-model$/);
  await page.goto("docs/api/index.html");
  await expect(
    page.getByRole("heading", { name: "API guide", exact: true }),
  ).toBeVisible();
});

test("documentation search is keyboard accessible and finds full guide content", async ({
  page,
}) => {
  await page.goto("./");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search documentation" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Search documentation" })
    .fill("BigInt ratios");
  await expect(
    dialog.getByRole("link", { name: /Analytical transforms/ }),
  ).toBeVisible();
  await dialog.getByRole("link", { name: /Analytical transforms/ }).click();
  await expect(page).toHaveURL(/\/docs\/show-values-as\//);
  await expect(
    page.getByRole("heading", {
      name: "Analytical value transforms",
      exact: true,
    }),
  ).toBeVisible();
});

test("mobile navigation, docs menu and no document-wide horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.screenshot({
    path: testInfo.outputPath("landing-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Documentation", exact: true })
    .click();
  await page.getByRole("button", { name: "Browse docs" }).click();
  await expect(
    page.getByRole("navigation", { name: "Documentation", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Browse docs" })).toBeFocused();
  await page.getByRole("button", { name: "Browse docs" }).click();
  await page.getByRole("button", { name: "Close documentation menu" }).click();
  await expect(
    page.getByRole("button", { name: "Browse docs" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Browse docs" }).click();
  await page
    .getByRole("navigation", { name: "Documentation", exact: true })
    .getByRole("link", { name: "Feature roadmap", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Feature parity ledger", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const table = page
    .getByRole("region", { name: "Documentation table" })
    .first();
  await table.focus();
  await expect(table).toBeFocused();
});

test("unknown routes return a genuine 404 and remain navigable", async ({
  page,
  request,
}) => {
  const response = await request.get("docs/this-page-does-not-exist/");
  expect(response.status()).toBe(404);
  await page.goto("docs/this-page-does-not-exist/");
  await expect(
    page.getByRole("heading", { name: "This cell is empty." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Find your starting point" }).click();
  await expect(page).toHaveURL(/\/docs\/getting-started\//);
});

test("generated Markdown site links resolve without fake source paths", async ({
  request,
}) => {
  test.skip(
    Boolean(process.env.SITE_URL),
    "Local artifact audit runs before deployment; live routes are covered independently.",
  );
  const output = path.resolve("dist/pages");
  const files = fs.readdirSync(path.join(output, "docs"));
  let localLinks = 0;
  for (const slug of files) {
    const html = fs.readFileSync(
      path.join(output, "docs", slug, "index.html"),
      "utf8",
    );
    for (const match of html.matchAll(/(?:href|src)="(\/opengrid\/[^"#?]*)/g)) {
      const relative = decodeURIComponent(match[1].slice("/opengrid/".length));
      const target = path.join(
        output,
        relative,
        relative.endsWith("/") ? "index.html" : "",
      );
      expect(fs.existsSync(target), `${slug}: ${match[1]}`).toBe(true);
      localLinks++;
    }
    expect((await request.get(`docs/${slug}/`)).ok()).toBe(true);
  }
  expect(localLinks).toBeGreaterThan(100);
});

for (const route of ["./", "docs/getting-started/", "docs/feature-parity/"])
  test(`no serious or critical axe violations: ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run(): Promise<{
              violations: {
                id: string;
                impact: string;
                nodes: { target: string[] }[];
              }[];
            }>;
          };
        }
      ).axe;
      return (await axe.run()).violations
        .filter(
          (item) => item.impact === "serious" || item.impact === "critical",
        )
        .map((item) => ({
          id: item.id,
          nodes: item.nodes.map((node) => node.target),
        }));
    });
    expect(violations).toEqual([]);
  });
