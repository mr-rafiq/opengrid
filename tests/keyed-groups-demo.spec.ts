import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
for (const width of [320, 390, 1440])
  for (const mode of ["light", "dark"] as const)
    test(`class grouping demo ${width} ${mode}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("./#keyed-groups");
      await page
        .getByRole("button", { name: "Keyed class grouping lab", exact: true })
        .click();
      const region = page.getByRole("region", {
        name: "Keyed grouping example",
      });
      for (const button of await region
        .locator(".grouping-lab-controls button")
        .all())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const grid = region.getByRole("treegrid", {
        name: "Keyed class grouping",
      });
      await expect(grid).toBeVisible();
      await expect
        .poll(
          async () => {
            const frame = await grid.boundingBox(),
              budget = await grid
                .locator('.og-group-row [data-column-id="amount"]')
                .first()
                .boundingBox();
            return (
              !!frame &&
              !!budget &&
              budget.x >= frame.x &&
              budget.x + budget.width <= frame.x + frame.width + 1
            );
          },
          {
            message:
              "Both demo columns are initially reachable without horizontal scrolling",
          },
        )
        .toBe(true);
      await expect(region.getByLabel("Matching work items")).toHaveText(
        "24 matching work items",
      );
      await expect(grid.locator(".og-group-row")).toHaveCount(3);
      await region
        .getByRole("button", { name: "Sort group totals", exact: true })
        .click();
      const groups = grid.locator(".og-group-row");
      await expect(groups.first()).toContainText("Team C");
      await expect(groups.first()).toContainText("2.700,00");
      const filter = region.getByRole("button", {
        name: "Show final six items",
        exact: true,
      });
      await filter.click();
      await expect(region.getByLabel("Matching work items")).toHaveText(
        "6 matching work items",
      );
      await expect(groups.first()).toContainText("1.125,00");
      await filter.press("Tab");
      await expect(
        region.getByRole("button", { name: "Show all items", exact: true }),
      ).toBeFocused();
      await groups.first().getByRole("button").first().click();
      const work = grid.locator('[data-row-id="24"][data-column-id="work"]');
      await expect(work).toHaveText("Work item 24");
      await work.focus();
      await work.press("ArrowRight");
      await expect(
        grid.locator('[data-row-id="24"][data-column-id="amount"]'),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await region.screenshot({
        path: info.outputPath(`keyed-demo-${width}-${mode}.png`),
        animations: "disabled",
      });
      await region
        .getByRole("button", { name: "Show all items", exact: true })
        .click();
      await expect(region.getByLabel("Matching work items")).toHaveText(
        "24 matching work items",
      );
      expect(errors).toEqual([]);
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as {
            axe: {
              run: (
                element: Element,
              ) => Promise<{ violations: { id: string; impact: string }[] }>;
            };
          }
        ).axe;
        return (
          await axe.run(document.querySelector(".keyed-groups-lab")!)
        ).violations.filter((v) => ["serious", "critical"].includes(v.impact));
      });
      expect(violations).toEqual([]);
    });
