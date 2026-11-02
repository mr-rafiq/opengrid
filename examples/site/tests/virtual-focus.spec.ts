import { test, expect, type Locator } from "@playwright/test";
import fs from "node:fs/promises";

async function insideGrid(cell: Locator, grid: Locator) {
  const bounds = await cell.boundingBox(),
    frame = await grid.boundingBox();
  expect(bounds).not.toBeNull();
  expect(frame).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(frame!.x - 1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    frame!.x + frame!.width + 1,
  );
  expect(bounds!.y).toBeGreaterThanOrEqual(frame!.y - 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    frame!.y + frame!.height + 1,
  );
}

for (const preset of ["minimal", "material"] as const) {
  for (const appearance of ["light", "dark"] as const) {
    for (const width of [390, 1440]) {
      test(`virtual focus with forced colors/reduced motion: ${preset} ${appearance} ${width}px`, async ({
        page,
      }, info) => {
        test.setTimeout(90000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          forcedColors: "active",
          reducedMotion: "reduce",
          colorScheme: appearance,
        });
        await page.goto("showcase/");
        await page
          .getByRole("combobox", { name: "Grid style", exact: true })
          .selectOption(preset);
        await page
          .getByRole("combobox", { name: "Demo appearance", exact: true })
          .selectOption(appearance);
        const count =
          width === 1440 && preset === "minimal" && appearance === "light"
            ? 100000
            : 1000;
        await page
          .getByRole("combobox", { name: "Data size", exact: true })
          .selectOption(String(count));
        await expect(page.locator(".showcase-status")).toContainText(
          `${count.toLocaleString("en-US")} records`,
        );
        const grid = page.getByRole("grid", {
          name: "Participant showcase",
          exact: true,
        });
        const first = grid.locator(
          '[data-row-id="participant-1"][data-column-id="record"]',
        );
        const last = grid.locator(
          `[data-row-id="participant-${count}"][data-column-id="online"]`,
        );
        await first.focus();
        await first.press("Control+End");
        await expect(last).toBeFocused();
        await insideGrid(last, grid);
        expect(Number(await last.getAttribute("aria-colindex"))).toBe(
          Number(await grid.getAttribute("aria-colcount")),
        );
        expect(await grid.locator('.og-cell[tabindex="0"]').count()).toBe(1);
        expect(await grid.locator(".og-row").count()).toBeLessThan(80);
        expect(await grid.locator(".og-cell").count()).toBeLessThan(1000);
        const observationPath = info.outputPath(
          "virtual-focus-observation.json",
        );
        await fs.writeFile(
          observationPath,
          JSON.stringify(
            {
              preset,
              appearance,
              width,
              sourceRows: count,
              renderedRows: await grid.locator(".og-row").count(),
              renderedCells: await grid.locator(".og-cell").count(),
              forcedColors: true,
              reducedMotion: true,
              note: "Functional DOM/focus observation, not a latency or memory benchmark",
            },
            null,
            2,
          ) + "\n",
          "utf8",
        );
        await info.attach("virtual-focus-observation.json", {
          path: observationPath,
          contentType: "application/json",
        });
        const focus = await last.evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            outline: style.outlineStyle,
            width: parseFloat(style.outlineWidth),
            color: style.outlineColor,
            transition: style.transitionDuration,
            animation: style.animationName,
          };
        });
        expect(focus.outline).not.toBe("none");
        expect(focus.width).toBeGreaterThanOrEqual(2);
        expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
        expect(focus.transition).toBe("0s");
        expect(focus.animation).toBe("none");
        const screenshotPath = info.outputPath("virtual-end.png");
        await grid.screenshot({ path: screenshotPath });
        await info.attach("virtual-end.png", {
          path: screenshotPath,
          contentType: "image/png",
        });
        await last.press("Home");
        const rowStart = grid.locator(
          `[data-row-id="participant-${count}"][data-column-id="record"]`,
        );
        await expect(rowStart).toBeFocused();
        await insideGrid(rowStart, grid);
        await rowStart.press("Control+Home");
        await expect(first).toBeFocused();
        await insideGrid(first, grid);
        const trigger = grid.getByRole("button", {
          name: "Column menu for Name",
          exact: true,
        });
        await trigger.focus();
        await trigger.press("ArrowDown");
        const menu = page.getByRole("menu");
        await expect(
          menu.getByRole("menuitem", { name: "Sort ascending", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        const search = page.getByRole("searchbox", {
          name: "Search participants",
          exact: true,
        });
        await search.fill("Avery Morgan");
        await expect(search).toBeFocused();
        await expect(first).toBeVisible();
        await search.clear();
        await expect(search).toBeFocused();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        expect(errors).toEqual([]);
      });
    }
  }
}
