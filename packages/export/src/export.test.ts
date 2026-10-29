import { describe, expect, it } from "vitest";
import { createGrid, type Column } from "@opengrid/core";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { exportPdf, exportWorkbook, exportXlsx } from "./index";

interface Item {
  id: string;
  name: string;
  price: number;
  active: boolean;
  date: Date;
  huge: bigint;
  hidden: string;
}
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Product", width: 150 },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    valueFormatter: (value) => `$${Number(value).toFixed(2)}`,
  },
  { id: "active", field: "active", type: "boolean" },
  { id: "date", field: "date", type: "date" },
  { id: "huge", field: "huge", type: "bigint" },
  { id: "hidden", field: "hidden", hidden: true },
];
const rows: Item[] = [
  {
    id: "a",
    name: '=WEBSERVICE("https://example.invalid")',
    price: 1.25,
    active: true,
    date: new Date("2026-01-01T00:00:00Z"),
    huge: 9007199254740993n,
    hidden: "secret",
  },
  {
    id: "b",
    name: "Notebook",
    price: 2.5,
    active: false,
    date: new Date("2026-02-02T00:00:00Z"),
    huge: 8n,
    hidden: "private",
  },
];
const model = () => createGrid({ columns, rows, getRowId: (row) => row.id });
async function readWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

describe("real OOXML export", () => {
  it("creates a ZIP workbook with typed cells and formula-looking strings kept as text", async () => {
    const bytes = await exportXlsx(model(), { sheetName: "Products" });
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("xl/workbook.xml")).not.toBeNull();
    const worksheetXml = await zip
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    expect(worksheetXml).not.toContain("<f>");
    expect(worksheetXml).toContain('state="frozen"');
    const workbook = await readWorkbook(bytes);
    const sheet = workbook.getWorksheet("Products")!;
    expect(sheet.columnCount).toBe(5);
    expect(sheet.getCell("A2").value).toBe(rows[0].name);
    expect(sheet.getCell("B2").value).toBe(1.25);
    expect(sheet.getCell("C2").value).toBe(true);
    expect(sheet.getCell("D2").value).toEqual(rows[0].date);
    expect(sheet.getCell("E2").value).toBe("9007199254740993");
    expect(sheet.getCell("A2").type).toBe(ExcelJS.ValueType.String);
  });

  it("exports filtered selected rows with explicit column order and optional formatters", async () => {
    const grid = model();
    grid.setSort("price", "desc");
    grid.selectRows(["b"]);
    const workbook = await readWorkbook(
      await exportXlsx(grid, {
        selectedOnly: true,
        getRowId: (row) => row.id,
        columnIds: ["price", "name"],
        useFormatters: true,
      }),
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).values).toEqual([undefined, "$2.50", "Notebook"]);
    await expect(exportXlsx(grid, { selectedOnly: true })).rejects.toThrow(
      "getRowId",
    );
  });

  it("supports multiple named sheets, real tables, styles and frozen columns", async () => {
    const bytes = await exportWorkbook([
      {
        model: model(),
        sheetName: "First",
        table: true,
        freezeColumns: 1,
        headerFill: "112233",
        numberFormats: { price: "0.00" },
      },
      {
        model: model(),
        sheetName: "Second",
        columnIds: ["name"],
        freezeHeader: false,
      },
    ]);
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("xl/tables/table1.xml")).not.toBeNull();
    const workbook = await readWorkbook(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "First",
      "Second",
    ]);
    expect(workbook.worksheets[0].views[0]).toMatchObject({
      state: "frozen",
      xSplit: 1,
      ySplit: 1,
    });
    expect(workbook.worksheets[0].getCell("B2").numFmt).toBe("0.00");
    expect(workbook.worksheets[0].getCell("A1").fill).toMatchObject({
      fgColor: { argb: "FF112233" },
    });
  });

  it("only writes explicit opt-in formulas, with cached values", async () => {
    await expect(
      exportXlsx(model(), { formula: () => ({ formula: "1+1", result: 2 }) }),
    ).rejects.toThrow("allowFormulas");
    const bytes = await exportXlsx(model(), {
      columnIds: ["price"],
      allowFormulas: true,
      formula: ({ rowNumber }) => ({
        formula: `${rowNumber}*2`,
        result: rowNumber * 2,
      }),
    });
    const xml = await (
      await JSZip.loadAsync(bytes)
    )
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    expect(xml).toContain("<f>2*2</f>");
    expect(
      (await readWorkbook(bytes)).worksheets[0].getCell("A2").value,
    ).toEqual({ formula: "2*2", result: 4 });
  });

  it("rejects invalid names, columns, colors, freezes and values instead of corrupting output", async () => {
    await expect(exportWorkbook([])).rejects.toThrow("at least one");
    await expect(
      exportXlsx(model(), { sheetName: "bad/name" }),
    ).rejects.toThrow("sheet names");
    await expect(
      exportWorkbook([
        { model: model(), sheetName: "Same" },
        { model: model(), sheetName: "same" },
      ]),
    ).rejects.toThrow("unique");
    await expect(exportXlsx(model(), { columnIds: [] })).rejects.toThrow(
      "at least one",
    );
    await expect(
      exportXlsx(model(), { columnIds: ["missing"] }),
    ).rejects.toThrow("Unknown");
    await expect(exportXlsx(model(), { headerFill: "purple" })).rejects.toThrow(
      "hexadecimal",
    );
    await expect(exportXlsx(model(), { freezeColumns: -1 })).rejects.toThrow(
      "freezeColumns",
    );
    const bad = createGrid({
      rows: [{ id: "a", value: Infinity }],
      columns: [{ id: "value", field: "value" }],
      getRowId: (row) => row.id,
    });
    await expect(exportXlsx(bad)).rejects.toThrow("non-finite");
    const long = createGrid({
      rows: [{ id: "a", value: "x".repeat(32768) }],
      columns: [{ id: "value", field: "value" }],
      getRowId: (row) => row.id,
    });
    await expect(exportXlsx(long)).rejects.toThrow("32,767");
  });

  it("allRows bypasses active filters while preserving default filtered behavior", async () => {
    const grid = model();
    grid.setQuickFilter("Notebook");
    expect(
      (await readWorkbook(await exportXlsx(grid))).worksheets[0].rowCount,
    ).toBe(2);
    expect(
      (await readWorkbook(await exportXlsx(grid, { allRows: true })))
        .worksheets[0].rowCount,
    ).toBe(3);
  });
});

describe("native PDF export", () => {
  it("creates a valid paginated PDF readable by an independent parser with repeated headers", async () => {
    const grid = createGrid({
      rows: Array.from({ length: 120 }, (_, index) => ({
        id: String(index),
        name: `Product ${index}`,
        price: index,
      })),
      columns: [
        { id: "name", field: "name", header: "Product" },
        { id: "price", field: "price", header: "Price", type: "number" },
      ],
      getRowId: (row) => row.id,
    });
    const bytes = await exportPdf(grid, {
      pageSize: "Letter",
      orientation: "landscape",
      title: "Inventory",
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: bytes, useSystemFonts: true });
    const document = await task.promise;
    expect(document.numPages).toBeGreaterThan(2);
    const first = await document.getPage(1);
    expect(first.getViewport({ scale: 1 }).width).toBe(792);
    const firstText = (await first.getTextContent()).items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");
    expect(firstText).toContain("Inventory");
    expect(firstText).toContain("Product 0");
    const last = await document.getPage(document.numPages);
    const lastText = (await last.getTextContent()).items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");
    expect(lastText).toContain("Inventory");
    expect(lastText).toContain("Price");
    expect(lastText).toContain("Product 119");
    await task.destroy();
  });

  it("honors visible columns and selected rows and formats values by default", async () => {
    const grid = model();
    grid.selectRows(["b"]);
    const bytes = await exportPdf(grid, {
      columnIds: ["name", "price"],
      selectedOnly: true,
      getRowId: (row) => row.id,
    });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: bytes, useSystemFonts: true });
    const document = await task.promise;
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");
    expect(text).toContain("Notebook");
    expect(text).toContain("$2.50");
    expect(text).not.toContain("WEBSERVICE");
    await task.destroy();
  });

  it("rejects unsupported font text and invalid layout parameters explicitly", async () => {
    const unicode = createGrid({
      rows: [{ id: "x", name: "\u6f22\u5b57" }],
      columns: [{ id: "name", field: "name" }],
      getRowId: (row) => row.id,
    });
    await expect(exportPdf(unicode)).rejects.toThrow("WinAnsi");
    await expect(exportPdf(model(), { fontSize: 0 })).rejects.toThrow(
      "fontSize",
    );
    await expect(exportPdf(model(), { margin: NaN })).rejects.toThrow("margin");
    await expect(exportPdf(model(), { maxLinesPerCell: 0 })).rejects.toThrow(
      "maxLinesPerCell",
    );
  });

  it("wraps multiline text and truncates rows to the documented maximum", async () => {
    const grid = createGrid({
      rows: [
        { id: "x", name: "First line\nSecond line\nThird line\nFourth line" },
      ],
      columns: [{ id: "name", field: "name" }],
      getRowId: (row) => row.id,
    });
    const bytes = await exportPdf(grid, { maxLinesPerCell: 2 });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: bytes, useSystemFonts: true });
    const document = await task.promise;
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");
    expect(text).toContain("First line");
    expect(text).toContain("Second line...");
    expect(text).not.toContain("Fourth line");
    await task.destroy();
  });
});
