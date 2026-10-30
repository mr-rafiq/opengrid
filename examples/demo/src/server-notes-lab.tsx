import { useEffect, useMemo, useRef, useState } from "react";
import { ServerSideRowModel, type Column } from "@opengrid/core";
import { ServerDataGrid } from "@opengrid/react";

type Record = { name: string };
const columns: Column<Record>[] = [
  { id: "name", field: "name", header: "Record", width: 250, pinned: "left" },
];

/** Deliberately reuse legal route-local IDs to make note ownership observable. */
export function ServerNotesLab({ direction }: { direction: "ltr" | "rtl" }) {
  const [provider, setProvider] = useState(1);
  const model = useMemo(
    () =>
      new ServerSideRowModel<Record>(
        {
          getRows: async ({ groupKeys, startRow, endRow, sorting }) => {
            if (!groupKeys.length)
              return {
                nodes: [
                  { kind: "group", id: "shared", key: "East", childCount: 3 },
                  { kind: "group", id: "west", key: "West", childCount: 3 },
                ],
                rowCount: 2,
              };
            const rows = [
              {
                kind: "row" as const,
                id: "shared",
                data: { name: `${groupKeys[0]} shared record` },
              },
              {
                kind: "row" as const,
                id: "second",
                data: { name: `${groupKeys[0]} second record` },
              },
              {
                kind: "row" as const,
                id: "third",
                data: { name: `${groupKeys[0]} third record` },
              },
            ];
            if (sorting[0]?.direction === "desc") rows.reverse();
            return {
              nodes: rows.slice(startRow, endRow),
              rowCount: rows.length,
            };
          },
        },
        { blockSize: 2 },
      ),
    [provider],
  );
  const owners = useRef(new WeakMap<ServerSideRowModel<Record>, object>());
  useEffect(() => {
    const ticket = {};
    owners.current.set(model, ticket);
    return () =>
      queueMicrotask(() => {
        if (owners.current.get(model) === ticket) {
          owners.current.delete(model);
          model.dispose();
        }
      });
  }, [model]);
  return (
    <article aria-label="Server note scope example" style={{ marginTop: 24 }}>
      <h3>Notes follow a provider, query and route</h3>
      <p>
        The root East group and both child routes deliberately reuse row ID{" "}
        <code>shared</code>. Focus a cell and press Alt+N, or choose Note from
        its context menu. Notes stay separate and return when you revisit the
        same query and route. Paging and direction preserve them. Replacing the
        simulated provider releases its default notes.
      </p>
      <div
        style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}
      >
        <button type="button" onClick={() => model.setQuery({ sorting: [] })}>
          Reset note query
        </button>
        <button type="button" onClick={() => setProvider((value) => value + 1)}>
          Replace note provider
        </button>
        <span role="status">Note provider {provider}</span>
      </div>
      <ServerDataGrid
        model={model}
        columns={columns}
        height={230}
        direction={direction}
        ariaLabel="Scoped server notes"
      />
    </article>
  );
}
