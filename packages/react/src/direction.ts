export type GridDirection = "ltr" | "rtl";
export type DirectionPin = "left" | "right" | null;
/** Numeric endpoint conventions, not ambiguous browser-specific default/reverse names. */
export type RtlScrollModel =
  "negative" | "positive-from-start" | "positive-from-end";
export interface DirectionPinnedColumn {
  readonly pinned?: DirectionPin;
  readonly hidden?: boolean;
}
export interface PhysicalInterval {
  readonly left: number;
  readonly right: number;
  readonly width: number;
}
export interface DirectionLayoutOptions {
  readonly direction?: GridDirection;
  readonly viewportWidth: number;
  /** Includes the leading controls and all physical pin/center columns. */
  readonly contentWidth: number;
  readonly scrollOffset: number;
  readonly leadingWidth?: number;
  /** Physical pinned widths exclude the leading controls. */
  readonly leftPinnedWidth?: number;
  readonly rightPinnedWidth?: number;
}
export interface DirectionLayout {
  readonly direction: GridDirection;
  readonly viewportWidth: number;
  readonly contentWidth: number;
  readonly scrollOffset: number;
  readonly maxScroll: number;
  readonly startSide: "left" | "right";
  readonly endSide: "left" | "right";
  readonly startOcclusion: number;
  readonly endOcclusion: number;
  /** Half-open unobscured center interval in positive inline content coordinates. */
  readonly centerStart: number;
  readonly centerEnd: number;
  readonly centerWidth: number;
  toPhysicalInterval(inlineStart: number, width: number): PhysicalInterval;
  /** viewportX is a physical x-coordinate relative to the viewport's inner left edge. */
  toInlinePoint(viewportX: number): number;
  /** Offset is measured inward from the named physical edge, not the inline start. */
  pinnedInterval(
    pin: Exclude<DirectionPin, null>,
    physicalOffset: number,
    width: number,
  ): PhysicalInterval;
  /** Reveal an unpinned interval; oversized cells align their inline leading edge. */
  scrollToReveal(inlineStart: number, width: number): number;
}

const MAX_DIMENSION = Number.MAX_SAFE_INTEGER;
const MAX_COLUMNS = 100_000;
export function assertGridDirection(
  value: unknown,
): asserts value is GridDirection {
  if (value !== "ltr" && value !== "rtl")
    throw new TypeError("Grid direction must be ltr or rtl");
}
function signed(value: number, name: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_DIMENSION)
    throw new RangeError(
      name + " must be finite and within the safe numeric dimension range",
    );
}
function size(value: number, name: string): void {
  signed(value, name);
  if (value < 0) throw new RangeError(name + " must be nonnegative");
}
function sum(values: readonly number[], name: string): number {
  const total = values.reduce((result, value) => result + value, 0);
  size(total, name);
  return total;
}
function clamped(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value)) || 0;
}
function scrollModel(value: RtlScrollModel): void {
  if (
    value !== "negative" &&
    value !== "positive-from-start" &&
    value !== "positive-from-end"
  )
    throw new TypeError("Unknown RTL scroll model");
}

/**
 * Positive distance from inline start. The default modern RTL model starts at native
 * zero on the right and ends at -maximum on the left (CSSOM View). Explicit legacy
 * numeric conventions are supported; this pure module does not detect a browser.
 * Rubber-band overscroll is clamped, fractional pixels preserved, and -0 removed.
 * maximum should come from the actual element's scrollWidth - clientWidth.
 * Specification: https://www.w3.org/TR/cssom-view-1/#dom-element-scrollleft
 * Direction-aware grid layout specification: https://www.ag-grid.com/react-data-grid/rtl/
 */
export function normalizeScrollLeft(
  native: number,
  maximum: number,
  direction: GridDirection = "ltr",
  model: RtlScrollModel = "negative",
): number {
  assertGridDirection(direction);
  scrollModel(model);
  signed(native, "Native scrollLeft");
  size(maximum, "Maximum scroll");
  if (direction === "ltr") return clamped(native, maximum);
  return clamped(
    model === "negative"
      ? -native
      : model === "positive-from-start"
        ? native
        : maximum - native,
    maximum,
  );
}
export function denormalizeScrollLeft(
  inline: number,
  maximum: number,
  direction: GridDirection = "ltr",
  model: RtlScrollModel = "negative",
): number {
  assertGridDirection(direction);
  scrollModel(model);
  signed(inline, "Inline scroll");
  size(maximum, "Maximum scroll");
  const offset = clamped(inline, maximum);
  if (direction === "ltr") return offset;
  return (
    (model === "negative"
      ? -offset
      : model === "positive-from-start"
        ? offset
        : maximum - offset) || 0
  );
}

/** Stable pin-region partition; indices always refer to the original input array. */
export function getInlineColumnOrder(
  columns: readonly DirectionPinnedColumn[],
  direction: GridDirection = "ltr",
): readonly number[] {
  assertGridDirection(direction);
  if (!Array.isArray(columns) || columns.length > MAX_COLUMNS)
    throw new RangeError(
      "Direction column input exceeds the 100000 column limit",
    );
  const left: number[] = [],
    center: number[] = [],
    right: number[] = [];
  for (let index = 0; index < columns.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(columns, String(index));
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(
        "Direction columns cannot contain holes or accessors",
      );
    const column = descriptor.value as DirectionPinnedColumn;
    if (!column || typeof column !== "object")
      throw new TypeError("Direction columns must be objects");
    if (
      column.pinned !== undefined &&
      column.pinned !== null &&
      column.pinned !== "left" &&
      column.pinned !== "right"
    )
      throw new TypeError("Physical pin must be left, right or null");
    if (column.hidden !== undefined && typeof column.hidden !== "boolean")
      throw new TypeError("Column hidden must be boolean");
    if (column.hidden) continue;
    (column.pinned === "left"
      ? left
      : column.pinned === "right"
        ? right
        : center
    ).push(index);
  }
  return Object.freeze(
    direction === "ltr"
      ? left.concat(center, right)
      : right.concat(center, left),
  );
}
/** Physical right-positive deltas become inline-forward-positive deltas. */
export function physicalToInlineDelta(
  delta: number,
  direction: GridDirection = "ltr",
): number {
  assertGridDirection(direction);
  signed(delta, "Physical delta");
  return (direction === "rtl" ? -delta : delta) || 0;
}
export function inlineToPhysicalDelta(
  delta: number,
  direction: GridDirection = "ltr",
): number {
  assertGridDirection(direction);
  signed(delta, "Inline delta");
  return (direction === "rtl" ? -delta : delta) || 0;
}
export function getInlineArrowDelta(
  key: "ArrowLeft" | "ArrowRight",
  direction: GridDirection = "ltr",
): -1 | 1 {
  if (key !== "ArrowLeft" && key !== "ArrowRight")
    throw new TypeError("Horizontal arrow key required");
  return physicalToInlineDelta(key === "ArrowLeft" ? -1 : 1, direction) as
    -1 | 1;
}

/**
 * Viewport-local CSS-pixel geometry. No DOM/global direction or locale is consulted.
 * Pinned columns retain their physical edge while the controls occupy inline start.
 * A viewport fully covered by asymmetric pins has an empty center, never a fake pixel.
 */
export function createDirectionLayout(
  options: DirectionLayoutOptions,
): DirectionLayout {
  const {
    direction = "ltr",
    viewportWidth,
    contentWidth,
    scrollOffset: requested,
    leadingWidth = 0,
    leftPinnedWidth = 0,
    rightPinnedWidth = 0,
  } = options;
  assertGridDirection(direction);
  for (const [name, value] of Object.entries({
    viewportWidth,
    contentWidth,
    leadingWidth,
    leftPinnedWidth,
    rightPinnedWidth,
  }))
    size(value, name);
  signed(requested, "Inline scroll");
  const pinnedTotal = sum(
    [leadingWidth, leftPinnedWidth, rightPinnedWidth],
    "Pinned/control width",
  );
  if (
    pinnedTotal - contentWidth >
    Math.max(1, pinnedTotal, contentWidth) * Number.EPSILON * 8
  )
    throw new RangeError(
      "Content width must include all pinned columns and leading controls",
    );
  const startSide = direction === "ltr" ? "left" : "right",
    endSide = direction === "ltr" ? "right" : "left";
  const startOcclusion = sum(
      [leadingWidth, direction === "ltr" ? leftPinnedWidth : rightPinnedWidth],
      "Inline start occlusion",
    ),
    endOcclusion = direction === "ltr" ? rightPinnedWidth : leftPinnedWidth;
  const maxScroll = Math.max(0, contentWidth - viewportWidth),
    scrollOffset = clamped(requested, maxScroll);
  const localStart = Math.min(viewportWidth, startOcclusion),
    localEnd = Math.max(localStart, Math.max(0, viewportWidth - endOcclusion));
  const centerStart = scrollOffset + localStart,
    centerEnd = scrollOffset + localEnd,
    centerWidth = localEnd - localStart;
  function interval(start: number, width: number): number {
    size(start, "Inline start");
    size(width, "Interval width");
    return sum([start, width], "Inline interval end");
  }
  return Object.freeze({
    direction,
    viewportWidth,
    contentWidth,
    scrollOffset,
    maxScroll,
    startSide,
    endSide,
    startOcclusion,
    endOcclusion,
    centerStart,
    centerEnd,
    centerWidth,
    toPhysicalInterval(inlineStart: number, width: number) {
      const end = interval(inlineStart, width);
      const left =
        direction === "ltr"
          ? inlineStart - scrollOffset
          : viewportWidth + scrollOffset - end;
      const right =
        direction === "ltr"
          ? end - scrollOffset
          : viewportWidth + scrollOffset - inlineStart;
      return Object.freeze({ left: left || 0, right: right || 0, width });
    },
    toInlinePoint(viewportX: number) {
      signed(viewportX, "Viewport x");
      const point =
        scrollOffset +
        (direction === "ltr" ? viewportX : viewportWidth - viewportX);
      signed(point, "Inline point");
      return point || 0;
    },
    pinnedInterval(
      pin: Exclude<DirectionPin, null>,
      physicalOffset: number,
      width: number,
    ) {
      if (pin !== "left" && pin !== "right")
        throw new TypeError(
          "Pinned interval requires a physical left or right edge",
        );
      const end = interval(physicalOffset, width);
      return Object.freeze(
        pin === "left"
          ? { left: physicalOffset || 0, right: end || 0, width }
          : {
              left: viewportWidth - end || 0,
              right: viewportWidth - physicalOffset || 0,
              width,
            },
      );
    },
    scrollToReveal(inlineStart: number, width: number) {
      const end = interval(inlineStart, width);
      if (!centerWidth) return scrollOffset;
      if (width > centerWidth || inlineStart < centerStart)
        return clamped(inlineStart - startOcclusion, maxScroll);
      if (end > centerEnd)
        return clamped(end - viewportWidth + endOcclusion, maxScroll);
      return scrollOffset;
    },
  });
}
