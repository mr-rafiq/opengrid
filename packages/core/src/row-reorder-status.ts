import type { RowReorderBlockReason, RowReorderStatus } from "./types.js";

const builtinStatuses = new WeakSet<object>();

/** Internal producer: keep origin out of the public status shape and serialization. */
export function createBuiltinRowReorderStatus(
  reason: RowReorderBlockReason,
  message: string,
): Extract<RowReorderStatus, { allowed: false }> {
  const status = Object.freeze({ allowed: false as const, reason, message });
  builtinStatuses.add(status);
  return status;
}

/**
 * Recognize only the exact immutable status emitted by a built-in client guard.
 * Application copies, wrappers, proxies and mocks retain their own message text.
 */
export function getBuiltinRowReorderReason(
  status: RowReorderStatus,
): RowReorderBlockReason | undefined {
  if (
    status === null ||
    typeof status !== "object" ||
    !builtinStatuses.has(status)
  )
    return;
  return status.allowed === false ? status.reason : undefined;
}
