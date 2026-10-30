import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AutoDetailLab } from "./auto-detail-lab";
import { createGrid, type Column } from "@opengrid/core";
import {
  DataGrid,
  GridLocaleProvider,
  enUS,
  esES,
  type DataGridRowHeightController,
} from "@opengrid/react";

type Record = {
  id: string;
  name: string;
  notes: string;
  followup: string;
  amount: number;
};
const paragraph =
  "Review the delivery window with the operations team, record the dependency owner, and include the rollback steps before approving this batch. ";
const longNote = paragraph.repeat(4);
const shortNote = "Ready for review.";
const columns: Column<Record>[] = [
  { id: "name", field: "name", header: "Record", pinned: "left", width: 180 },
  {
    id: "notes",
    field: "notes",
    header: "Notes",
    width: 260,
    minWidth: 80,
    maxWidth: 600,
    editable: true,
    wrapText: true,
    autoHeight: true,
  },
  {
    id: "followup",
    field: "followup",
    header: "Follow-up",
    width: 190,
    minWidth: 80,
    wrapText: true,
    autoHeight: true,
  },
  {
    id: "amount",
    field: "amount",
    header: "Value",
    type: "number",
    pinned: "right",
    width: 110,
  },
];

export function AutoHeightLab() {
  const [rtl, setRtl] = useState(false),
    [spanish, setSpanish] = useState(false),
    [dark, setDark] = useState(false),
    [constrained, setConstrained] = useState(false);
  const api = useRef<DataGridRowHeightController | null>(null);
  const model = useMemo(
    () =>
      createGrid<Record>({
        rows: Array.from({ length: 128 }, (_, index) => ({
          id: `height${index}`,
          name: `Review ${index + 1}`,
          notes:
            index > 0 && index % 11 === 0 ? paragraph.repeat(2) : shortNote,
          followup:
            index % 9 === 0
              ? "Confirm the owner and the next checkpoint before publishing."
              : "Assigned",
          amount: 100 + index * 7,
        })),
        getRowId: (row) => row.id,
        columns,
      }),
    [],
  );
  const merged = useMemo(
    () =>
      createGrid<Record>({
        rows: Array.from({ length: 9 }, (_, index) => ({
          id: `merged${index}`,
          name: `Batch ${Math.floor(index / 3) + 1}`,
          notes: `Batch ${Math.floor(index / 3) + 1}. ${paragraph.repeat(2)}`,
          followup: `Record ${index + 1}`,
          amount: index + 1,
        })),
        getRowId: (row) => row.id,
        columns: columns.map((column) =>
          column.id === "notes"
            ? { ...column, spanRows: true }
            : column.id === "followup"
              ? { ...column, autoHeight: false }
              : column,
        ),
      }),
    [],
  );
  const flexModel = useMemo(
    () =>
      createGrid<Record>({
        rows: Array.from({ length: 3 }, (_, index) => ({
          id: `flex${index}`,
          name: `Review ${index + 1}`,
          notes: paragraph.repeat(3),
          followup: "Assigned",
          amount: index + 1,
        })),
        getRowId: (row) => row.id,
        columns: columns
          .filter((column) => column.id !== "followup")
          .map((column) =>
            column.id === "notes" ? { ...column, flex: 1 } : column,
          ),
      }),
    [],
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const expanded = model.getRow("height0")?.notes === longNote;
  const narrow = (state.columnWidths.notes ?? 260) < 180;
  return (
    <section aria-label="Automatic row height example">
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "16px 0" }}
      >
        <label>
          <input
            type="checkbox"
            checked={rtl}
            onChange={(event) => setRtl(event.target.checked)}
          />{" "}
          Right-to-left automatic rows
        </label>
        <label>
          <input
            type="checkbox"
            checked={spanish}
            onChange={(event) => setSpanish(event.target.checked)}
          />{" "}
          Spanish automatic-row labels
        </label>
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(event) => setDark(event.target.checked)}
          />{" "}
          Dark automatic-row theme
        </label>
      </div>
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <article aria-label="Wrapped content example">
          <h2>Rows follow their content</h2>
          <p>
            Notes and follow-up cells wrap and grow. Resize a header or edit a
            note, then try Undo. Offscreen heights remain estimates until their
            cells are rendered. Expanding the first note while scrolled
            preserves the visible source row.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={() =>
                model.editCell(
                  "height0",
                  "notes",
                  expanded ? shortNote : longNote,
                )
              }
            >
              {expanded ? "Shorten first note" : "Expand first note"}
            </button>
            <button
              type="button"
              onClick={() => model.resizeColumn("notes", narrow ? 260 : 120)}
            >
              {narrow ? "Widen notes column" : "Narrow notes column"}
            </button>
            <button type="button" onClick={() => api.current?.reset()}>
              Reset measured row heights
            </button>
          </div>
          <DataGrid
            model={model}
            rowHeight={36}
            rowHeightRef={api}
            pagination={false}
            height={340}
            direction={rtl ? "rtl" : "ltr"}
            className={dark ? "og-dark" : ""}
            ariaLabel="Auto height records"
          />
        </article>
        <article
          aria-label="Merged automatic content example"
          style={{ marginTop: 24 }}
        >
          <h2>Merged notes grow the final row</h2>
          <p>
            Each batch shares one note across three source rows. Content beyond
            their combined base height is assigned to the final row. Editing an
            owner can split its run; Undo restores the original note and
            geometry.
          </p>
          <button
            type="button"
            style={{ marginBottom: 12 }}
            onClick={() =>
              merged.editCell(
                "merged0",
                "notes",
                longNote + "An additional review is required.",
              )
            }
          >
            Lengthen merged owner
          </button>
          <DataGrid
            model={merged}
            rowHeight={36}
            pagination={false}
            height={340}
            direction={rtl ? "rtl" : "ltr"}
            className={dark ? "og-dark" : ""}
            ariaLabel="Auto height merged notes"
          />
        </article>
        <article
          aria-label="Flex automatic content example"
          style={{ marginTop: 24 }}
        >
          <h2>Wrapped text follows available space</h2>
          <p>
            The notes column fills the remaining width. Narrow the example to
            see the same three records reflow.
          </p>
          <button
            type="button"
            style={{ marginBottom: 12 }}
            onClick={() => setConstrained((value) => !value)}
          >
            {constrained ? "Restore flex example" : "Constrain flex example"}
          </button>
          <div style={{ width: constrained ? 640 : "100%", maxWidth: "100%" }}>
            <DataGrid
              model={flexModel}
              rowHeight={36}
              pagination={false}
              height={240}
              direction={rtl ? "rtl" : "ltr"}
              className={dark ? "og-dark" : ""}
              ariaLabel="Auto height flex records"
            />
          </div>
        </article>
        <AutoDetailLab rtl={rtl} dark={dark} />
      </GridLocaleProvider>
    </section>
  );
}
