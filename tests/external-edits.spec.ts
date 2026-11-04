import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./#external-edits");
  await page
    .getByRole("button", { name: "External edit requests lab", exact: true })
    .click();
});
const articleName = "External edit requests example";

test("view commands open a typed class editor and host acknowledgement updates it", async ({
  page,
}) => {
  const article = page.getByRole("article", { name: articleName });
  await article
    .getByText("Focus and editing commands", { exact: true })
    .click();
  await article
    .getByRole("button", { name: "Focus next amount", exact: true })
    .click();
  await expect(
    article.locator('[data-row-id="ledger-2"][data-column-id="amount"]'),
  ).toBeFocused();
  await article
    .getByRole("button", { name: "Edit review stage", exact: true })
    .click();
  const editor = article.getByRole("combobox", {
    name: "Edit Review stage row ledger-1",
    exact: true,
  });
  await expect(editor).toBeFocused();
  await editor.selectOption("Review");
  const cell = article.locator(
    '[data-row-id="ledger-1"][data-column-id="stage"]',
  );
  await expect(cell).toHaveText("Draft");
  await expect(article.getByLabel("Pending edit requests")).toHaveText(
    "Pending requests: 1",
  );
  await article
    .getByRole("button", { name: "Apply next request", exact: true })
    .click();
  await expect(cell).toHaveText("Review");
  await article
    .getByRole("textbox", { name: "Filter Review stage", exact: true })
    .fill("Review");
  await expect(
    article.locator('[data-row-id="ledger-1"][data-column-id="id"]'),
  ).toBeVisible();
  await expect(
    article.locator('[data-row-id="ledger-2"][data-column-id="id"]'),
  ).toHaveCount(0);
});

test("cell requests wait for host apply and rejected requests leave source untouched", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const article = page.getByRole("article", { name: articleName });
  const grid = article.getByRole("grid", { name: "Host-owned ledger" });
  const cell = grid.locator(
    '[data-row-id="ledger-1"][data-column-id="amount"]',
  );
  await cell.dblclick();
  await grid.getByRole("spinbutton").fill("42");
  await grid.getByRole("spinbutton").press("Enter");
  await expect(article.getByLabel("Pending edit requests")).toHaveText(
    "Pending requests: 1",
  );
  await expect(cell).toHaveText("20");
  await expect(
    article.getByText(/Edit requested\. The application/),
  ).toHaveText(
    "Edit requested. The application controls when data is updated.",
  );
  await article.getByRole("button", { name: "Reject next request" }).click();
  await expect(cell).toHaveText("20");
  await cell.dblclick();
  await grid.getByRole("spinbutton").fill("47");
  await grid.getByRole("spinbutton").press("Enter");
  await article.getByRole("button", { name: "Apply next request" }).click();
  await expect(cell).toHaveText("47");
  await expect(article.getByLabel("Pending edit requests")).toHaveText(
    "Pending requests: 0",
  );
  expect(errors).toEqual([]);
});

test("full-row submission stays pending and keyboard focus returns to its cell", async ({
  page,
}) => {
  const article = page.getByRole("article", { name: articleName });
  await article.getByLabel("Edit mode").selectOption("row");
  const cell = article.locator(
    '[data-row-id="ledger-1"][data-column-id="amount"]',
  );
  await cell.focus();
  await cell.press("F2");
  const dialog = article.getByRole("dialog");
  await dialog
    .getByRole("spinbutton", { name: "Edit Amount", exact: true })
    .fill("51");
  await dialog
    .getByRole("textbox", { name: "Edit Note", exact: true })
    .fill("Submitted draft");
  await dialog.getByRole("button", { name: "Submit row" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cell).toBeFocused();
  await expect(cell).toHaveText("20");
  await article.getByRole("button", { name: "Apply next request" }).click();
  await expect(cell).toHaveText("51");
  await expect(
    article.locator('[data-row-id="ledger-1"][data-column-id="note"]'),
  ).toHaveText("Submitted draft");
});

test("invalid values and read-only mode do not dispatch requests", async ({
  page,
}) => {
  const article = page.getByRole("article", { name: articleName });
  const cell = article.locator(
    '[data-row-id="ledger-1"][data-column-id="amount"]',
  );
  await cell.dblclick();
  await article.getByRole("spinbutton").fill("-1");
  await article.getByRole("spinbutton").press("Enter");
  await expect(article.getByRole("alert")).toHaveText(
    "Amount must be non-negative",
  );
  await expect(article.getByLabel("Pending edit requests")).toHaveText(
    "Pending requests: 0",
  );
  await article.getByRole("spinbutton").press("Escape");
  await article
    .getByRole("checkbox", { name: "Read only", exact: true })
    .check();
  await cell.focus();
  await cell.press("F2");
  await expect(article.getByRole("spinbutton")).toHaveCount(0);
  await expect(cell).toHaveAttribute("aria-readonly", "true");
});

for (const mode of ["light", "dark"])
  test(`phone request controls fit in ${mode} mode`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({
      colorScheme: mode as "light" | "dark",
      reducedMotion: "reduce",
    });
    await page.evaluate((value) => {
      localStorage.setItem("opengrid-theme", value);
    }, mode);
    await page.reload();
    const launcher = page.getByRole("button", {
      name: "External edit requests lab",
      exact: true,
    });
    if ((await launcher.getAttribute("aria-expanded")) !== "true")
      await launcher.click();
    const article = page.getByRole("article", { name: articleName });
    await article.scrollIntoViewIfNeeded();
    for (const name of ["Apply next request", "Reject next request"]) {
      const box = await article.getByRole("button", { name }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`external-edits-${mode}-390.png`),
      fullPage: false,
    });
  });
