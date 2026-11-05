import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const mode of ["light", "dark"] as const)
    test(`source host fills flex parent ${width} ${mode}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: mode });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .click();
      await page
        .getByRole("article", { name: "Experimental legacy React bridge" })
        .locator("summary")
        .filter({ hasText: "Source host layout example" })
        .click();
      const lab = page.getByRole("region", {
          name: "Source host layout example",
        }),
        shell = lab.locator(".source-host-shell"),
        host = shell.locator(":scope > .source-host-grid"),
        grid = host.getByRole("grid", {
          name: "Source host records",
          exact: true,
        });
      await expect(grid).toBeVisible();
      const root = host.locator(".og-root");
      await lab
        .getByRole("combobox", { name: "Host grid palette", exact: true })
        .selectOption("light");
      await expect(host).toHaveAttribute("data-og-host-theme", "");
      await expect(root).toHaveCSS("background-color", "rgb(252, 252, 253)");
      await expect(root).toHaveCSS("color", "rgb(38, 51, 66)");
      await expect(root).toHaveCSS("font-size", "12px");
      await lab
        .getByRole("combobox", { name: "Host grid palette", exact: true })
        .selectOption("dark");
      await expect(root).toHaveCSS("background-color", "rgb(32, 37, 45)");
      await expect(root).toHaveCSS("color", "rgb(228, 234, 241)");
      await lab
        .getByRole("combobox", { name: "Host grid palette", exact: true })
        .selectOption("native");
      await expect(host).not.toHaveAttribute("data-og-host-theme", "");
      async function fitting() {
        return shell.evaluate((shell) => {
          const host = shell.querySelector(":scope > .source-host-grid")!,
            root = host.querySelector(".og-root")!,
            s = shell.getBoundingClientRect(),
            h = host.getBoundingClientRect(),
            r = root.getBoundingClientRect();
          return {
            hostParent: host.parentElement === shell,
            hostBottom: Math.abs(h.bottom - s.bottom) < 3,
            rootFits: r.bottom <= h.bottom + 2,
            filled: Math.abs(r.height - h.height) < 3,
          };
        });
      }
      await expect.poll(fitting).toEqual({
        hostParent: true,
        hostBottom: true,
        rootFits: true,
        filled: true,
      });
      await lab
        .getByRole("button", { name: "Shorter workspace", exact: true })
        .click();
      await expect(shell).toHaveCSS("height", "220px");
      await expect.poll(fitting).toEqual({
        hostParent: true,
        hostBottom: true,
        rootFits: true,
        filled: true,
      });
      await lab
        .getByRole("button", { name: "Taller workspace", exact: true })
        .click();
      await expect(shell).toHaveCSS("height", "520px");
      await expect.poll(fitting).toEqual({
        hostParent: true,
        hostBottom: true,
        rootFits: true,
        filled: true,
      });
      await grid.getByRole("gridcell", { name: "Line 1", exact: true }).click();
      await page.keyboard.press("Control+End");
      await expect(grid.getByText("Line 50", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await lab.screenshot({
        path: info.outputPath(`source-host-${width}-${mode}.png`),
      });
      await page.addScriptTag({
        content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
      });
      const violations = await lab.evaluate(async (element) => {
        const { violations } = await (
          window as unknown as {
            axe: {
              run(
                element: Element,
              ): Promise<{ violations: { id: string; impact: string }[] }>;
            };
          }
        ).axe.run(element);
        return violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => v.id);
      });
      expect(violations).toEqual([]);
      expect(errors).toEqual([]);
    });
