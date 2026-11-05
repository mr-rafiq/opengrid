import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
  type ComponentType,
} from "react";
import type { createAg31ClientController } from "./ag31-client-controller.js";
export interface Ag31OverlayComponentOptions {
  components?: Readonly<Record<string, ComponentType<any>>>;
  loadingOverlayComponent?: ComponentType<any> | string;
  noRowsOverlayComponent?: ComponentType<any> | string;
  loadingOverlayComponentParams?: object | ((params: any) => object);
  noRowsOverlayComponentParams?: object | ((params: any) => object);
}
type Owner<T> = ReturnType<typeof createAg31ClientController<T>>;
function resolve(
  value: unknown,
  registry: Ag31OverlayComponentOptions["components"],
) {
  if (value == null) return undefined;
  const component = typeof value === "string" ? registry?.[value] : value;
  if (
    typeof component !== "function" &&
    (typeof component !== "object" || !component || !("$$typeof" in component))
  )
    throw new TypeError(
      "Source overlays require a React component or registered name",
    );
  return component as ComponentType<any>;
}
/** The overlay subscribes separately: showing it must not refresh resident cell values. */
export function Ag31SourceOverlay<T>({
  owner,
  host,
  config,
}: {
  owner: Owner<T>;
  host: RefObject<HTMLDivElement | null>;
  config: Ag31OverlayComponentOptions;
}) {
  const snapshot = useSyncExternalStore(
      owner.overlays.subscribe,
      owner.overlays.getSnapshot,
      owner.overlays.getSnapshot,
    ),
    kind = snapshot.kind;
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!kind) return;
    let cancelled = false;
    let detach = () => {};
    const initialise = () => {
      if (cancelled) return;
      const container = host.current,
        viewport = container?.querySelector<HTMLElement>(".og-viewport");
      if (!container || !viewport) return;
      const previousBusy = viewport.getAttribute("aria-busy");
      if (kind === "loading") viewport.setAttribute("aria-busy", "true");
      const reconcile = () => {
        const outer = container.getBoundingClientRect(),
          inner = viewport.getBoundingClientRect(),
          next = {
            left: inner.left - outer.left + container.scrollLeft,
            top: inner.top - outer.top + container.scrollTop,
            width: inner.width,
            height: inner.height,
          };
        setBox((old) =>
          old &&
          Object.keys(next).every(
            (key) =>
              Math.abs(
                old[key as keyof typeof old] - next[key as keyof typeof next],
              ) < 0.5,
          )
            ? old
            : next,
        );
      };
      reconcile();
      const observer =
        typeof ResizeObserver === "undefined"
          ? undefined
          : new ResizeObserver(reconcile);
      observer?.observe(container);
      observer?.observe(viewport);
      window.addEventListener("resize", reconcile);
      detach = () => {
        observer?.disconnect();
        window.removeEventListener("resize", reconcile);
        if (previousBusy == null) viewport.removeAttribute("aria-busy");
        else viewport.setAttribute("aria-busy", previousBusy);
      };
    };
    // Child layout effects precede attachment of the source host's parent ref.
    if (host.current) initialise();
    else queueMicrotask(initialise);
    return () => {
      cancelled = true;
      detach();
    };
  }, [kind, host, owner]);
  if (!kind || owner.api.isDestroyed()) return null;
  const Component = resolve(
      kind === "loading"
        ? config.loadingOverlayComponent
        : config.noRowsOverlayComponent,
      config.components,
    ),
    params = {
      api: owner.api,
      columnApi: owner.columnApi,
      context: owner.api.getGridOption("context"),
    },
    configured =
      kind === "loading"
        ? config.loadingOverlayComponentParams
        : config.noRowsOverlayComponentParams,
    extra = typeof configured === "function" ? configured(params) : configured;
  if (extra != null && (typeof extra !== "object" || Array.isArray(extra)))
    throw new TypeError("Source overlay component parameters require a record");
  const locale = owner.api.getGridOption("localeText") as
      Readonly<Record<string, string>> | undefined,
    message =
      kind === "loading"
        ? (locale?.loadingOoo ?? "Loading...")
        : (locale?.noRowsToShow ?? "No Rows To Show");
  return (
    <div
      className="og-source-overlay"
      data-og-source-overlay={kind}
      style={{
        position: "absolute",
        left: box?.left ?? 0,
        top: box?.top ?? 0,
        width: box?.width ?? "100%",
        height: box?.height ?? "100%",
        fontFamily: "var(--og-font-family, inherit)",
        fontSize: "var(--og-font-size, 14px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: kind === "loading" ? "auto" : "none",
        background:
          kind === "loading"
            ? "var(--ag-modal-overlay-background-color, color-mix(in srgb, var(--og-surface, #fff) 80%, transparent))"
            : "transparent",
      }}
    >
      {Component ? (
        <Component {...params} {...extra} />
      ) : (
        <div
          className="og-source-overlay-message"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </div>
  );
}
