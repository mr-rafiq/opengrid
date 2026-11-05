/** Passive layout plans never reuse a host node, listener, resource URL or custom element constructor. */
export class PassiveContentLimitError extends RangeError {}
interface PassiveNode {
  atomic?: boolean;
  tag?: string;
  text?: string;
  className?: string;
  attributes?: readonly (readonly [string, string])[];
  styles?: readonly (readonly [string, string])[];
  children?: readonly PassiveNode[];
}
export interface PassiveContentPlan {
  readonly node: PassiveNode;
  readonly signature: string;
  readonly characters: number;
  readonly nodes: number;
}
const ownedPlans = new WeakSet<PassiveContentPlan>();
function freezePlan(value: object): void {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freezePlan(child);
  Object.freeze(value);
}
const tags = new Set([
  "DIV",
  "SPAN",
  "P",
  "SMALL",
  "STRONG",
  "EM",
  "I",
  "B",
  "BR",
  "LABEL",
  "BUTTON",
  "A",
  "SUP",
  "SUB",
  "UL",
  "OL",
  "LI",
  "BDI",
  "BDO",
]);
const omitted = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "TEMPLATE",
  "NOSCRIPT",
]);
const layout = [
  "display",
  "flex",
  "flex-direction",
  "flex-wrap",
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "align-items",
  "align-self",
  "justify-content",
  "gap",
  "column-gap",
  "row-gap",
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "padding",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "margin",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-bottom",
  "border-width",
  "border-style",
  "box-sizing",
  "white-space",
  "overflow",
  "text-overflow",
  "vertical-align",
  "position",
  "inset",
  "left",
  "right",
  "top",
  "bottom",
];
const typography = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-variant",
  "font-feature-settings",
  "font-variation-settings",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "line-height",
  "direction",
];
const rootBox = [
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "border-left-width",
  "border-right-width",
  "border-left-style",
  "border-right-style",
  "box-sizing",
];
const excludedData =
  /^(?:data-row-id|data-column-id|data-og-row-id|data-testid)$|^data-og-size(?:-|$)/;
/** Build an owned bounded description before touching measurement DOM. */
export function createPassiveContentPlan(
  element: HTMLElement,
): PassiveContentPlan | undefined {
  const window = element.ownerDocument.defaultView;
  if (!window) return;
  let characters = 0,
    nodes = 0;
  const account = (value: string) => {
    characters += value.length;
    if (characters > 65536)
      throw new PassiveContentLimitError(
        "Passive content character budget exceeded",
      );
    return value;
  };
  function read(node: Node, depth: number): PassiveNode {
    if (++nodes > 512 || depth > 32)
      throw new PassiveContentLimitError(
        "Passive content tree budget exceeded",
      );
    if (node.nodeType === 3) return { text: account(node.textContent ?? "") };
    if (!(node instanceof window!.Element)) return { text: "" };
    const source = node as HTMLElement,
      tag = source.tagName.toUpperCase();
    if (omitted.has(tag)) return { text: "" };
    const style = window!.getComputedStyle(source);
    if (
      !tags.has(tag) ||
      (source !== element && source.matches('[role="grid"],[role="treegrid"]'))
    ) {
      const rect = window!.Element.prototype.getBoundingClientRect.call(source);
      if (![rect.width, rect.height].every((v) => Number.isFinite(v) && v >= 0))
        return { text: "" };
      const styles: [string, string][] = [
        ["display", style.display === "none" ? "none" : "inline-block"],
        ["width", rect.width + "px"],
        ["height", rect.height + "px"],
        ["box-sizing", "border-box"],
        ["flex-shrink", "0"],
      ];
      for (const key of [
        "margin-left",
        "margin-right",
        "margin-top",
        "margin-bottom",
        "vertical-align",
      ])
        styles.push([key, account(style.getPropertyValue(key))]);
      return { tag: "span", atomic: true, styles };
    }
    const styles: [string, string][] = [];
    for (const key of layout) {
      const value = source.style.getPropertyValue(key);
      if (value && !/url\(|expression\(/i.test(value))
        styles.push([key, account(value)]);
    }
    for (const key of typography)
      styles.push([key, account(style.getPropertyValue(key))]);
    if (source === element) {
      styles.push(["display", style.display]);
      for (const key of rootBox)
        styles.push([key, account(style.getPropertyValue(key))]);
    }
    const attributes: [string, string][] = [];
    for (const attribute of source.attributes) {
      const name = attribute.name;
      if (
        (name.startsWith("data-") && !excludedData.test(name)) ||
        name === "lang" ||
        name === "dir" ||
        (name === "disabled" && tag === "BUTTON")
      )
        attributes.push([account(name), account(attribute.value)]);
    }
    return {
      tag: tag.toLowerCase(),
      className: account(source.getAttribute("class") ?? ""),
      styles,
      attributes,
      children: [...source.childNodes].map((child) => read(child, depth + 1)),
    };
  }
  const node = read(element, 0),
    signature = JSON.stringify(node);
  const plan = { node, signature, characters, nodes };
  freezePlan(plan);
  ownedPlans.add(plan);
  return plan;
}
/** Only built-in passive tags and text are created; atomic widgets keep their current rendered box. */
export function createPassiveContentClone(
  document: Document,
  plan: PassiveContentPlan,
): HTMLElement {
  if (!ownedPlans.has(plan))
    throw new TypeError("A passive measurement requires an owned content plan");
  function create(node: PassiveNode): Node {
    if (!node.tag) return document.createTextNode(node.text ?? "");
    const result = document.createElement(node.tag);
    if (node.className) result.className = node.className;
    for (const [key, value] of node.attributes ?? [])
      result.setAttribute(key, value);
    for (const [key, value] of node.styles ?? [])
      result.style.setProperty(key, value);
    if (node.tag === "button") {
      (result as HTMLButtonElement).type = "button";
      result.tabIndex = -1;
    }
    result.style.setProperty("visibility", "hidden", "important");
    result.style.setProperty("animation", "none", "important");
    result.style.setProperty("transition", "none", "important");
    for (const child of node.children ?? []) result.append(create(child));
    return result;
  }
  const root = create(plan.node) as HTMLElement;
  if (plan.node.atomic) return root;
  const display = plan.node.styles
    ?.filter(([key]) => key === "display")
    .at(-1)?.[1];
  for (const [key, value] of Object.entries({
    width: "auto",
    minWidth: "0",
    maxWidth: "none",
    height: "auto",
    position: "static",
    left: "auto",
    right: "auto",
    display: display?.includes("flex")
      ? "inline-flex"
      : display?.includes("grid")
        ? "inline-grid"
        : "inline-block",
    flex: "none",
  }))
    Object.assign(root.style, { [key]: value });
  return root;
}
