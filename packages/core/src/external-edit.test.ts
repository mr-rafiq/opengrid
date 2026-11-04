import { describe, expect, it, vi } from "vitest";
import {
  createGrid,
  createRowEditSession,
  createCellRangeModel,
  isCellEditable,
} from "./index";
import type { Column, GridEditRequest, GridModel, GridOptions } from "./types";
import { attachGridExtension } from "./grid-extension";

class Account {
  constructor(
    public id: string,
    public amount: number,
    public note = "original",
  ) {}
  label() {
    return `${this.id}: ${this.amount}`;
  }
}
function fixture(overrides: Partial<GridOptions<Account>> = {}) {
  const rows = [new Account("a", 2), new Account("b", 5)];
  const requests: GridEditRequest<Account>[] = [];
  const setter = vi.fn((value: unknown, row: Account) => {
    row.amount = Number(value);
    return row;
  });
  const columns: Column<Account>[] = [
    {
      id: "amount",
      field: "amount",
      editable: true,
      type: "number",
      valueSetter: setter,
    },
    {
      id: "virtual",
      editable: true,
      type: "number",
      valueGetter: (row) => row.amount * 2,
    },
    { id: "note", field: "note", editable: true },
    { id: "locked", field: "id" },
  ];
  const model = createGrid({
    rows,
    columns,
    getRowId: (row) => row.id,
    onEditRequest: (request) => {
      requests.push(request);
    },
    ...overrides,
  });
  return { model, rows, requests, setter };
}

describe("host-owned edit requests", () => {
  it("keeps class identity and borrowed values while freezing only request metadata", () => {
    const { model, rows, requests, setter } = fixture();
    const notify = vi.fn();
    model.subscribe(notify);
    const state = model.getState();
    expect(model.getWriteMode?.()).toBe("request");
    expect(model.editCell("a", "amount", "12")).toBeUndefined();
    expect(requests[0]).toEqual({
      id: 1,
      columnRevision: 0,
      edits: [
        {
          rowId: "a",
          columnId: "amount",
          value: 12,
          previousValue: 2,
          row: rows[0],
        },
      ],
    });
    expect(requests[0].edits[0].row).toBe(rows[0]);
    expect(rows[0]).toBeInstanceOf(Account);
    expect(rows[0].label()).toBe("a: 2");
    expect(Object.isFrozen(requests[0])).toBe(true);
    expect(Object.isFrozen(requests[0].edits)).toBe(true);
    expect(Object.isFrozen(requests[0].edits[0])).toBe(true);
    expect(Object.isFrozen(rows[0])).toBe(false);
    expect(model.getState()).toBe(state);
    expect(setter).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(model.undo()).toBe(false);
    expect(model.redo()).toBe(false);
  });

  it("allows fieldless/getter columns only in request mode", () => {
    const { model, rows, requests } = fixture();
    const virtual = model.getColumns().find((c) => c.id === "virtual")!;
    expect(isCellEditable(virtual, rows[0])).toBe(false);
    expect(isCellEditable(virtual, rows[0], { writeMode: "request" })).toBe(
      true,
    );
    expect(model.editCell("a", "virtual", "8")).toBeUndefined();
    expect(requests[0].edits[0]).toMatchObject({ value: 8, previousValue: 4 });
    expect(model.getValue(rows[0], "virtual")).toBe(4);
    const local = fixture({ onEditRequest: undefined });
    expect(local.model.getWriteMode?.()).toBe("local");
    expect(local.model.editCell("a", "virtual", 8)).toBe("Cell is read only");
  });

  it("preflights the whole batch before dispatch, with no partial request", () => {
    const { model, requests, rows } = fixture();
    expect(
      model.batchEdit([
        { rowId: "a", columnId: "amount", value: 10 },
        { rowId: "b", columnId: "amount", value: "invalid" },
      ]),
    ).toBe("Enter a finite number");
    expect(requests).toHaveLength(0);
    expect(rows.map((r) => r.amount)).toEqual([2, 5]);
    expect(model.editCell("missing", "amount", 1)).toBe(
      "Unknown row or column",
    );
    expect(model.editCell("a", "missing", 1)).toBe("Unknown row or column");
    expect(model.editCell("a", "locked", 1)).toBe("Cell is read only");
    expect(model.batchEdit([])).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it("lets the host synchronously acknowledge via a transaction, without cell undo", () => {
    let model: GridModel<Account>;
    const acknowledged = new Account("a", 30);
    ({ model } = fixture({
      onEditRequest: () => {
        model.applyTransaction({ update: [acknowledged] });
      },
    }));
    expect(model.editCell("a", "amount", 30)).toBeUndefined();
    expect(model.getRow("a")).toBe(acknowledged);
    expect(model.undo()).toBe(false);
  });

  it("leaves pending/failed network work entirely under the host's control", async () => {
    const { model, requests, rows } = fixture();
    expect(model.editCell("a", "amount", 20)).toBeUndefined();
    await Promise.resolve();
    expect(model.getRow("a")).toBe(rows[0]);
    expect(rows[0].amount).toBe(2);
    // A rejected request requires no rollback because no local mutation occurred.
    expect(model.editCell("a", "amount", 25)).toBeUndefined();
    expect(requests.map((r) => r.id)).toEqual([1, 2]);
    model.applyTransaction({
      update: [new Account("a", Number(requests[1].edits[0].value))],
    });
    expect(model.getRow("a")?.amount).toBe(25);
    expect(model.undo()).toBe(false);
  });

  it("honors read-only and dynamic policies before any host callback", () => {
    const { model, requests } = fixture();
    model.setReadOnly(true);
    expect(model.editCell("a", "amount", 4)).toBe("Grid is read only");
    model.setReadOnly(false);
    model.setColumns([
      { id: "amount", field: "amount", editable: (row) => row.id !== "a" },
    ]);
    expect(model.editCell("a", "amount", 4)).toBe("Cell is read only");
    expect(model.editCell("b", "amount", 4)).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0].columnRevision).toBe(1);
  });

  it.each(["columns", "rows", "state", "readOnly"] as const)(
    "rejects %s changes during preflight",
    (kind) => {
      const { model, requests } = fixture();
      model.setColumns([
        {
          id: "amount",
          field: "amount",
          editable: true,
          validate: () => {
            if (kind === "columns")
              model.setColumns([{ id: "other", field: "amount" }]);
            if (kind === "rows") model.setRows([new Account("a", 99)]);
            if (kind === "state") model.setQuickFilter("changed");
            if (kind === "readOnly") model.setReadOnly(true);
            return undefined;
          },
        },
      ]);
      expect(model.editCell("a", "amount", 4)).toMatch(
        /changed during editing|read only/,
      );
      expect(requests).toHaveLength(0);
    },
  );

  it("runs explicit parsers/validators against original source and preserves object values", () => {
    const { model, requests, rows } = fixture();
    const value = { choice: "x" };
    model.setColumns([
      {
        id: "choice",
        editable: true,
        valueGetter: () => "before",
        valueParser: (input, row) => {
          expect(row).toBe(rows[0]);
          return input;
        },
        validate: (input, row) => {
          expect(row).toBe(rows[0]);
          return input === value ? undefined : "invalid";
        },
      },
    ]);
    expect(model.editCell("a", "choice", value)).toBeUndefined();
    expect(requests[0].edits[0].value).toBe(value);
    expect(Object.isFrozen(value)).toBe(false);
    expect(model.editCell("a", "choice", {})).toBe("invalid");
    expect(requests).toHaveLength(1);
  });

  it("rejects reentrant requests while permitting host acknowledgement", () => {
    let nested: string | undefined;
    let model: GridModel<Account>;
    ({ model } = fixture({
      onEditRequest: () => {
        nested = model.editCell("a", "amount", 9);
      },
    }));
    expect(model.editCell("a", "amount", 4)).toBeUndefined();
    expect(nested).toBe("An edit request is already being dispatched");
  });

  it("releases the dispatch guard after a host error", () => {
    let count = 0;
    const { model } = fixture({
      onEditRequest: () => {
        if (++count === 1) throw new Error("host unavailable");
      },
    });
    expect(model.editCell("a", "amount", 4)).toBe("host unavailable");
    expect(model.editCell("a", "amount", 5)).toBeUndefined();
    expect(count).toBe(2);
  });

  it("rejects accidentally asynchronous callback returns and consumes their rejection", async () => {
    const { model } = fixture({
      onEditRequest: (() => Promise.reject(new Error("bad callback"))) as never,
    });
    expect(model.editCell("a", "amount", 4)).toMatch(/must return undefined/);
    await Promise.resolve();
    expect(model.getRow("a")?.amount).toBe(2);
  });

  it("rejects invalid configuration and unsupported extension ownership", () => {
    expect(() => fixture({ onEditRequest: true as never })).toThrow(
      "must be a function",
    );
    const options: GridOptions<Account> = {
      rows: [],
      columns: [],
      getRowId: (r) => r.id,
      onEditRequest: () => {},
    };
    attachGridExtension(options, {
      initialize() {},
      resolveValue: (_r, _c, raw) => raw(),
    });
    expect(() => createGrid(options)).toThrow(
      "cannot be combined with grid extensions",
    );
  });

  it("keeps fieldless row drafts independent and reports requested, not committed", () => {
    const { model, requests } = fixture();
    model.setColumns([
      { id: "twice", editable: true, valueGetter: (r) => r.amount * 2 },
      { id: "note", editable: true, valueGetter: (r) => r.note },
    ]);
    const session = createRowEditSession(model, "a");
    session.setValue("twice", 8);
    session.setValue("note", "submitted");
    expect(session.getSnapshot().values).toEqual({
      twice: 8,
      note: "submitted",
    });
    expect(session.commit()).toBeUndefined();
    expect(session.getSnapshot().status).toBe("requested");
    expect(session.getSnapshot().values).toEqual({
      twice: 8,
      note: "submitted",
    });
    expect(requests[0].edits.map((e) => e.columnId).sort()).toEqual([
      "note",
      "twice",
    ]);
    expect(model.getRow("a")?.note).toBe("original");
  });

  it("pastes/fills fieldless columns as one request with unchanged source values", () => {
    const { model, requests, rows } = fixture();
    model.setColumns([
      {
        id: "virtual",
        editable: true,
        type: "number",
        valueGetter: (r) => r.amount * 2,
      },
    ]);
    const ranges = createCellRangeModel(model);
    ranges.setRange(
      { rowId: "a", columnId: "virtual" },
      { rowId: "b", columnId: "virtual" },
    );
    expect(ranges.paste("12\n18")).toBeUndefined();
    expect(requests[0].edits.map((e) => e.value)).toEqual([12, 18]);
    expect(ranges.fill("down")).toBeUndefined();
    expect(requests[1].edits.map((e) => e.value)).toEqual([4]);
    expect(rows.map((r) => r.amount)).toEqual([2, 5]);
    expect(model.undo()).toBe(false);
    ranges.dispose();
  });
});
