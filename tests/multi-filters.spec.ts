import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Independent multi-filter lab", exact: true })
    .click();
  const region = page.getByRole("region", {
      name: "Independent multi-filter example",
      exact: true,
    }),
    grid = region.getByRole("grid", {
      name: "Independent filters inventory",
      exact: true,
    });
  return { region, grid, errors };
}
const source = async (region: Locator) =>
  JSON.parse((await region.getByTestId("multi-filter-source").textContent())!);
async function count(region: Locator, value: number) {
  await expect.poll(async () => (await source(region)).matching).toBe(value);
}
async function open(page: Page, grid: Locator, column = "Region") {
  await grid
    .getByRole("button", { name: `Filter ${column}`, exact: true })
    .click();
  const parent = page.getByRole("dialog", {
    name: `Combined filters for ${column}`,
    exact: true,
  });
  await expect(parent).toBeVisible();
  return parent;
}
async function condition(
  page: Page,
  parent: Locator,
  column: string,
  value: string,
) {
  await parent
    .getByRole("button", { name: "Edit Conditions", exact: true })
    .click();
  const child = page.getByRole("dialog", {
    name: `Conditions for ${column}`,
    exact: true,
  });
  await child
    .getByRole("textbox", { name: "Value for condition 1", exact: true })
    .fill(value);
  await child
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(child).toHaveCount(0);
}
async function values(
  page: Page,
  parent: Locator,
  column: string,
  value: RegExp,
) {
  await parent
    .getByRole("button", { name: "Edit Values", exact: true })
    .click();
  const child = page.getByRole("dialog", {
    name: `Values for ${column}`,
    exact: true,
  });
  await child
    .getByRole("checkbox", { name: "Select all matching values", exact: true })
    .click();
  await child.getByRole("checkbox", { name: value }).check();
  await child.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(child).toHaveCount(0);
}

test("nested Escape and staged child settings preserve the applied query until one combined Apply", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  let parent = await open(page, grid);
  await parent
    .getByRole("button", { name: "Edit Conditions", exact: true })
    .click();
  const child = page.getByRole("dialog", {
    name: "Conditions for Region",
    exact: true,
  });
  await child
    .getByRole("textbox", { name: "Value for condition 1", exact: true })
    .press("Escape");
  await expect(child).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(
    parent.getByRole("button", { name: "Edit Conditions", exact: true }),
  ).toBeFocused();
  await condition(page, parent, "Region", "North");
  await values(page, parent, "Region", /Northwest/);
  await count(region, 100);
  expect((await source(region)).filters).toEqual({});
  await parent.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(parent).toHaveCount(0);
  await count(region, 100);
  parent = await open(page, grid);
  await condition(page, parent, "Region", "so");
  await values(page, parent, "Region", /South/);
  await count(region, 100);
  await parent
    .getByRole("button", { name: "Apply combined filter", exact: true })
    .click();
  await expect(parent).toHaveCount(0);
  await count(region, 25);
  const applied = (await source(region)).filters.region;
  expect(applied.op).toBe("multi");
  expect(applied.filters.map((item: { id: string }) => item.id)).toEqual([
    "conditions",
    "values",
  ]);
  await expect(
    grid.getByRole("button", { name: "Filter Region", exact: true }),
  ).toBeFocused();
  await region
    .getByRole("button", { name: "Restore named region filter", exact: true })
    .click();
  parent = await open(page, grid);
  await parent
    .getByRole("button", { name: "Edit Conditions", exact: true })
    .click();
  const restored = page.getByRole("dialog", {
    name: "Conditions for Region",
    exact: true,
  });
  await expect(
    restored.getByRole("textbox", {
      name: "Value for condition 1",
      exact: true,
    }),
  ).toHaveValue("North");
  await expect(
    restored.getByRole("textbox", {
      name: "Value for condition 2",
      exact: true,
    }),
  ).toHaveValue("South");
  await restored.getByRole("button", { name: "Cancel", exact: true }).click();
  await parent
    .getByRole("button", { name: "Clear staged filters", exact: true })
    .click();
  await count(region, 25);
  await parent
    .getByRole("button", { name: "Apply combined filter", exact: true })
    .click();
  await count(region, 100);
  expect(errors).toEqual([]);
});

test("an external root filter cannot discard a finishing child draft or be overwritten without acknowledgement", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page),
    parent = await open(page, grid);
  await parent
    .getByRole("button", { name: "Edit Conditions", exact: true })
    .click();
  const child = page.getByRole("dialog", {
      name: "Conditions for Region",
      exact: true,
    }),
    input = child.getByRole("textbox", {
      name: "Value for condition 1",
      exact: true,
    });
  await input.fill("North");
  await input.press("Control+Shift+E");
  await count(region, 25);
  await expect(child).toBeVisible();
  await expect(input).toHaveValue("North");
  await child
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await expect(child).toHaveCount(0);
  await expect(
    parent.getByRole("button", { name: "Apply combined filter", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      parent.evaluate((node) =>
        node.contains(node.ownerDocument.activeElement),
      ),
    )
    .toBe(true);
  expect((await source(region)).filters.region).toEqual({
    op: "equals",
    value: "West",
  });
  await parent
    .getByRole("button", { name: "Keep staged filters", exact: true })
    .click();
  await parent
    .getByRole("button", { name: "Apply combined filter", exact: true })
    .click();
  await count(region, 50);
  expect((await source(region)).filters.region.filters[0].filter.value).toBe(
    "North",
  );
  expect(errors).toEqual([]);
});

test("Escape returns to a usable parent action when the child launcher became disabled", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page),
    parent = await open(page, grid);
  await parent
    .getByRole("button", { name: "Edit Conditions", exact: true })
    .click();
  const child = page.getByRole("dialog", {
    name: "Conditions for Region",
    exact: true,
  });
  const input = child.getByRole("textbox", {
    name: "Value for condition 1",
    exact: true,
  });
  await input.fill("North");
  await input.press("Control+Shift+E");
  await input.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(
    parent.getByRole("button", { name: "Reload applied filters", exact: true }),
  ).toBeFocused();
  await parent.getByRole("button", { name: "Cancel", exact: true }).click();
  await count(region, 25);
  expect((await source(region)).filters.region).toEqual({
    op: "equals",
    value: "West",
  });
  expect(errors).toEqual([]);
});

test("native child modality and drafts survive incoming rows, language/RTL and temporary source-read failure", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await open(page, grid);
  const parent = page.locator(".og-multi-filter-dialog");
  await parent
    .getByRole("button", { name: "Edit Conditions", exact: true })
    .click();
  const child = page.locator(".og-condition-dialog"),
    input = child.getByRole("textbox");
  await input.fill("North");
  await input.evaluate((node) => {
    (window as unknown as { multiInput: Element }).multiInput = node;
  });
  await input.press("Control+Shift+U");
  await input.press("Control+Shift+L");
  await input.press("Control+Shift+D");
  await expect(grid).toHaveAttribute("dir", "rtl");
  await expect(child).toHaveAttribute("lang", "es-ES");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("North");
  expect(
    await input.evaluate(
      (node) =>
        node === (window as unknown as { multiInput: Element }).multiInput,
    ),
  ).toBe(true);
  expect(await child.evaluate((node) => node.matches(":modal"))).toBe(true);
  expect((await source(region)).firstRegion).toBe("Incoming");
  await input.press("Control+Shift+R");
  await expect(input).toHaveValue("North");
  await child
    .getByRole("button", { name: "Aplicar condiciones", exact: true })
    .click();
  await expect(child).toHaveCount(0);
  await expect(
    parent.getByRole("button", {
      name: "Aplicar filtro combinado",
      exact: true,
    }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      parent.evaluate((node) =>
        node.contains(node.ownerDocument.activeElement),
      ),
    )
    .toBe(true);
  await parent
    .getByRole("button", { name: "Cancelar", exact: true })
    .press("Control+Shift+R");
  await parent
    .getByRole("button", { name: "Conservar filtros preparados", exact: true })
    .click();
  expect(await parent.evaluate((node) => node.matches(":modal"))).toBe(true);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await parent.evaluate(async (node) =>
    (
      await (
        window as unknown as {
          axe: {
            run: (
              node: Element,
            ) => Promise<{ violations: { id: string; impact: string }[] }>;
          };
        }
      ).axe.run(node)
    ).violations
      .filter((item) => item.impact === "serious" || item.impact === "critical")
      .map((item) => item.id),
  );
  expect(violations).toEqual([]);
  await parent.screenshot({ path: ".npm-cache/multi-filter-spanish-rtl.png" });
  await parent
    .getByRole("button", { name: "Aplicar filtro combinado", exact: true })
    .click();
  await count(region, 49);
  expect((await source(region)).filters.region.filters[0].filter.value).toBe(
    "North",
  );
  expect(errors).toEqual([]);
});

test("independent bigint conditions and choices preserve digits beyond the safe integer range", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page),
    parent = await open(page, grid, "Exact lots");
  await parent
    .getByRole("button", { name: "Edit Conditions", exact: true })
    .click();
  const child = page.getByRole("dialog", {
    name: "Conditions for Exact lots",
    exact: true,
  });
  await child
    .getByRole("combobox", { name: "Operator for condition 1", exact: true })
    .selectOption("equals");
  await child
    .getByRole("textbox", { name: "Value for condition 1", exact: true })
    .fill("9007199254740993");
  await child
    .getByRole("button", { name: "Apply conditions", exact: true })
    .click();
  await values(page, parent, "Exact lots", /9007199254740993/);
  await count(region, 100);
  await parent
    .getByRole("button", { name: "Apply combined filter", exact: true })
    .click();
  await count(region, 34);
  const applied = (await source(region)).filters.lots;
  expect(
    String(applied.filters[0].filter.value).replace(/n$/, " ").trim(),
  ).toBe("9007199254740993");
  expect(applied.filters[1].filter.value).toEqual(["9007199254740993n"]);
  expect(errors).toEqual([]);
});
