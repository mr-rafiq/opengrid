import {
  clampColumnWidth,
  fitColumnWidths,
  type FittedColumnWidths,
  type Column,
  type GridModel,
} from "@opengrid/core";

export interface AutoSizeOptions {
  includeHeader?: boolean;
  /** Cancels only this request; an already-aborted request never supersedes current work. */
  signal?: AbortSignal;
}
export type AutoSizeCancelReason =
  | "superseded"
  | "model"
  | "view"
  | "fonts"
  | "disposed"
  | "busy"
  | "limits"
  | "aborted";
export type AutoSizeSkipReason =
  | "unknown"
  | "hidden"
  | "custom-renderer"
  | "unrendered"
  | "not-measurable"
  | "unavailable";
export interface AutoSizeMeasurement {
  readonly columnId: string;
  readonly width: number;
  readonly previousWidth: number;
  readonly cellSamples: number;
  readonly headerSamples: number;
  readonly overrideAdded: boolean;
}
export interface AutoSizeReport {
  readonly measured: readonly AutoSizeMeasurement[];
  readonly unchanged: readonly AutoSizeMeasurement[];
  readonly skipped: readonly Readonly<{
    columnId: string;
    reason: AutoSizeSkipReason;
  }>[];
  readonly cancelled: boolean;
  readonly cancelReason?: AutoSizeCancelReason;
}
export interface DataGridSizingController {
  sizeColumnsToFit(options?: FitColumnsOptions): FitColumnsReport;
  autoSizeColumns(
    ids?: readonly string[],
    options?: AutoSizeOptions,
  ): Promise<AutoSizeReport>;
  getWidths(): Readonly<Record<string, number>>;
  resetWidths(ids?: readonly string[]): void;
}
export interface FitColumnsOptions {
  /** Omit to use the mounted viewport's usable client width. */
  readonly availableWidth?: number;
  readonly excludeColumnIds?: readonly string[];
}
export interface FitColumnsReport {
  readonly cancelled: boolean;
  readonly cancelReason?: "disposed" | "busy" | "unavailable" | "stale";
  readonly allocation?: FittedColumnWidths;
  readonly changedColumnIds: readonly string[];
}
/** Private DataGrid integration input; every value is read again before publication. */
export interface ColumnSizingSnapshot<T> {
  readonly model: GridModel<T>;
  readonly viewport: HTMLElement | null;
  readonly columns: readonly Column<T>[];
  readonly widths: Readonly<Record<string, number>>;
  readonly leadingWidth?: number;
  readonly viewToken: unknown;
  readonly busy?: boolean;
  readonly customRenderer?: boolean;
}
interface Sample {
  element: HTMLElement;
  owner: HTMLElement;
  lang: string;
  columnId: string;
  text: string;
  kind: "cell" | "header";
  extra: number;
  typography: readonly [string, string][];
}
interface Operation {
  reason?: AutoSizeCancelReason;
  cancelled: Promise<void>;
  abort(): void;
  dispose(): void;
}
const MAX_COLUMNS = 64,
  MAX_SAMPLES = 2000,
  MAX_CHARACTERS = 1000000;
const typographyProperties = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-variant",
  "font-variant-numeric",
  "font-variant-ligatures",
  "font-variant-east-asian",
  "font-feature-settings",
  "font-variation-settings",
  "font-kerning",
  "font-optical-sizing",
  "font-size-adjust",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-indent",
  "direction",
  "unicode-bidi",
] as const;
function frozenReport(
  measured: AutoSizeMeasurement[] = [],
  unchanged: AutoSizeMeasurement[] = [],
  skipped: { columnId: string; reason: AutoSizeSkipReason }[] = [],
  reason?: AutoSizeCancelReason,
): AutoSizeReport {
  return Object.freeze({
    measured: Object.freeze(measured.map((item) => Object.freeze(item))),
    unchanged: Object.freeze(unchanged.map((item) => Object.freeze(item))),
    skipped: Object.freeze(skipped.map((item) => Object.freeze(item))),
    cancelled: reason !== undefined,
    ...(reason ? { cancelReason: reason } : {}),
  });
}
function requestedIds(ids: readonly string[]): string[] {
  if (!Array.isArray(ids))
    throw new TypeError("Auto-size IDs must be an array");
  if (ids.length > MAX_COLUMNS)
    throw new RangeError("At most 64 columns can be auto-sized at once");
  const result: string[] = [],
    seen = new Set<string>();
  for (let index = 0; index < ids.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(ids, String(index));
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      !descriptor.value ||
      seen.has(descriptor.value)
    )
      throw new TypeError(
        "Auto-size IDs must be unique nonempty strings without holes or accessors",
      );
    seen.add(descriptor.value);
    result.push(descriptor.value);
  }
  return result;
}
function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}
function horizontalBox(style: CSSStyleDeclaration): number {
  return (
    px(style.paddingLeft) +
    px(style.paddingRight) +
    px(style.borderLeftWidth) +
    px(style.borderRightWidth)
  );
}
function ownerGrid(element: Element) {
  return element.closest('[role="grid"],[role="treegrid"]');
}
function hasTransformedMetrics(element: HTMLElement): boolean {
  const window = element.ownerDocument.defaultView;
  if (!window) return true;
  for (
    let ancestor: HTMLElement | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const style = window.getComputedStyle(ancestor);
    const transform = style.getPropertyValue("transform"),
      scale = style.getPropertyValue("scale"),
      perspective = style.getPropertyValue("perspective"),
      zoom = style.getPropertyValue("zoom");
    if (
      (transform && transform !== "none") ||
      (scale && scale !== "none") ||
      (perspective && perspective !== "none") ||
      (zoom && !["normal", "1", "100%"].includes(zoom))
    )
      return true;
  }
  return false;
}
function sampleFrom(
  element: HTMLElement,
  owner: HTMLElement,
  kind: Sample["kind"],
  columnId: string,
): Sample | undefined {
  const window = owner.ownerDocument.defaultView;
  if (
    !window ||
    !element.getClientRects().length ||
    !owner.getClientRects().length
  )
    return;
  // Body probes use CSS pixels; transformed sibling rectangles do not.
  if (hasTransformedMetrics(element)) return;
  const textStyle = window.getComputedStyle(element);
  if (textStyle.display === "none" || textStyle.visibility === "hidden") return;
  const typography: [string, string][] = typographyProperties.map(
    (property) => [property, textStyle.getPropertyValue(property)],
  );
  if (
    typography.reduce(
      (size, pair) => size + pair[0].length + pair[1].length,
      0,
    ) > 8192
  )
    return;
  const lang =
    element.closest("[lang]")?.getAttribute("lang") ??
    element.ownerDocument.documentElement.lang;
  const preserveSpace = ["pre", "pre-wrap", "break-spaces"].includes(
    textStyle.whiteSpace,
  );
  typography.push(["white-space", preserveSpace ? "pre" : "nowrap"]);
  let extra =
      horizontalBox(textStyle) +
      px(textStyle.marginLeft) +
      px(textStyle.marginRight),
    child: HTMLElement = element;
  for (let depth = 0; child !== owner; depth++) {
    const parent = child.parentElement;
    if (!parent || depth > 8) return;
    const style = window.getComputedStyle(parent);
    if (parent.children.length > 32) return;
    extra += horizontalBox(style);
    let inFlow = 1;
    for (const sibling of parent.children) {
      if (sibling === child || !(sibling instanceof window.HTMLElement))
        continue;
      const siblingStyle = window.getComputedStyle(sibling);
      if (siblingStyle.display === "none") continue;
      const width = sibling.getBoundingClientRect().width;
      if (Number.isFinite(width) && width > 0)
        extra +=
          width + px(siblingStyle.marginLeft) + px(siblingStyle.marginRight);
      if (
        siblingStyle.position !== "absolute" &&
        siblingStyle.position !== "fixed"
      )
        inFlow++;
    }
    if (style.display.includes("flex") || style.display.includes("grid"))
      extra += Math.max(0, inFlow - 1) * px(style.columnGap);
    child = parent;
  }
  if (!Number.isFinite(extra) || extra < 0) return;
  return {
    element,
    owner,
    lang,
    columnId,
    text: element.textContent ?? "",
    kind,
    extra,
    typography,
  };
}

/** One bounded metric cache and at most one operation per mounted DataGrid. */
export function createColumnSizingController<T>(
  getSnapshot: () => ColumnSizingSnapshot<T>,
): DataGridSizingController & {
  cancel(reason?: AutoSizeCancelReason): void;
  dispose(): void;
} {
  let active: Operation | undefined,
    disposed = false,
    cacheCharacters = 0;
  let watchedFonts: FontFaceSet | undefined,
    releaseFonts = () => {};
  const metrics = new Map<string, number>();
  function clearCache() {
    metrics.clear();
    cacheCharacters = 0;
  }
  function cancel(reason: AutoSizeCancelReason = "view") {
    if (active && !active.reason) {
      active.reason = reason;
      active.abort();
      active.dispose();
    }
  }
  function watchFonts(fonts: FontFaceSet | undefined) {
    if (fonts === watchedFonts) return;
    releaseFonts();
    clearCache();
    watchedFonts = fonts;
    const changed = () => {
      clearCache();
      cancel("fonts");
    };
    fonts?.addEventListener("loading", changed);
    fonts?.addEventListener("loadingdone", changed);
    fonts?.addEventListener("loadingerror", changed);
    releaseFonts = () => {
      fonts?.removeEventListener("loading", changed);
      fonts?.removeEventListener("loadingdone", changed);
      fonts?.removeEventListener("loadingerror", changed);
    };
  }
  function cache(key: string, width: number) {
    if (key.length > 4096) return;
    if (metrics.has(key)) {
      metrics.delete(key);
      cacheCharacters -= key.length;
    }
    metrics.set(key, width);
    cacheCharacters += key.length;
    while (metrics.size > 512 || cacheCharacters > 262144) {
      const first = metrics.keys().next().value!;
      metrics.delete(first);
      cacheCharacters -= first.length;
    }
  }
  return Object.freeze({
    sizeColumnsToFit(options: FitColumnsOptions = {}): FitColumnsReport {
      if (!options || typeof options !== "object" || Array.isArray(options))
        throw new TypeError("Fit options must be a record");
      if (
        options.availableWidth !== undefined &&
        (typeof options.availableWidth !== "number" ||
          !Number.isFinite(options.availableWidth) ||
          options.availableWidth < 0 ||
          options.availableWidth > Number.MAX_SAFE_INTEGER)
      )
        throw new RangeError(
          "Fit width must be a finite nonnegative safe dimension",
        );
      const cancelled = (
        reason: NonNullable<FitColumnsReport["cancelReason"]>,
      ): FitColumnsReport =>
        Object.freeze({
          cancelled: true,
          cancelReason: reason,
          changedColumnIds: Object.freeze([]),
        });
      if (disposed) return cancelled("disposed");
      const context = getSnapshot(),
        root = context.viewport,
        state = context.model.getState();
      if (context.busy) return cancelled("busy");
      if (
        !root?.isConnected ||
        !root.getClientRects().length ||
        root.clientWidth <= 0
      )
        return cancelled("unavailable");
      const clientWidth = root.clientWidth;
      const defaults = context.model.getColumnWidthDefaults();
      const allocation = fitColumnWidths(
        context.columns.map((column) => ({
          ...column,
          width: defaults[column.id],
        })),
        {
          availableWidth: options.availableWidth ?? clientWidth,
          leadingWidth: context.leadingWidth,
          columnWidths: context.widths,
          excludeColumnIds: options.excludeColumnIds,
        },
      );
      cancel("superseded");
      const latest = getSnapshot();
      if (disposed) return cancelled("disposed");
      if (latest.busy) return cancelled("busy");
      if (
        latest.model !== context.model ||
        context.model.getState() !== state ||
        latest.viewport !== root ||
        !root.isConnected ||
        root.clientWidth !== clientWidth ||
        !Object.is(latest.viewToken, context.viewToken) ||
        latest.leadingWidth !== context.leadingWidth
      )
        return cancelled("stale");
      const next = Object.assign(
        Object.create(null),
        state.columnWidths,
      ) as Record<string, number>;
      const changed: string[] = [];
      // Freeze excluded flex columns at their existing rendered width too: otherwise
      // their subsequent flex pass could violate the explicit fixed-width allocation.
      for (const id of allocation.columnIds) {
        const width = allocation.widths[id];
        if (!Object.hasOwn(next, id) || next[id] !== width) {
          next[id] = width;
          changed.push(id);
        }
      }
      if (changed.length) context.model.setState({ columnWidths: next });
      return Object.freeze({
        cancelled: false,
        allocation,
        changedColumnIds: Object.freeze(changed),
      });
    },
    getWidths() {
      const widths = getSnapshot().widths,
        snapshot = Object.create(null) as Record<string, number>;
      for (const id of Object.keys(widths))
        Object.defineProperty(snapshot, id, {
          value: widths[id],
          enumerable: true,
        });
      return Object.freeze(snapshot);
    },
    resetWidths(ids?: readonly string[]) {
      if (disposed) return;
      cancel("view");
      const context = getSnapshot(),
        current = context.model.getState().columnWidths;
      const targets =
        ids === undefined
          ? new Set(Object.keys(current))
          : new Set(requestedIds(ids));
      const next = Object.create(null) as Record<string, number>;
      let changed = false;
      for (const id of Object.keys(current)) {
        if (targets.has(id)) changed = true;
        else
          Object.defineProperty(next, id, {
            value: current[id],
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
      if (changed) context.model.setState({ columnWidths: next });
    },
    async autoSizeColumns(
      ids?: readonly string[],
      options: AutoSizeOptions = {},
    ) {
      if (
        options.includeHeader !== undefined &&
        typeof options.includeHeader !== "boolean"
      )
        throw new TypeError("includeHeader must be boolean");
      const signal = options.signal;
      if (
        signal !== undefined &&
        (!signal ||
          typeof signal.aborted !== "boolean" ||
          typeof signal.addEventListener !== "function" ||
          typeof signal.removeEventListener !== "function")
      )
        throw new TypeError("signal must be an AbortSignal");
      if (signal?.aborted) return frozenReport([], [], [], "aborted");
      if (ids !== undefined && Array.isArray(ids) && ids.length > MAX_COLUMNS) {
        cancel("superseded");
        return frozenReport([], [], [], "limits");
      }
      const explicit = ids === undefined ? undefined : requestedIds(ids);
      cancel("superseded");
      if (disposed) return frozenReport([], [], [], "disposed");
      const context = getSnapshot(),
        candidateRoot = context.viewport,
        state = context.model.getState();
      if (context.busy) return frozenReport([], [], [], "busy");
      if (
        !candidateRoot?.isConnected ||
        !candidateRoot.ownerDocument.defaultView ||
        !candidateRoot.getClientRects().length
      )
        return frozenReport(
          [],
          [],
          (explicit ?? []).map((columnId) => ({
            columnId,
            reason: "unavailable",
          })),
        );
      const root: HTMLElement = candidateRoot;
      const rootRect = root.getBoundingClientRect();
      if (rootRect.width <= 0 || rootRect.height <= 0)
        return frozenReport(
          [],
          [],
          (explicit ?? []).map((columnId) => ({
            columnId,
            reason: "unavailable",
          })),
        );
      const document = root.ownerDocument,
        window = document.defaultView!,
        fonts = document.fonts;
      watchFonts(fonts);
      if (fonts?.status === "loading") return frozenReport([], [], [], "fonts");
      const columns = new Map(
        context.columns.map((column) => [column.id, column]),
      );
      const nodes = [
        ...root.querySelectorAll<HTMLElement>(
          '[data-og-size-text="cell"],[data-og-size-text="header"]',
        ),
      ].filter((element) => ownerGrid(element) === root);
      const renderedIds = [
        ...new Set(
          nodes
            .map((element) => {
              const owner = element.closest<HTMLElement>(
                "[data-column-id],[data-og-size-column-id]",
              );
              return owner?.dataset.columnId ?? owner?.dataset.ogSizeColumnId;
            })
            .filter((id): id is string => !!id),
        ),
      ];
      if (!explicit && renderedIds.length > MAX_COLUMNS)
        return frozenReport([], [], [], "limits");
      const targets = explicit ?? renderedIds,
        eligible = new Set<string>();
      const skipped: { columnId: string; reason: AutoSizeSkipReason }[] = [];
      for (const id of targets) {
        const column = columns.get(id);
        if (!column) skipped.push({ columnId: id, reason: "unknown" });
        else if (column.hidden || !Object.hasOwn(context.widths, id))
          skipped.push({ columnId: id, reason: "hidden" });
        else if (context.customRenderer)
          skipped.push({ columnId: id, reason: "custom-renderer" });
        else eligible.add(id);
      }
      let abort!: () => void;
      const operation: Operation = {
        cancelled: new Promise<void>((resolve) => {
          abort = resolve;
        }),
        abort: () => abort(),
        dispose: () => {},
      };
      active = operation;
      const originalRect = root.getBoundingClientRect();
      const changedView = () => invalidate("view");
      const unsubscribe = context.model.subscribe(() => invalidate("model"));
      const mutation =
        typeof window.MutationObserver === "function"
          ? new window.MutationObserver(changedView)
          : undefined;
      mutation?.observe(root, {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      });
      const resize =
        typeof window.ResizeObserver === "function"
          ? new window.ResizeObserver(() => {
              const rect = root.getBoundingClientRect();
              if (
                rect.width !== originalRect.width ||
                rect.height !== originalRect.height
              )
                changedView();
            })
          : undefined;
      resize?.observe(root);
      root.addEventListener("scroll", changedView, { passive: true });
      let probe: HTMLSpanElement | undefined;
      let releaseWork = () => {};
      let cleaned = false;
      const aborted = () => invalidate("aborted");
      operation.dispose = () => {
        if (cleaned) return;
        cleaned = true;
        signal?.removeEventListener("abort", aborted);
        releaseWork();
        unsubscribe();
        mutation?.disconnect();
        resize?.disconnect();
        root.removeEventListener("scroll", changedView);
        probe?.remove();
      };
      function invalidate(reason: AutoSizeCancelReason) {
        if (!operation.reason) {
          operation.reason = reason;
          operation.abort();
          operation.dispose();
        }
        return false;
      }
      async function checkpoint(paint = false) {
        const work = paint
          ? new Promise<void>((resolve) => {
              if (typeof window.requestAnimationFrame === "function") {
                const id = window.requestAnimationFrame(() => {
                  releaseWork = () => {};
                  resolve();
                });
                releaseWork = () => window.cancelAnimationFrame(id);
              } else {
                const id = window.setTimeout(() => {
                  releaseWork = () => {};
                  resolve();
                }, 0);
                releaseWork = () => window.clearTimeout(id);
              }
            })
          : Promise.resolve();
        await Promise.race([work, operation.cancelled]);
        releaseWork();
        releaseWork = () => {};
      }
      function valid() {
        if (operation.reason) return false;
        if (signal?.aborted) return invalidate("aborted");
        const latest = getSnapshot();
        if (disposed) return invalidate("disposed");
        if (latest.model !== context.model || latest.model.getState() !== state)
          return invalidate("model");
        if (
          latest.viewport !== root ||
          !root.isConnected ||
          !Object.is(latest.viewToken, context.viewToken)
        )
          return invalidate("view");
        if (latest.busy) return invalidate("busy");
        if (fonts?.status === "loading") return invalidate("fonts");
        if (signal?.aborted) return invalidate("aborted");
        return !operation.reason;
      }
      try {
        signal?.addEventListener("abort", aborted, { once: true });
        if (signal?.aborted) invalidate("aborted");
        // A microtask checkpoint lets same-event model/view changes cancel before measurement or writes.
        await checkpoint();
        if (!valid()) return frozenReport([], [], skipped, operation.reason);
        const samples: Sample[] = [],
          considered = new Set<string>();
        let characters = 0,
          inspected = 0;
        const candidates: {
          element: HTMLElement;
          owner: HTMLElement;
          kind: Sample["kind"];
          id: string;
        }[] = [];
        for (const element of nodes) {
          const owner = element.closest<HTMLElement>(
            '[data-column-id][role="gridcell"],[data-column-id][role="columnheader"],[data-og-size-column-id][role="columnheader"]',
          );
          const id = owner?.dataset.columnId ?? owner?.dataset.ogSizeColumnId,
            kind = element.dataset.ogSizeText;
          if (
            !owner ||
            !id ||
            !eligible.has(id) ||
            (kind !== "cell" && kind !== "header") ||
            (kind === "header" && options.includeHeader === false)
          )
            continue;
          if (
            Number(owner.getAttribute("aria-colspan") ?? 1) !== 1 ||
            owner.closest(
              '.og-group-row,.og-detail-row,[data-full-width="true"]',
            )
          )
            continue;
          considered.add(id);
          const text = element.textContent ?? "";
          characters += text.length;
          if (++inspected > MAX_SAMPLES || characters > MAX_CHARACTERS) {
            cancel("limits");
            return frozenReport([], [], skipped, operation.reason);
          }
          candidates.push({ element, owner, kind, id });
        }
        // Reject oversized commands before expensive computed-style/layout reads.
        for (const { element, owner, kind, id } of candidates) {
          const sample = sampleFrom(element, owner, kind, id);
          if (sample) samples.push(sample);
        }
        probe = document.createElement("span");
        probe.setAttribute("aria-hidden", "true");
        for (const [property, value] of Object.entries({
          position: "fixed",
          left: "-100000px",
          top: "-100000px",
          visibility: "hidden",
          display: "inline-block",
          padding: "0",
          border: "0",
          margin: "0",
          width: "max-content",
          "min-width": "0",
          "max-width": "none",
          "pointer-events": "none",
        }))
          probe.style.setProperty(property, value, "important");
        document.body.append(probe);
        const measuredById = new Map<
          string,
          { width: number; cellSamples: number; headerSamples: number }
        >();
        for (let index = 0; index < samples.length; index++) {
          if (operation.reason)
            return frozenReport([], [], skipped, operation.reason);
          if (index && index % 64 === 0) {
            await checkpoint(true);
            if (!valid())
              return frozenReport([], [], skipped, operation.reason);
          }
          const sample = samples[index],
            signature = JSON.stringify([
              sample.lang,
              sample.typography,
              sample.text,
            ]);
          let intrinsic = metrics.get(signature);
          if (intrinsic === undefined) {
            for (const [property, value] of sample.typography)
              probe.style.setProperty(property, value, "important");
            probe.lang = sample.lang;
            probe.textContent = sample.text;
            intrinsic = probe.getBoundingClientRect().width;
            if (!valid())
              return frozenReport([], [], skipped, operation.reason);
            if (!Number.isFinite(intrinsic) || intrinsic < 0) continue;
            cache(signature, intrinsic);
          } else {
            metrics.delete(signature);
            metrics.set(signature, intrinsic);
          }
          const entry = measuredById.get(sample.columnId) ?? {
            width: 0,
            cellSamples: 0,
            headerSamples: 0,
          };
          entry.width = Math.max(
            entry.width,
            Math.ceil(intrinsic + sample.extra + 1),
          );
          if (sample.kind === "cell") entry.cellSamples++;
          else entry.headerSamples++;
          measuredById.set(sample.columnId, entry);
        }
        await checkpoint();
        for (const sample of samples) {
          if (
            !sample.element.isConnected ||
            ownerGrid(sample.element) !== root
          ) {
            cancel("view");
            break;
          }
          const current = sampleFrom(
            sample.element,
            sample.owner,
            sample.kind,
            sample.columnId,
          );
          if (
            !current ||
            current.text !== sample.text ||
            current.lang !== sample.lang ||
            current.extra !== sample.extra ||
            JSON.stringify(current.typography) !==
              JSON.stringify(sample.typography)
          ) {
            cancel("view");
            break;
          }
        }
        if (!valid()) return frozenReport([], [], skipped, operation.reason);
        const measured: AutoSizeMeasurement[] = [],
          unchanged: AutoSizeMeasurement[] = [];
        const next = Object.create(null) as Record<string, number>;
        for (const id of Object.keys(state.columnWidths))
          Object.defineProperty(next, id, {
            value: state.columnWidths[id],
            enumerable: true,
            configurable: true,
            writable: true,
          });
        for (const id of eligible) {
          const sample = measuredById.get(id);
          if (!sample) {
            skipped.push({
              columnId: id,
              reason: considered.has(id) ? "not-measurable" : "unrendered",
            });
            continue;
          }
          const width = clampColumnWidth(columns.get(id)!, sample.width),
            overrideAdded = !Object.hasOwn(state.columnWidths, id);
          const entry = {
            columnId: id,
            width,
            previousWidth: context.widths[id],
            cellSamples: sample.cellSamples,
            headerSamples: sample.headerSamples,
            overrideAdded,
          };
          if (!overrideAdded && state.columnWidths[id] === width)
            unchanged.push(entry);
          else {
            measured.push(entry);
            Object.defineProperty(next, id, {
              value: width,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          }
        }
        if (!valid()) return frozenReport([], [], skipped, operation.reason);
        // Stop our subscription BEFORE the one authorized state publication.
        operation.dispose();
        if (active === operation) active = undefined;
        if (!valid()) return frozenReport([], [], skipped, operation.reason);
        if (measured.length) context.model.setState({ columnWidths: next });
        return frozenReport(measured, unchanged, skipped);
      } finally {
        operation.dispose();
        if (active === operation) active = undefined;
      }
    },
    cancel,
    dispose() {
      disposed = true;
      cancel("disposed");
      releaseFonts();
      watchedFonts = undefined;
      clearCache();
    },
  });
}
