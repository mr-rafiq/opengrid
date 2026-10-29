import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { enUS, enMessages } from "./locale-en.js";
import { esES } from "./locale-es.js";
import { MESSAGE_PARAM_TYPES } from "./locale-messages.js";
import type {
  GridLocale,
  GridLocaleFormatters,
  GridMessage,
  GridMessageArgs,
  GridMessageKey,
  GridMessageOverrides,
  GridMessageParams,
  GridMessages,
  GridPluralForms,
} from "./locale-messages.js";
export { enUS, esES };
export type {
  GridLocale,
  GridLocaleFormatters,
  GridMessage,
  GridMessageArgs,
  GridMessageKey,
  GridMessageOverrides,
  GridMessageParams,
  GridMessages,
  GridPluralForms,
} from "./locale-messages.js";

const MAX_TEXT = 64_000;
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_TEXT)
    throw new TypeError(
      "Locale messages must return strings of at most 64000 characters",
    );
  return value;
}
function knownKey(key: unknown): key is GridMessageKey {
  return typeof key === "string" && Object.hasOwn(enMessages, key);
}
function parameters(
  key: GridMessageKey,
  value: unknown,
): Readonly<Record<string, string | number>> | undefined {
  const fields = MESSAGE_PARAM_TYPES[key] as Readonly<Record<string, string>>;
  const required = Object.keys(fields);
  if (!required.length) {
    if (value !== undefined)
      throw new TypeError("This locale message accepts no parameters");
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Locale message parameters must be an object");
  const supplied = Object.keys(value);
  if (
    supplied.length !== required.length ||
    supplied.some((field) => !Object.hasOwn(fields, field))
  )
    throw new TypeError(
      "Locale message parameters do not match the message schema",
    );
  const result: Record<string, string | number> = Object.create(null) as Record<
    string,
    string | number
  >;
  for (const field of required) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(
        "Locale message parameters must be own data properties",
      );
    const item: unknown = descriptor.value;
    if (fields[field] === "string") result[field] = text(item);
    else {
      if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0)
        throw new TypeError(
          "Locale count parameters must be nonnegative safe integers",
        );
      result[field] = item;
    }
  }
  return Object.freeze(result);
}
/** Pure typed descriptor. Scalar parameters are snapshotted; no language or React state is captured. */
export function gridMessage<K extends GridMessageKey>(
  key: K,
  ...args: GridMessageArgs<K>
): Extract<GridMessage, { key: K }> {
  if (!knownKey(key)) throw new TypeError("Unknown grid locale message key");
  const params = parameters(key, args[0]);
  return Object.freeze(
    params === undefined ? { key } : { key, params },
  ) as Extract<GridMessage, { key: K }>;
}
function checkedMessages(
  base: GridMessages,
  overrides: GridMessageOverrides | undefined,
): GridMessages {
  const result = { ...base };
  if (overrides === undefined) return Object.freeze(result);
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new TypeError("Locale overrides must be an object");
  for (const key of Object.keys(overrides)) {
    if (!knownKey(key))
      throw new TypeError("Unknown locale override key: " + key);
    const descriptor = Object.getOwnPropertyDescriptor(overrides, key);
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Locale overrides must be own data properties");
    const value: unknown = descriptor.value;
    if (Object.keys(MESSAGE_PARAM_TYPES[key]).length) {
      if (typeof value !== "function")
        throw new TypeError("Parameterized locale messages require functions");
    } else text(value);
    Object.defineProperty(result, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return Object.freeze(result);
}
/** Build a custom locale with an explicit fallback bundle (English by default). */
export function createGridLocale(
  id: string,
  overrides: GridMessageOverrides = {},
  base: GridLocale = enUS,
): GridLocale {
  if (typeof id !== "string" || !id)
    throw new TypeError("Locale id must be a nonempty BCP47 language tag");
  const canonical = Intl.getCanonicalLocales(id)[0];
  return Object.freeze({
    id: canonical,
    messages: checkedMessages(
      checkedMessages(enUS.messages, base.messages),
      overrides,
    ),
  });
}
function formatters(locale: string): GridLocaleFormatters {
  const numeric = new Intl.NumberFormat(locale),
    dates = new Intl.DateTimeFormat(locale, { timeZone: "UTC" }),
    rules = new Intl.PluralRules(locale);
  return Object.freeze({
    number(value: number | bigint, options?: Intl.NumberFormatOptions) {
      if (
        typeof value !== "bigint" &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        throw new RangeError(
          "Locale numbers must be finite numbers or BigInts",
        );
      return options === undefined
        ? numeric.format(value)
        : new Intl.NumberFormat(locale, options).format(value);
    },
    date(value: Date | number, options?: Intl.DateTimeFormatOptions) {
      const timestamp = value instanceof Date ? value.getTime() : value;
      if (typeof timestamp !== "number" || !Number.isFinite(timestamp))
        throw new RangeError("Locale dates must be valid Dates or timestamps");
      return options === undefined
        ? dates.format(timestamp)
        : new Intl.DateTimeFormat(locale, {
            ...options,
            timeZone: options.timeZone ?? "UTC",
          }).format(timestamp);
    },
    plural(count: number, forms: Readonly<GridPluralForms>) {
      if (!Number.isFinite(count))
        throw new RangeError("Plural count must be finite");
      if (!forms || typeof forms !== "object" || !Object.hasOwn(forms, "other"))
        throw new TypeError("Plural forms require an other string");
      const category = rules.select(count);
      return text(
        Object.hasOwn(forms, category) && forms[category] !== undefined
          ? forms[category]
          : forms.other,
      );
    },
  });
}
export interface GridLocaleContextValue extends GridLocaleFormatters {
  readonly locale: string;
  t<K extends GridMessageKey>(key: K, ...args: GridMessageArgs<K>): string;
  resolveMessage(message: GridMessage | string): string;
}
function contextValue(bundle: GridLocale): GridLocaleContextValue {
  const format = formatters(bundle.id);
  function render(key: GridMessageKey, values: unknown): string {
    const params = parameters(key, values);
    const template = bundle.messages[key];
    return text(
      typeof template === "string"
        ? template
        : (
            template as (
              params: unknown,
              format: GridLocaleFormatters,
            ) => string
          )(params, format),
    );
  }
  return Object.freeze({
    ...format,
    locale: bundle.id,
    t<K extends GridMessageKey>(key: K, ...args: GridMessageArgs<K>) {
      if (!knownKey(key))
        throw new TypeError("Unknown grid locale message key");
      return render(key, args[0]);
    },
    resolveMessage(message: GridMessage | string) {
      if (typeof message === "string") return message;
      if (!message || typeof message !== "object")
        throw new TypeError(
          "Grid notices must be strings or message descriptors",
        );
      const key = Object.getOwnPropertyDescriptor(message, "key"),
        params = Object.getOwnPropertyDescriptor(message, "params");
      if (
        !key ||
        !("value" in key) ||
        !knownKey(key.value) ||
        (params && !("value" in params))
      )
        throw new TypeError("Invalid grid message descriptor");
      return render(key.value, params?.value);
    },
  });
}
interface LocaleContextState {
  readonly bundle: GridLocale;
  readonly value: GridLocaleContextValue;
}
const defaultState: LocaleContextState = Object.freeze({
  bundle: enUS,
  value: contextValue(enUS),
});
const LocaleContext = createContext<LocaleContextState>(defaultState);
export interface GridLocaleProviderProps {
  readonly locale?: GridLocale;
  readonly messages?: GridMessageOverrides;
  readonly children: ReactNode;
}
/** Context updates translate existing UI; they do not key/remount children or mutate grid models. */
export function GridLocaleProvider({
  locale,
  messages,
  children,
}: GridLocaleProviderProps) {
  const inherited = useContext(LocaleContext);
  const state = useMemo(() => {
    const base = locale ?? inherited.bundle;
    const bundle = createGridLocale(base.id, messages, base);
    return Object.freeze({ bundle, value: contextValue(bundle) });
  }, [locale, messages, inherited]);
  return (
    <LocaleContext.Provider value={state}>{children}</LocaleContext.Provider>
  );
}
export function useGridLocale(): GridLocaleContextValue {
  return useContext(LocaleContext).value;
}
