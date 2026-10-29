// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getColumnWindow, type WindowColumn } from "./column-window";
import {
  createColumnSpanPlan,
  getColumnSpanWindow,
  type SpanColumn,
} from "./column-spans";
import {
  computeHeaderGroups,
  HeaderGroupRows,
  type GroupedWindowColumn,
} from "./group-headers";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const windowColumns: WindowColumn[] = [
  { width: 40, pinned: "right" },
  ...Array.from({ length: 6 }, () => ({ width: 100 })),
  { width: 80, pinned: "left" },
];
const spanColumns: SpanColumn<{ id: string }>[] = [
  { id: "r0", width: 20, pinned: "right", colSpan: 2 },
  { id: "r1", width: 30, pinned: "right" },
  { id: "r2", width: 40, pinned: "right" },
  { id: "c0", width: 50, colSpan: 2 },
  { id: "c1", width: 60 },
  { id: "l0", width: 70, pinned: "left", colSpan: 2 },
  { id: "l1", width: 80, pinned: "left" },
  { id: "l2", width: 90, pinned: "left" },
];
const groupColumns: GroupedWindowColumn[] = [
  { id: "r0", width: 20, pinned: "right", groupPath: ["A"] },
  { id: "r1", width: 30, pinned: "right", groupPath: ["A"] },
  { id: "r2", width: 40, pinned: "right", groupPath: ["B"] },
  { id: "c0", width: 100, groupPath: ["Center"] },
  { id: "l0", width: 50, pinned: "left", groupPath: ["A"] },
  { id: "l1", width: 60, pinned: "left", groupPath: ["A"] },
  { id: "l2", width: 70, pinned: "left", groupPath: ["B"] },
];
describe("RTL inline column windows", () => {
  it("uses right pins plus the leading gutter as inline-start occlusion", () => {
    const entries = getColumnWindow(windowColumns, {
      direction: "rtl",
      scrollLeft: 0,
      viewportWidth: 340,
      leadingWidth: 20,
      overscan: 0,
    });
    expect(entries).toEqual([
      { kind: "column", index: 0 },
      { kind: "column", index: 1 },
      { kind: "column", index: 2 },
      { kind: "spacer", key: "gap-3", width: 400 },
      { kind: "column", index: 7 },
    ]);
    const shifted = getColumnWindow(windowColumns, {
      direction: "rtl",
      scrollLeft: 100,
      viewportWidth: 340,
      leadingWidth: 20,
      overscan: 0,
    });
    expect(
      shifted
        .filter((entry) => entry.kind === "column")
        .map((entry) => entry.index),
    ).toEqual([0, 2, 3, 7]);
    expect(
      shifted.reduce(
        (sum, entry) =>
          sum +
          (entry.kind === "spacer"
            ? entry.width
            : windowColumns[entry.index].width),
        0,
      ),
    ).toBe(720);
  });
  it("retains original indices and conservative gaps with offscreen focus and disabled windowing", () => {
    const retained = getColumnWindow(windowColumns, {
      direction: "rtl",
      scrollLeft: 0,
      viewportWidth: 340,
      leadingWidth: 20,
      overscan: 0,
      retainIndices: [6],
    });
    expect(retained).toEqual([
      { kind: "column", index: 0 },
      { kind: "column", index: 1 },
      { kind: "column", index: 2 },
      { kind: "spacer", key: "gap-3", width: 300 },
      { kind: "column", index: 6 },
      { kind: "column", index: 7 },
    ]);
    expect(
      getColumnWindow(windowColumns, {
        direction: "rtl",
        scrollLeft: 0,
        viewportWidth: 340,
        enabled: false,
      })
        .filter((entry) => entry.kind === "column")
        .map((entry) => entry.index),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it("keeps the default LTR contract and rejects invalid direction values", () => {
    const columns = [
      { width: 80, pinned: "left" as const },
      ...Array.from({ length: 6 }, () => ({ width: 100 })),
      { width: 40, pinned: "right" as const },
    ];
    const options = {
      scrollLeft: 100,
      viewportWidth: 340,
      leadingWidth: 20,
      overscan: 0,
    };
    expect(getColumnWindow(columns, options)).toEqual(
      getColumnWindow(columns, { ...options, direction: "ltr" }),
    );
    expect(() =>
      getColumnWindow([], { ...options, direction: "bad" as "rtl" }),
    ).toThrow();
  });
});
describe("RTL spanning and physical pin offsets", () => {
  it("anchors spans in supplied inline order and accounts for the entire merged physical width", () => {
    const plan = createColumnSpanPlan(
      spanColumns,
      { kind: "row", row: { id: "a" } },
      { direction: "rtl" },
    );
    expect(
      plan.cells.map((cell) => [
        cell.columnId,
        cell.sourceIndex,
        cell.start,
        cell.end,
        cell.width,
        cell.offset,
        cell.leftOffset,
        cell.rightOffset,
      ]),
    ).toEqual([
      ["r0", 0, 0, 2, 50, 0, undefined, 0],
      ["r2", 2, 2, 3, 40, 50, undefined, 50],
      ["c0", 3, 3, 5, 110, 90, undefined, undefined],
      ["l0", 5, 5, 7, 150, 200, 90, undefined],
      ["l2", 7, 7, 8, 90, 350, 0, undefined],
    ]);
    expect(plan.ownerIndices).toEqual([0, 0, 1, 2, 2, 3, 3, 4]);
    expect(plan.totalWidth).toBe(440);
  });
  it("preserves original source indices after hidden leaves are removed and enforces direction-specific pin order", () => {
    const plan = createColumnSpanPlan(
      spanColumns.map((column, index) => ({ ...column, hidden: index === 1 })),
      { kind: "row", row: { id: "a" } },
      { direction: "rtl" },
    );
    expect(plan.sourceIndices).toEqual([0, 2, 3, 4, 5, 6, 7]);
    expect(plan.cells[0]).toMatchObject({
      columnId: "r0",
      sourceIndex: 0,
      span: 2,
      width: 60,
      rightOffset: 0,
    });
    expect(plan.cells.find((cell) => cell.columnId === "l0")?.leftOffset).toBe(
      90,
    );
    expect(() =>
      createColumnSpanPlan(spanColumns, { kind: "row", row: { id: "a" } }),
    ).toThrow(/left, center, right/);
    expect(() =>
      createColumnSpanPlan(
        [...spanColumns].reverse(),
        { kind: "row", row: { id: "a" } },
        { direction: "rtl" },
      ),
    ).toThrow(/right, center, left/);
  });
  it("keeps a clipped merged owner mounted and conserves all widths in an RTL span window", () => {
    const plan = createColumnSpanPlan(
      [
        { id: "a", width: 100, colSpan: 3 },
        { id: "b", width: 100 },
        { id: "c", width: 100 },
        { id: "d", width: 100 },
      ],
      { kind: "row", row: {} },
      { direction: "rtl" },
    );
    const entries = getColumnSpanWindow(plan, {
      direction: "rtl",
      scrollLeft: 100,
      viewportWidth: 100,
      overscan: 0,
      retainIndices: [2],
    });
    expect(
      entries
        .filter((entry) => entry.kind === "cell")
        .map((entry) => entry.cell.columnId),
    ).toEqual(["a"]);
    expect(
      entries.reduce(
        (sum, entry) =>
          sum + (entry.kind === "cell" ? entry.cell.width : entry.width),
        0,
      ),
    ).toBe(400);
  });
});
describe("RTL grouped headers", () => {
  it("computes reversed-run physical offsets and keeps segment keys stable across direction flips", () => {
    const rtl = computeHeaderGroups(groupColumns, { direction: "rtl" })[0];
    expect(
      rtl.map((cell) => [
        cell.leafIds,
        cell.width,
        cell.leftOffset,
        cell.rightOffset,
      ]),
    ).toEqual([
      [["r0", "r1"], 50, undefined, 0],
      [["r2"], 40, undefined, 50],
      [["c0"], 100, undefined, undefined],
      [["l0", "l1"], 110, 70, undefined],
      [["l2"], 70, 0, undefined],
    ]);
    const ltrColumns = [
      ...groupColumns.filter((column) => column.pinned === "left"),
      ...groupColumns.filter((column) => !column.pinned),
      ...groupColumns.filter((column) => column.pinned === "right"),
    ];
    const ltr = computeHeaderGroups(ltrColumns)[0];
    for (const cell of rtl)
      expect(
        ltr.find((other) => other.leafIds[0] === cell.leafIds[0])?.key,
      ).toBe(cell.key);
  });
  it("places the selection gutter on physical right and adds it only to right-pinned groups", () => {
    render(
      <div role="grid">
        <HeaderGroupRows
          columns={groupColumns}
          direction="rtl"
          leadingWidth={44}
        />
      </div>,
    );
    const groups = [
      ...document.querySelectorAll<HTMLElement>(".og-header-group"),
    ];
    expect(groups[0].style.right).toBe("44px");
    expect(groups[1].style.right).toBe("94px");
    expect(groups[3].style.left).toBe("70px");
    expect(groups[4].style.left).toBe("0px");
    const gutter = document.querySelector<HTMLElement>(".og-group-gutter")!;
    expect(gutter.style.right).toBe("0px");
    expect(gutter.style.left).toBe("");
    expect(
      document.querySelector(".og-group-headers")?.getAttribute("dir"),
    ).toBe("rtl");
    expect(groups[0].getAttribute("aria-colindex")).toBe("2");
    expect(groups[0].getAttribute("aria-colspan")).toBe("2");
  });
  it("uses controlled positive inline scrolling for wide group content without mirroring indices", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    const columns = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      width: 100,
      groupPath: ["Wide"],
    }));
    render(
      <div role="grid">
        <HeaderGroupRows
          columns={columns}
          direction="rtl"
          scrollLeft={2000}
          onToggle={() => {}}
        />
      </div>,
    );
    const content = document.querySelector<HTMLElement>(
      ".og-header-group-content",
    )!;
    expect(content.style.marginRight).toBe("2000px");
    expect(content.style.marginLeft).toBe("");
    expect(
      document.querySelector(".og-header-group")?.getAttribute("aria-colindex"),
    ).toBe("1");
  });
  it("normalizes standalone modern negative RTL native scroll and clamps positive overscroll", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    const columns = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      width: 100,
      groupPath: ["Wide"],
    }));
    render(
      <div role="grid">
        <HeaderGroupRows
          columns={columns}
          direction="rtl"
          onToggle={() => {}}
        />
      </div>,
    );
    const grid = screen.getByRole("grid");
    grid.scrollLeft = -5000;
    fireEvent.scroll(grid);
    expect(
      document.querySelector<HTMLElement>(".og-header-group-content")?.style
        .marginRight,
    ).toBe("5000px");
    grid.scrollLeft = 30;
    fireEvent.scroll(grid);
    expect(
      document.querySelector<HTMLElement>(".og-header-group-content")?.style
        .marginRight,
    ).toBe("0px");
  });
  it("retains group toggle DOM identity and focus while pin regions move on a direction update", () => {
    const left: GroupedWindowColumn = {
        id: "left",
        width: 100,
        pinned: "left",
        groupPath: ["Left"],
      },
      right: GroupedWindowColumn = {
        id: "right",
        width: 100,
        pinned: "right",
        groupPath: ["Right"],
      };
    const onToggle = () => {};
    const view = render(
      <div role="grid">
        <HeaderGroupRows columns={[left, right]} onToggle={onToggle} />
      </div>,
    );
    const toggle = screen.getByRole("button", {
      name: "Collapse column group Right",
    });
    toggle.focus();
    view.rerender(
      <div role="grid">
        <HeaderGroupRows
          columns={[right, left]}
          direction="rtl"
          onToggle={onToggle}
        />
      </div>,
    );
    expect(
      screen.getByRole("button", { name: "Collapse column group Right" }),
    ).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
  });
});
