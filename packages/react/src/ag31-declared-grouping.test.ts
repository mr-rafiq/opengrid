import { expect, it } from "vitest";
import { createAg31ClientController } from "./ag31-client-controller.js";
import type { Ag31ColumnDefinition } from "./ag31-leaf-columns.js";

class Record {
  constructor(
    public id: string,
    public position: { Position: string },
  ) {}
  tag() {
    return "original";
  }
}
const declarations: {
  name: string;
  patch: Ag31ColumnDefinition<Record>;
  active: boolean;
}[] = [
  { name: "rowGroup", patch: { rowGroup: true }, active: true },
  { name: "initialRowGroup", patch: { initialRowGroup: true }, active: true },
  { name: "rowGroupIndex", patch: { rowGroupIndex: 0 }, active: true },
  {
    name: "initialRowGroupIndex",
    patch: { initialRowGroupIndex: 0 },
    active: true,
  },
  {
    name: "regular false overrides initial true",
    patch: { rowGroup: false, initialRowGroup: true },
    active: false,
  },
  {
    name: "regular null overrides initial true",
    patch: { rowGroup: null, initialRowGroup: true },
    active: false,
  },
  {
    name: "explicit index activates a false flag",
    patch: { rowGroup: false, rowGroupIndex: 0 },
    active: true,
  },
  {
    name: "regular true overrides initial false",
    patch: { rowGroup: true, initialRowGroup: false },
    active: true,
  },
  {
    name: "null index overrides initial index",
    patch: { rowGroupIndex: null, initialRowGroupIndex: 0 },
    active: false,
  },
];
for (const enable of [undefined, false, true])
  for (const declaration of declarations)
    it(`honors ${declaration.name} with UI grouping ${String(enable)}`, () => {
      const rows = Array.from(
        { length: 30 },
        (_, index) =>
          new Record(String(index), { Position: `G${Math.floor(index / 10)}` }),
      );
      const definition: Ag31ColumnDefinition<Record> = {
        field: "position.Position",
        hide: true,
        ...declaration.patch,
        ...(enable === undefined ? {} : { enableRowGroup: enable }),
      };
      const before = structuredClone(definition);
      const owner = createAg31ClientController({
        rows,
        getRowId: (row) => row.id,
        definitions: [definition, { field: "id" }],
      });
      expect(owner.model.getState().groupBy).toEqual(
        declaration.active ? ["position.Position"] : [],
      );
      expect(owner.api.getDisplayedRowCount()).toBe(
        declaration.active ? 3 : 30,
      );
      expect(owner.api.getRowNode("10")?.parent?.key).toBe(
        declaration.active ? "G1" : null,
      );
      expect(owner.api.getRowNode("10")?.data).toBe(rows[10]);
      expect(owner.api.getRowNode("10")?.data?.tag()).toBe("original");
      expect(definition).toEqual(before);
      owner.api.destroy();
    });
