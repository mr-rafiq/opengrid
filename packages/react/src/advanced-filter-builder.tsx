import { useEffect, useId, useRef, useState } from "react";
import type { Column, Filter, FilterExpression } from "@opengrid/core";

export interface AdvancedFilterBuilderProps<T> {
  columns: Column<T>[];
  value: FilterExpression | null;
  onApply: (expression: FilterExpression | null) => void;
  onClose?: () => void;
}
type Logic = "and" | "or" | "not";
type Draft =
  | {
      kind: "condition";
      columnId: string;
      op: Filter["op"];
      value: string;
      to: string;
    }
  | { kind: "and"; children: Draft[] }
  | { kind: "or"; children: Draft[] }
  | { kind: "not"; child: Draft };
interface DraftState {
  draft: Draft | null;
  error: string;
}
const maximumDepth = 8;
const operatorLabels: Record<Filter["op"], string> = {
  contains: "Contains",
  equals: "Equals",
  notEqual: "Does not equal",
  startsWith: "Starts with",
  endsWith: "Ends with",
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
  in: "Is one of",
  between: "Between",
  blank: "Is blank",
  notBlank: "Is not blank",
};
function operators<T>(column: Column<T> | undefined): Filter["op"][] {
  if (column?.type === "boolean")
    return ["equals", "notEqual", "in", "blank", "notBlank"];
  if (
    column?.type === "number" ||
    column?.type === "bigint" ||
    column?.type === "date"
  )
    return [
      "equals",
      "notEqual",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
      "in",
      "blank",
      "notBlank",
    ];
  return [
    "contains",
    "equals",
    "notEqual",
    "startsWith",
    "endsWith",
    "in",
    "blank",
    "notBlank",
  ];
}
const scalarText = (value: unknown) => (value == null ? "" : String(value));
const stringify = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
function readExpression(value: FilterExpression | null): DraftState {
  function read(expression: FilterExpression, depth: number): Draft {
    if (depth > maximumDepth)
      throw new Error(
        `This builder supports at most ${maximumDepth} levels. Clear the draft or replace the filter to continue.`,
      );
    if (expression.kind === "condition")
      return {
        kind: "condition",
        columnId: expression.columnId,
        op: expression.filter.op,
        value:
          expression.filter.op === "in"
            ? stringify(expression.filter.value ?? [])
            : scalarText(expression.filter.value),
        to: scalarText(expression.filter.to),
      };
    if (expression.kind === "not")
      return { kind: "not", child: read(expression.child, depth + 1) };
    if (expression.kind === "and" || expression.kind === "or")
      return {
        kind: expression.kind,
        children: expression.children.map((child) => read(child, depth + 1)),
      };
    throw new Error("Unsupported advanced filter expression");
  }
  try {
    return { draft: value ? read(value, 1) : null, error: "" };
  } catch (reason) {
    return {
      draft: null,
      error:
        reason instanceof Error ? reason.message : "Cannot read this filter",
    };
  }
}
function draftDepth(draft: Draft): number {
  if (draft.kind === "condition") return 1;
  if (draft.kind === "not") return 1 + draftDepth(draft.child);
  return 1 + Math.max(0, ...draft.children.map(draftDepth));
}
function parseSet(raw: string, bigint: boolean): unknown[] {
  let values: unknown[];
  if (raw.trim().startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        "Set values must be a valid JSON array or one value per line",
      );
    }
    if (!Array.isArray(parsed))
      throw new Error("Set values must be a JSON array");
    values = parsed;
    if (
      values.some(
        (value) =>
          value !== null &&
          !["string", "number", "boolean"].includes(typeof value),
      )
    )
      throw new Error(
        "Set values must contain only strings, numbers, booleans or null",
      );
  } else
    values = raw
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  if (!values.length) throw new Error("Enter at least one set value");
  if (
    bigint &&
    values.some(
      (value) => typeof value === "number" && !Number.isSafeInteger(value),
    )
  )
    throw new Error(
      "Use quoted strings for large BigInt values in JSON arrays",
    );
  return values;
}

/** A keyboard-operable expression editor. Draft changes are committed only on Apply. */
export function AdvancedFilterBuilder<T>({
  columns,
  value,
  onApply,
  onClose,
}: AdvancedFilterBuilderProps<T>) {
  const [{ draft, error: sourceError }, setDraft] = useState<DraftState>(() =>
    readExpression(value),
  );
  const [applyError, setApplyError] = useState("");
  const errorId = useId();
  const helpId = useId();
  const titleId = useId();
  const errorElement = useRef<HTMLDivElement>(null);
  const available = columns.filter((column) => column.filterable !== false);
  const error = sourceError || applyError;
  useEffect(() => {
    setDraft(readExpression(value));
    setApplyError("");
  }, [value]);
  useEffect(() => {
    if (error) errorElement.current?.focus();
  }, [error]);
  function change(next: Draft | null) {
    if (next && draftDepth(next) > maximumDepth) {
      setApplyError(`A filter can have at most ${maximumDepth} nested levels`);
      return;
    }
    setDraft({ draft: next, error: "" });
    setApplyError("");
  }
  function condition(): Draft {
    const column = available[0];
    return {
      kind: "condition",
      columnId: column?.id ?? "",
      op: operators(column)[0],
      value: "",
      to: "",
    };
  }
  function group(kind: Logic): Draft {
    return kind === "not"
      ? { kind, child: condition() }
      : { kind, children: [] };
  }
  function write(
    current: Draft,
    path: number[],
    replacement: Draft | null,
  ): Draft | null {
    if (!path.length) return replacement;
    const [index, ...tail] = path;
    if (current.kind === "condition") return current;
    if (current.kind === "not") {
      const child = write(current.child, tail, replacement);
      return child ? { ...current, child } : null;
    }
    const children = current.children
      .map((child, childIndex) =>
        childIndex === index ? write(child, tail, replacement) : child,
      )
      .filter((child): child is Draft => child !== null);
    return { ...current, children };
  }
  function replace(path: number[], replacement: Draft | null) {
    if (draft) change(write(draft, path, replacement));
  }
  function append(
    path: number[],
    parent: Exclude<Draft, { kind: "condition" }>,
    child: Draft,
  ) {
    replace(
      path,
      parent.kind === "not"
        ? {
            kind: "not",
            child: { kind: "and", children: [parent.child, child] },
          }
        : { ...parent, children: [...parent.children, child] },
    );
  }
  function convert(current: Draft): FilterExpression {
    if (current.kind === "not")
      return { kind: "not", child: convert(current.child) };
    if (current.kind === "and" || current.kind === "or") {
      if (!current.children.length)
        throw new Error("Each AND or OR group needs at least one condition");
      return { kind: current.kind, children: current.children.map(convert) };
    }
    const column = available.find((column) => column.id === current.columnId);
    if (!column)
      throw new Error(
        `Column ${current.columnId || "(none)"} is not filterable`,
      );
    if (!operators(column).includes(current.op))
      throw new Error(
        `${operatorLabels[current.op]} is not available for ${column.header ?? column.id}`,
      );
    const filter: Filter = { op: current.op };
    if (current.op === "blank" || current.op === "notBlank")
      return { kind: "condition", columnId: current.columnId, filter };
    if (current.op === "in")
      filter.value = parseSet(current.value, column.type === "bigint");
    else {
      if (column.type && column.type !== "text" && !current.value.trim())
        throw new Error(`Enter a value for ${column.header ?? column.id}`);
      filter.value = current.value;
      if (current.op === "between") {
        if (!current.to.trim())
          throw new Error(
            `Enter an upper value for ${column.header ?? column.id}`,
          );
        filter.to = current.to;
      }
    }
    return { kind: "condition", columnId: current.columnId, filter };
  }
  function apply() {
    if (sourceError) {
      errorElement.current?.focus();
      return;
    }
    try {
      onApply(draft ? convert(draft) : null);
    } catch (reason) {
      setApplyError(
        reason instanceof Error
          ? reason.message
          : "Unable to apply this filter",
      );
      return;
    }
    setApplyError("");
    onClose?.();
  }
  function addButtons(
    current: Exclude<Draft, { kind: "condition" }> | null,
    path: number[],
    label: string,
    depth: number,
  ) {
    const noColumns = !available.length;
    const add = (child: Draft) =>
      current ? append(path, current, child) : change(child);
    const canAdd = (child: Draft) => {
      if (noColumns) return false;
      if (!current || !draft) return draftDepth(child) <= maximumDepth;
      const replacement: Draft =
        current.kind === "not"
          ? {
              kind: "not",
              child: { kind: "and", children: [current.child, child] },
            }
          : { ...current, children: [...current.children, child] };
      const next = write(draft, path, replacement);
      return !next || draftDepth(next) <= maximumDepth;
    };
    return (
      <div
        className="og-filter-builder-add"
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBlock: 8 }}
      >
        <button
          type="button"
          disabled={!canAdd(condition())}
          onClick={() => add(condition())}
          aria-label={`Add condition ${label}`}
        >
          Add condition
        </button>
        {(["and", "or", "not"] as const).map((kind) => (
          <button
            type="button"
            key={kind}
            disabled={!canAdd(group(kind))}
            onClick={() => add(group(kind))}
            aria-label={`Add ${kind.toUpperCase()} group ${label}`}
          >
            Add {kind.toUpperCase()} group
          </button>
        ))}
      </div>
    );
  }
  function renderNode(
    current: Draft,
    path: number[],
    depth: number,
  ): React.ReactNode {
    const label = ["1", ...path.map((index) => String(index + 1))].join(".");
    const describedBy = error ? errorId : undefined;
    if (current.kind === "condition") {
      const column = available.find((column) => column.id === current.columnId);
      const list = operators(column);
      const unknownColumn = !column;
      return (
        <fieldset
          className="og-filter-builder-condition"
          style={{
            border: "1px solid var(--og-border, #dce4e9)",
            borderRadius: 6,
            padding: 12,
            marginBlock: 8,
          }}
          key={label}
        >
          <legend>Condition {label}</legend>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <label>
              Column{" "}
              <select
                aria-label={`Column ${label}`}
                aria-describedby={describedBy}
                value={current.columnId}
                onChange={(event) => {
                  const nextColumn = available.find(
                    (column) => column.id === event.target.value,
                  );
                  const nextOps = operators(nextColumn);
                  replace(path, {
                    ...current,
                    columnId: event.target.value,
                    op: nextOps.includes(current.op) ? current.op : nextOps[0],
                  });
                }}
              >
                {unknownColumn && (
                  <option value={current.columnId}>
                    Unavailable column: {current.columnId || "(none)"}
                  </option>
                )}
                {available.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.header ?? column.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator{" "}
              <select
                aria-label={`Operator ${label}`}
                aria-describedby={describedBy}
                value={current.op}
                onChange={(event) =>
                  replace(path, {
                    ...current,
                    op: event.target.value as Filter["op"],
                  })
                }
              >
                {!list.includes(current.op) && (
                  <option value={current.op}>
                    {operatorLabels[current.op]}
                  </option>
                )}
                {list.map((op) => (
                  <option key={op} value={op}>
                    {operatorLabels[op]}
                  </option>
                ))}
              </select>
            </label>
            {current.op !== "blank" && current.op !== "notBlank" && (
              <>
                {current.op === "in" ? (
                  <label>
                    Set values{" "}
                    <textarea
                      aria-label={`Set values ${label}`}
                      aria-describedby={`${helpId}${describedBy ? ` ${describedBy}` : ""}`}
                      value={current.value}
                      rows={3}
                      onChange={(event) =>
                        replace(path, { ...current, value: event.target.value })
                      }
                    />
                  </label>
                ) : column?.type === "boolean" ? (
                  <label>
                    Value{" "}
                    <select
                      aria-label={`Value ${label}`}
                      aria-describedby={describedBy}
                      value={current.value}
                      onChange={(event) =>
                        replace(path, { ...current, value: event.target.value })
                      }
                    >
                      <option value="">Choose a boolean</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </label>
                ) : (
                  <label>
                    Value{" "}
                    <input
                      aria-label={`Value ${label}`}
                      aria-describedby={describedBy}
                      value={current.value}
                      inputMode={
                        column?.type === "number"
                          ? "decimal"
                          : column?.type === "bigint"
                            ? "numeric"
                            : undefined
                      }
                      placeholder={
                        column?.type === "date" ? "YYYY-MM-DD" : undefined
                      }
                      onChange={(event) =>
                        replace(path, { ...current, value: event.target.value })
                      }
                    />
                  </label>
                )}
                {current.op === "between" && (
                  <label>
                    Upper value{" "}
                    <input
                      aria-label={`Upper value ${label}`}
                      aria-describedby={describedBy}
                      value={current.to}
                      inputMode={
                        column?.type === "number"
                          ? "decimal"
                          : column?.type === "bigint"
                            ? "numeric"
                            : undefined
                      }
                      onChange={(event) =>
                        replace(path, { ...current, to: event.target.value })
                      }
                    />
                  </label>
                )}
              </>
            )}
            <button
              type="button"
              aria-label={`Remove condition ${label}`}
              onClick={() => replace(path, null)}
            >
              Remove
            </button>
          </div>
          {depth < maximumDepth && (
            <button
              type="button"
              aria-label={`Wrap condition ${label} in NOT`}
              onClick={() => replace(path, { kind: "not", child: current })}
            >
              Negate condition
            </button>
          )}
        </fieldset>
      );
    }
    return (
      <fieldset
        className="og-filter-builder-group"
        style={{
          border: "1px solid var(--og-border, #dce4e9)",
          borderRadius: 8,
          padding: 12,
          marginBlock: 8,
        }}
        key={label}
      >
        <legend>Group {label}</legend>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <label>
            Match{" "}
            <select
              aria-label={`Match ${label}`}
              aria-describedby={describedBy}
              value={current.kind}
              onChange={(event) => {
                const kind = event.target.value as Logic;
                if (kind === "not") replace(path, { kind, child: current });
                else
                  replace(path, {
                    kind,
                    children:
                      current.kind === "not"
                        ? [current.child]
                        : current.children,
                  });
              }}
            >
              <option value="and">All conditions (AND)</option>
              <option value="or">Any condition (OR)</option>
              <option value="not">Negate (NOT)</option>
            </select>
          </label>
          <button
            type="button"
            aria-label={`Remove group ${label}`}
            onClick={() => replace(path, null)}
          >
            Remove group
          </button>
        </div>
        {current.kind === "not"
          ? renderNode(current.child, [...path, 0], depth + 1)
          : current.children.map((child, index) =>
              renderNode(child, [...path, index], depth + 1),
            )}
        {addButtons(current, path, label, depth)}
      </fieldset>
    );
  }
  return (
    <section
      className="og-filter-builder"
      aria-labelledby={titleId}
      style={{
        padding: 16,
        color: "var(--og-text, #182733)",
        background: "var(--og-bg, white)",
      }}
    >
      <h3 id={titleId} style={{ marginTop: 0 }}>
        Advanced filter
      </h3>
      <p id={helpId}>
        Build nested conditions with AND, OR and NOT. Sets accept a JSON array
        or one value per line. Quote large integers in JSON. Changes take effect
        when you apply.
      </p>
      {!available.length && <p role="status">No filterable columns</p>}
      {draft ? (
        renderNode(draft, [], 1)
      ) : (
        <>
          <p>No advanced filter</p>
          {addButtons(null, [], "root", 0)}
        </>
      )}
      {error && (
        <div ref={errorElement} id={errorId} role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div
        className="og-filter-builder-actions"
        style={{ display: "flex", gap: 8, marginTop: 12 }}
      >
        <button type="button" onClick={() => change(null)}>
          Clear draft
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(readExpression(value));
            setApplyError("");
            onClose?.();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          aria-describedby={error ? errorId : undefined}
        >
          Apply filter
        </button>
      </div>
    </section>
  );
}
