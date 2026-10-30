import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { createGrid, type Column } from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

type Master = { id: string; name: string; owner: string };
type Call = { id: string; name: string; minutes: number };
const masterColumns: Column<Master>[] = [
  { id: "name", field: "name", header: "Account", width: 200, pinned: "left" },
  { id: "owner", field: "owner", header: "Review owner", width: 260, flex: 1 },
];
const callColumns: Column<Call>[] = [
  {
    id: "name",
    field: "name",
    header: "Call",
    width: 230,
    flex: 1,
    editable: true,
  },
  {
    id: "minutes",
    field: "minutes",
    header: "Minutes",
    type: "number",
    width: 120,
  },
];

function DetailCalls({
  rowId,
  rtl,
  dark,
}: {
  rowId: string;
  rtl: boolean;
  dark: boolean;
}) {
  const model = useMemo(
    () =>
      createGrid<Call>({
        rows: Array.from({ length: 3 }, (_, index) => ({
          id: `${rowId}-call${index}`,
          name: `Review call ${index + 1}`,
          minutes: index + 2,
        })),
        getRowId: (row) => row.id,
        columns: callColumns,
      }),
    [rowId],
  );
  useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const count = model.getRows().length;
  return (
    <div>
      <h3>Calls for {rowId}</h3>
      <p style={{ color: "var(--og-text)" }}>
        Review each call with its owner before closing this account. The detail
        follows the nested grid's size as records are added or removed, and its
        introduction wraps as the available space changes.
      </p>
      <div
        style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}
      >
        <button
          type="button"
          disabled={count >= 12}
          onClick={() =>
            model.applyTransaction({
              add: [
                {
                  id: `${rowId}-call${count}`,
                  name: `Review call ${count + 1}`,
                  minutes: count + 2,
                },
              ],
            })
          }
        >
          Add detail record
        </button>
        <button
          type="button"
          disabled={count <= 1}
          onClick={() =>
            model.applyTransaction({ remove: [`${rowId}-call${count - 1}`] })
          }
        >
          Remove detail record
        </button>
      </div>
      <DataGrid
        model={model}
        toolbar={false}
        pagination={false}
        rowHeight={32}
        height={76 + count * 32}
        ariaLabel={`Calls grid ${rowId}`}
        direction={rtl ? "rtl" : "ltr"}
        className={dark ? "og-dark" : ""}
      />
    </div>
  );
}

export function AutoDetailLab({ rtl, dark }: { rtl: boolean; dark: boolean }) {
  const model = useMemo(
    () =>
      createGrid<Master>({
        rows: Array.from({ length: 64 }, (_, index) => ({
          id: `detail${index}`,
          name: `Account ${index + 1}`,
          owner: index % 2 ? "Operations" : "Support",
        })),
        getRowId: (row) => row.id,
        columns: masterColumns,
      }),
    [],
  );
  const [automatic, setAutomatic] = useState(true);
  const renderDetail = useCallback(
    ({ rowId }: { row: Master; rowId: string }) => (
      <DetailCalls rowId={rowId} rtl={rtl} dark={dark} />
    ),
    [rtl, dark],
  );
  return (
    <article
      aria-label="Automatic detail content example"
      style={{ marginTop: 24 }}
    >
      <h2>Details follow their nested content</h2>
      <p>
        Open an account, then add or remove a call inside its detail grid.
        Automatic detail height uses the declared height as a minimum. Each
        nested model belongs to its mounted detail.
      </p>
      <label>
        <input
          type="checkbox"
          checked={automatic}
          onChange={(event) => setAutomatic(event.target.checked)}
        />{" "}
        Automatic detail height
      </label>
      <DataGrid
        model={model}
        rowHeight={36}
        height={440}
        detailHeight={80}
        autoDetailHeight={automatic}
        renderDetail={renderDetail}
        defaultExpandedDetailRows={["detail0"]}
        pagination={false}
        ariaLabel="Automatic detail masters"
        direction={rtl ? "rtl" : "ltr"}
        className={dark ? "og-dark" : ""}
      />
    </article>
  );
}
