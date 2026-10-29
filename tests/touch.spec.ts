import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type Locator,
  type CDPSession,
} from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 1000, height: 1000 },
});
const cell = (grid: Locator, row: string, column: string) =>
  grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
const runtimeErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  runtimeErrors.length = 0;
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
});
test.afterEach(() => expect(runtimeErrors).toEqual([]));
async function openLab(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "RTL direction lab", exact: true })
    .tap();
  const grid = page.getByRole("grid", { name: "Direction records" });
  await grid.scrollIntoViewIfNeeded();
  return grid;
}
const point = (x: number, y: number) => ({
  x,
  y,
  id: 1,
  radiusX: 2,
  radiusY: 2,
  force: 1,
});
async function touchDrag(
  session: CDPSession,
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cancel = false,
) {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(from.x, from.y)],
  });
  for (let index = 1; index <= 8; index++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        point(
          from.x + ((to.x - from.x) * index) / 8,
          from.y + ((to.y - from.y) * index) / 8,
        ),
      ],
    });
    await page.waitForTimeout(25);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
  });
}
async function sessionFor(context: BrowserContext, page: Page) {
  return context.newCDPSession(page);
}

test("native touch pan works on both axes without editing or applying a range drag", async ({
  page,
  context,
}) => {
  const grid = await openLab(page),
    box = (await grid.boundingBox())!,
    session = await sessionFor(context, page);
  const center = { x: box.x + box.width / 2, y: box.y + box.height - 70 };
  await touchDrag(session, page, center, { x: center.x, y: center.y - 170 });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.waitForTimeout(250);
  const after = (await grid.boundingBox())!,
    start = { x: after.x + after.width / 2, y: after.y + after.height - 80 };
  await touchDrag(session, page, start, { x: start.x + 160, y: start.y });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollLeft))
    .toBeLessThan(0);
  await expect(
    grid.locator("[data-row-id][data-column-id].og-editing"),
  ).toHaveCount(0);
  await expect(grid.getByRole("gridcell", { selected: true })).toHaveCount(0);
  await grid.evaluate((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
  await expect(cell(grid, "rtl1", "amount")).toContainText("10");
  await expect(cell(grid, "rtl1", "name")).toContainText("Record 1");
  await session.detach();
});
test("touch taps sort/select and double-tap or Edit cell opens one retained editor", async ({
  page,
}) => {
  const grid = await openLab(page),
    root = grid.locator(".."),
    name = cell(grid, "rtl1", "name");
  await name.tap();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-selected", "true");
  await name.tap();
  const editor = name.getByRole("textbox");
  await expect(editor).toBeFocused();
  await editor.fill("Touch draft");
  await editor.press("Control+Shift+d");
  await expect(grid).toHaveAttribute("dir", "ltr");
  await expect(editor).toHaveValue("Touch draft");
  await editor.press("Enter");
  await root.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(name).toContainText("Record 1");
  await name.tap();
  await root.getByRole("button", { name: "Edit cell", exact: true }).tap();
  await expect(name.getByRole("textbox")).toBeFocused();
  await name.getByRole("textbox").press("Escape");
  const sort = grid.getByRole("button", { name: "Sort Amount", exact: true });
  await sort.tap();
  await expect(
    grid.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: "Sort Amount", exact: true }),
    }),
  ).toHaveAttribute("aria-sort", "ascending");
  await sort.tap();
  await expect(
    grid.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: "Sort Amount", exact: true }),
    }),
  ).toHaveAttribute("aria-sort", "descending");
});
test("explicit touch extension survives native scrolling and fill remains one undo step", async ({
  page,
  context,
}) => {
  const grid = await openLab(page),
    root = grid.locator("..");
  await cell(grid, "rtl1", "amount").tap();
  await root.getByRole("button", { name: "Extend range", exact: true }).tap();
  await expect(
    root.getByRole("button", { name: "Extend range", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const box = (await grid.boundingBox())!,
    session = await sessionFor(context, page),
    start = { x: box.x + box.width / 2, y: box.y + box.height - 65 };
  await touchDrag(session, page, start, { x: start.x, y: start.y - 120 });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await grid.evaluate((element) => {
    element.scrollTop = 0;
  });
  await cell(grid, "rtl3", "amount").tap();
  await expect(grid.getByRole("gridcell", { selected: true })).toHaveCount(3);
  await root
    .getByRole("button", { name: "Fill down selected cells", exact: true })
    .tap();
  await expect(cell(grid, "rtl3", "amount")).toContainText("10");
  await root.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(cell(grid, "rtl2", "amount")).toContainText("11");
  await expect(cell(grid, "rtl3", "amount")).toContainText("12");
  await session.detach();
});
test("touch resize previews and cancels cleanly, then commits RTL width on release", async ({
  page,
  context,
}) => {
  const grid = await openLab(page),
    team = cell(grid, "rtl1", "team"),
    resize = grid.getByRole("separator", { name: "Resize Team", exact: true }),
    session = await sessionFor(context, page);
  const original = (await team.boundingBox())!.width,
    grip = (await resize.boundingBox())!,
    from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  expect(grip.width).toBeGreaterThanOrEqual(24);
  await touchDrag(session, page, from, { x: from.x - 40, y: from.y }, true);
  await expect
    .poll(async () => (await team.boundingBox())!.width)
    .toBeCloseTo(original, 0);
  const next = (await resize.boundingBox())!,
    begin = { x: next.x + next.width / 2, y: next.y + next.height / 2 };
  await touchDrag(session, page, begin, { x: begin.x - 40, y: begin.y });
  await expect
    .poll(async () => (await team.boundingBox())!.width)
    .toBeCloseTo(original + 40, 0);
  await session.detach();
});
test("touch fill grip supports series and cancellation without data writes", async ({
  page,
  context,
}, testInfo) => {
  const grid = await openLab(page),
    root = grid.locator(".."),
    session = await sessionFor(context, page);
  for (const [row, value] of [
    ["rtl1", "20"],
    ["rtl2", "25"],
  ]) {
    await cell(grid, row, "amount").tap();
    await root.getByRole("button", { name: "Edit cell", exact: true }).tap();
    const editor = cell(grid, row, "amount").getByRole("spinbutton");
    await editor.fill(value);
    await editor.press("Enter");
  }
  await cell(grid, "rtl1", "amount").tap();
  await root.getByRole("button", { name: "Extend range", exact: true }).tap();
  await cell(grid, "rtl2", "amount").tap();
  await root
    .getByRole("combobox", { name: "Fill mode", exact: true })
    .selectOption("series");
  const handle = grid.getByRole("button", { name: /Drag to fill cells/ }),
    grip = (await handle.boundingBox())!,
    target = (await cell(grid, "rtl5", "amount").boundingBox())!;
  expect(grip.width).toBeGreaterThanOrEqual(24);
  expect(grip.height).toBeGreaterThanOrEqual(24);
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
    to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await touchDrag(session, page, from, to, true);
  await expect(cell(grid, "rtl3", "amount")).toContainText("12");
  await expect(grid.getByRole("gridcell", { selected: true })).toHaveCount(2);
  const again = (await handle.boundingBox())!,
    start = { x: again.x + again.width / 2, y: again.y + again.height / 2 };
  await touchDrag(session, page, start, to);
  await expect(cell(grid, "rtl3", "amount")).toContainText("30");
  await expect(cell(grid, "rtl5", "amount")).toContainText("40");
  await root.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(cell(grid, "rtl3", "amount")).toContainText("12");
  await expect(cell(grid, "rtl5", "amount")).toContainText("14");
  await expect(cell(grid, "rtl2", "amount")).toContainText("25");
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () =>
    (
      await (
        window as unknown as {
          axe: {
            run(): Promise<{ violations: { id: string; impact: string }[] }>;
          };
        }
      ).axe.run()
    ).violations
      .filter(
        (value) => value.impact === "serious" || value.impact === "critical",
      )
      .map((value) => value.id),
  );
  expect(violations).toEqual([]);
  await page
    .getByRole("region", { name: "Direction switching example" })
    .screenshot({ path: testInfo.outputPath("touch-grid.png") });
  await session.detach();
});
