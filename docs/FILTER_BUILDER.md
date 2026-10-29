# Advanced filter builder

`AdvancedFilterBuilder<T>` is a React editor for the framework-neutral
`FilterExpression` tree. It accepts `columns`, `value`, `onApply` and optional
`onClose`. Render it outside the grid's scrolling viewport, in a host panel or
dialog that provides suitable dimensions and focus management.

The builder keeps a local draft. Typing, changing operators, adding groups and
removing conditions do not update the grid. **Apply filter** converts the draft
and calls `onApply`; a successful application then calls `onClose`. **Clear
draft** removes the local expression; applying that draft calls `onApply(null)`.
**Cancel** restores the latest controlled value and calls `onClose` without
applying. An external `value` change replaces the draft.

Conditions can be nested in AND, OR and unary NOT groups. AND/OR groups require
at least one child when applied. Adding another condition to a NOT group builds
an AND group inside the NOT, preserving its original child. Changing an AND/OR
group to NOT wraps the original group so no existing conditions are lost.
The UI permits at most eight levels, counting the root as level one. This is a
builder limit; the engine may support deeper imported expressions. An expression
that is too deep is reported without being silently truncated.

Only columns with `filterable !== false` are offered. Text columns expose text
matching, equality, set membership and blank checks. Number, BigInt and date
columns additionally expose comparisons and ranges. Boolean columns expose
equality, set membership and blank checks. Scalar and range operands stay as
strings, including large integers, so the core performs the typed conversion
and validation. Date operands accept the core's parseable date strings; the UI
suggests `YYYY-MM-DD` and does not apply browser timezone conversion.

For **Is one of**, use a JSON array of scalar values:

```json
["North", "South"]
```

Alternatively enter one value per line. Lines are trimmed and empty lines are
removed. Use a JSON array when an empty string or leading/trailing whitespace
is meaningful. Nested arrays and objects are rejected. JSON booleans, null and
numbers are retained for core validation; numbers outside the safe integer range
are rejected for BigInt columns. Quote large integers to preserve their digits:

```json
["900719925474099312345", "900719925474099312346"]
```

Each group and condition has unique path-based labels such as `Column 1.2` and
`Match 1.2`. All operations use native buttons and controls and can be reached
with a keyboard. Errors link back to the controls and are announced as alerts.
Exceptions thrown by `onApply`, including engine validation errors, are shown
without closing the builder or discarding the draft. Automated component tests
cover these interactions; assistive-technology verification remains separate.
