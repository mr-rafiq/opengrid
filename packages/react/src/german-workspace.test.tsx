// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createGrid, ServerSideRowModel } from "@opengrid/core";
import { deDE, GridLocaleProvider, useGridLocale } from "./locale.js";
import { GridWorkspace } from "./grid-workspace.js";
import { GridSidePanel } from "./side-panel.js";
import { ServerSidePanel } from "./server-side-panel.js";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("formats German counts, dates and parameterized controls without English catalog fallback", () => {
  const { result } = renderHook(() => useGridLocale(), {
    wrapper: ({ children }) => (
      <GridLocaleProvider locale={deDE}>{children}</GridLocaleProvider>
    ),
  });
  expect(result.current.locale).toBe("de-DE");
  expect(result.current.t("grid.rowCount", { count: 1 })).toBe("1 Zeile");
  expect(result.current.t("builder.addGroup", { kind: "AND" })).toBe(
    "UND-Gruppe hinzufügen",
  );
  expect(result.current.t("grid.rowCount", { count: 12345 })).toBe(
    "12.345 Zeilen",
  );
  expect(result.current.number(1234.5)).toBe("1.234,5");
  expect(
    result.current.t("grid.editCell", { column: "Menge", rowId: "12" }),
  ).toBe("Menge in Zeile 12 bearbeiten");
  expect(result.current.t("sidePanel.groupColumn")).toBe(
    "Nach {column} gruppieren",
  );
  expect(result.current.date(new Date("2026-11-04T00:00:00Z"))).toBe(
    "4.11.2026",
  );
});
it("localizes workspace and sidebar defaults while preserving explicit host labels and aggregate codes", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const model = createGrid({
    rows: [{ id: "a", amount: 12 }],
    getRowId: (r) => r.id,
    columns: [
      { id: "amount", field: "amount", type: "number", header: "Betrag" },
    ],
  });
  render(
    <GridLocaleProvider locale={deDE}>
      <GridWorkspace
        panels={[
          {
            id: "fields",
            label: "Felder",
            content: (
              <GridSidePanel model={model} labels={{ search: "Feldsuche" }} />
            ),
          },
        ]}
      >
        <p>Kalkulation</p>
      </GridWorkspace>
    </GridLocaleProvider>,
  );
  expect(
    screen
      .getByRole("complementary", { name: "Tabellenbereiche" })
      .closest(".og-workspace")
      ?.getAttribute("lang"),
  ).toBe("de-DE");
  expect(screen.getByRole("tab", { name: "Spalten" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Filter" })).toBeTruthy();
  expect(screen.getByRole("searchbox", { name: "Feldsuche" })).toBeTruthy();
  const values = screen.getByRole("combobox", { name: "Werte: Betrag" });
  expect(
    screen.getByRole("option", { name: "Summe" }).getAttribute("value"),
  ).toBe("sum");
  fireEvent.change(values, { target: { value: "sum" } });
  expect(model.getColumnDefinitions()[0].aggregate).toBe("sum");
});
it("localizes provider conditions and aggregates without changing query identifiers", () => {
  const model = new ServerSideRowModel<{ amount: number }>({
    getRows: async () => ({ nodes: [], rowCount: 0 }),
  });
  try {
    render(
      <GridLocaleProvider locale={deDE}>
        <ServerSidePanel
          model={model}
          columns={[
            { id: "amount", field: "amount", type: "number", header: "Betrag" },
          ]}
          onColumnsChange={() => {}}
        />
      </GridLocaleProvider>,
    );
    expect(
      screen.getByText(
        "Gruppierung, Werte und Bedingungen werden beim Datenanbieter ausgeführt.",
      ),
    ).toBeTruthy();
    const select = screen.getByRole("combobox", { name: "Werte: Betrag" });
    expect(
      screen
        .getByRole("option", { name: "Durchschnitt" })
        .getAttribute("value"),
    ).toBe("avg");
    fireEvent.change(select, { target: { value: "avg" } });
    expect(model.getQuery().valueColumns).toEqual([
      { columnId: "amount", aggregate: "avg" },
    ]);
  } finally {
    model.dispose();
  }
});
