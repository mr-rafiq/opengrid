import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GridModel, RowNode } from "@opengrid/core";
import { gridMessage, useGridLocale } from "./locale.js";
import type { GridMessage } from "./locale.js";

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
  readonly groupLabel?: string;
  readonly leafCount?: number;
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
const scopeKeys = {
  filtered: "print.filtered",
  view: "print.view",
  page: "print.page",
  selected: "print.selected",
  all: "print.all",
} as const;
class PrintSnapshotError extends Error {
  constructor(
    message: string,
    readonly descriptor: GridMessage,
  ) {
    super(message);
  }
}
class PrintSnapshotRangeError extends RangeError {
  constructor(
    message: string,
    readonly descriptor: GridMessage,
  ) {
    super(message);
  }
}
function validateLimit(value: number, name: string, hard: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > hard)
    throw new PrintSnapshotRangeError(
      `${name} must be an integer from 1 through ${hard}`,
      gridMessage("print.invalidLimit", { name, limit: hard }),
    );
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
    throw new PrintSnapshotError(
      "Unknown print scope",
      gridMessage("print.invalidScope"),
    );
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
    throw new PrintSnapshotRangeError(
      `Print scope has ${nodes.length.toLocaleString("en-US")} rows, exceeding maxRows ${maxRows.toLocaleString("en-US")}. Choose a smaller scope or raise the explicit limit.`,
      gridMessage("print.rowLimit", { count: nodes.length, limit: maxRows }),
    );
  const cellCount = (nodes.length + 1) * columns.length;
  if (cellCount > maxCells)
    throw new PrintSnapshotRangeError(
      `Print scope needs ${cellCount.toLocaleString("en-US")} table cells including headers, exceeding maxCells ${maxCells.toLocaleString("en-US")}.`,
      gridMessage("print.cellLimit", { count: cellCount, limit: maxCells }),
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
      ...(node.kind === "group"
        ? {
            groupLabel: printable(node.label ?? node.id),
            leafCount: node.leafCount,
          }
        : {}),
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
  title,
  caption,
  ariaLabel,
  showPrintButton = true,
  repeatHeaders = true,
  avoidRowBreaks = true,
  pageSize = "auto",
  orientation = "portrait",
}: GridPrintViewProps<T>) {
  const locale = useGridLocale();
  const resolvedTitle = title ?? locale.t("print.title");
  const [revision, setRevision] = useState(0),
    [stale, setStale] = useState(false),
    [message, setMessage] = useState<GridMessage | undefined>();
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
          error instanceof PrintSnapshotError ||
          error instanceof PrintSnapshotRangeError
            ? error.descriptor
            : error instanceof Error
              ? error.message
              : gridMessage("print.buildFailed"),
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
      setMessage(gridMessage("print.requested"));
    } catch {
      restore();
      setMessage(gridMessage("print.unavailable"));
    }
  }
  return (
    <section
      data-og-print-view={id}
      aria-label={ariaLabel ?? resolvedTitle}
      lang={locale.locale}
    >
      <style>{style}</style>
      <h2 id={headingId}>{resolvedTitle}</h2>
      <div className="og-print-controls">
        <button
          type="button"
          onClick={() => {
            setRevision((value) => value + 1);
            setMessage(gridMessage("print.refreshed"));
          }}
        >
          {locale.t("print.refresh")}
        </button>
        {showPrintButton && (
          <button
            type="button"
            onClick={print}
            disabled={!snapshot || !snapshot.columns.length}
          >
            {locale.t("print.print")}
          </button>
        )}
        <span id={statusId} role="status" aria-live="polite">
          {locale.t("print.summary", {
            scope: locale.t(scopeKeys[scope] ?? "print.unknown"),
            rows: snapshot?.rowCount ?? 0,
            columns: snapshot?.columns.length ?? 0,
          })}{" "}
          {message === undefined ? "" : locale.resolveMessage(message)}{" "}
          {stale ? locale.t("print.stale") : locale.t("print.captured")}
        </span>
      </div>
      {result.error !== undefined ? (
        <p role="alert">
          {locale.t("print.createError", {
            error: locale.resolveMessage(result.error),
          })}
        </p>
      ) : snapshot && !snapshot.columns.length ? (
        <p role="status">{locale.t("print.noColumns")}</p>
      ) : (
        snapshot && (
          <div
            className="og-print-scroll"
            role="region"
            aria-label={locale.t("print.tableArea", { title: resolvedTitle })}
            tabIndex={0}
          >
            <table aria-labelledby={headingId} aria-describedby={statusId}>
              <caption>
                {caption ?? locale.t(scopeKeys[snapshot.scope])}
              </caption>
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
                      {row.cells.map((capturedCell, index) => {
                        const cell =
                          row.kind === "group" &&
                          index === 0 &&
                          row.groupLabel !== undefined
                            ? `${row.groupLabel}${row.leafCount === undefined ? "" : ` (${locale.number(row.leafCount)})`}`
                            : capturedCell;
                        return index === 0 ? (
                          <th
                            key={snapshot.columns[index].id}
                            scope="row"
                            aria-label={
                              row.depth > 0
                                ? locale.t("print.level", {
                                    level: row.depth + 1,
                                    value: cell,
                                  })
                                : undefined
                            }
                            style={{ paddingInlineStart: 8 + row.depth * 16 }}
                          >
                            {cell}
                          </th>
                        ) : (
                          <td key={snapshot.columns[index].id}>{cell}</td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={snapshot.columns.length}>
                      {locale.t("print.empty")}
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
