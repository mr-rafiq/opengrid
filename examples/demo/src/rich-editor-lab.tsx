import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createGrid } from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  enUS,
  esES,
  type EditorOption,
  type RichSelectSearchMode,
} from "@opengrid/react";
type RecordRow = { id: string; market: string; quantity: number };
const BASE = 9007199254740993n;
export function RichEditorLab() {
  const choices = useMemo<readonly EditorOption[]>(
    () =>
      Array.from({ length: 10000 }, (_, index) => ({
        value: String(BASE + BigInt(index)),
        label:
          index === 0
            ? "São Paulo"
            : index === 1
              ? "Málaga"
              : index === 2
                ? "Zürich"
                : index === 3
                  ? "İstanbul"
                  : index === 7
                    ? "Unavailable market"
                    : index === 9
                      ? "Restricted market"
                      : `Market ${String(index).padStart(5, "0")}`,
        name: `MKT-${index}`,
        disabled: index === 7,
      })),
    [],
  );
  const labels = useMemo(
    () => new Map(choices.map((choice) => [choice.value, choice.label])),
    [choices],
  );
  const model = useMemo(
    () =>
      createGrid<RecordRow>({
        rows: Array.from({ length: 20 }, (_, index) => ({
          id: `rich${index + 1}`,
          market: String(BASE + BigInt(index % 6)),
          quantity: index + 1,
        })),
        getRowId: (row) => row.id,
        columns: [
          {
            id: "market",
            field: "market",
            header: "Market",
            width: 260,
            editable: true,
            pinned: "left",
            valueFormatter: (value) =>
              labels.get(String(value)) ?? String(value),
            validate: (value) =>
              value === String(BASE + 9n)
                ? "Restricted market cannot be selected."
                : undefined,
          },
          {
            id: "quantity",
            field: "quantity",
            header: "Quantity",
            width: 160,
            type: "number",
            editable: true,
            validate: (value) =>
              Number(value) > 0 ? undefined : "Quantity must be positive.",
          },
          {
            id: "id",
            field: "id",
            header: "Record",
            width: 140,
            pinned: "right",
          },
        ],
      }),
    [labels],
  );
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [spanish, setSpanish] = useState(false),
    [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [asynchronous, setAsynchronous] = useState(false),
    [rowForm, setRowForm] = useState(false);
  const [searchMode, setSearchMode] =
      useState<RichSelectSearchMode>("contains"),
    [requests, setRequests] = useState(0);
  const failNext = useRef(false);
  const provider = useCallback(
    async (signal?: AbortSignal) => {
      setRequests((value) => value + 1);
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          window.clearTimeout(timer);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const timer = window.setTimeout(() => {
          signal?.removeEventListener("abort", cancel);
          resolve();
        }, 120);
        if (signal?.aborted) cancel();
        else signal?.addEventListener("abort", cancel, { once: true });
      });
      if (failNext.current) {
        failNext.current = false;
        throw new Error("The example choice service is unavailable.");
      }
      return choices;
    },
    [choices],
  );
  return (
    <section
      aria-label="Rich choice example"
      onKeyDownCapture={(event) => {
        if (!event.ctrlKey || !event.shiftKey) return;
        if (event.code === "KeyL") {
          event.preventDefault();
          setSpanish((value) => !value);
        }
        if (event.code === "KeyD") {
          event.preventDefault();
          setDirection((value) => (value === "ltr" ? "rtl" : "ltr"));
        }
        if (event.code === "KeyU") {
          event.preventDefault();
          model.editCell(
            "rich1",
            "quantity",
            model.getRow("rich1")!.quantity + 1,
          );
        }
      }}
    >
      <h2>Searchable rich choices</h2>
      <p>
        Search 10,000 named choices with exact string IDs. Apply validates a
        cell; Undo restores it. In a row form, applying a choice stages that
        field until Save row. The unavailable choice is disabled; the restricted
        choice demonstrates validation.
      </p>
      <p>
        While the picker is open, Ctrl+Shift+L changes language, Ctrl+Shift+D
        changes direction and Ctrl+Shift+U updates the first quantity.
      </p>
      <div className="explorer-controls">
        <button type="button" onClick={() => setSpanish(!spanish)}>
          {spanish ? "Use English choices" : "Use Spanish choices"}
        </button>
        <button
          type="button"
          onClick={() => setDirection(direction === "ltr" ? "rtl" : "ltr")}
        >
          Choice direction {direction === "ltr" ? "RTL" : "LTR"}
        </button>
        <button type="button" onClick={() => setAsynchronous(!asynchronous)}>
          {asynchronous ? "Use static choices" : "Use asynchronous choices"}
        </button>
        <button
          type="button"
          onClick={() => {
            failNext.current = true;
            setAsynchronous(true);
          }}
        >
          Fail next choice request
        </button>
        <button type="button" onClick={() => setRowForm(!rowForm)}>
          {rowForm ? "Use cell editor" : "Use row form"}
        </button>
        <label>
          Choice search mode{" "}
          <select
            aria-label="Choice search mode"
            value={searchMode}
            onChange={(event) =>
              setSearchMode(event.target.value as RichSelectSearchMode)
            }
          >
            <option value="contains">Contains</option>
            <option value="prefix">Prefix</option>
            <option value="fuzzy">Fuzzy subsequence</option>
          </select>
        </label>
      </div>
      <p data-testid="rich-requests">Choice requests: {requests}</p>
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <div style={{ width: 740, maxWidth: "100%" }}>
          <DataGrid
            model={model}
            direction={direction}
            ariaLabel="Rich choice inventory"
            height={330}
            editMode={rowForm ? "row" : "cell"}
            pagination={false}
            editorOptions={{
              market: {
                type: "richSelect",
                searchMode,
                ...(asynchronous
                  ? { asyncOptions: provider }
                  : { options: choices }),
              },
            }}
          />
        </div>
      </GridLocaleProvider>
      <pre
        tabIndex={0}
        data-testid="rich-source"
        aria-label="Rich choice source values"
      >
        {JSON.stringify(
          {
            first: model.getRow("rich1"),
            second: model.getRow("rich2"),
            selected: snapshot.selected,
          },
          null,
          2,
        )}
      </pre>
    </section>
  );
}
