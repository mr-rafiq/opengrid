// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createGrid } from "@opengrid/core";
import {
  createGridLocale,
  enUS,
  esES,
  gridMessage,
  GridLocaleProvider,
  useGridLocale,
} from "./locale.js";
import type {
  GridLocale,
  GridLocaleContextValue,
  GridMessage,
  GridMessageOverrides,
} from "./locale.js";
import { MESSAGE_PARAM_TYPES } from "./locale-messages.js";
afterEach(cleanup);

function locale(
  locale: GridLocale = enUS,
  messages?: GridMessageOverrides,
): GridLocaleContextValue {
  return renderHook(() => useGridLocale(), {
    wrapper: ({ children }) => (
      <GridLocaleProvider locale={locale} messages={messages}>
        {children}
      </GridLocaleProvider>
    ),
  }).result.current;
}

describe("complete typed English and Spanish locale catalogs", () => {
  it("has the exact same complete message schema for both original catalogs", () => {
    expect(Object.keys(enUS.messages).sort()).toEqual(
      Object.keys(MESSAGE_PARAM_TYPES).sort(),
    );
    expect(Object.keys(esES.messages).sort()).toEqual(
      Object.keys(enUS.messages).sort(),
    );
    const english = locale(),
      spanish = locale(esES);
    for (const [key, fields] of Object.entries(MESSAGE_PARAM_TYPES)) {
      const params = Object.fromEntries(
        Object.entries(fields).map(([field, type]) => [
          field,
          type === "number" ? 2 : "Example",
        ]),
      );
      const notice = Reflect.apply(
        gridMessage,
        undefined,
        Object.keys(fields).length ? [key, params] : [key],
      ) as GridMessage;
      expect(typeof english.resolveMessage(notice)).toBe("string");
      expect(typeof spanish.resolveMessage(notice)).toBe("string");
      expect(english.resolveMessage(notice)).not.toContain("[object Object]");
      expect(spanish.resolveMessage(notice)).not.toContain("[object Object]");
    }
  });
  it("defaults to existing English text outside a provider and preserves legacy count phrasing", () => {
    const { result } = renderHook(() => useGridLocale());
    expect(result.current.locale).toBe("en-US");
    expect(result.current.t("grid.ariaLabel")).toBe("Data grid");
    expect(result.current.t("grid.rowCount", { count: 1 })).toBe("1 rows");
    expect(result.current.t("remote.routeCount", { count: 1 })).toBe(
      "1 rows at this route",
    );
    expect(result.current.t("chart.rowPoints", { count: 1 })).toBe(
      "row points",
    );
    expect(result.current.t("builder.depthLimit", { maximumDepth: 8 })).toBe(
      "A filter can have at most 8 nested levels",
    );
  });
  it("supports typed static/function overrides and explicit English fallback for custom locales", () => {
    const translated = locale(
      createGridLocale("fr-FR", {
        "grid.find": "Chercher",
        "grid.filterColumn": ({ column }) => "Filtrer " + column,
      }),
    );
    expect(translated.t("grid.find")).toBe("Chercher");
    expect(translated.t("grid.filterColumn", { column: "Price" })).toBe(
      "Filtrer Price",
    );
    expect(translated.t("common.cancel")).toBe("Cancel");
    const regional = createGridLocale(
      "es-mx",
      { "grid.find": "Encontrar" },
      esES,
    );
    expect(regional.id).toBe("es-MX");
    expect(locale(regional).t("common.cancel")).toBe("Cancelar");
    expect(Object.isFrozen(regional)).toBe(true);
    expect(Object.isFrozen(regional.messages)).toBe(true);
  });
  it("formats exact BigInts, finite decimals, UTC dates and language-aware plurals", () => {
    const english = locale(),
      spanish = locale(esES);
    expect(english.number(9007199254740993n)).toBe("9,007,199,254,740,993");
    expect(spanish.number(9007199254740993n)).toBe("9.007.199.254.740.993");
    expect(english.number(12.5, { minimumFractionDigits: 2 })).toBe("12.50");
    expect(spanish.number(12.5, { minimumFractionDigits: 2 })).toBe("12,50");
    const date = new Date("2026-01-02T23:00:00Z");
    expect(english.date(date)).toBe("1/2/2026");
    expect(spanish.date(date)).toBe("2/1/2026");
    expect(
      english.date(date, {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    ).toBe("01/03/2026");
    expect(date.toISOString()).toBe("2026-01-02T23:00:00.000Z");
    expect(spanish.t("grid.rowCount", { count: 0 })).toBe("0 filas");
    expect(spanish.t("grid.rowCount", { count: 1 })).toBe("1 fila");
    expect(spanish.t("grid.rowCount", { count: 2 })).toBe("2 filas");
    expect(english.plural(1, { one: "row", other: "rows" })).toBe("row");
    expect(english.plural(2, { one: "row", other: "rows" })).toBe("rows");
    expect(english.plural(1, { other: "items" })).toBe("items");
    expect(() => english.number(Infinity)).toThrow(RangeError);
    expect(() => english.date(new Date(NaN))).toThrow(RangeError);
    expect(() => english.plural(NaN, { other: "items" })).toThrow(RangeError);
  });
});

describe("safe immutable locale notices and validation", () => {
  it("snapshots descriptor scalar params and retranslates while preserving raw application/core strings", () => {
    const params = { column: "Price" },
      notice = gridMessage("grid.filterColumn", params);
    params.column = "Changed";
    expect(Object.isFrozen(notice)).toBe(true);
    expect(Object.isFrozen(notice.params)).toBe(true);
    expect(Object.isFrozen(params)).toBe(false);
    expect(locale().resolveMessage(notice)).toBe("Filter Price");
    expect(locale(esES).resolveMessage(notice)).toBe("Filtrar Price");
    const raw = "Cannot edit field: application <script>example</script>";
    expect(locale(esES).resolveMessage(raw)).toBe(raw);
  });
  it("rejects malformed overrides, language IDs and missing/extra/wrong params atomically", () => {
    for (const messages of [
      { "unknown.key": "X" },
      { "common.cancel": 1 },
      { "grid.filterColumn": "No params" },
    ])
      expect(() => createGridLocale("en-US", messages as never)).toThrow(
        TypeError,
      );
    expect(() => createGridLocale("not_a_language")).toThrow();
    expect(() => createGridLocale("")).toThrow();
    const invalid: unknown[][] = [
      ["unknown.key"],
      ["grid.filterColumn"],
      ["grid.filterColumn", { column: 1 }],
      ["grid.filterColumn", { column: "X", extra: "Y" }],
      ["grid.rowCount", { count: -1 }],
      ["grid.rowCount", { count: Number.MAX_SAFE_INTEGER + 1 }],
      ["common.cancel", {}],
    ];
    for (const args of invalid)
      expect(() => Reflect.apply(gridMessage, undefined, args)).toThrow(
        TypeError,
      );
    expect(locale().t("common.cancel")).toBe("Cancel");
    expect(() =>
      locale(undefined, { "common.cancel": "x".repeat(64001) }),
    ).toThrow();
  });
  it("never invokes accessor overrides/params or inherited prototype-like message keys", () => {
    const getter = vi.fn(() => "unexpected"),
      messages = {};
    Object.defineProperty(messages, "common.cancel", {
      enumerable: true,
      get: getter,
    });
    expect(() => createGridLocale("en-US", messages)).toThrow(
      "own data properties",
    );
    const params = {};
    Object.defineProperty(params, "column", { enumerable: true, get: getter });
    expect(() =>
      Reflect.apply(gridMessage, undefined, ["grid.filterColumn", params]),
    ).toThrow("own data properties");
    expect(() =>
      Reflect.apply(gridMessage, undefined, ["constructor"]),
    ).toThrow("Unknown");
    expect(getter).not.toHaveBeenCalled();
    expect(
      createGridLocale("en-US", Object.create({ "common.cancel": "Inherited" }))
        .messages["common.cancel"],
    ).toBe("Cancel");
  });
  it("enforces string formatter output and renders interpolated markup as literal React text", () => {
    const invalid = locale(undefined, {
      "grid.filterColumn": (() => 12) as never,
    });
    expect(() => invalid.t("grid.filterColumn", { column: "X" })).toThrow(
      "strings",
    );
    function Probe() {
      const { t } = useGridLocale();
      return (
        <p>
          {t("grid.filterColumn", { column: '<img src=x onerror="alert(1)">' })}
        </p>
      );
    }
    const { container } = render(
      <GridLocaleProvider locale={esES}>
        <Probe />
      </GridLocaleProvider>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });
  it("keeps compile-time key, parameter and override signatures strict", () => {
    if (false) {
      // @ts-expect-error unknown key
      gridMessage("grid.missing");
      // @ts-expect-error required params
      gridMessage("grid.filterColumn");
      // @ts-expect-error counts are numeric
      gridMessage("grid.rowCount", { count: "1" });
      // @ts-expect-error static keys accept no params
      gridMessage("common.cancel", { extra: true });
      // @ts-expect-error parameterized overrides require typed functions
      createGridLocale("en-US", { "grid.filterColumn": "Filter" });
    }
  });
});

describe("nested runtime React locale context", () => {
  it("inherits local overrides but resets to an explicitly selected nested bundle", () => {
    function Probe({ id }: { id: string }) {
      const { t, locale: language } = useGridLocale();
      return (
        <output data-testid={id} lang={language}>
          {t("grid.find")} / {t("common.cancel")}
        </output>
      );
    }
    render(
      <GridLocaleProvider
        locale={esES}
        messages={{ "grid.find": "Buscar local" }}
      >
        <Probe id="outer" />
        <GridLocaleProvider messages={{ "common.cancel": "Volver" }}>
          <Probe id="inherited" />
        </GridLocaleProvider>
        <GridLocaleProvider locale={enUS}>
          <Probe id="explicit" />
        </GridLocaleProvider>
      </GridLocaleProvider>,
    );
    expect(screen.getByTestId("outer").textContent).toBe(
      "Buscar local / Cancelar",
    );
    expect(screen.getByTestId("inherited").textContent).toBe(
      "Buscar local / Volver",
    );
    expect(screen.getByTestId("inherited").lang).toBe("es-ES");
    expect(screen.getByTestId("explicit").textContent).toBe("Find / Cancel");
    expect(screen.getByTestId("explicit").lang).toBe("en-US");
  });
  it("retranslates an already-open dialog/notice while preserving its DOM, draft, focus and model history", () => {
    const model = createGrid({
      rows: [{ id: "a", value: "initial" }],
      columns: [{ id: "value", field: "value", editable: true }],
      getRowId: (row) => row.id,
    });
    model.editCell("a", "value", "changed");
    const state = model.getState(),
      notice = gridMessage("grid.filterColumn", { column: "Value" });
    function Probe() {
      const { t, resolveMessage, locale: language } = useGridLocale(),
        [open, setOpen] = useState(false);
      return (
        <section lang={language}>
          <button onClick={() => setOpen(true)}>Open</button>
          <p>{resolveMessage(notice)}</p>
          {open && (
            <div role="dialog" aria-label={t("note.title")}>
              <input aria-label="Draft" defaultValue="original" />
              <button>{t("common.cancel")}</button>
            </div>
          )}
        </section>
      );
    }
    const { rerender } = render(
      <GridLocaleProvider locale={enUS}>
        <Probe />
      </GridLocaleProvider>,
    );
    fireEvent.click(screen.getByText("Open"));
    const dialog = screen.getByRole("dialog"),
      input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "unsaved draft" } });
    input.focus();
    rerender(
      <GridLocaleProvider locale={esES}>
        <Probe />
      </GridLocaleProvider>,
    );
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input.value).toBe("unsaved draft");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(
      "Nota de celda",
    );
    expect(screen.getByText("Filtrar Value")).toBeTruthy();
    expect(model.getState()).toBe(state);
    expect(model.undo()).toBe(true);
    expect(model.getRow("a")!.value).toBe("initial");
  });
});
