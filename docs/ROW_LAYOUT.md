# Variable-height row layout

`createRowLayout(heights)` is the shared prefix-sum geometry foundation for variable-height rows and master/detail blocks. It is independent of React rendering and takes a read-only array of positive numeric pixel heights. Construction copies the input into private arrays; mutating the caller's array afterward has no effect.

```ts
const layout = createRowLayout([38, 76, 240, 38]);
layout.totalHeight; // 392
layout.offset(2); // 114
layout.height(2); // 240
layout.indexAt(120); // 2
layout.window(100, 200, 1); // { start: 0, end: 4, offset: 0, totalHeight: 392 }
```

The immutable result exposes:

| Member                                            | Contract                                                                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count`                                           | Number of supplied rows                                                                                                                                                                                   |
| `totalHeight`                                     | Complete prefix-sum height; no browser pixel-limit truncation                                                                                                                                             |
| `offset(index)`                                   | Prefix offset before a row; integer `index` from 0 through `count` inclusive. `offset(count) === totalHeight`.                                                                                            |
| `height(index)`                                   | Original supplied height; integer row index from 0 through `count - 1`                                                                                                                                    |
| `indexAt(pixel)`                                  | Row containing a finite pixel. An exact row boundary belongs to the following row. Negative pixels clamp to the first row; pixels at/beyond total height clamp to the last. An empty layout returns `-1`. |
| `window(scrollTop, viewportHeight, overscan = 6)` | `{start, end, offset, totalHeight}`; start inclusive, end exclusive, offset equal to `offset(start)`. Overscan is a nonnegative integer row count, not pixels.                                            |

Window scrolling clamps to `0 … max(0, totalHeight - viewportHeight)`, so scrolling past the end yields the final legal viewport rather than an empty body. A row is included when its interval intersects the viewport; a row starting exactly at its bottom boundary is excluded. Overscan then adds rows before/after and clamps to the layout's row count. A viewport larger than the body includes all rows.

A zero-height viewport has an empty un-overscanned insertion window: `start === end` at the row containing the scroll position. At the total-height sentinel it uses `count`. Overscan can add neighbors around that insertion position. Empty layouts always return `{start:0,end:0,offset:0,totalHeight:0}` after validating arguments.

Fractional heights are accepted. Heights, pixel coordinates and viewport dimensions must be finite and within `±Number.MAX_SAFE_INTEGER`; heights must be positive and viewport heights nonnegative. Prefix sums must remain finite, at most `Number.MAX_SAFE_INTEGER`, and strictly increasing. A tiny height that disappears when added to a much larger prefix is rejected as a collapsed pixel interval. Invalid indices, fractional/negative overscan, unsafe dimensions and overflow throw `RangeError`.

Construction costs O(n) time and O(n) memory; `offset`/`height` are O(1), and `indexAt`/`window` use binary search in O(log n). Tests include a deterministic linear oracle, 100,000 rows, boundary/fractional/zero-viewport cases, input isolation and rejection paths. No wall-clock performance benchmark is claimed.

The complete numerically valid total is exposed. Browser engines have practical scroll-coordinate/CSS-size limits below the numeric range; segmented scrolling or other handling of those limits belongs to the rendering consumer. This helper does not silently reduce the dataset, measure DOM elements, observe asynchronous detail resizing, choose row identities or provide a master/detail renderer by itself. JavaScript floating-point arithmetic can introduce normal decimal-rounding error; this is not an exact-decimal geometry engine.
