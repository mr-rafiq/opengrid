import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
const cell = (grid: Locator, row: string, column: string) =>
  grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Row spans lab", exact: true })
    .click();
});

test("vertical owners span original rows and editing splits then undo restores the run and focus", async ({
  page,
}) => {
  const grid = page.getByRole("treegrid", { name: "Merged allocations" }),
    region = cell(grid, "rowspan1", "region");
  await grid.scrollIntoViewIfNeeded();
  await expect(region).toHaveAttribute("aria-rowspan", "120");
  expect((await region.boundingBox())!.height).toBeCloseTo(4560, 0);
  await expect(cell(grid, "rowspan2", "region")).toHaveCount(0);
  await expect(cell(grid, "rowspan1", "team")).toHaveAttribute(
    "aria-rowspan",
    "60",
  );
  await expect(cell(grid, "rowspan1", "category")).toHaveAttribute(
    "aria-rowspan",
    "8",
  );
  await expect(grid).toHaveAttribute("aria-colcount", "22");
  await grid
    .getByRole("checkbox", { name: "Select row rowspan2", exact: true })
    .check();
  await expect(
    grid.getByRole("checkbox", { name: "Select row rowspan2", exact: true }),
  ).toBeChecked();
  await region.focus();
  await region.press("ArrowDown");
  await expect(cell(grid, "rowspan121", "region")).toBeFocused();
  await cell(grid, "rowspan121", "region").press("ArrowUp");
  await expect(region).toBeFocused();
  await region.press("F2");
  const editor = grid.getByRole("textbox", {
    name: "Edit Region row rowspan1",
    exact: true,
  });
  await editor.fill("Standalone desk");
  await editor.press("Enter");
  await expect(region).toContainText("Standalone desk");
  await expect(cell(grid, "rowspan2", "region")).toHaveAttribute(
    "aria-rowspan",
    "119",
  );
  await expect(cell(grid, "rowspan2", "region")).toBeFocused();
  await cell(grid, "rowspan2", "region").press("Control+z");
  await expect(region).toHaveAttribute("aria-rowspan", "120");
  await expect(region).toBeFocused();
});

test("offscreen anchors retain only intersecting merged cells and preserve pinned hit-testing", async ({
  page,
}) => {
  const grid = page.getByRole("treegrid", { name: "Merged allocations" });
  await grid.scrollIntoViewIfNeeded();
  await grid.evaluate((element) => {
    element.scrollTop = 80 * 38;
  });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollTop))
    .toBe(3040);
  const anchor = grid.locator(
      '.og-row[data-row-key="rowspan1"][data-row-span-anchor-only="true"]',
    ),
    region = cell(grid, "rowspan1", "region");
  await expect(anchor).toHaveCount(1);
  await expect(anchor.getByRole("checkbox")).toHaveCount(0);
  await expect(cell(grid, "rowspan1", "record")).toHaveCount(0);
  await expect(cell(grid, "rowspan1", "team")).toHaveCount(0);
  await expect(region).toHaveAttribute("aria-rowspan", "120");
  expect(await grid.locator(".og-row[data-row-key]").count()).toBeLessThan(45);
  const bounds = (await grid.boundingBox())!,
    header = (await grid.locator(".og-header").boundingBox())!,
    regionBounds = (await region.boundingBox())!,
    x = regionBounds.x + regionBounds.width / 2,
    y = header.y + header.height + 45;
  expect(regionBounds.y).toBeLessThan(bounds.y);
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document
        .elementFromPoint(x, y)
        ?.closest("[data-column-id]");
      return [
        element?.getAttribute("data-row-id"),
        element?.getAttribute("data-column-id"),
      ];
    },
    { x, y },
  );
  expect(hit).toEqual(["rowspan1", "region"]);
  const right = (await cell(grid, "rowspan61", "team").boundingBox())!;
  await grid.evaluate((element) => {
    element.scrollLeft = 550;
  });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollLeft))
    .toBe(550);
  expect((await region.boundingBox())!.x).toBeCloseTo(regionBounds.x, 0);
  expect((await cell(grid, "rowspan61", "team").boundingBox())!.x).toBeCloseTo(
    right.x,
    0,
  );
  await region.focus();
  await region.press("ArrowRight");
  await expect(cell(grid, "rowspan1", "record")).toBeFocused();
  await expect(
    grid.locator(
      '.og-row[data-row-key="rowspan1"][data-row-span-anchor-only="true"]',
    ),
  ).toHaveCount(0);
});

test("Find and pin/detail/full-width boundaries respect independent source rows", async ({
  page,
}) => {
  const grid = page.getByRole("treegrid", { name: "Merged allocations" }),
    root = grid.locator("..");
  await root.getByRole("button", { name: "Find", exact: true }).click();
  await root
    .getByRole("textbox", { name: "Find in current view" })
    .fill("Northern desk");
  await expect(root.getByText("1 of 1", { exact: true })).toBeVisible();
  await expect(root.locator(".og-span-help")).toBeVisible();
  await expect(
    root.getByRole("button", { name: "Copy cells", exact: true }),
  ).toHaveCount(0);
  await root.getByRole("button", { name: "Close find", exact: true }).click();
  await page
    .getByRole("button", { name: "Row span pin boundaries", exact: true })
    .click();
  await expect(cell(grid, "rowspan1", "region")).toHaveAttribute(
    "aria-rowspan",
    "2",
  );
  await expect(cell(grid, "rowspan3", "region")).toHaveAttribute(
    "aria-rowspan",
    "118",
  );
  await page
    .getByRole("button", { name: "Row span pin boundaries", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Row span detail boundary", exact: true })
    .click();
  await expect(cell(grid, "rowspan1", "region")).toHaveAttribute(
    "aria-rowspan",
    "2",
  );
  await expect(cell(grid, "rowspan4", "region")).toHaveAttribute(
    "aria-rowspan",
    "117",
  );
  const action = page.getByRole("button", {
    name: "Allocation detail action",
    exact: true,
  });
  await expect(action).toBeVisible();
  await action.scrollIntoViewIfNeeded();
  const actionBounds = (await action.boundingBox())!;
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.textContent,
      {
        x: actionBounds.x + actionBounds.width / 2,
        y: actionBounds.y + actionBounds.height / 2,
      },
    ),
  ).toBe("Allocation detail action");
  await page
    .getByRole("button", { name: "Row span full-width boundary", exact: true })
    .click();
  await expect(cell(grid, "rowspan5", "region")).toHaveAttribute(
    "aria-rowspan",
    "116",
  );
  await expect(
    grid.getByText("Summary boundary for rowspan4", { exact: true }),
  ).toBeVisible();
  await expect(cell(grid, "rowspan4", "region")).toHaveCount(0);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await page.evaluate(async () =>
    (
      await (
        window as unknown as {
          axe: {
            run: () => Promise<{
              violations: { id: string; impact: string }[];
            }>;
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
});
