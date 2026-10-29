import { useGridLocale } from "./locale.js";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ColumnWindowEntry, WindowColumn } from "./column-window.js";

export interface GroupedWindowColumn extends WindowColumn {
  id: string;
  header?: string;
  groupPath?: readonly string[];
}
export interface HeaderGroupCell {
  key: string;
  label: string;
  path: string[];
  /** Zero-based group row depth; leaf headers are not included. */
  depth: number;
  start: number;
  /** Exclusive logical leaf-column index. */
  end: number;
  width: number;
  pinned: "left" | "right" | null;
  /** Excludes any leading row-selection gutter. */
  leftOffset?: number;
  rightOffset?: number;
  leafIds: string[];
}

/** Group each contiguous path prefix and pin region independently. No hidden columns should be supplied. */
export function computeHeaderGroups(
  columns: readonly GroupedWindowColumn[],
): HeaderGroupCell[][] {
  const ids = new Set<string>();
  let depthCount = 0;
  const offsets = [0],
    leftOffsets = [0],
    rightOffsets = [0];
  columns.forEach((column, index) => {
    if (typeof column.id !== "string" || !column.id || ids.has(column.id))
      throw new Error("Header columns require nonempty unique IDs");
    ids.add(column.id);
    if (!Number.isFinite(column.width) || column.width < 0)
      throw new RangeError(
        "Header column widths must be finite and nonnegative",
      );
    if (
      column.pinned != null &&
      column.pinned !== "left" &&
      column.pinned !== "right"
    )
      throw new Error("Invalid header column pin region");
    if (
      column.groupPath !== undefined &&
      (!Array.isArray(column.groupPath) ||
        column.groupPath.length > 8 ||
        column.groupPath.some(
          (part) => typeof part !== "string" || !part.trim(),
        ))
    )
      throw new Error("groupPath must contain at most eight nonblank strings");
    depthCount = Math.max(depthCount, column.groupPath?.length ?? 0);
    const total = offsets[index] + column.width;
    if (
      !Number.isFinite(total) ||
      total > Number.MAX_SAFE_INTEGER ||
      (column.width > 0 && total <= offsets[index])
    )
      throw new RangeError(
        "Header width exceeds the safe numeric dimension range",
      );
    offsets.push(total);
    leftOffsets.push(
      leftOffsets[index] + (column.pinned === "left" ? column.width : 0),
    );
    rightOffsets.push(
      rightOffsets[index] + (column.pinned === "right" ? column.width : 0),
    );
  });
  return Array.from({ length: depthCount }, (_, depth) => {
    const cells: HeaderGroupCell[] = [];
    columns.forEach((column, index) => {
      const path = column.groupPath?.slice(0, depth + 1) ?? [],
        label = column.groupPath?.[depth] ?? "",
        pinned = column.pinned ?? null;
      const previous = cells.at(-1);
      if (
        previous &&
        previous.pinned === pinned &&
        previous.label === label &&
        JSON.stringify(previous.path) === JSON.stringify(path)
      ) {
        previous.end = index + 1;
        previous.width = offsets[index + 1] - offsets[previous.start];
        previous.leafIds.push(column.id);
        if (pinned === "right")
          previous.rightOffset = rightOffsets.at(-1)! - rightOffsets[index + 1];
      } else
        cells.push({
          key: `group-${depth}-${index}-${JSON.stringify(path)}-${pinned ?? "center"}`,
          label,
          path: [...path],
          depth,
          start: index,
          end: index + 1,
          width: column.width,
          pinned,
          ...(pinned === "left" ? { leftOffset: leftOffsets[index] } : {}),
          ...(pinned === "right"
            ? { rightOffset: rightOffsets.at(-1)! - rightOffsets[index + 1] }
            : {}),
          leafIds: [column.id],
        });
    });
    return cells;
  });
}

export interface HeaderGroupRowsProps {
  columns: readonly GroupedWindowColumn[];
  /** Full logical-column window entries. Spacer widths are recomputed at group boundaries. */
  entries?: readonly ColumnWindowEntry[];
  leadingWidth?: number;
  rowHeight?: number;
  /** Called only by an explicit group toggle. The parent owns actual column visibility. */
  onToggle?: (path: string[]) => void;
  collapsedPaths?: readonly (readonly string[])[];
  ariaLabel?: string;
  className?: string;
}

/** Group rows for insertion before a grid's leaf-header and filter rows. */
export function HeaderGroupRows({
  columns,
  entries,
  leadingWidth = 0,
  rowHeight = 38,
  onToggle,
  collapsedPaths = [],
  ariaLabel,
  className = "",
}: HeaderGroupRowsProps) {
  const { t } = useGridLocale();
  const groups = computeHeaderGroups(columns);
  const root = useRef<HTMLDivElement>(null);
  const pendingToggleFocus = useRef<{
    button: HTMLButtonElement;
    path: string;
  } | null>(null);
  const [viewport, setViewport] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const container = root.current?.closest<HTMLElement>(
      '[role="grid"],[role="treegrid"]',
    );
    if (!container) return;
    const measure = () =>
      setViewport((current) =>
        current.left === container.scrollLeft &&
        current.width === container.clientWidth
          ? current
          : { left: container.scrollLeft, width: container.clientWidth },
      );
    measure();
    container.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : undefined;
    observer?.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      container.removeEventListener("scroll", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [groups.length > 0]);
  useLayoutEffect(() => {
    const pending = pendingToggleFocus.current;
    if (!pending) return;
    pendingToggleFocus.current = null;
    if (pending.button.isConnected) return;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      active.isConnected
    )
      return;
    const surviving = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-group-toggle-path]",
      ) ?? []),
    ].find((button) => button.dataset.groupTogglePath === pending.path);
    surviving?.focus({ preventScroll: true });
  });
  if (
    !Number.isFinite(leadingWidth) ||
    leadingWidth < 0 ||
    leadingWidth > Number.MAX_SAFE_INTEGER ||
    !Number.isFinite(rowHeight) ||
    rowHeight <= 0 ||
    rowHeight > Number.MAX_SAFE_INTEGER
  )
    throw new RangeError("Invalid group-header dimensions");
  const totalWidth = columns.reduce(
    (sum, column) => sum + column.width,
    leadingWidth,
  );
  if (!Number.isFinite(totalWidth) || totalWidth > Number.MAX_SAFE_INTEGER)
    throw new RangeError(
      "Group-header total width exceeds the safe dimension range",
    );
  let visible: Set<number> | undefined;
  if (entries) {
    visible = new Set();
    for (const entry of entries) {
      if (entry.kind === "column") {
        if (
          !Number.isInteger(entry.index) ||
          entry.index < 0 ||
          entry.index >= columns.length
        )
          throw new RangeError(
            "Column window index is outside the header schema",
          );
        visible.add(entry.index);
      } else if (!Number.isFinite(entry.width) || entry.width < 0)
        throw new RangeError("Invalid column spacer width");
    }
  }
  const collapsed = new Set(collapsedPaths.map((path) => JSON.stringify(path)));
  const leftPinned = columns
    .filter((column) => column.pinned === "left")
    .reduce((sum, column) => sum + column.width, 0);
  const rightPinned = columns
    .filter((column) => column.pinned === "right")
    .reduce((sum, column) => sum + column.width, 0);
  const offsets = [0];
  for (const column of columns) offsets.push(offsets.at(-1)! + column.width);
  const background = "var(--og-surface, #f4f7fa)",
    border = "var(--og-border, #ccd7e1)";
  function spacer(start: number, width: number) {
    return (
      <div
        key={`spacer-${start}`}
        role="presentation"
        aria-hidden="true"
        className="og-group-spacer"
        style={{
          width,
          minWidth: width,
          flexShrink: 0,
          borderBottom: `1px solid ${border}`,
        }}
      />
    );
  }
  function groupStyle(cell: HeaderGroupCell): CSSProperties {
    return {
      width: cell.width,
      minWidth: cell.width,
      maxWidth: cell.width,
      boxSizing: "border-box",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: `0 ${Math.min(10, cell.width / 2)}px`,
      overflow: "hidden",
      whiteSpace: "nowrap",
      fontWeight: 600,
      fontSize: 12,
      borderRight: `1px solid ${border}`,
      borderBottom: `1px solid ${border}`,
      background,
      color: "var(--og-text, #233246)",
      ...(cell.pinned === "left"
        ? {
            position: "sticky",
            left: leadingWidth + cell.leftOffset!,
            zIndex: 2,
          }
        : cell.pinned === "right"
          ? { position: "sticky", right: cell.rightOffset!, zIndex: 2 }
          : {}),
    };
  }
  if (!groups.length) return null;
  return (
    <div
      ref={root}
      role="rowgroup"
      aria-label={ariaLabel ?? t("headers.label")}
      className={`og-group-headers ${className}`}
    >
      {groups.map((row, depth) => {
        const cells: ReactNode[] = [];
        let gapWidth = 0,
          gapStart = 0;
        const flush = () => {
          if (gapWidth > 0) cells.push(spacer(gapStart, gapWidth));
          gapWidth = 0;
        };
        for (const cell of row) {
          const mounted =
            !visible ||
            cell.pinned !== null ||
            Array.from(visible).some(
              (index) => index >= cell.start && index < cell.end,
            );
          if (!mounted) {
            if (!gapWidth) gapStart = cell.start;
            gapWidth += cell.width;
            continue;
          }
          flush();
          const isCollapsed = collapsed.has(JSON.stringify(cell.path));
          const padding = Math.min(10, cell.width / 2);
          const contentOffset =
            cell.pinned !== null
              ? padding
              : Math.min(
                  Math.max(
                    padding,
                    cell.width - padding - (onToggle && cell.label ? 28 : 0),
                  ),
                  Math.max(
                    padding,
                    viewport.left + leftPinned - offsets[cell.start] + padding,
                  ),
                );
          const availableWidth =
            viewport.width > 0
              ? Math.max(
                  0,
                  viewport.width -
                    leadingWidth -
                    leftPinned -
                    rightPinned -
                    padding * 2,
                )
              : Infinity;
          const contentWidth = Math.max(
            0,
            Math.min(
              cell.width - contentOffset - padding,
              cell.pinned ? Infinity : availableWidth,
            ),
          );
          cells.push(
            <div
              key={cell.key}
              role="columnheader"
              aria-colindex={cell.start + 1 + (leadingWidth > 0 ? 1 : 0)}
              aria-colspan={cell.end - cell.start}
              className={`og-header-group${cell.pinned ? " og-pinned" : ""}`}
              data-group-path={JSON.stringify(cell.path)}
              data-group-depth={depth}
              style={groupStyle(cell)}
            >
              <div
                className="og-header-group-content"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  marginLeft: Math.max(0, contentOffset - padding),
                  maxWidth: contentWidth,
                }}
              >
                {onToggle && cell.label && (
                  <button
                    type="button"
                    aria-label={t(
                      isCollapsed ? "headers.expand" : "headers.collapse",
                      { path: cell.path.join(" / ") },
                    )}
                    aria-pressed={isCollapsed}
                    data-group-toggle-path={JSON.stringify(cell.path)}
                    onClick={(event) => {
                      if (document.activeElement === event.currentTarget)
                        pendingToggleFocus.current = {
                          button: event.currentTarget,
                          path: JSON.stringify(cell.path),
                        };
                      onToggle([...cell.path]);
                    }}
                    style={{
                      border: `1px solid ${border}`,
                      borderRadius: 3,
                      background: "var(--og-bg, #fff)",
                      color: "inherit",
                      cursor: "pointer",
                      width: 22,
                      height: 22,
                      flexShrink: 0,
                    }}
                  >
                    {isCollapsed ? "+" : "−"}
                  </button>
                )}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {cell.label}
                </span>
              </div>
            </div>,
          );
        }
        flush();
        return (
          <div
            key={depth}
            role="row"
            aria-rowindex={depth + 1}
            className="og-group-header-row"
            style={{
              display: "flex",
              height: rowHeight,
              width: Math.max(1, totalWidth),
              minWidth: "100%",
              background,
            }}
          >
            {leadingWidth > 0 && (
              <div
                role="columnheader"
                aria-colindex={1}
                aria-label={t("grid.rowControls")}
                className="og-group-gutter"
                style={{
                  width: leadingWidth,
                  minWidth: leadingWidth,
                  flexShrink: 0,
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  background,
                  borderBottom: `1px solid ${border}`,
                }}
              />
            )}
            {cells}
          </div>
        );
      })}
    </div>
  );
}
