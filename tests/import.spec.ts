import { test, expect } from "@playwright/test";
test("round-trips an exported workbook into a separate typed preview", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Dataset size" })
    .selectOption("100");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export XLSX", exact: true }).click();
  const workbook = await downloading;
  await page
    .getByLabel("Import XLSX workbook", { exact: true })
    .setInputFiles((await workbook.path())!);
  await expect(page.getByText("100 imported rows · 0 warnings")).toBeVisible();
  const preview = page.getByRole("grid", {
    name: "Imported workbook",
    exact: true,
  });
  await expect(preview).toContainText("Northstar Labs");
  await expect(preview).toContainText("$42.00");
  await expect(
    page.getByRole("grid", { name: "Portfolio holdings", exact: true }),
  ).toBeVisible();
});
test("rejects malformed workbook bytes and keeps the sample grid intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Import XLSX workbook", { exact: true }).setInputFiles({
    name: "broken.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("not a ZIP workbook"),
  });
  await expect(page.getByRole("alert")).toContainText(
    /XLSX|ZIP|workbook|archive/i,
  );
  await expect(
    page.getByRole("grid", { name: "Portfolio holdings", exact: true }),
  ).toContainText("Northstar Labs");
  await expect(
    page.getByRole("grid", { name: "Imported workbook", exact: true }),
  ).toHaveCount(0);
});
