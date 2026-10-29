export interface RowLayoutWindow {
  /** Inclusive first rendered row index. */
  start: number;
  /** Exclusive last rendered row index. */
  end: number;
  /** Pixel offset of start, including the empty-layout/count boundary. */
  offset: number;
  totalHeight: number;
}

export interface RowLayout {
  readonly count: number;
  readonly totalHeight: number;
  /** Accepts an integer from zero through count, inclusive. */
  offset(index: number): number;
  /** Accepts an integer row index from zero through count - 1. */
  height(index: number): number;
  /** Clamps finite pixels to an existing row; returns -1 for an empty layout. */
  indexAt(pixel: number): number;
  /** Row-count overscan around the intersecting viewport; scroll is clamped to the last viewport. */
  window(
    scrollTop: number,
    viewportHeight: number,
    overscan?: number,
  ): RowLayoutWindow;
}

const maximumDimension = Number.MAX_SAFE_INTEGER;

function assertFiniteDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > maximumDimension)
    throw new RangeError(
      `${name} must be finite and within the safe numeric dimension range`,
    );
}

/**
 * Immutable variable-height layout, with O(n) construction and O(log n) point/window lookup.
 * Caller heights are copied. Coordinates use JavaScript number arithmetic, not exact decimals.
 */
export function createRowLayout(heights: readonly number[]): RowLayout {
  const count = heights.length;
  const sizes = new Float64Array(count);
  const offsets = new Float64Array(count + 1);
  for (let index = 0; index < count; index++) {
    const height = heights[index];
    assertFiniteDimension(height, `Row ${index} height`);
    if (height <= 0)
      throw new RangeError(`Row ${index} height must be positive`);
    const next = offsets[index] + height;
    if (
      !Number.isFinite(next) ||
      next > maximumDimension ||
      next <= offsets[index]
    )
      throw new RangeError(
        `Row ${index} produces an unsafe or collapsed pixel interval`,
      );
    sizes[index] = height;
    offsets[index + 1] = next;
  }
  const totalHeight = offsets[count];

  function assertIndex(index: number, allowCount = false) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= count + (allowCount ? 1 : 0)
    )
      throw new RangeError(
        `Row index must be an integer between 0 and ${allowCount ? count : count - 1}`,
      );
  }

  // First prefix >= pixel. Prefixes are strictly increasing, including count's sentinel.
  function lowerBound(pixel: number): number {
    let low = 0,
      high = count + 1;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (offsets[middle] < pixel) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function rowAt(pixel: number): number {
    const boundary = lowerBound(pixel);
    return Math.max(
      0,
      Math.min(
        count - 1,
        offsets[boundary] === pixel ? boundary : boundary - 1,
      ),
    );
  }

  return Object.freeze({
    count,
    totalHeight,
    offset(index: number) {
      assertIndex(index, true);
      return offsets[index];
    },
    height(index: number) {
      assertIndex(index);
      return sizes[index];
    },
    indexAt(pixel: number) {
      assertFiniteDimension(pixel, "Pixel");
      if (!count) return -1;
      return rowAt(Math.max(0, Math.min(totalHeight, pixel)));
    },
    window(scrollTop: number, viewportHeight: number, overscan = 6) {
      assertFiniteDimension(scrollTop, "Scroll offset");
      assertFiniteDimension(viewportHeight, "Viewport height");
      if (viewportHeight < 0)
        throw new RangeError("Viewport height must be nonnegative");
      if (!Number.isSafeInteger(overscan) || overscan < 0)
        throw new RangeError(
          "Overscan must be a nonnegative safe integer row count",
        );
      if (!count) return { start: 0, end: 0, offset: 0, totalHeight: 0 };
      const scroll = Math.max(
        0,
        Math.min(Math.max(0, totalHeight - viewportHeight), scrollTop),
      );
      const startIndex = scroll === totalHeight ? count : rowAt(scroll);
      const endIndex =
        viewportHeight === 0
          ? startIndex
          : lowerBound(Math.min(totalHeight, scroll + viewportHeight));
      const start = Math.max(0, startIndex - overscan);
      const end = Math.min(count, endIndex + overscan);
      return { start, end, offset: offsets[start], totalHeight };
    },
  });
}
