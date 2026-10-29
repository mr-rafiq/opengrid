import { useEffect, useId, useRef, useState } from "react";
import type { Column, Filter, FilterExpression } from "@opengrid/core";
import { gridMessage, useGridLocale } from "./locale.js";
import type { GridMessage } from "./locale.js";

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
  error: GridMessage | string;
}
class BuilderMessageError extends Error {
  constructor(readonly notice: GridMessage) {
    super();
  }
}
const maximumDepth = 8;
const operatorKeys = {
  contains: "filter.contains",
  equals: "filter.equals",
  notEqual: "filter.notEqual",
  startsWith: "filter.startsWith",
  endsWith: "filter.endsWith",
  gt: "filter.gt",
  gte: "filter.gte",
  lt: "filter.lt",
  lte: "filter.lte",
  in: "filter.in",
  between: "filter.between",
  blank: "filter.blank",
  notBlank: "filter.notBlank",
} as const;
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
      throw new BuilderMessageError(
        gridMessage("builder.sourceDepthLimit", { maximumDepth }),
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
    throw new BuilderMessageError(gridMessage("builder.unsupported"));
  }
  try {
    return { draft: value ? read(value, 1) : null, error: "" };
  } catch (reason) {
    return {
      draft: null,
      error:
        reason instanceof BuilderMessageError
          ? reason.notice
          : reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : gridMessage("builder.readFailed"),
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
      throw new BuilderMessageError(gridMessage("builder.arraySyntax"));
    }
    if (!Array.isArray(parsed))
      throw new BuilderMessageError(gridMessage("builder.arrayRequired"));
    values = parsed;
    if (
      values.some(
        (value) =>
          value !== null &&
          !["string", "number", "boolean"].includes(typeof value),
      )
    )
      throw new BuilderMessageError(gridMessage("builder.scalarValues"));
  } else
    values = raw
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  if (!values.length)
    throw new BuilderMessageError(gridMessage("builder.emptySet"));
  if (
    bigint &&
    values.some(
      (value) => typeof value === "number" && !Number.isSafeInteger(value),
    )
  )
    throw new BuilderMessageError(gridMessage("builder.bigIntJson"));
  return values;
}

/** A keyboard-operable expression editor. Draft changes are committed only on Apply. */
export function AdvancedFilterBuilder<T>({
  columns,
  value,
  onApply,
  onClose,
}: AdvancedFilterBuilderProps<T>) {
  const { t, resolveMessage, locale } = useGridLocale();
  const operatorText = (op: string) =>
    Object.hasOwn(operatorKeys, op) ? t(operatorKeys[op as Filter["op"]]) : op;
  const [{ draft, error: sourceError }, setDraft] = useState<DraftState>(() =>
    readExpression(value),
  );
  const [applyError, setApplyError] = useState<GridMessage | string>("");
  const errorId = useId();
  const helpId = useId();
  const titleId = useId();
  const errorElement = useRef<HTMLDivElement>(null);
  const available = columns.filter((column) => column.filterable !== false);
  const notice = sourceError || applyError;
  const error =
    typeof notice !== "string" && notice.key === "builder.unavailableOperator"
      ? resolveMessage(
          gridMessage("builder.unavailableOperator", {
            operator: operatorText(notice.params.operator),
            column: notice.params.column,
          }),
        )
      : typeof notice !== "string" &&
          notice.key === "builder.notFilterable" &&
          !notice.params.column
        ? resolveMessage(
            gridMessage("builder.notFilterable", { column: t("common.none") }),
          )
        : resolveMessage(notice);
  useEffect(() => {
    setDraft(readExpression(value));
    setApplyError("");
  }, [value]);
  useEffect(() => {
    if (error) errorElement.current?.focus();
  }, [sourceError, applyError]);
  function change(next: Draft | null) {
    if (next && draftDepth(next) > maximumDepth) {
      setApplyError(gridMessage("builder.depthLimit", { maximumDepth }));
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
        throw new BuilderMessageError(gridMessage("builder.emptyGroup"));
      return { kind: current.kind, children: current.children.map(convert) };
    }
    const column = available.find((column) => column.id === current.columnId);
    if (!column)
      throw new BuilderMessageError(
        gridMessage("builder.notFilterable", { column: current.columnId }),
      );
    if (!operators(column).includes(current.op))
      throw new BuilderMessageError(
        gridMessage("builder.unavailableOperator", {
          operator: current.op,
          column: column.header ?? column.id,
        }),
      );
    const filter: Filter = { op: current.op };
    if (current.op === "blank" || current.op === "notBlank")
      return { kind: "condition", columnId: current.columnId, filter };
    if (current.op === "in")
      filter.value = parseSet(current.value, column.type === "bigint");
    else {
      if (column.type && column.type !== "text" && !current.value.trim())
        throw new BuilderMessageError(
          gridMessage("builder.valueRequired", {
            column: column.header ?? column.id,
          }),
        );
      filter.value = current.value;
      if (current.op === "between") {
        if (!current.to.trim())
          throw new BuilderMessageError(
            gridMessage("builder.upperRequired", {
              column: column.header ?? column.id,
            }),
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
        reason instanceof BuilderMessageError
          ? reason.notice
          : reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : gridMessage("builder.applyFailed"),
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
          aria-label={t("builder.addConditionLabel", { label })}
        >
          {t("builder.addCondition")}
        </button>
        {(["and", "or", "not"] as const).map((kind) => (
          <button
            type="button"
            key={kind}
            disabled={!canAdd(group(kind))}
            onClick={() => add(group(kind))}
            aria-label={t("builder.addGroupLabel", {
              kind: t(`builder.${kind}`),
              label,
            })}
          >
            {t("builder.addGroup", { kind: t(`builder.${kind}`) })}
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
          <legend>{t("builder.condition", { label })}</legend>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <label>
              {t("builder.column")}{" "}
              <select
                aria-label={t("builder.columnLabel", { label })}
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
                    {t("builder.unavailableColumn", {
                      column: current.columnId || t("common.none"),
                    })}
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
              {t("builder.operator")}{" "}
              <select
                aria-label={t("builder.operatorLabel", { label })}
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
                  <option value={current.op}>{operatorText(current.op)}</option>
                )}
                {list.map((op) => (
                  <option key={op} value={op}>
                    {operatorText(op)}
                  </option>
                ))}
              </select>
            </label>
            {current.op !== "blank" && current.op !== "notBlank" && (
              <>
                {current.op === "in" ? (
                  <label>
                    {t("builder.setValues")}{" "}
                    <textarea
                      aria-label={t("builder.setLabel", { label })}
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
                    {t("builder.value")}{" "}
                    <select
                      aria-label={t("builder.valueLabel", { label })}
                      aria-describedby={describedBy}
                      value={current.value}
                      onChange={(event) =>
                        replace(path, { ...current, value: event.target.value })
                      }
                    >
                      <option value="">{t("filter.chooseBoolean")}</option>
                      <option value="true">{t("common.true")}</option>
                      <option value="false">{t("common.false")}</option>
                    </select>
                  </label>
                ) : (
                  <label>
                    {t("builder.value")}{" "}
                    <input
                      aria-label={t("builder.valueLabel", { label })}
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
                        column?.type === "date"
                          ? t("builder.isoPlaceholder")
                          : undefined
                      }
                      onChange={(event) =>
                        replace(path, { ...current, value: event.target.value })
                      }
                    />
                  </label>
                )}
                {current.op === "between" && (
                  <label>
                    {t("builder.upper")}{" "}
                    <input
                      aria-label={t("builder.upperLabel", { label })}
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
              aria-label={t("builder.removeConditionLabel", { label })}
              onClick={() => replace(path, null)}
            >
              {t("common.remove")}
            </button>
          </div>
          {depth < maximumDepth && (
            <button
              type="button"
              aria-label={t("builder.negateLabel", { label })}
              onClick={() => replace(path, { kind: "not", child: current })}
            >
              {t("builder.negate")}
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
        <legend>{t("builder.group", { label })}</legend>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <label>
            {t("builder.match")}{" "}
            <select
              aria-label={t("builder.matchLabel", { label })}
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
              <option value="and">{t("builder.allConditions")}</option>
              <option value="or">{t("builder.anyCondition")}</option>
              <option value="not">{t("builder.negateLogic")}</option>
            </select>
          </label>
          <button
            type="button"
            aria-label={t("builder.removeGroupLabel", { label })}
            onClick={() => replace(path, null)}
          >
            {t("builder.removeGroup")}
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
      lang={locale}
      aria-labelledby={titleId}
      style={{
        padding: 16,
        color: "var(--og-text, #182733)",
        background: "var(--og-bg, white)",
      }}
    >
      <h3 id={titleId} style={{ marginTop: 0 }}>
        {t("builder.title")}
      </h3>
      <p id={helpId}>{t("builder.help")}</p>
      {!available.length && <p role="status">{t("builder.noColumns")}</p>}
      {draft ? (
        renderNode(draft, [], 1)
      ) : (
        <>
          <p>{t("builder.empty")}</p>
          {addButtons(null, [], t("builder.root"), 0)}
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
          {t("builder.clear")}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(readExpression(value));
            setApplyError("");
            onClose?.();
          }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={apply}
          aria-describedby={error ? errorId : undefined}
        >
          {t("builder.apply")}
        </button>
      </div>
    </section>
  );
}
