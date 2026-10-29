import type { EditorOption } from "./editors.js";

export type RichSelectSearchMode = "contains" | "prefix" | "fuzzy";
export const RICH_SELECT_LIMITS = Object.freeze({
  maxOptions: 10_000,
  maxValueLength: 4096,
  maxLabelLength: 16_384,
  maxCharacters: 1_000_000,
  maxSearchCharacters: 2_000_000,
  maxQueryLength: 256,
});
export class RichSelectOptionsError extends TypeError {
  constructor(
    readonly code: "SHAPE" | "DUPLICATE" | "LIMIT",
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "RichSelectOptionsError";
  }
}
export interface RichSelectChoiceIndex {
  readonly options: readonly Readonly<EditorOption>[];
  readonly locale: string;
  indexOf(value: string): number | undefined;
  /** Searches labels and optional name aliases; disabled options remain discoverable. */
  search(query: string, mode?: RichSelectSearchMode): readonly number[];
}
function fail(
  code: RichSelectOptionsError["code"],
  path: string,
  message: string,
): never {
  throw new RichSelectOptionsError(code, path, message);
}
function fold(value: string, locale: string) {
  return value
    .toLocaleLowerCase(locale)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}
function isSubsequence(text: string, query: readonly string[]): boolean {
  let next = 0;
  if (!query.length) return true;
  for (const character of text) {
    if (character === query[next]) next++;
    if (next === query.length) return true;
  }
  return false;
}

/** Own/freeze scalar choices before indexing, without invoking borrowed accessors. */
export function prepareRichSelectOptions(
  input: readonly EditorOption[],
  locale = "en-US",
): RichSelectChoiceIndex {
  if (typeof locale !== "string")
    fail("SHAPE", "locale", "Choice locale must be a language tag");
  let canonical = "";
  try {
    canonical = Intl.getCanonicalLocales(locale)[0] ?? "";
  } catch {
    return fail(
      "SHAPE",
      "locale",
      "Choice locale must be a valid language tag",
    );
  }
  if (!canonical)
    fail("SHAPE", "locale", "Choice locale must be a nonempty language tag");
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype)
    fail("SHAPE", "options", "Choices must be a plain array");
  if (input.length > RICH_SELECT_LIMITS.maxOptions)
    fail("LIMIT", "options", "At most 10000 rich choices are supported");
  if (Reflect.ownKeys(input).length !== input.length + 1)
    fail(
      "SHAPE",
      "options",
      "Choice arrays cannot have holes or additional properties",
    );
  const choices: Readonly<EditorOption>[] = [],
    searches: (readonly string[])[] = [],
    byValue = new Map<string, number>();
  let characters = 0,
    searchCharacters = 0;
  for (let index = 0; index < input.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(input, String(index));
    const path = `options[${index}]`;
    if (!entry || !("value" in entry))
      fail("SHAPE", path, "Choices cannot contain holes or accessors");
    const source: unknown = entry.value;
    if (
      !source ||
      typeof source !== "object" ||
      (Object.getPrototypeOf(source) !== Object.prototype &&
        Object.getPrototypeOf(source) !== null)
    )
      fail("SHAPE", path, "Each choice must be a plain record");
    const fields = Object.getOwnPropertyDescriptors(source);
    const keys = Reflect.ownKeys(fields);
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !["value", "label", "name", "disabled"].includes(key),
      ) ||
      keys.some((key) => !("value" in fields[key as string]))
    )
      fail(
        "SHAPE",
        path,
        "Choice records require data fields value, label, name and disabled only",
      );
    const field = (key: string): unknown =>
      Object.hasOwn(fields, key) ? fields[key].value : undefined;
    const value = field("value"),
      label = field("label"),
      name = field("name"),
      disabled = field("disabled");
    if (
      typeof value !== "string" ||
      typeof label !== "string" ||
      (name !== undefined && typeof name !== "string") ||
      (disabled !== undefined && typeof disabled !== "boolean")
    )
      fail(
        "SHAPE",
        path,
        "Choice values/labels/names must be strings and disabled must be boolean",
      );
    if (
      value.length > RICH_SELECT_LIMITS.maxValueLength ||
      label.length > RICH_SELECT_LIMITS.maxLabelLength ||
      (name?.length ?? 0) > RICH_SELECT_LIMITS.maxLabelLength
    )
      fail("LIMIT", path, "Choice field length budget exceeded");
    characters += value.length + label.length + (name?.length ?? 0);
    if (characters > RICH_SELECT_LIMITS.maxCharacters)
      fail("LIMIT", path, "Choice aggregate text budget exceeded");
    if (byValue.has(value))
      fail("DUPLICATE", `${path}.value`, "Choice values must be unique");
    const search = [
      fold(label, canonical),
      ...(name === undefined ? [] : [fold(name, canonical)]),
    ];
    searchCharacters += search.reduce((total, text) => total + text.length, 0);
    if (searchCharacters > RICH_SELECT_LIMITS.maxSearchCharacters)
      fail("LIMIT", path, "Normalized choice search budget exceeded");
    choices.push(
      Object.freeze({
        value,
        label,
        ...(name === undefined ? {} : { name }),
        ...(disabled === undefined ? {} : { disabled }),
      }),
    );
    searches.push(Object.freeze(search));
    byValue.set(value, index);
  }
  const options = Object.freeze(choices),
    all = Object.freeze(options.map((_, index) => index));
  return Object.freeze({
    options,
    locale: canonical,
    indexOf(value: string) {
      return byValue.get(value);
    },
    search(query: string, mode: RichSelectSearchMode = "contains") {
      if (typeof query !== "string")
        fail("SHAPE", "query", "Choice query must be text");
      if (!["contains", "prefix", "fuzzy"].includes(mode))
        fail("SHAPE", "mode", "Unknown choice search mode");
      if (query.length > RICH_SELECT_LIMITS.maxQueryLength)
        fail("LIMIT", "query", "Choice query length budget exceeded");
      const needle = fold(query.trim(), canonical);
      if (!needle) return all;
      const pattern = mode === "fuzzy" ? Array.from(needle) : [];
      return Object.freeze(
        searches.flatMap((fields, index) =>
          fields.some((text) =>
            mode === "prefix"
              ? text.startsWith(needle)
              : mode === "fuzzy"
                ? isSubsequence(text, pattern)
                : text.includes(needle),
          )
            ? [index]
            : [],
        ),
      );
    },
  });
}
