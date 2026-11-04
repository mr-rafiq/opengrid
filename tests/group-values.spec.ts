import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
const runtime = JSON.parse(
  fs.readFileSync("node_modules/react/package.json", "utf8"),
).version;
for (const width of [390, 1440])
  for (const mode of ["light", "dark"] as const)
    test(`keyed objects and generated values ${width} ${mode}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: mode });
      await page.goto(
        `/@fs/${path.resolve("tests/fixtures/group-values.html").replaceAll("\\", "/")}`,
      );
      const grid = page.getByRole("treegrid", { name: "Keyed group fixture" });
      await expect(grid).toBeVisible();
      const read = () => page.evaluate(() => window.__keyedGroups!.read());
      expect(await page.evaluate(() => window.__keyedGroups!.runtime)).toBe(
        info.project.metadata.expectedReact ?? runtime,
      );
      expect(await read()).toEqual({
        source: 120,
        instances: 120,
        filtered: 120,
        groups: 3,
        keys: ["A", "B", "C"],
        originalRows: true,
      });
      await page
        .getByRole("button", { name: "Sort totals descending", exact: true })
        .click();
      expect((await read()).keys).toEqual(["C", "B", "A"]);
      const groupCells = grid.locator(
        '.og-group-row .og-cell[data-column-id="business"]',
      );
      await expect(groupCells.first()).toContainText("Category C");
      await expect(groupCells.first()).toContainText("2.460,00");
      await page
        .getByRole("button", { name: "Filter last 20", exact: true })
        .click();
      expect(await read()).toEqual({
        source: 120,
        instances: 120,
        filtered: 20,
        groups: 3,
        keys: ["C", "B", "A"],
        originalRows: true,
      });
      await expect(groupCells.first()).toContainText("777,00");
      await page
        .getByRole("button", { name: "Metadata-only values", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Metadata-only values", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      expect((await read()).keys).toEqual(["C", "B", "A"]);
      await expect(groupCells.first()).toContainText("Category C");
      await grid
        .locator(".og-group-row")
        .first()
        .getByRole("button")
        .first()
        .click();
      await expect(
        grid.locator('[data-row-id="line-120"][data-column-id="business"]'),
      ).toContainText("120,00");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await grid.screenshot({
        path: info.outputPath(`keyed-groups-${width}-${mode}.png`),
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Clear filter", exact: true })
        .click();
      expect((await read()).filtered).toBe(120);
    });
