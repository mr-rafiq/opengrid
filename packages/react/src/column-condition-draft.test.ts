import { describe, expect, it, vi } from "vitest";
import {
  buildColumnConditionFilter,
  columnFilterFingerprint,
  ConditionFilterDraftError,
  convertConditionDraft,
  createConditionDraft,
  getConditionOperators,
  normalizeConditionLimit,
  parseConditionMembership,
  readColumnConditionDraft,
} from "./column-condition-draft";

describe("bounded column condition drafts", () => {
  it("has typed operator families and a compact four-condition default", () => {
    expect(normalizeConditionLimit()).toBe(4);
    expect(getConditionOperators("text")).toContain("notContains");
    expect(getConditionOperators("boolean")).not.toContain("between");
    expect(getConditionOperators("date")).toContain("gte");
    expect(createConditionDraft("boolean")).toEqual({
      op: "equals",
      value: "true",
      upper: "",
    });
    for (const limit of [0, 17, 2.5, NaN, Infinity])
      expect(() => normalizeConditionLimit(limit)).toThrow(
        ConditionFilterDraftError,
      );
  });
  it("fingerprints property order consistently without losing primitive identities", () => {
    expect(columnFilterFingerprint({ op: "between", value: 1n, to: 2n })).toBe(
      columnFilterFingerprint({ to: 2n, value: 1n, op: "between" }),
    );
    expect(columnFilterFingerprint({ op: "in", value: [-0] })).not.toBe(
      columnFilterFingerprint({ op: "in", value: [0] }),
    );
    expect(columnFilterFingerprint({ op: "in", value: [1n] })).not.toBe(
      columnFilterFingerprint({ op: "in", value: ["1"] }),
    );
    expect(columnFilterFingerprint({ op: "blank" })).not.toBe(
      columnFilterFingerprint({ op: "blank", value: undefined }),
    );
  });
  it("supports live legacy Date and array fingerprints without running user conversion", () => {
    const date = new Date("2026-01-01T00:00:00Z"),
      values = [date];
    const first = columnFilterFingerprint({ op: "in", value: values });
    date.setUTCDate(2);
    expect(columnFilterFingerprint({ op: "in", value: values })).not.toBe(
      first,
    );
    const toJSON = vi.fn(() => {
      throw Error("must not run");
    });
    expect(() =>
      columnFilterFingerprint({ op: "equals", value: { toJSON } }),
    ).toThrow();
    expect(toJSON).not.toHaveBeenCalled();
  });
  it("never invokes getters and rejects cycles, sparse arrays and unsupported prototypes", () => {
    const getter = vi.fn(() => "equals");
    const source = Object.defineProperty({}, "op", { get: getter });
    expect(() => columnFilterFingerprint(source)).toThrow(
      ConditionFilterDraftError,
    );
    expect(() => readColumnConditionDraft(source, "text")).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => columnFilterFingerprint(cycle)).toThrow();
    expect(() =>
      readColumnConditionDraft({ op: "in", value: Array(2) }, "text"),
    ).toThrow();
    expect(() => columnFilterFingerprint(new Map())).toThrow();
  });
  it("handles null-prototype records and prototype-like column operand text safely", () => {
    const source = Object.assign(Object.create(null), {
      op: "equals",
      value: "__proto__",
    });
    expect(readColumnConditionDraft(source, "text").conditions[0].value).toBe(
      "__proto__",
    );
    expect(
      convertConditionDraft({ op: "equals", value: "", upper: "" }, "text")
        .value,
    ).toBe("");
  });
  it("rejects unknown source properties and unrepresentable Date/null scalar operands", () => {
    for (const source of [
      { op: "equals", value: new Date() },
      { op: "equals", value: null },
      { op: "contains", value: "A", extra: true },
      { op: "gt", value: 1 },
    ]) {
      expect(() => readColumnConditionDraft(source, "text")).toThrow();
    }
  });
  it("reads groups and preserves raw string representations for unchanged Apply", () => {
    const source = {
      op: "or",
      conditions: [{ op: "gte", value: "01.00" }, { op: "blank" }],
    };
    const read = readColumnConditionDraft(source, "number");
    expect(read.logic).toBe("or");
    expect(read.conditions).toEqual([
      { op: "gte", value: "01.00", upper: "" },
      { op: "blank", value: "", upper: "" },
    ]);
    expect(read.sourceFingerprint).toBe(columnFilterFingerprint(source));
  });
  it("publishes one scalar or one immutable compound with typed operands", () => {
    const first = { op: "gte" as const, value: "1.25", upper: "" },
      second = { op: "lt" as const, value: "5", upper: "" };
    expect(buildColumnConditionFilter("and", [first], "number")).toEqual({
      op: "gte",
      value: 1.25,
    });
    const result = buildColumnConditionFilter("or", [first, second], "number");
    expect(result).toEqual({
      op: "or",
      conditions: [
        { op: "gte", value: 1.25 },
        { op: "lt", value: 5 },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each(["Infinity", "NaN", "0x20", "2px", "1,000", " "])(
    "rejects non-finite/non-decimal number draft %s",
    (value) => {
      expect(() =>
        convertConditionDraft({ op: "equals", value, upper: "" }, "number"),
      ).toThrow();
    },
  );
  it("keeps exact BigInt bounds, signed zero numbers and valid decimal exponents", () => {
    expect(
      convertConditionDraft(
        {
          op: "between",
          value: "9007199254740993123",
          upper: "9007199254740993124",
        },
        "bigint",
      ),
    ).toEqual({
      op: "between",
      value: 9007199254740993123n,
      to: 9007199254740993124n,
    });
    expect(
      Object.is(
        convertConditionDraft(
          { op: "equals", value: "-0", upper: "" },
          "number",
        ).value,
        -0,
      ),
    ).toBe(true);
    expect(
      convertConditionDraft(
        { op: "equals", value: "1e-2", upper: "" },
        "number",
      ).value,
    ).toBe(0.01);
    expect(() =>
      convertConditionDraft(
        { op: "between", value: "3", upper: "2" },
        "bigint",
      ),
    ).toThrow();
  });
  it("preserves precise ISO timestamp text and explicit UTC dates", () => {
    const text = "2026-03-04T10:11:12.123456+02:00";
    expect(
      convertConditionDraft({ op: "equals", value: text, upper: "" }, "date")
        .value,
    ).toBe(text);
    expect(
      convertConditionDraft(
        { op: "gte", value: "2024-02-29", upper: "" },
        "date",
      ).value,
    ).toBe("2024-02-29");
    for (const bad of [
      "2025-02-29",
      "2026-13-01",
      "03/04/2026",
      "2026-01-01T10:00:00",
    ])
      expect(() =>
        convertConditionDraft({ op: "equals", value: bad, upper: "" }, "date"),
      ).toThrow();
  });
  it("parses JSON primitive lists with null, -0 and exact quoted large integers", () => {
    const numbers = parseConditionMembership('[-0,0,null,"1.5"]', "number");
    expect(Object.is(numbers[0], -0)).toBe(true);
    expect(numbers).toEqual([-0, 0, null, 1.5]);
    expect(
      parseConditionMembership('["9007199254740993123",null,-2]', "bigint"),
    ).toEqual([9007199254740993123n, null, -2n]);
    expect(parseConditionMembership('[true,"false",null]', "boolean")).toEqual([
      true,
      false,
      null,
    ]);
    expect(parseConditionMembership("[]", "text")).toEqual([]);
    expect(parseConditionMembership('["",null,"__proto__"]', "text")).toEqual([
      "",
      null,
      "__proto__",
    ]);
  });
  it.each([
    "[9007199254740993]",
    "[1.2]",
    "[true]",
    "[[1]]",
    '[{"x":1}]',
    "undefined",
    "[1,]",
    "[1e999]",
  ])("rejects unsafe BigInt JSON %s", (value) => {
    expect(() => parseConditionMembership(value, "bigint")).toThrow();
  });
  it("round-trips legacy membership spelling without conflating -0/BigInt", () => {
    expect(
      readColumnConditionDraft({ op: "in", value: [-0, 0] }, "number")
        .conditions[0].value,
    ).toBe("[-0,0]");
    expect(
      readColumnConditionDraft(
        { op: "in", value: [9007199254740993123n] },
        "bigint",
      ).conditions[0].value,
    ).toBe('["9007199254740993123"]');
  });
  it("reads typed legacy Dates without converting untyped Dates or permitting them in groups", () => {
    const date = new Date("2026-02-03T04:05:06.123Z");
    expect(
      readColumnConditionDraft({ op: "equals", value: date }, "date")
        .conditions[0].value,
    ).toBe("2026-02-03T04:05:06.123Z");
    expect(
      readColumnConditionDraft({ op: "in", value: [date, null] }, "date")
        .conditions[0].value,
    ).toBe('["2026-02-03T04:05:06.123Z",null]');
    expect(() =>
      readColumnConditionDraft({ op: "equals", value: date }, undefined),
    ).toThrow();
    expect(() =>
      readColumnConditionDraft(
        { op: "and", conditions: [{ op: "equals", value: date }] },
        "date",
      ),
    ).toThrow();
    expect(() =>
      readColumnConditionDraft({ op: "equals", value: new Date(NaN) }, "date"),
    ).toThrow();
  });
  it("accepts ignored undefined operands on standalone legacy blanks only", () => {
    expect(
      readColumnConditionDraft(
        { op: "blank", value: undefined, to: undefined },
        "number",
      ).conditions,
    ).toEqual([{ op: "blank", value: "", upper: "" }]);
    expect(() =>
      readColumnConditionDraft(
        { op: "and", conditions: [{ op: "blank", value: undefined }] },
        "number",
      ),
    ).toThrow();
  });
  it("enforces configured rows, aggregate list values, text budget and structural depth", () => {
    const condition = { op: "blank" };
    expect(() =>
      readColumnConditionDraft(
        { op: "and", conditions: Array(5).fill(condition) },
        "text",
      ),
    ).toThrow();
    expect(() =>
      readColumnConditionDraft({ op: "and", conditions: [] }, "text"),
    ).toThrow();
    expect(() =>
      columnFilterFingerprint({ op: "contains", value: "x".repeat(512001) }),
    ).toThrow();
    expect(() =>
      readColumnConditionDraft(
        { op: "contains", value: "x".repeat(256001) },
        "text",
      ),
    ).toThrow();
    const list = JSON.stringify(Array(5001).fill(1));
    expect(() =>
      buildColumnConditionFilter(
        "and",
        [
          { op: "in", value: list, upper: "" },
          { op: "in", value: list, upper: "" },
        ],
        "number",
      ),
    ).toThrow();
    let deep: unknown = "x";
    for (let i = 0; i < 12; i++) deep = { value: deep };
    expect(() => columnFilterFingerprint(deep)).toThrow();
  });
});
