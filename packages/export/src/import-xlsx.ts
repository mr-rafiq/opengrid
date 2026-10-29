import type { Column } from "@opengrid/core";
import JSZip from "jszip";
import { SaxesParser, type SaxesTagNS } from "saxes";
import type { Cell, CellValue } from "exceljs";

export interface ImportWarning {
  code: "formula-cached" | "formula-text" | "rich-text" | "hyperlink-text";
  rowNumber: number;
  columnId: string;
  message: string;
}
export interface ImportXlsxOptions<T> {
  columns: Column<T>[];
  mapRow: (values: Record<string, unknown>, rowNumber: number) => T;
  sheetName?: string;
  headerRow?: number;
  maxFileBytes?: number;
  maxUncompressedBytes?: number;
  maxRows?: number;
  maxColumns?: number;
  maxCells?: number;
  formulaPolicy?: "reject" | "cached" | "text";
}
interface Limits {
  fileBytes: number;
  expandedBytes: number;
  rows: number;
  columns: number;
  cells: number;
  header: number;
}
interface ZipEntry {
  name: string;
  size: number;
  compressed: number;
  crc: number;
}
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function positive(value: number | undefined, fallback: number, label: string) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1)
    throw new RangeError(`${label} must be a positive safe integer`);
  return result;
}
function settings<T>(options: ImportXlsxOptions<T>): Limits {
  const limits = {
    fileBytes: positive(options.maxFileBytes, 10_000_000, "maxFileBytes"),
    expandedBytes: positive(
      options.maxUncompressedBytes,
      32_000_000,
      "maxUncompressedBytes",
    ),
    rows: positive(options.maxRows, 50_000, "maxRows"),
    columns: positive(options.maxColumns, 256, "maxColumns"),
    cells: positive(options.maxCells, 250_000, "maxCells"),
    header: positive(options.headerRow, 1, "headerRow"),
  };
  if (limits.rows > 1_048_575 || limits.columns > 16_384 || limits.header > 100)
    throw new RangeError(
      "Import limits exceed supported worksheet bounds (headerRow maximum 100)",
    );
  return limits;
}

/** Central-directory metadata is read independently, never from private JSZip fields. */
function inspectZip(bytes: Uint8Array, limits: Limits): ZipEntry[] {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 22 ||
    bytes.byteLength > limits.fileBytes
  )
    throw new Error("XLSX file is empty, truncated or exceeds maxFileBytes");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  if (u32(0) !== 0x04034b50)
    throw new Error("Only ordinary ZIP-based .xlsx files are supported");
  let end = -1;
  for (
    let at = bytes.length - 22;
    at >= Math.max(0, bytes.length - 22 - 65535);
    at--
  )
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) {
      end = at;
      break;
    }
  if (end < 0) throw new Error("ZIP end-of-directory record is missing");
  const count = u16(end + 10),
    directorySize = u32(end + 12),
    directoryOffset = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count)
    throw new Error("Multi-disk ZIP archives are unsupported");
  if (
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  )
    throw new Error("ZIP64 archives are unsupported");
  if (!count || count > 2048 || directoryOffset + directorySize !== end)
    throw new Error("Invalid or oversized ZIP central directory");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const names = new Set<string>(),
    entries: ZipEntry[] = [],
    ranges: { start: number; end: number }[] = [];
  let offset = directoryOffset,
    expanded = 0,
    worksheetCount = 0;
  function extras(start: number, length: number) {
    const end = start + length;
    for (let at = start; at < end;) {
      if (at + 4 > end) throw new Error("Malformed ZIP extra field");
      const id = u16(at),
        size = u16(at + 2);
      at += 4;
      if (at + size > end) throw new Error("Malformed ZIP extra field");
      if (id === 1 || id === 0x9901 || id === 0x7075)
        throw new Error(
          "ZIP64, encrypted or alternate Unicode-path ZIP fields are unsupported",
        );
      at += size;
    }
  }
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50)
      throw new Error("Malformed ZIP central directory entry");
    const flags = u16(offset + 8),
      method = u16(offset + 10),
      crc = u32(offset + 16);
    const compressed = u32(offset + 20),
      size = u32(offset + 24);
    const nameLength = u16(offset + 28),
      extraLength = u16(offset + 30),
      commentLength = u16(offset + 32);
    const localOffset = u32(offset + 42),
      next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || nameLength < 1 || nameLength > 512)
      throw new Error("Invalid ZIP entry name or boundary");
    if (
      u16(offset + 6) > 20 ||
      u16(offset + 34) ||
      compressed === 0xffffffff ||
      size === 0xffffffff ||
      localOffset === 0xffffffff
    )
      throw new Error("ZIP64 or unsupported ZIP entry version");
    if (
      flags & ~0x080e ||
      ![0, 8].includes(method) ||
      (method === 0 && flags & 6)
    )
      throw new Error("Encrypted or unsupported ZIP compression/flags");
    if (((u32(offset + 38) >>> 16) & 0xf000) === 0xa000)
      throw new Error("ZIP symbolic links are unsupported");
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (
      /[^\x20-\x7e]|[\\:?#]/u.test(name) ||
      name.startsWith("/") ||
      name
        .split("/")
        .some(
          (part, partIndex, parts) =>
            part === "." ||
            part === ".." ||
            (!part && partIndex !== parts.length - 1) ||
            ["__proto__", "constructor", "prototype"].includes(part),
        )
    )
      throw new Error("Unsafe or unsupported ZIP path");
    if (names.has(name.toLowerCase()))
      throw new Error("Duplicate ZIP part names");
    names.add(name.toLowerCase());
    if (/\.bin$|vbaProject|\/embeddings\//iu.test(name))
      throw new Error(
        "Macros, binary workbooks and embedded objects are unsupported",
      );
    if (/^xl\/worksheets\/[^/]+\.xml$/u.test(name) && ++worksheetCount > 32)
      throw new Error("At most 32 worksheets are supported");
    expanded += size;
    if (
      expanded > limits.expandedBytes ||
      size > limits.expandedBytes ||
      size > Math.max(1, compressed) * 1000
    )
      throw new Error(
        "ZIP expanded size or compression ratio exceeds import limits",
      );
    extras(offset + 46 + nameLength, extraLength);
    if (localOffset + 30 > directoryOffset || u32(localOffset) !== 0x04034b50)
      throw new Error("ZIP local header is missing or overlaps the directory");
    const localNameLength = u16(localOffset + 26),
      localExtraLength = u16(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (
      dataStart + compressed > directoryOffset ||
      u16(localOffset + 6) !== flags ||
      u16(localOffset + 8) !== method
    )
      throw new Error("ZIP local/central headers disagree");
    if (
      decoder.decode(
        bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength),
      ) !== name
    )
      throw new Error("ZIP local/central names disagree");
    extras(localOffset + 30 + localNameLength, localExtraLength);
    let dataEnd = dataStart + compressed;
    if (flags & 8) {
      if (dataEnd + 12 > directoryOffset)
        throw new Error("ZIP data descriptor is truncated");
      const descriptor = u32(dataEnd) === 0x08074b50 ? dataEnd + 4 : dataEnd;
      if (
        descriptor + 12 > directoryOffset ||
        u32(descriptor) !== crc ||
        u32(descriptor + 4) !== compressed ||
        u32(descriptor + 8) !== size
      )
        throw new Error("ZIP data descriptor disagrees with its directory");
      dataEnd = descriptor + 12;
    } else if (
      u32(localOffset + 14) !== crc ||
      u32(localOffset + 18) !== compressed ||
      u32(localOffset + 22) !== size
    )
      throw new Error("ZIP local/central sizes or CRC disagree");
    ranges.push({ start: localOffset, end: dataEnd });
    entries.push({ name, size, compressed, crc });
    offset = next;
  }
  if (offset !== end)
    throw new Error("ZIP directory length disagrees with entry metadata");
  ranges.sort((a, b) => a.start - b.start);
  if (
    ranges.some(
      (range, index) => index > 0 && range.start < ranges[index - 1].end,
    )
  )
    throw new Error("ZIP parts overlap");
  for (const required of [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
  ])
    if (!entries.some((entry) => entry.name === required))
      throw new Error(`Required XLSX part missing: ${required}`);
  if (!worksheetCount) throw new Error("XLSX has no supported worksheet parts");
  return entries;
}

function attribute(tag: SaxesTagNS, name: string) {
  return Object.values(tag.attributes).find((item) => item.local === name)
    ?.value;
}
function coordinate(value: string, limits: Limits) {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/u.exec(value);
  if (!match) throw new Error("Invalid XLSX cell reference");
  let column = 0;
  for (const letter of match[1])
    column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (column > limits.columns || row > limits.rows + limits.header)
    throw new Error("Worksheet reference exceeds row/column limits");
  return { row, column };
}

async function preflight(bytes: Uint8Array, limits: Limits) {
  const entries = inspectZip(bytes, limits);
  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: false,
    createFolders: false,
  });
  const loadedNames = Object.keys(zip.files);
  if (
    loadedNames.length !== entries.length ||
    loadedNames.some((name) => !entries.some((entry) => entry.name === name))
  )
    throw new Error("ZIP parser part names disagree with validated metadata");
  let totalBytes = 0,
    totalCells = 0,
    totalRows = 0,
    totalNodes = 0,
    contentTypeSeen = false,
    sharedStrings = 0,
    highestSharedReference = -1;
  const worksheetIds = new Set<number>(),
    worksheetNames = new Set<string>();
  const sheets = entries.filter((entry) =>
    /^xl\/worksheets\/[^/]+\.xml$/u.test(entry.name),
  ).length;
  for (const entry of entries) {
    const xml = /\.(?:xml|rels|vml)$/iu.test(entry.name);
    const worksheet = /^xl\/worksheets\/[^/]+\.xml$/u.test(entry.name);
    let depth = 0,
      row = 0,
      lastRow = 0,
      cellColumn = 0,
      rowOpen = false,
      rootSeen = false,
      lastColumnDefinition = 0;
    let sharedItem = false,
      itemLength = 0,
      cellType = "",
      valueOpen = false,
      valueText = "",
      inlineLength = 0;
    const parser = xml ? new SaxesParser({ xmlns: true }) : undefined;
    if (parser) {
      parser.on("error", (error) => {
        throw new Error(`Malformed XLSX XML (${entry.name}): ${error.message}`);
      });
      parser.on("doctype", () => {
        throw new Error("DTD/entity declarations are forbidden in XLSX XML");
      });
      parser.on("xmldecl", (declaration) => {
        if (
          declaration.encoding &&
          !/^(?:utf-8|us-ascii)$/iu.test(declaration.encoding)
        )
          throw new Error("Only UTF-8 XLSX XML is supported");
      });
      parser.on("opentag", (tag) => {
        if (++depth > 64 || ++totalNodes > limits.cells * 12 + 20_000)
          throw new Error("XLSX XML complexity limit exceeded");
        if (!rootSeen) {
          rootSeen = true;
          if (worksheet && (tag.local !== "worksheet" || tag.uri !== MAIN_NS))
            throw new Error("Unsupported worksheet XML namespace");
        }
        if (tag.local === "definedName")
          throw new Error(
            "Named ranges are unsupported by the bounded XLSX importer",
          );
        if (entry.name === "xl/sharedStrings.xml" && tag.local === "si") {
          if (++sharedStrings > limits.cells)
            throw new Error("Actual shared-string count exceeds cell limits");
          sharedItem = true;
          itemLength = 0;
        }
        if (entry.name === "xl/workbook.xml" && tag.local === "sheet") {
          const id = Number(attribute(tag, "sheetId")),
            name = attribute(tag, "name");
          if (
            !Number.isInteger(id) ||
            id < 1 ||
            id > 2048 ||
            worksheetIds.has(id) ||
            !name ||
            name.length > 31 ||
            worksheetNames.has(name.toLowerCase())
          )
            throw new Error(
              "Invalid, duplicate or oversized workbook sheet identifiers",
            );
          worksheetIds.add(id);
          worksheetNames.add(name.toLowerCase());
          if (worksheetIds.size > 32)
            throw new Error("At most 32 workbook sheets are supported");
        }
        const count = attribute(tag, "count"),
          unique = attribute(tag, "uniqueCount");
        for (const declared of [count, unique])
          if (
            declared !== undefined &&
            (!/^\d+$/u.test(declared) || Number(declared) > limits.cells)
          )
            throw new Error("XLSX declared collection exceeds cell limits");
        if (entry.name === "[Content_Types].xml") {
          const type = attribute(tag, "ContentType");
          if (type && /macroEnabled|vba|binary/iu.test(type))
            throw new Error(
              "Only non-macro .xlsx workbook content is supported",
            );
          if (
            type ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
          )
            contentTypeSeen = true;
        }
        if (!worksheet) return;
        if (tag.local === "mergeCell")
          throw new Error(
            "Merged cells are unsupported by the bounded XLSX importer",
          );
        const reference = attribute(tag, "ref");
        if (
          reference &&
          ["dimension", "hyperlink", "autoFilter", "f"].includes(tag.local)
        )
          reference.split(":").forEach((part) => coordinate(part, limits));
        if (tag.local === "col") {
          const min = Number(attribute(tag, "min")),
            max = Number(attribute(tag, "max"));
          if (
            !Number.isInteger(min) ||
            !Number.isInteger(max) ||
            min < 1 ||
            max < min ||
            max > limits.columns ||
            min <= lastColumnDefinition
          )
            throw new Error("Worksheet column metadata exceeds limits");
          lastColumnDefinition = max;
        }
        if (tag.local === "row") {
          const specified = attribute(tag, "r");
          row = specified === undefined ? lastRow + 1 : Number(specified);
          if (
            !Number.isInteger(row) ||
            row <= lastRow ||
            row > limits.rows + limits.header
          )
            throw new Error(
              "Worksheet row index exceeds limits or is out of order",
            );
          if (++totalRows > limits.rows + limits.header * sheets)
            throw new Error("Workbook row budget exceeded");
          lastRow = row;
          cellColumn = 0;
          rowOpen = true;
          const spans = attribute(tag, "spans");
          if (spans && !/^\d+:\d+$/u.test(spans))
            throw new Error("Invalid worksheet row span");
          if (
            spans &&
            spans
              .split(":")
              .some(
                (value) => Number(value) < 1 || Number(value) > limits.columns,
              )
          )
            throw new Error("Worksheet row span exceeds column limits");
        }
        if (tag.local === "c") {
          if (!rowOpen || ++totalCells > limits.cells)
            throw new Error(
              "Worksheet cells exceed limits or occur outside a row",
            );
          const ref = attribute(tag, "r");
          const position = ref
            ? coordinate(ref, limits)
            : { row, column: cellColumn + 1 };
          if (
            position.row !== row ||
            position.column <= cellColumn ||
            position.column > limits.columns
          )
            throw new Error(
              "Worksheet cells have invalid, duplicate or out-of-order coordinates",
            );
          cellColumn = position.column;
          cellType = attribute(tag, "t") ?? "";
          inlineLength = 0;
        }
        if (tag.local === "v" && cellType === "s") {
          valueOpen = true;
          valueText = "";
        }
      });
      const text = (value: string) => {
        if (sharedItem && (itemLength += value.length) > 32767)
          throw new Error("Shared-string text exceeds XLSX cell length");
        if (
          worksheet &&
          cellType === "inlineStr" &&
          (inlineLength += value.length) > 32767
        )
          throw new Error("Inline text exceeds XLSX cell length");
        if (valueOpen) {
          valueText += value;
          if (valueText.length > 16)
            throw new Error("Invalid shared-string reference");
        }
      };
      parser.on("text", text);
      parser.on("cdata", text);
      parser.on("closetag", (tag) => {
        if (worksheet && tag.local === "row") rowOpen = false;
        if (entry.name === "xl/sharedStrings.xml" && tag.local === "si")
          sharedItem = false;
        if (worksheet && tag.local === "v" && valueOpen) {
          if (!/^\d+$/u.test(valueText) || Number(valueText) >= limits.cells)
            throw new Error("Shared-string reference exceeds limits");
          highestSharedReference = Math.max(
            highestSharedReference,
            Number(valueText),
          );
          valueOpen = false;
        }
        if (worksheet && tag.local === "c") cellType = "";
        depth--;
      });
    }
    await new Promise<void>((resolve, reject) => {
      let actual = 0,
        crc = 0xffffffff,
        failed = false;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      // JSZip documents this public ZipObject method, but 3.10's declarations omit it.
      const part = zip.files[entry.name] as JSZip.JSZipObject & {
        internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
      };
      const stream = part.internalStream("uint8array");
      function fail(reason: unknown) {
        if (!failed) {
          failed = true;
          stream.pause();
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
      }
      stream.on("data", (chunk: Uint8Array) => {
        if (failed) return;
        try {
          actual += chunk.length;
          totalBytes += chunk.length;
          if (
            actual > entry.size ||
            totalBytes > limits.expandedBytes ||
            actual > Math.max(1, entry.compressed) * 1000
          )
            throw new Error(
              "Actual expanded ZIP bytes exceed metadata or import limits",
            );
          for (const byte of chunk)
            crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
          if (parser) parser.write(decoder.decode(chunk, { stream: true }));
        } catch (error) {
          fail(error);
        }
      });
      stream.on("error", fail);
      stream.on("end", () => {
        if (failed) return;
        try {
          if (actual !== entry.size || ~crc >>> 0 !== entry.crc)
            throw new Error("ZIP size/CRC integrity check failed");
          if (parser) {
            parser.write(decoder.decode());
            parser.close();
            if (!rootSeen) throw new Error("XLSX XML part is empty");
          }
          resolve();
        } catch (error) {
          fail(error);
        }
      });
      stream.resume();
    });
  }
  if (!contentTypeSeen)
    throw new Error("Archive is not a supported .xlsx workbook");
  if (highestSharedReference >= sharedStrings)
    throw new Error("XLSX cell references a missing shared string");
}

function importedValue(
  cell: Cell,
  policy: "reject" | "cached" | "text",
  rowNumber: number,
  columnId: string,
  warnings: ImportWarning[],
): unknown {
  let value: CellValue = cell.value;
  if (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  ) {
    if (policy === "reject")
      throw new Error(
        `Formula import is disabled at row ${rowNumber}, column ${columnId}`,
      );
    if (policy === "text") {
      const formula = cell.formula;
      if (!formula)
        throw new Error(
          `Formula text unavailable at row ${rowNumber}, column ${columnId}`,
        );
      warnings.push({
        code: "formula-text",
        rowNumber,
        columnId,
        message: "Formula preserved as inert text, not evaluated",
      });
      return "=" + formula;
    }
    if (value.result === undefined)
      throw new Error(
        `Cached formula result unavailable at row ${rowNumber}, column ${columnId}`,
      );
    warnings.push({
      code: "formula-cached",
      rowNumber,
      columnId,
      message: "Untrusted cached formula result imported without recalculation",
    });
    value = value.result;
  }
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value !== "object") return value;
  if ("error" in value)
    throw new Error(
      `Spreadsheet error ${value.error} at row ${rowNumber}, column ${columnId}`,
    );
  if ("richText" in value) {
    warnings.push({
      code: "rich-text",
      rowNumber,
      columnId,
      message: "Rich-text formatting was flattened",
    });
    return value.richText.map((part) => part.text).join("") || undefined;
  }
  if ("hyperlink" in value) {
    warnings.push({
      code: "hyperlink-text",
      rowNumber,
      columnId,
      message: "Hyperlink imported as display text; target not followed",
    });
    return value.text === "" ? undefined : value.text;
  }
  throw new Error(
    `Unsupported cell value at row ${rowNumber}, column ${columnId}`,
  );
}

function coerce<T>(value: unknown, column: Column<T>): unknown {
  if (value === undefined || column.valueParser) return value;
  if (column.type === "number") {
    if (typeof value !== "string" && typeof value !== "number")
      throw new Error("Expected a number");
    if (typeof value === "string" && !value.trim()) return undefined;
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error("Expected a finite number");
    return result;
  }
  if (column.type === "bigint") {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new Error(
        "Unsafe numeric BigInt value; export exact integers as text",
      );
    if (!/^[+-]?\d+$/u.test(String(value)))
      throw new Error("Expected exact integer text");
    return BigInt(String(value));
  }
  if (column.type === "boolean") {
    if (
      value !== true &&
      value !== false &&
      value !== "true" &&
      value !== "false"
    )
      throw new Error("Expected true or false");
    return value === true || value === "true";
  }
  if (column.type === "date") {
    if (
      !(value instanceof Date) &&
      (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(value))
    )
      throw new Error("Expected a Date or ISO date text");
    const result =
      value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(result.getTime()))
      throw new Error("Expected a valid date");
    if (typeof value === "string") {
      const datePart = value.slice(0, 10),
        calendar = new Date(datePart + "T00:00:00.000Z");
      if (
        !Number.isFinite(calendar.getTime()) ||
        calendar.toISOString().slice(0, 10) !== datePart
      )
        throw new Error("Expected a valid calendar date");
    }
    return result;
  }
  return column.type === "text" ? String(value) : value;
}

/** Bounded genuine XLSX parsing. Never evaluates formulas or mutates a grid model. */
export async function importXlsx<T>(
  bytes: Uint8Array,
  options: ImportXlsxOptions<T>,
): Promise<{ rows: T[]; warnings: ImportWarning[] }> {
  const limits = settings(options);
  const policy = options.formulaPolicy ?? "reject";
  if (!["reject", "cached", "text"].includes(policy))
    throw new Error("Unknown formulaPolicy");
  const aliases = new Map<string, Column<T>>(),
    ids = new Set<string>();
  for (const column of options.columns) {
    if (!column.id || ids.has(column.id))
      throw new Error("Import column IDs must be nonempty and unique");
    ids.add(column.id);
    for (const alias of new Set(
      [column.id.trim(), column.header?.trim()].filter(
        (value): value is string => Boolean(value),
      ),
    )) {
      if (aliases.has(alias) && aliases.get(alias) !== column)
        throw new Error(`Import schema header collision: ${alias}`);
      aliases.set(alias, column);
    }
  }
  if (!options.columns.length || options.columns.length > limits.columns)
    throw new Error("Import schema has no columns or exceeds maxColumns");
  await preflight(bytes, limits);
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = options.sheetName
    ? workbook.getWorksheet(options.sheetName)
    : workbook.worksheets[0];
  if (!sheet) throw new Error("Requested XLSX worksheet does not exist");
  const headers = sheet.getRow(limits.header),
    bindings: { index: number; column: Column<T> }[] = [],
    bound = new Set<string>();
  headers.eachCell({ includeEmpty: false }, (cell, index) => {
    if (typeof cell.value !== "string" || !cell.value.trim())
      throw new Error("Import headers must be nonempty plain strings");
    const column = aliases.get(cell.value.trim());
    if (!column) throw new Error(`Unknown import header: ${cell.value}`);
    if (bound.has(column.id))
      throw new Error(`Duplicate import header for ${column.id}`);
    bound.add(column.id);
    bindings.push({ index, column });
  });
  if (!bindings.length)
    throw new Error("XLSX worksheet has no matching header row");
  const rows: T[] = [],
    warnings: ImportWarning[] = [];
  for (
    let rowNumber = limits.header + 1;
    rowNumber <= sheet.rowCount;
    rowNumber++
  ) {
    const worksheetRow = sheet.getRow(rowNumber),
      values: Record<string, unknown> = Object.create(null);
    let meaningful = false;
    for (const { index, column } of bindings) {
      try {
        const raw = importedValue(
          worksheetRow.getCell(index),
          policy,
          rowNumber,
          column.id,
          warnings,
        );
        if (raw !== undefined) meaningful = true;
        values[column.id] = coerce(raw, column);
      } catch (error) {
        throw new Error(
          `Import row ${rowNumber}, column ${column.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    worksheetRow.eachCell({ includeEmpty: false }, (cell, index) => {
      if (
        cell.value != null &&
        cell.value !== "" &&
        !bindings.some((binding) => binding.index === index)
      )
        throw new Error(
          `Import row ${rowNumber} contains data under an unmapped blank header`,
        );
    });
    if (!meaningful) continue;
    if (rows.length >= limits.rows)
      throw new Error("Imported row limit exceeded");
    let row: T;
    try {
      row = options.mapRow(values, rowNumber);
    } catch (error) {
      throw new Error(
        `Import mapRow failed at row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (row === null || typeof row !== "object" || Array.isArray(row))
      throw new Error(`mapRow must return an object at row ${rowNumber}`);
    row = { ...row };
    const parsed = new Map<string, unknown>();
    for (const column of options.columns) {
      try {
        const value = column.valueParser
          ? column.valueParser(values[column.id], row)
          : values[column.id];
        parsed.set(column.id, value);
      } catch (error) {
        throw new Error(
          `Import parser failed at row ${rowNumber}, column ${column.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const column of options.columns)
      if (column.valueParser && column.field)
        Object.defineProperty(row, column.field, {
          value: parsed.get(column.id),
          enumerable: true,
          writable: true,
          configurable: true,
        });
    for (const column of options.columns) {
      const value = column.valueGetter
        ? column.valueGetter(row)
        : column.field
          ? row[column.field]
          : parsed.get(column.id);
      const error = column.validate?.(value, row);
      if (error)
        throw new Error(
          `Import row ${rowNumber}, column ${column.id}: ${error}`,
        );
    }
    rows.push(row);
  }
  return { rows, warnings };
}
