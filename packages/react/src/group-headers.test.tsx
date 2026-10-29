// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  computeHeaderGroups,
  HeaderGroupRows,
  type GroupedWindowColumn,
} from "./group-headers";
import { getColumnWindow } from "./column-window";
afterEach(cleanup);
const column = (
  id: string,
  groupPath?: readonly string[],
  width = 100,
  pinned?: "left" | "right" | null,
): GroupedWindowColumn => ({ id, header: id, groupPath, width, pinned });
describe("grouped header metadata", () => {
  it("maps nested and ragged paths into full-width rows with blank groups", () => {
    const rows = computeHeaderGroups([
      column("a", ["Revenue", "Actual"]),
      column("b", ["Revenue", "Budget"], 120),
      column("c", ["Costs"]),
      column("d"),
    ]);
    expect(rows).toHaveLength(2);
    expect(
      rows[0].map((c) => [c.label, c.start, c.end, c.width, c.leafIds]),
    ).toEqual([
      ["Revenue", 0, 2, 220, ["a", "b"]],
      ["Costs", 2, 3, 100, ["c"]],
      ["", 3, 4, 100, ["d"]],
    ]);
    expect(rows[1].map((c) => [c.label, c.path])).toEqual([
      ["Actual", ["Revenue", "Actual"]],
      ["Budget", ["Revenue", "Budget"]],
      ["", ["Costs"]],
      ["", []],
    ]);
    expect(rows.flat().every((c) => c.pinned === null)).toBe(true);
  });
  it("splits repeated paths after reorder, merges after hidden intermediates are omitted", () => {
    const a = column("a", ["A"]),
      b = column("b", ["B"]),
      c = column("c", ["A"]);
    expect(
      computeHeaderGroups([a, b, c])[0].map((group) => group.label),
    ).toEqual(["A", "B", "A"]);
    const visible = computeHeaderGroups([a, c])[0];
    expect(visible).toHaveLength(1);
    expect(visible[0].leafIds).toEqual(["a", "c"]);
    expect(visible[0].width).toBe(200);
    expect(
      new Set(computeHeaderGroups([a, b, c])[0].map((group) => group.key)).size,
    ).toBe(3);
  });
  it("never spans pin regions and calculates independent left/right offsets", () => {
    const row = computeHeaderGroups([
      column("l1", ["A"], 40, "left"),
      column("l2", ["B"], 60, "left"),
      column("c", ["A"], 100),
      column("r1", ["A"], 80, "right"),
      column("r2", ["A"], 20, "right"),
      column("r3", ["B"], 50, "right"),
    ])[0];
    expect(
      row.map((group) => [
        group.pinned,
        group.start,
        group.end,
        group.width,
        group.leftOffset,
        group.rightOffset,
      ]),
    ).toEqual([
      ["left", 0, 1, 40, 0, undefined],
      ["left", 1, 2, 60, 40, undefined],
      [null, 2, 3, 100, undefined, undefined],
      ["right", 3, 5, 100, undefined, 50],
      ["right", 5, 6, 50, undefined, 0],
    ]);
  });
  it("supports zero/fractional widths, eight levels and copies paths", () => {
    const path = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rows = computeHeaderGroups([
      column("a", path, 0.5),
      column("b", path, 0),
    ]);
    path[0] = "changed";
    expect(rows).toHaveLength(8);
    expect(rows[0][0].path).toEqual(["a"]);
    expect(rows[7][0].width).toBe(0.5);
    expect(computeHeaderGroups([])).toEqual([]);
    expect(computeHeaderGroups([column("a")])).toEqual([]);
  });
  it("rejects malformed paths, identities, pin regions and unsafe widths", () => {
    for (const groupPath of [[""], ["  "], Array(9).fill("a"), ["a", 1], "a"])
      expect(() =>
        computeHeaderGroups([column("a", groupPath as string[])]),
      ).toThrow();
    expect(() => computeHeaderGroups([column("a"), column("a")])).toThrow();
    expect(() => computeHeaderGroups([column("")])).toThrow();
    for (const width of [-1, NaN, Infinity])
      expect(() => computeHeaderGroups([column("a", ["A"], width)])).toThrow();
    expect(() =>
      computeHeaderGroups([
        column("a", ["A"], Number.MAX_SAFE_INTEGER),
        column("b", ["A"], 1),
      ]),
    ).toThrow();
    expect(() =>
      computeHeaderGroups([column("a", ["A"], 10, "bad" as "left")]),
    ).toThrow();
  });
});
describe("grouped header React rows", () => {
  it("renders nested ARIA row/column indices and full leaf spans including a gutter", () => {
    render(
      <div role="grid" aria-colcount={4} aria-rowcount={4}>
        <HeaderGroupRows
          columns={[
            column("a", ["Revenue", "Actual"]),
            column("b", ["Revenue", "Budget"]),
            column("c"),
          ]}
          leadingWidth={44}
        />
      </div>,
    );
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("aria-rowindex")).toBe("1");
    expect(rows[1].getAttribute("aria-rowindex")).toBe("2");
    const revenue = within(rows[0]).getByRole("columnheader", {
      name: "Revenue",
    });
    expect(revenue.getAttribute("aria-colindex")).toBe("2");
    expect(revenue.getAttribute("aria-colspan")).toBe("2");
    expect(revenue.style.width).toBe("200px");
    expect(
      screen.getAllByRole("columnheader", { name: "Row controls" }),
    ).toHaveLength(2);
  });
  it("renders pinned groups with logical sticky offsets", () => {
    render(
      <div role="grid">
        <HeaderGroupRows
          leadingWidth={44}
          columns={[
            column("l1", ["Left one"], 50, "left"),
            column("l2", ["Left two"], 70, "left"),
            column("c", ["Center"]),
            column("r1", ["Right one"], 30, "right"),
            column("r2", ["Right two"], 60, "right"),
          ]}
        />
      </div>,
    );
    expect(
      screen.getByRole("columnheader", { name: "Left one" }).style.left,
    ).toBe("44px");
    expect(
      screen.getByRole("columnheader", { name: "Left two" }).style.left,
    ).toBe("94px");
    expect(
      screen.getByRole("columnheader", { name: "Right one" }).style.right,
    ).toBe("60px");
    expect(
      screen.getByRole("columnheader", { name: "Right two" }).style.right,
    ).toBe("0px");
  });
  it("keeps a 1,000-column virtual header bounded while preserving logical group spans", () => {
    const columns = Array.from({ length: 1000 }, (_, i) =>
      column(
        `c${i}`,
        [`Band ${Math.floor(i / 10)}`],
        100,
        i === 0 ? "left" : i === 999 ? "right" : null,
      ),
    );
    const entries = getColumnWindow(columns, {
      scrollLeft: 50000,
      viewportWidth: 544,
      leadingWidth: 44,
      overscan: 0,
    });
    render(
      <div role="grid" aria-colcount={1001}>
        <HeaderGroupRows
          columns={columns}
          entries={entries}
          leadingWidth={44}
        />
      </div>,
    );
    expect(screen.getAllByRole("columnheader").length).toBeLessThan(10);
    const visible = screen.getByRole("columnheader", { name: "Band 50" });
    expect(visible.getAttribute("aria-colindex")).toBe("502");
    expect(visible.getAttribute("aria-colspan")).toBe("10");
    expect(visible.style.width).toBe("1000px");
    expect(document.querySelectorAll(".og-group-spacer").length).toBe(2);
  });
  it("offers keyboard-operable toggles only when a callback is supplied", async () => {
    const onToggle = vi.fn(),
      columns = [column("a", ["A", "Child"]), column("b")];
    const view = render(
      <div role="grid">
        <HeaderGroupRows
          columns={columns}
          onToggle={onToggle}
          collapsedPaths={[["A"]]}
        />
      </div>,
    );
    const toggle = screen.getByRole("button", {
      name: "Expand column group A",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(onToggle).toHaveBeenCalledWith(["A"]);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    view.rerender(
      <div role="grid">
        <HeaderGroupRows columns={columns} />
      </div>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("rejects invalid viewport entries/dimensions and omits rows without any group path", () => {
    expect(() =>
      render(
        <HeaderGroupRows
          columns={[column("a", ["A"])]}
          entries={[{ kind: "column", index: 2 }]}
        />,
      ),
    ).toThrow();
    expect(() =>
      render(<HeaderGroupRows columns={[column("a", ["A"])]} rowHeight={0} />),
    ).toThrow();
    const { container } = render(<HeaderGroupRows columns={[column("a")]} />);
    expect(container.childElementCount).toBe(0);
  });
});
