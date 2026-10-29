import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createCalculatedGrid,
  isFormulaError,
  type CalculatedColumn,
  type CalculatedGrid,
  type Column,
  type GridState,
} from "@opengrid/core";
import { DataGrid } from "@opengrid/react";

interface Stock {
  id: string;
  item: string;
  price: number;
  quantity: number;
  active: boolean;
}
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const baseColumns: Column<Stock>[] = [
  { id: "item", field: "item", header: "Item", width: 190, pinned: "left" },
  {
    id: "price",
    field: "price",
    header: "Unit price",
    type: "number",
    width: 125,
    editable: true,
    valueFormatter: (value) => money.format(Number(value)),
    validate: (value) =>
      Number(value) >= 0 ? undefined : "Price must be nonnegative",
  },
  {
    id: "quantity",
    field: "quantity",
    header: "Quantity",
    type: "number",
    width: 115,
    editable: true,
    validate: (value) =>
      Number.isInteger(value) && Number(value) >= 0
        ? undefined
        : "Use a nonnegative whole quantity",
  },
  {
    id: "active",
    field: "active",
    header: "Active",
    type: "boolean",
    width: 95,
    editable: true,
  },
];
const initialRows: Stock[] = [
  { id: "stock1", item: "Notebook", price: 12, quantity: 8, active: true },
  { id: "stock2", item: "Pencil set", price: 2, quantity: 3, active: true },
  { id: "stock3", item: "Tote bag", price: 18, quantity: 12, active: false },
  { id: "stock4", item: "Desk lamp", price: 45, quantity: 2, active: true },
];
const initialDefinitions: CalculatedColumn<Stock>[] = [
  {
    id: "total",
    header: "Total value",
    type: "number",
    expression: "[price] * [quantity]",
    width: 150,
    aggregate: "sum",
    valueFormatter: (value) => money.format(Number(value)),
  },
  {
    id: "status",
    header: "Stock status",
    type: "text",
    expression: 'IF([quantity] < 5, "Low", "Ready")',
    width: 140,
  },
];
function make(
  rows: Stock[],
  definitions: readonly CalculatedColumn<Stock>[],
  state?: Partial<GridState>,
) {
  return createCalculatedGrid<Stock>({
    rows,
    columns: baseColumns,
    calculatedColumns: definitions,
    getRowId: (row) => row.id,
    initialState: state,
    valueCache: true,
    calculationCacheMaxEntries: 1000,
  });
}

export function CalculatedLab() {
  const [instance, setInstance] = useState<CalculatedGrid<Stock>>(() =>
    make(initialRows, initialDefinitions),
  );
  const state = useSyncExternalStore(
    instance.model.subscribe,
    instance.model.getState,
    instance.model.getState,
  );
  useEffect(() => () => instance.calculations.dispose(), [instance]);
  const definitions = instance.calculations.getDefinitions();
  const [selected, setSelected] = useState("total");
  const [id, setId] = useState("total"),
    [header, setHeader] = useState("Total value"),
    [type, setType] = useState<"number" | "text" | "boolean">("number"),
    [expression, setExpression] = useState("[price] * [quantity]");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  function choose(value: string) {
    setError("");
    setNotice("");
    setSelected(value);
    const definition = definitions.find((item) => item.id === value);
    if (definition) {
      setId(definition.id);
      setHeader(definition.header ?? definition.id);
      setType(definition.type);
      setExpression(definition.expression);
    } else {
      let suffix = definitions.length + 1;
      while (
        instance.model
          .getColumns()
          .some((column) => column.id === `calculated${suffix}`)
      )
        suffix++;
      setId(`calculated${suffix}`);
      setHeader("Calculated value");
      setType("number");
      setExpression("[total] * 0.1");
    }
  }
  function apply() {
    try {
      if (!id.trim() || !header.trim())
        throw new Error("Enter a column ID and label");
      const previous = definitions.find((item) => item.id === selected);
      const retained =
        previous?.type === type
          ? previous
          : previous
            ? Object.fromEntries(
                Object.entries(previous).filter(
                  ([key]) => key !== "valueFormatter" && key !== "aggregate",
                ),
              )
            : {};
      const candidate = {
        ...retained,
        id: id.trim(),
        header: header.trim(),
        type,
        expression,
        width: previous?.width ?? 150,
      } as CalculatedColumn<Stock>;
      const next = selected
        ? definitions.map((item) => (item.id === selected ? candidate : item))
        : [...definitions, candidate];
      const replacement = make(instance.model.getRows(), next, state);
      setInstance(replacement);
      setSelected(candidate.id);
      setId(candidate.id);
      setError("");
      setNotice(
        "Definition applied. Rows and compatible grid settings are retained; a new undo history starts.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to apply calculated column",
      );
      setNotice("");
    }
  }
  const diagnostics = instance.model.getRows().flatMap((row) =>
    definitions.flatMap((definition) => {
      const result = instance.calculations.getResult(row.id, definition.id);
      return isFormulaError(result)
        ? [
            `${row.item} / ${definition.header ?? definition.id}: ${result.code} — ${result.message}`,
          ]
        : [];
    }),
  );
  return (
    <div>
      <h2>Calculated columns</h2>
      <p>
        Edit raw price or quantity to recalculate. Derived values participate in
        sorting, filtering, grouping and CSV export. Expressions use same-row
        [column] references; they do not execute JavaScript.
      </p>
      <div
        role="group"
        aria-label="Calculated column editor"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "end",
          margin: "16px 0",
        }}
      >
        <label>
          Definition{" "}
          <select
            aria-label="Calculated column definition"
            value={selected}
            onChange={(event) => choose(event.target.value)}
          >
            {definitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.header ?? definition.id}
              </option>
            ))}
            <option value="">New column</option>
          </select>
        </label>
        <label>
          ID{" "}
          <input
            aria-label="Calculated column ID"
            value={id}
            readOnly={Boolean(selected)}
            onChange={(event) => setId(event.target.value)}
          />
        </label>
        <label>
          Label{" "}
          <input
            aria-label="Calculated column label"
            value={header}
            onChange={(event) => setHeader(event.target.value)}
          />
        </label>
        <label>
          Type{" "}
          <select
            aria-label="Calculated column type"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
          >
            <option value="number">Number</option>
            <option value="text">Text</option>
            <option value="boolean">Boolean</option>
          </select>
        </label>
        <label style={{ flex: "1 1 300px" }}>
          Expression{" "}
          <input
            style={{ width: "100%" }}
            aria-label="Calculated column expression"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
          />
        </label>
        <button type="button" onClick={apply}>
          Apply calculated definition
        </button>
      </div>
      <p>
        Applying a definition keeps current rows and compatible settings, and
        resets undo history. Positional cell references and ranges are
        unsupported in calculated columns.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        aria-pressed={state.groupBy.includes("status")}
        onClick={() =>
          instance.model.setState({
            groupBy: state.groupBy.includes("status") ? [] : ["status"],
          })
        }
      >
        Group by calculated status
      </button>
      <DataGrid
        model={instance.model}
        ariaLabel="Calculated inventory"
        height={280}
        pagination={false}
        notes={false}
      />
      {diagnostics.length > 0 && (
        <div role="status" aria-live="polite">
          <strong>{diagnostics.length} calculation errors</strong>
          <ul>
            {diagnostics.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        Current filters: {Object.keys(state.filters).length}. Dependencies:{" "}
        {definitions
          .map(
            (definition) =>
              `${definition.id} → ${instance.calculations.getDependencies(definition.id).join(", ") || "constant"}`,
          )
          .join("; ")}
        .
      </p>
    </div>
  );
}
