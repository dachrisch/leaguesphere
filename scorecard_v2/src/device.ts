/**
 * Stable device identity for the scorecard v2 app.
 *
 * One game belongs to one device (the server enforces the lock in Task 16).
 * The id therefore has to survive a reload, a reopened tab and an offline
 * session, and it must be cheap: no server round-trip, no dependency on the
 * Django user. `localStorage` is the right store — it is scoped to the browser
 * profile and outlives the session cookie.
 *
 * The id is generated lazily on first use. `crypto.randomUUID()` needs a secure
 * context (HTTPS or localhost); a field device on a plain-HTTP staging host or
 * an older WebView therefore falls back to a timestamp plus random suffix. The
 * fallback is not a cryptographic UUID — it only has to be unique per device.
 */

export const DEVICE_ID_STORAGE_KEY = "scorecard-v2-device-id";

function randomHex(length: number): string {
  let value = "";
  while (value.length < length) {
    value += Math.floor(Math.random() * 16).toString(16);
  }
  return value.slice(0, length);
}

/** UUID-shaped id for browsers without `crypto.randomUUID`. */
function fallbackId(): string {
  const stamp = Date.now().toString(16).padStart(8, "0").slice(-8);
  return [
    stamp,
    randomHex(4),
    `4${randomHex(3)}`,
    `a${randomHex(3)}`,
    randomHex(12),
  ].join("-");
}

function generateId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto !== undefined && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  return fallbackId();
}

function readStoredId(): string | null {
  try {
    return globalThis.localStorage?.getItem(DEVICE_ID_STORAGE_KEY) ?? null;
  } catch {
    // Storage can be disabled (private mode, blocked third-party context).
    return null;
  }
}

function storeId(id: string): void {
  try {
    globalThis.localStorage?.setItem(DEVICE_ID_STORAGE_KEY, id);
  } catch {
    // A device without writable storage still gets a usable id for this page.
  }
}

/**
 * The id of this browser. Creates and persists one on first call; every later
 * call returns the same value until the storage is cleared.
 */
export function getDeviceId(): string {
  const stored = readStoredId()?.trim();
  if (stored !== undefined && stored !== "") {
    return stored;
  }
  const id = generateId();
  storeId(id);
  return id;
}
