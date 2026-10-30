import { gridRoot } from "./grid-root.js";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Formula grid lab", exact: true })
    .click();
  const grid = page
    .getByRole("grid", { name: "Formula sheet", exact: true })
    .or(page.getByRole("treegrid", { name: "Formula sheet", exact: true }));
  return {
    grid,
    root: gridRoot(grid),
    region: page.getByRole("region", {
      name: "Formula sheet example",
      exact: true,
    }),
    errors,
  };
}
const cell = (grid: Locator, id: number, column = "total") =>
  grid.locator(`[data-row-id="formula${id}"][data-column-id="${column}"]`);

test("edits raw formulas, preserves invalid drafts, and recomputes filtered dependencies with shared undo", async ({
  page,
}) => {
  const { grid, root, errors } = await setup(page),
    total = cell(grid, 1);
  await expect(total).toHaveText("6");
  await expect(cell(grid, 1, "analysis")).toHaveText("38");
  await total.dblclick();
  let input = total.getByRole("textbox");
  await expect(input).toHaveValue("=B1*C1");
  await expect(
    root.getByRole("combobox", { name: "Cell input mode", exact: true }),
  ).toHaveValue("formula");
  await input.press("Enter");
  await expect(total).toHaveText("6");
  await total.dblclick();
  input = total.getByRole("textbox");
  await input.fill("=SUM(");
  await input.press("Enter");
  await expect(root.getByRole("alert")).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("=SUM(");
  await input.press("Tab");
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(total).toHaveText("6");
  await expect(total).toHaveText("6");
  await total.dblclick();
  input = total.getByRole("textbox");
  await input.fill("=B1*C1+1");
  await input.press("Enter");
  await expect(total).toHaveText("7");
  await expect(cell(grid, 1, "analysis")).toHaveText("39");
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(total).toHaveText("6");
  await root.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(total).toHaveText("7");
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await cell(grid, 1, "units").dblclick();
  const source = cell(grid, 1, "units").getByRole("spinbutton");
  await source.fill("10");
  await source.press("Enter");
  await expect(total).toHaveText("30");
  await expect(cell(grid, 1, "analysis")).toHaveText("62");
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(total).toHaveText("6");
  await cell(grid, 1, "units").dblclick();
  const rejected = cell(grid, 1, "units").getByRole("spinbutton");
  await rejected.fill("-1");
  await rejected.press("Enter");
  await expect(root.getByRole("alert")).toContainText(
    "Total must be a finite number",
  );
  await expect(rejected).toBeFocused();
  await expect(total).toHaveText("6");
  await rejected.press("Escape");
  await grid.getByRole("button", { name: "Filter Total", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Values for Total",
    exact: true,
  });
  await dialog
    .getByRole("checkbox", { name: "Select all matching values", exact: true })
    .uncheck();
  await dialog.getByRole("checkbox", { name: /^6\s/ }).check();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(cell(grid, 2)).toHaveCount(0);
  await expect(total).toHaveText("6");
  await total.dblclick();
  input = total.getByRole("textbox");
  await input.fill("=0");
  await input.press("Enter");
  await expect(total).toHaveCount(0);
  await expect(grid).toBeFocused();
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(total).toHaveText("6");
  expect(errors).toEqual([]);
});

test("clipboard and fill use computed literals while undo restores raw formula inputs", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { grid, root, region, errors } = await setup(page);
  await cell(grid, 1).click();
  await cell(grid, 3).click({ modifiers: ["Shift"] });
  await cell(grid, 3).press("Control+c");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText()))
      .trim()
      .split(/\r?\n/),
  ).toEqual(["6", "12", "20"]);
  await cell(grid, 1, "analysis").click();
  await page.evaluate(() => navigator.clipboard.writeText("10\n20\n30"));
  await cell(grid, 1, "analysis").press("Control+v");
  await expect(cell(grid, 1, "analysis")).toHaveText("10");
  await expect(cell(grid, 2, "analysis")).toHaveText("20");
  await expect(cell(grid, 3, "analysis")).toHaveText("30");
  await expect(
    region.getByRole("region", { name: "Formula cell inspector", exact: true }),
  ).toContainText("Literal");
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cell(grid, 1, "analysis")).toHaveText("38");
  await expect(cell(grid, 2, "analysis")).toHaveText("4");
  await expect(cell(grid, 3, "analysis")).toHaveText("5");
  await cell(grid, 1).click();
  await cell(grid, 3).click({ modifiers: ["Shift"] });
  await root
    .getByRole("button", { name: "Fill down selected cells", exact: true })
    .click();
  await expect(cell(grid, 2)).toHaveText("6");
  await expect(cell(grid, 3)).toHaveText("6");
  await cell(grid, 1).dblclick();
  await expect(cell(grid, 1).getByRole("textbox")).toHaveValue("=B1*C1");
  await cell(grid, 1).getByRole("textbox").press("Escape");
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cell(grid, 2)).toHaveText("12");
  await expect(cell(grid, 3)).toHaveText("20");
  await cell(grid, 2).dblclick();
  await expect(cell(grid, 2).getByRole("textbox")).toHaveValue("=B2*C2");
  await cell(grid, 2).getByRole("textbox").press("Escape");
  expect(errors).toEqual([]);
});

test("fixed source references survive managed reordering, sorting, grouping and computed CSV export", async ({
  page,
}) => {
  const { grid, root, region, errors } = await setup(page);
  await cell(grid, 1).focus();
  await cell(grid, 1).press("Alt+ArrowDown");
  await expect
    .poll(() =>
      grid
        .locator('[data-row-id][data-column-id="record"]')
        .evaluateAll((elements) =>
          elements
            .slice(0, 3)
            .map((element) => element.getAttribute("data-row-id")),
        ),
    )
    .toEqual(["formula2", "formula1", "formula3"]);
  await expect(cell(grid, 1)).toHaveText("6");
  await expect(cell(grid, 2)).toHaveText("12");
  await expect(cell(grid, 1, "analysis")).toHaveText("38");
  const sort = grid.getByRole("button", { name: "Sort Total", exact: true });
  await sort.click();
  await sort.click();
  await expect(
    grid.locator('[data-row-id][data-column-id="record"]').first(),
  ).toContainText("Record 12");
  await expect(cell(grid, 1)).toHaveText("6");
  await expect(cell(grid, 1, "analysis")).toHaveText("38");
  const download = page.waitForEvent("download");
  await root.getByRole("button", { name: "Export CSV", exact: true }).click();
  const csv = readFileSync((await (await download).path())!, "utf8");
  expect(csv).toContain('"Record 12","13","14","182",');
  expect(csv).not.toContain("[object Object]");
  expect(csv).not.toContain("=B12*C12");
  expect(csv).toContain("'=1+2");
  await region
    .getByRole("checkbox", {
      name: "Group formula rows by region",
      exact: true,
    })
    .check();
  await expect
    .poll(async () =>
      (
        await grid
          .locator('.og-group-row [data-column-id="total"]')
          .allTextContents()
      ).sort(),
    )
    .toEqual(["240", "300", "368"]);
  expect(errors).toEqual([]);
});

test.describe("formula touch editing", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1000, height: 1000 },
  });
  test("native touch entry retains raw editor mode through actual language/direction buttons and typed errors", async ({
    page,
  }) => {
    const { grid, root, region, errors } = await setup(page),
      total = cell(grid, 1);
    await total.tap();
    await root.getByRole("button", { name: "Edit cell", exact: true }).tap();
    const input = total.getByRole("textbox");
    await expect(input).toHaveValue("=B1*C1");
    await input.fill("=B1*C1+2");
    await input.press("Alt+m");
    let mode = root.getByRole("combobox", {
      name: "Cell input mode",
      exact: true,
    });
    await expect(mode).toBeFocused();
    await mode.press("ArrowUp");
    await mode.press("Enter");
    await expect(input).toBeFocused();
    await input.press("Alt+m");
    await mode.press("ArrowDown");
    await mode.press("Enter");
    await expect(input).toBeFocused();
    await expect(mode).toHaveValue("formula");
    const original = await input.elementHandle();
    await region
      .getByRole("button", { name: "Switch formula language", exact: true })
      .tap();
    await region
      .getByRole("button", { name: "Switch formula direction", exact: true })
      .tap();
    await expect(grid).toHaveAttribute("dir", "rtl");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("=B1*C1+2");
    expect(
      await original!.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await expect(total.getByRole("combobox")).toHaveValue("formula");
    await input.press("Enter");
    await expect(total).toHaveText("8");
    await expect(cell(grid, 1, "analysis")).toHaveText("40");
    await root.getByRole("button", { name: "Deshacer", exact: true }).tap();
    await expect(total).toHaveText("6");
    await region
      .getByRole("button", { name: "Introduce cycle", exact: true })
      .tap();
    await expect(total).toHaveAttribute("aria-invalid", "true");
    await expect(total).toContainText("#CYCLE");
    await expect(total).toHaveAttribute("data-formula-error", "CYCLE");
    await expect(
      region.getByRole("region", {
        name: "Formula cell inspector",
        exact: true,
      }),
    ).toContainText("Error CYCLE");
    await page.addScriptTag({
      content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
    });
    const violations = await page.evaluate(async () => {
      const result = await (
        window as unknown as {
          axe: {
            run(): Promise<{ violations: { id: string; impact: string }[] }>;
          };
        }
      ).axe.run();
      return result.violations
        .filter(
          (item) => item.impact === "serious" || item.impact === "critical",
        )
        .map((item) => item.id);
    });
    expect(violations).toEqual([]);
    await root.screenshot({
      path: test.info().outputPath("formula-grid-es-rtl.png"),
    });
    await root.getByRole("button", { name: "Deshacer", exact: true }).tap();
    await expect(total).toHaveText("6");
    expect(errors).toEqual([]);
  });
});
