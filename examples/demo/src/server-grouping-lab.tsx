import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ServerSideRowModel } from "@opengrid/core";
import { ServerTreeDataGrid, ServerSidePanel, GridIcon } from "@opengrid/react";
import { NavigationDrawer } from "../../shared/navigation-drawer";
import {
  serverGroupingColumns,
  serverGroupingResponse,
  type ServerOrder,
} from "./server-grouping-provider";
export function ServerGroupingLab() {
  const failA = useRef(false);
  const [rtl, setRtl] = useState(false);
  const [columns, setColumns] = useState(serverGroupingColumns);
  const [tools, setTools] = useState(false);
  const [preset, setPreset] = useState("minimal");
  const model = useMemo(
    () =>
      new ServerSideRowModel<ServerOrder>(
        {
          getRows: async (request) => {
            await new Promise((resolve) => setTimeout(resolve, 60));
            if (request.signal.aborted)
              throw new DOMException("Aborted", "AbortError");
            if (request.groupKeys[0] === "A" && failA.current) {
              failA.current = false;
              throw Error("Demo branch A is offline");
            }
            return serverGroupingResponse(request);
          },
        },
        {
          blockSize: 2,
          maxBlocks: 6,
          query: {
            rowGroupColumns: ["team"],
            valueColumns: [{ columnId: "amount", aggregate: "sum" }],
          },
        },
      ),
    [],
  );
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  return (
    <section
      aria-label="Remote grouping example"
      className={`grouping-lab ${preset === "material" ? "og-preset-material" : ""}`}
    >
      <p>
        Open both teams together, load more independently, and retry a failed
        branch while its sibling stays visible. Sorting and filtering execute in
        the demo provider. The sidebar sends real grouping, value and condition
        requests; column visibility stays in this view.
      </p>
      <div className="grouping-lab-controls">
        <button
          onClick={() => {
            void model.refresh({ purge: false }).catch(() => {});
          }}
        >
          Refresh server groups
        </button>
        <button
          disabled={model.getQuery().rowGroupColumns[0] !== "team"}
          onClick={() => {
            failA.current = true;
            void model.refreshRoute(["A"], { purge: false }).catch(() => {});
          }}
        >
          Fail next Team A request
        </button>
        <label>
          <input
            type="checkbox"
            checked={rtl}
            onChange={(event) => setRtl(event.target.checked)}
          />
          Right-to-left server view
        </label>
        <span role="status">
          Cached blocks: {snapshot.blocks.length} / {model.maxBlocks}
        </span>
      </div>
      <div className="server-grid-options">
        <label>
          Grid style
          <select
            aria-label="Server grid style"
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
          >
            <option value="minimal">Minimal</option>
            <option value="material">Material</option>
          </select>
        </label>
        <button
          className="server-tools-toggle"
          aria-haspopup="dialog"
          aria-controls="server-grouping-tools"
          aria-expanded={tools}
          onClick={() => setTools(true)}
        >
          <GridIcon name="columns" size={18} />
          Server columns &amp; filters
        </button>
      </div>
      <div className="server-grid-workbench">
        <div className="server-grid-main">
          <ServerTreeDataGrid
            model={model}
            columns={columns}
            height={440}
            direction={rtl ? "rtl" : "ltr"}
            ariaLabel="Simultaneous server groups"
          />
        </div>
        <aside className="server-grid-sidebar" aria-label="Server sidebar">
          <ServerSidePanel
            model={model}
            columns={columns}
            onColumnsChange={setColumns}
          />
        </aside>
      </div>
      <NavigationDrawer
        id="server-grouping-tools"
        desktopWidth={1000}
        label="Server tools"
        open={tools}
        onClose={() => setTools(false)}
      >
        <ServerSidePanel
          model={model}
          columns={columns}
          onColumnsChange={setColumns}
        />
      </NavigationDrawer>
    </section>
  );
}
