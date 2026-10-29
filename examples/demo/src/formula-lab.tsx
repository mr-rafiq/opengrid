import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FormulaEngine, type GridModel } from "@opengrid/core";
const sourceColumns = [
  "company",
  "symbol",
  "sector",
  "region",
  "price",
  "shares",
  "value",
  "change",
  "active",
  "trend",
];
export function FormulaLab<T>({
  model,
  getRowId,
}: {
  model: GridModel<T>;
  getRowId: (row: T) => string;
}) {
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const [expression, setExpression] = useState("=SUM(E1:E3)");
  const rowMap = useMemo(
    () => new Map(model.getRows().map((row) => [getRowId(row), row])),
    [model, state, getRowId],
  );
  const current = useRef(rowMap);
  current.current = rowMap;
  const engine = useMemo(
    () =>
      new FormulaEngine({
        rowIds: [...rowMap.keys()],
        columnIds: [...sourceColumns, "analysis"],
        getRawValue: (rowId, columnId) => {
          const row = current.current.get(rowId);
          return row ? model.getValue(row, columnId) : null;
        },
      }),
    [model],
  );
  const result = useMemo(() => {
    engine.invalidate();
    const first = model.getRows()[0];
    if (!first) return null;
    const rowId = getRowId(first);
    engine.setFormula({ rowId, columnId: "analysis" }, expression);
    return engine.evaluate({ rowId, columnId: "analysis" });
  }, [engine, expression, state, getRowId, model]);
  const display =
    result && typeof result === "object"
      ? `#${result.code}: ${result.message}`
      : typeof result === "number"
        ? result.toLocaleString("en-US", { maximumFractionDigits: 8 })
        : String(result ?? "");
  return (
    <section className="pivot-panel">
      <h2>Formula dependency lab</h2>
      <p>
        A-J map to the original sample columns; E is price and F is shares. K1
        is this result. References use source row order and follow data edits.
      </p>
      <label>
        Analysis formula{" "}
        <input
          aria-label="Analysis formula"
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          style={{
            width: "min(100%,500px)",
            padding: 8,
            margin: 8,
            font: "inherit",
          }}
        />
      </label>
      <output data-testid="formula-result" aria-live="polite">
        {display}
      </output>
      <p>
        Try =IF(E1&gt;0,SUM(E1:E3),1/0), =E1*F1, or =K1 for cycle detection.
        This lab uses explicit formulas; pasted text is never evaluated.
      </p>
    </section>
  );
}
