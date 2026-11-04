import { test, expect } from "@playwright/test";
import path from "node:path";
const runtimeErrors = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/@fs/${path.resolve("tests/fixtures/grid-view.html").replaceAll("\\", "/")}`,
  );
  await expect(
    page.getByRole("grid", { name: "View controller fixture" }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});
test("imperative navigation crosses both virtual axes and reveal retains logical focus", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "View controller fixture" });
  await page
    .getByRole("button", { name: "Focus distant", exact: true })
    .click();
  const cell = grid.locator('[data-row-id="row-700"][data-column-id="c35"]');
  await expect(cell).toBeFocused();
  await expect(page.getByLabel("Command result")).toHaveText(
    "focus:true:row-700:c35",
  );
  expect(await grid.locator('[role="gridcell"]').count()).toBeLessThan(400);
  await page
    .getByRole("button", { name: "Reveal origin", exact: true })
    .click();
  await expect(
    grid.locator('[data-row-id="row-0"][data-column-id="choice"]'),
  ).toBeVisible();
  await expect(page.getByLabel("Command result")).toHaveText(
    "reveal:true:row-700:c35",
  );
});
test("imperative edit/commit keeps focus and host data, cancel discards another draft", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Edit distant", exact: true }).click();
  const editor = page.getByRole("spinbutton", {
    name: "Edit Metric 36 row row-700",
  });
  await expect(editor).toBeFocused();
  await editor.fill("9876");
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  const cell = page.locator('[data-row-id="row-700"][data-column-id="c35"]');
  await expect(cell).toHaveText("9876");
  await expect(cell).toBeFocused();
  await page.getByRole("button", { name: "Edit distant", exact: true }).click();
  await editor.fill("111");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(cell).toHaveText("9876");
});
test("typed class selection and retired handles work at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Edit choice", exact: true }).click();
  const editor = page.getByRole("combobox", { name: "Edit Choice row row-1" });
  await expect(editor).toBeFocused();
  await editor.selectOption("Review");
  await expect(page.getByLabel("Request result")).toHaveText(
    "row-1:choice:class:Review",
  );
  await expect(
    page.locator('[data-row-id="row-1"][data-column-id="choice"]'),
  ).toHaveText("Review");
  await page
    .getByRole("button", { name: "Replace model", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Try old handle", exact: true })
    .click();
  await expect(page.getByLabel("Command result")).toHaveText(
    "retired:false:false",
  );
  await page.getByRole("button", { name: "Unmount grid", exact: true }).click();
  await page
    .getByRole("button", { name: "Try old handle", exact: true })
    .click();
  await expect(page.getByLabel("Command result")).toHaveText(
    "retired:false:false",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
