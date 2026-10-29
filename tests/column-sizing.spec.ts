import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Column sizing lab", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Column sizing example",
    exact: true,
  });
  const grid = region.getByRole("grid", {
    name: "Sizing inventory",
    exact: true,
  });
  return { region, grid, errors };
}
const header = (grid: Locator, id: string) =>
  grid.locator(`[role="columnheader"][data-og-size-column-id="${id}"]`);
async function widths(grid: Locator) {
  return grid
    .locator('[role="columnheader"][data-og-size-column-id]')
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => [
          (element as HTMLElement).dataset.ogSizeColumnId!,
          element.getBoundingClientRect().width,
        ]),
      ),
    );
}

test("a newer fit command owns the demo report after cancelling pending text measurement", async ({
  page,
}) => {
  const { region, errors } = await setup(page);
  await region.evaluate((element) => {
    const buttons = [...element.querySelectorAll("button")];
    buttons
      .find((button) => button.textContent?.trim() === "Fit description")!
      .click();
    buttons
      .find((button) => button.textContent?.trim() === "Size to grid")!
      .click();
  });
  await expect(region.getByTestId("sizing-report")).toContainText(
    '"allocation"',
  );
  expect(errors).toEqual([]);
});

test("size-to-grid uses configured proportions, fixes exclusions, survives RTL and resets to flex", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const report = region.getByTestId("sizing-report");
  const fit = region.getByRole("button", { name: "Size to grid", exact: true });
  await fit.click();
  let result = JSON.parse(await report.innerText());
  const first = result.widths;
  expect(result.result.cancelled).toBe(false);
  expect(result.result.allocation.overflow).toBe(0);
  expect(result.result.allocation.unusedWidth).toBeCloseTo(0, 6);
  expect(first.amount).toBe(320);
  expect(first.description / first.record).toBeCloseTo(1.6, 6);
  for (const [id, width] of Object.entries(first))
    expect((await widths(grid))[id]).toBeCloseTo(width as number, 0);
  const separator = grid.getByRole("separator", {
    name: "Resize Description",
    exact: true,
  });
  await separator.focus();
  await separator.press("ArrowRight");
  await fit.click();
  expect(JSON.parse(await report.innerText()).widths).toEqual(first);
  await region
    .getByRole("button", { name: "Direction RTL", exact: true })
    .click();
  await fit.click();
  expect(JSON.parse(await report.innerText()).widths).toEqual(first);
  await region
    .getByRole("button", { name: "Container 640px", exact: true })
    .click();
  await region
    .getByRole("button", { name: "Read widths", exact: true })
    .click();
  expect(JSON.parse(await report.innerText()).widths).toEqual(first);
  await fit.click();
  result = JSON.parse(await report.innerText());
  expect(result.widths.record).toBeLessThan(first.record);
  expect(result.widths.description).toBeCloseTo(result.widths.amount, 8);
  expect(result.result.allocation.totalWidth).toBe(
    await grid.evaluate((node) => node.clientWidth),
  );
  const fixedRecord = result.widths.record;
  await region
    .getByRole("button", { name: "Size keeping Record", exact: true })
    .click();
  expect(JSON.parse(await report.innerText()).widths.record).toBe(fixedRecord);
  await region
    .getByRole("button", { name: "Reset widths", exact: true })
    .click();
  result = JSON.parse(await report.innerText());
  expect(result.manual).toEqual({});
  expect(result.widths.record).toBe(100);
  expect(result.widths.description).toBeCloseTo(result.widths.amount * 2, 8);
  await region.screenshot({ path: "test-results/sizing-fit-rtl.png" });
  expect(errors).toEqual([]);
});

test("size-to-grid includes visible columns outside the mounted horizontal window", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Distant columns", exact: true })
    .click();
  expect(
    await grid.locator('[role="columnheader"][data-og-size-column-id]').count(),
  ).toBeLessThan(15);
  await region
    .getByRole("button", { name: "Size to grid", exact: true })
    .click();
  const result = JSON.parse(
    await region.getByTestId("sizing-report").innerText(),
  );
  expect(Object.keys(result.manual)).toHaveLength(15);
  expect(result.result.allocation.columnIds).toHaveLength(15);
  expect(result.manual.extra11).toBeGreaterThanOrEqual(40);
  expect(result.result.allocation.overflow).toBe(0);
  expect(result.result.allocation.totalWidth).toBeCloseTo(
    await grid.evaluate((node) => node.clientWidth),
    8,
  );
  expect(errors).toEqual([]);
});
test("flex follows real container space, preserves physical pins in RTL and restores after keyboard resize", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await expect
    .poll(async () => (await widths(grid)).description)
    .toBeGreaterThan(400);
  const first = await widths(grid);
  expect(Math.abs(first.description - first.amount * 2)).toBeLessThan(1);
  await region
    .getByRole("button", { name: "Container 640px", exact: true })
    .click();
  await expect
    .poll(async () => (await widths(grid)).description)
    .toBeLessThan(first.description);
  await region
    .getByRole("button", { name: "Read widths", exact: true })
    .click();
  const before = JSON.parse(
    await region.getByTestId("sizing-report").innerText(),
  );
  expect(before.manual).toEqual({});
  await region
    .getByRole("button", { name: "Direction RTL", exact: true })
    .click();
  await expect(grid).toHaveAttribute("dir", "rtl");
  await expect
    .poll(async () => (await widths(grid)).description)
    .toBeCloseTo(before.widths.description, 0);
  const record = await header(grid, "record").boundingBox(),
    amount = await header(grid, "amount").boundingBox();
  expect(record!.x).toBeLessThan(amount!.x);
  const separator = grid.getByRole("separator", {
    name: "Resize Description",
    exact: true,
  });
  await separator.focus();
  await separator.press("ArrowLeft");
  await region
    .getByRole("button", { name: "Read widths", exact: true })
    .click();
  const manual = JSON.parse(
    await region.getByTestId("sizing-report").innerText(),
  );
  expect(manual.manual.description).toBeCloseTo(
    before.widths.description + 10,
    0,
  );
  await region
    .getByRole("button", { name: "Reset widths", exact: true })
    .click();
  await expect
    .poll(async () => (await widths(grid)).description)
    .toBeCloseTo(before.widths.description, 0);
  const resetReport = JSON.parse(
    await region.getByTestId("sizing-report").innerText(),
  );
  expect(resetReport.widths.description).toBeCloseTo(
    (await widths(grid)).description,
    0,
  );
  expect(resetReport.manual).toEqual({});
  expect(errors).toEqual([]);
});
test("autosizes only rendered default text, then measures an offscreen long value after scrolling", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await region
    .getByRole("button", { name: "Fit description", exact: true })
    .click();
  const report = region.getByTestId("sizing-report");
  await expect(report).toContainText('"cancelled": false');
  const first = JSON.parse(await report.innerText());
  expect(first.result.measured[0].cellSamples).toBeGreaterThan(0);
  expect(first.result.measured[0].cellSamples).toBeLessThan(50);
  expect(first.result.measured[0].headerSamples).toBe(1);
  expect(first.manual.description).toBeLessThan(250);
  await grid.evaluate((element) => {
    element.scrollTop = 399 * 38;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(
    grid.locator('[data-row-id="size400"][data-column-id="description"]'),
  ).toContainText("deliberately long offscreen");
  await region
    .getByRole("button", { name: "Fit description", exact: true })
    .click();
  await expect
    .poll(async () => JSON.parse(await report.innerText()).widths.description)
    .toBeGreaterThan(first.widths.description * 2);
  const second = JSON.parse(await report.innerText());
  expect(second.widths.description).toBeLessThanOrEqual(720);
  expect(second.result.cancelled).toBe(false);
  await region
    .getByRole("button", { name: "Distant columns", exact: true })
    .click();
  await region
    .getByRole("button", { name: "Fit rendered columns", exact: true })
    .click();
  await expect(report).toContainText('"cancelled": false');
  const distant = JSON.parse(await report.innerText());
  expect(
    distant.result.measured.length + distant.result.unchanged.length,
  ).toBeLessThan(15);
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await region.evaluate(async (element) => {
    const result = await (window as any).axe.run(element);
    return result.violations
      .filter(
        (item: any) => item.impact === "serious" || item.impact === "critical",
      )
      .map((item: any) => item.id);
  });
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
  await region.screenshot({ path: "test-results/sizing-rendered.png" });
  const committedWidth = distant.manual.description;
  await page.evaluate(() => {
    document.body.style.transform = "scale(.8)";
  });
  await region
    .getByRole("button", { name: "Fit description", exact: true })
    .click();
  await expect
    .poll(async () => JSON.parse(await report.innerText()).result.skipped)
    .toEqual([{ columnId: "description", reason: "not-measurable" }]);
  expect(JSON.parse(await report.innerText()).manual.description).toBe(
    committedWidth,
  );
  await page.evaluate(() => {
    document.body.style.transform = "";
  });
  expect(errors).toEqual([]);
});
test("container changes cancel a held resize and keep uncommitted flex widths out of model state", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  const separator = grid.getByRole("separator", {
    name: "Resize Description",
    exact: true,
  });
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 50, box.y + box.height / 2);
  await region
    .getByRole("button", { name: "Container 640px", exact: true })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect
    .poll(async () => (await widths(grid)).description)
    .toBeLessThan(400);
  await page.mouse.up();
  await region
    .getByRole("button", { name: "Read widths", exact: true })
    .click();
  expect(
    JSON.parse(await region.getByTestId("sizing-report").innerText()).manual,
  ).toEqual({});
  expect(errors).toEqual([]);
});
