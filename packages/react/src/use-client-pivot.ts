import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  buildClientPivotReport,
  createGrid,
  type ClientPivotOptions,
  type ClientPivotReport,
  type Column,
  type GridModel,
  type PivotConfiguration,
  type PivotReportRow,
} from "@opengrid/core";

export interface UseClientPivotOptions extends ClientPivotOptions {
  enabled?: boolean;
}
export interface ClientPivotView {
  status: "disabled" | "empty" | "ready" | "error";
  model: GridModel<PivotReportRow> | null;
  report?: ClientPivotReport;
  error?: Error;
  pinnedBottomRowIds: readonly string[];
}
function resultColumns(report: ClientPivotReport): Column<PivotReportRow>[] {
  return report.columns.map((column) => ({
    id: column.id,
    header: column.header,
    groupPath: column.groupPath,
    type: column.type ?? "text",
    width: column.kind === "dimension" || column.kind === "summary" ? 190 : 165,
    minWidth: 100,
    editable: false,
    groupable: false,
    filterable: false,
    valueGetter: (row) => row.cells[column.id],
    valueFormatter: (_value, row) => row.display[column.id] ?? "",
  }));
}
const reportRows = (report: ClientPivotReport) => [
  ...report.rows,
  ...(report.grandTotal ? [report.grandTotal] : []),
];
/** A read-only derived matrix. Source data/state/history remain owned by the caller. */
export function useClientPivot<T>(
  source: GridModel<T>,
  configuration: PivotConfiguration,
  options: UseClientPivotOptions = {},
): ClientPivotView {
  const sourceState = useSyncExternalStore(
    source.subscribe,
    source.getState,
    source.getState,
  );
  const enabled = options.enabled !== false;
  const snapshot = useMemo(() => {
    if (!enabled) return { status: "disabled" as const };
    try {
      const report = buildClientPivotReport(source, configuration, options);
      return {
        status: report.emptyReason ? ("empty" as const) : ("ready" as const),
        report,
      };
    } catch (error) {
      return {
        status: "error" as const,
        error:
          error instanceof Error
            ? error
            : new Error("Could not build pivot report", { cause: error }),
      };
    }
  }, [
    source,
    sourceState,
    configuration,
    enabled,
    options.limits,
    options.labels,
  ]);
  const owned = useRef<{
    source: GridModel<T>;
    model: GridModel<PivotReportRow>;
    report: ClientPivotReport;
  } | null>(null);
  if (snapshot.report && (!owned.current || owned.current.source !== source)) {
    owned.current = {
      source,
      report: snapshot.report,
      model: createGrid({
        rows: reportRows(snapshot.report),
        columns: resultColumns(snapshot.report),
        getRowId: (row) => row.id,
      }),
    };
  }
  useLayoutEffect(() => {
    if (!enabled || !owned.current || owned.current.source !== source) return;
    if (!snapshot.report) {
      // A schema/data error must never leave a stale matrix presented as current.
      owned.current.model.setRows([]);
    } else if (owned.current.report !== snapshot.report) {
      owned.current.model.setColumns(resultColumns(snapshot.report));
      owned.current.model.setRows(reportRows(snapshot.report));
      owned.current.report = snapshot.report;
    }
  }, [source, snapshot, enabled]);
  return {
    status: snapshot.status,
    model: snapshot.report ? owned.current!.model : null,
    report: snapshot.report,
    error: snapshot.error,
    pinnedBottomRowIds: useMemo(
      () =>
        Object.freeze(
          snapshot.report?.grandTotal ? [snapshot.report.grandTotal.id] : [],
        ),
      [snapshot.report],
    ),
  };
}
