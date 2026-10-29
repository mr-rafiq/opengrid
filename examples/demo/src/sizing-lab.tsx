import { useMemo, useRef, useState } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid, type DataGridSizingController } from "@opengrid/react";

type Item = {
  id: string;
  record: string;
  description: string;
  amount: number;
  [key: string]: string | number;
};
export function SizingLab() {
  const model = useMemo(() => {
    const columns: Column<Item>[] = [
      {
        id: "record",
        field: "record",
        header: "Record",
        width: 100,
        pinned: "left",
      },
      {
        id: "description",
        field: "description",
        header: "Description",
        flex: 2,
        minWidth: 80,
        maxWidth: 720,
        editable: true,
      },
      {
        id: "amount",
        field: "amount",
        header: "Amount",
        flex: 1,
        minWidth: 80,
        maxWidth: 320,
        type: "number",
        pinned: "right",
      },
      ...Array.from({ length: 12 }, (_, index): Column<Item> => ({
        id: `extra${index}`,
        field: `extra${index}`,
        header: `Extra ${index + 1}`,
        width: 120,
        hidden: true,
      })),
    ];
    const rows = Array.from({ length: 500 }, (_, index): Item => ({
      id: `size${index + 1}`,
      record: `R${index + 1}`,
      description:
        index === 399
          ? "A deliberately long offscreen description only measured when its row is rendered"
          : `Item ${index + 1}`,
      amount: (index + 1) * 11,
      ...Object.fromEntries(
        Array.from({ length: 12 }, (_, n) => [`extra${n}`, `Value ${n + 1}`]),
      ),
    }));
    return createGrid({ columns, rows, getRowId: (row) => row.id });
  }, []);
  const sizing = useRef<DataGridSizingController>(null);
  const [width, setWidth] = useState(960),
    [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [wide, setWide] = useState(false),
    [report, setReport] = useState("No measurement requested.");
  const readWidths = () =>
    setReport(
      JSON.stringify(
        {
          widths: sizing.current?.getWidths(),
          manual: model.getState().columnWidths,
        },
        null,
        2,
      ),
    );
  async function fit(ids?: readonly string[]) {
    const result = await sizing.current?.autoSizeColumns(ids);
    setReport(
      JSON.stringify(
        {
          result,
          widths: sizing.current?.getWidths(),
          manual: model.getState().columnWidths,
        },
        null,
        2,
      ),
    );
  }
  return (
    <section aria-label="Column sizing example">
      <h2>Flex and rendered text sizing</h2>
      <p>
        Flex columns share measured space. Manual resize and explicit autosizing
        take ownership until reset. Text sizing samples only currently rendered
        default cells and leaf headers; scroll to row 400 to include its longer
        value.
      </p>
      <div className="explorer-controls">
        <button
          type="button"
          onClick={() => setWidth(width === 960 ? 640 : 960)}
        >
          Container {width === 960 ? 640 : 960}px
        </button>
        <button
          type="button"
          onClick={() => setDirection(direction === "ltr" ? "rtl" : "ltr")}
        >
          Direction {direction === "ltr" ? "RTL" : "LTR"}
        </button>
        <button type="button" onClick={() => void fit()}>
          Fit rendered columns
        </button>
        <button type="button" onClick={() => void fit(["description"])}>
          Fit description
        </button>
        <button
          type="button"
          onClick={() => {
            sizing.current?.resetWidths();
            readWidths();
          }}
        >
          Reset widths
        </button>
        <button type="button" onClick={readWidths}>
          Read widths
        </button>
        <button
          type="button"
          aria-pressed={wide}
          onClick={() => {
            for (let n = 0; n < 12; n++) model.hideColumn(`extra${n}`, wide);
            setWide(!wide);
          }}
        >
          Distant columns
        </button>
      </div>
      <div style={{ width, maxWidth: "100%" }} data-testid="sizing-container">
        <DataGrid
          model={model}
          sizingRef={sizing}
          direction={direction}
          ariaLabel="Sizing inventory"
          height={330}
          selectionMode="none"
          toolbar={false}
          pagination={false}
          columnOverscan={0}
        />
      </div>
      <pre
        tabIndex={0}
        data-testid="sizing-report"
        aria-label="Sizing command report"
        style={{ maxHeight: 260, overflow: "auto" }}
      >
        {report}
      </pre>
    </section>
  );
}
