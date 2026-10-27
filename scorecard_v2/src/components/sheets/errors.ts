import { ApiError } from "../../api/client";

/**
 * A write that was deliberately **not** attempted — the guard that protects a
 * sheet tripped (no possession, game finished, another write in flight).
 *
 * Sheets treat a resolved `onSubmit` as "the server accepted it" and close
 * themselves. The guard therefore must throw instead of returning, otherwise a
 * double tap or a write against a stale team would close the sheet and look
 * like a recorded play. The message is the sheet's explanation.
 */
export class IgnoredWrite extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IgnoredWrite";
  }
}

/**
 * The message a sheet shows for a failed write: the guard's reason, the
 * server `detail`, or the caller's fallback.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof IgnoredWrite) {
    return error.message;
  }
  if (
    error instanceof ApiError &&
    typeof error.detail === "string" &&
    error.detail.trim() !== ""
  ) {
    return error.detail;
  }
  return fallback;
}
