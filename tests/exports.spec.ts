import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
test("downloads genuine XLSX and PDF from the browser example", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Dataset size" })
    .selectOption("100");
  const xlsxEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export XLSX", exact: true }).click();
  const xlsx = await xlsxEvent;
  expect(xlsx.suggestedFilename()).toBe("opengrid-portfolio.xlsx");
  const archive = await JSZip.loadAsync(await readFile((await xlsx.path())!));
  expect(archive.file("xl/workbook.xml")).not.toBeNull();
  expect(
    await archive.file("xl/worksheets/sheet1.xml")!.async("string"),
  ).toContain("<sheetData>");
  const pdfEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const pdf = await pdfEvent;
  expect(pdf.suggestedFilename()).toBe("opengrid-portfolio.pdf");
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );
});
