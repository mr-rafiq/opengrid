import type {
  AutoSizeReport,
  DataGridSizingController,
  FitColumnsReport,
} from "./column-sizing.js";

/** Mounted source sizing has the same ownership lifetime as the real native port. */
export function createAg31SizingServices(
  resolve: (key: unknown) => { getColId(): string } | null | undefined,
  all: () => readonly { getColId(): string }[],
  excluded: () => readonly string[] = () => [],
) {
  let alive = true;
  let attachment: { read(): DataGridSizingController | null } | null = null;
  let activeRequest: AbortController | null = null;
  let activeCompletion: Promise<AutoSizeReport> | null = null;
  let commandIntent: object = {};
  const cancel = () => {
    commandIntent = {};
    activeRequest?.abort();
    activeRequest = null;
    activeCompletion = null;
  };
  const unavailable = (): AutoSizeReport =>
    Object.freeze({
      measured: Object.freeze([]),
      unchanged: Object.freeze([]),
      skipped: Object.freeze([]),
      cancelled: true,
      cancelReason: alive ? "view" : "disposed",
    });
  function autoSizeColumns(
    keys: readonly unknown[],
    skipHeader = false,
  ): Promise<AutoSizeReport> {
    if (!Array.isArray(keys))
      throw new TypeError("Source column keys require an array");
    if (keys.length > 4096)
      throw new RangeError("Source sizing accepts at most 4096 column keys");
    if (typeof skipHeader !== "boolean")
      throw new TypeError("skipHeader must be boolean");
    if (!alive) return Promise.resolve(unavailable());
    const ids = new Set<string>();
    for (let index = 0; index < keys.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(keys, String(index));
      if (!descriptor || !("value" in descriptor))
        throw new TypeError(
          "Source column keys cannot contain holes or accessors",
        );
      const column = resolve(descriptor.value);
      if (column) ids.add(column.getColId());
    }
    const port = attachment?.read();
    cancel();
    if (!port) return Promise.resolve(unavailable());
    const request = new AbortController();
    activeRequest = request;
    try {
      const completion = port
        .autoSizeColumns([...ids], {
          contentMode: "rendered-dom",
          extraPadding: 20,
          includeHeader: !skipHeader,
          signal: request.signal,
        })
        .finally(() => {
          if (activeRequest === request) {
            activeRequest = null;
            activeCompletion = null;
          }
        });
      activeCompletion = completion;
      return completion;
    } catch (error) {
      if (activeRequest === request) activeRequest = null;
      throw error;
    }
  }
  return Object.freeze({
    getRenderedWidth(id: string): number | undefined {
      return alive ? attachment?.read()?.getWidths()[id] : undefined;
    },
    sizeColumnsToFit(width?: number): Promise<FitColumnsReport> {
      if (
        width !== undefined &&
        (typeof width !== "number" ||
          !Number.isFinite(width) ||
          width < 0 ||
          width > Number.MAX_SAFE_INTEGER)
      )
        throw new RangeError(
          "Source fit width must be a finite nonnegative safe dimension",
        );
      const unavailableFit = (
        reason: "disposed" | "unavailable" | "stale" | "busy",
      ): FitColumnsReport =>
        Object.freeze({
          cancelled: true,
          cancelReason: reason,
          changedColumnIds: Object.freeze([]),
        });
      if (!alive) return Promise.resolve(unavailableFit("disposed"));
      if (width === 0) return Promise.resolve(unavailableFit("unavailable"));
      const excludeColumnIds = excluded(),
        owner = attachment,
        port = owner?.read();
      if (!port) return Promise.resolve(unavailableFit("unavailable"));
      const intent = {},
        pending = activeCompletion;
      commandIntent = intent;
      const fit = (report?: AutoSizeReport): FitColumnsReport => {
        if (!alive) return unavailableFit("disposed");
        if (
          commandIntent !== intent ||
          attachment !== owner ||
          owner?.read() !== port
        )
          return unavailableFit("stale");
        if (report?.cancelled)
          return unavailableFit(
            report.cancelReason === "busy" ? "busy" : "stale",
          );
        return port.sizeColumnsToFit({
          availableWidth: width,
          excludeColumnIds,
          roundToPixels: true,
          freezeExcluded: false,
          skipIfAlreadyFits: true,
        });
      };
      // Legacy callers issue these commands together without awaiting autosizing.
      // Preserve that sequence rather than aborting the pending content measurement.
      return pending ? pending.then(fit) : Promise.resolve(fit());
    },
    autoSizeColumns,
    autoSizeAllColumns(skipHeader = false) {
      return autoSizeColumns(
        alive ? all().map((column) => column.getColId()) : [],
        skipHeader,
      );
    },
    attach(read: () => DataGridSizingController | null) {
      if (!alive) return () => {};
      cancel();
      const next = { read };
      attachment = next;
      return () => {
        if (attachment === next) {
          attachment = null;
          cancel();
        }
      };
    },
    destroy() {
      alive = false;
      attachment = null;
      cancel();
    },
  });
}
