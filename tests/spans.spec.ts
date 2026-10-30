import { gridRoot } from "./grid-root.js";
import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
const cell = (grid: Locator, row: string, column: string) =>
  grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Column spans lab", exact: true })
    .click();
});

test("merged owners retain logical ARIA, pin geometry and keyboard/editor navigation", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Spanning records" }),
    caption = cell(grid, "span1", "caption");
  await grid.scrollIntoViewIfNeeded();
  await expect(caption).toHaveAttribute("aria-colspan", "8");
  await expect(caption).toHaveAttribute("aria-colindex", "4");
  await expect(grid).toHaveAttribute("aria-colcount", "34");
  await expect(cell(grid, "span1", "quantity")).toHaveCount(0);
  await expect(cell(grid, "span1", "owner")).toHaveCount(0);
  expect((await caption.boundingBox())!.width).toBeCloseTo(990, 0);
  const review = (await cell(grid, "span1", "review").boundingBox())!,
    status = (await cell(grid, "span1", "status").boundingBox())!;
  expect(review.width).toBeCloseTo(240, 0);
  expect(review.x + review.width).toBeCloseTo(status.x, 0);
  expect(
    (await cell(grid, "span1", "expanded").boundingBox())!.width,
  ).toBeCloseTo(120, 0);
  await caption.focus();
  await caption.press("ArrowRight");
  await expect(cell(grid, "span1", "field7")).toBeFocused();
  await cell(grid, "span1", "field7").press("ArrowLeft");
  await expect(caption).toBeFocused();
  await caption.dblclick();
  const editor = caption.getByRole("textbox");
  await editor.fill("Edited merged owner");
  await editor.press("Tab");
  await expect(cell(grid, "span1", "field7")).toBeFocused();
  await expect(caption).toContainText("Edited merged owner");
  await cell(grid, "span1", "field7").press("Control+z");
  await expect(caption).toContainText("A wide editable detail");
  await cell(grid, "span2", "expanded").focus();
  await cell(grid, "span2", "expanded").press("ArrowRight");
  await cell(grid, "span2", "caption").press("ArrowRight");
  await expect(cell(grid, "span2", "quantity")).toBeFocused();
  await cell(grid, "span2", "quantity").press("ArrowUp");
  await expect(caption).toBeFocused();
});

test("a merged tail stays rendered through horizontal virtualization and pinned cells remain above it", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Spanning records" });
  await grid.scrollIntoViewIfNeeded();
  await grid.evaluate((element) => {
    element.scrollLeft = 650;
  });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollLeft))
    .toBe(650);
  const caption = cell(grid, "span1", "caption"),
    bounds = (await grid.boundingBox())!,
    merged = (await caption.boundingBox())!,
    left = (await cell(grid, "span1", "expanded").boundingBox())!,
    review = (await cell(grid, "span1", "review").boundingBox())!,
    status = (await cell(grid, "span1", "status").boundingBox())!;
  expect(merged.x).toBeLessThan(bounds.x);
  expect(merged.x + merged.width).toBeGreaterThan(left.x + left.width + 15);
  expect(review.x + review.width).toBeCloseTo(status.x, 0);
  await expect(caption).toHaveAttribute("aria-colspan", "8");
  expect(await grid.locator('[data-row-id="span1"]').count()).toBeLessThan(18);
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document
        .elementFromPoint(x, y)
        ?.closest("[data-column-id]");
      return element?.getAttribute("data-column-id");
    },
    { x: left.x + left.width + 12, y: merged.y + merged.height / 2 },
  );
  expect(hit).toBe("caption");
  const pinnedHit = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest("[data-column-id]")
        ?.getAttribute("data-column-id"),
    { x: left.x + left.width / 2, y: left.y + left.height / 2 },
  );
  expect(pinnedHit).toBe("expanded");
});

test("Find excludes covered values, updates after ownership edits and range operations stay disabled", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Spanning records" }),
    root = gridRoot(grid);
  await root.getByRole("button", { name: "Find", exact: true }).click();
  const search = root.getByRole("textbox", { name: "Find in current view" });
  await search.fill("Hidden field marker");
  await expect(root.getByText("No matches", { exact: true })).toBeVisible();
  await expect(
    root.getByText(/Cell ranges, grid clipboard and fill are unavailable/),
  ).toBeVisible();
  await expect(
    root.getByRole("button", { name: "Copy cells", exact: true }),
  ).toHaveCount(0);
  const expanded = cell(grid, "span1", "expanded");
  await expanded.dblclick();
  const editor = expanded.getByRole("checkbox");
  await editor.uncheck();
  await editor.press("Enter");
  await expect(cell(grid, "span1", "quantity")).toBeVisible();
  await expect(root.getByText("1 of 1", { exact: true })).toBeVisible();
  await root.getByRole("button", { name: "Next find match" }).click();
  await expect(cell(grid, "span1", "field1")).toBeFocused();
  await grid
    .getByRole("checkbox", { name: "Select row span1", exact: true })
    .check();
  await expect(
    grid.getByRole("checkbox", { name: "Select row span1", exact: true }),
  ).toBeChecked();
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: () => Promise<{ violations: { id: string; impact: string }[] }>;
        };
      }
    ).axe.run();
    return result.violations
      .filter(
        (value) => value.impact === "serious" || value.impact === "critical",
      )
      .map((value) => value.id);
  });
  expect(violations).toEqual([]);
});
