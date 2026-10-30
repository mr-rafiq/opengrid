import { test, expect, type Locator, type Page } from "@playwright/test";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Remote model lab", exact: true })
    .click();
  const region = page.getByRole("article", {
    name: "Server note scope example",
  });
  const grid = region.getByRole("grid", {
    name: "Scoped server notes",
    exact: true,
  });
  await expect(
    grid.getByRole("button", { name: "Open group East", exact: true }),
  ).toBeVisible();
  return { region, grid, errors };
}
const cell = (grid: Locator, id = "shared") =>
  grid.locator(`[role="gridcell"][data-row-id="${id}"][data-column-id="name"]`);
async function open(page: Page, grid: Locator) {
  await cell(grid).focus();
  await cell(grid).press("Alt+n");
  return page.getByRole("textbox", { name: "Note text", exact: true });
}
async function save(page: Page, value: string) {
  await page
    .getByRole("textbox", { name: "Note text", exact: true })
    .fill(value);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Cell note", exact: true }),
  ).toBeHidden();
}

test("route-local notes remain isolated and survive returning through pages and breadcrumbs", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await open(page, grid);
  await save(page, "Root East note");
  await grid
    .getByRole("button", { name: "Open group East", exact: true })
    .click();
  await expect(cell(grid)).toContainText("East shared record");
  await expect(await open(page, grid)).toHaveValue("");
  await save(page, "East child note");
  await region
    .getByRole("button", { name: "Next server page", exact: true })
    .click();
  await expect(cell(grid, "third")).toContainText("East third record");
  await region
    .getByRole("button", { name: "Previous server page", exact: true })
    .click();
  await expect(cell(grid)).toContainText("East shared record");
  await expect(await open(page, grid)).toHaveValue("East child note");
  await save(page, "East child note");
  await region.getByRole("button", { name: "All groups", exact: true }).click();
  await expect(
    grid.getByRole("button", { name: "Open group East", exact: true }),
  ).toBeVisible();
  await expect(await open(page, grid)).toHaveValue("Root East note");
  await save(page, "Root East note");
  await grid
    .getByRole("button", { name: "Open group West", exact: true })
    .click();
  await expect(cell(grid)).toContainText("West shared record");
  await expect(await open(page, grid)).toHaveValue("");
  await save(page, "West child note");
  await page
    .getByRole("checkbox", { name: "Right-to-left remote grids", exact: true })
    .check();
  await expect(await open(page, grid)).toHaveValue("West child note");
  expect(errors).toEqual([]);
});

test("query changes select a fresh note namespace and provider replacement releases owned notes", async ({
  page,
}) => {
  const { region, grid, errors } = await setup(page);
  await grid
    .getByRole("button", { name: "Open group East", exact: true })
    .click();
  await expect(cell(grid)).toContainText("East shared record");
  await open(page, grid);
  await save(page, "Unsorted note");
  await grid.getByRole("button", { name: "Sort Record", exact: true }).click();
  await expect(await open(page, grid)).toHaveValue("");
  await save(page, "Sorted note");
  await region
    .getByRole("button", { name: "Reset note query", exact: true })
    .click();
  await expect(await open(page, grid)).toHaveValue("Unsorted note");
  await save(page, "Unsorted note");
  await region
    .getByRole("button", { name: "Replace note provider", exact: true })
    .click();
  await expect(
    region.getByText("Note provider 2", { exact: true }),
  ).toContainText("Note provider 2");
  await expect(cell(grid)).toContainText("East shared record");
  if (
    await page
      .getByRole("dialog", { name: "Cell note", exact: true })
      .isVisible()
  ) {
    await expect(
      page.getByRole("textbox", { name: "Note text", exact: true }),
    ).toHaveValue("");
  } else await expect(await open(page, grid)).toHaveValue("");
  expect(errors).toEqual([]);
});
