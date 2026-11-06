import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
  type Ag31ColumnDefinition,
  type Ag31RowRevealPosition,
} from "@opengrid/react";
type Line = { id: string; item: string; amount: number; note: string };
const columns: Ag31ColumnDefinition<Line>[] = [
  {
    field: "item",
    headerName: "Item",
    width: 180,
    pinned: "left",
    checkboxSelection: true,
    headerCheckboxSelection: true,
  },
  { field: "amount", headerName: "Amount", width: 140, cellDataType: "number" },
  { field: "note", headerName: "Detail", width: 400 },
];
const sampleOffset = Object.freeze({ top: 800, left: 140 });
const identify = ({ data }: { data: Line }) => data.id;
export function LegacyScrollLab() {
  const ref = useRef<Ag31ClientGridHandle<Line>>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false),
    [compact, setCompact] = useState(false),
    [alignment, setAlignment] = useState<Ag31RowRevealPosition>("middle"),
    [position, setPosition] = useState({ top: 0, left: 0 });
  const rows = useMemo(
    () =>
      Array.from({ length: 500 }, (_, i) => ({
        id: String(i + 1),
        item: `Synthetic line ${i + 1}`,
        amount: (i + 1) * 12,
        note: `Local detail ${i + 1}`,
      })),
    [],
  );
  const onReady = useCallback(() => setReady(true), []);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const move = (top: number, left: number) =>
    ref.current?.api.ctrlsService.params?.gridBodyCtrl.bodyScrollFeature.setScrollPosition(
      top,
      left,
    );
  return (
    <section aria-label="Source scroll restoration example">
      <h3>Restore the mounted viewport</h3>
      <p>
        Original local records. Scroll restoration moves the real viewport
        without selecting another cell or moving keyboard focus. Complete source
        saved state, focus APIs and automatic sizing strategies remain separate
        requirements.
      </p>
      <div className="grouping-lab-controls">
        <button type="button" disabled={!ready} onClick={() => move(0, 0)}>
          Scroll to start
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => move(sampleOffset.top, sampleOffset.left)}
        >
          Scroll to middle
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => move(999999, 999999)}
        >
          Scroll to end
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => move(140.5, 75.25)}
        >
          Fractional sample offset
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            const api = ref.current?.api;
            if (!api) return;
            if (timer.current !== null) clearTimeout(timer.current);
            api.showLoadingOverlay();
            timer.current = setTimeout(() => {
              timer.current = null;
              if (api.isDestroyed()) return;
              try {
                api.ctrlsService.params?.gridBodyCtrl.bodyScrollFeature.setScrollPosition(
                  sampleOffset.top,
                  sampleOffset.left,
                );
              } finally {
                if (api.overlayService.isAlive()) api.hideOverlay();
              }
            }, 100);
          }}
        >
          Restore sample scroll
        </button>
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => setCompact(!compact)}
        >
          Compact scroll host
        </button>
      </div>
      <fieldset>
        <legend>Reveal a resident row</legend>
        <p>
          Reveal commands preserve horizontal scroll, selection and keyboard
          focus.
        </p>
        <div className="grouping-lab-controls">
          <label>
            Reveal alignment
            <select
              value={alignment ?? "auto"}
              onChange={(event) =>
                setAlignment(
                  event.target.value === "auto"
                    ? null
                    : (event.target.value as Ag31RowRevealPosition),
                )
              }
            >
              <option value="auto">Minimum scroll</option>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!ready}
            onClick={() => ref.current?.api.ensureIndexVisible(250, alignment)}
          >
            Reveal displayed row 250
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              const api = ref.current?.api,
                node = api?.getRowNode("251");
              if (node) api!.ensureNodeVisible(node, alignment);
            }}
          >
            Reveal source node 251
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() =>
              ref.current?.api.ensureNodeVisible(rows[250], alignment)
            }
          >
            Reveal original record 251
          </button>
        </div>
      </fieldset>
      <p>
        <output aria-label="Source viewport position" aria-live="off">
          Top {Math.round(position.top * 100) / 100}px; left{" "}
          {Math.round(position.left * 100) / 100}px
        </output>
      </p>
      <div
        style={{
          height: compact ? 220 : 360,
          width: "100%",
          maxWidth: 480,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
        onScrollCapture={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.classList.contains("og-viewport")
          )
            setPosition({ top: target.scrollTop, left: target.scrollLeft });
        }}
      >
        <Ag31ClientGrid
          ref={ref}
          rowData={rows}
          columnDefs={columns}
          getRowId={identify}
          rowHeight={40}
          headerHeight={48}
          rowSelection="multiple"
          groupSelectsChildren
          suppressRowClickSelection
          onGridReady={onReady}
          ariaLabel="Source scroll records"
        />
      </div>
    </section>
  );
}
