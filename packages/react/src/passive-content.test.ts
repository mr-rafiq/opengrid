// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import {
  createPassiveContentPlan,
  createPassiveContentClone,
  PassiveContentLimitError,
} from "./passive-content.js";
it("builds literal text and ordinary layout without copying handlers, identities, navigation or resource elements", () => {
  const original = document.createElement("div");
  original.setAttribute("data-og-source-component", "");
  original.setAttribute("data-row-id", "private-owner");
  original.setAttribute("data-og-size-column-id", "private-measurement");
  original.innerHTML =
    '<a href="https://example.invalid" onclick="throw 1" id="original" name="original">literal &lt;script&gt;</a><button autofocus type="submit">Action</button><img src="https://example.invalid/a.png"><svg><script>throw 1</script></svg><script>throw 1</script>';
  const clicked = vi.fn();
  original.querySelector("button")!.addEventListener("click", clicked);
  const before = original.outerHTML,
    plan = createPassiveContentPlan(original)!,
    clone = createPassiveContentClone(document, plan);
  expect(original.outerHTML).toBe(before);
  expect(clone.textContent).toBe("literal <script>Action");
  expect(clone.hasAttribute("data-og-source-component")).toBe(true);
  expect(clone.hasAttribute("data-row-id")).toBe(false);
  expect(clone.hasAttribute("data-og-size-column-id")).toBe(false);
  expect(
    clone.querySelector(
      "script,img,svg,[src],[href],[onclick],[autofocus],[id],[name]",
    ),
  ).toBeNull();
  expect(clone.querySelector("button")!.type).toBe("button");
  clone.querySelector("button")!.click();
  expect(clicked).not.toHaveBeenCalled();
});
it("keeps atomic root dimensions and rejects forged or changed measurement plans", () => {
  const root = document.createElement("input");
  const plan = createPassiveContentPlan(root)!;
  const clone = createPassiveContentClone(document, plan);
  expect(clone.tagName).toBe("SPAN");
  expect(clone.style.width).toBe("0px");
  expect(Object.isFrozen(plan.node)).toBe(true);
  expect(() => createPassiveContentClone(document, { ...plan })).toThrow(
    /owned/,
  );
});
it("preserves flex flow when releasing the fixed width for natural sizing", () => {
  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.width = "200px";
  root.innerHTML = "<span>First</span><span>Second</span>";
  const clone = createPassiveContentClone(
    document,
    createPassiveContentPlan(root)!,
  );
  expect(clone.style.display).toBe("inline-flex");
  expect(clone.style.width).toBe("auto");
});
it("does not instantiate custom elements again or copy their shadow state", () => {
  let calls = 0;
  class Widget extends HTMLElement {
    constructor() {
      super();
      calls++;
      this.attachShadow({ mode: "open" }).innerHTML =
        "<span>Hidden implementation</span>";
    }
  }
  const tag = "passive-test-widget";
  if (!customElements.get(tag)) customElements.define(tag, Widget);
  const original = document.createElement("div");
  original.append(document.createElement(tag));
  const before = calls;
  const clone = createPassiveContentClone(
    document,
    createPassiveContentPlan(original)!,
  );
  expect(calls).toBe(before);
  expect(clone.querySelector(tag)).toBeNull();
  expect(clone.textContent).toBe("");
});
it("bounds deep and large text plans before any measurement insertion", () => {
  const root = document.createElement("div");
  root.textContent = "x".repeat(65537);
  expect(() => createPassiveContentPlan(root)).toThrow(
    PassiveContentLimitError,
  );
  root.textContent = "";
  let child: HTMLElement = root;
  for (let i = 0; i < 34; i++) {
    const next = document.createElement("span");
    child.append(next);
    child = next;
  }
  expect(() => createPassiveContentPlan(root)).toThrow(
    PassiveContentLimitError,
  );
});
it("changes its owned signature when visible content changes without mutating the original", () => {
  const root = document.createElement("div");
  root.textContent = "First";
  const a = createPassiveContentPlan(root)!;
  root.textContent = "Second";
  const b = createPassiveContentPlan(root)!;
  expect(a.signature).not.toBe(b.signature);
  expect(createPassiveContentClone(document, a).textContent).toBe("First");
  expect(root.textContent).toBe("Second");
});
