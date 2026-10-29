import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Hierarchy selection lab", exact: true })
    .click();
  const region = page.getByRole("region", {
      name: "Hierarchy selection example",
      exact: true,
    }),
    grid = region.getByRole("treegrid", {
      name: "Hierarchy selection inventory",
      exact: true,
    });
  return { region, grid, errors };
}
const source = async (region: Locator) =>
  JSON.parse((await region.getByTestId("hierarchy-source").textContent())!) as {
    selected: string[];
    total: number;
    filtered: number;
  };
const selected = async (region: Locator) => (await source(region)).selected;

test("collapsed/off-page groups, native mixed state and page unions select only source IDs", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const north = grid.getByRole("checkbox", {
      name: "Select subtree North",
      exact: true,
    }),
    header = grid.getByRole("checkbox", {
      name: "Select page subtrees",
      exact: true,
    });
  await north.check();
  await expect.poll(async () => (await selected(region)).length).toBe(200);
  expect((await selected(region)).every((id) => /^h\d+$/.test(id))).toBe(true);
  await expect(header).toHaveJSProperty("indeterminate", true);
  await region
    .getByRole("button", { name: "Select South record", exact: true })
    .click();
  await expect.poll(async () => (await selected(region)).length).toBe(201);
  await region
    .getByRole("button", { name: "Expand hierarchy", exact: true })
    .click();
  expect(await grid.getByRole("row").count()).toBeLessThan(40);
  await expect(header).toBeChecked();
  await header.uncheck();
  expect(await selected(region)).toEqual(["h201"]);
  await header.check();
  await expect.poll(async () => (await selected(region)).length).toBe(201);
  await region
    .getByRole("button", { name: "Collapse hierarchy", exact: true })
    .click();
  await expect(header).toHaveJSProperty("indeterminate", true);
  await header.click();
  await expect.poll(async () => (await selected(region)).length).toBe(600);
  await header.uncheck();
  expect(await selected(region)).toEqual([]);
  expect(errors).toEqual([]);
});

test("filtered subtree commands retain hidden selections and preserve focused mixed checkboxes through locale/RTL", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Select South record", exact: true })
    .click();
  await region
    .getByRole("combobox", { name: "Hierarchy selection scope", exact: true })
    .selectOption("filteredSubtree");
  await region
    .getByRole("spinbutton", { name: "Hierarchy minimum amount", exact: true })
    .fill("8");
  const north = grid.getByRole("checkbox", {
    name: "Select subtree North",
    exact: true,
  });
  await north.check();
  await expect.poll(async () => (await selected(region)).length).toBe(61);
  expect(await selected(region)).toContain("h201");
  await north.uncheck();
  expect(await selected(region)).toEqual(["h201"]);
  await region
    .getByRole("combobox", { name: "Hierarchy selection scope", exact: true })
    .selectOption("subtree");
  await north.check();
  await expect.poll(async () => (await selected(region)).length).toBe(201);
  await region
    .getByRole("combobox", { name: "Hierarchy selection scope", exact: true })
    .selectOption("filteredSubtree");
  await north.uncheck();
  await expect.poll(async () => (await selected(region)).length).toBe(141);
  await region
    .getByRole("spinbutton", { name: "Hierarchy minimum amount", exact: true })
    .fill("");
  await expect(north).toHaveJSProperty("indeterminate", true);
  await north.focus();
  await north.evaluate((node) => {
    (window as unknown as { hierarchyBox: Element }).hierarchyBox = node;
  });
  await north.press("Control+Shift+L");
  const translated = grid.getByRole("checkbox", {
    name: "Seleccionar subárbol North",
    exact: true,
  });
  await translated.press("Control+Shift+D");
  await expect(grid).toHaveAttribute("dir", "rtl");
  await expect(translated).toBeFocused();
  await expect(translated).toHaveAttribute("aria-checked", "mixed");
  expect(
    await translated.evaluate(
      (node) =>
        node === (window as unknown as { hierarchyBox: Element }).hierarchyBox,
    ),
  ).toBe(true);
  expect((await selected(region)).length).toBe(141);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await region.evaluate(async (node) =>
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
  await region.screenshot({ path: ".npm-cache/hierarchy-rtl.png" });
  expect(errors).toEqual([]);
});

test("source-backed tree ancestors use actual filter eligibility and Space has subtree semantics", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Use tree hierarchy", exact: true })
    .click();
  await region
    .getByRole("combobox", { name: "Hierarchy selection scope", exact: true })
    .selectOption("filteredSubtree");
  await region
    .getByRole("spinbutton", { name: "Hierarchy minimum amount", exact: true })
    .fill("8");
  const root = grid.getByRole("checkbox", {
    name: "Select subtree Root",
    exact: true,
  });
  await root.check();
  await expect.poll(async () => (await selected(region)).length).toBe(9);
  expect(await selected(region)).not.toContain("root");
  expect(await selected(region)).not.toContain("branch");
  await region
    .getByRole("combobox", { name: "Hierarchy selection scope", exact: true })
    .selectOption("subtree");
  await expect(root).toHaveJSProperty("indeterminate", true);
  const cell = grid
    .getByRole("row")
    .filter({
      has: page.getByRole("checkbox", {
        name: "Select subtree Root",
        exact: true,
      }),
    })
    .locator('[role="gridcell"][data-column-id]')
    .first();
  await cell.focus();
  await cell.press("Space");
  await expect.poll(async () => (await selected(region)).length).toBe(32);
  expect(await selected(region)).toEqual(
    expect.arrayContaining(["root", "branch", "t1", "t30"]),
  );
  await expect(cell).toBeFocused();
  await cell.press("Space");
  expect(await selected(region)).toEqual([]);
  expect(errors).toEqual([]);
});
