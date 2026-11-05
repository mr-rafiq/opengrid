import type { DataGridViewController } from "./grid-view.js";

export type Ag31MountedScrollPort = Pick<
  DataGridViewController,
  "isActive" | "scrollTo"
>;

/** A narrow source service adapter backed exclusively by the mounted native view. */
export function createAg31ViewServices() {
  let alive = true;
  let attachment: { read(): Ag31MountedScrollPort | null } | null = null;
  const current = () => {
    if (!alive) return null;
    const port = attachment?.read();
    return port?.isActive() ? port : null;
  };
  const bodyScrollFeature = Object.freeze({
    setScrollPosition(top: number, left: number) {
      const port = current();
      if (!port) return;
      if (
        !Number.isFinite(top) ||
        !Number.isFinite(left) ||
        top < 0 ||
        left < 0
      )
        throw new RangeError(
          "Source scroll restoration requires finite nonnegative pixel offsets",
        );
      if (!port.scrollTo({ top, left }))
        throw new Error(
          "The mounted source viewport could not restore scrolling",
        );
    },
  });
  const params = Object.freeze({
    gridBodyCtrl: Object.freeze({ bodyScrollFeature }),
  });
  const ctrlsService = Object.freeze({
    get params() {
      return current() ? params : undefined;
    },
  });
  return Object.freeze({
    ctrlsService,
    attach(read: () => Ag31MountedScrollPort | null) {
      if (!alive) return () => {};
      const next = { read };
      attachment = next;
      return () => {
        if (attachment === next) attachment = null;
      };
    },
    destroy() {
      alive = false;
      attachment = null;
    },
  });
}
