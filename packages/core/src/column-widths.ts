export interface ColumnWidthSource {
  readonly width?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
}
export interface ColumnWidthConstraints {
  readonly width: number;
  readonly minWidth: number;
  readonly maxWidth: number;
}
/** Shared schema constraints. Infinity is an allowed maximum, never an actual width. */
export function getColumnWidthConstraints(
  column: ColumnWidthSource,
): ColumnWidthConstraints {
  const minimum = column.minWidth === undefined ? 40 : column.minWidth;
  const maximum = column.maxWidth === undefined ? Infinity : column.maxWidth;
  const configured = column.width === undefined ? 160 : column.width;
  if (typeof minimum !== "number" || !Number.isFinite(minimum) || minimum < 0)
    throw new RangeError("Column minWidth must be a finite nonnegative number");
  if (typeof maximum !== "number" || Number.isNaN(maximum) || maximum < minimum)
    throw new RangeError(
      "Column maxWidth must be at least minWidth (Infinity is allowed)",
    );
  if (
    typeof configured !== "number" ||
    !Number.isFinite(configured) ||
    configured < 0
  )
    throw new RangeError("Column width must be a finite nonnegative number");
  return Object.freeze({
    width: Math.max(minimum, Math.min(maximum, configured)),
    minWidth: minimum,
    maxWidth: maximum,
  });
}
/** Invalid state/API attempts keep the configured fallback, matching core resize semantics. */
export function clampColumnWidth(
  column: ColumnWidthSource,
  attempted: unknown,
): number {
  const bounds = getColumnWidthConstraints(column);
  return typeof attempted === "number" && Number.isFinite(attempted)
    ? Math.max(bounds.minWidth, Math.min(bounds.maxWidth, attempted))
    : bounds.width;
}
export interface WidthColumn extends ColumnWidthSource {
  readonly id: string;
  readonly flex?: number;
  readonly hidden?: boolean;
  readonly pinned?: "left" | "right" | null;
}
export interface ColumnWidthPreview {
  readonly columnId: string;
  readonly width: number;
}
export interface ResolveColumnWidthsOptions {
  /** Total usable client width, including leading controls. Omit until measured. */
  readonly availableWidth?: number;
  readonly leadingWidth?: number;
  /** Only own entries disable flex. No mutations or state writes are performed. */
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly preview?: ColumnWidthPreview;
  /** Lowerable hard limits; the solver rejects rather than truncates work. */
  readonly maxColumns?: number;
  readonly maxWork?: number;
}
export interface ResolvedColumnWidths {
  /** Frozen null-prototype record, with visible IDs only. */
  readonly widths: Readonly<Record<string, number>>;
  /** Supplied logical order, never reordered by pin or text direction. */
  readonly columnIds: readonly string[];
  readonly flexColumnIds: readonly string[];
  readonly totalWidth: number;
  readonly availableWidth: number | undefined;
  readonly overflow: number;
  readonly unusedWidth: number;
}
export interface FitColumnWidthsOptions {
  readonly availableWidth: number;
  readonly leadingWidth?: number;
  /** Retained only for excluded columns; eligible ratios use configured widths. */
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly excludeColumnIds?: readonly string[];
  readonly maxColumns?: number;
  readonly maxWork?: number;
}
export interface FittedColumnWidths {
  readonly widths: Readonly<Record<string, number>>;
  readonly columnIds: readonly string[];
  readonly fittedColumnIds: readonly string[];
  readonly excludedColumnIds: readonly string[];
  readonly totalWidth: number;
  readonly availableWidth: number;
  readonly overflow: number;
  readonly unusedWidth: number;
}
const MAX_COLUMNS = 10000,
  MAX_WORK = 1000000;
function dimension(value: number, name: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    throw new RangeError(`${name} must be a finite nonnegative safe dimension`);
}
function addWidth(left: number, right: number): number {
  const next = left + right;
  if (
    !Number.isFinite(next) ||
    next > Number.MAX_SAFE_INTEGER ||
    (right > 0 && next <= left)
  )
    throw new RangeError(
      "Resolved column width exceeds safe accumulated geometry precision",
    );
  return next;
}
interface Item {
  id: string;
  bounds: ColumnWidthConstraints;
  weight: number;
  width: number;
}

/**
 * Bounded weighted allocation with min/max constraints. All widths are local output:
 * viewport changes never become persistent manual overrides. Pass logical model order
 * so fractional residual assignment stays identical when the display direction flips.
 */
export function resolveColumnWidths(
  columns: readonly WidthColumn[],
  options: ResolveColumnWidthsOptions = {},
): ResolvedColumnWidths {
  const maximumColumns =
    options.maxColumns === undefined ? MAX_COLUMNS : options.maxColumns;
  const maximumWork =
    options.maxWork === undefined ? MAX_WORK : options.maxWork;
  if (
    !Number.isSafeInteger(maximumColumns) ||
    maximumColumns < 1 ||
    maximumColumns > MAX_COLUMNS ||
    !Number.isSafeInteger(maximumWork) ||
    maximumWork < 1 ||
    maximumWork > MAX_WORK
  )
    throw new RangeError("Invalid column sizing resource limits");
  if (!Array.isArray(columns) || columns.length > maximumColumns)
    throw new RangeError("Column sizing column budget exceeded");
  const available = options.availableWidth,
    leading = options.leadingWidth === undefined ? 0 : options.leadingWidth;
  if (available !== undefined) dimension(available, "availableWidth");
  dimension(leading, "leadingWidth");
  const overrides = options.columnWidths;
  if (
    overrides !== undefined &&
    (overrides === null ||
      typeof overrides !== "object" ||
      Array.isArray(overrides))
  )
    throw new TypeError("columnWidths must be a record");
  const preview = options.preview;
  if (
    preview !== undefined &&
    (preview === null ||
      typeof preview !== "object" ||
      typeof preview.columnId !== "string" ||
      !preview.columnId ||
      typeof preview.width !== "number" ||
      !Number.isFinite(preview.width))
  )
    throw new TypeError("Invalid column resize preview");
  let work = 0;
  const tick = () => {
    if (++work > maximumWork)
      throw new RangeError("Column sizing work budget exceeded");
  };
  const ids = new Set<string>(),
    visible: Item[] = [],
    flexible: Item[] = [];
  let fixedWidth = leading,
    foundPreview = false;
  for (let index = 0; index < columns.length; index++) {
    tick();
    const descriptor = Object.getOwnPropertyDescriptor(columns, String(index));
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(
        "Column sizing requires a dense array without accessor entries",
      );
    const column: WidthColumn = descriptor.value;
    if (
      column === null ||
      typeof column !== "object" ||
      typeof column.id !== "string" ||
      !column.id ||
      ids.has(column.id)
    )
      throw new TypeError("Column sizing IDs must be unique nonempty strings");
    ids.add(column.id);
    const bounds = getColumnWidthConstraints(column);
    if (
      column.flex !== undefined &&
      (typeof column.flex !== "number" ||
        !Number.isFinite(column.flex) ||
        column.flex <= 0)
    )
      throw new RangeError("Column flex must be a positive finite number");
    if (column.hidden) continue;
    const override =
      overrides && Object.getOwnPropertyDescriptor(overrides, column.id);
    if (override && !("value" in override))
      throw new TypeError("Column width overrides cannot contain accessors");
    const isPreview = preview?.columnId === column.id;
    if (isPreview) foundPreview = true;
    const active =
      available !== undefined &&
      column.flex !== undefined &&
      !override &&
      !isPreview;
    const width = isPreview
      ? clampColumnWidth(column, preview!.width)
      : override
        ? clampColumnWidth(column, override.value)
        : bounds.width;
    const item = { id: column.id, bounds, width, weight: column.flex ?? 0 };
    visible.push(item);
    if (active) flexible.push(item);
    else fixedWidth = addWidth(fixedWidth, width);
  }
  if (preview && !foundPreview)
    throw new Error("Column resize preview requires a visible column");
  if (available !== undefined && flexible.length) {
    let minimumTotal = 0;
    for (const item of flexible) {
      tick();
      minimumTotal = addWidth(minimumTotal, item.bounds.minWidth);
    }
    const target = available - fixedWidth;
    if (target <= minimumTotal) {
      for (const item of flexible) {
        tick();
        item.width = item.bounds.minWidth;
      }
    } else {
      let remaining = target,
        free = flexible;
      while (free.length) {
        let largestWeight = 0,
          weightTotal = 0;
        for (const item of free) {
          tick();
          largestWeight = Math.max(largestWeight, item.weight);
        }
        // Normalization avoids overflowing sums of large but individually finite weights.
        for (const item of free) {
          tick();
          weightTotal += item.weight / largestWeight;
        }
        let clampedTotal = 0;
        const candidates = free.map((item) => {
          tick();
          const ideal =
            (remaining * (item.weight / largestWeight)) / weightTotal;
          const width = Math.max(
            item.bounds.minWidth,
            Math.min(item.bounds.maxWidth, ideal),
          );
          clampedTotal = addWidth(clampedTotal, width);
          return { item, ideal, width };
        });
        const deficit = remaining - clampedTotal;
        // Do not freeze violated minima and maxima simultaneously: a capped maximum
        // can release space that makes a previously violated minimum nonbinding.
        const lockMinimum = deficit < 0;
        const locked = candidates.filter((candidate) =>
          lockMinimum
            ? candidate.ideal < candidate.item.bounds.minWidth
            : candidate.ideal > candidate.item.bounds.maxWidth,
        );
        if (!locked.length || deficit === 0) {
          for (const candidate of candidates) {
            tick();
            candidate.item.width = candidate.width;
          }
          break;
        }
        const lockedItems = new Set<Item>();
        for (const candidate of locked) {
          tick();
          candidate.item.width = candidate.width;
          remaining -= candidate.width;
          lockedItems.add(candidate.item);
        }
        free = free.filter((item) => {
          tick();
          return !lockedItems.has(item);
        });
      }
      // Correct ordinary floating point residue without integer rounding or violating
      // fractional bounds. Logical order defines ties; physical pin/RTL order does not.
      let allocated = 0;
      for (const item of flexible) {
        tick();
        allocated = addWidth(allocated, item.width);
      }
      let residue = target - allocated;
      for (
        let index = flexible.length - 1;
        index >= 0 && residue !== 0;
        index--
      ) {
        tick();
        const item = flexible[index],
          next = Math.max(
            item.bounds.minWidth,
            Math.min(item.bounds.maxWidth, item.width + residue),
          );
        const delta = next - item.width;
        item.width = next;
        residue -= delta;
      }
    }
  }
  const widths: Record<string, number> = Object.create(null);
  let totalWidth = leading;
  for (const item of visible) {
    tick();
    totalWidth = addWidth(totalWidth, item.width);
    widths[item.id] = item.width;
  }
  return Object.freeze({
    widths: Object.freeze(widths),
    columnIds: Object.freeze(visible.map((item) => item.id)),
    flexColumnIds: Object.freeze(flexible.map((item) => item.id)),
    totalWidth,
    availableWidth: available,
    overflow: available === undefined ? 0 : Math.max(0, totalWidth - available),
    unusedWidth:
      available === undefined ? 0 : Math.max(0, available - totalWidth),
  });
}

/** Explicit proportional sizing, independent of manual widths and flex weights. */
export function fitColumnWidths(
  columns: readonly WidthColumn[],
  options: FitColumnWidthsOptions,
): FittedColumnWidths {
  if (!options || typeof options !== "object")
    throw new TypeError("Fit options must include availableWidth");
  dimension(options.availableWidth, "availableWidth");
  // Validate original metadata/overrides before deriving any allocation inputs.
  const initial = resolveColumnWidths(columns, {
    columnWidths: options.columnWidths,
    maxColumns: options.maxColumns,
    maxWork: options.maxWork,
  });
  const excluded = new Set<string>();
  if (options.excludeColumnIds !== undefined) {
    const ids = options.excludeColumnIds;
    if (!Array.isArray(ids) || ids.length > MAX_COLUMNS)
      throw new TypeError(
        "Fit exclusions must be a bounded array of column IDs",
      );
    const known = new Set(columns.map((column) => column.id));
    for (let index = 0; index < ids.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(ids, String(index));
      if (
        !descriptor ||
        !("value" in descriptor) ||
        typeof descriptor.value !== "string" ||
        !known.has(descriptor.value) ||
        excluded.has(descriptor.value)
      )
        throw new TypeError(
          "Fit exclusions must be unique known column IDs without holes or accessors",
        );
      excluded.add(descriptor.value);
    }
  }
  const allocation = resolveColumnWidths(
    columns.map((column) => {
      const bounds = getColumnWidthConstraints(column);
      return {
        id: column.id,
        hidden: column.hidden,
        minWidth: bounds.minWidth,
        maxWidth: bounds.maxWidth,
        width:
          excluded.has(column.id) && !column.hidden
            ? initial.widths[column.id]
            : bounds.width,
        // A zero configured ratio remains zero; a zero minimum is explicit opt-in.
        flex:
          !excluded.has(column.id) && bounds.width > 0
            ? bounds.width
            : undefined,
      };
    }),
    {
      availableWidth: options.availableWidth,
      leadingWidth: options.leadingWidth,
      maxColumns: options.maxColumns,
      maxWork: options.maxWork,
    },
  );
  return Object.freeze({
    widths: allocation.widths,
    columnIds: allocation.columnIds,
    fittedColumnIds: Object.freeze(
      initial.columnIds.filter((id) => !excluded.has(id)),
    ),
    excludedColumnIds: Object.freeze(
      initial.columnIds.filter((id) => excluded.has(id)),
    ),
    totalWidth: allocation.totalWidth,
    availableWidth: options.availableWidth,
    overflow: allocation.overflow,
    unusedWidth: allocation.unusedWidth,
  });
}
