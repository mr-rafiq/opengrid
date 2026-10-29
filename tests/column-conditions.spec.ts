import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Column conditions lab", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Column condition example",
    exact: true,
  });
  return {
    region,
    grid: region.getByRole("grid", {
      name: "Condition inventory",
      exact: true,
    }),
    errors,
  };
}
const operand = (dialog: Locator, index: number) =>
  dialog.getByRole("textbox", {
    name: `Value for condition ${index}`,
    exact: true,
  });
const operator = (dialog: Locator, index: number) =>
  dialog.getByRole("combobox", {
    name: `Operator for condition ${index}`,
    exact: true,
  });
const apply = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Apply conditions", exact: true }).click();

test("stages atomic conditions, retains rejected drafts and fences external changes without losing source-update edits", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page),
    count = region.getByTestId("condition-count");
  const launcher = grid.getByRole("button", {
    name: "Filter Amount",
    exact: true,
  });
  await launcher.click();
  const dialog = page.getByRole("dialog", {
    name: "Conditions for Amount",
    exact: true,
  });
  await operator(dialog, 1).selectOption("gte");
  await operand(dialog, 1).fill("20");
  await dialog
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await operator(dialog, 2).selectOption("lte");
  await operand(dialog, 2).fill("25");
  await expect(count).toHaveText("Matched 120 of 120 rows");
  await apply(dialog);
  await expect(count).toHaveText("Matched 6 of 120 rows");
  await expect(launcher).toBeFocused();
  await launcher.click();
  await operator(dialog, 1).selectOption("between");
  await operand(dialog, 1).fill("30");
  await dialog
    .getByRole("textbox", { name: "Upper value for condition 1", exact: true })
    .fill("10");
  await apply(dialog);
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(operand(dialog, 1)).toHaveValue("30");
  await expect(count).toHaveText("Matched 6 of 120 rows");
  await operand(dialog, 1).press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await operand(dialog, 1).fill("24");
  await operand(dialog, 1).press("Control+Shift+U");
  await expect(operand(dialog, 1)).toHaveValue("24");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await operand(dialog, 1).press("Control+Shift+E");
  await expect(dialog.getByRole("alert")).toContainText(
    "column filter changed",
  );
  await expect(
    dialog.getByRole("button", { name: "Apply conditions", exact: true }),
  ).toBeDisabled();
  await expect(count).toHaveText("Matched 91 of 120 rows");
  await expect(operand(dialog, 1)).toHaveValue("24");
  await dialog
    .getByRole("button", { name: "Replace with new conditions", exact: true })
    .click();
  await apply(dialog);
  await expect(count).toHaveText("Matched 2 of 120 rows");
  const state = JSON.parse(
    await region.getByTestId("condition-state").innerText(),
  );
  expect(state.filters.amount).toEqual({
    op: "and",
    conditions: [
      { op: "gte", value: 24 },
      { op: "lte", value: 25 },
    ],
  });
  expect(state.firstMatchedIds).toEqual(["condition24", "condition25"]);
  expect(errors).toEqual([]);
});

test("keeps BigInt, signed-zero and blank membership exact, with native boolean and UTC calendar operands", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page),
    count = region.getByTestId("condition-count");
  await grid
    .getByRole("button", { name: "Filter Large integer", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Conditions for Large integer",
    exact: true,
  });
  await operator(dialog, 1).selectOption("in");
  await operand(dialog, 1).fill("[9007199254740993]");
  await apply(dialog);
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(count).toHaveText("Matched 120 of 120 rows");
  await operand(dialog, 1).fill('["9007199254740993","9007199254740994"]');
  await dialog
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await operator(dialog, 2).selectOption("notBlank");
  await apply(dialog);
  await expect(count).toHaveText("Matched 2 of 120 rows");
  let state = JSON.parse(
    await region.getByTestId("condition-state").innerText(),
  );
  expect(state.firstMatchedIds).toEqual(["condition2", "condition3"]);
  expect(state.filters.large.conditions[0].value).toEqual([
    "9007199254740993n",
    "9007199254740994n",
  ]);
  await region
    .getByRole("button", { name: "Reset condition example", exact: true })
    .click();
  await grid.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  await grid
    .getByRole("button", { name: "Filter Signed zero", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Conditions for Signed zero",
    exact: true,
  });
  await operator(dialog, 1).selectOption("in");
  await operand(dialog, 1).fill("[-0]");
  await apply(dialog);
  await expect(count).toHaveText("Matched 30 of 120 rows");
  await grid
    .getByRole("button", { name: "Filter Signed zero", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await operator(dialog, 2).selectOption("blank");
  await dialog
    .getByRole("combobox", { name: "Match conditions", exact: true })
    .selectOption("or");
  await apply(dialog);
  await expect(count).toHaveText("Matched 60 of 120 rows");
  await grid
    .getByRole("button", { name: "Filter Enabled", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Conditions for Enabled",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Value for condition 1", exact: true })
    .selectOption("false");
  await apply(dialog);
  await expect(count).toHaveText("Matched 30 of 120 rows");
  await region
    .getByRole("button", { name: "Reset condition example", exact: true })
    .click();
  await grid
    .getByRole("button", { name: "Filter Joined", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Conditions for Joined",
    exact: true,
  });
  await dialog
    .getByLabel("Choose UTC date for condition 1", { exact: true })
    .fill("2026-01-02");
  await expect(operand(dialog, 1)).toHaveValue("2026-01-02T00:00:00.000Z");
  await apply(dialog);
  await expect(count).toHaveText("Matched 6 of 120 rows");
  await grid
    .getByRole("button", { name: "Filter Joined", exact: true })
    .click();
  await operand(dialog, 1).fill("2026-01-02T02:00:00+02:00");
  await apply(dialog);
  await expect(count).toHaveText("Matched 6 of 120 rows");
  state = JSON.parse(await region.getByTestId("condition-state").innerText());
  expect(state.filters.joined.value).toBe("2026-01-02T02:00:00+02:00");
  expect(errors).toEqual([]);
});

test.describe("native touch condition dialogs", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1000, height: 1000 },
  });
  test("retains native modal drafts and focus through Spanish/RTL changes with accessible controls", async ({
    page,
  }) => {
    const { region, grid, errors } = await setup(page);
    await grid
      .getByRole("button", { name: "Filter Amount", exact: true })
      .tap();
    let dialog = page.getByRole("dialog", {
      name: "Conditions for Amount",
      exact: true,
    });
    await operator(dialog, 1).selectOption("gte");
    await operand(dialog, 1).fill("25.5");
    const original = await operand(dialog, 1).elementHandle();
    await operand(dialog, 1).press("Control+Shift+L");
    dialog = page.getByRole("dialog", {
      name: "Condiciones para Amount",
      exact: true,
    });
    const translated = dialog.getByRole("textbox", {
      name: "Valor de la condición 1",
      exact: true,
    });
    await expect(translated).toHaveValue("25.5");
    await expect(translated).toBeFocused();
    expect(
      await original!.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await translated.press("Control+Shift+D");
    await expect(grid).toHaveAttribute("dir", "rtl");
    expect(
      await dialog.evaluate((element) => getComputedStyle(element).direction),
    ).toBe("rtl");
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
      true,
    );
    await expect(
      dialog.getByRole("combobox", {
        name: "Operador de la condición 1",
        exact: true,
      }),
    ).toHaveValue("gte");
    await translated.fill("invalid");
    await dialog
      .getByRole("button", { name: "Aplicar condiciones", exact: true })
      .tap();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(region.getByTestId("condition-count")).toHaveText(
      "Matched 120 of 120 rows",
    );
    await translated.fill("42");
    await page.addScriptTag({
      content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
    });
    const violations = await region.evaluate(async (element) =>
      (await (window as any).axe.run(element)).violations
        .filter(
          (item: any) =>
            item.impact === "serious" || item.impact === "critical",
        )
        .map((item: any) => item.id),
    );
    expect(violations).toEqual([]);
    await page.screenshot({ path: "test-results/conditions-es-rtl.png" });
    await dialog
      .getByRole("button", { name: "Aplicar condiciones", exact: true })
      .tap();
    await expect(region.getByTestId("condition-count")).toHaveText(
      "Matched 79 of 120 rows",
    );
    const launcher = grid.getByRole("button", {
      name: "Filtrar Amount",
      exact: true,
    });
    await expect(launcher).toBeFocused();
    expect(errors).toEqual([]);
  });
});
