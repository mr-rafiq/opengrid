import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
const cell = (grid: Locator, id: string, column: string) =>
  grid.locator(`[data-row-id="${id}"][data-column-id="${column}"]`);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Localization lab", exact: true })
    .click();
});

test("runtime language changes retain a focused cell draft, undo and quick-filter state", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Localized inventory" }),
    root = grid.locator(".."),
    item = cell(grid, "locale1", "item");
  await item.focus();
  await item.press("F2");
  const editor = item.getByRole("textbox");
  await editor.fill("Retained browser draft");
  const original = await editor.elementHandle();
  await editor.press("Control+Shift+l");
  await expect(root).toHaveAttribute("lang", "es-ES");
  await expect(editor).toHaveValue("Retained browser draft");
  await expect(editor).toBeFocused();
  expect(
    await original!.evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await expect(
    root.getByRole("button", { name: "Deshacer", exact: true }),
  ).toBeVisible();
  await editor.press("Enter");
  await expect(item).toContainText("Retained browser draft");
  await root.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(item).toContainText("Notebook");
  const query = root.getByRole("textbox", {
    name: "Buscar en todas las filas",
    exact: true,
  });
  await query.fill("Desk lamp");
  await query.press("Control+Shift+l");
  await expect(root).toHaveAttribute("lang", "en-US");
  await expect(
    root.getByRole("textbox", { name: "Search all rows", exact: true }),
  ).toHaveValue("Desk lamp");
  await expect(cell(grid, "locale2", "item")).toContainText("Desk lamp");
  await expect(cell(grid, "locale1", "item")).toHaveCount(0);
});

test("pending choices, row-form drafts and plain notes survive language switching", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Localized inventory" }),
    category = cell(grid, "locale1", "category");
  await category.focus();
  await category.press("F2");
  const select = category.getByRole("combobox");
  await expect(select).toHaveAttribute("aria-busy", "true");
  const original = await select.elementHandle();
  await select.press("Control+Shift+l");
  await expect(category.getByRole("combobox")).toHaveAttribute(
    "aria-label",
    "Editar Category de la fila locale1",
  );
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(
    category.getByText("Cargando opciones...", { exact: true }),
  ).toBeVisible();
  await expect(select).not.toHaveAttribute("aria-busy", "true");
  await select.selectOption("Field");
  await select.press("Enter");
  await expect(category).toContainText("Field");
  await page
    .getByRole("checkbox", { name: "Use row edit dialog", exact: true })
    .check();
  const item = cell(grid, "locale1", "item");
  await item.focus();
  await item.press("F2");
  const dialog = page.getByRole("dialog"),
    draft = dialog.getByRole("textbox", { name: "Editar Item", exact: true });
  await draft.fill("Modal draft retained");
  const formInput = await draft.elementHandle();
  await draft.press("Control+Shift+l");
  await expect(
    dialog.getByRole("textbox", { name: "Edit Item", exact: true }),
  ).toHaveValue("Modal draft retained");
  expect(
    await formInput!.evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Save row", exact: true }).click();
  await expect(item).toContainText("Modal draft retained");
  await item.focus();
  await item.press("Alt+n");
  const note = page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Note text", exact: true });
  await note.fill("<b>Plain application note</b>");
  await note.press("Control+Shift+l");
  await expect(
    page.getByRole("textbox", { name: "Texto de la nota", exact: true }),
  ).toHaveValue("<b>Plain application note</b>");
  await page.getByRole("button", { name: "Guardar nota", exact: true }).click();
  await expect(item.locator("b")).toHaveCount(0);
});

test("chart choices and a stale print capture persist through translation without recapture", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Localized inventory" });
  await page
    .getByRole("button", { name: "Localized chart and print", exact: true })
    .click();
  const chart = page.getByRole("region", { name: "Localized inventory chart" }),
    print = page.locator("[data-og-print-view]");
  await chart
    .getByRole("combobox", { name: "Chart type", exact: true })
    .selectOption("line");
  await expect(
    print.getByRole("cell", { name: "12.5", exact: true }),
  ).toBeVisible();
  const price = cell(grid, "locale1", "price");
  await price.focus();
  await price.press("F2");
  const editor = price.getByRole("spinbutton");
  await editor.fill("90");
  await editor.press("Enter");
  await expect(print.getByRole("status")).toContainText(
    "Grid changed; refresh the snapshot before printing.",
  );
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await expect(
    chart.getByRole("combobox", { name: "Tipo de gráfico", exact: true }),
  ).toHaveValue("line");
  await expect(
    print.getByRole("cell", { name: "12.5", exact: true }),
  ).toBeVisible();
  await expect(
    print.getByRole("cell", { name: "90", exact: true }),
  ).toHaveCount(0);
  await print
    .getByRole("button", {
      name: "Actualizar captura de impresión",
      exact: true,
    })
    .click();
  await expect(
    print.getByRole("cell", { name: "90", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "Buscar en todas las filas",
      exact: true,
    }),
  ).toBeVisible();
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
