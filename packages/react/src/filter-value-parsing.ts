import { gridMessage } from "./locale.js";
import type { GridMessage } from "./locale.js";

export class RangeFilterMessageError extends Error {
  constructor(readonly notice: GridMessage) {
    super();
  }
}
export function parseBound(
  value: string,
  type: "number" | "bigint" | "date",
): number | bigint {
  const input = value.trim();
  if (input.length > 256)
    throw new RangeFilterMessageError(gridMessage("rangeFilter.boundLimit"));
  if (type === "bigint") {
    if (!/^[+-]?\d+$/.test(input))
      throw new RangeFilterMessageError(gridMessage("rangeFilter.integer"));
    return BigInt(input);
  }
  if (type === "date") {
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T.+)?$/.exec(input);
    if (!parts)
      throw new RangeFilterMessageError(gridMessage("rangeFilter.iso"));
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
      throw new RangeFilterMessageError(gridMessage("rangeFilter.date"));
    return result;
  }
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input) ||
    !Number.isFinite(Number(input))
  )
    throw new RangeFilterMessageError(gridMessage("rangeFilter.number"));
  return Number(input);
}
