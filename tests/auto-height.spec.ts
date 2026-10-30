import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Automatic height lab", exact: true })
    .click();
  const region = page.getByRole("region", {
      name: "Automatic row height example",
      exact: true,
    }),
    wrapped = region.getByRole("article", {
      name: "Wrapped content example",
      exact: true,
    }),
    merged = region.getByRole("article", {
      name: "Merged automatic content example",
      exact: true,
    });
  const grid = wrapped.getByRole("grid", {
      name: "Auto height records",
      exact: true,
    }),
    spanGrid = merged.getByRole("grid", {
      name: "Auto height merged notes",
      exact: true,
    });
  await expect(cell(grid, "height0", "notes")).toContainText(
    "Ready for review",
  );
  return { region, wrapped, merged, grid, spanGrid, errors };
}
const cell = (grid: Locator, row: string, column = "notes") =>
  grid.locator(
    `[role="gridcell"][data-row-id="${row}"][data-column-id="${column}"]`,
  );
const row = (grid: Locator, id: string) =>
  grid.locator(`[role="row"][data-og-row-id="${id}"]`);
const height = async (locator: Locator) =>
  (await locator.boundingBox())!.height;
test("natural wrapped content grows and shrinks, then width reflow stays stable", async ({
  page,
}) => {
  const { wrapped, grid, errors } = await setup(page);
  const original = await height(row(grid, "height0"));
  await wrapped
    .getByRole("button", { name: "Expand first note", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "height0"))).toBeGreaterThan(150);
  const wide = await height(row(grid, "height0"));
  await wrapped
    .getByRole("button", { name: "Narrow notes column", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "height0"))).toBeGreaterThan(wide);
  await wrapped
    .getByRole("button", { name: "Widen notes column", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "height0"))).toBe(wide);
  await wrapped
    .getByRole("button", { name: "Shorten first note", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "height0"))).toBe(original);
  expect(errors).toEqual([]);
});
test("merged content puts excess into the final row and editing/undo restores the run", async ({
  page,
}) => {
  const { merged, spanGrid, errors } = await setup(page);
  await expect(cell(spanGrid, "merged0")).toHaveAttribute("aria-rowspan", "3");
  await expect.poll(() => height(row(spanGrid, "merged2"))).toBeGreaterThan(36);
  expect(await height(row(spanGrid, "merged0"))).toBe(36);
  expect(await height(row(spanGrid, "merged1"))).toBe(36);
  const total = await height(cell(spanGrid, "merged0"));
  expect(
    Math.abs(total - (72 + (await height(row(spanGrid, "merged2"))))),
  ).toBeLessThan(1);
  await merged
    .getByRole("button", { name: "Lengthen merged owner", exact: true })
    .click();
  await expect(cell(spanGrid, "merged0")).not.toHaveAttribute(
    "aria-rowspan",
    "3",
  );
  await expect
    .poll(() => height(row(spanGrid, "merged0")))
    .toBeGreaterThan(150);
  await merged.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cell(spanGrid, "merged0")).toHaveAttribute("aria-rowspan", "3");
  await expect.poll(() => height(cell(spanGrid, "merged0"))).toBe(total);
  expect(errors).toEqual([]);
});
test("a scrolled source-row point and outside focus survive content growth above it", async ({
  page,
}) => {
  const { wrapped, grid, errors } = await setup(page);
  await grid.hover({ position: { x: 450, y: 180 } });
  await page.mouse.wheel(0, 1200);
  const anchor = await grid.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [
      ...element.querySelectorAll<HTMLElement>('[role="row"][data-og-row-id]'),
    ]
      .map((row) => ({
        id: row.dataset.ogRowId!,
        top: row.getBoundingClientRect().top - box.top,
        bottom: row.getBoundingClientRect().bottom - box.top,
      }))
      .filter((row) => row.top >= 80 && row.bottom < box.height)
      .sort((a, b) => a.top - b.top)[0];
  });
  expect(anchor).toBeTruthy();
  expect(anchor.id).not.toBe("height0");
  const button = wrapped.getByRole("button", {
    name: "Expand first note",
    exact: true,
  });
  await button.click();
  await expect.poll(() => height(row(grid, "height0"))).toBeGreaterThan(150);
  await expect
    .poll(async () => {
      const frame = (await grid.boundingBox())!,
        target = (await row(grid, anchor.id).boundingBox())!;
      return Math.abs(target.y - frame.y - anchor.top);
    })
    .toBeLessThan(2);
  await expect(
    wrapped.getByRole("button", { name: "Shorten first note", exact: true }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});
test("language, RTL and dark mode preserve content and intentional outside focus", async ({
  page,
}) => {
  const { region, wrapped, grid, errors } = await setup(page);
  await wrapped
    .getByRole("button", { name: "Expand first note", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "height0"))).toBeGreaterThan(150);
  await cell(grid, "height0").focus();
  await region
    .getByRole("checkbox", {
      name: "Spanish automatic-row labels",
      exact: true,
    })
    .check();
  await region
    .getByRole("checkbox", {
      name: "Right-to-left automatic rows",
      exact: true,
    })
    .check();
  await region
    .getByRole("checkbox", { name: "Dark automatic-row theme", exact: true })
    .check();
  await expect(grid).toHaveAttribute("dir", "rtl");
  await expect(
    region.getByRole("checkbox", {
      name: "Dark automatic-row theme",
      exact: true,
    }),
  ).toBeFocused();
  await expect(cell(grid, "height0")).toContainText("Review the delivery");
  await expect.poll(() => height(row(grid, "height0"))).toBeGreaterThan(150);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await region.evaluate(async (element) =>
    (await (window as any).axe.run(element)).violations
      .filter((item: any) => ["serious", "critical"].includes(item.impact))
      .map((item: any) => item.id),
  );
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("flex content stabilizes after gaining a scrollbar and reflows with its container", async ({
  page,
}) => {
  const { region, errors } = await setup(page);
  const article = region.getByRole("article", {
    name: "Flex automatic content example",
    exact: true,
  });
  const grid = article.getByRole("grid", {
    name: "Auto height flex records",
    exact: true,
  });
  await expect.poll(() => height(row(grid, "flex0"))).toBeGreaterThan(36);
  const wide = await height(row(grid, "flex0"));
  await article
    .getByRole("button", { name: "Constrain flex example", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "flex0"))).toBeGreaterThan(wide);
  await article
    .getByRole("button", { name: "Restore flex example", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "flex0"))).toBe(wide);
  expect(errors).toEqual([]);
});

test("pointer resizing remeasures content and Escape restores width and height", async ({
  page,
}) => {
  const { wrapped, grid, errors } = await setup(page);
  await wrapped
    .getByRole("button", { name: "Expand first note", exact: true })
    .click();
  await expect.poll(() => height(row(grid, "height0"))).toBeGreaterThan(150);
  const initial = await height(row(grid, "height0"));
  const separator = grid.getByRole("separator", {
    name: "Resize Notes",
    exact: true,
  });
  await separator.scrollIntoViewIfNeeded();
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + box.height / 2);
  await expect
    .poll(() => height(row(grid, "height0")))
    .toBeGreaterThan(initial);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => height(row(grid, "height0"))).toBe(initial);
  expect(errors).toEqual([]);
});
