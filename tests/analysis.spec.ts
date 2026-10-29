import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("grid").waitFor();
});
test("commits native select, checkbox and multiline editors through the model", async ({
  page,
}) => {
  const cell = (column: string) =>
    page.locator(`[data-row-id="1"][data-column-id="${column}"]`);
  await cell("sector").dblclick();
  const select = page.getByRole("combobox", { name: "Edit Sector row 1" });
  await select.selectOption("Healthcare");
  await select.press("Enter");
  await expect(cell("sector")).toContainText("Healthcare");
  await cell("company").focus();
  await cell("company").press("End");
  await cell("trend").press("ArrowLeft");
  await cell("active").press("F2");
  const checkbox = page.getByRole("checkbox", { name: "Edit Active row 1" });
  await checkbox.check();
  await checkbox.press("Enter");
  await expect(cell("active")).toContainText("Active");
  await cell("company").dblclick();
  const multiline = page.getByRole("textbox", { name: "Edit Company row 1" });
  await multiline.fill("Renamed\nCompany");
  await multiline.press("Control+Enter");
  await expect(cell("company")).toContainText("Renamed");
  await page
    .locator(".og-toolbar")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(cell("company")).toContainText("Northstar Labs");
});
test("charts follow ranges and provide a real SVG export", async ({ page }) => {
  await page.getByRole("button", { name: "Chart data", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Portfolio analysis",
    exact: true,
  });
  await expect(panel.getByRole("img")).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Chart type" })
    .selectOption("line");
  const downloadEvent = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export chart SVG" }).click();
  const download = await downloadEvent;
  expect(await readFile((await download.path())!, "utf8")).toContain("<svg");
  await page.locator('[data-row-id="1"][data-column-id="price"]').click();
  await page
    .locator('[data-row-id="2"][data-column-id="shares"]')
    .click({ modifiers: ["Shift"] });
  await expect(panel).toContainText("2 source rows");
});
test("formula dependencies recalculate after edits and diagnose cycles", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Formula lab", exact: true }).click();
  const result = page.getByTestId("formula-result");
  await expect(result).toContainText("177.39");
  await page
    .getByRole("textbox", { name: "Analysis formula" })
    .fill("=IF(E1>0,SUM(E1:E3),1/0)");
  await expect(result).toContainText("177.39");
  await page.locator('[data-row-id="1"][data-column-id="price"]').dblclick();
  const editor = page.getByRole("spinbutton", { name: "Edit Price row 1" });
  await editor.fill("100");
  await editor.press("Enter");
  await expect(result).toContainText("235.39");
  await page.getByRole("textbox", { name: "Analysis formula" }).fill("=K1");
  await expect(result).toContainText("#CYCLE");
});
