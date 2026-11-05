import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
for (const width of [320, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`source overlays ${width}px ${theme}: pointer blocking, nullable records, locale, custom content and resize`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("./#legacy-react-bridge");
      const launcher = page.getByRole("button", {
        name: "Legacy React bridge lab",
        exact: true,
      });
      await launcher.click();
      const lab = page.getByRole("article", {
        name: "Experimental legacy React bridge",
      });
      await lab
        .locator("summary")
        .filter({ hasText: "Source loading overlay example" })
        .click();
      const example = lab.getByRole("region", {
        name: "Source loading overlay example",
      });
      const grid = example.getByRole("grid");
      const overlay = example.locator("[data-og-source-overlay]");
      const visibleMessages = example
        .locator(".og-source-client")
        .getByRole("status")
        .filter({ hasText: /\S/ });
      await expect(overlay).toHaveText("Loading estimate...");
      await expect(visibleMessages).toHaveCount(1);
      await expect(grid).toHaveAttribute("aria-busy", "true");
      await example
        .getByRole("button", { name: "Load overlay records" })
        .click();
      await expect(overlay).toHaveCount(0);
      await expect(
        example.getByRole("status", { name: "Overlay record summary" }),
      ).toHaveText("2 resident rows");
      const header = grid.locator(
        '[role="columnheader"][data-og-size-column-id="item"]',
      );
      const loading = example.getByRole("button", {
        name: "Show loading overlay",
      });
      await loading.focus();
      await page.keyboard.press("Enter");
      await expect(loading).toBeFocused();
      await expect(overlay).toHaveText("Loading estimate...");
      await example.scrollIntoViewIfNeeded();
      await header.scrollIntoViewIfNeeded();
      const box = await header.boundingBox();
      const originalSort = await header.getAttribute("aria-sort");
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      expect(await header.getAttribute("aria-sort")).toBe(originalSort);
      await example
        .getByRole("button", { name: "Set null row option" })
        .click();
      await expect(
        example.getByRole("status", { name: "Overlay record summary" }),
      ).toHaveText("2 resident rows");
      await expect(overlay).toBeVisible();
      const before = await grid.boundingBox();
      await example
        .getByRole("button", { name: "Compact overlay host" })
        .click();
      await expect
        .poll(async () => (await grid.boundingBox())!.height)
        .toBeLessThan(before!.height - 80);
      const bounds = await overlay.boundingBox(),
        frame = await grid.boundingBox();
      expect(Math.abs(bounds!.height - frame!.height)).toBeLessThan(2);
      expect(Math.abs(bounds!.width - frame!.width)).toBeLessThan(2);
      await example
        .getByRole("checkbox", { name: "Custom loading component" })
        .check();
      await example
        .getByRole("combobox", { name: "Overlay language" })
        .selectOption("de");
      await expect(overlay).toHaveText("Lokale Daten werden vorbereitet...");
      await expect(grid).toHaveAttribute("aria-busy", "true");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await example.screenshot({
        path: info.outputPath(`overlay-${width}-${theme}.png`),
      });
      await page.addScriptTag({
        content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
      });
      const violations = await overlay.evaluate(async (element) =>
        (await (window as any).axe.run(element)).violations.map((v: any) => ({
          id: v.id,
          impact: v.impact,
        })),
      );
      expect(violations).toEqual([]);
      const hide = example.getByRole("button", { name: "Hide source overlay" });
      await hide.focus();
      await page.keyboard.press("Enter");
      await expect(overlay).toHaveCount(0);
      await expect(grid).not.toHaveAttribute("aria-busy");
      await expect(
        grid.getByRole("gridcell", { name: "Planning", exact: true }),
      ).toBeVisible();
      await example
        .getByRole("button", { name: "Clear overlay records" })
        .click();
      await expect(overlay).toHaveText("Keine Datensätze");
      await expect(
        example.getByRole("status", { name: "Overlay record summary" }),
      ).toHaveText("0 resident rows");
      await expect(overlay).toHaveCSS("pointer-events", "none");
      await expect(visibleMessages).toHaveCount(1);
      await hide.click();
      await expect(overlay).toHaveCount(0);
      await expect(visibleMessages).toHaveCount(0);
      await example.screenshot({
        path: info.outputPath(`empty-hidden-${width}-${theme}.png`),
      });
      await example
        .getByRole("button", { name: "Load overlay records" })
        .click();
      await expect(overlay).toHaveCount(0);
      await loading.click();
      await launcher.click();
      await expect(example).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
