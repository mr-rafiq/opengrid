import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Nested commands lab", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Nested commands example",
    exact: true,
  });
  const grid = region.locator(
    '[role="grid"][aria-label="Nested command inventory"],[role="treegrid"][aria-label="Nested command inventory"]',
  );
  return { region, grid, errors };
}
const cell = (grid: Locator, row = "nested1", column = "name") =>
  grid.locator(
    `[role="gridcell"][data-row-id="${row}"][data-column-id="${column}"]`,
  );
const rootMenu = (page: Page) =>
  page.getByRole("menu", {
    name: "Commands for Customer, row nested1",
    exact: true,
  });
const sub = (page: Page, name: string) =>
  page.getByRole("menu", { name, exact: true });
const item = (parent: Locator, name: string) =>
  parent.getByRole("menuitem", { name, exact: true });
async function open(page: Page, grid: Locator) {
  await cell(grid).click({ button: "right", position: { x: 5, y: 5 } });
  await expect(rootMenu(page)).toBeVisible();
  return rootMenu(page);
}
async function branch(parent: Locator, name: string) {
  await item(parent, name).click();
}
const data = async (region: Locator) =>
  JSON.parse((await region.getByTestId("nested-command-data").textContent())!);
const header = (grid: Locator) =>
  grid.getByRole("button", { name: "Column menu for Amount", exact: true });

test("native three-level menus keep keyboard scope, copy through real clipboard and restore one parent per Escape", async ({
  page,
}) => {
  const { grid, errors } = await setup(page);
  const target = cell(grid);
  await target.focus();
  await target.press("Shift+F10");
  await expect(item(rootMenu(page), "Record actions")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(
    item(sub(page, "Clipboard and exports"), "Clipboard"),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item(sub(page, "Clipboard"), "Copy cell")).toBeFocused();
  expect(
    await page
      .locator(".og-context-menu-popup")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.matches(":popover-open")),
      ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    item(sub(page, "Clipboard and exports"), "Clipboard"),
  ).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(2);
  await page.keyboard.press("ArrowLeft");
  await expect(item(rootMenu(page), "Clipboard and exports")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(target).toBeFocused();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "'=UNTRUSTED()",
  );
  await open(page, grid);
  await branch(rootMenu(page), "Clipboard and exports");
  await branch(sub(page, "Clipboard and exports"), "Clipboard");
  await grid.evaluate((node) => {
    node.scrollTop = 36;
  });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(target).toBeFocused();
  expect(await grid.evaluate((node) => node.scrollTop)).toBe(36);
  await grid.evaluate((node) => {
    node.scrollTop = 0;
  });
  await open(page, grid);
  await branch(rootMenu(page), "Clipboard and exports");
  await branch(sub(page, "Clipboard and exports"), "Clipboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.activeElement !== document.body &&
        Boolean(document.activeElement?.isConnected),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("nested leaves invoke real edits, shared history, review changes and a genuine safe CSV download", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await open(page, grid);
  await branch(rootMenu(page), "Record actions");
  await item(sub(page, "Record actions"), "Edit cell").click();
  const editor = grid.getByRole("textbox", {
    name: "Edit Customer row nested1",
    exact: true,
  });
  await editor.fill("Changed");
  await editor.press("Enter");
  expect((await data(region)).first.name).toBe("Changed");
  await open(page, grid);
  await branch(rootMenu(page), "History");
  await item(sub(page, "History"), "Undo").click();
  expect((await data(region)).first.name).toBe("=UNTRUSTED()");
  await open(page, grid);
  await branch(rootMenu(page), "Application");
  await branch(sub(page, "Application"), "Review");
  await item(sub(page, "Review"), "Mark reviewed").click();
  expect((await data(region)).first.reviewed).toBe(true);
  await open(page, grid);
  await branch(rootMenu(page), "History");
  await item(sub(page, "History"), "Undo").click();
  expect((await data(region)).first.reviewed).toBe(false);
  await open(page, grid);
  await branch(rootMenu(page), "Clipboard and exports");
  await branch(sub(page, "Clipboard and exports"), "Documents");
  const download = page.waitForEvent("download");
  await item(sub(page, "Documents"), "Export CSV").click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/\.csv$/);
  const content = readFileSync((await exported.path())!, "utf8");
  expect(content).toContain("Customer");
  expect(content).toContain("'=UNTRUSTED()");
  expect(errors).toEqual([]);
});

test("header child popovers flip at the viewport edge and execute actual physical pinning and sorting", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await header(grid).click();
  const root = page.getByRole("menu", {
    name: "Column commands for Amount",
    exact: true,
  });
  await branch(root, "Layout");
  await branch(sub(page, "Layout"), "Pin column");
  const boxes = await page
    .locator(".og-context-menu-popup")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          open: node.matches(":popover-open"),
        };
      }),
    );
  expect(boxes).toHaveLength(3);
  expect(boxes[1].x).toBeLessThan(boxes[0].x);
  for (const box of boxes) {
    expect(box.open).toBe(true);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(box.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await item(sub(page, "Pin column"), "Pin left").click();
  expect((await data(region)).pins.amount).toBe("left");
  await expect(header(grid)).toBeFocused();
  await header(grid).click();
  await branch(
    page.getByRole("menu", { name: "Column commands for Amount", exact: true }),
    "Sorting",
  );
  await item(sub(page, "Sorting"), "Sort descending").click();
  expect((await data(region)).sorting).toEqual([
    { columnId: "amount", direction: "desc" },
  ]);
  await expect(cell(grid, "nested180", "amount")).toBeVisible();
  expect(errors).toEqual([]);
});

test("nested pending actions abort on Escape, source replacement and native child light dismissal", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const start = async () => {
    await open(page, grid);
    await branch(rootMenu(page), "Application");
    await branch(sub(page, "Application"), "Review");
    await item(sub(page, "Review"), "Delayed review").click();
    await expect(sub(page, "Review")).toHaveAttribute("aria-busy", "true");
  };
  await start();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.waitForTimeout(900);
  expect((await data(region)).first.reviewed).toBe(false);
  await start();
  await page.keyboard.press("Control+Shift+U");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.waitForTimeout(900);
  expect((await data(region)).first).toMatchObject({
    name: "Incoming customer",
    reviewed: false,
  });
  await start();
  const box = (await item(rootMenu(page), "Record actions").boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.waitForTimeout(900);
  expect((await data(region)).first.reviewed).toBe(false);
  expect(errors).toEqual([]);
});

test("the same nested leaf retains focus through language, RTL and theme changes with accessible composed markup", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await open(page, grid);
  await branch(rootMenu(page), "Clipboard and exports");
  await branch(sub(page, "Clipboard and exports"), "Clipboard");
  const original = await item(
    sub(page, "Clipboard"),
    "Copy cell",
  ).elementHandle();
  await page.keyboard.press("Control+Shift+L");
  await page.keyboard.press("Control+Shift+D");
  await page.keyboard.press("Control+Shift+T");
  const translated = item(sub(page, "Clipboard"), "Copiar celda");
  await expect(translated).toBeFocused();
  expect(
    await translated.evaluate((node, before) => node === before, original),
  ).toBe(true);
  await expect(
    page.getByRole("menu", {
      name: "Acciones para Customer, fila nested1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(region.locator(".og-root")).toHaveClass(/og-dark/);
  await page.keyboard.press("ArrowRight");
  await expect(
    item(sub(page, "Clipboard and exports"), "Clipboard"),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(item(sub(page, "Clipboard"), "Copiar celda")).toBeFocused();
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  expect(
    await page.evaluate(async () => {
      const root = document
        .querySelector('[aria-label="Nested command inventory"]')!
        .closest(".og-root")!;
      const runner = (
        window as unknown as {
          axe: {
            run(
              root: Element,
            ): Promise<{ violations: { id: string; impact: string | null }[] }>;
          };
        }
      ).axe;
      return (await runner.run(root)).violations
        .filter(
          (item) => item.impact === "serious" || item.impact === "critical",
        )
        .map((item) => item.id);
    }),
  ).toEqual([]);
  await page.screenshot({ path: ".npm-cache/nested-menu-spanish-rtl.png" });
  expect(errors).toEqual([]);
});

test("a narrow long submenu keeps keyboard targets visible without scrolling the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 420 });
  const { region, grid, errors } = await setup(page);
  await open(page, grid);
  await branch(rootMenu(page), "Saved amount views");
  const child = sub(page, "Saved amount views"),
    before = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("End");
  const target = item(child, "Amount \u2265 125");
  await expect(target).toBeFocused();
  const button = (await target.boundingBox())!,
    popup = (await child.locator("..").boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(popup.y);
  expect(button.y + button.height).toBeLessThanOrEqual(popup.y + popup.height);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect(
    await child.locator("..").evaluate((node) => node.scrollTop),
  ).toBeGreaterThan(0);
  await target.click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await data(region)).matching).toBe(65);
  expect(errors).toEqual([]);
});

test.describe("native touch nested headers", () => {
  test.use({ hasTouch: true });
  test("taps open descendants and execute sort and pin commands", async ({
    page,
  }) => {
    const { region, grid, errors } = await setup(page);
    await header(grid).tap();
    await item(
      page.getByRole("menu", {
        name: "Column commands for Amount",
        exact: true,
      }),
      "Sorting",
    ).tap();
    await item(sub(page, "Sorting"), "Sort descending").tap();
    expect((await data(region)).sorting).toEqual([
      { columnId: "amount", direction: "desc" },
    ]);
    await header(grid).tap();
    await item(
      page.getByRole("menu", {
        name: "Column commands for Amount",
        exact: true,
      }),
      "Layout",
    ).tap();
    await item(sub(page, "Layout"), "Pin column").tap();
    await item(sub(page, "Pin column"), "Pin left").tap();
    expect((await data(region)).pins.amount).toBe("left");
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test("the no-Popover-API fallback removes hidden attributes and retains nested keyboard commands", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", {
      configurable: true,
      value: undefined,
    });
  });
  const { grid, errors } = await setup(page);
  await open(page, grid);
  await branch(rootMenu(page), "Clipboard and exports");
  await branch(sub(page, "Clipboard and exports"), "Clipboard");
  await expect(item(sub(page, "Clipboard"), "Copy cell")).toBeFocused();
  expect(await page.locator(".og-context-menu-popup[popover]").count()).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("mouse hover reaches the four-level limit and its leaf uses the shared edit history", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await open(page, grid);
  await branch(rootMenu(page), "Application");
  await branch(sub(page, "Application"), "Review");
  await item(sub(page, "Review"), "Mark reviewed").click();
  expect((await data(region)).first.reviewed).toBe(true);
  await open(page, grid);
  await item(rootMenu(page), "Application").hover();
  await expect(sub(page, "Application")).toBeVisible();
  await item(sub(page, "Application"), "Review").hover();
  await expect(sub(page, "Review")).toBeVisible();
  await item(sub(page, "Review"), "More review commands").hover();
  await expect(sub(page, "More review commands")).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(4);
  expect(
    await page
      .locator(".og-context-menu-popup")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.matches(":popover-open")),
      ),
  ).toBe(true);
  await item(sub(page, "More review commands"), "Unreview record").click();
  expect((await data(region)).first.reviewed).toBe(false);
  await open(page, grid);
  await branch(rootMenu(page), "History");
  await item(sub(page, "History"), "Undo").click();
  expect((await data(region)).first.reviewed).toBe(true);
  expect(errors).toEqual([]);
});

test("very narrow viewports clamp each native header panel below the normal minimum width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 240, height: 420 });
  const { grid, errors } = await setup(page);
  await header(grid).focus();
  await header(grid).press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menu")).toHaveCount(3);
  const boxes = await page
    .locator(".og-context-menu-popup")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          open: node.matches(":popover-open"),
        };
      }),
    );
  for (const box of boxes) {
    expect(box.open).toBe(true);
    expect(box.width).toBeLessThanOrEqual(232);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(240);
    expect(box.bottom).toBeLessThanOrEqual(420);
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(errors).toEqual([]);
});
