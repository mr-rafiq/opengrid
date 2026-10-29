import type { Column, GridModel } from "@opengrid/core";
export * from "./import-xlsx.js";
import type { CellValue } from "exceljs";

export interface ExportRowsOptions<T> {
  /** Explicit column IDs, in output order. Overrides default visible-column selection. */
  columnIds?: string[];
  /** Defaults to sorted/filtered rows. true uses source order and ignores filters. */
  allRows?: boolean;
  selectedOnly?: boolean;
  /** Required with selectedOnly because the model deliberately does not expose its ID callback. */
  getRowId?: (row: T) => string;
  useFormatters?: boolean;
}

export interface XlsxFormula {
  formula: string;
  result?: number | string | boolean;
}

export interface XlsxOptions<T> extends ExportRowsOptions<T> {
  sheetName?: string;
  freezeHeader?: boolean;
  freezeColumns?: number;
  table?: boolean;
  headerFill?: string;
  headerColor?: string;
  numberFormats?: Record<string, string>;
  /** Formula strings in row data are always text. Only this explicit callback emits formulas. */
  allowFormulas?: boolean;
  formula?: (context: {
    row: T;
    column: Column<T>;
    value: unknown;
    /** Excel row number, including the header. */
    rowNumber: number;
  }) => XlsxFormula | undefined;
}

export interface XlsxSheet<T> extends XlsxOptions<T> {
  model: GridModel<T>;
}

function exportData<T>(model: GridModel<T>, options: ExportRowsOptions<T>) {
  const available = model.getColumns();
  let columns = available.filter((column) => !column.hidden);
  if (options.columnIds) {
    if (new Set(options.columnIds).size !== options.columnIds.length)
      throw new Error("Export column IDs must be unique");
    columns = options.columnIds.map((id) => {
      const column = available.find((item) => item.id === id);
      if (!column) throw new Error(`Unknown export column: ${id}`);
      return column;
    });
  }
  if (!columns.length) throw new Error("Select at least one export column");
  let rows = options.allRows ? model.getRows() : model.getFilteredRows();
  if (options.selectedOnly) {
    if (!options.getRowId)
      throw new Error("selectedOnly requires a getRowId callback");
    const selected = new Set(model.getState().selected);
    rows = rows.filter((row) => selected.has(options.getRowId!(row)));
  }
  const value = (row: T, column: Column<T>) => {
    const raw = model.getValue(row, column.id);
    return options.useFormatters && column.valueFormatter
      ? column.valueFormatter(raw, row)
      : raw;
  };
  return { columns, rows, value };
}

function spreadsheetValue(value: unknown): CellValue {
  if (value == null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw new Error("Cannot export an invalid date");
    return new Date(value.getTime());
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Cannot export a non-finite number");
    return value;
  }
  if (typeof value === "boolean") return value;
  const string = String(value);
  if (string.length > 32767)
    throw new Error("XLSX cell text exceeds 32,767 characters");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(string))
    throw new Error("XLSX text contains unsupported control characters");
  // Strings, including =SUM(...) and formula-looking payloads, remain string cells.
  return string;
}

function argb(value: string | undefined, fallback: string) {
  if (value === undefined) return fallback;
  const result = value.replace(/^#/, "");
  if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(result))
    throw new Error(
      "XLSX colors must be six- or eight-digit hexadecimal values",
    );
  return (result.length === 6 ? "FF" + result : result).toUpperCase();
}

/** Real Office Open XML workbook bytes, suitable for a .xlsx download. */
export async function exportXlsx<T>(
  model: GridModel<T>,
  options: XlsxOptions<T> = {},
): Promise<Uint8Array> {
  return exportWorkbook([{ model, ...options }]);
}

/** Each descriptor supplies its own model and row/column/style policy. */
export async function exportWorkbook<T>(
  sheets: XlsxSheet<T>[],
): Promise<Uint8Array> {
  if (!sheets.length) throw new Error("A workbook needs at least one sheet");
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OpenGrid";
  workbook.created = new Date();
  const names = new Set<string>();
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
    const options = sheets[sheetIndex];
    const name = options.sheetName ?? `Sheet${sheetIndex + 1}`;
    if (
      !name ||
      name.length > 31 ||
      /[\[\]:*?/\\]/u.test(name) ||
      /^'|'$/u.test(name)
    )
      throw new Error(
        "XLSX sheet names must be 1-31 characters without reserved characters",
      );
    if (names.has(name.toLocaleLowerCase()))
      throw new Error("XLSX sheet names must be unique");
    names.add(name.toLocaleLowerCase());
    const { columns, rows, value } = exportData(options.model, options);
    if (columns.length > 16384 || rows.length > 1048575)
      throw new RangeError("XLSX worksheet row or column limit exceeded");
    const freezeColumns = options.freezeColumns ?? 0;
    if (
      !Number.isInteger(freezeColumns) ||
      freezeColumns < 0 ||
      freezeColumns > columns.length
    )
      throw new RangeError(
        "freezeColumns must be an integer within the exported columns",
      );
    if (options.formula && !options.allowFormulas)
      throw new Error("An XLSX formula callback requires allowFormulas: true");
    const worksheet = workbook.addWorksheet(name);
    worksheet.columns = columns.map((column) => ({
      key: column.id,
      width: Math.max(8, Math.min(80, (column.width ?? 140) / 7)),
    }));
    const header = columns.map((column) => column.header ?? column.id);
    header.forEach(spreadsheetValue);
    if (
      options.table &&
      new Set(header.map((name) => name.toLocaleLowerCase())).size !==
        header.length
    )
      throw new Error("XLSX table headers must be unique");
    const matrix: CellValue[][] = rows.map((row, rowIndex) =>
      columns.map((column) => {
        const raw = value(row, column);
        const formula = options.formula?.({
          row,
          column,
          value: raw,
          rowNumber: rowIndex + 2,
        });
        if (!formula) return spreadsheetValue(raw);
        if (
          !formula.formula ||
          formula.formula.length > 8192 ||
          formula.formula.startsWith("=")
        )
          throw new Error(
            "XLSX formulas must be nonempty expressions without a leading =",
          );
        if (formula.result !== undefined) spreadsheetValue(formula.result);
        return { formula: formula.formula, result: formula.result };
      }),
    );
    if (options.table && rows.length) {
      worksheet.addTable({
        name: `OpenGridTable${sheetIndex + 1}`,
        ref: "A1",
        headerRow: true,
        style: { theme: "TableStyleMedium2", showRowStripes: true },
        columns: header.map((name) => ({ name, filterButton: true })),
        rows: matrix,
      });
    } else {
      worksheet.addRow(header);
      worksheet.addRows(matrix);
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };
    }
    worksheet.views = [
      {
        state: "frozen",
        xSplit: freezeColumns,
        ySplit: options.freezeHeader === false ? 0 : 1,
      },
    ];
    const headerRow = worksheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = {
        bold: true,
        color: { argb: argb(options.headerColor, "FFFFFFFF") },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: argb(options.headerFill, "FF176E57") },
      };
      cell.alignment = { vertical: "middle" };
    });
    columns.forEach((column, index) => {
      const format = options.numberFormats?.[column.id];
      if (format !== undefined) worksheet.getColumn(index + 1).numFmt = format;
      else if (column.type === "date")
        worksheet.getColumn(index + 1).numFmt = "yyyy-mm-dd";
    });
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export interface PdfOptions<T> extends ExportRowsOptions<T> {
  pageSize?: "A4" | "Letter";
  orientation?: "portrait" | "landscape";
  margin?: number;
  fontSize?: number;
  maxLinesPerCell?: number;
  title?: string;
}

/** Paginated native PDF bytes using standard Helvetica (WinAnsi text only). */
export async function exportPdf<T>(
  model: GridModel<T>,
  options: PdfOptions<T> = {},
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const document = await PDFDocument.create();
  document.setProducer("OpenGrid / pdf-lib");
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const fontSize = options.fontSize ?? 9;
  const margin = options.margin ?? 32;
  const maxLines = options.maxLinesPerCell ?? 3;
  if (!Number.isFinite(fontSize) || fontSize < 6 || fontSize > 24)
    throw new RangeError("PDF fontSize must be between 6 and 24 points");
  if (!Number.isFinite(margin) || margin < 12 || margin > 100)
    throw new RangeError("PDF margin must be between 12 and 100 points");
  if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 10)
    throw new RangeError("PDF maxLinesPerCell must be between 1 and 10");
  const size = options.pageSize === "Letter" ? [612, 792] : [595.28, 841.89];
  const [pageWidth, pageHeight] =
    options.orientation === "landscape" ? [size[1], size[0]] : size;
  const { columns, rows, value } = exportData(model, {
    ...options,
    useFormatters: options.useFormatters ?? true,
  });
  const title = options.title ?? "OpenGrid export";
  const text = (value: unknown) =>
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value == null
        ? ""
        : String(value);
  const headers = columns.map((column) => column.header ?? column.id);
  const matrix = rows.map((row) =>
    columns.map((column) => text(value(row, column))),
  );
  try {
    for (const line of [title, ...headers, ...matrix.flat()])
      font.encodeText(line.replace(/[\r\n\t]/gu, " "));
  } catch {
    throw new Error(
      "PDF text is outside the standard Helvetica WinAnsi character set; custom fonts are not supported",
    );
  }
  const width = pageWidth - margin * 2;
  if (
    columns.some(
      (column) =>
        !Number.isFinite(column.width ?? 140) || (column.width ?? 140) <= 0,
    )
  )
    throw new RangeError("PDF column widths must be positive finite numbers");
  const sourceWidth = columns.reduce(
    (sum, column) => sum + (column.width ?? 140),
    0,
  );
  const widths = columns.map(
    (column) => (width * (column.width ?? 140)) / sourceWidth,
  );
  if (widths.some((columnWidth) => columnWidth < fontSize * 1.5 + 8))
    throw new RangeError(
      "PDF columns are too narrow; export fewer columns, use landscape, or reduce fontSize",
    );
  const lineHeight = fontSize * 1.25;
  const headerHeight = lineHeight + 12;
  const bodyTop = pageHeight - margin - 24 - headerHeight;
  const bodyBottom = margin + 18;
  const wrap = (input: string, available: number): string[] => {
    if (available <= 0) return [""];
    const chars = [...input.replace(/\r\n?/gu, "\n").replace(/\t/gu, " ")];
    const lines: string[] = [];
    let current = "";
    for (const char of chars) {
      if (char === "\n") {
        lines.push(current);
        current = "";
        continue;
      }
      if (
        font.widthOfTextAtSize(current + char, fontSize) > available &&
        current
      ) {
        lines.push(current.trimEnd());
        current = "";
      }
      current += char;
    }
    lines.push(current);
    if (lines.length <= maxLines) return lines;
    const result = lines.slice(0, maxLines);
    let last = result.at(-1)!;
    while (last && font.widthOfTextAtSize(last + "...", fontSize) > available)
      last = last.slice(0, -1);
    result[result.length - 1] =
      font.widthOfTextAtSize("...", fontSize) <= available ? last + "..." : "";
    return result;
  };
  const headerLines = headers.map(
    (header, index) => wrap(header, widths[index] - 8)[0],
  );
  let page = document.addPage([pageWidth, pageHeight]);
  let y = bodyTop;
  function drawHeader() {
    page.drawText(title, {
      x: margin,
      y: pageHeight - margin - 10,
      size: 12,
      font: bold,
      color: rgb(0.1, 0.18, 0.24),
    });
    let x = margin;
    headers.forEach((_, index) => {
      page.drawRectangle({
        x,
        y: bodyTop,
        width: widths[index],
        height: headerHeight,
        color: rgb(0.09, 0.39, 0.3),
      });
      page.drawText(headerLines[index], {
        x: x + 4,
        y: bodyTop + 7,
        size: fontSize,
        font: bold,
        color: rgb(1, 1, 1),
      });
      x += widths[index];
    });
  }
  drawHeader();
  matrix.forEach((row, rowIndex) => {
    const lines = row.map((cell, index) => wrap(cell, widths[index] - 8));
    const rowHeight =
      Math.max(1, ...lines.map((cell) => cell.length)) * lineHeight + 10;
    if (rowHeight > bodyTop - bodyBottom)
      throw new RangeError("PDF row is too tall for a page");
    if (y - rowHeight < bodyBottom) {
      page = document.addPage([pageWidth, pageHeight]);
      y = bodyTop;
      drawHeader();
    }
    let x = margin;
    lines.forEach((cellLines, index) => {
      page.drawRectangle({
        x,
        y: y - rowHeight,
        width: widths[index],
        height: rowHeight,
        color: rowIndex % 2 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
        borderWidth: 0.4,
        borderColor: rgb(0.82, 0.86, 0.88),
      });
      cellLines.forEach((line, lineIndex) =>
        page.drawText(line, {
          x: x + 4,
          y: y - 7 - fontSize - lineIndex * lineHeight,
          size: fontSize,
          font,
          color: rgb(0.1, 0.16, 0.2),
        }),
      );
      x += widths[index];
    });
    y -= rowHeight;
  });
  document.getPages().forEach((item, index, pages) =>
    item.drawText(`${index + 1} / ${pages.length}`, {
      x: margin,
      y: margin - 4,
      size: 8,
      font,
      color: rgb(0.3, 0.36, 0.4),
    }),
  );
  return document.save();
}
