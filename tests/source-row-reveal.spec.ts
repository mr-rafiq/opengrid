import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`source row reveal ${width}px ${theme}: node, data and index align without stealing focus`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("./#legacy-react-bridge");
      await page
        .getByRole("button", { name: "Legacy React bridge lab", exact: true })
        .click();
      await page
        .locator("summary")
        .filter({ hasText: "Source scroll restoration example" })
        .click();
      const lab = page.getByRole("region", {
          name: "Source scroll restoration example",
          exact: true,
        }),
        grid = lab.getByRole("grid"),
        alignment = lab.getByRole("combobox", {
          name: "Reveal alignment",
          exact: true,
        }),
        byIndex = lab.getByRole("button", {
          name: "Reveal displayed row 250",
          exact: true,
        }),
        row = grid.getByText("Synthetic line 251", { exact: true });
      await grid
        .getByRole("checkbox", { name: "Select 1", exact: true })
        .check();
      await lab
        .getByRole("button", { name: "Scroll to middle", exact: true })
        .click();
      const left = await grid.evaluate((element) => element.scrollLeft);
      const geometry = () =>
        row.evaluate((element) => {
          const line = element.closest('[role="row"]')!.getBoundingClientRect(),
            viewport = element.closest<HTMLElement>(".og-viewport")!,
            header = viewport.querySelector<HTMLElement>(".og-header")!,
            start =
              viewport.getBoundingClientRect().top +
              viewport.clientTop +
              header.offsetHeight,
            height = viewport.clientHeight - header.offsetHeight;
          return {
            top: line.top - start,
            bottom: line.bottom - (start + height),
            middle: (line.top + line.bottom) / 2 - (start + height / 2),
          };
        });
      await byIndex.focus();
      await page.keyboard.press("Enter");
      await expect(row).toBeVisible();
      await expect(byIndex).toBeFocused();
      await expect
        .poll(async () => Math.abs((await geometry()).middle))
        .toBeLessThanOrEqual(2);
      const scroll = await grid.evaluate((element) => element.scrollTop);
      await alignment.selectOption("auto");
      await byIndex.click();
      expect(await grid.evaluate((element) => element.scrollTop)).toBe(scroll);
      await alignment.selectOption("top");
      await lab
        .getByRole("button", { name: "Reveal source node 251", exact: true })
        .click();
      await expect
        .poll(async () => Math.abs((await geometry()).top))
        .toBeLessThanOrEqual(2);
      await alignment.selectOption("bottom");
      await lab
        .getByRole("button", {
          name: "Reveal original record 251",
          exact: true,
        })
        .click();
      await expect
        .poll(async () => Math.abs((await geometry()).bottom))
        .toBeLessThanOrEqual(2);
      await lab
        .getByRole("button", { name: "Compact scroll host", exact: true })
        .click();
      await alignment.selectOption("middle");
      await byIndex.click();
      await expect
        .poll(async () => Math.abs((await geometry()).middle))
        .toBeLessThanOrEqual(2);
      expect(await grid.evaluate((element) => element.scrollLeft)).toBe(left);
      await grid.screenshot({
        path: info.outputPath(`row-reveal-${width}-${theme}.png`),
      });
      await lab.screenshot({
        path: info.outputPath(`row-reveal-controls-${width}-${theme}.png`),
      });
      await lab
        .getByRole("button", { name: "Scroll to start", exact: true })
        .click();
      await expect(
        grid.getByRole("checkbox", { name: "Select 1", exact: true }),
      ).toBeChecked();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
