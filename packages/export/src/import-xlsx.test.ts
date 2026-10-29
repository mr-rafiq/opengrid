import { describe, expect, it, vi } from "vitest";
import { createGrid, type Column } from "@opengrid/core";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { exportXlsx } from "./index";
import { importXlsx, type ImportXlsxOptions } from "./import-xlsx";

interface Item {
  id: string;
  name: string;
  price: number;
  active: boolean;
  when: Date;
  exact: bigint;
}
const columns: Column<Item>[] = [
  { id: "name", field: "name", header: "Name", type: "text" },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    validate: (value, row) =>
      Number(value) >= 0 && row.name ? undefined : "price or name is invalid",
  },
  { id: "active", field: "active", type: "boolean" },
  { id: "when", field: "when", type: "date" },
  { id: "exact", field: "exact", type: "bigint" },
];
const data: Item[] = [
  {
    id: "a",
    name: "Notebook",
    price: 3.5,
    active: true,
    when: new Date("2026-10-29T00:00:00Z"),
    exact: 9007199254740995n,
  },
];
const options = (
  patch: Partial<ImportXlsxOptions<Item>> = {},
): ImportXlsxOptions<Item> => ({
  columns,
  mapRow: (values, rowNumber) =>
    ({ id: `row-${rowNumber}`, ...values }) as unknown as Item,
  ...patch,
});
async function fixture() {
  return exportXlsx(
    createGrid({ rows: data, columns, getRowId: (row) => row.id }),
  );
}
async function changePart(
  bytes: Uint8Array,
  path: string,
  update: (text: string) => string,
) {
  const zip = await JSZip.loadAsync(bytes);
  zip.file(path, update(await zip.file(path)!.async("string")));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
/** Alter public ZIP headers, not JSZip private metadata. Used only to construct adversarial fixtures. */
function metadata(
  bytes: Uint8Array,
  name: string,
  update: (view: DataView, central: number, local: number) => void,
) {
  const result = new Uint8Array(bytes),
    view = new DataView(result.buffer);
  for (let offset = 0; offset + 46 < result.length; offset++) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(offset + 28, true);
    const actual = new TextDecoder().decode(
      result.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (actual === name) {
      update(view, offset, view.getUint32(offset + 42, true));
      return result;
    }
  }
  throw new Error("Test ZIP part not found");
}

describe("bounded XLSX import", () => {
  it("flattens rich text, ignores hyperlink targets, skips blank display text and rejects spreadsheet errors", async () => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Input");
    sheet.addRow(["Name"]);
    sheet.addRow([
      {
        richText: [{ text: "Rich" }, { text: " value", font: { bold: true } }],
      },
    ]);
    sheet.addRow([
      { text: "Link", hyperlink: "https://example.invalid/never-fetch" },
    ]);
    sheet.addRow([{ richText: [{ text: "" }] }]);
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    const fetch = vi.spyOn(globalThis, "fetch");
    const base = {
      columns: [{ id: "name", header: "Name", field: "name" }] as Column<{
        name: unknown;
      }>[],
      mapRow: (values: Record<string, unknown>) => ({ name: values.name }),
    };
    const result = await importXlsx(bytes, base);
    expect(result.rows).toEqual([{ name: "Rich value" }, { name: "Link" }]);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "hyperlink-text",
    );
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "rich-text",
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
    sheet.getCell("A2").value = { error: "#N/A" };
    await expect(
      importXlsx(new Uint8Array(await book.xlsx.writeBuffer()), base),
    ).rejects.toThrow("Spreadsheet error");
  });
  it("round trips real XLSX values with exact BigInt and Date, without mutating a grid", async () => {
    const grid = createGrid({ rows: data, columns, getRowId: (row) => row.id });
    const result = await importXlsx(await exportXlsx(grid), options());
    expect(result.rows).toEqual([{ ...data[0], id: "row-2" }]);
    expect(result.warnings).toEqual([]);
    expect(grid.getRows()).toEqual(data);
  });
  it("uses full mapped rows for parsers and validators, and rejects an entire invalid import", async () => {
    const source = await fixture();
    const result = await importXlsx(
      source,
      options({
        columns: columns.map((column) =>
          column.id === "price"
            ? {
                ...column,
                valueParser: (value, row) =>
                  row.name === "Notebook" ? Number(value) * 2 : 0,
                validate: (value, row) =>
                  Number(value) === 7 && row.id === "mapped"
                    ? undefined
                    : "bad mapped row",
              }
            : column,
        ),
        mapRow: (values) => ({ ...values, id: "mapped" }) as unknown as Item,
      }),
    );
    expect(result.rows[0].price).toBe(7);
    const map = vi.fn(
      (values: Record<string, unknown>) =>
        ({ ...values, id: "bad" }) as unknown as Item,
    );
    await expect(
      importXlsx(
        source,
        options({
          mapRow: map,
          columns: columns.map((column) =>
            column.id === "price"
              ? { ...column, validate: () => "blocked" }
              : column,
          ),
        }),
      ),
    ).rejects.toThrow("row 2, column price: blocked");
    expect(map).toHaveBeenCalledTimes(1);
  });
  it("treats blank cells as undefined, skips empty rows, supports sheet and header selection", async () => {
    const book = new ExcelJS.Workbook();
    const first = book.addWorksheet("Ignored");
    first.addRow(["Name"]);
    first.addRow(["Other"]);
    const sheet = book.addWorksheet("Chosen");
    sheet.addRow(["Preamble"]);
    sheet.addRow(["Name", "Price"]);
    sheet.addRow([]);
    sheet.addRow(["A", null]);
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    const result = await importXlsx(bytes, {
      columns: [
        { id: "name", header: "Name", type: "text" },
        { id: "price", header: "Price", type: "number" },
      ],
      sheetName: "Chosen",
      headerRow: 2,
      mapRow: (values, rowNumber) => ({ values, rowNumber }),
    });
    expect(result.rows).toEqual([
      { values: { name: "A", price: undefined }, rowNumber: 4 },
    ]);
    await expect(
      importXlsx(bytes, options({ sheetName: "Missing" })),
    ).rejects.toThrow("does not exist");
  });
  it("never executes formulas: rejects by default, allows cached/text with explicit warnings", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Input");
    sheet.addRow(["Value"]);
    sheet.addRow([{ formula: "1+2", result: 3 }]);
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    const base = {
      columns: [{ id: "value", field: "value", header: "Value" }] as Column<{
        value: unknown;
      }>[],
      mapRow: (values: Record<string, unknown>) => ({ value: values.value }),
    };
    await expect(importXlsx(bytes, base)).rejects.toThrow(
      "Formula import is disabled",
    );
    const cached = await importXlsx(bytes, {
      ...base,
      formulaPolicy: "cached",
    });
    expect(cached.rows).toEqual([{ value: 3 }]);
    expect(cached.warnings[0].code).toBe("formula-cached");
    const text = await importXlsx(bytes, { ...base, formulaPolicy: "text" });
    expect(text.rows).toEqual([{ value: "=1+2" }]);
    expect(text.warnings[0].code).toBe("formula-text");
    sheet.getCell("A2").value = { formula: "1+2" };
    await expect(
      importXlsx(new Uint8Array(await book.xlsx.writeBuffer()), {
        ...base,
        formulaPolicy: "cached",
      }),
    ).rejects.toThrow("Cached formula result unavailable");
  });
  it("rejects duplicate/unknown headers, ambiguous schema aliases and unmapped data", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Input");
    sheet.addRow(["Name", "Name"]);
    sheet.addRow(["A", "B"]);
    await expect(
      importXlsx(new Uint8Array(await book.xlsx.writeBuffer()), options()),
    ).rejects.toThrow("Duplicate import header");
    sheet.getCell("B1").value = "Unknown";
    await expect(
      importXlsx(new Uint8Array(await book.xlsx.writeBuffer()), options()),
    ).rejects.toThrow("Unknown import header");
    sheet.getCell("B1").value = null;
    await expect(
      importXlsx(new Uint8Array(await book.xlsx.writeBuffer()), options()),
    ).rejects.toThrow("unmapped blank header");
    await expect(
      importXlsx(
        await fixture(),
        options({
          columns: [{ id: "name", header: "price" }, { id: "price" }],
        }),
      ),
    ).rejects.toThrow("schema header collision");
  });
  it("rejects unsafe numeric BigInt and invalid calendar values rather than losing data", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Input");
    sheet.addRow(["exact"]);
    sheet.addRow([9007199254740994]);
    await expect(
      importXlsx(
        new Uint8Array(await book.xlsx.writeBuffer()),
        options({ columns: [columns[4]] }),
      ),
    ).rejects.toThrow("Unsafe numeric BigInt");
    sheet.getCell("A1").value = "when";
    sheet.getCell("A2").value = "2026-02-30";
    await expect(
      importXlsx(
        new Uint8Array(await book.xlsx.writeBuffer()),
        options({ columns: [columns[3]] }),
      ),
    ).rejects.toThrow("valid calendar date");
  });
  it("checks compressed bytes, row/column/cell and expanded budgets before workbook loading", async () => {
    const bytes = await fixture();
    await expect(
      importXlsx(bytes, options({ maxFileBytes: 100 })),
    ).rejects.toThrow("maxFileBytes");
    await expect(
      importXlsx(bytes, options({ maxUncompressedBytes: 100 })),
    ).rejects.toThrow("expanded size");
    await expect(
      importXlsx(
        bytes,
        options({ columns: columns.slice(0, 1), maxColumns: 1 }),
      ),
    ).rejects.toThrow(/limits|limit/);
    await expect(importXlsx(bytes, options({ maxCells: 1 }))).rejects.toThrow(
      /cells? .*limits|cell limits/,
    );
    const huge = metadata(
      bytes,
      "xl/worksheets/sheet1.xml",
      (view, central, local) => {
        view.setUint32(central + 24, 64_000_000, true);
        view.setUint32(local + 22, 64_000_000, true);
      },
    );
    await expect(importXlsx(huge, options())).rejects.toThrow("expanded size");
  });
  it("bounds actual inflated chunks even when directory and local uncompressed sizes lie", async () => {
    const bytes = await fixture();
    const zip = await JSZip.loadAsync(bytes);
    zip.file("large.txt", "A".repeat(2_000_000));
    const compressed = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
    const forged = metadata(compressed, "large.txt", (view, central, local) => {
      view.setUint32(central + 24, 16, true);
      view.setUint32(local + 22, 16, true);
    });
    const getter = vi.spyOn(ExcelJS.Workbook.prototype, "xlsx", "get");
    await expect(
      importXlsx(forged, options({ maxUncompressedBytes: 100_000 })),
    ).rejects.toThrow("Actual expanded ZIP bytes");
    expect(getter).not.toHaveBeenCalled();
    getter.mockRestore();
  });
  it("rejects forged worksheet dimensions and DTD/entity declarations", async () => {
    const bytes = await fixture();
    const dimensions = await changePart(
      bytes,
      "xl/worksheets/sheet1.xml",
      (text) =>
        text.replace(/<dimension[^>]+\/>/u, '<dimension ref="A1:XFD1048576"/>'),
    );
    await expect(importXlsx(dimensions, options())).rejects.toThrow(
      "row/column limits",
    );
    const entity = await changePart(bytes, "xl/sharedStrings.xml", (text) =>
      text.replace(/<sst/u, '<!DOCTYPE sst [<!ENTITY boom "expanded">]><sst'),
    );
    await expect(importXlsx(entity, options())).rejects.toThrow("DTD/entity");
  });
  it("rejects malformed, encrypted, ZIP64, duplicate, path and macro archives", async () => {
    await expect(
      importXlsx(new Uint8Array([1, 2, 3]), options()),
    ).rejects.toThrow();
    const bytes = await fixture();
    const encrypted = metadata(
      bytes,
      "xl/workbook.xml",
      (view, central, local) => {
        view.setUint16(central + 8, 1, true);
        view.setUint16(local + 6, 1, true);
      },
    );
    await expect(importXlsx(encrypted, options())).rejects.toThrow("Encrypted");
    const zip64 = metadata(bytes, "xl/workbook.xml", (view, central) =>
      view.setUint32(central + 24, 0xffffffff, true),
    );
    await expect(importXlsx(zip64, options())).rejects.toThrow("ZIP64");
    const zip = await JSZip.loadAsync(bytes);
    zip.file("../evil.xml", "<evil/>");
    await expect(
      importXlsx(await zip.generateAsync({ type: "uint8array" }), options()),
    ).rejects.toThrow("Unsafe");
    const duplicates = await JSZip.loadAsync(bytes);
    duplicates.file("XL/workbook.xml", "<x/>");
    await expect(
      importXlsx(
        await duplicates.generateAsync({ type: "uint8array" }),
        options(),
      ),
    ).rejects.toThrow("Duplicate");
    const macro = await changePart(bytes, "[Content_Types].xml", (text) =>
      text.replace(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
      ),
    );
    await expect(importXlsx(macro, options())).rejects.toThrow("non-macro");
  });
  it("checks CRC and rejects corrupt compressed content", async () => {
    const bytes = metadata(
      await fixture(),
      "xl/workbook.xml",
      (view, central, local) => {
        view.setUint32(central + 16, 123, true);
        view.setUint32(local + 14, 123, true);
      },
    );
    await expect(importXlsx(bytes, options())).rejects.toThrow("CRC integrity");
  });
  it("rejects allocation-expanding merges, named ranges and huge sparse sheet IDs before ExcelJS", async () => {
    const bytes = await fixture();
    const merge = await changePart(bytes, "xl/worksheets/sheet1.xml", (text) =>
      text.replace(
        "</worksheet>",
        '<mergeCells count="1"><mergeCell ref="A1:IV50000"/></mergeCells></worksheet>',
      ),
    );
    await expect(importXlsx(merge, options())).rejects.toThrow("Merged cells");
    const named = await changePart(bytes, "xl/workbook.xml", (text) =>
      text.replace(
        "</workbook>",
        '<definedNames><definedName name="Huge">Sheet1!$A$1:$IV$50000</definedName></definedNames></workbook>',
      ),
    );
    await expect(importXlsx(named, options())).rejects.toThrow("Named ranges");
    const sparse = await changePart(bytes, "xl/workbook.xml", (text) =>
      text.replace('sheetId="1"', 'sheetId="4000000000"'),
    );
    await expect(importXlsx(sparse, options())).rejects.toThrow(
      "sheet identifiers",
    );
  });
  it("validates actual shared strings and references instead of trusting declared counts", async () => {
    const bytes = await fixture();
    const missing = await changePart(
      bytes,
      "xl/worksheets/sheet1.xml",
      (text) =>
        text.replace(
          /<c r="A2"[^>]*><v>\d+<\/v><\/c>/u,
          '<c r="A2" t="s"><v>9999</v></c>',
        ),
    );
    await expect(importXlsx(missing, options())).rejects.toThrow(
      "missing shared string",
    );
    const actual = await changePart(bytes, "xl/sharedStrings.xml", (text) =>
      text.replace(/<\/sst>/u, "<si><t>Extra</t></si>".repeat(20) + "</sst>"),
    );
    await expect(importXlsx(actual, options({ maxCells: 15 }))).rejects.toThrow(
      "Actual shared-string count",
    );
  });
});
