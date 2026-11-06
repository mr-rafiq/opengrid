import { test, expect } from "@playwright/test";
for (const width of [320, 1440])
  for (const theme of ["light", "dark"] as const)
    for (const filtered of [false, true])
      test(`source aggregate stage ${width}px ${theme} filtered=${filtered}: retained membership,sorting,selection and full refresh`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto("./#legacy-react-bridge");
        await page
          .getByRole("button", { name: "Legacy React bridge lab", exact: true })
          .click();
        const lab = page.getByRole("article", {
            name: "Experimental legacy React bridge",
          }),
          grid = lab.getByRole("treegrid");
        await lab
          .getByRole("button", { name: "Load source records", exact: true })
          .click();
        if (filtered) {
          await grid
            .getByRole("button", { name: "Expand Planning", exact: true })
            .click();
          await expect(grid.getByText("Line A", { exact: true })).toBeVisible();
          await lab
            .getByRole("button", {
              name: "Amounts at least EUR 100",
              exact: true,
            })
            .click();
          await expect(grid.getByText("Line A", { exact: true })).toHaveCount(
            0,
          );
        }
        await lab
          .locator("summary")
          .filter({ hasText: "Retained-record refresh example" })
          .click();
        await lab
          .getByRole("button", { name: "Set sample A to EUR 300", exact: true })
          .click();
        const order = () =>
          grid
            .locator(
              '[data-column-id="item"][data-row-id="A"], [data-column-id="item"][data-row-id="B"]',
            )
            .allTextContents();
        await expect
          .poll(order)
          .toEqual(filtered ? ["Line B"] : ["Line A", "Line B"]);
        await grid
          .getByRole("checkbox", { name: "Select B", exact: true })
          .check();
        await lab
          .getByRole("button", {
            name: "Refresh aggregates and sort",
            exact: true,
          })
          .click();
        await expect
          .poll(order)
          .toEqual(filtered ? ["Line B"] : ["Line B", "Line A"]);
        await expect(
          lab.getByRole("status", { name: "Source summary" }),
        ).toContainText("1 selected");
        await lab.screenshot({
          path: info.outputPath(
            `aggregate-stage-${width}-${theme}-${filtered}.png`,
          ),
        });
        await lab
          .getByRole("button", { name: "Refresh source model", exact: true })
          .click();
        await expect.poll(order).toEqual(["Line B", "Line A"]);
        await expect(
          grid.locator('[data-row-id="A"][data-column-id="amount"]'),
        ).toContainText("300,00");
        await expect(
          grid.getByRole("checkbox", { name: "Select B", exact: true }),
        ).toBeChecked();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
      });
