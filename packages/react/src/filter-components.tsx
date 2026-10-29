import { parseBound, RangeFilterMessageError } from "./filter-value-parsing.js";
export { parseBound, RangeFilterMessageError } from "./filter-value-parsing.js";
import { columnFilterFingerprint } from "./column-condition-draft.js";
import { useEffect, useId, useState } from "react";
import type { Column, Filter, GridModel } from "@opengrid/core";
import { gridMessage, useGridLocale } from "./locale.js";
import type { GridMessage } from "./locale.js";

export interface ColumnFilterProps<T> {
  column: Column<T>;
  /** Resident source model, supplied by DataGrid to data-dependent filter panels. */
  model?: GridModel<T>;
  filter?: Filter;
  /** Authoritative synchronous read for staged adapters whose controlled mirror can lag. */
  getFilter?: () => Filter | undefined;
  label: string;
  onFilterChange: (filter?: Filter) => void;
  onClear: () => void;
}
interface Bounds {
  minimum: string;
  maximum: string;
  error: GridMessage | string;
}
const scalar = (value: unknown) =>
  value instanceof Date
    ? Number.isFinite(value.getTime())
      ? value.toISOString()
      : "Invalid Date"
    : value == null
      ? ""
      : String(value);
const signature = (filter?: Filter) => {
  try {
    return columnFilterFingerprint(filter);
  } catch {
    return "unreadable";
  }
};
function fromFilter(filter?: Filter): Bounds {
  if (!filter) return { minimum: "", maximum: "", error: "" };
  if (filter.op === "between")
    return {
      minimum: scalar(filter.value),
      maximum: scalar(filter.to),
      error: "",
    };
  if (filter.op === "gte")
    return { minimum: scalar(filter.value), maximum: "", error: "" };
  if (filter.op === "lte")
    return { minimum: "", maximum: scalar(filter.value), error: "" };
  if (filter.op === "equals")
    return {
      minimum: scalar(filter.value),
      maximum: scalar(filter.value),
      error: "",
    };
  return {
    minimum: "",
    maximum: "",
    error: gridMessage("rangeFilter.notRange"),
  };
}
/** Two inclusive bounds. Invalid drafts never replace the last valid controlled filter. */
export function NumberRangeFilter<T>({
  column,
  filter,
  label,
  onFilterChange,
  onClear,
}: ColumnFilterProps<T>) {
  const { t, resolveMessage, locale } = useGridLocale();
  const [bounds, setBounds] = useState<Bounds>(() => fromFilter(filter));
  const errorId = useId();
  const filterKey = signature(filter);
  useEffect(() => {
    setBounds(fromFilter(filter));
  }, [filterKey]);
  const type =
    column.type === "bigint"
      ? "bigint"
      : column.type === "date"
        ? "date"
        : "number";
  const unsupported = !["number", "bigint", "date"].includes(column.type ?? "");
  const compound = filter?.op === "and" || filter?.op === "or";
  const error = resolveMessage(
    unsupported
      ? gridMessage("rangeFilter.type")
      : compound
        ? gridMessage("rangeFilter.compound")
        : bounds.error,
  );
  function change(minimum: string, maximum: string) {
    if (unsupported || compound) return;
    setBounds({ minimum, maximum, error: "" });
    try {
      const hasMinimum = minimum.trim().length > 0,
        hasMaximum = maximum.trim().length > 0;
      const lower = hasMinimum ? parseBound(minimum, type) : undefined;
      const upper = hasMaximum ? parseBound(maximum, type) : undefined;
      if (lower !== undefined && upper !== undefined && lower > upper)
        throw new RangeFilterMessageError(gridMessage("rangeFilter.order"));
      const next: Filter | undefined =
        hasMinimum && hasMaximum
          ? { op: "between", value: minimum, to: maximum }
          : hasMinimum
            ? { op: "gte", value: minimum }
            : hasMaximum
              ? { op: "lte", value: maximum }
              : undefined;
      onFilterChange(next);
    } catch (reason) {
      setBounds({
        minimum,
        maximum,
        error:
          reason instanceof RangeFilterMessageError
            ? reason.notice
            : reason instanceof Error
              ? reason.message
              : typeof reason === "string"
                ? reason
                : gridMessage("rangeFilter.applyFailed"),
      });
    }
  }
  function clear() {
    try {
      onClear();
      setBounds({ minimum: "", maximum: "", error: "" });
    } catch (reason) {
      setBounds((current) => ({
        ...current,
        error:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : gridMessage("rangeFilter.clearFailed"),
      }));
    }
  }
  const inputMode =
    type === "bigint"
      ? ("numeric" as const)
      : type === "number"
        ? ("decimal" as const)
        : undefined;
  return (
    <div
      className="og-number-range-filter"
      lang={locale}
      role="group"
      aria-label={t("rangeFilter.label", { column: label })}
    >
      <input
        type="text"
        aria-label={t("rangeFilter.minimum", { column: label })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        inputMode={inputMode}
        disabled={unsupported || compound}
        placeholder={t(type === "date" ? "filter.fromDate" : "filter.min")}
        value={bounds.minimum}
        onChange={(event) => change(event.target.value, bounds.maximum)}
      />
      <input
        type="text"
        aria-label={t("rangeFilter.maximum", { column: label })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        inputMode={inputMode}
        disabled={unsupported || compound}
        placeholder={t(type === "date" ? "filter.toDate" : "filter.max")}
        value={bounds.maximum}
        onChange={(event) => change(bounds.minimum, event.target.value)}
      />
      <button
        type="button"
        className="og-range-filter-clear"
        aria-label={t("rangeFilter.clear", { column: label })}
        onClick={clear}
      >
        {"\u00d7"}
      </button>
      {error && (
        <div className="og-range-filter-error" id={errorId} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
