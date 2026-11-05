import type {
  AutoSizeReport,
  DataGridSizingController,
} from "./column-sizing.js";

/** Mounted source sizing has the same ownership lifetime as the real native port. */
export function createAg31SizingServices(
  resolve: (key: unknown) => { getColId(): string } | null | undefined,
  all: () => readonly { getColId(): string }[],
) {
  let alive = true;
  let attachment: { read(): DataGridSizingController | null } | null = null;
  let activeRequest: AbortController | null = null;
  const cancel = () => {
    activeRequest?.abort();
    activeRequest = null;
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
      return port
        .autoSizeColumns([...ids], {
          contentMode: "rendered-dom",
          extraPadding: 20,
          includeHeader: !skipHeader,
          signal: request.signal,
        })
        .finally(() => {
          if (activeRequest === request) activeRequest = null;
        });
    } catch (error) {
      if (activeRequest === request) activeRequest = null;
      throw error;
    }
  }
  return Object.freeze({
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
