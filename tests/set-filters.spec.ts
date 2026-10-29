import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set-filter lab", exact: true })
    .click();
  return {
    lab: page.locator(".set-filter-lab"),
    grid: page.getByRole("grid", { name: "Set-filter records" }),
    errors,
  };
}

test("set-list drafts are paged, search-scoped and applied only on request", async ({
  page,
}) => {
  const { lab, grid, errors } = await setup(page);
  const launcher = grid.getByRole("button", {
    name: "Filter Tag",
    exact: true,
  });
  await launcher.click();
  let dialog = page.getByRole("dialog", {
    name: "Values for Tag",
    exact: true,
  });
  await expect(dialog.getByRole("checkbox")).toHaveCount(51);
  await expect(dialog).toContainText("Page 1 of 3");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Page 2 of 3");
  await dialog.getByRole("checkbox", { name: /Tag 051/ }).uncheck();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Page 3 of 3");
  await expect(dialog.getByRole("checkbox")).toHaveCount(21);
  await expect(
    dialog.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await expect(lab.getByRole("status").first()).toContainText(
    "240 matching records",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.press("Enter");
  dialog = page.getByRole("dialog", { name: "Values for Tag", exact: true });
  await dialog
    .getByRole("textbox", { name: "Search values", exact: true })
    .fill("Tag 0");
  await dialog
    .getByRole("checkbox", { name: "Select all matching values", exact: true })
    .uncheck();
  await expect(dialog).toContainText("21 of 120 values selected");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(lab.getByRole("status").first()).toContainText(
    "42 matching records",
  );
  await launcher.click();
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(lab.getByRole("status").first()).toContainText(
    "42 matching records",
  );
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(lab.getByRole("status").first()).toContainText(
    "240 matching records",
  );
  expect(errors).toEqual([]);
});

test("incoming resident values reconcile drafts and external filter changes require reload", async ({
  page,
}) => {
  const { lab, grid, errors } = await setup(page);
  await lab
    .getByRole("button", { name: "Queue source update", exact: true })
    .click();
  await grid
    .getByRole("button", { name: "Filter Category", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Values for Category",
    exact: true,
  });
  await dialog.getByRole("checkbox", { name: /Home/ }).uncheck();
  const search = dialog.getByRole("textbox", {
    name: "Search values",
    exact: true,
  });
  await search.focus();
  const node = await search.elementHandle();
  await expect(
    dialog.getByRole("checkbox", { name: /New category/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: /New category/ }),
  ).not.toBeChecked();
  await expect(search).toBeFocused();
  expect(
    await node!.evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await expect(dialog.getByRole("checkbox", { name: /office/i })).toBeChecked();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(lab.getByRole("status").first()).toContainText(
    "191 matching records",
  );
  await lab
    .getByRole("button", { name: "Reset set-filter example", exact: true })
    .click();
  await lab
    .getByRole("button", { name: "Queue filter conflict", exact: true })
    .click();
  await grid
    .getByRole("button", { name: "Filter Category", exact: true })
    .click();
  await dialog.getByRole("checkbox", { name: /Home/ }).uncheck();
  await expect(dialog.getByRole("alert")).toContainText(
    "applied filter changed",
  );
  await expect(
    dialog.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Reload applied filter", exact: true })
    .click();
  await expect(dialog.getByRole("checkbox", { name: /Field/ })).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: /office/i }),
  ).not.toBeChecked();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(lab.getByRole("status").first()).toContainText(
    "48 matching records",
  );
  expect(errors).toEqual([]);
});

test.describe("native touch set-list dialog", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 640, height: 900 },
  });
  test("Spanish RTL choices retain exact integer identities and modal focus through virtual scrolling", async ({
    page,
  }) => {
    const { lab, grid, errors } = await setup(page);
    await lab
      .getByRole("button", { name: "Use Spanish filters", exact: true })
      .tap();
    await lab
      .getByRole("button", { name: "Use RTL filters", exact: true })
      .tap();
    await expect(grid).toHaveAttribute("dir", "rtl");
    await grid
      .getByRole("button", { name: "Filtrar Budget", exact: true })
      .tap();
    const dialog = page.getByRole("dialog", {
      name: "Valores de Budget",
      exact: true,
    });
    const search = dialog.getByRole("textbox", {
      name: "Buscar valores",
      exact: true,
    });
    await expect(search).toBeFocused();
    const original = await search.elementHandle();
    await search.press("Control+Shift+D");
    await expect(grid).toHaveAttribute("dir", "ltr");
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
      true,
    );
    await expect(search).toBeFocused();
    await search.press("Control+Shift+D");
    await expect(grid).toHaveAttribute("dir", "rtl");
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
      true,
    );
    await grid.evaluate((element) => {
      element.scrollLeft = -1300;
    });
    await expect(search).toBeFocused();
    expect(
      await original!.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await expect(
      dialog.getByRole("checkbox", { name: /9007199254740993/ }),
    ).toHaveCount(1);
    await expect(
      dialog.getByRole("checkbox", { name: /9007199254740995/ }),
    ).toHaveCount(1);
    await dialog
      .getByRole("checkbox", {
        name: "Seleccionar todos los valores coincidentes",
        exact: true,
      })
      .tap();
    await dialog.getByRole("checkbox", { name: /9007199254740995/ }).tap();
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
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(640 - 24);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    await dialog.screenshot({
      path: test.info().outputPath("set-list-es-rtl.png"),
    });
    await dialog.getByRole("button", { name: "Aplicar", exact: true }).tap();
    await expect(lab.getByRole("status").first()).toContainText(
      "120 matching records",
    );
    expect(errors).toEqual([]);
  });
});
