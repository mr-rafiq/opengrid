# Localization

Built-in React workflows share original English (`enUS`) and Spanish (`esES`) catalogs with 467 typed message keys, overrides and immutable notices. Grid, filters (including resident set-list, typed conditions and independent named filter dialogs and contextual command menus), editors (including Formula/Literal mode and searchable choice dialogs), dialogs, remote bindings, charts and print controls consume the provider and retain state during language changes. This is UI localization; the unsupported boundaries below remain part of the contract.

```tsx
import { DataGrid, GridLocaleProvider, esES } from "@opengrid/react";

<GridLocaleProvider
  locale={esES}
  messages={{
    "grid.filterColumn": ({ column }) => `Filtrar columna ${column}`,
  }}
>
  <DataGrid model={model} />
</GridLocaleProvider>;
```

`GridLocaleProvider` accepts a `GridLocale` bundle and optional `GridMessageOverrides`. Without a provider, built-in components use English. A nested provider with only overrides inherits its parent's resolved language/messages. An explicitly selected nested locale starts from that bundle instead. Locale changes update React context without changing component keys or model state; adapters preserve editor drafts, dialog state, focus, selection, history and pending option providers. Component roots expose the resolved HTML `lang` value. The provider does not change the document's language globally.

`useGridLocale()` exposes `t(key, params?)`, `resolveMessage`, `number`, `date`, `plural` and the canonical locale tag. Static override entries are strings. Parameterized entries are typed `(params, format) => string` functions. Missing custom entries fall back to the explicit base bundle, English by default. `createGridLocale("fr-FR", overrides)` creates a partial custom locale with that fallback; it does not claim a complete French translation. Pass a third base bundle when a regional locale should inherit Spanish.

Number formatting uses Intl directly, preserving BigInt precision without converting to Number. Date formatting is opt-in and defaults to UTC for deterministic rendering; explicit time zones are supported. Plural selection uses `Intl.PluralRules` with a required `other` fallback. These helpers format library UI text; they do not change data values, column formatters, parsers, native date input formats or spreadsheet formulas. English catalog text preserves existing wording, including legacy singular-count phrases such as `1 rows`; Spanish count messages select their own singular/plural forms.

## Notices and safe text

```ts
const notice = gridMessage("move.moved", { rowId: "order-7", position: 2 });
// Store the descriptor, then resolve during render using the current locale.
setAnnouncement(notice);
const displayed = resolveMessage(announcement);
```

`GridMessage` is a discriminated key/params union. `gridMessage` validates and snapshots scalar parameters without capturing language or React state. Store descriptors for library-owned announcements, loading failures and validation text so already-visible notices retranslate. Keep application/provider errors and existing core diagnostic strings as raw strings; `resolveMessage` returns those strings unchanged. Never identify an error's origin by matching English text. A component can carry its own message descriptor in a typed local Error subclass, then resolve it after catching it. Parameters remain scalar; compose translated operator labels or error wrappers at render time rather than storing translated text.

Built-in row-reorder reasons are recognized by their original frozen status-object ownership, queried through `getBuiltinRowReorderReason`. A custom status or copied status remains authoritative raw text, even if it carries the same reason code or wording. The headless status shape and message strings are unchanged; no English-text comparisons select translations.

Messages are strings rendered through ordinary React text nodes. There is no HTML parsing, eval or executable template language. Unknown keys, malformed overrides, accessor properties and mismatched parameters are rejected. Owned text/parameter strings are bounded to 64,000 characters; numeric count parameters must be nonnegative safe integers. Descriptor/catalog objects are frozen without freezing borrowed application objects. Locale formatter callbacks are application code and must be pure; thrown errors propagate. Raw legacy/application strings are preserved, including their content and length.

## Coverage and boundaries

The catalog inventories DataGrid tools, chooser, pagination, Find, drag/span notices, keyboard help and ARIA; group-header controls; advanced/range filters; built-in editors; row-edit and note dialogs; clipboard/fill notices; remote bindings; chart controls; and print views. Components consume the same provider, including nested detail grids and standalone exported controls. Column headers, group names, cell values, choice labels, custom renderers/formatters, arbitrary validation messages and application-generated errors remain application-owned. Existing unstructured core diagnostic strings remain unchanged and may be English.

[RTL layout](RTL.md) is available through an explicit, independent direction property; choosing a locale does not infer direction. [Touch interaction](TOUCH.md) has a separate native-pan, tap, range and resize contract. Physical-device coverage, automatic locale-aware data parsing and every native browser dialog's language remain separate gaps. The demo language selector switches the existing grid in place. Its Ctrl/Cmd+Shift+L shortcut demonstrates changing language while an editor/dialog retains its draft and focus.

Tests cover catalog/schema completeness, overrides and fallback, parameter validation, plural/date/BigInt formatting, literal markup rendering, nested inheritance, immutable notices and runtime switching without DOM/draft/focus/model-history reset. Component-level and real-browser scenarios exercise grid drafts, dialogs, pending option providers, Find, charts, stale print capture and remote state. See the [verification record](VERIFICATION.md) for executed complete-suite results.

The public [AG Grid localization specification](https://www.ag-grid.com/react-data-grid/localisation/) describes supplied locale maps, custom overrides and application translation callbacks. OpenGrid's catalogs, typed API and runtime context update behavior are original code.
