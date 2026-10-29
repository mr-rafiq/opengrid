import { useState } from "react";
import { createGrid, type Column } from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  GridChart,
  GridPrintView,
  NumberRangeFilter,
  enUS,
  esES,
  type EditorOption,
} from "@opengrid/react";

interface Inventory {
  id: string;
  item: string;
  category: string;
  price: number;
  quantity: number;
}
const columns: Column<Inventory>[] = [
  {
    id: "item",
    field: "item",
    header: "Item",
    pinned: "left",
    width: 190,
    editable: true,
  },
  {
    id: "category",
    field: "category",
    header: "Category",
    width: 160,
    editable: true,
  },
  {
    id: "price",
    field: "price",
    header: "Price",
    type: "number",
    width: 150,
    editable: true,
  },
  {
    id: "quantity",
    field: "quantity",
    header: "Quantity",
    type: "number",
    width: 140,
    editable: true,
  },
];
const options: readonly EditorOption[] = [
  { value: "Office", label: "Office" },
  { value: "Home", label: "Home" },
  { value: "Field", label: "Field" },
];
const asyncOptions = (signal?: AbortSignal) =>
  new Promise<readonly EditorOption[]>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve(options);
    };
    const timer = window.setTimeout(finish, 900);
    const abort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
const editorOptions = { category: { type: "select" as const, asyncOptions } };
const filterComponents = { price: NumberRangeFilter };
export function LocaleLab() {
  const [language, setLanguage] = useState<"en" | "es">("en"),
    [rowMode, setRowMode] = useState(false),
    [analysis, setAnalysis] = useState(false);
  const [model] = useState(() =>
    createGrid<Inventory>({
      columns,
      rows: [
        {
          id: "locale1",
          item: "Notebook",
          category: "Office",
          price: 12.5,
          quantity: 8,
        },
        {
          id: "locale2",
          item: "Desk lamp",
          category: "Home",
          price: 45,
          quantity: 2,
        },
        {
          id: "locale3",
          item: "Travel kit",
          category: "Field",
          price: 28,
          quantity: 5,
        },
      ],
      getRowId: (row) => row.id,
    }),
  );
  const switchLanguage = () =>
    setLanguage((current) => (current === "en" ? "es" : "en"));
  return (
    <section
      aria-label="Language switching example"
      onKeyDownCapture={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === "l"
        ) {
          event.preventDefault();
          event.stopPropagation();
          switchLanguage();
        }
      }}
    >
      <p>
        Switch built-in controls between English and Spanish. Press
        Ctrl/Cmd+Shift+L while editing to change language without leaving the
        editor. Business headers, values and option names stay
        application-owned. Category choices use a local delayed loader; no
        network service is connected.
      </p>
      <div className="explorer-controls">
        <label>
          Example language{" "}
          <select
            aria-label="Example language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as "en" | "es")}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>
        <button
          onPointerDown={(event) => event.preventDefault()}
          onClick={switchLanguage}
        >
          Switch language
        </button>
        <label>
          <input
            type="checkbox"
            checked={rowMode}
            onChange={(event) => setRowMode(event.target.checked)}
          />{" "}
          Use row edit dialog
        </label>
        <button aria-pressed={analysis} onClick={() => setAnalysis(!analysis)}>
          Localized chart and print
        </button>
      </div>
      <GridLocaleProvider locale={language === "es" ? esES : enUS}>
        <DataGrid
          model={model}
          ariaLabel="Localized inventory"
          height={380}
          editorOptions={editorOptions}
          filterComponents={filterComponents}
          editMode={rowMode ? "row" : "cell"}
        />
        {analysis && (
          <>
            <GridChart
              model={model}
              xColumnId="item"
              yColumnIds={["price"]}
              ariaLabel="Localized inventory chart"
            />
            <GridPrintView model={model} />
          </>
        )}
      </GridLocaleProvider>
    </section>
  );
}
