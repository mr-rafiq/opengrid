import { describe, expect, it, vi } from "vitest";
import type { EditorOption } from "./editors";
import {
  prepareRichSelectOptions,
  RichSelectOptionsError,
  RICH_SELECT_LIMITS,
} from "./rich-select-options";

describe("owned bounded rich choices", () => {
  it("detaches and freezes records while preserving exact string identifiers", () => {
    const source = [
      { value: "9007199254740993", label: "First" },
      { value: "9007199254740994", label: "Second", disabled: true },
    ];
    const index = prepareRichSelectOptions(source);
    expect(index.indexOf("9007199254740993")).toBe(0);
    expect(index.indexOf("9007199254740994")).toBe(1);
    expect(index.indexOf("missing")).toBeUndefined();
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.options)).toBe(true);
    expect(index.options.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source[0])).toBe(false);
    source[0].label = "Changed";
    source[1].disabled = false;
    expect(index.options[0].label).toBe("First");
    expect(index.options[1].disabled).toBe(true);
  });
  it("uses Map identity for special and empty values", () => {
    const index = prepareRichSelectOptions(
      ["", "__proto__", "constructor", "toString"].map((value) => ({
        value,
        label: value,
      })),
    );
    expect(index.indexOf("")).toBe(0);
    expect(index.indexOf("__proto__")).toBe(1);
    expect(index.indexOf("constructor")).toBe(2);
    expect(index.search("")).toEqual([0, 1, 2, 3]);
  });
  it("keeps deterministic contains/prefix/subsequence matching and optional name aliases", () => {
    const index = prepareRichSelectOptions([
      { value: "one", label: "Alpine" },
      { value: "two", label: "Beta alpine", name: "BR" },
      { value: "three", label: "Czech Republic" },
      { value: "four", label: "Désactivé", disabled: true },
    ]);
    expect(index.search("ALP")).toEqual([0, 1]);
    expect(index.search("alp", "prefix")).toEqual([0]);
    expect(index.search("br", "prefix")).toEqual([1]);
    expect(index.search("czp", "fuzzy")).toEqual([2]);
    expect(index.search("cpz", "fuzzy")).toEqual([]);
    expect(index.search("desactive")).toEqual([3]);
    expect(index.search("  alp  ")).toEqual([0, 1]);
    expect(index.search(" ")).toBe(index.search(""));
    expect(Object.isFrozen(index.search("alp"))).toBe(true);
  });
  it("lowercases for the locale before removing diacritics", () => {
    const index = prepareRichSelectOptions(
      [
        { value: "a", label: "İstanbul" },
        { value: "b", label: "Isparta" },
        { value: "c", label: "Résumé" },
      ],
      "tr-tr",
    );
    expect(index.locale).toBe("tr-TR");
    expect(index.search("ist")).toEqual([0]);
    expect(index.search("ıs")).toEqual([1]);
    expect(index.search("resume")).toEqual([2]);
  });
  it("retains disabled choices in results without conflating labels and values", () => {
    const index = prepareRichSelectOptions([
      { value: "id-a", label: "Same", disabled: true },
      { value: "id-b", label: "Same" },
    ]);
    expect(index.search("same")).toEqual([0, 1]);
    expect(index.search("id-a")).toEqual([]);
    expect(index.options[0].disabled).toBe(true);
  });
  it("matches fuzzy queries by Unicode code point rather than unrelated surrogate halves", () => {
    const index = prepareRichSelectOptions([
      { value: "a", label: "🙂" + String.fromCodePoint(0x1fa00) },
      { value: "b", label: "😀" },
    ]);
    expect(index.search("😀", "fuzzy")).toEqual([1]);
  });
  it("accepts detached null-prototype scalar records", () => {
    const source = Object.assign(Object.create(null), {
      value: "a",
      label: "Alpha",
      name: undefined,
      disabled: undefined,
    });
    expect(prepareRichSelectOptions([source]).options).toEqual([
      { value: "a", label: "Alpha" },
    ]);
  });
  it("rejects duplicate values with a bounded typed path", () => {
    expect(() =>
      prepareRichSelectOptions([
        { value: "a", label: "One" },
        { value: "a", label: "Two" },
      ]),
    ).toThrowError(
      expect.objectContaining({ code: "DUPLICATE", path: "options[1].value" }),
    );
  });
  it("does not invoke source field or array-entry accessors", () => {
    const getter = vi.fn(() => "Alpha"),
      record = { value: "a" };
    Object.defineProperty(record, "label", { enumerable: true, get: getter });
    expect(() => prepareRichSelectOptions([record] as EditorOption[])).toThrow(
      RichSelectOptionsError,
    );
    const entries: EditorOption[] = [];
    Object.defineProperty(entries, "0", { enumerable: true, get: getter });
    expect(() => prepareRichSelectOptions(entries)).toThrow(
      RichSelectOptionsError,
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects object operands without coercion", () => {
    const coerce = vi.fn(() => "a");
    expect(() =>
      prepareRichSelectOptions([
        { value: { toString: coerce }, label: "A" },
      ] as unknown as EditorOption[]),
    ).toThrow(RichSelectOptionsError);
    expect(coerce).not.toHaveBeenCalled();
  });
  it.each([
    { value: 1, label: "A" },
    { value: "a", label: null },
    { value: "a", label: "A", disabled: "false" },
    { value: "a", label: "A", name: 1 },
    { value: "a", label: "A", extra: true },
    new Date(),
  ])("rejects malformed choice %j", (record) => {
    expect(() =>
      prepareRichSelectOptions([record] as unknown as EditorOption[]),
    ).toThrow(RichSelectOptionsError);
  });
  it("rejects sparse, decorated and subclass arrays", () => {
    expect(() => prepareRichSelectOptions(new Array(1))).toThrow(
      RichSelectOptionsError,
    );
    expect(() =>
      prepareRichSelectOptions(Object.assign([], { extra: true })),
    ).toThrow(RichSelectOptionsError);
    class Choices extends Array<EditorOption> {}
    expect(() => prepareRichSelectOptions(new Choices())).toThrow(
      RichSelectOptionsError,
    );
    const symbols: EditorOption[] = [];
    Object.defineProperty(symbols, Symbol.iterator, { value: () => null });
    expect(() => prepareRichSelectOptions(symbols)).toThrow(
      RichSelectOptionsError,
    );
  });
  it("supports the full choice budget and rejects excessive input before reading records", () => {
    const source = Array.from(
      { length: RICH_SELECT_LIMITS.maxOptions },
      (_, index) => ({ value: String(index), label: `Option ${index}` }),
    );
    const index = prepareRichSelectOptions(source);
    expect(index.search("Option 9999")).toEqual([9999]);
    const excessive = new Array<EditorOption>(
        RICH_SELECT_LIMITS.maxOptions + 1,
      ),
      getter = vi.fn();
    Object.defineProperty(excessive, "0", { get: getter });
    expect(() => prepareRichSelectOptions(excessive)).toThrowError(
      expect.objectContaining({ code: "LIMIT" }),
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it("caps individual, aggregate and normalized text before publishing an index", () => {
    expect(() =>
      prepareRichSelectOptions([{ value: "x".repeat(4097), label: "A" }]),
    ).toThrowError(expect.objectContaining({ code: "LIMIT" }));
    expect(() =>
      prepareRichSelectOptions([{ value: "a", label: "x".repeat(16385) }]),
    ).toThrowError(expect.objectContaining({ code: "LIMIT" }));
    expect(() =>
      prepareRichSelectOptions(
        Array.from({ length: 65 }, (_, i) => ({
          value: String(i),
          label: "x".repeat(16000),
        })),
      ),
    ).toThrowError(expect.objectContaining({ code: "LIMIT" }));
    expect(() =>
      prepareRichSelectOptions(
        Array.from({ length: 8 }, (_, i) => ({
          value: String(i),
          label: "\uFDFA".repeat(16384),
        })),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "LIMIT",
        message: "Normalized choice search budget exceeded",
      }),
    );
  });
  it("bounds queries, locales and search-mode selection", () => {
    const index = prepareRichSelectOptions([]);
    expect(() => index.search("x".repeat(257))).toThrowError(
      expect.objectContaining({ code: "LIMIT", path: "query" }),
    );
    expect(() => index.search("a", "regex" as "contains")).toThrowError(
      expect.objectContaining({ code: "SHAPE", path: "mode" }),
    );
    expect(() => index.search(12 as unknown as string)).toThrow(
      RichSelectOptionsError,
    );
    expect(() => prepareRichSelectOptions([], "")).toThrow(
      RichSelectOptionsError,
    );
    expect(() => prepareRichSelectOptions([], "not_a_language")).toThrow(
      RichSelectOptionsError,
    );
  });
});
