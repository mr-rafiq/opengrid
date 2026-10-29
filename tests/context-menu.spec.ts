import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Context commands lab", exact: true })
    .click();
  const region = page.getByRole("region", {
      name: "Contextual commands example",
      exact: true,
    }),
    grid = region.getByRole("grid", {
      name: "Context command inventory",
      exact: true,
    });
  return { region, grid, errors };
}
const cell = (grid: Locator, row = "cmd1", column = "name") =>
  grid.locator(
    `[role="gridcell"][data-row-id="${row}"][data-column-id="${column}"]`,
  );
const data = async (region: Locator) =>
  JSON.parse((await region.getByTestId("context-command-data").textContent())!);
async function open(page: Page, grid: Locator, row = "cmd1", column = "name") {
  await cell(grid, row, column).click({
    button: "right",
    position: { x: 5, y: 5 },
  });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}
async function choose(menu: Locator, name: string) {
  await menu.getByRole("menuitem", { name, exact: true }).click();
}
test("native popovers support keyboard navigation, checked row actions, Escape and browser-menu bypass", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const target = cell(grid, "cmd1", "amount");
  await target.focus();
  await target.press("Shift+F10");
  const menu = page.getByRole("menu");
  await expect(menu).toHaveAccessibleName("Commands for Amount, row cmd1");
  await expect(
    menu.getByRole("menuitem", { name: "Copy cell", exact: true }),
  ).toBeFocused();
  expect(
    await page
      .locator(".og-context-menu-popup")
      .evaluate((element) => element.matches(":popover-open")),
  ).toBe(true);
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", { name: "Delayed review", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await expect(
    menu.getByRole("menuitem", { name: "Delayed review", exact: true }),
  ).toBeFocused();
  await menu
    .getByRole("menuitemcheckbox", { name: "Select row cmd1", exact: true })
    .click();
  await expect(menu).toHaveCount(0);
  await expect(target).toBeFocused();
  expect((await data(region)).selected).toEqual(["cmd1"]);
  await target.press("Shift+F10");
  await expect(
    page.getByRole("menuitemcheckbox", {
      name: "Select row cmd1",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(target).toBeFocused();
  await target.press("Shift+F10");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.activeElement !== document.body &&
        Boolean(document.activeElement?.isConnected),
    ),
  ).toBe(true);
  await target.click({ button: "right", modifiers: ["Control"] });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await grid
    .getByRole("button", { name: "Inspect cmd1", exact: true })
    .click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
test("real clipboard commands preserve rectangles, neutralize formulas and retain exact BigInt digits", async ({
  page,
}) => {
  const { grid, errors } = await setup(page),
    target = cell(grid);
  await target.click();
  await target.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  let menu = await open(page, grid);
  await choose(menu, "Copy selected cells");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "'=UNTRUSTED()\t10\r\nCustomer 2\t11",
  );
  menu = await open(page, grid, "cmd1", "lots");
  await choose(menu, "Copy cell");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "9007199254740993",
  );
  menu = await open(page, grid, "cmd1", "lots");
  await choose(menu, "Copy selected cells");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "9007199254740993",
  );
  await cell(grid, "cmd1", "id").focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Edit cell", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
test("clipboard paste validates atomically, keeps a retryable error and commits one undo transaction", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await page.evaluate(() => navigator.clipboard.writeText("Changed\t-1"));
  const menu = await open(page, grid);
  await choose(menu, "Paste cells");
  await expect(page.getByRole("alert")).toContainText(
    "Amount must be nonnegative",
  );
  expect((await data(region)).first).toMatchObject({
    name: "=UNTRUSTED()",
    amount: 10,
  });
  await expect(
    menu.getByRole("menuitem", { name: "Paste cells", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => navigator.clipboard.writeText("Changed\t21"));
  await choose(menu, "Paste cells");
  await expect(menu).toHaveCount(0);
  await expect
    .poll(async () => (await data(region)).first)
    .toMatchObject({ name: "Changed", amount: 21 });
  await choose(await open(page, grid), "Undo");
  await expect
    .poll(async () => (await data(region)).first)
    .toMatchObject({ name: "=UNTRUSTED()", amount: 10 });
  await choose(await open(page, grid), "Redo");
  await expect
    .poll(async () => (await data(region)).first)
    .toMatchObject({ name: "Changed", amount: 21 });
  expect(errors).toEqual([]);
});
test("editing, notes, application actions and CSV export invoke the real library workflows", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await choose(await open(page, grid, "cmd1", "amount"), "Edit cell");
  const editor = grid.getByRole("spinbutton", {
    name: "Edit Amount row cmd1",
    exact: true,
  });
  await editor.fill("31");
  await editor.press("Enter");
  await expect.poll(async () => (await data(region)).first.amount).toBe(31);
  await choose(await open(page, grid, "cmd2", "amount"), "Note");
  const note = page.getByRole("dialog", { name: "Cell note", exact: true });
  await note
    .getByRole("textbox", { name: "Note text", exact: true })
    .fill("<b>audit</b>");
  await note.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    grid.getByRole("button", {
      name: "Edit note for Amount row cmd2",
      exact: true,
    }),
  ).toHaveAttribute("title", "<b>audit</b>");
  await expect(grid.locator("b")).toHaveCount(0);
  await choose(await open(page, grid, "cmd2", "name"), "Mark reviewed");
  await expect
    .poll(async () => (await data(region)).second.reviewed)
    .toBe(true);
  const menu = await open(page, grid),
    downloadPromise = page.waitForEvent("download");
  await choose(menu, "Export CSV");
  const download = await downloadPromise,
    filename = await download.path();
  expect(download.suggestedFilename()).toBe("opengrid.csv");
  const csv = readFileSync(filename!, "utf8");
  expect(csv).toContain("Customer");
  expect(csv).toContain("'=UNTRUSTED()");
  expect(csv).toContain("9007199254740993");
  expect(csv.split(/\r?\n/).filter(Boolean)).toHaveLength(201);
  expect(errors).toEqual([]);
});
test("incoming data cancels delayed commands and filtering restores a surviving cell focus", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  let menu = await open(page, grid);
  await choose(menu, "Delayed review");
  await expect(menu).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Control+Shift+U");
  await expect(menu).toHaveCount(0);
  await page.waitForTimeout(750);
  expect((await data(region)).first).toMatchObject({
    name: "Incoming customer",
    reviewed: false,
  });
  menu = await open(page, grid);
  await choose(menu, "Delayed review");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(750);
  expect((await data(region)).first.reviewed).toBe(false);
  menu = await open(page, grid);
  await page.keyboard.press("Control+Shift+F");
  await expect(menu).toHaveCount(0);
  await expect(cell(grid, "cmd2", "name")).toBeFocused();
  expect((await data(region)).matching).toBe(199);
  await choose(await open(page, grid, "cmd2", "name"), "Delayed review");
  await expect
    .poll(async () => (await data(region)).second.reviewed)
    .toBe(true);
  expect(errors).toEqual([]);
});
test("a pending clipboard read cannot paste into a changed RTL column order", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {},
        readText: () =>
          new Promise<string>((resolve) => {
            (
              window as unknown as {
                resolveMenuClipboard: (value: string) => void;
              }
            ).resolveMenuClipboard = resolve;
          }),
      },
    });
  });
  const { region, grid, errors } = await setup(page);
  const menu = await open(page, grid);
  await choose(menu, "Paste cells");
  await expect(menu).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Control+Shift+D");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Control+Shift+L");
  await expect(menu).toHaveAccessibleName("Acciones para Customer, fila cmd1");
  await page.evaluate(() =>
    (
      window as unknown as { resolveMenuClipboard: (value: string) => void }
    ).resolveMenuClipboard("Changed\t9"),
  );
  await expect(menu).toHaveCount(0);
  expect((await data(region)).first).toMatchObject({
    name: "=UNTRUSTED()",
    amount: 10,
  });
  expect(errors).toEqual([]);
});
test("the same native popup keeps focus through language, RTL and dark theme with bounded geometry and accessible markup", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const menu = await open(page, grid),
    copy = await menu
      .getByRole("menuitem", { name: "Copy cell", exact: true })
      .elementHandle(),
    popup = page.locator(".og-context-menu-popup");
  await page.keyboard.press("Control+Shift+D");
  await page.keyboard.press("Control+Shift+L");
  await page.keyboard.press("Control+Shift+T");
  const translated = menu.getByRole("menuitem", {
    name: "Copiar celda",
    exact: true,
  });
  await expect(translated).toBeFocused();
  expect(
    await translated.evaluate(
      (element, original) => element === original,
      copy,
    ),
  ).toBe(true);
  await expect(region.locator(".og-root")).toHaveClass(/og-dark/);
  await expect(menu).toHaveAccessibleName("Acciones para Customer, fila cmd1");
  const box = await popup.boundingBox(),
    viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () => {
    const root = document
      .querySelector('[role="grid"][aria-label="Context command inventory"]')!
      .closest(".og-root")!;
    const runner = (
      window as unknown as {
        axe: {
          run: (
            root: Element,
          ) => Promise<{ violations: { id: string; impact: string | null }[] }>;
        };
      }
    ).axe;
    return (await runner.run(root)).violations
      .filter((item) => item.impact === "serious" || item.impact === "critical")
      .map((item) => item.id);
  });
  expect(violations).toEqual([]);
  await popup.screenshot({ path: ".npm-cache/context-menu-spanish-rtl.png" });
  await page.keyboard.press("Escape");
  await expect(cell(grid)).toBeFocused();
  expect(errors).toEqual([]);
});
