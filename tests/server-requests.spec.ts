import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Remote model lab", exact: true })
    .click();
  const article = page.getByRole("article", {
    name: "Bounded server requests example",
    exact: true,
  });
  const active = article.locator(
      'output[aria-label="Active server provider calls"]',
    ),
    canceled = article.locator(
      'output[aria-label="Canceled server provider calls"]',
    ),
    pending = article.locator('output[aria-label="Pending server requests"]');
  await expect(active).toHaveText("1");
  await expect(pending).toHaveText("1");
  const grid = article.getByRole("grid", {
    name: "Bounded server root",
    exact: true,
  });
  const settle = article.getByRole("button", {
    name: "Settle next server response",
    exact: true,
  });
  return { article, active, canceled, pending, grid, settle, errors };
}

test("real queued calls keep canceled provider slots until responses settle", async ({
  page,
}) => {
  const { article, active, canceled, pending, grid, settle, errors } =
    await setup(page);
  await article
    .getByRole("button", { name: "Queue six server routes", exact: true })
    .click();
  await expect(active).toHaveText("2");
  await expect(pending).toHaveText("7");
  await article
    .getByRole("button", { name: "Cancel server query", exact: true })
    .click();
  await expect(active).toHaveText("2");
  await expect(canceled).toHaveText("2");
  await expect(pending).toHaveText("1");
  await settle.click();
  await expect(active).toHaveText("2");
  await expect(canceled).toHaveText("1");
  await expect(pending).toHaveText("1");
  await expect(grid.locator('[data-row-id="row-1"]')).toHaveCount(0);
  await settle.click();
  await expect(active).toHaveText("1");
  await expect(canceled).toHaveText("0");
  await settle.click();
  await expect(active).toHaveText("0");
  await expect(pending).toHaveText("0");
  await expect(
    grid.locator('[data-row-id="row-3"][data-column-id="name"]'),
  ).toHaveText("Root record");
  expect(errors).toEqual([]);
});

test("a blank provider failure has a visible retry and a real successful response", async ({
  page,
}) => {
  const { article, active, pending, grid, settle, errors } = await setup(page);
  await article
    .getByRole("button", { name: "Reject next server response", exact: true })
    .click();
  const alert = article.getByRole("alert");
  await expect(alert).toContainText("Server provider request failed");
  await expect(active).toHaveText("0");
  await expect(pending).toHaveText("0");
  await alert.getByRole("button").click();
  await expect(active).toHaveText("1");
  await expect(pending).toHaveText("1");
  await settle.click();
  await expect(active).toHaveText("0");
  await expect(alert).toHaveCount(0);
  await expect(
    grid.locator('[data-row-id="row-2"][data-column-id="name"]'),
  ).toHaveText("Root record");
  expect(errors).toEqual([]);
});

test("capacity is bounded and live RTL controls preserve the pending requests and outside focus", async ({
  page,
}) => {
  const { article, active, pending, grid, errors } = await setup(page);
  const queue = article.getByRole("button", {
    name: "Queue six server routes",
    exact: true,
  });
  await queue.click();
  await queue.click();
  await expect(active).toHaveText("2");
  await expect(pending).toHaveText("8");
  await article.getByText("Recent provider events", { exact: true }).click();
  await expect(
    article.getByRole("list", { name: "Server provider events" }),
  ).toContainText("ServerRequestCapacityError");
  const rtl = page.getByRole("checkbox", {
    name: "Right-to-left remote grids",
    exact: true,
  });
  await rtl.check();
  await expect(grid).toHaveAttribute("dir", "rtl");
  await expect(rtl).toBeFocused();
  await expect(active).toHaveText("2");
  await expect(pending).toHaveText("8");
  await page.addScriptTag({
    content: readFileSync("node_modules/axe-core/axe.min.js", "utf8"),
  });
  const violations = await article.evaluate(async (element) =>
    (await (window as any).axe.run(element)).violations
      .filter((item: any) => ["serious", "critical"].includes(item.impact))
      .map((item: any) => ({
        id: item.id,
        nodes: item.nodes.map((node: any) => ({
          target: node.target,
          summary: node.failureSummary,
          html: node.html,
        })),
      })),
  );
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("retrying a failed cached refresh fetches and installs a new provider response", async ({
  page,
}) => {
  const { article, active, grid, settle, errors } = await setup(page);
  await settle.click();
  const original = grid.locator('[data-row-id="row-1"][data-column-id="name"]');
  await expect(original).toHaveText("Root record");
  await article
    .getByRole("button", { name: "Refresh server root", exact: true })
    .click();
  await expect(active).toHaveText("1");
  await expect(original).toHaveText("Root record");
  await article
    .getByRole("button", { name: "Reject next server response", exact: true })
    .click();
  const alert = article.getByRole("alert");
  await expect(alert).toContainText("Server provider request failed");
  await expect(original).toHaveText("Root record");
  await alert.getByRole("button").click();
  await expect(active).toHaveText("1");
  await expect(original).toHaveText("Root record");
  await settle.click();
  await expect(
    grid.locator('[data-row-id="row-3"][data-column-id="name"]'),
  ).toHaveText("Root record");
  await expect(original).toHaveCount(0);
  await expect(alert).toHaveCount(0);
  expect(errors).toEqual([]);
});
