import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const cell = (grid: Locator, row = "rich1", column = "market") =>
  grid.locator(`[data-row-id="${row}"][data-column-id="${column}"]`);
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Rich choice editor lab", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Rich choice example",
    exact: true,
  });
  const grid = region.getByRole("grid", {
    name: "Rich choice inventory",
    exact: true,
  });
  return { region, grid, errors };
}
const source = async (region: Locator) =>
  JSON.parse((await region.getByTestId("rich-source").textContent())!);
async function open(page: Page, grid: Locator) {
  await cell(grid).focus();
  await cell(grid).press("F2");
  const dialog = page.getByRole("dialog", {
    name: "Choose Market",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox", {
    name: "Search Market choices",
    exact: true,
  });
  await expect(input).toBeFocused();
  return { dialog, input };
}

test("virtualized search preserves exact IDs through validation, Enter navigation and undo", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const { dialog, input } = await open(page, grid);
  expect(await dialog.getByRole("option").count()).toBeLessThanOrEqual(13);
  await input.press("End");
  const last = dialog.getByRole("option", {
    name: "Market 09999",
    exact: true,
  });
  await expect(last).toHaveAttribute("aria-selected", "true");
  await expect(last).toHaveAttribute("aria-posinset", "10000");
  expect(await dialog.getByRole("option").count()).toBeLessThanOrEqual(13);
  await expect
    .poll(() =>
      input.evaluate((node) =>
        Boolean(
          document.getElementById(
            node.getAttribute("aria-activedescendant") ?? "",
          ),
        ),
      ),
    )
    .toBe(true);
  await input.fill("Unavailable");
  await expect(
    dialog.getByRole("option", { name: "Unavailable market", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    dialog.getByRole("button", { name: "Apply choice", exact: true }),
  ).toBeDisabled();
  await input.fill("Restricted");
  await input.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText(
    "Restricted market cannot be selected.",
  );
  expect((await source(region)).first.market).toBe("9007199254740993");
  await input.fill("Malaga");
  await expect(
    dialog.getByRole("option", { name: "Málaga", exact: true }),
  ).toBeVisible();
  expect((await source(region)).first.market).toBe("9007199254740993");
  await input.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await source(region)).first.market)
    .toBe("9007199254740994");
  await expect(cell(grid, "rich2")).toBeFocused();
  await region.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await source(region)).first.market).toBe("9007199254740993");
  const reopened = await open(page, grid);
  await reopened.input.press("End");
  await reopened.dialog
    .getByRole("button", { name: "Apply choice", exact: true })
    .click();
  await expect(reopened.dialog).toHaveCount(0);
  expect((await source(region)).first.market).toBe(
    String(9007199254740993n + 9999n),
  );
  await expect(cell(grid)).toBeFocused();
  expect(errors).toEqual([]);
});

test("provider retry and locale/direction changes preserve the open picker and staged search", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Fail next choice request", exact: true })
    .click();
  await open(page, grid);
  const dialog = page.locator(".og-rich-select-dialog"),
    input = dialog.locator('input[role="combobox"]');
  await expect(dialog.getByRole("alert")).toContainText(
    "The example choice service is unavailable.",
  );
  await dialog
    .getByRole("button", { name: "Retry choices", exact: true })
    .click();
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await expect(region.getByTestId("rich-requests")).toHaveText(
    "Choice requests: 2",
  );
  await input.fill("Zurich");
  await input.evaluate((node) => {
    (window as unknown as { richSearch: Element }).richSearch = node;
  });
  await input.press("Control+Shift+L");
  await expect(dialog).toHaveAttribute("lang", "es-ES");
  await input.press("Control+Shift+D");
  await expect(grid).toHaveAttribute("dir", "rtl");
  await input.press("Control+Shift+U");
  await expect(input).toHaveValue("Zurich");
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(
      (node) =>
        node === (window as unknown as { richSearch: Element }).richSearch,
    ),
  ).toBe(true);
  expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
  const help = dialog.locator('p[id$="-help"]');
  await expect(help).toHaveCSS("direction", "ltr");
  expect(
    await help.evaluate((node) => {
      const text = node.firstChild!,
        length = text.textContent!.length;
      const x = (start: number) => {
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + 1);
        return range.getBoundingClientRect().left;
      };
      return x(length - 1) > x(length - 2);
    }),
  ).toBe(true);
  await expect(
    dialog.getByRole("option", { name: "Zürich", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(region.getByTestId("rich-requests")).toHaveText(
    "Choice requests: 2",
  );
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await dialog.evaluate(async (node) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (node: Element) => Promise<{ violations: { id: string }[] }>;
        };
      }
    ).axe;
    return (await axe.run(node)).violations.map((item) => item.id);
  });
  expect(violations).toEqual([]);
  await dialog.screenshot({ path: ".npm-cache/rich-choice-dialog.png" });
  await input.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect((await source(region)).first).toEqual({
    id: "rich1",
    market: "9007199254740993",
    quantity: 2,
  });
  await expect(cell(grid)).toBeFocused();
  expect(errors).toEqual([]);
});

test("nested row choices stage one field, Escape closes only the picker and Save row has one undo", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Use row form", exact: true })
    .click();
  await cell(grid).focus();
  await cell(grid).press("F2");
  const row = page.getByRole("dialog", { name: "Edit row rich1", exact: true });
  await expect(row).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await row.getByRole("button", { name: "Choose Market", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Choose Market",
    exact: true,
  });
  const input = picker.getByRole("combobox");
  await input.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(row).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Choose Market", exact: true }),
  ).toBeFocused();
  await row.getByRole("button", { name: "Choose Market", exact: true }).click();
  await picker.getByRole("combobox").fill("Malaga");
  await picker
    .getByRole("button", { name: "Apply choice", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  expect((await source(region)).first.market).toBe("9007199254740993");
  await expect(
    row.getByRole("button", { name: "Choose Market", exact: true }),
  ).toContainText("Málaga");
  await row
    .getByRole("spinbutton", { name: "Edit Quantity", exact: true })
    .fill("8");
  await row.getByRole("button", { name: "Save row", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect((await source(region)).first).toEqual({
    id: "rich1",
    market: "9007199254740994",
    quantity: 8,
  });
  await region.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await source(region)).first).toEqual({
    id: "rich1",
    market: "9007199254740993",
    quantity: 1,
  });
  expect(errors).toEqual([]);
});

test("prefix and fuzzy aliases are explicit modes and cancelling never writes", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("combobox", { name: "Choice search mode", exact: true })
    .selectOption("prefix");
  let editor = await open(page, grid);
  await editor.input.fill("álaga");
  await expect(
    editor.dialog.getByText("No matching choices", { exact: true }),
  ).toBeVisible();
  await editor.input.press("Escape");
  await region
    .getByRole("combobox", { name: "Choice search mode", exact: true })
    .selectOption("fuzzy");
  editor = await open(page, grid);
  await editor.input.fill("MKT-9999");
  await expect(
    editor.dialog.getByRole("option", { name: "Market 09999", exact: true }),
  ).toBeVisible();
  await editor.dialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect((await source(region)).first.market).toBe("9007199254740993");
  await expect(cell(grid)).toBeFocused();
  expect(errors).toEqual([]);
});
