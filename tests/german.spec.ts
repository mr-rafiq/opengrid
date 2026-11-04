import { test, expect } from "@playwright/test";
import { gridRoot } from "./grid-root.js";
import { readFileSync } from "node:fs";
test("German controls retain an active draft, source data and undo across language changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Localization lab", exact: true })
    .click();
  const grid = page.getByRole("grid", { name: "Localized inventory" });
  const root = gridRoot(grid),
    cell = grid.locator('[data-row-id="locale1"][data-column-id="item"]');
  await cell.dblclick();
  const editor = cell.getByRole("textbox");
  await editor.fill("Beibehaltener Entwurf");
  const original = await editor.elementHandle();
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await expect(root).toHaveAttribute("lang", "de-DE");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("Beibehaltener Entwurf");
  expect(
    await original!.evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await editor.press("Enter");
  await expect(cell).toHaveText("Beibehaltener Entwurf");
  await root.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(cell).toHaveText("Notebook");
  expect(errors).toEqual([]);
});
test("German calculation currency, menus and sidebar filters keep numeric semantics", async ({
  page,
}) => {
  await page.goto("./#calculation");
  await page
    .getByRole("button", { name: "Calculation workspace lab", exact: true })
    .click();
  const article = page.getByRole("article", {
    name: "Calculation workspace example",
  });
  const grid = article.getByRole("treegrid", { name: "Synthetic estimate" }),
    root = gridRoot(grid);
  await article
    .getByRole("combobox", { name: "Calculation interface language" })
    .selectOption("de");
  await expect(root).toHaveAttribute("lang", "de-DE");
  const amount = grid.locator('[data-row-id="est-1"][data-column-id="amount"]');
  await expect(amount).toHaveText(/432,00\s*€/u);
  const quantity = grid.locator(
    '[data-row-id="est-1"][data-column-id="quantity"]',
  );
  await quantity.dblclick();
  const editor = grid.getByRole("spinbutton");
  await editor.fill("10");
  await editor.press("Enter");
  await expect(amount).toHaveText(/540,00\s*€/u);
  await root.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(amount).toHaveText(/432,00\s*€/u);
  await expect(article.getByLabel("Estimate source values")).toContainText(
    "est-1:8:54",
  );
  await expect(
    article.getByRole("option", { name: "Durchschnitt", exact: true }).first(),
  ).toHaveAttribute("value", "avg");
  const menuTrigger = grid.getByRole("button", {
    name: "Spaltenmenü für Amount",
    exact: true,
  });
  await menuTrigger.click();
  await page
    .getByRole("menu", { name: "Spaltenbefehle für Amount", exact: true })
    .getByRole("menuitem", { name: "Aufsteigend sortieren", exact: true })
    .click();
  await expect(
    menuTrigger.locator("xpath=ancestor::*[@role='columnheader'][1]"),
  ).toHaveAttribute("aria-sort", "ascending");
  await article.getByRole("tab", { name: "Filter", exact: true }).click();
  await article
    .getByRole("button", { name: "Filter: Amount", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bedingungen für Amount",
    exact: true,
  });
  await expect(dialog).toHaveAccessibleName("Bedingungen für Amount");
  await dialog
    .getByRole("combobox", { name: "Operator für Bedingung 1", exact: true })
    .selectOption("gt");
  await dialog
    .getByRole("textbox", { name: "Wert für Bedingung 1", exact: true })
    .fill("800");
  await dialog
    .getByRole("button", { name: "Bedingungen anwenden", exact: true })
    .click();
  await expect(article.getByLabel("Filtered estimate total")).toContainText(
    /4\.628,00\s*€/u,
  );
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await article.evaluate(async (target) => {
    const axe = (
      window as unknown as {
        axe: {
          run(element: Element): Promise<{
            violations: {
              id: string;
              impact: string;
              nodes: { html: string; target: string[] }[];
            }[];
          }>;
        };
      }
    ).axe;
    return (await axe.run(target)).violations
      .filter((item) => ["serious", "critical"].includes(item.impact))
      .map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => ({
          html: node.html,
          target: node.target,
        })),
      }));
  });
  expect(violations).toEqual([]);
});
for (const width of [320, 390])
  test(`German workspace phone controls fit ${width}px in both themes`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./#calculation");
    await page
      .getByRole("button", { name: "Calculation workspace lab", exact: true })
      .click();
    await page.addScriptTag({
      content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
    });
    const article = page.getByRole("article", {
      name: "Calculation workspace example",
    });
    await article
      .getByRole("combobox", { name: "Calculation interface language" })
      .selectOption("de");
    for (const mode of ["light", "dark"]) {
      await page
        .getByRole("combobox", { name: "Color theme", exact: true })
        .selectOption(mode);
      const launch = article.getByRole("button", {
        name: "Tabellenbereiche öffnen",
        exact: true,
      });
      await launch.click();
      const drawer = page.getByRole("dialog", {
        name: "Tabellenbereiche",
        exact: true,
      });
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole("tab", { name: "Spalten", exact: true }),
      ).toBeVisible();
      const violations = await drawer.evaluate(async (target) => {
        const axe = (
          window as unknown as {
            axe: {
              run: (element: Element) => Promise<{
                violations: {
                  id: string;
                  impact: string;
                  nodes: { html: string; target: string[] }[];
                }[];
              }>;
            };
          }
        ).axe;
        return (await axe.run(target)).violations
          .filter((item) => ["serious", "critical"].includes(item.impact))
          .map((item) => ({
            id: item.id,
            nodes: item.nodes.map((node) => ({
              html: node.html,
              target: node.target,
            })),
          }));
      });
      expect(violations).toEqual([]);
      await drawer.screenshot({
        path: info.outputPath(`de-${width}-${mode}-drawer.png`),
      });
      await page.keyboard.press("Escape");
      await expect(launch).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await article.screenshot({
        path: info.outputPath(`de-${width}-${mode}.png`),
      });
    }
    expect(errors).toEqual([]);
  });
