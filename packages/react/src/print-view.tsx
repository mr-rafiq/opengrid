import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GridModel, RowNode } from "@opengrid/core";

export type GridPrintScope = "filtered" | "view" | "page" | "selected" | "all";
export interface GridPrintOptions {
  scope?: GridPrintScope;
  maxRows?: number;
  maxCells?: number;
}
export interface GridPrintColumn {
  readonly id: string;
  readonly label: string;
}
export interface GridPrintRow {
  readonly key: string;
  readonly kind: "row" | "group";
  readonly depth: number;
  readonly cells: readonly string[];
}
export interface GridPrintSnapshot {
  readonly scope: GridPrintScope;
  readonly columns: readonly GridPrintColumn[];
  readonly rows: readonly GridPrintRow[];
  readonly rowCount: number;
  readonly cellCount: number;
}
export interface GridPrintViewProps<T> extends GridPrintOptions {
  model: GridModel<T>;
  title?: string;
  caption?: string;
  ariaLabel?: string;
  showPrintButton?: boolean;
  repeatHeaders?: boolean;
  avoidRowBreaks?: boolean;
  pageSize?: "auto" | "A4" | "letter";
  orientation?: "portrait" | "landscape";
}

const scopeLabels: Record<GridPrintScope, string> = {
  filtered: "Sorted and filtered rows",
  view: "Expanded group/tree view",
  page: "Current page",
  selected: "Selected rows in current filtered results",
  all: "All source rows (input order)",
};
function validateLimit(value: number, name: string, hard: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > hard)
    throw new RangeError(`${name} must be an integer from 1 through ${hard}`);
}
const printable = (value: unknown) => (value == null ? "" : String(value));

/** A detached, frozen, plain-text projection. This never changes or expands the grid model. */
export function buildGridPrintSnapshot<T>(
  model: GridModel<T>,
  {
    scope = "filtered",
    maxRows = 1000,
    maxCells = 100000,
  }: GridPrintOptions = {},
): GridPrintSnapshot {
  if (!Object.hasOwn(scopeLabels, scope))
    throw new Error("Unknown print scope");
  validateLimit(maxRows, "maxRows", 10000);
  validateLimit(maxCells, "maxCells", 1000000);
  const definitions = model.getColumns().filter((column) => !column.hidden);
  const columns = definitions.map((column) =>
    Object.freeze({
      id: column.id,
      label: printable(column.header ?? column.id),
    }),
  );
  let nodes: RowNode<T>[];
  if (scope === "view" || scope === "page")
    nodes = scope === "page" ? model.getPageRows() : model.getRowModel();
  else {
    let rows = scope === "all" ? model.getRows() : model.getFilteredRows();
    if (scope === "selected") {
      const selected = new Set(
        model
          .getState()
          .selected.map((id) => model.getRow(id))
          .filter((row): row is T => row !== undefined),
      );
      rows = rows.filter((row) => selected.has(row));
    }
    nodes = rows.map((data, index) => ({
      id: `print-row-${index}`,
      kind: "row",
      depth: 0,
      data,
    }));
  }
  if (nodes.length > maxRows)
    throw new RangeError(
      `Print scope has ${nodes.length.toLocaleString("en-US")} rows, exceeding maxRows ${maxRows.toLocaleString("en-US")}. Choose a smaller scope or raise the explicit limit.`,
    );
  const cellCount = (nodes.length + 1) * columns.length;
  if (cellCount > maxCells)
    throw new RangeError(
      `Print scope needs ${cellCount.toLocaleString("en-US")} table cells including headers, exceeding maxCells ${maxCells.toLocaleString("en-US")}.`,
    );
  const rows = nodes.map((node) => {
    const cells = definitions.map((column, index) => {
      if (node.kind === "group" && index === 0)
        return `${node.label ?? node.id}${node.leafCount === undefined ? "" : ` (${node.leafCount})`}`;
      const value =
        node.data === undefined
          ? node.aggregates && Object.hasOwn(node.aggregates, column.id)
            ? node.aggregates[column.id]
            : undefined
          : model.getValue(node.data, column.id);
      return node.data !== undefined && column.valueFormatter
        ? printable(column.valueFormatter(value, node.data))
        : printable(value);
    });
    return Object.freeze({
      key: node.id,
      kind: node.kind,
      depth: node.depth,
      cells: Object.freeze(cells),
    });
  });
  return Object.freeze({
    scope,
    columns: Object.freeze(columns),
    rows: Object.freeze(rows),
    rowCount: rows.length,
    cellCount,
  });
}

let activePrintCleanup: (() => void) | undefined;

export function GridPrintView<T>({
  model,
  scope = "filtered",
  maxRows = 1000,
  maxCells = 100000,
  title = "Grid print view",
  caption,
  ariaLabel,
  showPrintButton = true,
  repeatHeaders = true,
  avoidRowBreaks = true,
  pageSize = "auto",
  orientation = "portrait",
}: GridPrintViewProps<T>) {
  const [revision, setRevision] = useState(0),
    [stale, setStale] = useState(false),
    [message, setMessage] = useState("");
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const id = `og-print-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const headingId = `${id}-heading`,
    statusId = `${id}-status`;
  const result = useMemo(() => {
    const version = model.getState();
    try {
      return {
        snapshot: buildGridPrintSnapshot(model, { scope, maxRows, maxCells }),
        error: undefined,
        version,
      };
    } catch (error) {
      return {
        snapshot: undefined,
        version,
        error:
          error instanceof Error
            ? error.message
            : "Unable to build print snapshot",
      };
    }
  }, [model, scope, maxRows, maxCells, revision]);
  useEffect(() => {
    const check = () => setStale(model.getState() !== result.version);
    check();
    return model.subscribe(check);
  }, [model, result]);
  useEffect(() => () => cleanup.current?.(), []);
  const snapshot = result.snapshot;
  const validPageSize =
    pageSize === "A4" || pageSize === "letter" ? pageSize : "auto";
  const validOrientation =
    orientation === "landscape" ? "landscape" : "portrait";
  const pageRule =
    validPageSize === "auto"
      ? validOrientation
      : `${validPageSize} ${validOrientation}`;
  const style = `
    [data-og-print-view="${id}"]{font:13px/1.45 system-ui,sans-serif;color:#203047;background:#fff;border:1px solid #cbd5df;border-radius:8px;padding:16px;}
    [data-og-print-view="${id}"] h2{margin:0 0 8px;font-size:18px;}
    [data-og-print-view="${id}"] .og-print-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;}
    [data-og-print-view="${id}"] button{font:inherit;color:inherit;background:#fff;border:1px solid #aebdca;border-radius:4px;padding:6px 10px;cursor:pointer;}
    [data-og-print-view="${id}"] button:disabled{opacity:.5;cursor:default;}
    [data-og-print-view="${id}"] button:focus-visible{outline:2px solid #087f71;outline-offset:2px;}
    [data-og-print-view="${id}"] .og-print-scroll{overflow:auto;max-height:480px;}
    [data-og-print-view="${id}"] .og-print-scroll:focus-visible{outline:2px solid #087f71;outline-offset:2px;}
    [data-og-print-view="${id}"] table{width:100%;border-collapse:collapse;table-layout:auto;}
    [data-og-print-view="${id}"] th,[data-og-print-view="${id}"] td{border:1px solid #cbd5df;padding:6px 8px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;}
    [data-og-print-view="${id}"] thead th,[data-og-print-view="${id}"] .og-print-group-row{background:#eef3f7;font-weight:600;}
    [data-og-print-view="${id}"] tbody th{font-weight:500;}
    [data-og-print-view="${id}"] caption{text-align:left;font-weight:600;padding:0 0 8px;}
    @page ${id}{size:${pageRule};margin:12mm;}
    @media print{
      html[data-og-print-target="${id}"] [data-og-print-ancestor="${id}"]{display:block!important;position:static!important;width:auto!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:0!important;border:0!important;transform:none!important;}
      html[data-og-print-target="${id}"] [data-og-print-ancestor="${id}"]>*:not([data-og-print-ancestor="${id}"]):not([data-og-print-view="${id}"]){display:none!important;}
      html[data-og-print-target="${id}"] [data-og-print-view="${id}"]{page:${id};display:block!important;border:0!important;padding:0!important;margin:0!important;border-radius:0!important;width:100%!important;}
      html[data-og-print-target="${id}"] [data-og-print-view="${id}"] .og-print-controls{display:none!important;}
      html[data-og-print-target="${id}"] [data-og-print-view="${id}"] .og-print-scroll{overflow:visible!important;max-height:none!important;}
      html[data-og-print-target="${id}"] [data-og-print-view="${id}"] thead{display:${repeatHeaders ? "table-header-group" : "table-row-group"};}
      html[data-og-print-target="${id}"] [data-og-print-view="${id}"] tr{break-inside:${avoidRowBreaks ? "avoid" : "auto"};page-break-inside:${avoidRowBreaks ? "avoid" : "auto"};}
    }
  `;
  function print() {
    if (!snapshot || !snapshot.columns.length) return;
    activePrintCleanup?.();
    const ancestors: { element: HTMLElement; previous: string | null }[] = [];
    let element = window.document.querySelector<HTMLElement>(
      `[data-og-print-view="${id}"]`,
    )?.parentElement;
    while (element) {
      ancestors.push({
        element,
        previous: element.getAttribute("data-og-print-ancestor"),
      });
      element.setAttribute("data-og-print-ancestor", id);
      if (element === document.body) break;
      element = element.parentElement;
    }
    document.documentElement.setAttribute("data-og-print-target", id);
    const restore = () => {
      for (const { element, previous } of ancestors)
        if (element.getAttribute("data-og-print-ancestor") === id) {
          if (previous === null)
            element.removeAttribute("data-og-print-ancestor");
          else element.setAttribute("data-og-print-ancestor", previous);
        }
      if (document.documentElement.getAttribute("data-og-print-target") === id)
        document.documentElement.removeAttribute("data-og-print-target");
      window.removeEventListener("afterprint", restore);
      if (activePrintCleanup === restore) activePrintCleanup = undefined;
      if (cleanup.current === restore) cleanup.current = undefined;
    };
    activePrintCleanup = restore;
    cleanup.current = restore;
    window.addEventListener("afterprint", restore);
    try {
      window.print();
      setMessage(
        "Print dialog requested. Browser settings control the final output.",
      );
    } catch {
      restore();
      setMessage("Printing is unavailable in this browser.");
    }
  }
  return (
    <section data-og-print-view={id} aria-label={ariaLabel ?? title}>
      <style>{style}</style>
      <h2 id={headingId}>{title}</h2>
      <div className="og-print-controls">
        <button
          type="button"
          onClick={() => {
            setRevision((value) => value + 1);
            setMessage("Snapshot refreshed.");
          }}
        >
          Refresh print snapshot
        </button>
        {showPrintButton && (
          <button
            type="button"
            onClick={print}
            disabled={!snapshot || !snapshot.columns.length}
          >
            Print snapshot
          </button>
        )}
        <span id={statusId} role="status" aria-live="polite">
          {`${scopeLabels[scope] ?? "Unknown scope"}. ${snapshot?.rowCount.toLocaleString("en-US") ?? 0} rows, ${snapshot?.columns.length.toLocaleString("en-US") ?? 0} columns.`}{" "}
          {message}{" "}
          {stale
            ? "Grid changed; refresh the snapshot before printing."
            : "Captured snapshot; later changes do not alter its values."}
        </span>
      </div>
      {result.error ? (
        <p role="alert">Unable to create print snapshot: {result.error}</p>
      ) : snapshot && !snapshot.columns.length ? (
        <p role="status">No visible columns to print.</p>
      ) : (
        snapshot && (
          <div
            className="og-print-scroll"
            role="region"
            aria-label={`${title} table scroll area`}
            tabIndex={0}
          >
            <table aria-labelledby={headingId} aria-describedby={statusId}>
              <caption>{caption ?? scopeLabels[snapshot.scope]}</caption>
              <thead>
                <tr>
                  {snapshot.columns.map((column) => (
                    <th key={column.id} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.length ? (
                  snapshot.rows.map((row) => (
                    <tr
                      key={row.key}
                      className={
                        row.kind === "group" ? "og-print-group-row" : undefined
                      }
                      data-print-kind={row.kind}
                      data-print-depth={row.depth}
                    >
                      {row.cells.map((cell, index) =>
                        index === 0 ? (
                          <th
                            key={snapshot.columns[index].id}
                            scope="row"
                            aria-label={
                              row.depth > 0
                                ? `Level ${row.depth + 1}: ${cell}`
                                : undefined
                            }
                            style={{ paddingInlineStart: 8 + row.depth * 16 }}
                          >
                            {cell}
                          </th>
                        ) : (
                          <td key={snapshot.columns[index].id}>{cell}</td>
                        ),
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={snapshot.columns.length}>
                      No rows in this print scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
