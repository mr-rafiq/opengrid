import { describe, expect, it, vi } from "vitest";
import {
  prepareCommandMenuItems,
  COMMAND_MENU_LIMITS,
  type CommandMenuItem,
} from "./command-menu-items.js";
type Context = { owner: string };
const action = (id: string): CommandMenuItem<Context> => ({
  kind: "action",
  id,
  label: id,
  action: vi.fn(),
});
function chain(levels: number): CommandMenuItem<Context>[] {
  let items: CommandMenuItem<Context>[] = [action("leaf")];
  for (let index = 1; index < levels; index++)
    items = [
      {
        kind: "submenu",
        id: `branch${index}`,
        label: `Branch ${index}`,
        items,
      },
    ];
  return items;
}
describe("owned bounded command trees", () => {
  it("owns nested arrays, labels and flags without invoking or freezing borrowed callbacks", () => {
    const run = vi.fn(),
      params = { column: "Original" };
    const leaf = {
      kind: "action" as const,
      id: "constructor",
      label: { key: "columnMenu.title" as const, params },
      checked: "mixed" as const,
      action: run,
    };
    const children = [leaf],
      source: CommandMenuItem<Context>[] = [
        {
          kind: "submenu",
          id: "__proto__",
          label: "More",
          disabled: false,
          items: children,
        },
      ];
    const prepared = prepareCommandMenuItems(source);
    params.column = "Changed";
    leaf.id = "Changed";
    children.length = 0;
    source.length = 0;
    expect(Object.isFrozen(prepared)).toBe(true);
    const parent = prepared[0];
    expect(parent.kind).toBe("submenu");
    if (parent.kind !== "submenu") throw Error("Missing parent");
    expect(Object.isFrozen(parent)).toBe(true);
    expect(Object.isFrozen(parent.items)).toBe(true);
    expect(parent.id).toBe("__proto__");
    expect(parent.disabled).toBe(false);
    const child = parent.items[0];
    expect(child).toMatchObject({
      id: "constructor",
      checked: "mixed",
      label: { key: "columnMenu.title", params: { column: "Original" } },
    });
    expect(Object.isFrozen(child)).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(Object.isFrozen(run)).toBe(false);
  });
  it("accepts exactly four menu levels and rejects another level before any callback", () => {
    expect(prepareCommandMenuItems(chain(4))).toHaveLength(1);
    expect(COMMAND_MENU_LIMITS.maxDepth).toBe(4);
    expect(() => prepareCommandMenuItems(chain(5))).toThrow(/four menu levels/);
    expect(() => prepareCommandMenuItems(chain(1000))).toThrow(
      /four menu levels/,
    );
  });
  it("applies the total budget across branches rather than granting every level another 48 items", () => {
    const tree = (leaves: number): CommandMenuItem<Context>[] => [
      {
        kind: "submenu",
        id: "branch",
        label: "More",
        items: Array.from({ length: leaves }, (_, index) =>
          action(`leaf${index}`),
        ),
      },
    ];
    expect(prepareCommandMenuItems(tree(47))).toHaveLength(1);
    expect(() => prepareCommandMenuItems(tree(48))).toThrow(/48 total items/);
    const siblings: CommandMenuItem<Context>[] = [
      {
        kind: "submenu",
        id: "first",
        label: "First",
        items: Array.from({ length: 23 }, (_, index) => action(`a${index}`)),
      },
      {
        kind: "submenu",
        id: "second",
        label: "Second",
        items: Array.from({ length: 23 }, (_, index) => action(`b${index}`)),
      },
    ];
    expect(prepareCommandMenuItems(siblings)).toHaveLength(2);
    siblings.push(action("excess"));
    expect(() => prepareCommandMenuItems(siblings)).toThrow(/48 total items/);
  });
  it("rejects cyclic children and globally duplicated IDs, including branch/separator IDs", () => {
    const cyclic: CommandMenuItem<Context>[] = [];
    cyclic.push({
      kind: "submenu",
      id: "cycle",
      label: "Cycle",
      items: cyclic,
    });
    expect(() => prepareCommandMenuItems(cyclic)).toThrow(/cycles/);
    expect(() =>
      prepareCommandMenuItems([
        {
          kind: "submenu",
          id: "shared",
          label: "More",
          items: [{ kind: "separator", id: "shared" }, action("other")],
        },
      ]),
    ).toThrow(/unique/);
    expect(() =>
      prepareCommandMenuItems([
        {
          kind: "submenu",
          id: "branch",
          label: "More",
          items: [action("same")],
        },
        action("same"),
      ]),
    ).toThrow(/unique/);
  });
  it.each([{ items: [] }, { items: [{ kind: "separator", id: "separator" }] }])(
    "rejects a submenu without a non-separator choice: %j",
    ({ items }) => {
      expect(() =>
        prepareCommandMenuItems([
          {
            kind: "submenu",
            id: "empty",
            label: "Empty",
            items: items as CommandMenuItem<Context>[],
          },
        ]),
      ).toThrow(/non-separator/);
    },
  );
  it("keeps explicitly disabled children and branches as immutable policy metadata", () => {
    const prepared = prepareCommandMenuItems([
      {
        kind: "submenu",
        id: "branch",
        label: "Unavailable",
        disabled: true,
        items: [
          { ...action("leaf"), disabled: true } as CommandMenuItem<Context>,
        ],
      },
    ]);
    expect(prepared[0]).toMatchObject({
      disabled: true,
      items: [{ disabled: true }],
    });
  });
  it.each([
    {
      kind: "submenu",
      id: "branch",
      label: "Branch",
      items: [action("leaf")],
      checked: true,
    },
    {
      kind: "submenu",
      id: "branch",
      label: "Branch",
      items: [action("leaf")],
      shortcut: "X",
    },
    {
      kind: "submenu",
      id: "branch",
      label: "Branch",
      items: [action("leaf")],
      action: vi.fn(),
    },
    {
      kind: "submenu",
      id: "branch",
      label: "Branch",
      items: [action("leaf")],
      disabled: "yes",
    },
    { kind: "action", id: "leaf", label: "Leaf", action: vi.fn(), items: [] },
    { kind: "separator", id: "separator", items: [] },
  ])("rejects mixed metadata kinds without running a callback: %j", (item) => {
    expect(() => prepareCommandMenuItems([item as never])).toThrow();
  });
  it("rejects child accessors and sparse arrays without invoking their getters", () => {
    const getter = vi.fn(() => [action("leaf")]);
    const branch = { kind: "submenu", id: "branch", label: "Branch" };
    Object.defineProperty(branch, "items", { enumerable: true, get: getter });
    expect(() => prepareCommandMenuItems([branch as never])).toThrow(
      /accessors/,
    );
    const sparse = Array<CommandMenuItem<Context>>(1);
    expect(() =>
      prepareCommandMenuItems([
        { kind: "submenu", id: "branch", label: "Branch", items: sparse },
      ]),
    ).toThrow();
    const child = [action("leaf")];
    Object.defineProperty(child, "0", { get: getter });
    expect(() =>
      prepareCommandMenuItems([
        { kind: "submenu", id: "branch", label: "Branch", items: child },
      ]),
    ).toThrow(/accessors/);
    expect(getter).not.toHaveBeenCalled();
  });
});
