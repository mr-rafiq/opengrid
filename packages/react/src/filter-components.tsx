import { useEffect, useId, useState } from "react";
import type { Column, Filter } from "@opengrid/core";

export interface ColumnFilterProps<T> {
  column: Column<T>;
  filter?: Filter;
  label: string;
  onFilterChange: (filter?: Filter) => void;
  onClear: () => void;
}
interface Bounds {
  minimum: string;
  maximum: string;
  error: string;
}
const scalar = (value: unknown) =>
  value instanceof Date
    ? Number.isFinite(value.getTime())
      ? value.toISOString()
      : "Invalid Date"
    : value == null
      ? ""
      : String(value);
const signature = (filter?: Filter) =>
  filter
    ? JSON.stringify([
        filter.op,
        typeof filter.value,
        scalar(filter.value),
        typeof filter.to,
        scalar(filter.to),
      ])
    : "";
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
    error:
      "The current filter is not an inclusive range. Change a bound or clear it to replace that filter.",
  };
}
function parseBound(
  value: string,
  type: "number" | "bigint" | "date",
): number | bigint {
  const input = value.trim();
  if (input.length > 256)
    throw new Error("Each range bound is limited to 256 characters");
  if (type === "bigint") {
    if (!/^[+-]?\d+$/.test(input))
      throw new Error("Enter a complete integer for each BigInt bound");
    return BigInt(input);
  }
  if (type === "date") {
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T.+)?$/.exec(input);
    if (!parts)
      throw new Error("Use an ISO date or timestamp for each date bound");
    const year = Number(parts[1]),
      month = Number(parts[2]),
      day = Number(parts[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const result = Date.parse(input);
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > days[month - 1] ||
      !Number.isFinite(result)
    )
      throw new Error("Enter a valid calendar date for each date bound");
    return result;
  }
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input) ||
    !Number.isFinite(Number(input))
  )
    throw new Error("Enter a complete finite number for each range bound");
  return Number(input);
}

/** Two inclusive bounds. Invalid drafts never replace the last valid controlled filter. */
export function NumberRangeFilter<T>({
  column,
  filter,
  label,
  onFilterChange,
  onClear,
}: ColumnFilterProps<T>) {
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
  const error = unsupported
    ? "This range filter supports number, BigInt and date columns"
    : bounds.error;
  function change(minimum: string, maximum: string) {
    setBounds({ minimum, maximum, error: "" });
    try {
      if (unsupported) return;
      const hasMinimum = minimum.trim().length > 0,
        hasMaximum = maximum.trim().length > 0;
      const lower = hasMinimum ? parseBound(minimum, type) : undefined;
      const upper = hasMaximum ? parseBound(maximum, type) : undefined;
      if (lower !== undefined && upper !== undefined && lower > upper)
        throw new Error("The minimum must not exceed the maximum");
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
          reason instanceof Error
            ? reason.message
            : "Unable to apply this range",
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
            : "Unable to clear this range",
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
      role="group"
      aria-label={`${label} range`}
    >
      <input
        type="text"
        aria-label={`${label} minimum`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        inputMode={inputMode}
        disabled={unsupported}
        placeholder={type === "date" ? "From date" : "Min"}
        value={bounds.minimum}
        onChange={(event) => change(event.target.value, bounds.maximum)}
      />
      <input
        type="text"
        aria-label={`${label} maximum`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        inputMode={inputMode}
        disabled={unsupported}
        placeholder={type === "date" ? "To date" : "Max"}
        value={bounds.maximum}
        onChange={(event) => change(bounds.minimum, event.target.value)}
      />
      <button
        type="button"
        className="og-range-filter-clear"
        aria-label={`Clear ${label}`}
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
