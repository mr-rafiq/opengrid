import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { DragEvent } from "react";
import type { GridModel } from "@opengrid/core";
import { GridIcon } from "./icons.js";
import { useGridLocale } from "./locale.js";

const owners = new WeakMap<object, string>();
let sequence = 0;
/** Shared by this model's headers and group panel; foreign grid drags are ignored. */
export function columnDragOwner(model: object): string {
  let owner = owners.get(model);
  if (!owner) {
    owner = `opengrid-columns-${++sequence}`;
    owners.set(model, owner);
  }
  return owner;
}
export const COLUMN_DRAG_OWNER = "application/x-opengrid-column-owner";
export interface RowGroupPanelProps<T> {
  model: GridModel<T>;
  className?: string;
  /** Distinguish several synchronized panels on one page. */
  ariaLabel?: string;
}
/** Optional resident row-group configuration with equivalent native controls for touch/keyboard. */
export function RowGroupPanel<T>({
  model,
  className = "",
  ariaLabel,
}: RowGroupPanelProps<T>) {
  const state = useSyncExternalStore(
    model.subscribe,
    model.getState,
    model.getState,
  );
  const { t } = useGridLocale();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [choice, setChoice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const columns = model.getColumns();
  const grouped = state.groupBy
    .map((key) => columns.find((column) => column.id === key))
    .filter((column) => column !== undefined);
  const available = columns.filter(
    (column) =>
      column.groupable !== false && !state.groupBy.includes(column.id),
  );
  const selected = available.some((column) => column.id === choice)
    ? choice
    : (available[0]?.id ?? "");
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const target = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        "[data-group-focus]",
      ) ?? []),
    ].find((button) => button.dataset.groupFocus === pendingFocus.current);
    const fallback = target?.disabled
      ? target
          .closest("li")
          ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      : target;
    (
      fallback ??
      root.current?.querySelector<HTMLButtonElement>(
        ".og-group-add:not(:disabled)",
      )
    )?.focus();
    pendingFocus.current = null;
  }, [state, model]);
  function update(ids: string[], focus: string) {
    pendingFocus.current = focus;
    model.setState({ groupBy: ids, expanded: [], page: 0 });
  }
  function move(columnId: string, index: number) {
    const next = state.groupBy.filter((key) => key !== columnId);
    next.splice(Math.max(0, Math.min(next.length, index)), 0, columnId);
    update(next, columnId);
  }
  function drop(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    if (
      event.dataTransfer.getData(COLUMN_DRAG_OWNER) !== columnDragOwner(model)
    )
      return;
    const key = event.dataTransfer.getData("text/opengrid-column");
    if (
      !columns.some((column) => column.id === key && column.groupable !== false)
    )
      return;
    move(key, index);
  }
  return (
    <div
      ref={root}
      className={`og-group-panel ${dragOver ? "og-group-panel-over" : ""} ${className}`}
      role="region"
      aria-label={ariaLabel ?? t("grouping.panel")}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(COLUMN_DRAG_OWNER)) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragOver(false);
      }}
      onDrop={(event) => drop(event, state.groupBy.length)}
    >
      <span className="og-group-panel-label" id={id}>
        {t("grouping.panel")}
      </span>
      {grouped.length ? (
        <ol className="og-group-chips" aria-labelledby={id}>
          {grouped.map((column, index) => {
            const name = column.header ?? column.id;
            const sort = state.sorting.find(
              (item) => item.columnId === column.id,
            );
            return (
              <li
                key={column.id}
                className="og-group-chip"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/opengrid-column", column.id);
                  event.dataTransfer.setData(
                    COLUMN_DRAG_OWNER,
                    columnDragOwner(model),
                  );
                }}
                onDrop={(event) => drop(event, index)}
              >
                <GridIcon name="grip" size={14} />
                <button
                  type="button"
                  data-group-focus={column.id}
                  aria-label={t("grouping.sort", { column: name })}
                  disabled={column.sortable === false}
                  aria-pressed={Boolean(sort)}
                  onClick={(event) =>
                    model.setSort(
                      column.id,
                      !sort ? "asc" : sort.direction === "asc" ? "desc" : null,
                      event.shiftKey,
                    )
                  }
                >
                  {name}
                  {sort && (
                    <GridIcon
                      name={sort.direction === "asc" ? "arrowUp" : "arrowDown"}
                      size={14}
                    />
                  )}
                </button>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={t("grouping.earlier", { column: name })}
                  onClick={() => move(column.id, index - 1)}
                >
                  <GridIcon name="chevronLeft" size={14} />
                </button>
                <button
                  type="button"
                  disabled={index === grouped.length - 1}
                  aria-label={t("grouping.later", { column: name })}
                  onClick={() => move(column.id, index + 1)}
                >
                  <GridIcon name="chevronRight" size={14} />
                </button>
                <button
                  type="button"
                  aria-label={t("grouping.remove", { column: name })}
                  onClick={() =>
                    update(
                      state.groupBy.filter((key) => key !== column.id),
                      grouped[Math.min(index + 1, grouped.length - 1)]?.id ===
                        column.id
                        ? (grouped[index - 1]?.id ?? "add")
                        : (grouped[index + 1]?.id ?? "add"),
                    )
                  }
                >
                  <GridIcon name="close" size={14} />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <span className="og-group-empty">{t("grouping.drop")}</span>
      )}
      <div className="og-group-add-controls">
        <select
          aria-label={t("grouping.choose")}
          value={selected}
          disabled={!available.length}
          onChange={(event) => setChoice(event.target.value)}
        >
          {!available.length && (
            <option value="">{t("grouping.allAdded")}</option>
          )}
          {available.map((column) => (
            <option value={column.id} key={column.id}>
              {column.header ?? column.id}
            </option>
          ))}
        </select>
        <button
          className="og-group-add"
          type="button"
          disabled={!selected}
          onClick={() => move(selected, state.groupBy.length)}
        >
          {t("grouping.add")}
        </button>
      </div>
    </div>
  );
}
