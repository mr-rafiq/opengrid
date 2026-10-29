import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const cell = (grid: Locator, row: string, column = "region") =>
  grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Combined spans lab", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Combined span example",
    exact: true,
  });
  const grid = region.getByRole("grid", {
    name: "Merged inventory",
    exact: true,
  });
  return { region, grid, errors };
}
test("rectangular owners expose both spans, edit one source row and restore with undo", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const owner = cell(grid, "merge1");
  await expect(owner).toHaveAttribute("aria-colspan", "2");
  await expect(owner).toHaveAttribute("aria-rowspan", "30");
  expect((await owner.boundingBox())!.width).toBeCloseTo(340, 0);
  expect((await owner.boundingBox())!.height).toBeCloseTo(1140, 0);
  await expect(cell(grid, "merge2")).toHaveCount(0);
  await expect(cell(grid, "merge1", "team")).toHaveCount(0);
  await owner.dblclick({ position: { x: 70, y: 18 } });
  const editor = grid.getByRole("textbox", {
    name: "Edit Region row merge1",
    exact: true,
  });
  await editor.fill("Changed owner");
  await editor.press("Enter");
  await expect(owner).not.toHaveAttribute("aria-rowspan");
  await expect(cell(grid, "merge2")).toHaveAttribute("aria-rowspan", "29");
  await expect(cell(grid, "merge2")).toBeFocused();
  await region.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(owner).toHaveAttribute("aria-rowspan", "30");
  await owner.focus();
  await owner.press("ArrowDown");
  await expect(cell(grid, "merge31")).toBeFocused();
  await cell(grid, "merge31").press("ArrowUp");
  await expect(owner).toBeFocused();
  expect(errors).toEqual([]);
});
test("retains rectangle anchors above and before both windows, then handles pins, RTL and Find", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Scroll inside first rectangle", exact: true })
    .click();
  const owner = cell(grid, "merge1");
  await expect.poll(() => grid.evaluate((node) => node.scrollTop)).toBe(760);
  await expect(owner).toHaveAttribute("aria-rowspan", "30");
  await expect(cell(grid, "merge1", "amount")).toHaveCount(0);
  await grid.scrollIntoViewIfNeeded();
  const box = (await grid.boundingBox())!;
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>(
          '[role="gridcell"][data-row-id][data-column-id]',
        );
      return element
        ? { row: element.dataset.rowId, column: element.dataset.columnId }
        : null;
    },
    { x: box.x + 110, y: box.y + 100 },
  );
  expect(hit).toEqual({ row: "merge1", column: "region" });
  await region
    .getByRole("button", { name: "Pin merged columns", exact: true })
    .click();
  await region
    .getByRole("button", { name: "Merged direction RTL", exact: true })
    .click();
  await expect(grid).toHaveAttribute("dir", "rtl");
  await expect(owner).toHaveAttribute("aria-colspan", "2");
  await expect(owner).toHaveAttribute("aria-rowspan", "30");
  const rootBox = (await grid.boundingBox())!,
    mergedBox = (await owner.boundingBox())!;
  expect(mergedBox.x).toBeGreaterThanOrEqual(rootBox.x);
  expect(mergedBox.x + mergedBox.width).toBeLessThanOrEqual(
    rootBox.x + rootBox.width,
  );
  await region.getByRole("button", { name: "Find", exact: true }).click();
  const find = region.getByRole("textbox", {
    name: "Find in current view",
    exact: true,
  });
  await find.fill("Member group");
  await expect(region.getByText("No matches", { exact: true })).toBeVisible();
  await find.fill("Cluster 1");
  await expect(region.getByText("1 of 4", { exact: true })).toBeVisible();
  const counterOrder = await region
    .getByText("1 of 4", { exact: true })
    .evaluate((element) => {
      const text = element.firstChild!;
      return (
        [
          [0, 1],
          [2, 4],
          [5, 6],
        ] as const
      ).map(([start, end]) => {
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, end);
        return range.getBoundingClientRect().left;
      });
    });
  expect(counterOrder[0]).toBeLessThan(counterOrder[1]);
  expect(counterOrder[1]).toBeLessThan(counterOrder[2]);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await region.evaluate(async (node) =>
    (await (window as any).axe.run(node)).violations
      .filter(
        (item: any) => item.impact === "serious" || item.impact === "critical",
      )
      .map((item: any) => item.id),
  );
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
  await region.screenshot({ path: "test-results/combined-rtl.png" });
});
test("changing footprints expose independent owners and an incoming merge cancels a covered draft", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Use changing footprints", exact: true })
    .click();
  await expect(cell(grid, "merge1")).toHaveAttribute("aria-rowspan", "15");
  await grid.evaluate((node) => {
    node.scrollTop = 15 * 38;
    node.dispatchEvent(new Event("scroll"));
  });
  const team = cell(grid, "merge16", "team");
  await expect(team).toHaveAttribute("aria-rowspan", "5");
  await expect(team).toHaveText("Member group 2");
  await team.dblclick({ position: { x: 50, y: 18 } });
  const editor = grid.getByRole("textbox", {
    name: "Edit Team row merge16",
    exact: true,
  });
  await editor.fill("Discard this covered draft");
  await region
    .getByRole("button", { name: "Use uniform footprints", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(editor).toHaveCount(0);
  await expect(cell(grid, "merge1")).toHaveAttribute("aria-rowspan", "30");
  await expect(cell(grid, "merge1")).toBeFocused();
  await region
    .getByRole("button", { name: "Use changing footprints", exact: true })
    .click();
  await grid.evaluate((node) => {
    node.scrollTop = 15 * 38;
    node.dispatchEvent(new Event("scroll"));
  });
  await expect(team).toHaveText("Member group 2");
  expect(errors).toEqual([]);
});
