// @vitest-environment jsdom
import { useRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "@opengrid/core";
import { GridContextMenu } from "./context-menu.js";
import type {
  GridContextMenuContext,
  GridContextMenuItem,
} from "./context-menu-items.js";
import { GridLocaleProvider, enUS, esES, gridMessage } from "./locale.js";
import { DataGrid } from "./data-grid.js";

type Row = { id: string; name: string };
function create() {
  return createGrid<Row>({
    rows: [
      { id: "a", name: "Grace" },
      { id: "b", name: "Ada" },
    ],
    columns: [{ id: "name", field: "name", header: "Name", editable: true }],
    getRowId: (row) => row.id,
  });
}
const model = create();
const context: GridContextMenuContext<Row> = Object.freeze({
  model,
  position: Object.freeze({ rowId: "a", columnId: "name" }),
  row: model.getRows()[0],
  column: model.getColumns()[0],
  value: "Grace",
});
const point = Object.freeze({ x: 20, y: 30 });
const leaf = (
  id: string,
  label: string,
  action = vi.fn(),
): GridContextMenuItem<Row> => ({ kind: "action", id, label, action });
const tree = (): GridContextMenuItem<Row>[] => [
  {
    kind: "submenu",
    id: "actions",
    label: "Actions",
    items: [
      leaf("alpha", "Alpha"),
      { kind: "separator", id: "separator" },
      {
        ...leaf("disabled", "Disabled"),
        disabled: true,
      } as GridContextMenuItem<Row>,
      leaf("charlie", "Charlie"),
      {
        kind: "submenu",
        id: "advanced",
        label: "Advanced",
        items: [leaf("deep", "Deep action")],
      },
    ],
  },
  leaf("rootLast", "Root last"),
];
function Host({
  items,
  fresh = () => true,
  closed = () => {},
}: {
  items: readonly GridContextMenuItem<Row>[];
  fresh?: () => boolean;
  closed?: () => void;
}) {
  const [open, setOpen] = useState(false),
    button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={button} onClick={() => setOpen(true)}>
        Open commands
      </button>
      <button>Outside</button>
      {open && (
        <GridContextMenu
          items={items}
          context={context}
          point={point}
          returnFocus={button.current}
          isCurrent={fresh}
          onClose={() => {
            setOpen(false);
            closed();
          }}
        />
      )}
    </>
  );
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Open commands" }));
  await act(async () => {});
}
async function choose(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name }));
  });
}
const menu = (name: string) => screen.getByRole("menu", { name });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("nested command ownership and focus", () => {
  it("opens three levels, restores one parent per Escape/back arrow and closes the root to its invoker", async () => {
    render(<Host items={tree()} />);
    await open();
    const parent = screen.getByRole("menuitem", {
      name: "Actions",
    });
    expect(parent.getAttribute("aria-haspopup")).toBe("menu");
    expect(document.activeElement).toBe(parent);
    fireEvent.keyDown(parent, { key: "ArrowRight" });
    await act(async () => {});
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Alpha" }),
    );
    expect(parent.getAttribute("aria-controls")).toBe(menu("Actions").id);
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    await choose("Advanced");
    expect(screen.getAllByRole("menu")).toHaveLength(3);
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Deep action" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await act(async () => {});
    expect(screen.getAllByRole("menu")).toHaveLength(2);
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Advanced" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    await act(async () => {});
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(document.activeElement).toBe(parent);
    fireEvent.keyDown(parent, { key: "Escape" });
    await act(async () => {});
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open commands" }),
    );
  });
  it("mirrors forward/back arrows in RTL without reversing vertical item order", async () => {
    render(
      <div dir="rtl">
        <Host items={tree()} />
      </div>,
    );
    await open();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    await act(async () => {});
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Alpha" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Charlie" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    await act(async () => {});
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Actions" }),
    );
  });
  it("limits arrows, Home/End and typeahead to the current level and skips disabled/separator entries", async () => {
    render(<Host items={tree()} />);
    await open();
    await choose("Actions");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Advanced" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Alpha" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "c" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Charlie" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Advanced" }),
    );
    expect(screen.getAllByRole("menu")).toHaveLength(2);
  });
  it("replaces sibling branches and ignores a late native close event from the removed panel", async () => {
    const items = tree();
    items.push({
      kind: "submenu",
      id: "other",
      label: "Other branch",
      items: [leaf("otherLeaf", "Other leaf")],
    });
    render(<Host items={items} />);
    await open();
    await choose("Actions");
    const old = menu("Actions").parentElement!;
    await choose("Other branch");
    const event = new Event("toggle");
    Object.defineProperty(event, "newState", { value: "closed" });
    fireEvent(old, event);
    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();
    expect(menu("Other branch")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Other leaf" }),
    );
  });
  it("retains the failed child path and focuses an enabled retry before closing on success", async () => {
    const run = vi
        .fn()
        .mockRejectedValueOnce(new Error("Retry the nested command"))
        .mockResolvedValue(undefined),
      closed = vi.fn();
    render(
      <Host
        closed={closed}
        items={[
          {
            kind: "submenu",
            id: "actions",
            label: "Actions",
            items: [leaf("retry", "Retry action", run)],
          },
        ]}
      />,
    );
    await open();
    await choose("Actions");
    await choose("Retry action");
    expect(screen.getByRole("alert").textContent).toContain(
      "Retry the nested command",
    );
    expect(screen.getAllByRole("menu")).toHaveLength(2);
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Retry action" }),
    );
    expect(closed).not.toHaveBeenCalled();
    await choose("Retry action");
    expect(run).toHaveBeenCalledTimes(2);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("aborts the whole pending stack on Escape and fences late continuations", async () => {
    let signal!: AbortSignal, release!: () => void;
    const wrote = vi.fn();
    const items: GridContextMenuItem<Row>[] = [
      {
        kind: "submenu",
        id: "actions",
        label: "Actions",
        items: [
          {
            kind: "action",
            id: "deferred",
            label: "Deferred",
            action: async (_context, owned) => {
              signal = owned;
              await new Promise<void>((resolve) => {
                release = resolve;
              });
              if (!owned.aborted) wrote();
            },
          },
        ],
      },
    ];
    render(<Host items={items} />);
    await open();
    await choose("Actions");
    await choose("Deferred");
    expect(menu("Actions").getAttribute("aria-busy")).toBe("true");
    fireEvent.keyDown(menu("Actions"), { key: "Escape" });
    await act(async () => {});
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    await act(async () => release());
    expect(wrote).not.toHaveBeenCalled();
  });
  it("aborts pending work when native light dismissal closes its child panel", async () => {
    let signal!: AbortSignal, release!: () => void;
    render(
      <Host
        items={[
          {
            kind: "submenu",
            id: "actions",
            label: "Actions",
            items: [
              {
                kind: "action",
                id: "wait",
                label: "Wait",
                action: async (_context, owned) => {
                  signal = owned;
                  await new Promise<void>((resolve) => {
                    release = resolve;
                  });
                },
              },
            ],
          },
        ]}
      />,
    );
    await open();
    await choose("Actions");
    await choose("Wait");
    const event = new Event("toggle");
    Object.defineProperty(event, "newState", { value: "closed" });
    fireEvent(menu("Actions").parentElement!, event);
    await act(async () => {});
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    await act(async () => release());
  });
  it("preserves connected intentional outside focus and removes every fallback panel", async () => {
    render(<Host items={tree()} />);
    await open();
    await choose("Actions");
    expect(document.querySelectorAll("[popover]")).toHaveLength(0);
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    fireEvent.pointerDown(outside);
    await act(async () => {});
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(outside);
  });
  it("keeps the same focused translated child and reads its current RTL direction", async () => {
    const items: GridContextMenuItem<Row>[] = [
      {
        kind: "submenu",
        id: "columns",
        label: gridMessage("grid.columns"),
        items: [
          {
            kind: "action",
            id: "undo",
            label: gridMessage("grid.undo"),
            action: vi.fn(),
          },
        ],
      },
    ];
    const tree = (spanish = false) => (
      <GridLocaleProvider locale={spanish ? esES : enUS}>
        <div dir={spanish ? "rtl" : "ltr"}>
          <Host items={items} />
        </div>
      </GridLocaleProvider>
    );
    const view = render(tree());
    await open();
    await choose("Columns");
    const child = screen.getByRole("menuitem", { name: "Undo" });
    view.rerender(tree(true));
    expect(screen.getByRole("menuitem", { name: "Deshacer" })).toBe(child);
    expect(document.activeElement).toBe(child);
    expect(screen.getAllByRole("menu")).toHaveLength(2);
    fireEvent.keyDown(child, { key: "ArrowRight" });
    await act(async () => {});
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Columnas" }),
    );
  });
  it("checks authoritative source freshness before a nested leaf callback", async () => {
    const run = vi.fn(),
      items: GridContextMenuItem<Row>[] = [
        {
          kind: "submenu",
          id: "actions",
          label: "Actions",
          items: [leaf("run", "Run", run)],
        },
      ];
    const view = render(<Host items={items} fresh={() => true} />);
    await open();
    await choose("Actions");
    view.rerender(<Host items={items} fresh={() => false} />);
    await choose("Run");
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("executes actual grid editing and undo through nested default row commands", async () => {
    const source = create();
    render(
      <DataGrid
        model={source}
        contextMenu={{
          getItems: (_context, defaults) => [
            {
              kind: "submenu",
              id: "actions",
              label: "Actions",
              items: defaults,
            },
          ],
        }}
      />,
    );
    const cell = () =>
      document.querySelector<HTMLElement>(
        '[data-row-id="a"][data-column-id="name"][role="gridcell"]',
      )!;
    fireEvent.contextMenu(cell());
    await choose("Actions");
    await choose("Edit cell");
    const editor = screen.getByRole("textbox", { name: "Edit Name row a" });
    fireEvent.change(editor, { target: { value: "Changed" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(source.getRow("a")!.name).toBe("Changed");
    fireEvent.contextMenu(cell());
    await choose("Actions");
    await choose("Undo");
    expect(source.getRow("a")!.name).toBe("Grace");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(cell());
  });
  it("sorts actual model rows through nested default header commands", async () => {
    const source = create();
    render(
      <DataGrid
        model={source}
        columnMenu={{
          getItems: (_context, defaults) => [
            {
              kind: "submenu",
              id: "headerActions",
              label: "Header actions",
              items: defaults,
            },
          ],
        }}
      />,
    );
    const anchor = screen.getByRole("button", { name: "Column menu for Name" });
    fireEvent.click(anchor);
    await choose("Header actions");
    await choose("Sort ascending");
    expect(source.getPageRows().map((node) => node.id)).toEqual(["b", "a"]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });
  it("reveals keyboard targets by scrolling only the owned popup", async () => {
    render(<Host items={tree()} />);
    await open();
    const popup = menu("Commands for Name, row a").parentElement!,
      target = screen.getByRole("menuitem", { name: "Root last" });
    Object.defineProperty(popup, "clientHeight", {
      configurable: true,
      value: 100,
    });
    vi.spyOn(popup, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 10, 200, 100),
    );
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 200, 100, 20),
    );
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(popup.scrollTop).toBe(110);
    expect(document.activeElement).toBe(target);
    expect(document.documentElement.scrollTop).toBe(0);
    fireEvent.scroll(popup);
    expect(screen.getByRole("menu")).toBeTruthy();
  });
  it("ignores stationary pointer entry after keyboard scrolling but re-enables hover after actual movement", async () => {
    render(<Host items={tree()} />);
    await open();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    const target = screen.getByRole("menuitem", { name: "Root last" });
    const parent = screen.getByRole("menuitem", { name: "Actions" });
    const over = new Event("pointerover", { bubbles: true });
    Object.defineProperty(over, "pointerType", { value: "mouse" });
    fireEvent(parent, over);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(document.activeElement).toBe(target);
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    const movement = new Event("pointermove", { bubbles: true });
    for (const [key, value] of Object.entries({
      pointerType: "mouse",
      clientX: 80,
      clientY: 90,
    }))
      Object.defineProperty(movement, key, { value });
    fireEvent(parent, movement);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(menu("Actions")).toBeTruthy();
    expect(document.activeElement).toBe(parent);
  });
  it("restores the invocation point when ancestor scrolling dismisses a keyboard-owned child", async () => {
    const view = render(
      <div data-testid="scroll-owner">
        <Host items={tree()} />
      </div>,
    );
    await open();
    await choose("Actions");
    const ancestor = view.getByTestId("scroll-owner");
    ancestor.scrollTop = 1;
    fireEvent.scroll(ancestor);
    await act(async () => {});
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open commands" }),
    );
  });
});
