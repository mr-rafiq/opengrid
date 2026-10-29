// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { createGrid, type CellRange, type Column } from "../../core/src/index";
import { GridChart } from "./charts";
import { GridPrintView } from "./print-view";
import { GridLocaleProvider, enUS, esES } from "./locale";
import type { GridLocale } from "./locale";

type Item = {
  id: string;
  category: string | null;
  position: number;
  amount: number;
  balance: number;
};
const columns: Column<Item>[] = [
  { id: "category", field: "category", header: "APP Category" },
  { id: "position", field: "position", header: "APP Position", type: "number" },
  {
    id: "amount",
    field: "amount",
    header: "APP Amount",
    type: "number",
    editable: true,
  },
  { id: "balance", field: "balance", header: "APP Balance", type: "number" },
];
const make = (
  rows: Item[] = [
    { id: "a", category: "App Alpha", position: 1, amount: 12.5, balance: 2 },
    { id: "b", category: "App Beta", position: 2, amount: 20.25, balance: 3 },
    { id: "c", category: "App Gamma", position: 3, amount: 30.75, balance: 4 },
  ],
) => createGrid({ rows, columns, getRowId: (row) => row.id });
const wrap = (locale: GridLocale, children: ReactNode) => (
  <GridLocaleProvider locale={locale}>{children}</GridLocaleProvider>
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("chart localization", () => {
  it("translates configuration and ARIA without resetting chart choices, range, focus or projection", () => {
    const model = make();
    const range: CellRange = {
      anchor: { rowId: "a", columnId: "category" },
      focus: { rowId: "b", columnId: "balance" },
    };
    const chart = (
      <GridChart
        model={model}
        range={range}
        xColumnId="category"
        yColumnIds={["amount"]}
      />
    );
    const view = render(wrap(enUS, chart));
    fireEvent.change(screen.getByRole("combobox", { name: "Chart type" }), {
      target: { value: "line" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Chart X column" }), {
      target: { value: "position" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Chart aggregation" }),
      { target: { value: "avg" } },
    );
    fireEvent.click(screen.getByText("Y series (1/8)"));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Chart series APP Balance" }),
    );
    const control = screen.getByRole("combobox", {
      name: "Chart type",
    }) as HTMLSelectElement;
    control.focus();
    const geometry = screen
      .getByRole("img")
      .querySelector("path")!
      .getAttribute("d");
    const state = model.getState(),
      reads = vi.spyOn(model, "getFilteredRows");
    view.rerender(wrap(esES, chart));
    expect(
      screen.getByRole("img").closest("section")!.getAttribute("lang"),
    ).toBe("es-ES");
    expect(screen.getByRole("combobox", { name: "Tipo de gr\u00e1fico" })).toBe(
      control,
    );
    expect(document.activeElement).toBe(control);
    expect(control.value).toBe("line");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Columna X del gr\u00e1fico",
        }) as HTMLSelectElement
      ).value,
    ).toBe("position");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Agregaci\u00f3n del gr\u00e1fico",
        }) as HTMLSelectElement
      ).value,
    ).toBe("avg");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Serie del gr\u00e1fico APP Balance",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      screen.getByRole("group", {
        name: "Configuraci\u00f3n del gr\u00e1fico",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img").querySelector("desc")!.textContent,
    ).toContain(
      "Gr\u00e1fico de l\u00edneas de APP Amount, APP Balance por APP Position",
    );
    expect(
      screen.getByRole("img").querySelector("path")!.getAttribute("d"),
    ).toBe(geometry);
    expect(
      screen.getByText(
        /2 filas de origen\. Se muestran 2 de 2 categor\u00edas/,
      ),
    ).toBeTruthy();
    expect(model.getState()).toBe(state);
    expect(reads).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"] as const)(
    "retranslates stored chart export %s notices",
    (outcome) => {
      const BaseURL = URL,
        create = vi.fn(() => {
          if (outcome === "failure") throw new Error("APP blocked");
          return "blob:chart";
        });
      vi.stubGlobal(
        "URL",
        class extends BaseURL {
          static createObjectURL = create;
          static revokeObjectURL = vi.fn();
        },
      );
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
      const chart = (
        <GridChart
          model={make()}
          xColumnId="category"
          yColumnIds={["amount"]}
        />
      );
      const view = render(wrap(enUS, chart));
      fireEvent.click(screen.getByRole("button", { name: "Export chart SVG" }));
      expect(screen.getByRole("status").textContent).toBe(
        outcome === "success"
          ? "Chart SVG exported"
          : "Chart export is unavailable in this browser",
      );
      view.rerender(wrap(esES, chart));
      expect(screen.getByRole("status").textContent).toBe(
        outcome === "success"
          ? "Gr\u00e1fico SVG exportado"
          : "Este navegador no permite exportar el gr\u00e1fico",
      );
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it("formats counts/plurals and exact numeric table values while preserving application categories", () => {
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      id: String(index),
      category: "APP unchanged",
      position: index,
      amount: 0.123456789,
      balance: 0,
    }));
    const model = make(rows);
    const chart = (
      <GridChart
        model={model}
        xColumnId="category"
        yColumnIds={["amount"]}
        maxPoints={1}
        ariaLabel="APP chart"
      />
    );
    const view = render(wrap(esES, chart));
    expect(screen.getByRole("region", { name: "APP chart" })).toBeTruthy();
    expect(
      screen.getByText(
        /10\.000 filas de origen\. Se muestran 1 de 1 categor\u00eda/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByText("Tabla de datos del gr\u00e1fico (1 fila)"),
    );
    expect(screen.getByRole("table").textContent).toContain("APP unchanged");
    expect(screen.getByRole("table").textContent).toContain("APP Amount");
    view.rerender(wrap(enUS, chart));
    expect(
      screen.getByText(/10,000 source rows\. Showing 1 of 1 categories/),
    ).toBeTruthy();
    expect(screen.getByText("Chart data table (1 rows)")).toBeTruthy();
    expect(screen.getByRole("region", { name: "APP chart" })).toBeTruthy();
    const precise = (
      <GridChart
        model={make([
          {
            id: "a",
            category: "APP raw",
            position: 1,
            amount: 0.123456789,
            balance: 0,
          },
        ])}
        xColumnId="category"
        yColumnIds={["amount"]}
      />
    );
    view.rerender(wrap(esES, precise));
    fireEvent.click(
      screen.getByText("Tabla de datos del gr\u00e1fico (1 fila)"),
    );
    expect(screen.getByRole("table").textContent).toContain("0,123456789");
  });

  it("localizes the owned blank category without translating an application string with the same English label", () => {
    const model = make([
      { id: "a", category: null, position: 1, amount: 1, balance: 0 },
      { id: "b", category: "(blank)", position: 2, amount: 2, balance: 0 },
    ]);
    render(
      wrap(
        esES,
        <GridChart
          model={model}
          xColumnId="category"
          yColumnIds={["amount"]}
        />,
      ),
    );
    fireEvent.click(
      screen.getByText("Tabla de datos del gr\u00e1fico (2 filas)"),
    );
    expect(
      within(screen.getByRole("table")).getByRole("rowheader", {
        name: "(vac\u00edo)",
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("table")).getByRole("rowheader", {
        name: "(blank)",
      }),
    ).toBeTruthy();
  });
});

describe("print localization", () => {
  it("translates captured/stale status without recapturing formatted data or losing scroll focus", () => {
    const formatter = vi.fn(
      (value: unknown) => `APP ${Number(value).toFixed(2)}`,
    );
    const model = createGrid({
      rows: [{ id: "a", name: "APP row", amount: 12.5 }],
      columns: [
        { id: "name", field: "name", header: "APP Name" },
        {
          id: "amount",
          field: "amount",
          header: "APP Amount",
          type: "number",
          editable: true,
          valueFormatter: formatter,
        },
      ],
      getRowId: (row) => row.id,
    });
    const report = <GridPrintView model={model} />;
    const view = render(wrap(enUS, report));
    const region = screen.getByRole("region", {
      name: "Grid print view table scroll area",
    });
    region.focus();
    const identity = screen
      .getByRole("region", { name: "Grid print view" })
      .getAttribute("data-og-print-view");
    act(() => {
      model.editCell("a", "amount", 99);
    });
    const calls = formatter.mock.calls.length;
    view.rerender(wrap(esES, report));
    expect(document.activeElement).toBe(region);
    expect(
      screen.getByRole("table").closest("section")!.getAttribute("lang"),
    ).toBe("es-ES");
    expect(region.getAttribute("aria-label")).toBe(
      "\u00c1rea de desplazamiento de la tabla Vista de impresi\u00f3n de la cuadr\u00edcula",
    );
    expect(
      screen
        .getByRole("region", {
          name: "Vista de impresi\u00f3n de la cuadr\u00edcula",
        })
        .getAttribute("data-og-print-view"),
    ).toBe(identity);
    expect(screen.getByRole("status").textContent).toContain(
      "1 fila, 2 columnas.",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "La cuadr\u00edcula cambi\u00f3",
    );
    expect(screen.getByRole("table").textContent).toContain("APP 12.50");
    expect(formatter).toHaveBeenCalledTimes(calls);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Actualizar captura de impresi\u00f3n",
      }),
    );
    expect(screen.getByRole("table").textContent).toContain("APP 99.00");
    expect(screen.getByRole("status").textContent).toContain(
      "Captura actualizada.",
    );
    const refreshedCalls = formatter.mock.calls.length;
    view.rerender(wrap(enUS, report));
    expect(screen.getByRole("status").textContent).toContain(
      "Snapshot refreshed.",
    );
    expect(formatter).toHaveBeenCalledTimes(refreshedCalls);
  });

  it("retranslates captured own limit errors but keeps application formatter errors verbatim", () => {
    const model = make();
    const reads = vi.spyOn(model, "getFilteredRows");
    const report = <GridPrintView model={model} maxRows={2} />;
    const view = render(wrap(enUS, report));
    expect(screen.getByRole("alert").textContent).toContain(
      "Print scope has 3 rows",
    );
    const calls = reads.mock.calls.length;
    view.rerender(wrap(esES, report));
    expect(screen.getByRole("alert").textContent).toContain(
      "No se puede crear la captura de impresi\u00f3n: El \u00e1mbito de impresi\u00f3n tiene 3 filas",
    );
    expect(reads).toHaveBeenCalledTimes(calls);
    expect(
      (
        screen.getByRole("button", {
          name: "Imprimir captura",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const bad = createGrid({
      rows: [{ id: "a", value: 1 }],
      columns: [
        {
          id: "value",
          field: "value",
          valueFormatter: () => {
            throw new Error("APP formatter unavailable");
          },
        },
      ],
      getRowId: (row) => row.id,
    });
    view.rerender(
      wrap(
        esES,
        <GridPrintView model={bad} title="APP report" caption="APP caption" />,
      ),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "APP formatter unavailable",
    );
    expect(screen.getByRole("heading", { name: "APP report" })).toBeTruthy();
  });

  it("preserves the active print target and retranslates its stored request status", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const report = (
      <GridPrintView model={make()} title="APP report" caption="APP caption" />
    );
    const view = render(wrap(enUS, report));
    fireEvent.click(screen.getByRole("button", { name: "Print snapshot" }));
    const target = document.documentElement.getAttribute(
      "data-og-print-target",
    );
    expect(target).toBeTruthy();
    view.rerender(wrap(esES, report));
    expect(document.documentElement.getAttribute("data-og-print-target")).toBe(
      target,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Se solicit\u00f3 el di\u00e1logo de impresi\u00f3n",
    );
    expect(
      screen.getByRole("table").querySelector("caption")!.textContent,
    ).toBe("APP caption");
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent(window, new Event("afterprint"));
    expect(document.documentElement.hasAttribute("data-og-print-target")).toBe(
      false,
    );
  });

  it("translates empty state, validation errors and captured group counts", () => {
    const model = make([]);
    const view = render(wrap(esES, <GridPrintView model={model} />));
    expect(
      screen.getByText("No hay filas en este \u00e1mbito de impresi\u00f3n."),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "0 filas, 4 columnas.",
    );
    act(() => {
      columns.forEach((column) => model.hideColumn(column.id, true));
    });
    view.rerender(wrap(esES, <GridPrintView model={model} scope="page" />));
    expect(
      screen.getByText("No hay columnas visibles para imprimir."),
    ).toBeTruthy();
    view.rerender(wrap(esES, <GridPrintView model={make()} maxRows={0} />));
    expect(screen.getByRole("alert").textContent).toContain(
      "maxRows debe ser un entero entre 1 y 10.000",
    );
    const grouped = make(
      Array.from({ length: 10000 }, (_, index) => ({
        id: String(index),
        category: "APP group",
        position: index,
        amount: 1,
        balance: 0,
      })),
    );
    grouped.setState({ groupBy: ["category"] });
    const report = <GridPrintView model={grouped} scope="view" />;
    view.rerender(wrap(esES, report));
    expect(
      screen.getByRole("rowheader", { name: "APP group (10.000)" }),
    ).toBeTruthy();
    const reads = vi.spyOn(grouped, "getRowModel");
    view.rerender(wrap(enUS, report));
    expect(
      screen.getByRole("rowheader", { name: "APP group (10,000)" }),
    ).toBeTruthy();
    expect(reads).not.toHaveBeenCalled();
  });
});
